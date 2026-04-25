/**
 * cat-identity Tier 1 — 고양이 등록 통합 훅.
 *
 * 책임:
 *  1) CatDraft validation (validateCatDraft)
 *  2) cats INSERT (photo_url=null) → catId 확보
 *  3) 사진 있으면: HSV 추출 + Storage 업로드 + UPDATE cats (photo + color_profile)
 *  4) 에러 분류: DUPLICATE_NAME / INSERT_FAILED / UPLOAD_FAILED / TIMEOUT / VALIDATION
 *
 * 설계 원칙 (B-1 Arch 결정):
 *  - Try A (Orphan 방지): INSERT 먼저, 업로드 나중. 실패해도 cats row 는 남음.
 *  - 사진 업로드 실패 = error 상태 (catId 는 유지, fix R1 #3 후 사용자 정확 인지).
 *  - HSV 추출 실패 = 조용히 빈 프로파일 (등록 자체 막지 않음).
 *  - RLS: sql/20260425b_cats_rls_policies.sql 4개 정책 (fix R1 #1).
 *
 * CLAUDE.md 준수:
 *  - useEffect 0개 (submit 함수 기반, 컴포넌트 effect 책임 아님)
 *  - useState 1개 (RegistrationStatus union — fix R1 #4 단순화)
 *  - 한국어 주석 필수
 *
 * @example
 *   const { state, errorMessage, submit, reset } = useCatRegistration({ homeId });
 *   const result = await submit(draft);
 *   if (result.kind === "ok") router.replace("/");
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CatDraft } from "@/types/cat";
import { catDraftToInsertPayload } from "@/types/cat";
import { validateCatDraft } from "@/lib/cat/validateCatDraft";
import { uploadCatProfilePhoto } from "@/lib/cat/uploadCatProfilePhoto";
import { extractHsvFromPhoto, emptyHsvProfile } from "@/lib/cat/extractHsvFromPhoto";
import { CAT_MESSAGES } from "@/lib/cat/messages";
import { logger } from "@/lib/observability/logger";

/**
 * 등록 진행 상태 — fix R1 #4 단순화: 단일 union 으로 message 까지 묶음.
 *  - idle: 진입 직후
 *  - submitting: INSERT/UPLOAD 진행 중
 *  - success: 등록 완료 (사진 포함 여부 무관)
 *  - error: 실패 (메시지 동봉)
 *
 * 외부 노출용 RegistrationState 는 .kind 만 추출 (기존 호환).
 */
export type RegistrationStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export type RegistrationState = RegistrationStatus["kind"];

export type RegistrationResult =
  | { kind: "ok"; catId: string; photoUploaded: boolean }
  | {
      kind: "error";
      code:
        | "VALIDATION"
        | "DUPLICATE_NAME"
        | "INSERT_FAILED"
        | "UPLOAD_FAILED"  // photo-only soft error — 호출자는 여전히 홈으로 이동 가능
        | "TIMEOUT"        // 네트워크 timeout — fix R1 #3 (PostgREST PGRST301 / message timeout)
        | "UNKNOWN";
      message: string;
    };

export type UseCatRegistrationArgs = {
  homeId: string;
  supabaseClient?: SupabaseClient;
};

export type UseCatRegistrationResult = {
  state: RegistrationState;
  errorMessage: string | null;
  submit: (draft: CatDraft) => Promise<RegistrationResult>;
  reset: () => void;
};

/**
 * Postgres UNIQUE violation code. cats_unique_name_per_home_idx 등 제약 위반 시 반환.
 */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * PostgREST timeout / 네트워크 timeout 분류 헬퍼 (fix R1 #3).
 * - PostgREST `PGRST301` 코드 = statement timeout
 * - message 에 "timeout" 포함 = fetch/connection timeout
 */
function isTimeoutError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "PGRST301") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("timeout") || msg.includes("timed out");
}

const TIMEOUT_MESSAGE = CAT_MESSAGES.timeout;

export function useCatRegistration(
  args: UseCatRegistrationArgs,
): UseCatRegistrationResult {
  const { homeId, supabaseClient } = args;

  /* 렌더마다 새 클라이언트 생성 방지 (실시간 소켓 중복 금지) */
  const supabase = useMemo(
    () => supabaseClient ?? createSupabaseBrowserClient(),
    [supabaseClient],
  );

  /* fix R1 #4 — state + errorMessage 를 하나의 union 으로 통합 (useState 2 → 1). */
  const [status, setStatus] = useState<RegistrationStatus>({ kind: "idle" });
  const state = status.kind;
  const errorMessage = status.kind === "error" ? status.message : null;

  const reset = useCallback(() => {
    setStatus({ kind: "idle" });
  }, []);

  const submit = useCallback(
    async (draft: CatDraft): Promise<RegistrationResult> => {
      /* 1) 클라이언트 validation */
      const errors = validateCatDraft(draft);
      if (errors.length > 0) {
        const msg = errors[0]?.message ?? "입력값을 확인해 주세요";
        setStatus({ kind: "error", message: msg });
        return { kind: "error", code: "VALIDATION", message: msg };
      }

      setStatus({ kind: "submitting" });

      /* 2) cats INSERT (photo_url=null) — Orphan 방지 위해 사진 전 먼저 INSERT */
      const insertPayload = catDraftToInsertPayload(draft, homeId, null);
      const { data: insertData, error: insertError } = await supabase
        .from("cats")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertError || !insertData) {
        // 1) UNIQUE 위반 — 본인 row 가 이미 있는지 (race / 새로고침) 한 번 더 확인.
        //    같은 home + name 으로 이미 등록된 row 가 있으면 본인 등록 → success 처리.
        //    없으면 (= 다른 home 에서 등록한 경우?) DUPLICATE_NAME 안내.
        if (insertError?.code === PG_UNIQUE_VIOLATION) {
          const { data: existing } = await supabase
            .from("cats")
            .select("id")
            .eq("home_id", homeId)
            .eq("name", draft.name.trim())
            .limit(1)
            .maybeSingle();
          if (existing?.id) {
            // 본인 home 의 동명 row — 사실상 등록 완료. 사진 업로드는 안 함 (일관성).
            // success 는 message 미동봉 — UI 는 별도 안내 (router.replace 직후 토스트).
            setStatus({ kind: "success" });
            return {
              kind: "ok",
              catId: existing.id as string,
              photoUploaded: false,
            };
          }
          // 그 외 — 정말 중복.
          const message = CAT_MESSAGES.duplicateName;
          setStatus({ kind: "error", message });
          return { kind: "error", code: "DUPLICATE_NAME", message };
        }

        // 2) 네트워크/DB timeout
        if (isTimeoutError(insertError)) {
          setStatus({ kind: "error", message: TIMEOUT_MESSAGE });
          return { kind: "error", code: "TIMEOUT", message: TIMEOUT_MESSAGE };
        }

        // 3) 그 외 INSERT 실패
        logger.error("useCatRegistration.insert", insertError, { homeId });
        const message = `등록에 실패했어요. ${insertError?.message ?? ""}`.trim();
        setStatus({ kind: "error", message });
        return { kind: "error", code: "INSERT_FAILED", message };
      }

      const catId = insertData.id as string;

      /* 3) 사진 없으면 바로 성공 반환 */
      if (!draft.photoFile) {
        setStatus({ kind: "success" });
        return { kind: "ok", catId, photoUploaded: false };
      }

      /* 4) 사진 있음 → HSV 추출 (실패해도 업로드는 시도)
       *    fix R1 #2: extractHsvFromPhoto 가 union 반환 — error 면 emptyProfile 폴백. */
      const hsvResult = await extractHsvFromPhoto(draft.photoFile);
      const colorProfile =
        hsvResult.kind === "ok" ? hsvResult.profile : emptyHsvProfile();

      /* 5) Storage 업로드 */
      const uploadResult = await uploadCatProfilePhoto({
        supabase,
        homeId,
        catId,
        file: draft.photoFile,
      });

      if (uploadResult.kind === "error") {
        /* 업로드 실패 — cats row 는 이미 INSERT 됐으나 사진 미반영.
         * fix R1 #3: 사용자가 정확히 인지하도록 error 상태로 (이전엔 success 였음).
         * UI 측에서 "사진은 못 올렸지만 등록은 됐어요" 안내 + 재업로드 옵션. */
        logger.warn("useCatRegistration.upload", uploadResult.message, { catId });
        setStatus({ kind: "error", message: uploadResult.message });
        return {
          kind: "error",
          code: "UPLOAD_FAILED",
          message: uploadResult.message,
        };
      }

      /* 6) UPDATE cats — photo_front_url + color_profile */
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("cats")
        .update({
          photo_front_url: uploadResult.publicUrl,
          color_profile: colorProfile,
          color_sample_count: colorProfile.sample_count,
          color_updated_at: now,
        })
        .eq("id", catId);

      if (updateError) {
        /* UPDATE 실패 — Storage 에는 올라갔으나 cats row 에 photo_front_url 미반영.
         * fix R1 #3: 사용자에게 정확히 안내 (error 상태). */
        logger.error("useCatRegistration.update", updateError, { catId });
        const message = `사진은 올렸지만 프로필에 반영하지 못했어요. (${updateError.message})`;
        setStatus({ kind: "error", message });
        return {
          kind: "error",
          code: "UPLOAD_FAILED",
          message,
        };
      }

      setStatus({ kind: "success" });
      return { kind: "ok", catId, photoUploaded: true };
    },
    [homeId, supabase],
  );

  return { state, errorMessage, submit, reset };
}
