/**
 * createAnalysisCanvas — 분석용 캔버스 생성 유틸.
 *
 * OffscreenCanvas를 지원하면 사용, 미지원 환경에서는
 * document.createElement('canvas') fallback 적용.
 */

/** 분석용 프레임 크기 — 외부에서도 참조 (zoneMotionDetector 등) */
export const FRAME_WIDTH = 320;
export const FRAME_HEIGHT = 240;

type AnalysisCanvas = {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
};

/** OffscreenCanvas 사용 가능 여부 확인 후 캔버스 + 컨텍스트 반환 */
export function createAnalysisCanvas(): AnalysisCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(FRAME_WIDTH, FRAME_HEIGHT);
    /* BUG-8: getContext null 체크 — 2D 컨텍스트 생성 실패 시 에러 */
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2D 컨텍스트를 생성할 수 없습니다");
    return { canvas, ctx };
  }
  /* BUG-3: SSR 환경에서 document 미존재 시 크래시 방지 */
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    /* BUG-8: getContext null 체크 — 2D 컨텍스트 생성 실패 시 에러 */
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D 컨텍스트를 생성할 수 없습니다");
    return { canvas, ctx };
  }
  /* OffscreenCanvas도 document도 없는 환경 (SSR 등) */
  throw new Error("캔버스를 생성할 수 없는 환경입니다");
}
