/**
 * Phase B (R2) — YOLO 추론 주기 스케줄러 훅.
 *
 * 역할:
 *  - driver 훅이 "다음 tick 까지 몇 ms 를 쉴지" 를 본 훅에서 받아온다.
 *  - 시간대(낮/야간), motion 연동, 배터리 상태를 참고해 주기를 동적으로 결정.
 *  - 백그라운드 탭 스로틀링 대비 `shouldInferNow()` 헬퍼 — setInterval 이 OS 레벨에서
 *    1s 이하로 깎여도 마지막 실제 실행 시각 기준으로 ≥ nextTickMs × 0.8 경과했는지 판정.
 *
 * 결정 규칙 (설계서 §3.2 §4 그대로):
 *  - 22:00 ~ 06:00 (KST)         → "night"          : 30 000 ms
 *  - motion === false (idle)     → "idle-throttled" : 120 000 ms
 *  - 그 외(낮 + 움직임 있음)     → "day-active"     : 5 000 ms
 *  - 배터리 저전력(level < 0.2, charging=false) 은 위 값의 2 배로 증가.
 *    (iOS Safari 등 getBattery 미지원 시엔 기본값 그대로 사용)
 *
 * ⚠️ R2 변경점 (R1 QA M6):
 *  - `shouldInferNow` 가 driver 에서 dead code 였음. 설계서 §4 #7 백그라운드 탭 대응을 위해
 *    driver tick 선두에서 호출되도록 API 변경:
 *      · 인자 없음 (내부에서 performance.now 기반 경과 측정)
 *      · 내부 `lastInferAtRef` 를 함수 호출 성공 시 업데이트 → 다음 호출까지 간격 보장.
 *    driver 가 tick 선두에서 `if (!shouldInferNow()) return` 으로 가드 → 탭 숨김 복귀 후
 *    setInterval 폭발 방지.
 *
 * ⚠️ Dev 판단:
 *  - "낮/야간" 판정은 방송폰 로컬 타임존 기준. CATvisor 는 국내 서비스만이므로 별도의
 *    KST 강제 변환 없이 `getHours()` 사용. 타임존 해외 서비스 확장 시 TZ DB 필요.
 *  - `navigator.getBattery()` 는 비동기 Promise 지만 tick 마다 호출 시 오버헤드 크므로
 *    mount 시 1회 조회 → 이후 'chargingchange' / 'levelchange' 이벤트로 갱신.
 *  - `shouldInferNow` 의 경과 임계값은 `nextTickMs × 0.8` — 브라우저 타이머 jitter (±20%)
 *    흡수. 정확히 nextTickMs 만 허용하면 실제 OS 타이머가 약간 일찍 깨운 경우 쓸데없이
 *    한 tick 더 쉬는 낭비 발생.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** 기본 주기 상수 (ms). 외부 튜닝 가능하도록 export. */
export const TICK_DAY_ACTIVE_MS = 5_000;
export const TICK_NIGHT_MS = 30_000;
export const TICK_IDLE_THROTTLED_MS = 120_000;
/** 야간 시작/종료 시각 (24시간제). 22시 포함 ~ 06시 미포함. */
export const NIGHT_START_HOUR = 22;
export const NIGHT_END_HOUR = 6;
/** 배터리 저전력 판단 기준. */
export const BATTERY_LOW_LEVEL = 0.2;
/** shouldInferNow 경과 허용 ratio — 브라우저 타이머 jitter 흡수용 (nextTickMs × 0.8). */
export const TICK_ELAPSED_RATIO = 0.8;

export type SchedulerRegime = "day-active" | "night" | "idle-throttled";

export interface SchedulerArgs {
  /** driver 훅의 enabled 플래그와 동기화. false 면 battery 이벤트 리스너도 달지 않음. */
  enabled: boolean;
  /** useGlobalMotion 결과(옵셔널). undefined 면 "알 수 없음" → idle 스로틀 미적용. */
  motionActive?: boolean;
  /** 테스트용 시각 주입. 기본은 new Date(). */
  now?: () => Date;
  /** 테스트용 performance.now 주입. 기본은 performance.now 또는 Date.now 폴백. */
  monoNow?: () => number;
}

export interface SchedulerResult {
  /** 다음 tick 까지 대기 ms. */
  nextTickMs: number;
  /**
   * 지금 추론을 진행해야 하는지 판단 + 내부 lastInferAt 갱신.
   * - 첫 호출(lastInferAt=0) 이면 true + lastInferAt 세팅.
   * - 이후에는 경과 ms >= nextTickMs × TICK_ELAPSED_RATIO 이면 true + lastInferAt 갱신.
   * - 그 외 false (호출자는 tick 스킵).
   */
  shouldInferNow: () => boolean;
  /** 현재 결정된 regime — 디버그/로그용. */
  regime: SchedulerRegime;
}

/**
 * 시간대(낮/야간) 판정 — 22시 ~ 06시 미만을 야간으로 간주.
 * - 22, 23, 0, 1, 2, 3, 4, 5 시 → 야간.
 * - 6, 7, ..., 21 시 → 낮.
 */
export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

/**
 * 순수 함수 — 인자 기반으로 regime + tick ms 결정.
 * (훅 외부 테스트용으로 export)
 */
export function decideTick(params: {
  now: Date;
  motionActive?: boolean;
  batteryLow: boolean;
}): { regime: SchedulerRegime; nextTickMs: number } {
  const { now, motionActive, batteryLow } = params;
  const hour = now.getHours();

  let regime: SchedulerRegime;
  let baseMs: number;
  if (isNightHour(hour)) {
    regime = "night";
    baseMs = TICK_NIGHT_MS;
  } else if (motionActive === false) {
    // 낮이지만 움직임 없음이 명시됨 → 스로틀. (motionActive=undefined 면 이 분기 미적용)
    regime = "idle-throttled";
    baseMs = TICK_IDLE_THROTTLED_MS;
  } else {
    regime = "day-active";
    baseMs = TICK_DAY_ACTIVE_MS;
  }

  // 배터리 저전력 시 2배 느리게 — "절약 모드".
  const nextTickMs = batteryLow ? baseMs * 2 : baseMs;
  return { regime, nextTickMs };
}

/**
 * 순수 함수 — "지금 추론해야 하는가?" 판정 (테스트용 export).
 *
 * @param lastInferAtMs 마지막 추론 실행 시각 (performance.now 기준 ms). 0 이면 아직 없음.
 * @param nowMs         현재 시각 (performance.now 기준 ms).
 * @param nextTickMs    현재 regime 의 주기.
 * @returns true 면 추론 진행, false 면 스킵.
 */
export function decideShouldInferNow(
  lastInferAtMs: number,
  nowMs: number,
  nextTickMs: number,
): boolean {
  // 첫 호출 — 항상 진행.
  if (!lastInferAtMs || lastInferAtMs <= 0) return true;
  const elapsed = nowMs - lastInferAtMs;
  // 시계 역행 방어 (visibility 복귀 후 monoNow 가 reset 되는 경우 등).
  if (!Number.isFinite(elapsed) || elapsed < 0) return true;
  // jitter 흡수 — 요구 대기 시간 × 0.8 이상이면 허용.
  return elapsed >= nextTickMs * TICK_ELAPSED_RATIO;
}

/**
 * 배터리 상태 브라우저 API 래퍼. 지원 않는 브라우저에서는 조용히 false.
 */
interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
}
function getBatteryAsync(): Promise<BatteryLike | null> {
  if (typeof navigator === "undefined") return Promise.resolve(null);
  // 표준 타입에 없지만 일부 브라우저가 제공하는 비표준 API — unknown 캐스팅 경유.
  const nav = navigator as unknown as {
    getBattery?: () => Promise<BatteryLike>;
  };
  if (typeof nav.getBattery !== "function") return Promise.resolve(null);
  return nav.getBattery().catch(() => null);
}

/** performance.now 기본 구현 — 환경에 없으면 Date.now 폴백. */
function defaultMonoNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/**
 * Phase B 추론 주기 결정 훅.
 */
export function useBehaviorInferenceScheduler(
  args: SchedulerArgs,
): SchedulerResult {
  const { enabled, motionActive } = args;
  // 테스트용 주입 ref — args 변경이 effect deps 를 흔들지 않게 고정.
  // React 19 react-hooks/refs 규칙 준수: ref 할당은 useEffect 내부에서만.
  const nowRef = useRef<() => Date>(args.now ?? (() => new Date()));
  const monoNowRef = useRef<() => number>(args.monoNow ?? defaultMonoNow);
  useEffect(() => {
    nowRef.current = args.now ?? (() => new Date());
    monoNowRef.current = args.monoNow ?? defaultMonoNow;
  }, [args.now, args.monoNow]);

  // 마지막 추론 실행 시각 (performance.now 기준) — shouldInferNow 갱신 대상.
  const lastInferAtRef = useRef<number>(0);

  // 배터리 저전력 여부 — 상태로 두되 값 변경 시에만 리렌더.
  const [batteryLow, setBatteryLow] = useState<boolean>(false);
  // 현재 시각도 state — 1분마다 tick 해서 22:00/06:00 경계에서 nextTickMs 가 자동 갱신되게 함.
  const [wallClockTick, setWallClockTick] = useState<number>(0);

  /**
   * 배터리 리스너 장착 (enabled 일 때만).
   * - mount 시 1회 getBattery → 이후 level/charging 변화 이벤트로 업데이트.
   * - 미지원 브라우저(iOS Safari)는 조용히 기본값 false 유지.
   */
  useEffect(() => {
    if (!enabled) {
      setBatteryLow(false);
      lastInferAtRef.current = 0; // disabled 전환 시 리셋 → 재활성 시 첫 tick 즉시 진행.
      return;
    }
    let alive = true;
    let batteryRef: BatteryLike | null = null;
    const onChange = () => {
      if (!alive || !batteryRef) return;
      const low = batteryRef.level < BATTERY_LOW_LEVEL && !batteryRef.charging;
      setBatteryLow(low);
    };
    void getBatteryAsync().then((b) => {
      if (!alive) return;
      if (!b) return;
      batteryRef = b;
      onChange();
      b.addEventListener("levelchange", onChange);
      b.addEventListener("chargingchange", onChange);
    });
    return () => {
      alive = false;
      if (batteryRef) {
        batteryRef.removeEventListener("levelchange", onChange);
        batteryRef.removeEventListener("chargingchange", onChange);
      }
    };
  }, [enabled]);

  /**
   * 1분마다 wallClockTick 을 흔들어 22:00/06:00 경계 판정을 새로 수행.
   * - enabled 가 false 인 동안에는 interval 돌리지 않음 (배터리 절약).
   */
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      setWallClockTick((n) => (n + 1) % 1_000_000);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [enabled]);

  // ⚠️ Dev 판단: useMemo 내부에서 `nowRef.current()` 직접 호출은 react-hooks/refs 위반.
  //  대신 args.now 가 바뀔 때마다 wallClockTick 이 흔들리는 구조가 아니므로, motionActive/batteryLow
  //  변화 시점의 args.now 값을 재포착하도록 deps 에 args.now 를 직접 포함.
  const nowFnForMemo = args.now ?? (() => new Date());
  const { nextTickMs, regime } = useMemo(() => {
    return decideTick({
      now: nowFnForMemo(),
      motionActive,
      batteryLow,
    });
    // wallClockTick 은 1분마다 값이 바뀌어 memo 재평가를 유도.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionActive, batteryLow, wallClockTick]);

  // nextTickMs 최신값을 callback 에서 쓰기 위해 ref 동기화 (클로저 stale 방지).
  const nextTickMsRef = useRef<number>(nextTickMs);
  useEffect(() => {
    nextTickMsRef.current = nextTickMs;
  }, [nextTickMs]);

  const shouldInferNow = useCallback((): boolean => {
    if (!enabled) return false;
    const mono = monoNowRef.current;
    const nowMs = mono();
    const should = decideShouldInferNow(
      lastInferAtRef.current,
      nowMs,
      nextTickMsRef.current,
    );
    if (should) lastInferAtRef.current = nowMs;
    return should;
  }, [enabled]);

  return { nextTickMs, shouldInferNow, regime };
}
