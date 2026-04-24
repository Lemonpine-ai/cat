// ============================================================
// 조명 단계 검출기
// bbox 내부 V(명도) 평균을 기준으로 4단계 분류
// dark이면 매칭 자체를 건너뛰어 오판 방지
// ============================================================

import type { LightingLevel } from "../types";

// V 평균 임계값 (0~255 스케일)
const V_DARK = 40;    // 매우 어두움 — 매칭 불가
const V_DIM = 85;     // 어둑
const V_NORMAL = 170; // 일반

/**
 * 비디오 프레임 bbox 영역의 평균 V(명도)를 측정하여 조명 단계 반환.
 * @param frame video 요소 또는 ImageBitmap
 * @param bbox 정규화된 bbox (0~1)
 * @returns 'bright' | 'normal' | 'dim' | 'dark'
 */
export function detectLighting(
  frame: HTMLVideoElement | ImageBitmap,
  bbox: { x: number; y: number; w: number; h: number },
): LightingLevel {
  // 원본 프레임 크기 획득
  const fw = frame instanceof HTMLVideoElement ? frame.videoWidth : frame.width;
  const fh = frame instanceof HTMLVideoElement ? frame.videoHeight : frame.height;
  if (!fw || !fh) return "dark";

  // bbox 픽셀 좌표
  const sx = Math.max(0, Math.floor(bbox.x * fw));
  const sy = Math.max(0, Math.floor(bbox.y * fh));
  const sw = Math.max(1, Math.floor(bbox.w * fw));
  const sh = Math.max(1, Math.floor(bbox.h * fh));

  // 다운샘플 캔버스 (성능: 32x32 충분)
  const TARGET = 32;
  const canvas = document.createElement("canvas");
  canvas.width = TARGET;
  canvas.height = TARGET;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "dark";

  try {
    ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, TARGET, TARGET);
    const data = ctx.getImageData(0, 0, TARGET, TARGET).data;

    // V = max(r,g,b) 기준 평균
    let vSum = 0;
    const px = TARGET * TARGET;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      vSum += Math.max(r, g, b);
    }
    const vAvg = vSum / px;

    if (vAvg < V_DARK) return "dark";
    if (vAvg < V_DIM) return "dim";
    if (vAvg < V_NORMAL) return "normal";
    return "bright";
  } catch {
    return "dark";
  }
}
