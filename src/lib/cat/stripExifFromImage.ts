/**
 * cat-identity Tier 1 fix R1 — 이미지 EXIF 메타데이터 제거.
 *
 * 사용자 사진의 GPS 좌표·촬영 기기 정보 leak 방지.
 * Canvas 재인코딩 (createImageBitmap → drawImage → toBlob jpeg) 으로
 * EXIF 를 통째로 떨어뜨린다. JPEG/PNG/WebP 모두 동일 경로.
 *
 * HEIC/HEIF: 브라우저가 디코드 못 하면 createImageBitmap 가 throw —
 * 이 경우 원본 그대로 반환 (폴백). HEIC strip 은 후속 PR.
 *
 * 호출 위치: uploadCatProfilePhoto.ts 업로드 직전 1회.
 */

"use client";

/** JPEG 재인코딩 품질 (0~1). 0.92 — 시각적 무손실 + 파일 크기 적정. */
const JPEG_QUALITY = 0.92;

/** 출력 MIME (JPEG 으로 통일 — strip 효과 일관성 + EXIF 영향 0). */
const OUTPUT_MIME = "image/jpeg";

/**
 * File → EXIF 제거된 새 File. 실패 시 원본 그대로 반환.
 *
 * @example
 *   const stripped = await stripExifFromImage(originalFile);
 *   await supabase.storage.from("...").upload(path, stripped);
 */
export async function stripExifFromImage(file: File): Promise<File> {
  // HEIC/HEIF — 브라우저 디코드 미지원 가능성 → 시도해 보고 실패하면 원본 fallback.
  // 일반 JPEG/PNG/WebP 는 모든 모던 브라우저가 createImageBitmap 지원.
  try {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;

    // 0 사이즈 가드 — 깨진 이미지면 원본 반환.
    if (width <= 0 || height <= 0) {
      bitmap.close?.();
      return file;
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
      return file;
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

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
      // toBlob 실패 — 원본 fallback.
      return file;
    }

    // 새 File 객체 — 확장자도 .jpg 로 통일 (서버 contentType 일관성).
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const safeName = baseName.length > 0 ? `${baseName}.jpg` : "photo.jpg";
    return new File([blob], safeName, { type: OUTPUT_MIME, lastModified: Date.now() });
  } catch {
    // 디코드 실패 (HEIC 등) — 원본 그대로 반환. 업로드 자체는 진행.
    return file;
  }
}
