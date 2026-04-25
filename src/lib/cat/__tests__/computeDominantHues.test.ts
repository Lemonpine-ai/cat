/**
 * cat-identity Tier 1 fix R4-3 m15 — computeDominantHuesFromImageData 단위 테스트.
 *
 * 핵심 회귀 방지:
 *  - 무채색 (s < HSV_SAT_THRESHOLD) → 빈 배열.
 *  - 어두운 색 (v < HSV_VAL_THRESHOLD) → 빈 배열.
 *  - 단색 채도 → top1 hue 반환.
 *  - top3 정렬 안정성.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { computeDominantHuesFromImageData } from "@/lib/cat/computeDominantHues";

/**
 * jsdom 은 ImageData 클래스를 일부 환경에서 노출하지 않는다.
 * 본 함수는 data/width/height 만 쓰는 plain 객체로도 충분히 동작 — 폴리필.
 */
type ImageDataLike = { data: Uint8ClampedArray; width: number; height: number };

beforeAll(() => {
  if (typeof (globalThis as { ImageData?: unknown }).ImageData === "undefined") {
    class ImageDataPolyfill {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    }
    (globalThis as { ImageData?: unknown }).ImageData = ImageDataPolyfill;
  }
});

/** 16x16 ImageData 를 RGBA 단일 색으로 채운다. */
function makeImageData(r: number, g: number, b: number): ImageDataLike {
  const w = 16;
  const h = 16;
  const arr = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < arr.length; i += 4) {
    arr[i] = r;
    arr[i + 1] = g;
    arr[i + 2] = b;
    arr[i + 3] = 255;
  }
  return { data: arr, width: w, height: h };
}

/** 16x16 의 절반은 색A, 절반은 색B. */
function makeMixedImageData(
  rgbA: [number, number, number],
  rgbB: [number, number, number],
): ImageDataLike {
  const w = 16;
  const h = 16;
  const arr = new Uint8ClampedArray(w * h * 4);
  const half = (w * h) / 2;
  for (let i = 0; i < arr.length; i += 4) {
    const pix = i / 4;
    const [r, g, b] = pix < half ? rgbA : rgbB;
    arr[i] = r;
    arr[i + 1] = g;
    arr[i + 2] = b;
    arr[i + 3] = 255;
  }
  return { data: arr, width: w, height: h };
}

describe("computeDominantHuesFromImageData", () => {
  it("1) 빨간 단색 → 빨강 hue (0~20 빈)", () => {
    const data = makeImageData(255, 0, 0);
    const top3 = computeDominantHuesFromImageData(data as ImageData);
    expect(top3.length).toBeGreaterThan(0);
    expect(top3[0]).toBeLessThan(20); // hue 0~20 빈 = 빨강
  });

  it("2) 회색 단색 (s < 0.2) → 빈 배열", () => {
    const data = makeImageData(128, 128, 128);
    const top3 = computeDominantHuesFromImageData(data as ImageData);
    expect(top3).toEqual([]);
  });

  it("3) 검은색 (v < 0.15) → 빈 배열", () => {
    const data = makeImageData(20, 20, 20); // v ≈ 0.078
    const top3 = computeDominantHuesFromImageData(data as ImageData);
    expect(top3).toEqual([]);
  });

  it("4) 흰색 (s = 0) → 빈 배열", () => {
    const data = makeImageData(255, 255, 255);
    const top3 = computeDominantHuesFromImageData(data as ImageData);
    expect(top3).toEqual([]);
  });

  it("5) 빨강 50% + 파랑 50% → top 2 hue (빨강 + 파랑)", () => {
    const data = makeMixedImageData([255, 0, 0], [0, 0, 255]);
    const top3 = computeDominantHuesFromImageData(data as ImageData);
    expect(top3.length).toBeGreaterThanOrEqual(2);
    /* 파랑 hue = 240 인근 빈, 빨강 = 0~20 빈. 두 hue 모두 결과 안에 존재. */
    const hasRed = top3.some((h) => h < 30);
    const hasBlue = top3.some((h) => h > 200 && h < 260);
    expect(hasRed).toBe(true);
    expect(hasBlue).toBe(true);
  });

  it("6) 빈 ImageData (1x1 검은색 픽셀) → 빈 배열", () => {
    const arr = new Uint8ClampedArray([0, 0, 0, 0]);
    const data: ImageDataLike = { data: arr, width: 1, height: 1 };
    const top3 = computeDominantHuesFromImageData(data as ImageData);
    expect(top3).toEqual([]);
  });
});
