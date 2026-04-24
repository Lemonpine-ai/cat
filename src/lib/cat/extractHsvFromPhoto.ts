/**
 * cat-identity Tier 1 — 사진 1장에서 HSV 색상 프로파일 추출 (옵션 B 방식).
 *
 * 사용자 인지 없이 등록 사진에서 지배 색상을 추출해 `cats.color_profile` JSONB 에 저장.
 * Tier 2 (카메라 스트림 기반 정교한 calibration) 전까지의 가벼운 초기 프로파일.
 *
 * 알고리즘 개요:
 *  1) 이미지 중앙 50% 영역만 샘플링 (배경 제외 — 중앙에 고양이가 있을 확률 높음)
 *  2) RGB → HSV 변환
 *  3) 채도 0.2 이하 픽셀 제외 (회색/흰색/검은색은 품종 구별 의미 약함)
 *  4) Hue 20도 bin 히스토그램 → 상위 3개
 *
 * 실패 경로: 이미지 로드/디코드 실패 등 → 빈 프로파일 (`sample_count: 0`) 반환.
 *   등록 자체는 막지 않음 — color 분석은 best-effort.
 */

"use client";

export type HsvColorProfile = {
  /** 상위 hue (0~360). 최대 3개. 비어있을 수 있음. */
  dominant_hues: number[];
  /** 본 추출에 사용된 샘플 수 (Tier 1 기준 항상 1). 0 = 분석 실패. */
  sample_count: number;
  /** 프로파일 스키마 버전. */
  version: "v1";
};

/** 빈 프로파일 (실패 폴백용). */
function emptyProfile(): HsvColorProfile {
  return { dominant_hues: [], sample_count: 0, version: "v1" };
}

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

/**
 * File → HsvColorProfile.
 * 실패 시 emptyProfile() 반환 — 등록 플로우를 막지 않음.
 */
export async function extractHsvFromPhoto(file: File): Promise<HsvColorProfile> {
  try {
    // 1) ImageBitmap 디코드 (브라우저 기본 지원)
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    if (width < 10 || height < 10) {
      bitmap.close?.();
      return emptyProfile();
    }

    // 2) OffscreenCanvas 로 중앙 50% 영역 캡처 (resize 256x256 으로 다운샘플)
    const TARGET = 256;
    const cropW = Math.floor(width * 0.5);
    const cropH = Math.floor(height * 0.5);
    const cropX = Math.floor((width - cropW) / 2);
    const cropY = Math.floor((height - cropH) / 2);

    // OffscreenCanvas 가 없는 환경 대비 canvas 폴백
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
      return emptyProfile();
    }
    ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, TARGET, TARGET);
    const imageData = ctx.getImageData(0, 0, TARGET, TARGET);
    bitmap.close?.();

    // 3) Hue 히스토그램 (18 bin, 20도씩)
    const BIN_COUNT = 18;
    const hist = new Array<number>(BIN_COUNT).fill(0);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r === undefined || g === undefined || b === undefined) continue;
      const [h, s, v] = rgbToHsv(r, g, b);
      // 채도 0.2 이하 or 명도 0.15 이하 제외 (무채색 / 너무 어두움)
      if (s < 0.2 || v < 0.15) continue;
      const bin = Math.min(BIN_COUNT - 1, Math.floor(h / 20));
      hist[bin] = (hist[bin] ?? 0) + 1;
    }

    // 4) 상위 3 bin → hue 중심값 반환
    const indexed = hist.map((count, idx) => ({ count, idx }));
    indexed.sort((a, b) => b.count - a.count);
    const top3 = indexed
      .filter((e) => e.count > 0)
      .slice(0, 3)
      .map((e) => e.idx * 20 + 10); // bin 중심 hue

    return {
      dominant_hues: top3,
      sample_count: 1,
      version: "v1",
    };
  } catch {
    return emptyProfile();
  }
}
