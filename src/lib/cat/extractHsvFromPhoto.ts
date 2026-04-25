/**
 * cat-identity Tier 1 — 사진 1장에서 HSV 색상 프로파일 추출 (옵션 B 방식).
 *
 * 사용자 인지 없이 등록 사진에서 지배 색상을 추출해 `cats.color_profile` JSONB 에 저장.
 * Tier 2 (카메라 스트림 기반 정교한 calibration) 전까지의 가벼운 초기 프로파일.
 *
 * 알고리즘 개요:
 *  1) 이미지 중앙 50% 영역만 샘플링 (배경 제외 — 중앙에 고양이가 있을 확률 높음)
 *  2) RGB → HSV 변환 + 18 bin Hue 히스토그램 (Worker 또는 idle chunk)
 *  3) 채도 0.2 이하 / 명도 0.15 이하 픽셀 제외 (회색/흰색/검은색은 품종 구별 의미 약함)
 *  4) 상위 3 bin → hue 중심값 반환
 *
 * fix R1 #2 성능 개선: 픽셀 루프를 Web Worker 로 분리.
 *  - 메인 스레드: ImageData 캡처만 (createImageBitmap + drawImage + getImageData)
 *  - Worker 스레드: RGB→HSV + 히스토그램 (CPU bound)
 *  - Worker 미지원 시: requestIdleCallback / setTimeout 으로 chunked 폴백
 *
 * 반환: `{ kind:"ok"; profile } | { kind:"error"; reason; message }` union
 *  - error 라도 등록 자체는 막지 않음 (호출자가 emptyProfile 로 폴백)
 *
 * @example
 *   const result = await extractHsvFromPhoto(file);
 *   if (result.kind === "ok") {
 *     await supabase.from("cats").update({ color_profile: result.profile });
 *   }
 */

"use client";

import type {
  HsvColorProfile,
  WorkerInMessage,
  WorkerOutMessage,
} from "@/workers/extractHsv.worker";

export type { HsvColorProfile } from "@/workers/extractHsv.worker";

export type ExtractHsvResult =
  | { kind: "ok"; profile: HsvColorProfile }
  | { kind: "error"; reason: string; message: string };

/** 다운샘플 타깃 해상도. 256×256 = 65k 픽셀 (모바일 한도 내). */
const TARGET = 256;
/** 중앙 crop 비율. 0.5 = 가운데 50% 만 사용. */
const CROP_RATIO = 0.5;

/** 빈 프로파일 (실패 폴백용). */
function emptyProfile(): HsvColorProfile {
  return { dominant_hues: [], sample_count: 0, version: "v1" };
}

/** Worker 사용 가능 여부 (ssr 안전). */
function workerSupported(): boolean {
  return typeof Worker !== "undefined";
}

/** File → ImageData (TARGET×TARGET, 중앙 crop). 실패 시 null. */
async function fileToImageData(file: File): Promise<ImageData | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    if (width < 10 || height < 10) {
      bitmap.close?.();
      return null;
    }

    const cropW = Math.floor(width * CROP_RATIO);
    const cropH = Math.floor(height * CROP_RATIO);
    const cropX = Math.floor((width - cropW) / 2);
    const cropY = Math.floor((height - cropH) / 2);

    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(TARGET, TARGET)
        : Object.assign(document.createElement("canvas"), {
            width: TARGET,
            height: TARGET,
          });
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) {
      bitmap.close?.();
      return null;
    }
    ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, TARGET, TARGET);
    const imageData = ctx.getImageData(0, 0, TARGET, TARGET);
    bitmap.close?.();
    return imageData;
  } catch {
    return null;
  }
}

/** Worker 미지원 환경 — requestIdleCallback 으로 chunked 처리 (4096 픽셀씩). */
async function computeOnMainThreadIdle(imageData: ImageData): Promise<HsvColorProfile> {
  const BIN_COUNT = 18;
  const SAT_THRESHOLD = 0.2;
  const VAL_THRESHOLD = 0.15;
  const hist = new Array<number>(BIN_COUNT).fill(0);
  const data = imageData.data;
  const CHUNK_PIXELS = 4096; // 4096 픽셀 = 16384 bytes (RGBA)
  const CHUNK_BYTES = CHUNK_PIXELS * 4;

  for (let start = 0; start < data.length; start += CHUNK_BYTES) {
    const end = Math.min(start + CHUNK_BYTES, data.length);
    for (let i = start; i < end; i += 4) {
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
      if (s < SAT_THRESHOLD || v < VAL_THRESHOLD) continue;
      const bin = Math.min(BIN_COUNT - 1, Math.floor(h / 20));
      hist[bin] = (hist[bin] ?? 0) + 1;
    }
    // chunk 사이에 idle yield — 메인 스레드 양보.
    await new Promise<void>((resolve) => {
      const ric = (
        globalThis as unknown as { requestIdleCallback?: (cb: () => void) => number }
      ).requestIdleCallback;
      if (typeof ric === "function") ric(() => resolve());
      else setTimeout(resolve, 0);
    });
  }

  const indexed = hist.map((count, idx) => ({ count, idx }));
  indexed.sort((a, b) => b.count - a.count);
  const top3 = indexed
    .filter((e) => e.count > 0)
    .slice(0, 3)
    .map((e) => e.idx * 20 + 10);
  return { dominant_hues: top3, sample_count: 1, version: "v1" };
}

/**
 * File → ExtractHsvResult.
 * 1) ImageData 캡처
 * 2) Worker 가용 → postMessage 후 await 응답
 * 3) Worker 미지원 → idle chunked 메인 스레드 계산
 */
export async function extractHsvFromPhoto(file: File): Promise<ExtractHsvResult> {
  const imageData = await fileToImageData(file);
  if (!imageData) {
    return {
      kind: "error",
      reason: "decode-failed",
      message: "사진을 읽지 못했어요. 다른 사진으로 시도해 주세요.",
    };
  }

  // Worker 경로 우선.
  if (workerSupported()) {
    try {
      const worker = new Worker(
        new URL("../../workers/extractHsv.worker.ts", import.meta.url),
        { type: "module" },
      );
      const profile = await new Promise<HsvColorProfile>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
          const msg = e.data;
          if (msg.kind === "ok") resolve(msg.profile);
          else reject(new Error(msg.reason));
        };
        worker.onerror = (err) => reject(new Error(err.message || "worker-error"));
        const inMsg: WorkerInMessage = { imageData };
        worker.postMessage(inMsg);
      });
      worker.terminate();
      return { kind: "ok", profile };
    } catch (err) {
      // Worker 인스턴스 생성 실패 (Next 빌드에서 worker chunk 누락 등) → idle 폴백.
      const message = err instanceof Error ? err.message : "worker-failed";
      // 콘솔만 남기고 폴백 시도. (logger 는 fix-5 에서 도입.)
      if (typeof console !== "undefined") {
        console.warn("[extractHsvFromPhoto] worker failed, fallback to idle:", message);
      }
    }
  }

  // 폴백: 메인 스레드 idle chunked.
  try {
    const profile = await computeOnMainThreadIdle(imageData);
    return { kind: "ok", profile };
  } catch (err) {
    return {
      kind: "error",
      reason: "compute-failed",
      message: err instanceof Error ? err.message : "알 수 없는 오류",
    };
  }
}

/** 호출자가 빈 프로파일이 필요한 경우 (error 분기에서 폴백 저장용). */
export function emptyHsvProfile(): HsvColorProfile {
  return emptyProfile();
}
