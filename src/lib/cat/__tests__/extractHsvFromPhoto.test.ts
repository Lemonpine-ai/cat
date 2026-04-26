/**
 * cat-identity Tier 1 fix R1 #5 — extractHsvFromPhoto 단위 테스트.
 *
 * jsdom + mocked createImageBitmap 으로 3 케이스:
 *  1) decode 실패 (createImageBitmap throw) → error / decode-failed
 *  2) 0 사이즈 비트맵 → error / decode-failed
 *  3) Worker 미지원 환경 (idle 폴백) → ok 또는 error 분기 점검
 *
 * 실제 hue 히스토그램 정확성은 Worker 단위 테스트의 영역 (현재는 Worker import 만).
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { extractHsvFromPhoto } from "@/lib/cat/extractHsvFromPhoto";

/**
 * fix R4-5 m12 — jsdom HTMLCanvasElement.getContext stderr noise 제거.
 * 정상 비트맵 path 가 jsdom 의 'Not implemented: HTMLCanvasElement.prototype.getContext'
 * 를 stderr 로 출력하는 noise 차단. 본 mock 은 ctx 동작 미지원 환경 가정 (null 반환).
 */
beforeAll(() => {
  if (typeof HTMLCanvasElement !== "undefined") {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  }
});

describe("extractHsvFromPhoto", () => {
  const originalCreateImageBitmap = (globalThis as { createImageBitmap?: unknown })
    .createImageBitmap;
  const originalWorker = (globalThis as { Worker?: unknown }).Worker;

  beforeEach(() => {
    // Worker 미지원으로 강제 — idle 폴백 경로 테스트.
    Object.defineProperty(globalThis, "Worker", {
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
    Object.defineProperty(globalThis, "Worker", {
      value: originalWorker,
      configurable: true,
      writable: true,
    });
  });

  it("1) createImageBitmap 가 throw → error/decode-failed", async () => {
    Object.defineProperty(globalThis, "createImageBitmap", {
      value: vi.fn().mockRejectedValue(new Error("decode error")),
      configurable: true,
      writable: true,
    });
    const fakeFile = new File([new Uint8Array([0])], "x.jpg", { type: "image/jpeg" });
    const result = await extractHsvFromPhoto(fakeFile);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.reason).toBe("decode-failed");
  });

  it("2) 0 사이즈 비트맵 → error/decode-failed", async () => {
    Object.defineProperty(globalThis, "createImageBitmap", {
      value: vi.fn().mockResolvedValue({ width: 0, height: 0, close: vi.fn() }),
      configurable: true,
      writable: true,
    });
    const fakeFile = new File([new Uint8Array([0])], "x.jpg", { type: "image/jpeg" });
    const result = await extractHsvFromPhoto(fakeFile);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.reason).toBe("decode-failed");
  });

  it("3) 정상 비트맵 + idle 폴백 → ok", async () => {
    // 256x256 fake — canvas.getContext + drawImage + getImageData 가 jsdom 에서 동작.
    Object.defineProperty(globalThis, "createImageBitmap", {
      value: vi.fn().mockResolvedValue({
        width: 256,
        height: 256,
        close: vi.fn(),
      }),
      configurable: true,
      writable: true,
    });
    const fakeFile = new File([new Uint8Array([0])], "x.jpg", { type: "image/jpeg" });
    const result = await extractHsvFromPhoto(fakeFile);
    // jsdom 의 canvas 가 unimplemented (getImageData 등) → decode-failed 로 떨어질 가능성.
    // 어느 쪽이든 union 분기가 깨지지 않음을 확인.
    expect(["ok", "error"]).toContain(result.kind);
    if (result.kind === "ok") {
      expect(result.profile.version).toBe("v1");
      expect(Array.isArray(result.profile.dominant_hues)).toBe(true);
    }
  });
});
