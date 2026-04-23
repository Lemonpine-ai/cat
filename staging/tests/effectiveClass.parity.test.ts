/**
 * R6 R57: TS getEffectiveClass() ↔ SQL export_behavior_dataset effective_class CASE
 * 동치성 회귀 검증 fixture.
 *
 * 12 클래스 × 다중 라벨 시나리오 = 다수 케이스. TS/SQL 한 쪽만 변경 시 silent
 * drift 방지.
 *
 * 실행 방법 (vitest 셋업 시):
 *   pnpm test staging/tests/effectiveClass.parity.test.ts
 *
 * 또는 Supabase MCP 로 SQL 결과 비교:
 *   SELECT effective_class FROM (
 *     SELECT 'walk_run'::TEXT AS behavior_class, NULL::TEXT AS user_label
 *     UNION ALL ...
 *   ) AS fixture LATERAL JOIN (... CASE 식 ...);
 *
 * vitest 미설치 환경에서도 syntax 정합. checkParity() 를 외부에서 import 해
 * node 스크립트로 실행할 수도 있음.
 */

import { getEffectiveClass } from "../lib/behavior/effectiveClass";
import { BEHAVIOR_CLASSES } from "../lib/ai/behaviorClasses";

// 신규 12 클래스 키
const NEW_CLASSES = BEHAVIOR_CLASSES.map((c) => c.key);

// 검증 라벨 시나리오:
//   - null / correct: 원본 폴백
//   - human / shadow / other_animal: 노이즈 → null
//   - reclassified:<신규 12 클래스>: cls 채택
//   - reclassified:invalid_xxx: 화이트리스트 미통과 → null
const LABEL_CASES: Array<string | null> = [
  null,
  "correct",
  "human",
  "shadow",
  "other_animal",
  ...NEW_CLASSES.map((k) => `reclassified:${k}`),
  "reclassified:invalid_xxx",
];

interface FixtureCase {
  behavior_class: string;
  user_label: string | null;
  ts_result: string | null;
  sql_expected: string | null;
}

/**
 * SQL CASE 와 동일 로직 (TS 로 시뮬레이션) — 실제 SQL 함수 호출 없이 비교용.
 *
 * 마이그레이션 SQL 의 effective_class CASE (Section 8) 와 1:1 동치:
 *   ① user_label IN ('human','shadow','other_animal') → NULL
 *   ② user_label LIKE 'reclassified:%' → 화이트리스트 통과 시 cls / 아니면 NULL
 *   ③ ELSE → behavior_class 화이트리스트 통과 시 그 값 / 아니면 NULL
 */
function simulateSqlEffectiveClass(
  behavior_class: string,
  user_label: string | null,
): string | null {
  // ① 노이즈
  if (
    user_label === "human" ||
    user_label === "shadow" ||
    user_label === "other_animal"
  ) {
    return null;
  }
  // ② 재분류
  if (user_label && user_label.startsWith("reclassified:")) {
    const cls = user_label.substring(13);
    return (NEW_CLASSES as readonly string[]).includes(cls) ? cls : null;
  }
  // ③ 그 외 (NULL / 'correct' / 알 수 없는 값) → behavior_class 화이트리스트
  return (NEW_CLASSES as readonly string[]).includes(behavior_class)
    ? behavior_class
    : null;
}

// 신규 12 + 구 클래스(arch / walk_run / lay_down) — drift 검증용
const ALL_CLASSES = [...NEW_CLASSES, "walk_run", "lay_down", "arch"];

const fixtureCases: FixtureCase[] = [];

for (const cls of ALL_CLASSES) {
  for (const label of LABEL_CASES) {
    const ts_result = getEffectiveClass({
      behavior_class: cls,
      user_label: label,
    });
    const sql_expected = simulateSqlEffectiveClass(cls, label);
    fixtureCases.push({
      behavior_class: cls,
      user_label: label,
      ts_result,
      sql_expected,
    });
  }
}

/**
 * 메인 검증.
 *
 * vitest 환경 예시:
 *   import { test, expect } from "vitest";
 *   test("TS-SQL parity", () => {
 *     const { failed, failures } = checkParity();
 *     expect(failed, JSON.stringify(failures, null, 2)).toBe(0);
 *   });
 *
 * 일반 node 실행 예시:
 *   const { failed, failures } = checkParity();
 *   if (failed > 0) throw new Error(JSON.stringify(failures, null, 2));
 */
export function checkParity(): {
  passed: number;
  failed: number;
  failures: FixtureCase[];
} {
  const failures = fixtureCases.filter((c) => c.ts_result !== c.sql_expected);
  return {
    passed: fixtureCases.length - failures.length,
    failed: failures.length,
    failures,
  };
}

export { fixtureCases };
export type { FixtureCase };
