/**
 * cat-identity Tier 1 fix R5-2 R3-4 — 고양이 프로필 사진 업로드 전용 훅.
 *
 * 기존 useCatRegistration 이 INSERT + 사진 (HSV / Storage / UPDATE) 5 책임을 모두 가져
 * 396줄로 비대해진 문제를 해결하기 위해 사진 책임만 본 훅으로 분리.
 *
 * 책임:
 *  1) extractHsvFromPhoto — HSV 색상 프로파일 추출 (실패해도 emptyHsvProfile 폴백).
 *  2) stripExifFromImage — EXIF 제거 (실패 시 INVALID_FORMAT).
 *  3) uploadCatProfilePhoto — Storage 업로드 (skipStrip=true, m17 중복 디코드 회피).
 *  4) cats UPDATE — photo_front_url + color_profile + sample_count + updated_at.
 *  5) cleanupStorageOrphan — UPDATE 실패 시 Storage 잔존 객체 best-effort remove.
 *
 * 노출 메서드:
 *  - uploadAndExtract: 최초 업로드 (HSV + strip + upload + UPDATE).
 *  - retryUpload: 사용자 "다시 시도하기" 버튼 — 동일 catId 로 새 path 업로드.
 *  - cleanupOrphan: orphan path 명시 정리.
 *
 * 설계 원칙 (Arch fix R5-2 §3.2.2.1):
 *  - useState 0 / useRef 0 / useCallback 3 — 순수 함수에 가까움 (내부 상태 없음).
 *  - hook 형태 유지 사유: 호출자 (useCatRegistration / useCatSubmitFlow) 측 useCallback
 *    memoization 일관성 + 후속 Sentry/metrics 주입 지점을 hook 경계로 안정화.
 */

"use client";

import { useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadCatProfilePhoto } from "@/lib/cat/uploadCatProfilePhoto";
import {
  extractHsvFromPhoto,
  emptyHsvProfile,
  type HsvColorProfile,
} from "@/lib/cat/extractHsvFromPhoto";
import { stripExifFromImage } from "@/lib/cat/stripExifFromImage";
import { CAT_MESSAGES } from "@/lib/cat/messages";
import { logger } from "@/lib/observability/logger";

/** 사진 업로드 단계 에러 코드 (useCatRegistration 의 RegistrationResult 와 호환). */
export type PhotoUploadErrorCode =
  | "INVALID_FORMAT"
  | "UPLOAD_FAILED"
  | "UPDATE_FAILED";

/** uploadAndExtract / retryUpload 공용 결과. */
export type PhotoUploadResult =
  | {
      kind: "ok";
      publicUrl: string;
      path: string;
      profile: HsvColorProfile;
    }
  | {
      kind: "error";
      code: PhotoUploadErrorCode;
      message: string;
    };

export type UseCatPhotoUploadArgs = {
  supabase: SupabaseClient;
  homeId: string;
};

export type UseCatPhotoUploadReturn = {
  uploadAndExtract: (catId: string, file: File) => Promise<PhotoUploadResult>;
  retryUpload: (catId: string, file: File) => Promise<PhotoUploadResult>;
  cleanupOrphan: (path: string) => Promise<void>;
};

/**
 * 공용 사진 처리 파이프라인 — uploadAndExtract / retryUpload 가 동일 흐름 공유.
 *
 *  1) EXIF strip (디코드 1회).
 *  2) HSV 추출 (실패 시 emptyHsvProfile 폴백 — 등록 자체 막지 않음).
 *  3) Storage 업로드 (skipStrip=true).
 *  4) cats UPDATE (photo_front_url / color_profile / sample_count / updated_at).
 *  5) UPDATE 실패 시 Storage orphan 정리.
 */
async function runPhotoPipeline(
  supabase: SupabaseClient,
  homeId: string,
  catId: string,
  file: File,
  cleanupOrphanFn: (path: string) => Promise<void>,
  scopePrefix: string,
): Promise<PhotoUploadResult> {
  /* 1) EXIF strip — 디코드 1회 (m17 중복 디코드 회피, skipStrip=true 로 upload 에 전달). */
  const stripResult = await stripExifFromImage(file);
  if (stripResult.kind === "error") {
    logger.warn(`${scopePrefix}.strip`, "EXIF strip 실패", {
      reason: stripResult.reason,
    });
    return {
      kind: "error",
      code: "INVALID_FORMAT",
      message: CAT_MESSAGES.photoFormatUnsupported,
    };
  }
  const strippedFile = stripResult.file;

  /* 2) HSV 추출 — 실패해도 emptyHsvProfile 폴백 (등록 자체 막지 않음). */
  const hsvResult = await extractHsvFromPhoto(strippedFile);
  const profile = hsvResult.kind === "ok" ? hsvResult.profile : emptyHsvProfile();

  /* 3) Storage 업로드 — skipStrip=true (디코드 중복 회피). */
  const uploadResult = await uploadCatProfilePhoto({
    supabase,
    homeId,
    catId,
    file: strippedFile,
    skipStrip: true,
  });
  if (uploadResult.kind === "error") {
    logger.warn(`${scopePrefix}.upload`, uploadResult.message, { catId });
    return {
      kind: "error",
      code: "UPLOAD_FAILED",
      message: uploadResult.message,
    };
  }

  /* 4) cats UPDATE — photo + color_profile + sample_count + updated_at. */
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("cats")
    .update({
      photo_front_url: uploadResult.publicUrl,
      color_profile: profile,
      color_sample_count: profile.sample_count,
      color_updated_at: now,
    })
    .eq("id", catId);

  if (updateError) {
    /* 5) UPDATE 실패 → Storage 새 path 가 올라간 채 남음 → orphan 정리 (best effort). */
    await cleanupOrphanFn(uploadResult.path);
    logger.error(`${scopePrefix}.update`, updateError, { catId });
    return {
      kind: "error",
      code: "UPDATE_FAILED",
      message: CAT_MESSAGES.photoUpdateFailedGeneric,
    };
  }

  return {
    kind: "ok",
    publicUrl: uploadResult.publicUrl,
    path: uploadResult.path,
    profile,
  };
}

/**
 * 사진 업로드 훅 — useCatRegistration / useCatSubmitFlow 가 호출.
 *
 * 내부 상태 0 (useState/useRef 없음). 의도적으로 순수 함수에 가까움.
 */
export function useCatPhotoUpload(
  args: UseCatPhotoUploadArgs,
): UseCatPhotoUploadReturn {
  const { supabase, homeId } = args;

  /* fix R4-2 C3 연계 — Storage orphan 정리 (best effort, 호출자 흐름 깨지 않음). */
  const cleanupOrphan = useCallback(
    async (path: string): Promise<void> => {
      try {
        await supabase.storage.from("cat-moments").remove([path]);
      } catch (cleanupErr) {
        logger.warn(
          "useCatPhotoUpload.cleanup",
          "Storage orphan remove 실패 (best effort)",
          {
            path,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          },
        );
      }
    },
    [supabase],
  );

  /** 최초 업로드 — submit 흐름의 사진 파트 (cats INSERT 후 호출). */
  const uploadAndExtract = useCallback(
    (catId: string, file: File) =>
      runPhotoPipeline(
        supabase,
        homeId,
        catId,
        file,
        cleanupOrphan,
        "useCatPhotoUpload.upload",
      ),
    [supabase, homeId, cleanupOrphan],
  );

  /** 재시도 — UPLOAD_FAILED 후 사용자 "다시 시도" 버튼 (M2). */
  const retryUpload = useCallback(
    (catId: string, file: File) =>
      runPhotoPipeline(
        supabase,
        homeId,
        catId,
        file,
        cleanupOrphan,
        "useCatPhotoUpload.retry",
      ),
    [supabase, homeId, cleanupOrphan],
  );

  return { uploadAndExtract, retryUpload, cleanupOrphan };
}
