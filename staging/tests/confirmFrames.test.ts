/**
 * Phase B (R2) — confirmDetection 3상태 union 단위 테스트.
 *
 * ⚠️ R2 변경점:
 *  - R1 의 `.confirmedKey` 접근 → R2 의 `.status` switch 분기로 전면 재작성.
 *  - 테스트 8건 → 10건으로 확장 (설계서 §1.4 엣지 매트릭스).
 *
 * ⚠️ Dev 판단 (vitest/jest 미설치):
 *  - 프로젝트에 vitest/jest 가 아직 정식 편입되지 않음 (package.json 기준).
 *  - runner-agnostic `runTests()` 배열 export 유지 — vitest 도입 시 describe/it 래퍼 한 겹만 추가.
 *  - 순수 node/ts 실행으로도 검증 가능 (`node --loader ts-node/esm ...`).
 */

import {
  confirmDetection,
  NONE_KEY,
  type ConfirmResult,
} from "../lib/behavior/confirmFrames";

export interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

/** status 기반 assertion 헬퍼 — details 기록을 간결하게. */
function isConfirmed(r: ConfirmResult, expectedKey: string): boolean {
  return r.status === "confirmed" && r.key === expectedKey;
}
function isPending(r: ConfirmResult): boolean {
  return r.status === "pending";
}
function isCleared(r: ConfirmResult): boolean {
  return r.status === "cleared";
}

/** 전체 테스트 실행 — 호출자가 failed>0 체크. */
export function runTests(): TestResult[] {
  const results: TestResult[] = [];
  const push = (name: string, passed: boolean, details?: string) =>
    results.push({ name, passed, details });

  // 1) pending: 창 미달 (history=[], incoming="sleeping", win=3)
  {
    const r = confirmDetection([], "sleeping", 3);
    push(
      "pending: 창 미달",
      isPending(r) && r.newHistory.length === 1,
      JSON.stringify(r),
    );
  }

  // 2) pending: 혼재 (A→A→B 마지막 호출 직전 상태)
  {
    let h: string[] = [];
    const r1 = confirmDetection(h, "eating", 3); h = r1.newHistory;
    const r2 = confirmDetection(h, "eating", 3); h = r2.newHistory;
    const r3 = confirmDetection(h, "sleeping", 3); // eating, eating, sleeping → 혼재
    push(
      "pending: 혼재",
      isPending(r1) && isPending(r2) && isPending(r3),
      JSON.stringify(r3),
    );
  }

  // 3) pending: NONE 1개 섞임 (sleeping, sleeping, NONE → 혼재)
  {
    let h: string[] = [];
    const r1 = confirmDetection(h, "sleeping", 3); h = r1.newHistory;
    const r2 = confirmDetection(h, "sleeping", 3); h = r2.newHistory;
    const r3 = confirmDetection(h, NONE_KEY, 3);
    push(
      "pending: NONE 1개 섞임",
      isPending(r3) && r3.newHistory.length === 3,
      JSON.stringify(r3),
    );
  }

  // 4) confirmed: 최초 충족 (A→A→A, win=3)
  {
    let h: string[] = [];
    const r1 = confirmDetection(h, "sleeping", 3); h = r1.newHistory;
    const r2 = confirmDetection(h, "sleeping", 3); h = r2.newHistory;
    const r3 = confirmDetection(h, "sleeping", 3);
    push(
      "confirmed: 최초 충족 (A→A→A)",
      isPending(r1) && isPending(r2) && isConfirmed(r3, "sleeping"),
    );
  }

  // 5) confirmed: 클래스 전환 (eating confirmed → sleeping 3연속 → sleeping confirmed)
  {
    let h: string[] = [];
    // 먼저 eating 확정.
    h = confirmDetection(h, "eating", 3).newHistory;
    h = confirmDetection(h, "eating", 3).newHistory;
    h = confirmDetection(h, "eating", 3).newHistory; // confirmed eating
    // sleeping 3연속.
    const r4 = confirmDetection(h, "sleeping", 3); h = r4.newHistory; // eating,eating,sleeping → pending
    const r5 = confirmDetection(h, "sleeping", 3); h = r5.newHistory; // eating,sleeping,sleeping → pending
    const r6 = confirmDetection(h, "sleeping", 3); // sleeping×3 → confirmed
    push(
      "confirmed: 클래스 전환",
      isPending(r4) && isPending(r5) && isConfirmed(r6, "sleeping"),
    );
  }

  // 6) cleared: NONE × windowSize (행동 없음 확정)
  {
    let h: string[] = [];
    const r1 = confirmDetection(h, NONE_KEY, 3); h = r1.newHistory;
    const r2 = confirmDetection(h, NONE_KEY, 3); h = r2.newHistory;
    const r3 = confirmDetection(h, NONE_KEY, 3);
    push(
      "cleared: NONE × windowSize",
      isPending(r1) && isPending(r2) && isCleared(r3) && r3.newHistory.length === 3,
    );
  }

  // 7) cleared → confirmed 전환 (NONE×3 후 sleeping×3)
  {
    let h: string[] = [];
    h = confirmDetection(h, NONE_KEY, 3).newHistory;
    h = confirmDetection(h, NONE_KEY, 3).newHistory;
    h = confirmDetection(h, NONE_KEY, 3).newHistory; // cleared
    const r1 = confirmDetection(h, "sleeping", 3); h = r1.newHistory; // NONE,NONE,sleeping → pending
    const r2 = confirmDetection(h, "sleeping", 3); h = r2.newHistory; // NONE,sleeping,sleeping → pending
    const r3 = confirmDetection(h, "sleeping", 3); // sleeping×3 → confirmed
    push(
      "cleared → confirmed 전환",
      isPending(r1) && isPending(r2) && isConfirmed(r3, "sleeping"),
    );
  }

  // 8) confirmed → pending (혼재로 떨어짐) — 호출부는 "현재 상태 유지" 해야 함을 문서화
  //     (driver 통합 테스트에서 currentBehavior 유지 검증은 broadcasterYoloDriver.test.ts 시나리오로)
  {
    const h: string[] = ["sleeping", "sleeping", "sleeping"]; // confirmed 직후 state
    const r = confirmDetection(h, "eating", 3); // sleeping,sleeping,eating → pending
    push(
      "confirmed 후 pending 복귀 (호출부 상태 유지 필요)",
      isPending(r),
      JSON.stringify(r),
    );
  }

  // 9) windowSize=1 경계 (즉시 확정 — 첫 프레임부터 확정 가능)
  {
    const r = confirmDetection([], "walking", 1);
    push("windowSize=1 즉시 확정", isConfirmed(r, "walking"));
    const r2 = confirmDetection([], NONE_KEY, 1);
    push("windowSize=1 NONE 은 cleared", isCleared(r2));
  }

  // 10) windowSize < 1 throw
  {
    let threw = false;
    try {
      confirmDetection([], "x", 0);
    } catch {
      threw = true;
    }
    push("windowSize < 1 → throw", threw);
  }

  // 11) 입력 불변 (history mutation 방지)
  {
    const input: string[] = ["eating", "eating"];
    const frozen = [...input];
    confirmDetection(input, "eating", 3);
    push(
      "history 입력 불변",
      input.length === frozen.length && input.every((v, i) => v === frozen[i]),
    );
  }

  // 12) 야간 윈도우=2 빠른 확정
  {
    let h: string[] = [];
    const r1 = confirmDetection(h, "grooming", 2); h = r1.newHistory;
    const r2 = confirmDetection(h, "grooming", 2);
    push(
      "window=2 (야간) A→A 즉시 확정",
      isPending(r1) && isConfirmed(r2, "grooming"),
    );
  }

  return results;
}

// Node 직접 실행 시 한 줄 요약 출력.
if (
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module
) {
  const results = runTests();
  const failed = results.filter((r) => !r.passed);
  console.log(
    `confirmFrames.test: ${results.length - failed.length}/${results.length} passed`,
  );
  if (failed.length > 0) {
    console.error(failed);
    process.exit(1);
  }
}

// vitest 도입 시 자동 발견되는 describe/it 래퍼 — typeof 검사로 non-vitest 환경에선 skip.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const describe: any; // vitest 가 주입하는 글로벌 (타입 import 는 R3 에서 결정).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const it: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const expect: any;
if (typeof describe === "function" && typeof it === "function") {
  describe("confirmDetection (R2 3상태)", () => {
    for (const r of runTests()) {
      it(r.name, () => {
        expect(r.passed, r.details ?? r.name).toBe(true);
      });
    }
  });
}
