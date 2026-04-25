/**
 * cat-identity Tier 1 — 고양이 등록 통합 훅.
 *
 * 책임:
 *  1) CatDraft validation (validateCatDraft)
 *  2) cats INSERT (photo_url=null) → catId 확보
 *  3) 사진 있으면: HSV 추출 + Storage 업로드 + UPDATE cats (photo + color_profile)
 *  4) 에러 분류: DUPLICATE_NAME / INSERT_FAILED / UPLOAD_FAILED / VALIDATION
 *
 * 설계 원칙 (B-1 Arch 결정):
 *  - Try A (Orphan 방지): INSERT 먼저, 업로드 나중. 실패해도 cats row 는 남음.
 *  - 사진 업로드 실패 = soft error (catId 는 유지, photoUploaded=false 로 성공 반환).
 *  - HSV 추출 실패 = 조용히 빈 프로파일 (등록 자체 막지 않음).
 *  - RLS: homes.owner_id = auth.uid() 이미 cats 테이블에 정책 적용됨 (별도 조치 불필요).
 *
 * CLAUDE.md 준수:
 *  - useEffect 0개 (submit 함수 기반, 컴포넌트 effect 책임 아님)
 *  - useState 2개 (state, errorMessage) — 한도 8 내
 *  - 한국어 주석 필수
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CatDraft } from "@/types/cat";
import { catDraftToInsertPayload } from "@/types/cat";
import { validateCatDraft } from "@/lib/cat/validateCatDraft";
import { uploadCatProfilePhoto } from "@/lib/cat/uploadCatProfilePhoto";
import { extractHsvFromPhoto } from "@/lib/cat/extractHsvFromPhoto";

export type RegistrationState = "idle" | "submitting" | "success" | "error";

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

const TIMEOUT_MESSAGE = "네트워크가 불안정해요. 잠시 후 다시 시도해 주세요.";

export function useCatRegistration(
  args: UseCatRegistrationArgs,
): UseCatRegistrationResult {
  const { homeId, supabaseClient } = args;

  /* 렌더마다 새 클라이언트 생성 방지 (실시간 소켓 중복 금지) */
  const supabase = useMemo(
    () => supabaseClient ?? createSupabaseBrowserClient(),
    [supabaseClient],
  );

  const [state, setState] = useState<RegistrationState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reset = useCallback(() => {
    setState("idle");
    setErrorMessage(null);
  }, []);

  const submit = useCallback(
    async (draft: CatDraft): Promise<RegistrationResult> => {
      /* 1) 클라이언트 validation */
      const errors = validateCatDraft(draft);
      if (errors.length > 0) {
        const msg = errors[0]?.message ?? "입력값을 확인해 주세요";
        setState("error");
        setErrorMessage(msg);
        return { kind: "error", code: "VALIDATION", message: msg };
      }

      setState("submitting");
      setErrorMessage(null);

      /* 2) cats INSERT (photo_url=null) — Orphan 방지 위해 사진 전 먼저 INSERT */
      const insertPayload = catDraftToInsertPayload(draft, homeId, null);
      const { data: insertData, error: insertError } = await supabase
        .from("cats")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertError || !insertData) {
        // 1) 이름 중복 (UNIQUE 위반)
        // 2) 네트워크/DB timeout
        // 3) 그 외 INSERT 실패
        let code: "DUPLICATE_NAME" | "INSERT_FAILED" | "TIMEOUT";
        let message: string;
        if (insertError?.code === PG_UNIQUE_VIOLATION) {
          code = "DUPLICATE_NAME";
          message = "이미 같은 이름의 고양이가 등록되어 있어요";
        } else if (isTimeoutError(insertError)) {
          code = "TIMEOUT";
          message = TIMEOUT_MESSAGE;
        } else {
          code = "INSERT_FAILED";
          message = `등록에 실패했어요. ${insertError?.message ?? ""}`.trim();
        }
        setState("error");
        setErrorMessage(message);
        return { kind: "error", code, message };
      }

      const catId = insertData.id as string;

      /* 3) 사진 없으면 바로 성공 반환 */
      if (!draft.photoFile) {
        setState("success");
        return { kind: "ok", catId, photoUploaded: false };
      }

      /* 4) 사진 있음 → HSV 추출 (실패해도 업로드는 시도) */
      const colorProfile = await extractHsvFromPhoto(draft.photoFile);

      /* 5) Storage 업로드 */
      const uploadResult = await uploadCatProfilePhoto({
        supabase,
        homeId,
        catId,
        file: draft.photoFile,
      });

      if (uploadResult.kind === "error") {
        /* 업로드 실패 — cats row 는 이미 INSERT 됐으므로 catId 유지하고 soft error */
        setState("success"); // 등록 자체는 성공
        setErrorMessage(uploadResult.message);
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
        /* UPDATE 실패도 soft error — Storage 에는 이미 올라갔고 cats row 도 있음 */
        setState("success");
        setErrorMessage(
          `사진은 올렸지만 프로필에 반영하지 못했어요. (${updateError.message})`,
        );
        return {
          kind: "error",
          code: "UPLOAD_FAILED",
          message: updateError.message,
        };
      }

      setState("success");
      return { kind: "ok", catId, photoUploaded: true };
    },
    [homeId, supabase],
  );

  return { state, errorMessage, submit, reset };
}
