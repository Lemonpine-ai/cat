/// <reference lib="webworker" />
/**
 * cat-identity Tier 1 fix R1 #2 — HSV 히스토그램 계산 Web Worker.
 *
 * 메인 스레드에서 모바일 폰 + 큰 이미지 업로드 시 RGB→HSV 픽셀 루프
 * (256x256 = 65k 픽셀) 가 INP 에 영향. Worker 분리 시 등록 화면 유저
 * 입력은 무중단.
 *
 * 메시지 프로토콜:
 *   in:  { imageData: ImageData }
 *   out: { kind: "ok"; profile: HsvColorProfile }
 *      | { kind: "error"; reason: string }
 *
 * 메인 코드 (extractHsvFromPhoto.ts) 가 ImageData 만 캡처해서 postMessage —
 * Worker 가 hue 히스토그램 계산 후 dominant_hues 반환.
 */

export type HsvColorProfile = {
  /** 상위 hue (0~360). 최대 3개. */
  dominant_hues: number[];
  /** 본 추출에 사용된 샘플 수 (Tier 1 기준 항상 1). 0 = 분석 실패. */
  sample_count: number;
  /** 프로파일 스키마 버전. */
  version: "v1";
};

export type WorkerInMessage = { imageData: ImageData };
export type WorkerOutMessage =
  | { kind: "ok"; profile: HsvColorProfile }
  | { kind: "error"; reason: string };

/** Hue bin 개수 — 18 bin × 20도. */
const BIN_COUNT = 18;
/** 채도 컷오프 (이하 무채색 제외). */
const SAT_THRESHOLD = 0.2;
/** 명도 컷오프 (이하 너무 어두움 제외). */
const VAL_THRESHOLD = 0.15;

/** RGB (0..255) → HSV (h: 0..360, s: 0..1, v: 0..1). */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
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
  return [h, s, v];
}

/** ImageData → 상위 3 hue. 비어있으면 빈 배열. */
function computeDominantHues(imageData: ImageData): number[] {
  const hist = new Array<number>(BIN_COUNT).fill(0);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r === undefined || g === undefined || b === undefined) continue;
    const [h, s, v] = rgbToHsv(r, g, b);
    if (s < SAT_THRESHOLD || v < VAL_THRESHOLD) continue;
    const bin = Math.min(BIN_COUNT - 1, Math.floor(h / 20));
    hist[bin] = (hist[bin] ?? 0) + 1;
  }

  const indexed = hist.map((count, idx) => ({ count, idx }));
  indexed.sort((a, b) => b.count - a.count);
  return indexed
    .filter((e) => e.count > 0)
    .slice(0, 3)
    .map((e) => e.idx * 20 + 10);
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  try {
    const { imageData } = event.data;
    if (!imageData || !imageData.data || imageData.data.length === 0) {
      const out: WorkerOutMessage = { kind: "error", reason: "empty-imageData" };
      self.postMessage(out);
      return;
    }
    const top3 = computeDominantHues(imageData);
    const profile: HsvColorProfile = {
      dominant_hues: top3,
      sample_count: 1,
      version: "v1",
    };
    const out: WorkerOutMessage = { kind: "ok", profile };
    self.postMessage(out);
  } catch (err) {
    const out: WorkerOutMessage = {
      kind: "error",
      reason: err instanceof Error ? err.message : "unknown",
    };
    self.postMessage(out);
  }
};
