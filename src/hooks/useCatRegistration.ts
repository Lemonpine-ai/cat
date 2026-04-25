/**
 * cat-identity Tier 1 — 고양이 등록 통합 훅.
 *
 * 책임:
 *  1) CatDraft validation (validateCatDraft)
 *  2) cats INSERT (photo_url=null) → catId 확보
 *  3) 사진 있으면: HSV 추출 + Storage 업로드 + UPDATE cats (photo + color_profile)
 *  4) 에러 분류: DUPLICATE_NAME / INSERT_FAILED / UPLOAD_FAILED / TIMEOUT / VALIDATION / UNKNOWN
 *
 * 설계 원칙 (B-1 Arch 결정):
 *  - Try A (Orphan 방지): INSERT 먼저, 업로드 나중. 실패해도 cats row 는 남음.
 *  - 사진 업로드 실패 = error 상태 (catId 는 유지, fix R1 #3 후 사용자 정확 인지).
 *  - HSV 추출 실패 = 조용히 빈 프로파일 (등록 자체 막지 않음).
 *  - RLS: sql/20260425b_cats_rls_policies.sql 4개 정책 (fix R1 #1, R4-1 idempotent).
 *
 * fix R4-2 사용자 흐름 (C2/C3/M2/M3/M4):
 *  - C2: submit 전체 try/catch 로 supabase throw 시 status 영구 lock 방지.
 *  - M2: retryPhotoUpload 메서드 추가 — UPLOAD_FAILED 후 사용자가 재시도 가능.
 *  - M3: RegistrationResult.ok 에 alreadyExisted: boolean — recheck 매칭 시 환영 토스트 분기.
 *  - M4: error.message 는 항상 한국어 generic (raw stack trace 미노출, logger 만 raw).
 *  - C3 연계: UPDATE 실패 시 Storage orphan 정리 (best effort remove).
 *
 * CLAUDE.md 준수:
 *  - useEffect 0개 (submit 함수 기반, 컴포넌트 effect 책임 아님)
 *  - useState 1개 (RegistrationStatus union — fix R1 #4 단순화)
 *  - 한국어 주석 필수
 *
 * @example
 *   const { state, errorMessage, submit, retryPhotoUpload, reset } = useCatRegistration({ homeId });
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
import { stripExifFromImage } from "@/lib/cat/stripExifFromImage";
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
  | {
      kind: "ok";
      catId: string;
      photoUploaded: boolean;
      /** fix R4-2 M3 — 23505 recheck 매칭 시 true. 환영 토스트 vs "이미 등록" 토스트 분기. */
      alreadyExisted: boolean;
    }
  | {
      kind: "error";
      code:
        | "VALIDATION"
        | "DUPLICATE_NAME"
        | "INSERT_FAILED"
        | "UPLOAD_FAILED"
        | "TIMEOUT"
        | "UNKNOWN";
      message: string;
      /* fix R3 R5-E1 — UPLOAD_FAILED 시 catId 회수 (호출자가 사진 재업로드 옵션 제공 가능). */
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
  /** fix R4-2 M2 — UPLOAD_FAILED 후 사진만 재업로드. catId 는 유지된 row 의 ID. */
  retryPhotoUpload: (catId: string, file: File) => Promise<RegistrationResult>;
  reset: () => void;
};

/** Postgres UNIQUE violation code. cats_unique_name_per_home_idx 등 제약 위반 시 반환. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * PostgREST timeout / 네트워크 timeout 분류 헬퍼 (fix R1 #3).
 *  - PostgREST `PGRST301` 코드 = statement timeout
 *  - message 에 "timeout" 포함 = fetch/connection timeout
 */
function isTimeoutError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "PGRST301") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("timeout") || msg.includes("timed out");
}

const TIMEOUT_MESSAGE = CAT_MESSAGES.timeout;

/* RegistrationResult.error.code 타입 별칭 (R3-2 헬퍼에서 재사용). */
type ErrorCode = Exclude<RegistrationResult, { kind: "ok" }>["code"];

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

  /**
   * R3-2 fix — Status 전환 헬퍼.
   *  - transitionTo: 단순 상태 전환 (idle/submitting/success). setStatus 직접 호출보다 의도가 분명.
   *  - failWith: 에러 상태 + RegistrationResult.error 객체 동시 생성. 분기마다 set+return 두 줄을 한 줄로.
   * 효과: setStatus 호출 12회 → 4회 이하 (각 result 패턴이 헬퍼 안에서 처리).
   */
  const transitionTo = useCallback((next: RegistrationStatus) => {
    setStatus(next);
  }, []);

  const failWith = useCallback(
    (
      code: ErrorCode,
      message: string,
      extra?: { catId?: string },
    ): Extract<RegistrationResult, { kind: "error" }> => {
      setStatus({ kind: "error", message });
      /* fix R3 R5-E1 — UPLOAD_FAILED 처럼 catId 회수가 필요한 경우 extra.catId 동봉. */
      return { kind: "error", code, message, ...(extra?.catId ? { catId: extra.catId } : {}) };
    },
    [],
  );

  const reset = useCallback(() => {
    transitionTo({ kind: "idle" });
  }, [transitionTo]);

  /**
   * fix R4-2 C3 연계 — Storage orphan 정리 (best effort).
   *
   * UPDATE 실패 / retry 성공 후 구 path 가 남는 경우 Storage 비용 누적 방지.
   * remove 자체 실패는 무시 (logger.warn 만) — 호출자 흐름 깨지 않는다.
   */
  const cleanupStorageOrphan = useCallback(
    async (path: string): Promise<void> => {
      try {
        await supabase.storage.from("cat-moments").remove([path]);
      } catch (cleanupErr) {
        logger.warn(
          "useCatRegistration.cleanup",
          "Storage orphan remove 실패 (best effort)",
          { path, error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr) },
        );
      }
    },
    [supabase],
  );

  /**
   * fix R4-2 M2 — 사진 업로드 단독 재시도.
   *
   * UPLOAD_FAILED 후 사용자가 "다시 시도" 누르면 본 메서드 호출.
   *  1) HSV 추출 + EXIF strip (R4-3 m17 — 중복 디코드 회피, skipStrip=true 로 upload 에 전달).
   *  2) Storage 업로드.
   *  3) cats UPDATE.
   * 실패 시 catId 보존하고 다시 retry 가능.
   */
  const retryPhotoUpload = useCallback(
    async (catId: string, file: File): Promise<RegistrationResult> => {
      try {
        transitionTo({ kind: "submitting" });

        /* fix R4-1 C1 + R4-3 m17 — strip 먼저 (디코드 1회), 결과 file 을 HSV/Upload 에 공유. */
        const stripResult = await stripExifFromImage(file);
        if (stripResult.kind === "error") {
          logger.warn("useCatRegistration.retry.strip", "EXIF strip 실패", {
            reason: stripResult.reason,
          });
          return failWith("UPLOAD_FAILED", CAT_MESSAGES.photoFormatUnsupported, { catId });
        }
        const strippedFile = stripResult.file;

        const hsvResult = await extractHsvFromPhoto(strippedFile);
        const colorProfile =
          hsvResult.kind === "ok" ? hsvResult.profile : emptyHsvProfile();

        const uploadResult = await uploadCatProfilePhoto({
          supabase,
          homeId,
          catId,
          file: strippedFile,
          skipStrip: true,
        });
        if (uploadResult.kind === "error") {
          logger.warn("useCatRegistration.retry.upload", uploadResult.message, { catId });
          return failWith("UPLOAD_FAILED", uploadResult.message, { catId });
        }

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
          /* UPDATE 실패 → Storage 에 새 path 가 올라간 채로 남음 → orphan 정리. */
          await cleanupStorageOrphan(uploadResult.path);
          logger.error("useCatRegistration.retry.update", updateError, { catId });
          return failWith("UPLOAD_FAILED", CAT_MESSAGES.photoUpdateFailedGeneric, { catId });
        }

        transitionTo({ kind: "success" });
        return {
          kind: "ok",
          catId,
          photoUploaded: true,
          alreadyExisted: false,
        };
      } catch (err) {
        /* fix R4-2 C2 — supabase 등 throw 시 status 영구 lock 방지. */
        logger.error("useCatRegistration.retry.unexpected", err, { catId, homeId });
        return failWith("UNKNOWN", CAT_MESSAGES.unknownError, { catId });
      }
    },
    [homeId, supabase, transitionTo, failWith, cleanupStorageOrphan],
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
          .from("cats")
          .insert(insertPayload)
          .select("id")
          .single();

        if (insertError || !insertData) {
          // 1) UNIQUE 위반 — 본인 row 가 이미 있는지 (race / 새로고침) 한 번 더 확인.
          //    같은 home + name 으로 이미 등록된 row 가 있으면 본인 등록 → success 처리 (alreadyExisted: true).
          //    없으면 (= 다른 home 에서 등록한 경우?) DUPLICATE_NAME 안내.
          if (insertError?.code === PG_UNIQUE_VIOLATION) {
            const { data: existing, error: lookupError } = await supabase
              .from("cats")
              .select("id")
              .eq("home_id", homeId)
              .eq("name", draft.name.trim())
              .limit(1)
              .maybeSingle();
            /* fix R3 R5-E2 — 23505 recheck SELECT 자체가 실패할 수 있음 (timeout / RLS 등).
             * fix R4-2 M4 — 사용자 메시지는 generic, raw 는 logger 로만. */
            if (lookupError) {
              if (isTimeoutError(lookupError)) return failWith("TIMEOUT", CAT_MESSAGES.timeout);
              logger.error("useCatRegistration.recheck", lookupError, { homeId });
              return failWith("INSERT_FAILED", CAT_MESSAGES.insertFailedGeneric);
            }
            if (existing?.id) {
              /* fix R4-2 M3 — alreadyExisted: true → 화면이 "이미 등록되어 있어요" 토스트 분기. */
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

          // 2) 네트워크/DB timeout
          if (isTimeoutError(insertError)) {
            return failWith("TIMEOUT", TIMEOUT_MESSAGE);
          }

          // 3) 그 외 INSERT 실패 — fix R4-2 M4 — generic 한국어, raw 는 logger.
          logger.error("useCatRegistration.insert", insertError, { homeId });
          return failWith("INSERT_FAILED", CAT_MESSAGES.insertFailedGeneric);
        }

        const catId = insertData.id as string;

        /* 3) 사진 없으면 바로 성공 반환 */
        if (!draft.photoFile) {
          transitionTo({ kind: "success" });
          return { kind: "ok", catId, photoUploaded: false, alreadyExisted: false };
        }

        /* 4) 사진 있음 → R4-1 C1 + R4-3 m17: strip 먼저 (디코드 1회), 결과 jpeg 를 HSV/Upload 에 공유.
         *    strip 실패 = INVALID_FORMAT — 사용자에게 "JPG/PNG/WebP 로 다시 시도" 안내. */
        const stripResult = await stripExifFromImage(draft.photoFile);
        if (stripResult.kind === "error") {
          logger.warn("useCatRegistration.strip", "EXIF strip 실패", {
            reason: stripResult.reason,
          });
          return failWith("UPLOAD_FAILED", CAT_MESSAGES.photoFormatUnsupported, { catId });
        }
        const strippedFile = stripResult.file;

        /* 5) HSV 추출 (실패해도 업로드는 시도)
         *    fix R1 #2: extractHsvFromPhoto 가 union 반환 — error 면 emptyProfile 폴백. */
        const hsvResult = await extractHsvFromPhoto(strippedFile);
        const colorProfile =
          hsvResult.kind === "ok" ? hsvResult.profile : emptyHsvProfile();

        /* 6) Storage 업로드 (skipStrip=true — 디코드 중복 회피, R4-3 m17). */
        const uploadResult = await uploadCatProfilePhoto({
          supabase,
          homeId,
          catId,
          file: strippedFile,
          skipStrip: true,
        });

        if (uploadResult.kind === "error") {
          /* 업로드 실패 — cats row 는 이미 INSERT 됐으나 사진 미반영.
           * fix R1 #3: 사용자가 정확히 인지하도록 error 상태로 (이전엔 success 였음).
           * fix R3 R5-E1: catId 회수 → 호출자가 사진 재업로드 옵션 제공 가능 (R4-2 M2). */
          logger.warn("useCatRegistration.upload", uploadResult.message, { catId });
          return failWith("UPLOAD_FAILED", uploadResult.message, { catId });
        }

        /* 7) UPDATE cats — photo_front_url + color_profile */
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
          /* fix R4-2 C3 연계 — Storage 에는 사진이 올라간 상태로 남음. orphan 정리.
           * fix R4-2 M4 — 사용자 메시지는 generic, raw 는 logger. */
          await cleanupStorageOrphan(uploadResult.path);
          logger.error("useCatRegistration.update", updateError, { catId });
          return failWith("UPLOAD_FAILED", CAT_MESSAGES.photoUpdateFailedGeneric, { catId });
        }

        transitionTo({ kind: "success" });
        return { kind: "ok", catId, photoUploaded: true, alreadyExisted: false };
      } catch (err) {
        /* fix R4-2 C2 — submit 전체를 try/catch 로 감싸 supabase 등 throw 시
         * status 가 "submitting" 영구 유지되는 lock 차단. error 상태로 풀어서 사용자가 재시도 가능. */
        logger.error("useCatRegistration.submit.unexpected", err, { homeId });
        return failWith("UNKNOWN", CAT_MESSAGES.unknownError);
      }
    },
    [homeId, supabase, transitionTo, failWith, cleanupStorageOrphan],
  );

  return { state, errorMessage, submit, retryPhotoUpload, reset };
}
