/**
 * effectiveClass — 집사 라벨(user_label) 보정을 반영한 "실효 클래스" 계산.
 *
 * 규칙 (사장님 100% 확정):
 *   user_label 값                  → 결과
 *   ─────────────────────────────────────────────
 *   null / undefined / "correct"   → behavior_class 그대로
 *   "human" / "shadow" / "other_animal"
 *                                  → null (노이즈 → 통계 제외)
 *   "reclassified:<cls>"           → cls (12 클래스 화이트리스트일 때만)
 *
 * - 잘못된 값(reclassified:비12클래스 등)은 null 로 폴백 → 안전 기본값.
 * - DB SQL effective_class 계산식과 1:1 동치.
 */

// staging 내부 참조 — 상대 경로 (staging/lib/behavior → staging/lib/ai)
import {
  BEHAVIOR_CLASS_KEYS,
  type BehaviorClassKey,
} from "../ai/behaviorClasses";

/** 노이즈 라벨 — 통계 집계에서 제외 대상 */
const NOISE_LABELS: ReadonlySet<string> = new Set([
  "human",
  "shadow",
  "other_animal",
]);

/** reclassified 접두사 (substring 인덱스 13 = "reclassified:".length) */
const RECLASSIFIED_PREFIX = "reclassified:";

/**
 * 이벤트 1건의 effective class 계산.
 * @returns 12 클래스 키 (BehaviorClassKey) | null (노이즈/무효)
 */
export function getEffectiveClass(event: {
  behavior_class: string;
  user_label?: string | null;
}): BehaviorClassKey | null {
  const ul = event.user_label;

  // 1) 라벨 미지정 / "correct" → 원본 그대로
  if (!ul || ul === "correct") {
    return isValidClassKey(event.behavior_class)
      ? (event.behavior_class as BehaviorClassKey)
      : null;
  }

  // 2) 노이즈 → 집계 제외
  if (NOISE_LABELS.has(ul)) return null;

  // 3) 재분류 → 화이트리스트 검증 후 채택
  if (ul.startsWith(RECLASSIFIED_PREFIX)) {
    const cls = ul.substring(RECLASSIFIED_PREFIX.length);
    return isValidClassKey(cls) ? (cls as BehaviorClassKey) : null;
  }

  // 4) 알 수 없는 라벨 → 안전하게 원본 폴백
  return isValidClassKey(event.behavior_class)
    ? (event.behavior_class as BehaviorClassKey)
    : null;
}

/** 12 클래스 키 화이트리스트 검증 */
function isValidClassKey(key: string): boolean {
  return BEHAVIOR_CLASS_KEYS.has(key);
}
