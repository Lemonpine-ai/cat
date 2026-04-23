/**
 * R7 R61: BEHAVIOR_CLASSES invariants 검증.
 *
 * ONNX 모델 출력 인덱스 0~11과 1:1 매핑 보장:
 *  - 길이 12 고정
 *  - id 순서 0, 1, 2, ..., 11
 *  - key 중복 없음
 *  - BEHAVIOR_SEMANTIC_MAP 12 키 완비
 *
 * ⚠️ 이 테스트가 깨지면 ONNX 추론 결과가 잘못된 라벨로 매핑되어
 *    DB 에 들어가므로 Phase A 리그레션의 마지막 안전망.
 *
 * 실행: 프로젝트 공식 테스트 러너 합류 전까지는 runInvariants() 를
 *       직접 호출해 결과를 검증한다 (vitest/jest 러너 도입 시 describe/it
 *       래퍼만 추가하면 됨).
 */

import {
  BEHAVIOR_CLASSES,
  BEHAVIOR_SEMANTIC_MAP,
} from "../lib/ai/behaviorClasses";

/** 단일 invariant 결과 */
export interface InvariantResult {
  name: string;
  passed: boolean;
  details?: string;
}

/**
 * 4개 invariant 를 검증하고 결과 배열 반환.
 * - 실패해도 throw 하지 않음 → 호출 측이 failed > 0 여부로 판단.
 */
export function checkInvariants(): InvariantResult[] {
  const results: InvariantResult[] = [];

  // 1. 길이 12 고정 (ONNX 출력 인덱스 0~11 과 대응)
  results.push({
    name: "BEHAVIOR_CLASSES.length === 12",
    passed: BEHAVIOR_CLASSES.length === 12,
    details: `actual: ${BEHAVIOR_CLASSES.length}`,
  });

  // 2. id 순서 0~11 sequential — 배열 인덱스 = id 일치 필수
  const idsSequential = BEHAVIOR_CLASSES.every((c, i) => c.id === i);
  results.push({
    name: "id 순서 0~11 sequential",
    passed: idsSequential,
    details: idsSequential
      ? undefined
      : `ids: ${BEHAVIOR_CLASSES.map((c) => c.id).join(",")}`,
  });

  // 3. key 중복 없음 (Set size 비교)
  const keys = BEHAVIOR_CLASSES.map((c) => c.key);
  const uniqueKeys = new Set(keys);
  results.push({
    name: "key 중복 없음",
    passed: keys.length === uniqueKeys.size,
    details:
      keys.length !== uniqueKeys.size
        ? `duplicate keys detected: ${keys.join(",")}`
        : undefined,
  });

  // 4. BEHAVIOR_SEMANTIC_MAP 12 키 완비 — 누락 시 getBehaviorSemantic null 폴백
  const semanticKeys = Object.keys(BEHAVIOR_SEMANTIC_MAP);
  const missing = keys.filter((k) => !semanticKeys.includes(k));
  const allMapped = missing.length === 0;
  results.push({
    name: "BEHAVIOR_SEMANTIC_MAP 12 키 완비",
    passed: allMapped && semanticKeys.length === 12,
    details: !allMapped
      ? `missing: ${missing.join(",")}`
      : semanticKeys.length !== 12
      ? `semantic keys length: ${semanticKeys.length}`
      : undefined,
  });

  return results;
}

/**
 * 전체 실행 요약 — passed/failed 카운트 + 상세 결과.
 * - passed = 통과 invariant 수
 * - failed = 실패 invariant 수 (> 0 이면 ONNX 매핑 리그레션)
 */
export function runInvariants(): {
  passed: number;
  failed: number;
  results: InvariantResult[];
} {
  const results = checkInvariants();
  return {
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}
