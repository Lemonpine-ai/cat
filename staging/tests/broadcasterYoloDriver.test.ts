/**
 * Phase B (R2) — broadcasterYoloDriver 시나리오 테스트 (단위 수준).
 *
 * ⚠️ R2 변경점:
 *  - C1 대응 — 시뮬레이터의 `stepDetection` 을 `confirmDetection` 3상태 switch 로 재작성.
 *  - "단발 오탐 → 확정 유지" 회귀 시나리오 추가 (R1 버그 재발 방지).
 *  - retry 시나리오 (지수 백오프) 는 순수 함수 `computeBackoffMs` 로 검증.
 *
 * ⚠️ Dev 판단:
 *  - React 훅 본체는 jsdom + testing-library 필요. 현 프로젝트는 vitest/jest 미도입
 *    상태(package.json 기준). 설계서 §7 "통합 테스트" 의 취지인 "mock worker →
 *    detection 주입 → confirmed → logger 호출 시퀀스" 중 "순수 로직 부분"(확정 + 30분 guard)
 *    을 훅을 띄우지 않고 시뮬레이션. 훅 자체의 render/effect 검증은 러너 도입 후 R3+ 에서 보강.
 */

import {
  confirmDetection,
  NONE_KEY,
} from "../lib/behavior/confirmFrames";
import {
  shouldForceClose,
  type OpenEventLite,
} from "../lib/behavior/maxDurationGuard";
import {
  computeBackoffMs,
  canRetry,
  MAX_RETRIES,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
} from "../lib/behavior/yoloRetryPolicy";

export interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

/**
 * 간단한 driver 시뮬레이터 — R2 handleResult switch(status) 를 재현.
 *
 * 3상태 분기:
 *  - pending  → 상태 유지 (transitions 추가 X).
 *  - cleared  → current=null 전환 (이전이 null 아니었을 때만).
 *  - confirmed → current=key 전환 (이전과 달랐을 때만).
 */
interface SimState {
  history: string[];
  currentBehavior: string | null;
  openEvent: OpenEventLite | null;
  transitions: Array<{ at: number; to: string | null }>;
}

function stepDetection(
  state: SimState,
  incomingKey: string,
  windowSize: number,
  nowMs: number,
): SimState {
  const result = confirmDetection(state.history, incomingKey, windowSize);
  let current = state.currentBehavior;
  let openEvent = state.openEvent;
  const transitions = [...state.transitions];

  switch (result.status) {
    case "pending":
      // 상태 유지 — transitions 추가 없음.
      break;
    case "cleared":
      if (current !== null) {
        current = null;
        openEvent = null;
        transitions.push({ at: nowMs, to: null });
      }
      break;
    case "confirmed":
      if (current !== result.key) {
        current = result.key;
        openEvent = { startedAt: new Date(nowMs), classKey: result.key };
        transitions.push({ at: nowMs, to: result.key });
      }
      break;
  }
  return {
    history: result.newHistory,
    currentBehavior: current,
    openEvent,
    transitions,
  };
}

/** driver.tick 내부의 30분 guard 리셋 재현. */
function applyMaxDurationGuard(state: SimState, nowMs: number): SimState {
  if (shouldForceClose(state.openEvent, new Date(nowMs))) {
    return {
      history: [],
      currentBehavior: null,
      openEvent: null,
      transitions: [
        ...state.transitions,
        { at: nowMs, to: null }, // 강제 close 통지
      ],
    };
  }
  return state;
}

export function runTests(): TestResult[] {
  const r: TestResult[] = [];
  const push = (name: string, passed: boolean, details?: string) =>
    r.push({ name, passed, details });

  // 시나리오 1: 3프레임 sleeping → 확정 후 logger 에 sleeping 통지 1회.
  {
    let s: SimState = {
      history: [],
      currentBehavior: null,
      openEvent: null,
      transitions: [],
    };
    for (let i = 0; i < 3; i++) {
      s = stepDetection(s, "sleeping", 3, i * 5000);
    }
    push(
      "3 프레임 sleeping → 확정 전환 1회",
      s.currentBehavior === "sleeping" &&
        s.transitions.length === 1 &&
        s.transitions[0].to === "sleeping",
      JSON.stringify(s.transitions),
    );
  }

  // 시나리오 2: A→A→B → pending (혼재), current 변경 없음
  {
    let s: SimState = {
      history: [],
      currentBehavior: null,
      openEvent: null,
      transitions: [],
    };
    s = stepDetection(s, "eating", 3, 0);
    s = stepDetection(s, "eating", 3, 5000);
    s = stepDetection(s, "sleeping", 3, 10000);
    push(
      "A→A→B pending (혼재) — 확정 없음",
      s.currentBehavior === null && s.transitions.length === 0,
    );
  }

  // 시나리오 3 (R2 핵심 회귀 fixture): sleeping 확정 상태에서 단발 오탐(eating) 1번.
  //   R1 에서는 confirmedKey=null 반환으로 sleeping 이 조기 close 되는 버그.
  //   R2: pending 반환 → 호출부 상태 유지 → sleeping 그대로 남아야 함.
  {
    let s: SimState = {
      history: [],
      currentBehavior: null,
      openEvent: null,
      transitions: [],
    };
    // sleeping×3 으로 확정.
    s = stepDetection(s, "sleeping", 3, 0);
    s = stepDetection(s, "sleeping", 3, 5000);
    s = stepDetection(s, "sleeping", 3, 10000);
    // 단발 오탐 eating 1번 → history=[sleeping, sleeping, eating] → pending
    s = stepDetection(s, "eating", 3, 15000);
    push(
      "R2 회귀: 단발 오탐 1건 후에도 sleeping 유지 (pending)",
      s.currentBehavior === "sleeping" &&
        s.transitions.length === 1 && // 초기 sleeping 진입만
        s.transitions[0].to === "sleeping",
      JSON.stringify(s),
    );
    // 후속 sleeping 2번 → 다시 sleeping×3 으로 confirmed (같은 키이므로 transition 추가 없음)
    s = stepDetection(s, "sleeping", 3, 20000);
    s = stepDetection(s, "sleeping", 3, 25000);
    push(
      "R2 회귀: 단발 오탐 복귀 후에도 sleeping 1회 유지 (중복 INSERT 방지)",
      s.currentBehavior === "sleeping" && s.transitions.length === 1,
    );
  }

  // 시나리오 4: sleeping 5프레임 지속 중 30분 초과 → 강제 close → 다시 3프레임 후 새 row.
  {
    let s: SimState = {
      history: [],
      currentBehavior: null,
      openEvent: null,
      transitions: [],
    };
    for (let i = 0; i < 3; i++) {
      s = stepDetection(s, "sleeping", 3, i * 5000);
    }
    s = stepDetection(s, "sleeping", 3, 15000);
    s = stepDetection(s, "sleeping", 3, 20000);

    // openEvent.startedAt = 3번째 확정 프레임의 nowMs(=10000). 30분+1 추가하면 경과 ≥ 30분.
    const tAfter = 10000 + 30 * 60 * 1000 + 1;
    s = applyMaxDurationGuard(s, tAfter);
    push(
      "30분 초과 → 강제 close 통지",
      s.currentBehavior === null &&
        s.openEvent === null &&
        s.transitions[s.transitions.length - 1].to === null,
    );

    s = stepDetection(s, "sleeping", 3, tAfter + 5000);
    s = stepDetection(s, "sleeping", 3, tAfter + 10000);
    s = stepDetection(s, "sleeping", 3, tAfter + 15000);
    const last = s.transitions[s.transitions.length - 1];
    push(
      "강제 close 후 재확정 시 새 sleeping 전환",
      s.currentBehavior === "sleeping" && last.to === "sleeping",
    );
  }

  // 시나리오 5: NONE×3 (현재 없던 상태) → cleared 이지만 전환 추가 없음 (current 는 이미 null)
  {
    let s: SimState = {
      history: [],
      currentBehavior: null,
      openEvent: null,
      transitions: [],
    };
    for (let i = 0; i < 3; i++) {
      s = stepDetection(s, NONE_KEY, 3, i * 5000);
    }
    push(
      "NONE×3 (current=null 이미) → cleared 인데 transitions 없음",
      s.currentBehavior === null && s.transitions.length === 0,
    );
  }

  // 시나리오 6: grooming 확정 → NONE×3 → null 전환 1회 (logger 가 close)
  {
    let s: SimState = {
      history: [],
      currentBehavior: null,
      openEvent: null,
      transitions: [],
    };
    for (let i = 0; i < 3; i++) s = stepDetection(s, "grooming", 3, i * 5000);
    for (let i = 0; i < 3; i++)
      s = stepDetection(s, NONE_KEY, 3, (i + 3) * 5000);
    push(
      "grooming → NONE×3 → null 전환 2회 (진입 + 종료)",
      s.currentBehavior === null &&
        s.transitions.length === 2 &&
        s.transitions[0].to === "grooming" &&
        s.transitions[1].to === null,
    );
  }

  // 시나리오 7: 야간 윈도우(2) — 더 빨리 확정.
  {
    let s: SimState = {
      history: [],
      currentBehavior: null,
      openEvent: null,
      transitions: [],
    };
    s = stepDetection(s, "sleeping", 2, 0);
    s = stepDetection(s, "sleeping", 2, 30000);
    push(
      "야간 윈도우=2 2프레임 확정",
      s.currentBehavior === "sleeping" && s.transitions.length === 1,
    );
  }

  // === R2 retry 정책 검증 (yoloRetryPolicy 순수 함수) ===

  // 시나리오 8: 지수 백오프 — 30/60/120/240/480 초
  {
    push("backoff attempt=1 → 30s", computeBackoffMs(1) === RETRY_BASE_MS);
    push("backoff attempt=2 → 60s", computeBackoffMs(2) === 60_000);
    push("backoff attempt=3 → 120s", computeBackoffMs(3) === 120_000);
    push("backoff attempt=4 → 240s", computeBackoffMs(4) === 240_000);
    push("backoff attempt=5 → 480s", computeBackoffMs(5) === RETRY_MAX_MS);
  }

  // 시나리오 9: attempt 가 상한을 넘어도 clamp
  {
    push(
      "backoff attempt=100 → RETRY_MAX_MS clamp",
      computeBackoffMs(100) === RETRY_MAX_MS,
    );
    push("backoff attempt=0 → 0 (방어)", computeBackoffMs(0) === 0);
    push("backoff attempt=-5 → 0 (방어)", computeBackoffMs(-5) === 0);
  }

  // 시나리오 10: canRetry — MAX_RETRIES 내에서만 true
  {
    push("canRetry(1) === true", canRetry(1) === true);
    push("canRetry(MAX_RETRIES) === true", canRetry(MAX_RETRIES) === true);
    push(
      "canRetry(MAX_RETRIES+1) === false",
      canRetry(MAX_RETRIES + 1) === false,
    );
  }

  return r;
}

if (
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module
) {
  const results = runTests();
  const failed = results.filter((x) => !x.passed);
  console.log(
    `broadcasterYoloDriver.test: ${results.length - failed.length}/${results.length} passed`,
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
  describe("broadcasterYoloDriver (R2 시뮬레이션 + retry)", () => {
    for (const r of runTests()) {
      it(r.name, () => {
        expect(r.passed, r.details ?? r.name).toBe(true);
      });
    }
  });
}
