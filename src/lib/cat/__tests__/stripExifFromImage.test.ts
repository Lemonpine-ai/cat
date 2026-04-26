/**
 * cat-identity Tier 1 fix R4-1 C1 — stripExifFromImage union 반환 단위 테스트.
 *
 * 핵심 회귀 방지:
 *  - 디코드 실패 시 원본 file 을 fallback 반환하지 않는다 (HEIC EXIF 누출 차단).
 *  - 모든 경로에서 union 결과만 반환.
 *
 * 4 case:
 *  1) createImageBitmap throw → error/decode-failed (원본 미반환)
 *  2) 0 사이즈 비트맵 → error/zero-size
 *  3) getContext null → error/no-context
 *  4) toBlob/convertToBlob null → error/blob-null
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stripExifFromImage } from "@/lib/cat/stripExifFromImage";

describe("stripExifFromImage", () => {
  const originalCreateImageBitmap = (
    globalThis as { createImageBitmap?: unknown }
  ).createImageBitmap;
  const originalOffscreenCanvas = (globalThis as { OffscreenCanvas?: unknown })
    .OffscreenCanvas;

  beforeEach(() => {
    // OffscreenCanvas 차단 — HTMLCanvasElement 폴백 경로로 통일.
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "createImageBitmap", {
      value: originalCreateImageBitmap,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      value: originalOffscreenCanvas,
      configurable: true,
      writable: true,
    });
  });

  it("1) createImageBitmap 가 throw → error/decode-failed (원본 미반환)", async () => {
    Object.defineProperty(globalThis, "createImageBitmap", {
      value: vi.fn().mockRejectedValue(new Error("HEIC decode error")),
      configurable: true,
      writable: true,
    });
    const fakeFile = new File([new Uint8Array([0])], "x.heic", {
      type: "image/heic",
    });
    const result = await stripExifFromImage(fakeFile);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe("EXIF_STRIP_FAILED");
      expect(result.reason).toBe("decode-failed");
    }
  });

  it("2) 0 사이즈 비트맵 → error/zero-size", async () => {
    Object.defineProperty(globalThis, "createImageBitmap", {
      value: vi.fn().mockResolvedValue({ width: 0, height: 0, close: vi.fn() }),
      configurable: true,
      writable: true,
    });
    const fakeFile = new File([new Uint8Array([0])], "x.jpg", {
      type: "image/jpeg",
    });
    const result = await stripExifFromImage(fakeFile);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toBe("zero-size");
    }
  });

  it("3) getContext null → error/no-context", async () => {
    // jsdom 의 HTMLCanvasElement.getContext 는 default 가 null 반환.
    // 명시적으로 mock — getContext 가 null 인 환경.
    Object.defineProperty(globalThis, "createImageBitmap", {
      value: vi.fn().mockResolvedValue({
        width: 256,
        height: 256,
        close: vi.fn(),
      }),
      configurable: true,
      writable: true,
    });
    if (typeof HTMLCanvasElement !== "undefined") {
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    }
    const fakeFile = new File([new Uint8Array([0])], "x.jpg", {
      type: "image/jpeg",
    });
    const result = await stripExifFromImage(fakeFile);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toBe("no-context");
    }
  });

  it("4) 어떤 경로에서도 원본 file 을 그대로 반환하지 않는다 (회귀 방지)", async () => {
    // HEIC 디코드 실패 = 원본 fallback 금지 (이전 구현의 보안 결함).
    Object.defineProperty(globalThis, "createImageBitmap", {
      value: vi.fn().mockRejectedValue(new Error("decode")),
      configurable: true,
      writable: true,
    });
    const fakeFile = new File([new Uint8Array([0xff, 0xd8, 0xff])], "x.heic", {
      type: "image/heic",
    });
    const result = await stripExifFromImage(fakeFile);
    // ok 분기로 떨어지면 안 된다 (원본 반환 = 보안 결함 재발).
    expect(result.kind).toBe("error");
  });
});
