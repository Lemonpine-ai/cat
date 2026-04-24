/**
 * Phase B (R8 §1 / R9 §1 / R10 §1) — driver health 측정 + isInferring 상태 단일 책임 훅.
 *
 * 분리: R7 driver 394 → R8 health 5영역 본 훅 → R9 옵션 C 부분 흡수 (markInferring + isInferring
 *  state) → R10 응축. driver 는 useMemo 반환에 driverHealth.isInferring/health forward.
 *
 * 데이터 흐름:
 *  1) sampling tick → bumpTick / lifecycle result → bumpSuccess / error · postMessage 실패 → bumpFailure.
 *  2) 2초 setInterval (enabled) 가 latencyRefs 폴링 + dirty 시 setHealth (prev-equal skip).
 *  3) lifecycle/sampling 이 markInferring(true|false) → setIsInferring 직접 (R7 §3 정신 유지).
 *  4) driver 가 enabled false 전환 시 resetForDisabled() → healthRef 초기화 + isInferring=false.
 *
 * 4 API: bumpTick / bumpSuccess / bumpFailure / markInferring (R9 흡수) / resetForDisabled.
 * 외부 호환: driver 의 ref-forward 패턴 (bump 3 + markInferring) — 본 훅 callback 이 useCallback
 *  deps [] stable 라 효과 동치. DiagBadge / Mount 시그니처 무변경.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

/** 2초 flush 주기 (ms) — driver 가 R7 까지 사용한 값과 동일 (UI 동기화). */
const HEALTH_FLUSH_INTERVAL_MS = 2_000;

/** health snapshot — driver 가 forward 하여 dev 배지가 표시. inferLatency*Ms: 최근 10회 P50/P95 (ms). */
export interface DriverHealthSnapshot {
  ticksTotal: number;
  inferSuccesses: number;
  inferFailures: number;
  lastBackendError: string | null;
  inferLatencyP50Ms: number | null;
  inferLatencyP95Ms: number | null;
}

/** latencyRefs: lifecycle 의 tracker latency ref 한 쌍 — 매 2초 tick 폴링. lifecycle 측 useMemo 안정. */
export interface UseDriverHealthArgs {
  enabled: boolean;
  latencyRefs: {
    p50Ref: Readonly<MutableRefObject<number | null>>;
    p95Ref: Readonly<MutableRefObject<number | null>>;
  };
}

/** R9 §1: isInferring/markInferring 흡수. driver 는 useMemo 반환에 driverHealth.isInferring forward. */
export interface UseDriverHealthResult {
  health: DriverHealthSnapshot;
  isInferring: boolean;
  markInferring: (v: boolean) => void;
  bumpTick: () => void;
  bumpSuccess: () => void;
  bumpFailure: (err: unknown) => void;
  resetForDisabled: () => void;
}

/** 초기 snapshot — useState/useRef/resetForDisabled 가 공유. */
const emptySnapshot = (): DriverHealthSnapshot => ({ ticksTotal: 0, inferSuccesses: 0, inferFailures: 0, lastBackendError: null, inferLatencyP50Ms: null, inferLatencyP95Ms: null });

/** driver health + isInferring 측정/상태 단일 책임 훅. */
export function useDriverHealth(args: UseDriverHealthArgs): UseDriverHealthResult {
  const { enabled, latencyRefs } = args;
  const [health, setHealth] = useState<DriverHealthSnapshot>(emptySnapshot);
  // R9 §1: isInferring 단일 소유 — driver useState → 본 훅 useState 이전.
  const [isInferring, setIsInferring] = useState<boolean>(false);
  const healthRef = useRef<DriverHealthSnapshot>(emptySnapshot());
  const healthDirtyRef = useRef<boolean>(false);
  // 누적/상태 콜백 (deps [] stable). lifecycle/sampling args 의 4 콜백 (bump 3 + markInferring) 으로 sweep.
  const bumpTick = useCallback((): void => {
    healthRef.current.ticksTotal += 1;
    healthDirtyRef.current = true;
  }, []);
  const bumpSuccess = useCallback((): void => {
    healthRef.current.inferSuccesses += 1;
    healthDirtyRef.current = true;
  }, []);
  const bumpFailure = useCallback((err: unknown): void => {
    healthRef.current.inferFailures += 1;
    healthRef.current.lastBackendError = err instanceof Error ? err.message : String(err);
    healthDirtyRef.current = true;
  }, []);
  // R9 §1: markInferring 흡수 — setIsInferring 단일 호출 지점 (R7 §3 정신 유지).
  const markInferring = useCallback((v: boolean): void => {
    setIsInferring(v);
  }, []);
  // R4 MINOR-R4-d: OFF/ON 토글 반복 시 이전 세션 ticksTotal 누적 + isInferring true 잔존 방지.
  const resetForDisabled = useCallback((): void => {
    healthRef.current = emptySnapshot();
    healthDirtyRef.current = true;
    setIsInferring(false);
  }, []);
  // R8 §1.5: deps [enabled, latencyRefs] — latencyRefs lifecycle useMemo 안정 → effect 재실행 0.
  useEffect(() => {
    if (!enabled) return;
    const { p50Ref, p95Ref } = latencyRefs;
    const id = window.setInterval(() => {
      const nextP50 = p50Ref.current;
      const nextP95 = p95Ref.current;
      healthRef.current.inferLatencyP50Ms = nextP50;
      healthRef.current.inferLatencyP95Ms = nextP95;
      if (!healthDirtyRef.current) {
        // bump 가 없었어도 latency 변화만 있으면 setHealth (prev-equal skip).
        setHealth((prev) => prev.inferLatencyP50Ms === nextP50 && prev.inferLatencyP95Ms === nextP95
          ? prev : { ...healthRef.current });
        return;
      }
      healthDirtyRef.current = false;
      setHealth({ ...healthRef.current });
    }, HEALTH_FLUSH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled, latencyRefs]);
  return { health, isInferring, markInferring, bumpTick, bumpSuccess, bumpFailure, resetForDisabled };
}
