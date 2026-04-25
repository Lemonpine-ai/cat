/**
 * cat-identity Tier 1 fix R4-3 m15 — HSV dominant hue 계산 (pure 함수).
 *
 * 배경:
 *  - Worker (extractHsv.worker.ts) 와 idle 폴백 (extractHsvFromPhoto.computeOnMainThreadIdle) 이
 *    동일한 hist 알고리즘을 별도 본문으로 보유 → 임계값 변경 시 두 곳 동시 수정 필요.
 *  - 본 모듈로 추출하여 단일 출처. Worker 와 idle 폴백 모두 import 사용.
 *
 * 알고리즘 (constants.ts 단일 출처):
 *  - RGB(0..255) → HSV(h:0..360, s:0..1, v:0..1)
 *  - 채도 < HSV_SAT_THRESHOLD (0.2) || 명도 < HSV_VAL_THRESHOLD (0.15) → skip
 *  - bin = floor(h / (360 / HSV_BIN_COUNT)), max BIN-1
 *  - top 3 bin 의 (idx * binWidth + binWidth/2) 반환
 *
 * 본 함수는 pure (메인 / Worker 동일 동작) — DOM / globalThis 의존 0.
 */

import {
  HSV_BIN_COUNT,
  HSV_SAT_THRESHOLD,
  HSV_VAL_THRESHOLD,
} from "./constants";

/**
 * ImageData → 상위 3 hue (0~360). 비어있으면 빈 배열.
 *
 * @example
 *   const top3 = computeDominantHuesFromImageData(imageData); // [10, 30, 50]
 */
export function computeDominantHuesFromImageData(imageData: ImageData): number[] {
  const hist = new Array<number>(HSV_BIN_COUNT).fill(0);
  const data = imageData.data;
  const binWidth = 360 / HSV_BIN_COUNT;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r === undefined || g === undefined || b === undefined) continue;

    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    if (delta > 0) {
      if (max === rn) h = ((gn - bn) / delta) % 6;
      else if (max === gn) h = (bn - rn) / delta + 2;
      else h = (rn - gn) / delta + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : delta / max;
    const v = max;
    if (s < HSV_SAT_THRESHOLD || v < HSV_VAL_THRESHOLD) continue;

    const bin = Math.min(HSV_BIN_COUNT - 1, Math.floor(h / binWidth));
    hist[bin] = (hist[bin] ?? 0) + 1;
  }

  const indexed = hist.map((count, idx) => ({ count, idx }));
  indexed.sort((a, b) => b.count - a.count);
  return indexed
    .filter((e) => e.count > 0)
    .slice(0, 3)
    .map((e) => Math.round(e.idx * binWidth + binWidth / 2));
}
