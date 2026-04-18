// ============================================================
// ColorProfileV1 빌더
// 학습 샘플 N개를 집계 → 중앙값/표준편차/threshold 계산 → JSON 생성
// ============================================================

import type { ColorProfileV1, HsvSample, LightingLevel } from "../types";
import { calculateThreshold } from "./thresholdCalculator";
import { hueDist } from "../extractors/hsvKmeansExtractor";

/** 원형 평균 (H 전용) — circular median 계산의 기준점으로만 사용 */
function circularMean(hs: number[]): number {
  if (hs.length === 0) return 0;
  let sumSin = 0, sumCos = 0;
  for (const h of hs) {
    const r = (h * Math.PI) / 180;
    sumSin += Math.sin(r);
    sumCos += Math.cos(r);
  }
  const mean = (Math.atan2(sumSin / hs.length, sumCos / hs.length) * 180) / Math.PI;
  return (mean + 360) % 360;
}

/**
 * 원형 중앙값 (H 전용, 도 단위)
 * - 각도 배열을 원형 평균(anchor) 기준 signed diff(-180~+180)로 펼친 뒤
 *   일반 median을 구하고 다시 0~360으로 접어서 반환
 * - 이상치에 강건함 (평균보다 median 사용이 색상 캘리브에 더 안정)
 */
function circularMedian(hs: number[]): number {
  if (hs.length === 0) return 0;
  const anchor = circularMean(hs);
  const diffs = hs.map((h) => {
    let d = h - anchor;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  });
  const sorted = [...diffs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medDiff =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  return (((anchor + medDiff) % 360) + 360) % 360;
}

/** 원형 표준편차 (H 전용, 도 단위) — median 중심 */
function circularStd(hs: number[], center: number): number {
  if (hs.length === 0) return 0;
  let sum = 0;
  for (const h of hs) {
    const d = hueDist(h, center);
    sum += d * d;
  }
  return Math.sqrt(sum / hs.length);
}

/** 배열 중앙값 (일반) */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** 일반 평균 (weight 등 비원형 값 평균용) */
function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** 표준편차 — center 중심 */
function std(arr: number[], m: number): number {
  if (arr.length === 0) return 0;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

/**
 * 샘플 배열 → ColorProfileV1 JSON.
 * @param samples primary HSV 샘플들
 * @param lightingLog 조명 단계 로그 (샘플 순서와 동일 길이)
 */
export function buildProfileV1(
  samples: HsvSample[],
  lightingLog: LightingLevel[],
): ColorProfileV1 {
  const hs = samples.map((s) => s.h_mean);
  const ss = samples.map((s) => s.s_mean);

  // H는 circular median, S는 일반 median 사용 (이상치 강건)
  // std는 median 중심 거리로 계산 (threshold_hint와 일관)
  const hMean = circularMedian(hs);
  const hStd = circularStd(hs, hMean);
  const sMean = median(ss);
  const sStd = std(ss, sMean);

  const threshold = calculateThreshold(samples);

  // 조명 분포 집계
  const lightingDist: Record<string, number> = {
    bright: 0,
    normal: 0,
    dim: 0,
    dark: 0,
  };
  for (const l of lightingLog) {
    lightingDist[l] = (lightingDist[l] ?? 0) + 1;
  }

  return {
    version: 1,
    method: "hsv_kmeans",
    primary: {
      h_mean: hMean,
      h_std: hStd,
      s_mean: sMean,
      s_std: sStd,
      weight: mean(samples.map((s) => s.weight)),
    },
    secondary: null, // v3에서 채움
    threshold_hint: threshold,
    calibrated_at: new Date().toISOString(),
    sample_stats: {
      count: samples.length,
      lighting_distribution: lightingDist,
    },
  };
}
