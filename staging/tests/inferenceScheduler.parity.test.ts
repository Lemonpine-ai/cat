/**
 * Phase B (R2) — useBehaviorInferenceScheduler 의 순수 함수 parity 테스트.
 *
 * 검증:
 *  - `decideTick`: 22:00 / 06:00 경계, motion active/inactive, 배터리 저전력 곱연산.
 *  - `decideShouldInferNow` (R2 M6 신규): 경과 ms × 0.8 임계값 판정 + 시계 역행 방어.
 *
 * ⚠️ R2 변경점:
 *  - driver 가 tick 선두에서 `shouldInferNow()` 를 실제 호출. 백그라운드 탭 스로틀링으로
 *    setInterval 이 폭발해도 경과 시간 미달이면 스킵.
 *
 * ⚠️ Dev 판단: TS 에서 완전히 결정적으로 검증.
 */

import {
  decideTick,
  decideShouldInferNow,
  isNightHour,
  TICK_DAY_ACTIVE_MS,
  TICK_NIGHT_MS,
  TICK_IDLE_THROTTLED_MS,
  TICK_ELAPSED_RATIO,
} from "../hooks/useBehaviorInferenceScheduler";

export interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

/** 특정 "시:분" (로컬) 을 갖는 Date 생성. */
function atHour(h: number, m: number = 0): Date {
  const d = new Date(2026, 3, 24, h, m, 0, 0); // 월=3 → 4월, 일=24
  return d;
}

export function runTests(): TestResult[] {
  const r: TestResult[] = [];
  const push = (name: string, passed: boolean, details?: string) =>
    r.push({ name, passed, details });

  // -- isNightHour boundary --
  push("isNightHour(21) === false", isNightHour(21) === false);
  push("isNightHour(22) === true", isNightHour(22) === true);
  push("isNightHour(0) === true", isNightHour(0) === true);
  push("isNightHour(5) === true", isNightHour(5) === true);
  push("isNightHour(6) === false", isNightHour(6) === false);
  push("isNightHour(7) === false", isNightHour(7) === false);

  // -- day-active (motion 유/미지정) --
  {
    const d = decideTick({ now: atHour(12, 0), motionActive: true, batteryLow: false });
    push(
      "낮 + motion=true → day-active 5000ms",
      d.regime === "day-active" && d.nextTickMs === TICK_DAY_ACTIVE_MS,
      JSON.stringify(d),
    );
  }
  {
    const d = decideTick({ now: atHour(12, 0), motionActive: undefined, batteryLow: false });
    push(
      "낮 + motion=undefined → day-active 5000ms",
      d.regime === "day-active" && d.nextTickMs === TICK_DAY_ACTIVE_MS,
    );
  }

  // -- idle-throttled (낮 + motion=false) --
  {
    const d = decideTick({ now: atHour(14, 30), motionActive: false, batteryLow: false });
    push(
      "낮 + motion=false → idle-throttled 120000ms",
      d.regime === "idle-throttled" && d.nextTickMs === TICK_IDLE_THROTTLED_MS,
    );
  }

  // -- night (22:00 경계) --
  {
    const d = decideTick({ now: atHour(21, 59), motionActive: true, batteryLow: false });
    push(
      "21:59 직전 → day-active",
      d.regime === "day-active" && d.nextTickMs === TICK_DAY_ACTIVE_MS,
    );
  }
  {
    const d = decideTick({ now: atHour(22, 0), motionActive: true, batteryLow: false });
    push(
      "22:00 정각 → night",
      d.regime === "night" && d.nextTickMs === TICK_NIGHT_MS,
    );
  }
  {
    const d = decideTick({ now: atHour(5, 59), motionActive: true, batteryLow: false });
    push(
      "05:59 → night",
      d.regime === "night" && d.nextTickMs === TICK_NIGHT_MS,
    );
  }
  {
    const d = decideTick({ now: atHour(6, 0), motionActive: true, batteryLow: false });
    push(
      "06:00 정각 → day-active",
      d.regime === "day-active" && d.nextTickMs === TICK_DAY_ACTIVE_MS,
    );
  }

  // -- 배터리 저전력 × 2 배 --
  {
    const d = decideTick({ now: atHour(12, 0), motionActive: true, batteryLow: true });
    push(
      "낮 + batteryLow → 10000ms",
      d.regime === "day-active" && d.nextTickMs === TICK_DAY_ACTIVE_MS * 2,
    );
  }
  {
    const d = decideTick({ now: atHour(23, 0), motionActive: true, batteryLow: true });
    push(
      "야간 + batteryLow → 60000ms",
      d.regime === "night" && d.nextTickMs === TICK_NIGHT_MS * 2,
    );
  }
  {
    const d = decideTick({ now: atHour(14, 0), motionActive: false, batteryLow: true });
    push(
      "idle + batteryLow → 240000ms",
      d.regime === "idle-throttled" &&
        d.nextTickMs === TICK_IDLE_THROTTLED_MS * 2,
    );
  }

  // -- night 우선순위: night 시간대에는 motion=false 여도 night 유지 --
  {
    const d = decideTick({ now: atHour(23, 0), motionActive: false, batteryLow: false });
    push(
      "야간이면 motion=false 여도 night",
      d.regime === "night" && d.nextTickMs === TICK_NIGHT_MS,
    );
  }

  // === R2 M6: decideShouldInferNow 경과 시간 판정 ===

  // 첫 호출 (lastInferAt=0) → 항상 true
  push(
    "shouldInferNow: 첫 호출(lastInferAt=0) → true",
    decideShouldInferNow(0, 10_000, 5_000) === true,
  );

  // 경과 정확히 nextTickMs × 0.8 (=4000ms) → true
  push(
    "shouldInferNow: 경과=ratio × nextTickMs → true",
    decideShouldInferNow(1_000, 1_000 + 5_000 * TICK_ELAPSED_RATIO, 5_000) === true,
  );

  // 경과 < nextTickMs × 0.8 (=3999ms) → false
  push(
    "shouldInferNow: 경과 < ratio → false (스킵)",
    decideShouldInferNow(1_000, 1_000 + 3_999, 5_000) === false,
  );

  // 경과 > nextTickMs (=6000ms, 정상 tick) → true
  push(
    "shouldInferNow: 경과 > nextTickMs → true",
    decideShouldInferNow(1_000, 7_000, 5_000) === true,
  );

  // 시계 역행 (now < lastInferAt) → true (방어)
  push(
    "shouldInferNow: 시계 역행 → true (재진입 허용)",
    decideShouldInferNow(10_000, 5_000, 5_000) === true,
  );

  // 백그라운드 탭 스로틀링 시뮬레이션 — setInterval 이 1000ms 로 깎였는데 nextTickMs=5000
  //   첫 호출 → true, 두번째 호출 (경과 1000ms) → false, ... 네번째 호출 (경과 4000ms) → true.
  {
    // ⚠️ `decideShouldInferNow` 는 `lastInferAt <= 0` 일 때 "첫 호출" 로 true 반환.
    //  실제 driver 는 performance.now 기반이라 항상 > 0. 시뮬레이션 시 monoValues 를
    //  1000ms 부터 시작해 sentinel 충돌을 회피한다. 첫 호출 시 last=0 (unset) 이므로
    //  true, 이후 last = 1000 업데이트.
    let last = 0;
    const monoValues = [1_000, 2_000, 3_000, 4_000, 5_000];
    const decisions = monoValues.map((now) => {
      const ok = decideShouldInferNow(last, now, 5_000);
      if (ok) last = now;
      return ok;
    });
    push(
      "shouldInferNow: 1Hz 폭발 → 4초에 1번만 허용",
      // 0ms: true (첫 호출), 1000/2000/3000ms: false, 4000ms: true
      decisions[0] === true &&
        decisions[1] === false &&
        decisions[2] === false &&
        decisions[3] === false &&
        decisions[4] === true,
      JSON.stringify(decisions),
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
    `inferenceScheduler.parity.test: ${results.length - failed.length}/${results.length} passed`,
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
  describe("inferenceScheduler (R2 decideTick + decideShouldInferNow)", () => {
    for (const r of runTests()) {
      it(r.name, () => {
        expect(r.passed, r.details ?? r.name).toBe(true);
      });
    }
  });
}
