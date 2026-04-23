/**
 * YOLO 행동 인식 공용 타입 정의 (Phase A 확장)
 * - Worker ↔ 훅 ↔ UI ↔ DB 전반에 공유
 * - Phase A 신규 옵셔널: top2 / bboxAreaRatio / supabase 적재 메타
 */

// staging 내부 신규 정의(12 클래스) 참조 — 상대 경로.
// (staging/types → staging/lib/ai)
import type { BehaviorClassKey } from "../lib/ai/behaviorClasses";

/**
 * 단일 프레임에서 탐지된 행동 1건.
 * - bbox: letterbox 역변환 후 원본 비디오 좌표계 기준, 정규화(0~1)
 * - classKey: 12 클래스 화이트리스트로 좁힘 (BehaviorClassKey).
 *   ※ 레거시 호출부에서 string 그대로 넣고 싶으면 `BehaviorClassKey | string` 으로 완화.
 *      현재는 신규 12 클래스만 통과시키도록 의도적으로 좁혔다.
 *
 * Phase A 신규 옵셔널 필드 (yoloPostprocess 가 채움; DB metadata JSONB 저장용):
 *  - top2Class       : 2위 클래스 key (ambiguity 분석)
 *  - top2Confidence  : 2위 클래스 score
 *  - bboxAreaRatio   : bbox 면적 / 전체 프레임 면적 (0~1)
 */
export type BehaviorDetection = {
  classId: number;
  classKey: BehaviorClassKey | string;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  // Phase A 옵셔널 (신규):
  top2Class?: string;
  top2Confidence?: number;
  bboxAreaRatio?: number;
};

/**
 * 확정된 행동 이벤트 (3프레임 연속 동일 기준).
 * - DB cat_behavior_events 테이블과 매핑
 * - endedAt=null → 현재 진행 중인 행동
 *
 * 일부 집계 함수(behaviorPatternAnalyzer)는 DB row 형태로도 받기 때문에
 * 옵셔널 추가 필드(detected_at / duration_seconds) 를 함께 노출한다.
 */
export type BehaviorEvent = {
  cameraId: string;
  classKey: string;
  startedAt: Date;
  endedAt: Date | null;
  avgConfidence: number;
  // Phase A 옵셔널 (DB row 직접 활용 시):
  detected_at?: string;
  duration_seconds?: number | null;
};

/**
 * Worker 메시지 프로토콜.
 * - 메인 스레드 ↔ Worker 간 통신.
 */
export type WorkerInMessage =
  | { type: "init"; modelUrl: string }
  | { type: "infer"; frameId: number; bitmap: ImageBitmap }
  | { type: "dispose" };

export type WorkerOutMessage =
  | { type: "ready"; backend: string }
  | { type: "result"; frameId: number; detections: BehaviorDetection[] }
  | { type: "error"; message: string };
