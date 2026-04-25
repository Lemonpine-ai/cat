/**
 * cat-identity Tier 1 — 고양이 프로필 사진 Supabase Storage 업로드.
 *
 * 경로 규칙: cat-moments/{home_id}/profiles/{cat_id}_{timestamp}.{ext}
 * - profiles/ 서브폴더로 일반 snapshot (cat_logs) 과 분리.
 * - upsert: false — timestamp 로 충돌 없음, 덮어쓰기 방지.
 * - cacheControl: "3600" — 1시간 CDN 캐시.
 */

"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { stripExifFromImage } from "./stripExifFromImage";
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
  | { kind: "error"; code: "INVALID_MIME" | "UPLOAD_FAILED" | "NO_PUBLIC_URL"; message: string };

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
}): Promise<UploadResult> {
  const { supabase, homeId, catId, file } = args;

  // 1) MIME 2차 가드
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    logger.warn("uploadCatProfilePhoto.mime", "허용되지 않는 MIME 거부됨", { type: file.type });
    return {
      kind: "error",
      code: "INVALID_MIME",
      message: CAT_MESSAGES.photoMimeInvalid,
    };
  }

  // 2) EXIF 제거 — GPS 좌표·기기 정보 leak 방지 (fix R1 #1 보안).
  //    HEIC 등 디코드 실패 시 stripExifFromImage 가 원본 fallback 반환.
  const stripped = await stripExifFromImage(file);

  // 3) Storage 경로 생성
  const timestamp = Date.now();
  const ext = extFromMime(stripped.type);
  const safeId = sanitizeForPath(catId);
  const path = `${homeId}/profiles/${safeId}_${timestamp}.${ext}`;

  // 4) 업로드
  const { error: uploadError } = await supabase.storage
    .from("cat-moments")
    .upload(path, stripped, {
      cacheControl: "3600",
      upsert: false,
      contentType: stripped.type,
    });
  if (uploadError) {
    logger.error("uploadCatProfilePhoto.storage", uploadError, { path });
    return {
      kind: "error",
      code: "UPLOAD_FAILED",
      message: `사진 업로드에 실패했어요. (${uploadError.message})`,
    };
  }

  // 5) publicUrl 조회
  const { data: urlData } = supabase.storage
    .from("cat-moments")
    .getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    return {
      kind: "error",
      code: "NO_PUBLIC_URL",
      message: "사진 업로드는 성공했지만 URL을 받지 못했어요.",
    };
  }

  return { kind: "ok", publicUrl, path };
}
