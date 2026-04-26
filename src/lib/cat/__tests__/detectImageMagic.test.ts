/**
 * cat-identity Tier 1 fix R4-1 C6 — detectImageMagic 단위 테스트.
 *
 * 매직 바이트 검증으로 MIME 위조 차단. 6 case:
 *  1) JPEG (FF D8 FF) → "jpeg"
 *  2) PNG (89 50 4E 47 0D 0A 1A 0A) → "png"
 *  3) WebP (RIFF + WEBP) → "webp"
 *  4) HEIC magic → null (지원 안 함)
 *  5) 빈 파일 → null
 *  6) 8 byte 미만 → null
 */

import { describe, it, expect } from "vitest";
import { detectImageMagic } from "@/lib/cat/detectImageMagic";

/** Uint8Array 를 File 로 감싸는 헬퍼 (테스트 전용). */
function makeFile(bytes: number[], type = "application/octet-stream"): File {
  return new File([new Uint8Array(bytes)], "x", { type });
}

describe("detectImageMagic", () => {
  it("1) JPEG magic (FF D8 FF) → jpeg", async () => {
    // 12 byte 패딩 (JPEG 이후 SOI/JFIF 등 시그니처)
    const file = makeFile([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    expect(await detectImageMagic(file)).toBe("jpeg");
  });

  it("2) PNG magic (89 50 4E 47 0D 0A 1A 0A) → png", async () => {
    const file = makeFile([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    expect(await detectImageMagic(file)).toBe("png");
  });

  it("3) WebP magic (RIFF + WEBP) → webp", async () => {
    // 0..3 = "RIFF", 4..7 = size (any), 8..11 = "WEBP"
    const file = makeFile([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(await detectImageMagic(file)).toBe("webp");
  });

  it("4) HEIC magic 비슷한 헤더 → null (거부)", async () => {
    // HEIC: 00 00 00 24 66 74 79 70 68 65 69 63 (ftyp...heic)
    const file = makeFile([
      0x00, 0x00, 0x00, 0x24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
    ]);
    expect(await detectImageMagic(file)).toBeNull();
  });

  it("5) 빈 파일 → null", async () => {
    const file = makeFile([]);
    expect(await detectImageMagic(file)).toBeNull();
  });

  it("6) 8 byte 미만 → null", async () => {
    const file = makeFile([0xff, 0xd8, 0xff]); // JPEG 앞 3 byte 만, 8 byte 미만
    expect(await detectImageMagic(file)).toBeNull();
  });

  it("7) 알 수 없는 magic (GIF) → null", async () => {
    // GIF: 47 49 46 38 37 61 (GIF87a) — 본 함수 미지원
    const file = makeFile([
      0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x10, 0x00, 0x10, 0x00, 0x00, 0x00,
    ]);
    expect(await detectImageMagic(file)).toBeNull();
  });
});
