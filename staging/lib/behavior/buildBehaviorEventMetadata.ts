/**
 * Phase B (R7 §4) — Phase A logger 의 metadata 조립 로직 mirror.
 *
 * 목적:
 *  - `cat_behavior_events.metadata` JSONB freeze 검증을 위해 logger 본체의 조립 로직을
 *    독립 순수 함수로 추출. logger 본체는 R7 단계에서는 수정하지 않고, Phase B src/ 반영
 *    PR 시점에 본 함수로 치환 합치기 (CLAUDE.md #13 staging 무손상 원칙 준수).
 *
 * ⚠️ 동기화 약속 (R7 §4.2):
 *  - 본 함수의 코드는 `src/hooks/useBehaviorEventLogger.ts` line 225-236 의 metadata 조립
 *    블록과 1:1 동치이어야 한다. 변경 시 src/ 합치기 PR 까지 상시 정합성 유지.
 *  - 정합성 깨짐을 방지하기 위해 본 파일과 src/ logger 의 metadata 블록 양쪽에 동일 헤더
 *    `// metadata-freeze-spec: r7-1` 마커를 두고 grep 으로 자동 검증 권고 (R8 이월 가능).
 *
 * Phase D 착수 시점까지 freeze 대상 4 필드:
 *  · model_version    — string, 항상
 *  · top2_class       — string, detection.top2Class !== undefined 일 때만
 *  · top2_confidence  — number, Number.isFinite 통과 시만 (R10 §2: NaN/Infinity → key omit)
 *  · bbox_area_ratio  — number, Number.isFinite 통과 시만 (R10 §2: NaN/Infinity → key omit)
 */

// metadata-freeze-spec: r7-1
import type { BehaviorDetection } from "../../types/behavior";

/**
 * detection 1건 + modelVersion → DB INSERT 용 metadata 객체 조립.
 *
 * @param detection YOLO 결과 1건 (top1 / top2 / bboxAreaRatio 옵셔널)
 * @param modelVersion BEHAVIOR_MODEL_VERSION 상수 ("v1" 등). Phase E archive/active 분류 키
 * @returns Supabase JSONB 컬럼에 그대로 INSERT 가능한 plain 객체
 */
export function buildBehaviorEventMetadata(
  detection: BehaviorDetection,
  modelVersion: string,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { model_version: modelVersion };
  if (detection.top2Class !== undefined) {
    metadata.top2_class = detection.top2Class;
  }
  // R10 §2: NaN/Infinity 시 key omit — JSONB INSERT 안전 + Phase D/E 통계 의미 명확.
  if (Number.isFinite(detection.top2Confidence)) {
    metadata.top2_confidence = detection.top2Confidence;
  }
  if (Number.isFinite(detection.bboxAreaRatio)) {
    metadata.bbox_area_ratio = detection.bboxAreaRatio;
  }
  return metadata;
}
