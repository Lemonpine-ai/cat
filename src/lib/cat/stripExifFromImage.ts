/**
 * cat-identity Tier 1 fix R4-1 C1 — 이미지 EXIF 메타데이터 제거.
 *
 * 사용자 사진의 GPS 좌표·촬영 기기 정보 leak 방지.
 * Canvas 재인코딩 (createImageBitmap → drawImage → toBlob jpeg) 으로
 * EXIF 를 통째로 떨어뜨린다. JPEG/PNG/WebP 모두 동일 경로.
 *
 * fix R4-1 C1 — 이전 구현은 디코드 실패 시 원본 file 을 그대로 반환했다.
 * HEIC 처럼 브라우저가 디코드 못하는 케이스에서 EXIF 가 살아있는 원본이
 * Storage 로 흘러갈 수 있어서 GPS 누출 위험. 본 PR 부터는 union 반환으로
 * 호출자가 명시적으로 분기하도록 강제한다 (디코드 실패 = 거부).
 *
 * 호출 위치: uploadCatProfilePhoto.ts 업로드 직전 1회.
 */

"use client";

/** JPEG 재인코딩 품질 (0~1). 0.92 — 시각적 무손실 + 파일 크기 적정. */
const JPEG_QUALITY = 0.92;

/** 출력 MIME (JPEG 으로 통일 — strip 효과 일관성 + EXIF 영향 0). */
const OUTPUT_MIME = "image/jpeg";

/**
 * fix R4-1 C1 — strip 결과 union.
 *
 * - `kind: "ok"` → EXIF 가 제거된 새 jpeg File. 호출자는 이 파일만 다음 단계로 전달.
 * - `kind: "error"` → 디코드/캔버스/blob 변환 실패. **원본 파일은 어떤 경로에서도 반환하지 않는다.**
 *   호출자는 사용자에게 "JPG/PNG/WebP 로 다시 시도해 주세요" 안내.
 */
export type StripExifResult =
  | { kind: "ok"; file: File }
  | {
      kind: "error";
      code: "EXIF_STRIP_FAILED";
      reason:
        | "decode-failed"
        | "zero-size"
        | "no-context"
        | "blob-null"
        | "exception";
    };

/**
 * File → EXIF 제거된 새 File. 실패 시 union error (원본 fallback 금지).
 *
 * @example
 *   const result = await stripExifFromImage(originalFile);
 *   if (result.kind === "error") {
 *     return { code: "INVALID_FORMAT", message: CAT_MESSAGES.photoFormatUnsupported };
 *   }
 *   await supabase.storage.from("...").upload(path, result.file);
 */
export async function stripExifFromImage(file: File): Promise<StripExifResult> {
  // HEIC/HEIF — 브라우저 디코드 미지원 가능성 → 시도해 보고 실패하면 union error.
  // 일반 JPEG/PNG/WebP 는 모든 모던 브라우저가 createImageBitmap 지원.
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { kind: "error", code: "EXIF_STRIP_FAILED", reason: "decode-failed" };
  }

  try {
    const width = bitmap.width;
    const height = bitmap.height;

    // 0 사이즈 가드 — 깨진 이미지면 union error.
    if (width <= 0 || height <= 0) {
      bitmap.close?.();
      return { kind: "error", code: "EXIF_STRIP_FAILED", reason: "zero-size" };
    }

    // OffscreenCanvas 우선, 없으면 HTMLCanvasElement 폴백.
    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement("canvas"), {
            width,
            height,
          });
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) {
      bitmap.close?.();
      return { kind: "error", code: "EXIF_STRIP_FAILED", reason: "no-context" };
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    bitmap = null;

    // Canvas → Blob (JPEG 재인코딩 — EXIF 자동 제거).
    const blob: Blob | null =
      "convertToBlob" in canvas
        ? await canvas.convertToBlob({ type: OUTPUT_MIME, quality: JPEG_QUALITY })
        : await new Promise<Blob | null>((resolve) =>
            (canvas as HTMLCanvasElement).toBlob(
              resolve,
              OUTPUT_MIME,
              JPEG_QUALITY,
            ),
          );

    if (!blob) {
      // toBlob 실패 — union error (원본 fallback 금지).
      return { kind: "error", code: "EXIF_STRIP_FAILED", reason: "blob-null" };
    }

    // 새 File 객체 — 확장자도 .jpg 로 통일 (서버 contentType 일관성).
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const safeName = baseName.length > 0 ? `${baseName}.jpg` : "photo.jpg";
    const out = new File([blob], safeName, {
      type: OUTPUT_MIME,
      lastModified: Date.now(),
    });
    return { kind: "ok", file: out };
  } catch {
    // 그 외 예외 (drawImage / toBlob throw 등) — union error.
    if (bitmap) {
      try {
        bitmap.close?.();
      } catch {
        // bitmap close 실패는 무시 — 이미 본 함수가 error path.
      }
    }
    return { kind: "error", code: "EXIF_STRIP_FAILED", reason: "exception" };
  }
}
