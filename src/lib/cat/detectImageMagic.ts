/**
 * cat-identity Tier 1 fix R4-1 C6 — 파일 magic byte 검증.
 *
 * 배경:
 *  - file.type (MIME) 만 검증하면 attacker 가 헤더만 image/jpeg 로 위조 후
 *    임의 binary (예: 악성 스크립트) 를 Storage 에 올릴 수 있다.
 *  - 파일의 실제 첫 12 byte 를 읽어 known magic 과 비교 → 위조 차단.
 *
 * 지원 magic:
 *  - JPEG: FF D8 FF
 *  - PNG: 89 50 4E 47 0D 0A 1A 0A
 *  - WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50 (RIFF....WEBP)
 *  - HEIC/HEIF 는 본 검증을 통과 못 한다 (별도 magic). 호출자가
 *    stripExifFromImage 의 union error 와 더해서 INVALID_FORMAT 으로 거부.
 *
 * 호출 위치: uploadCatProfilePhoto.ts 의 MIME 검증 직후 (단계 1 과 strip 사이).
 */

"use client";

/** 검증 결과: 알려진 magic 이면 종류 문자열, 아니면 null. */
export type ImageMagic = "jpeg" | "png" | "webp" | null;

/** 첫 12 byte 만 본다 (RIFF + WEBP 확인까지 필요). */
const HEADER_BYTES = 12;

/**
 * 파일 첫 12 byte 를 읽어 magic byte 비교.
 *
 * 빈 파일 / 8 byte 미만 / 알 수 없는 헤더 → null.
 * 읽기 실패 (브라우저 race / FileReader 예외) → null.
 *
 * @example
 *   const magic = await detectImageMagic(file);
 *   if (magic === null) return { code: "INVALID_FORMAT", ... };
 */
export async function detectImageMagic(file: File): Promise<ImageMagic> {
  // 8 byte 미만이면 어떤 magic 도 매칭 불가.
  if (!file || file.size < 8) return null;

  let bytes: Uint8Array;
  try {
    // 모던 브라우저: Blob.arrayBuffer() — 5MB 중 앞 12 byte 만 읽음.
    // jsdom 등 일부 환경은 arrayBuffer() 미지원 → FileReader 폴백.
    const head = file.slice(0, HEADER_BYTES);
    if (typeof (head as Blob).arrayBuffer === "function") {
      const buffer = await (head as Blob).arrayBuffer();
      bytes = new Uint8Array(buffer).slice(0, HEADER_BYTES);
    } else if (typeof FileReader !== "undefined") {
      // 폴백: FileReader 로 동일 12 byte 추출.
      const buffer = await new Promise<ArrayBuffer | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => resolve(null);
        reader.readAsArrayBuffer(head);
      });
      if (!buffer) return null;
      bytes = new Uint8Array(buffer).slice(0, HEADER_BYTES);
    } else {
      return null;
    }
  } catch {
    return null;
  }

  if (bytes.length < 8) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: 52 49 46 46 (RIFF) + offset 8 부터 57 45 42 50 (WEBP)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}
