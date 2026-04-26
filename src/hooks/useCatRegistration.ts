/**
 * cat-identity Tier 1 — 고양이 등록 통합 훅 (INSERT 책임 + 사진은 useCatPhotoUpload 위임).
 *
 * fix R5-2 R3-4 단순화 — 396줄 → ≤ 200줄: 사진 5 책임 (HSV/strip/upload/UPDATE/cleanup) 을
 * useCatPhotoUpload 로 분리. 본 훅은 INSERT + 23505 recheck + retryPhotoUpload 진입점만 담당.
 *
 * 설계 원칙 (B-1 Arch + R5-2): Try A (Orphan 방지) — INSERT 먼저, 사진 나중. 실패해도 row 남음.
 * 사진 실패 = error 상태 (catId 회수, R1 #3 / R3 R5-E1). HSV 실패 = 빈 프로파일 (내부 폴백).
 * RLS: sql/20260425b_cats_rls_policies.sql 4정책 (R1 #1 / R4-1 idempotent).
 *
 * R4-2 흐름: C2 submit try/catch (status 영구 lock 차단), M2 retryPhotoUpload,
 *   M3 alreadyExisted (토스트 분기), M4 error.message 는 한국어 generic (raw 는 logger).
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CatDraft } from "@/types/cat";
import { catDraftToInsertPayload } from "@/types/cat";
import { validateCatDraft } from "@/lib/cat/validateCatDraft";
import { useCatPhotoUpload } from "@/hooks/useCatPhotoUpload";
import { CAT_MESSAGES } from "@/lib/cat/messages";
import { logger } from "@/lib/observability/logger";

/** 등록 진행 상태 — R1 #4 단순화: 단일 union 으로 message 까지 묶음. */
export type RegistrationStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export type RegistrationState = RegistrationStatus["kind"];

export type RegistrationResult =
  | { kind: "ok"; catId: string; photoUploaded: boolean; alreadyExisted: boolean }
  | {
      kind: "error";
      code: "VALIDATION" | "DUPLICATE_NAME" | "INSERT_FAILED" | "UPLOAD_FAILED" | "TIMEOUT" | "UNKNOWN";
      message: string;
      /* R3 R5-E1 — UPLOAD_FAILED 시 catId 회수 → 호출자가 사진 재업로드 옵션 제공. */
      catId?: string;
    };

export type UseCatRegistrationArgs = {
  homeId: string;
  supabaseClient?: SupabaseClient;
};

export type UseCatRegistrationResult = {
  state: RegistrationState;
  errorMessage: string | null;
  submit: (draft: CatDraft) => Promise<RegistrationResult>;
  /** R4-2 M2 — UPLOAD_FAILED 후 사진만 재업로드. */
  retryPhotoUpload: (catId: string, file: File) => Promise<RegistrationResult>;
  reset: () => void;
};

/** Postgres UNIQUE violation code. */
const PG_UNIQUE_VIOLATION = "23505";

/** PostgREST timeout / 네트워크 timeout 분류 헬퍼 (R1 #3). */
function isTimeoutError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "PGRST301") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("timeout") || msg.includes("timed out");
}

type ErrorCode = Exclude<RegistrationResult, { kind: "ok" }>["code"];

export function useCatRegistration(
  args: UseCatRegistrationArgs,
): UseCatRegistrationResult {
  const { homeId, supabaseClient } = args;

  /* 렌더마다 새 클라이언트 생성 방지 (실시간 소켓 중복 금지) */
  const supabase = useMemo(
    () => supabaseClient ?? createSupabaseBrowserClient(), [supabaseClient]);

  /* R5-2 R3-4 — 사진 책임 위임 (HSV / strip / upload / UPDATE / cleanup). */
  const photo = useCatPhotoUpload({ supabase, homeId });

  /* R1 #4 — state + errorMessage 를 하나의 union 으로 통합. */
  const [status, setStatus] = useState<RegistrationStatus>({ kind: "idle" });
  const state = status.kind;
  const errorMessage = status.kind === "error" ? status.message : null;

  /* R3-2 — Status 전환 + 에러 결과 동시 생성 헬퍼 (set+return 2줄을 1줄로). */
  const transitionTo = useCallback((next: RegistrationStatus) => setStatus(next), []);

  const failWith = useCallback(
    (code: ErrorCode, message: string, extra?: { catId?: string }):
      Extract<RegistrationResult, { kind: "error" }> => {
      setStatus({ kind: "error", message });
      return { kind: "error", code, message, ...(extra?.catId ? { catId: extra.catId } : {}) };
    },
    [],
  );

  const reset = useCallback(() => transitionTo({ kind: "idle" }), [transitionTo]);

  /** R4-2 M2 — 사진 단독 재시도 (UPLOAD_FAILED 후 "다시 시도" 버튼 호출). */
  const retryPhotoUpload = useCallback(
    async (catId: string, file: File): Promise<RegistrationResult> => {
      try {
        transitionTo({ kind: "submitting" });
        const result = await photo.retryUpload(catId, file);
        if (result.kind === "error") {
          /* INVALID_FORMAT / UPLOAD_FAILED / UPDATE_FAILED 모두 화면에선 UPLOAD_FAILED. */
          return failWith("UPLOAD_FAILED", result.message, { catId });
        }
        transitionTo({ kind: "success" });
        return { kind: "ok", catId, photoUploaded: true, alreadyExisted: false };
      } catch (err) {
        /* R4-2 C2 — supabase throw 시 status 영구 lock 방지. */
        logger.error("useCatRegistration.retry.unexpected", err, { catId, homeId });
        return failWith("UNKNOWN", CAT_MESSAGES.unknownError, { catId });
      }
    },
    [homeId, photo, transitionTo, failWith],
  );

  const submit = useCallback(
    async (draft: CatDraft): Promise<RegistrationResult> => {
      try {
        /* 1) 클라이언트 validation */
        const errors = validateCatDraft(draft);
        if (errors.length > 0) {
          const msg = errors[0]?.message ?? CAT_MESSAGES.validationGeneric;
          return failWith("VALIDATION", msg);
        }

        transitionTo({ kind: "submitting" });

        /* 2) cats INSERT (photo_url=null) — Orphan 방지 위해 사진 전 먼저 INSERT */
        const insertPayload = catDraftToInsertPayload(draft, homeId, null);
        const { data: insertData, error: insertError } = await supabase
          .from("cats").insert(insertPayload).select("id").single();

        if (insertError || !insertData) {
          /* UNIQUE 위반 — 같은 home+name row 존재 확인 (race/새로고침) */
          if (insertError?.code === PG_UNIQUE_VIOLATION) {
            const { data: existing, error: lookupError } = await supabase
              .from("cats").select("id")
              .eq("home_id", homeId).eq("name", draft.name.trim())
              .limit(1).maybeSingle();
            /* R3 R5-E2 / R4-2 M4 — recheck 실패도 generic, raw 는 logger 만. */
            if (lookupError) {
              if (isTimeoutError(lookupError)) return failWith("TIMEOUT", CAT_MESSAGES.timeout);
              logger.error("useCatRegistration.recheck", lookupError, { homeId });
              return failWith("INSERT_FAILED", CAT_MESSAGES.insertFailedGeneric);
            }
            if (existing?.id) {
              /* R4-2 M3 — alreadyExisted=true → "이미 등록되어 있어요" 토스트 분기. */
              transitionTo({ kind: "success" });
              return {
                kind: "ok",
                catId: existing.id as string,
                photoUploaded: false,
                alreadyExisted: true,
              };
            }
            return failWith("DUPLICATE_NAME", CAT_MESSAGES.duplicateName);
          }
          if (isTimeoutError(insertError)) return failWith("TIMEOUT", CAT_MESSAGES.timeout);
          /* 그 외 INSERT 실패 — R4-2 M4 generic, raw 는 logger. */
          logger.error("useCatRegistration.insert", insertError, { homeId });
          return failWith("INSERT_FAILED", CAT_MESSAGES.insertFailedGeneric);
        }

        const catId = insertData.id as string;

        /* 3) 사진 없으면 바로 성공 반환 */
        if (!draft.photoFile) {
          transitionTo({ kind: "success" });
          return { kind: "ok", catId, photoUploaded: false, alreadyExisted: false };
        }

        /* 4) 사진 위임 → useCatPhotoUpload (strip+HSV+upload+UPDATE). */
        const photoResult = await photo.uploadAndExtract(catId, draft.photoFile);
        if (photoResult.kind === "error") {
          /* 사진 실패 — cats row 는 이미 INSERT 됐으므로 catId 회수 (R3 R5-E1, R4-2 M2). */
          return failWith("UPLOAD_FAILED", photoResult.message, { catId });
        }
        transitionTo({ kind: "success" });
        return { kind: "ok", catId, photoUploaded: true, alreadyExisted: false };
      } catch (err) {
        /* R4-2 C2 — supabase throw 시 status 영구 lock 차단. */
        logger.error("useCatRegistration.submit.unexpected", err, { homeId });
        return failWith("UNKNOWN", CAT_MESSAGES.unknownError);
      }
    },
    [homeId, supabase, photo, transitionTo, failWith],
  );

  return { state, errorMessage, submit, retryPhotoUpload, reset };
}
