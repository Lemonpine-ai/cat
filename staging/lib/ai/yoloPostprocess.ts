/**
 * YOLO 후처리 유틸
 * - letterbox: 종횡비 유지 리사이즈 + 회색(114) 패딩 → YOLO 정확도 보존
 * - parseYoloOutput: Float32Array → BehaviorDetection[] 파싱
 * - applyNMS: IoU 기반 Non-Max Suppression (중복 박스 제거)
 * - unletterbox: bbox를 원본 비디오 좌표계로 역변환
 *
 * 주의: YOLOv8 ONNX 출력은 [1, 4+nc, 8400] shape
 *   - 4: cx, cy, w, h (letterbox 좌표계, 픽셀 단위)
 *   - nc: 클래스 개수 (12)
 *   - 8400: 앵커 개수 (640x640 기준)
 */

import { BEHAVIOR_CLASSES } from "./behaviorClasses";
// Turbopack worker 번들이 @/ 별칭을 해석하지 못하는 케이스가 있어 상대 경로로 고정
// (staging/lib/ai → staging/types)
import type { BehaviorDetection } from "../../types/behavior";

const TARGET_SIZE = 640;
const NUM_CLASSES = BEHAVIOR_CLASSES.length; // 12
const PAD_COLOR = 114; // YOLO 표준 회색 패딩

export type LetterboxResult = {
  imageData: ImageData;
  padX: number; // 좌우 패딩 (픽셀)
  padY: number; // 상하 패딩 (픽셀)
  scale: number; // 원본→타겟 스케일 (<=1)
  originalW: number;
  originalH: number;
};

/**
 * letterbox: 종횡비를 유지하며 640x640으로 리사이즈 + 회색 패딩
 * - 비디오가 가로로 길면 상하 패딩, 세로로 길면 좌우 패딩
 * - 오프스크린 캔버스로 고속 처리
 */
export function letterbox(
  source: HTMLVideoElement | ImageBitmap,
  targetSize: number = TARGET_SIZE,
): LetterboxResult {
  const originalW =
    source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const originalH =
    source instanceof HTMLVideoElement ? source.videoHeight : source.height;

  // 스케일 계산 (긴 변 기준)
  const scale = Math.min(targetSize / originalW, targetSize / originalH);
  const newW = Math.round(originalW * scale);
  const newH = Math.round(originalH * scale);
  const padX = Math.floor((targetSize - newW) / 2);
  const padY = Math.floor((targetSize - newH) / 2);

  // 오프스크린 캔버스로 리사이즈
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(targetSize, targetSize)
      : Object.assign(document.createElement("canvas"), {
          width: targetSize,
          height: targetSize,
        });
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("Canvas 2D context 생성 실패");

  // 회색 배경 채우기
  ctx.fillStyle = `rgb(${PAD_COLOR},${PAD_COLOR},${PAD_COLOR})`;
  ctx.fillRect(0, 0, targetSize, targetSize);
  // 중앙에 영상 그리기
  ctx.drawImage(source as CanvasImageSource, padX, padY, newW, newH);

  const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
  return { imageData, padX, padY, scale, originalW, originalH };
}

/**
 * ImageData → Float32Array (CHW, [0,1] 정규화)
 * - YOLO 입력 포맷: [1, 3, 640, 640], RGB, 0~1
 */
export function imageDataToTensor(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const size = width * height;
  const tensor = new Float32Array(3 * size);
  // RGBA → CHW RGB
  for (let i = 0; i < size; i++) {
    tensor[i] = data[i * 4] / 255; // R
    tensor[i + size] = data[i * 4 + 1] / 255; // G
    tensor[i + size * 2] = data[i * 4 + 2] / 255; // B
  }
  return tensor;
}

/**
 * bbox를 letterbox 좌표계 → 원본 비디오 좌표계(정규화 0~1)로 역변환
 * - 패딩 제거 → 스케일 복원 → 원본 크기로 정규화
 */
export function unletterbox(
  bboxLB: { x: number; y: number; w: number; h: number },
  padX: number,
  padY: number,
  scale: number,
  originalW: number,
  originalH: number,
): { x: number; y: number; w: number; h: number } {
  // 패딩 제거 후 스케일 복원 (픽셀 → 원본 픽셀)
  const xOrig = (bboxLB.x - padX) / scale;
  const yOrig = (bboxLB.y - padY) / scale;
  const wOrig = bboxLB.w / scale;
  const hOrig = bboxLB.h / scale;
  // 원본 크기 기준 정규화 (0~1) + 범위 클램프
  return {
    x: Math.max(0, Math.min(1, xOrig / originalW)),
    y: Math.max(0, Math.min(1, yOrig / originalH)),
    w: Math.max(0, Math.min(1, wOrig / originalW)),
    h: Math.max(0, Math.min(1, hOrig / originalH)),
  };
}

/**
 * YOLOv8 출력 파싱
 * - 두 가지 shape 지원 (ONNX export 버전에 따라 다름)
 *   · needsTranspose=false: [1, 4+nc, 8400] — 채널 우선 (기본)
 *   · needsTranspose=true:  [1, 8400, 4+nc] — 앵커 우선
 * - 인덱스 계산:
 *   · 채널 우선: output[channel * 8400 + anchor]
 *   · 앵커 우선: output[anchor * (4+nc) + channel]
 * - conf = max(class scores) (YOLOv8은 objectness 없음)
 */
export function parseYoloOutput(
  output: Float32Array,
  padX: number,
  padY: number,
  scale: number,
  originalW: number,
  originalH: number,
  confThreshold: number = 0.25,
  needsTranspose: boolean = false,
  // numAnchors/numChannels는 worker가 ONNX 출력 dims에서 실측값을 넘긴다.
  // 하드코딩(8400 / 4+12) 시 입력 해상도·클래스 수 변경 때 out-of-bounds 발생.
  numAnchors: number = 8400,
  numChannels: number = 4 + NUM_CLASSES,
): BehaviorDetection[] {
  // 실제 클래스 채널 수 = 전체 채널 - 4 (cx, cy, w, h). BEHAVIOR_CLASSES 길이를 상한으로 클램프.
  const numClasses = Math.min(Math.max(0, numChannels - 4), NUM_CLASSES);
  const detections: BehaviorDetection[] = [];

  // 앵커/채널 인덱스를 lookup 함수로 추상화 (루프 안에서 분기 제거)
  const idx = needsTranspose
    ? (anchor: number, channel: number) => anchor * numChannels + channel
    : (anchor: number, channel: number) => channel * numAnchors + anchor;

  for (let i = 0; i < numAnchors; i++) {
    // 클래스 점수 중 1위/2위 찾기 (Phase A: top-2 메타 보강)
    // - 단일 패스 안에서 max + secondMax 추적 → 추가 정렬 비용 0
    let maxScore = 0;
    let maxClass = -1;
    let secondScore = 0;
    let secondClass = -1;
    for (let c = 0; c < numClasses; c++) {
      const score = output[idx(i, 4 + c)];
      if (score > maxScore) {
        // 새 1위 → 기존 1위는 2위로 강등
        secondScore = maxScore;
        secondClass = maxClass;
        maxScore = score;
        maxClass = c;
      } else if (score > secondScore) {
        secondScore = score;
        secondClass = c;
      }
    }
    if (maxScore < confThreshold || maxClass < 0) continue;

    // cx, cy, w, h (letterbox 좌표, 픽셀 단위)
    const cx = output[idx(i, 0)];
    const cy = output[idx(i, 1)];
    const w = output[idx(i, 2)];
    const h = output[idx(i, 3)];

    // corner 좌표로 변환 (letterbox 좌표계)
    const bboxLB = { x: cx - w / 2, y: cy - h / 2, w, h };
    const bbox = unletterbox(bboxLB, padX, padY, scale, originalW, originalH);

    // 정규화 bbox 면적 비율 (0~1) — DB metadata 에 기록.
    // - 너무 작은 박스(0.5% 미만)는 노이즈 가능성 → Phase D 라벨링 UI 에서 활용.
    // - 정규화 좌표라 frameW/H 인자 별도 필요 없음 (이미 0~1 스케일).
    const bboxAreaRatio = Math.max(0, Math.min(1, bbox.w * bbox.h));

    const cls = BEHAVIOR_CLASSES[maxClass];
    const second =
      secondClass >= 0 && secondClass < BEHAVIOR_CLASSES.length
        ? BEHAVIOR_CLASSES[secondClass]
        : null;

    detections.push({
      classId: maxClass,
      classKey: cls.key,
      label: cls.label,
      confidence: maxScore,
      bbox,
      // Phase A 옵셔널 메타 (logger 가 metadata JSONB 로 적재):
      top2Class: second?.key,
      top2Confidence: second ? secondScore : undefined,
      bboxAreaRatio,
    });
  }

  return detections;
}

/**
 * 두 bbox의 IoU(Intersection over Union) 계산
 * - 정규화 좌표(0~1) 기준
 */
function computeIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * NMS: 겹치는 박스 중 신뢰도 높은 것만 유지
 * - 클래스별로 독립 적용 (다른 행동은 공존 허용)
 */
export function applyNMS(
  detections: BehaviorDetection[],
  iouThreshold: number = 0.45,
): BehaviorDetection[] {
  // 신뢰도 내림차순 정렬
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const keep: BehaviorDetection[] = [];

  for (const det of sorted) {
    let suppress = false;
    for (const k of keep) {
      // 같은 클래스끼리만 비교
      if (k.classId !== det.classId) continue;
      if (computeIoU(det.bbox, k.bbox) > iouThreshold) {
        suppress = true;
        break;
      }
    }
    if (!suppress) keep.push(det);
  }

  // 최종적으로 confidence 내림차순 정렬 보장
  // - 호출부(useBehaviorDetection 등)에서 detections[0]을 "최고 신뢰도"로 사용하기 때문.
  // - 클래스별로 keep에 push되는 순서가 서로 엇갈릴 수 있으므로 여기서 한 번 더 정렬한다.
  return keep.sort((a, b) => b.confidence - a.confidence);
}
