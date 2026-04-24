// ============================================================
// HSV K-means 추출기
// bbox 중앙 60% crop → 64x64 다운샘플 → RGB→HSV → H+S 2D K-means(k=2)
// 주색 군집(weight 큰 쪽) 반환
// ============================================================

import type { HsvSample } from "../types";

const CROP_INNER = 0.6; // 중앙 60% (배경/경계 제거)
const TARGET = 64;      // 다운샘플 크기
const K = 2;            // 군집 수
const MAX_ITER = 10;    // K-means 반복 횟수
const SEED = 42;        // 시드 고정

// ---------- RGB → HSV 변환 ----------
// H: 0~360, S: 0~1, V: 0~1
function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

// ---------- 원형 H 거리 ----------
function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ---------- 시드 고정 PRNG (mulberry32) ----------
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 비디오 프레임 bbox에서 주색(primary) HSV 통계 추출.
 * @returns [primary, secondary] — weight 기준 내림차순
 */
export function extractHsvKmeans(
  frame: HTMLVideoElement | ImageBitmap,
  bbox: { x: number; y: number; w: number; h: number },
): HsvSample[] | null {
  const fw = frame instanceof HTMLVideoElement ? frame.videoWidth : frame.width;
  const fh = frame instanceof HTMLVideoElement ? frame.videoHeight : frame.height;
  if (!fw || !fh) return null;

  // 중앙 60% bbox 축소
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const innerW = bbox.w * CROP_INNER;
  const innerH = bbox.h * CROP_INNER;
  const sx = Math.max(0, Math.floor((cx - innerW / 2) * fw));
  const sy = Math.max(0, Math.floor((cy - innerH / 2) * fh));
  const sw = Math.max(1, Math.floor(innerW * fw));
  const sh = Math.max(1, Math.floor(innerH * fh));

  // 다운샘플 캔버스
  const canvas = document.createElement("canvas");
  canvas.width = TARGET;
  canvas.height = TARGET;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, TARGET, TARGET);
    data = ctx.getImageData(0, 0, TARGET, TARGET).data;
  } catch {
    return null;
  }

  // HSV 리스트 구성 (채도 너무 낮은 픽셀 제외 — 회색/흰색/검정)
  const pts: Array<[number, number, number]> = []; // [h, s, v]
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, v] = rgb2hsv(data[i], data[i + 1], data[i + 2]);
    if (s < 0.1 || v < 0.1) continue;
    pts.push([h, s, v]);
  }
  if (pts.length < 20) {
    // 채도 낮은 고양이(흰/검) — 전체 픽셀로 fallback
    for (let i = 0; i < data.length; i += 4) {
      const [h, s, v] = rgb2hsv(data[i], data[i + 1], data[i + 2]);
      pts.push([h, s, v]);
    }
  }
  if (pts.length === 0) return null;

  // K-means 초기 centroid: 시드 기반 무작위 2점
  const rng = makeRng(SEED);
  const c: Array<[number, number]> = []; // [h, s]
  for (let k = 0; k < K; k++) {
    const idx = Math.floor(rng() * pts.length);
    c.push([pts[idx][0], pts[idx][1]]);
  }

  const assign = new Uint8Array(pts.length);
  for (let iter = 0; iter < MAX_ITER; iter++) {
    // 할당 단계
    for (let i = 0; i < pts.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < K; k++) {
        const dh = hueDist(pts[i][0], c[k][0]) / 180;
        const ds = pts[i][1] - c[k][1];
        const d = dh * dh + ds * ds;
        if (d < bestD) { bestD = d; best = k; }
      }
      assign[i] = best;
    }
    // 갱신 단계 (H는 원형 평균: sin/cos)
    for (let k = 0; k < K; k++) {
      let sumSin = 0, sumCos = 0, sumS = 0, n = 0;
      for (let i = 0; i < pts.length; i++) {
        if (assign[i] !== k) continue;
        const rad = (pts[i][0] * Math.PI) / 180;
        sumSin += Math.sin(rad);
        sumCos += Math.cos(rad);
        sumS += pts[i][1];
        n++;
      }
      if (n === 0) continue;
      const meanH = ((Math.atan2(sumSin / n, sumCos / n) * 180) / Math.PI + 360) % 360;
      c[k] = [meanH, sumS / n];
    }
  }

  // 각 군집의 통계 계산
  const out: HsvSample[] = [];
  for (let k = 0; k < K; k++) {
    // 원형 표준편차: 1 - R (R = 합벡터 크기 / n)
    let sumSin = 0, sumCos = 0, sumS = 0, sumV = 0, n = 0;
    const hList: number[] = [];
    const sList: number[] = [];
    const vList: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      if (assign[i] !== k) continue;
      const rad = (pts[i][0] * Math.PI) / 180;
      sumSin += Math.sin(rad);
      sumCos += Math.cos(rad);
      sumS += pts[i][1];
      sumV += pts[i][2];
      hList.push(pts[i][0]);
      sList.push(pts[i][1]);
      vList.push(pts[i][2]);
      n++;
    }
    if (n === 0) continue;

    const meanH = ((Math.atan2(sumSin / n, sumCos / n) * 180) / Math.PI + 360) % 360;
    const meanS = sumS / n;
    const meanV = sumV / n;

    // H 원형 표준편차 (각도 단위 근사)
    const R = Math.sqrt((sumSin / n) ** 2 + (sumCos / n) ** 2);
    const hStd = Math.sqrt(Math.max(0, -2 * Math.log(Math.max(R, 1e-6)))) * (180 / Math.PI);

    // S 표준편차
    let sVar = 0;
    for (const sv of sList) sVar += (sv - meanS) ** 2;
    const sStd = Math.sqrt(sVar / n);

    out.push({
      h_mean: meanH,
      h_std: hStd,
      s_mean: meanS,
      s_std: sStd,
      v_mean: meanV,
      weight: n / pts.length,
    });
  }

  // weight 내림차순 정렬
  out.sort((a, b) => b.weight - a.weight);
  return out.length > 0 ? out : null;
}

// 외부 유틸로 재사용
export { hueDist };
