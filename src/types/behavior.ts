/**
 * YOLO 행동 인식 공용 타입 정의
 * - Worker ↔ 훅 ↔ UI ↔ DB 전반에 공유
 */

/**
 * 단일 프레임에서 탐지된 행동 1건
 * - bbox: letterbox 역변환 후 원본 비디오 좌표계 기준, 정규화(0~1)
 */
export type BehaviorDetection = {
  classId: number;
  classKey: string;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
};

/**
 * 확정된 행동 이벤트 (3프레임 연속 동일 기준)
 * - DB cat_behavior_events 테이블과 매핑
 * - endedAt=null → 현재 진행 중인 행동
 */
export type BehaviorEvent = {
  cameraId: string;
  classKey: string;
  startedAt: Date;
  endedAt: Date | null;
  avgConfidence: number;
};

/**
 * Worker 메시지 프로토콜
 * - 메인 스레드 ↔ Worker 간 통신
 */
export type WorkerInMessage =
  | { type: "init"; modelUrl: string }
  | { type: "infer"; frameId: number; bitmap: ImageBitmap }
  | { type: "dispose" };

export type WorkerOutMessage =
  | { type: "ready"; backend: string }
  | { type: "result"; frameId: number; detections: BehaviorDetection[] }
  | { type: "error"; message: string };
