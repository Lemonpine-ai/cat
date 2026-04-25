/**
 * cat-identity Tier 1 — 고양이 프로필 사진 Supabase Storage 업로드.
 *
 * 경로 규칙: cat-moments/{home_id}/profiles/{cat_id}_{timestamp}.{ext}
 * - profiles/ 서브폴더로 일반 snapshot (cat_logs) 과 분리.
 * - upsert: false — timestamp 로 충돌 없음, 덮어쓰기 방지.
 * - cacheControl: "3600" — 1시간 CDN 캐시.
 *
 * fix R4-1 보안 강화 (C1 / C6):
 *  1) MIME 검증 (기존)
 *  2) magic byte 검증 — 헤더 위조 차단 (detectImageMagic).
 *  3) EXIF 제거 — stripExifFromImage union 처리. 디코드 실패 = INVALID_FORMAT.
 *  4) Storage 업로드.
 *
 * fix R4-3 m17 — `skipStrip` 옵션: 호출자가 이미 strip 한 jpeg 를 넘기면
 *  중복 디코드 회피. 단 magic byte 검증은 항상 수행.
 *
 * fix R4-2 M4 — 사용자 노출 메시지는 항상 한국어 generic. raw stack trace 는
 *  logger.error 로만.
 */

"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { stripExifFromImage } from "./stripExifFromImage";
import { detectImageMagic } from "./detectImageMagic";
import { ALLOWED_MIME } from "./constants";
import { CAT_MESSAGES } from "./messages";
import { logger } from "@/lib/observability/logger";

/** 파일명 안전 문자만 허용 (영숫자/하이픈/언더스코어). 나머지는 _ 로 치환. */
function sanitizeForPath(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 50);
}

/** MIME → 확장자 매핑 (없으면 jpg 기본). */
function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return "jpg";
}

export type UploadResult =
  | { kind: "ok"; publicUrl: string; path: string }
  | {
      kind: "error";
      /**
       * fix R4-1 C1 / C6 — INVALID_FORMAT 추가:
       *  - magic byte 검증 실패 (헤더 위조 의심)
       *  - stripExifFromImage 의 union error (HEIC 등 디코드 실패)
       */
      code: "INVALID_MIME" | "INVALID_FORMAT" | "UPLOAD_FAILED" | "NO_PUBLIC_URL";
      message: string;
    };

/**
 * 프로필 사진 업로드 + publicUrl 반환.
 * - 호출자: useCatRegistration (INSERT 후 사진 업로드 단계)
 * - 실패 시 업로드 안 된 상태로 error 반환 — catId 는 이미 INSERT 됐으므로
 *   호출자는 "등록은 됐지만 사진은 저장 안 됐어요" 안내만 필요.
 *
 * @example
 *   const result = await uploadCatProfilePhoto({ supabase, homeId, catId, file });
 *   if (result.kind === "ok") {
 *     await supabase.from("cats").update({ photo_front_url: result.publicUrl }).eq("id", catId);
 *   }
 */
export async function uploadCatProfilePhoto(args: {
  supabase: SupabaseClient;
  homeId: string;
  catId: string;
  file: File;
  /** fix R4-3 m17 — 호출자가 이미 strip 했으면 true. magic byte 는 여전히 검증. */
  skipStrip?: boolean;
}): Promise<UploadResult> {
  const { supabase, homeId, catId, file, skipStrip = false } = args;

  // 1) MIME 1차 가드 (호환 — file.type 위조 가능, 다음 단계 magic 검증 필수).
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    logger.warn("uploadCatProfilePhoto.mime", "허용되지 않는 MIME 거부됨", {
      type: file.type,
    });
    return {
      kind: "error",
      code: "INVALID_MIME",
      message: CAT_MESSAGES.photoMimeInvalid,
    };
  }

  // 2) fix R4-1 C6 — magic byte 검증 (헤더 위조 차단).
  //    HEIC 입력은 magic = null 로 떨어진다 → 거부 정책 (사용자에게 JPG/PNG/WebP 안내).
  const magic = await detectImageMagic(file);
  if (magic === null) {
    logger.warn("uploadCatProfilePhoto.magic", "magic byte 미일치 — MIME 위조 또는 HEIC", {
      type: file.type,
      size: file.size,
    });
    return {
      kind: "error",
      code: "INVALID_FORMAT",
      message: CAT_MESSAGES.photoFormatUnsupported,
    };
  }

  // 3) fix R4-1 C1 — EXIF 제거 union 처리. 실패 시 원본 fallback 금지.
  let strippedFile: File;
  if (skipStrip) {
    // 호출자가 이미 strip 결과를 들고 있는 경우 (fix R4-3 m17 — 중복 디코드 회피).
    strippedFile = file;
  } else {
    const stripResult = await stripExifFromImage(file);
    if (stripResult.kind === "error") {
      logger.warn("uploadCatProfilePhoto.strip", "EXIF strip 실패", {
        reason: stripResult.reason,
        type: file.type,
      });
      return {
        kind: "error",
        code: "INVALID_FORMAT",
        message: CAT_MESSAGES.photoFormatUnsupported,
      };
    }
    strippedFile = stripResult.file;
  }

  // 4) Storage 경로 생성
  const timestamp = Date.now();
  const ext = extFromMime(strippedFile.type);
  const safeId = sanitizeForPath(catId);
  const path = `${homeId}/profiles/${safeId}_${timestamp}.${ext}`;

  // 5) 업로드
  const { error: uploadError } = await supabase.storage
    .from("cat-moments")
    .upload(path, strippedFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: strippedFile.type,
    });
  if (uploadError) {
    /* fix R4-2 M4 — raw 영어 메시지를 사용자에 노출하지 않는다.
     * raw 는 logger 로만, 사용자에게는 한국어 generic 메시지. */
    logger.error("uploadCatProfilePhoto.storage", uploadError, { path });
    return {
      kind: "error",
      code: "UPLOAD_FAILED",
      message: CAT_MESSAGES.photoUploadFailedGeneric,
    };
  }

  // 6) publicUrl 조회
  const { data: urlData } = supabase.storage
    .from("cat-moments")
    .getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    logger.warn("uploadCatProfilePhoto.publicUrl", "publicUrl 미반환", { path });
    return {
      kind: "error",
      code: "NO_PUBLIC_URL",
      message: CAT_MESSAGES.photoUploadFailedGeneric,
    };
  }

  return { kind: "ok", publicUrl, path };
}
