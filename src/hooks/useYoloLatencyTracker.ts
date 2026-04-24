/**
 * Phase B (R7 §1 / R9 §4 / R10 §1) — YOLO inference latency 측정 전담 훅.
 *
 * 책임: stamp 받기 → 10개 링버퍼 (FIFO) → 2초 setInterval P50/P95 nearest-rank flush + prev-equal
 *  skip + enabled=false reset. Worker 와 독립.
 * 데이터 흐름: 1) sampling postMessage 직전 inferStartRef.current=performance.now() / 2) lifecycle
 *  result → recordResult(performance.now()) → delta 가드 (NaN/Infinity/음수 제외) push / 3) lifecycle
 *  error/dispose → invalidateStamp/clearBuffer / 4) ref (p50Ref/p95Ref) — driver healthRef 폴링 (R7 §2).
 */

"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { MutableRefObject } from "react";

/** 최근 N회 inference latency 링버퍼 용량. P50/P95 모두 본 버퍼에서 계산. */
const LATENCY_BUFFER_SIZE = 10;

/** 2초 주기 state flush — driver 의 health flush 와 동일 주기 (UI 동기화). */
const LATENCY_FLUSH_INTERVAL_MS = 2_000;

/** nearest-rank 분위수 계산. 빈 배열이면 null. q: 0.5=중앙값, 0.95=95분위. */
function computePercentile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(q * sorted.length) - 1);
  return sorted[idx];
}

/** lifecycle.enabled 와 동일 — disabled 시 내부 reset. */
export interface YoloLatencyTrackerArgs {
  enabled: boolean;
}

export interface YoloLatencyTrackerResult {
  /** sampling 이 postMessage 직전 `performance.now()` 기록. */
  inferStartRef: MutableRefObject<number | null>;
  /** lifecycle result → delta 계산 + 링버퍼 push + stamp 무효화. */
  recordResult: (nowMs: number) => void;
  /** lifecycle error → stamp 만 무효화 (링버퍼 유지). */
  invalidateStamp: () => void;
  /** lifecycle dispose → 새 세션 진입 시 stamp + 링버퍼 모두 초기화. */
  clearBuffer: () => void;
  /** dev 배지가 driver 경유로 읽음. 2s prev-equal skip. */
  inferLatencyP50Ms: number | null;
  inferLatencyP95Ms: number | null;
  /** R7 §2: driver healthRef 가 deps 없이 폴링용 ref 한 쌍. state 와 동일값. */
  latencyRefs: {
    p50Ref: Readonly<MutableRefObject<number | null>>;
    p95Ref: Readonly<MutableRefObject<number | null>>;
  };
}

/** latency 측정 단일 책임 훅 — sampling 이 stamp / lifecycle 이 record/invalidate/clear 호출. */
export function useYoloLatencyTracker(
  args: YoloLatencyTrackerArgs,
): YoloLatencyTrackerResult {
  const { enabled } = args;

  // ===== state (driver 경유 dev 배지가 표시) =====
  const [inferLatencyP50Ms, setInferLatencyP50Ms] = useState<number | null>(null);
  const [inferLatencyP95Ms, setInferLatencyP95Ms] = useState<number | null>(null);

  // ===== ref (sampling 이 쓰기 / lifecycle 이 메서드 호출) =====
  const inferStartRef = useRef<number | null>(null);
  const latencyBufferRef = useRef<number[]>([]);
  // R7 §2: driver healthRef 가 deps 없이 폴링용 ref 한 쌍 (state 와 동일 값, ref 라 deps 변화 0).
  const p50Ref = useRef<number | null>(null);
  const p95Ref = useRef<number | null>(null);

  // ===== 메서드 (lifecycle 이 호출) =====

  /** result 수신 시점에 호출 — delta 계산 + 링버퍼 push + stamp 무효화. */
  const recordResult = useCallback((nowMs: number): void => {
    const startedAt = inferStartRef.current;
    if (startedAt === null) return;
    const delta = nowMs - startedAt;
    // 가드: NaN / Infinity / 음수 (모두 측정 불가능 — 링버퍼 오염 방지).
    if (Number.isFinite(delta) && delta >= 0) {
      const buf = latencyBufferRef.current;
      buf.push(delta);
      if (buf.length > LATENCY_BUFFER_SIZE) buf.shift();
    }
    inferStartRef.current = null;
  }, []);

  /** error 수신 시점에 호출 — 링버퍼는 유지, stamp 만 무효화 (실패 시간을 측정값으로 넣지 않음). */
  const invalidateStamp = useCallback((): void => {
    inferStartRef.current = null;
  }, []);

  /** dispose 시점에 호출 — 새 세션 진입 시 stamp + 링버퍼 모두 초기화. */
  const clearBuffer = useCallback((): void => {
    inferStartRef.current = null;
    latencyBufferRef.current = [];
  }, []);

  // ===== 2초 주기 state flush (enabled 동안만 interval 유지) =====
  useEffect(() => {
    if (!enabled) {
      // disabled 전환: 링버퍼/stamp/ref/state 전부 reset.
      latencyBufferRef.current = [];
      inferStartRef.current = null;
      p50Ref.current = null;
      p95Ref.current = null;
      // R4 M1: React 19 baseline 은 eslint-disable (lifecycle 과 동일 정책, checklist §3.1).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInferLatencyP50Ms(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInferLatencyP95Ms(null);
      return;
    }
    const id = window.setInterval(() => {
      const buf = latencyBufferRef.current;
      const p50 = computePercentile(buf, 0.5);
      const p95 = computePercentile(buf, 0.95);
      // ref 는 매 tick 무조건 동기화 (driver healthRef 가 폴링).
      p50Ref.current = p50;
      p95Ref.current = p95;
      // state 는 prev-equal skip — 값 안 바뀌면 re-render 0.
      setInferLatencyP50Ms((prev) => (prev === p50 ? prev : p50));
      setInferLatencyP95Ms((prev) => (prev === p95 ? prev : p95));
    }, LATENCY_FLUSH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  // R7 §1: ref 한 쌍은 매 렌더 새 객체로 만들지 않도록 useMemo — driver effect deps 안정성 확보.
  const latencyRefs = useMemo(() => ({ p50Ref, p95Ref }), []);

  return {
    inferStartRef,
    recordResult,
    invalidateStamp,
    clearBuffer,
    inferLatencyP50Ms,
    inferLatencyP95Ms,
    latencyRefs,
  };
}
