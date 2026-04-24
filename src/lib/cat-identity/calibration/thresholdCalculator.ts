// ============================================================
// threshold 자동 산출기
// 학습 샘플 20개의 "자가거리"(샘플 vs 샘플 중앙값) 분포에서
// median + 2σ 를 임계값으로 사용 → 외부 오인식 차단
// ============================================================

import type { HsvSample } from "../types";
import { hueDist } from "../extractors/hsvKmeansExtractor";

/** 배열 중앙값 */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** 배열 표준편차 */
function std(arr: number[], mean: number): number {
  if (arr.length === 0) return 0;
  const v = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

/**
 * 샘플들의 self-distance 분포에서 threshold 추정.
 * @param samples 학습용 HSV 샘플 배열 (20개 권장)
 * @returns median + 2σ
 */
export function calculateThreshold(samples: HsvSample[]): number {
  if (samples.length < 2) return 2.5; // fallback

  // 중앙 샘플 (median H, median S) 기준
  const hs = samples.map((s) => s.h_mean);
  const ss = samples.map((s) => s.s_mean);
  const cH = median(hs);
  const cS = median(ss);

  // H_std, S_std 중앙값을 정규화 기준으로 사용
  const hStdMed = Math.max(median(samples.map((s) => s.h_std)), 5);
  const sStdMed = Math.max(median(samples.map((s) => s.s_std)), 0.05);

  // 각 샘플의 중심까지 거리
  const dists = samples.map((s) => {
    const dh = hueDist(s.h_mean, cH) / hStdMed;
    const ds = (s.s_mean - cS) / sStdMed;
    return Math.sqrt(dh * dh + ds * ds);
  });

  const m = median(dists);
  const sd = std(dists, m);
  // 하한 1.5 — 학습 샘플이 우연히 너무 몰려 threshold가 비정상적으로
  // 작아지는 경우(예: 모든 샘플이 거의 동일 프레임) 매칭이 과도하게
  // 엄격해져 정상 고양이도 unknown으로 떨어지는 현상 방지
  return Math.max(m + 2 * sd, 1.5);
}
