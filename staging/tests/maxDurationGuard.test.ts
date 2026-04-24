/**
 * Phase B — shouldForceClose 단위 테스트.
 *
 * ⚠️ Dev 판단: runner-agnostic export 함수 형식 (confirmFrames.test.ts 와 동일).
 */

import {
  shouldForceClose,
  DEFAULT_MAX_EVENT_DURATION_MS,
} from "../lib/behavior/maxDurationGuard";

export interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

export function runTests(): TestResult[] {
  const results: TestResult[] = [];
  const push = (name: string, passed: boolean, details?: string) =>
    results.push({ name, passed, details });

  const base = new Date("2026-04-24T10:00:00.000Z");
  const open = { startedAt: base, classKey: "sleeping" };

  // 1) null openEvent → false
  push(
    "null openEvent → false",
    shouldForceClose(null, base) === false,
  );

  // 2) 29분 → false
  {
    const now = new Date(base.getTime() + 29 * 60 * 1000);
    push("29분 → false", shouldForceClose(open, now) === false);
  }

  // 3) 30분 정각 → true
  {
    const now = new Date(base.getTime() + DEFAULT_MAX_EVENT_DURATION_MS);
    push("30분 정각 → true", shouldForceClose(open, now) === true);
  }

  // 4) 30분 + 1ms → true
  {
    const now = new Date(
      base.getTime() + DEFAULT_MAX_EVENT_DURATION_MS + 1,
    );
    push("30분 + 1ms → true", shouldForceClose(open, now) === true);
  }

  // 5) maxMs 파라미터 override (5분 한도)
  {
    const now = new Date(base.getTime() + 6 * 60 * 1000);
    push(
      "override maxMs=5분, 6분 경과 → true",
      shouldForceClose(open, now, 5 * 60 * 1000) === true,
    );
  }

  // 6) 시계 역행(now < startedAt) → false (보수)
  {
    const now = new Date(base.getTime() - 10 * 60 * 1000);
    push("시계 역행 → false", shouldForceClose(open, now) === false);
  }

  // 7) 동일 시각(0ms 경과) → false (<, not <=)
  push("0ms 경과 → false", shouldForceClose(open, base) === false);

  return results;
}

if (
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module
) {
  const results = runTests();
  const failed = results.filter((r) => !r.passed);
  console.log(
    `maxDurationGuard.test: ${results.length - failed.length}/${results.length} passed`,
  );
  if (failed.length > 0) {
    console.error(failed);
    process.exit(1);
  }
}

// vitest 도입 시 자동 발견되는 describe/it 래퍼.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const describe: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const it: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const expect: any;
if (typeof describe === "function" && typeof it === "function") {
  describe("maxDurationGuard (R2)", () => {
    for (const r of runTests()) {
      it(r.name, () => {
        expect(r.passed, r.details ?? r.name).toBe(true);
      });
    }
  });
}
