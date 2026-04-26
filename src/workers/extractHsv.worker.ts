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
 *
 * fix R3 R4-1: BIN_COUNT / SAT_THRESHOLD / VAL_THRESHOLD 로컬 재정의 제거 →
 *              constants.ts 의 HSV_* 단일 출처 사용 (worker 도 ES module 빌드).
 *
 * fix R4-3 m15: rgbToHsv / computeDominantHues 본문 제거 →
 *               computeDominantHuesFromImageData 단일 출처 호출.
 */

import { computeDominantHuesFromImageData } from "../lib/cat/computeDominantHues";

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

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  try {
    const { imageData } = event.data;
    if (!imageData || !imageData.data || imageData.data.length === 0) {
      const out: WorkerOutMessage = { kind: "error", reason: "empty-imageData" };
      self.postMessage(out);
      return;
    }
    /* fix R4-3 m15 — computeDominantHuesFromImageData 단일 출처 사용. */
    const top3 = computeDominantHuesFromImageData(imageData);
    const profile: HsvColorProfile = {
      dominant_hues: top3,
      /* fix R4-5 m20 — top3 비어있으면 sample_count=0 (의미 일치). */
      sample_count: top3.length > 0 ? 1 : 0,
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
