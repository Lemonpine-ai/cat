/**
 * Phase B (R3~R10) — 방송폰 YOLO 추론 드라이버 훅 (compose).
 *
 * 합성: lifecycle (worker/retry) + sampling (tick) + driverHealth (5영역+isInferring+4 콜백) +
 *  Phase A logger 주입. handleResult (confirmFrames 3상태) + onBeforeInfer (30분 guard) +
 *  onHidden 만 driver 본체. 외부 시그니처 (DriverArgs/DriverResult) 무변경.
 * ref-forward (R9 §2): bump 3 + markInferring 4 콜백을 ref 우회로 lifecycle/sampling 에 전달
 *  (useDriverHealth ↔ lifecycle 순환 의존 해소). 패턴 안내: staging/docs/phase_b_ref_forward_pattern.md
 * 안전성 (CLAUDE.md #2): 30분 초과 → currentBehavior=null → logger close → 재확정 시 새 row.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { BehaviorDetection } from "../types/behavior";
import { confirmDetection, NONE_KEY } from "../lib/behavior/confirmFrames";
import {
  shouldForceClose,
  type OpenEventLite,
} from "../lib/behavior/maxDurationGuard";
import {
  useBehaviorInferenceScheduler,
  type SchedulerRegime,
} from "./useBehaviorInferenceScheduler";
import { useBehaviorEventLogger } from "./useBehaviorEventLogger";
import {
  useYoloWorkerLifecycle,
  type InitStatus,
  type WorkerBackend,
} from "./useYoloWorkerLifecycle";
import { useYoloSampling } from "./useYoloSampling";
import { useDriverHealth, type DriverHealthSnapshot } from "./useDriverHealth";

/** 낮 시간대 확정 윈도우 (프레임 수). */
const CONFIRM_FRAMES_DAY = 3;
/** 야간 시간대 확정 윈도우 (샘플링 느리므로 완화). */
const CONFIRM_FRAMES_NIGHT = 2;
/** avgConfidence 평균 윈도우 (최근 N프레임). */
const AVG_CONF_WINDOW = 3;

// R3: InitStatus 는 lifecycle 훅에서 정의 — 호환 재export.
export type { InitStatus } from "./useYoloWorkerLifecycle";
// R8 §1: DriverHealth 는 useDriverHealth 의 DriverHealthSnapshot 으로 일원화 (외부 호환).
export type DriverHealth = DriverHealthSnapshot;

export interface DriverArgs {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** flag ON + 방송 중 + homeId/cameraId 모두 충족 시 true. */
  enabled: boolean;
  homeId: string | null;
  cameraId: string | null;
  identifiedCatId?: string | null;
  supabaseClient?: SupabaseClient;
  /** useGlobalMotion 결과 (옵셔널) — scheduler 에 전달. */
  motionActive?: boolean;
}

export interface DriverResult {
  currentBehavior: BehaviorDetection | null;
  backend: WorkerBackend;
  isInferring: boolean;
  lastDetections: BehaviorDetection[];
  regime: SchedulerRegime;
  health: DriverHealth;
  /** ONNX 초기화 상태. "failed" 면 5회 재시도 모두 소진. */
  initStatus: InitStatus;
  /** 현재까지 누적 retry 횟수 (0..MAX_RETRIES). */
  retryAttempt: number;
}

/** 방송폰 전용 YOLO 추론 드라이버 — lifecycle + sampling + health compose. */
export function useBroadcasterYoloDriver(args: DriverArgs): DriverResult {
  const {
    videoRef,
    enabled,
    homeId,
    cameraId,
    identifiedCatId,
    supabaseClient,
    motionActive,
  } = args;

  // ===== 1) scheduler =====
  const { nextTickMs, regime, shouldInferNow } = useBehaviorInferenceScheduler({
    enabled,
    motionActive,
  });

  // ===== 2) 공개 state (health/isInferring → driverHealth 단일 소유) =====
  const [currentBehavior, setCurrentBehavior] =
    useState<BehaviorDetection | null>(null);
  const [lastDetections, setLastDetections] = useState<BehaviorDetection[]>([]);
  const [avgConfidence, setAvgConfidence] = useState<number | undefined>(
    undefined,
  );

  // ===== 3) 내부 ref =====
  const historyRef = useRef<string[]>([]);
  const confWindowRef = useRef<number[]>([]);
  // R4 MAJOR-R4-B: openEventRef.startedAt = "확정 감지 시점" (DB started_at 과 수백 ms 차이) — 30분 가드 판정 기준.
  const openEventRef = useRef<OpenEventLite | null>(null);
  const currentBehaviorRef = useRef<BehaviorDetection | null>(null);
  const regimeRef = useRef<SchedulerRegime>(regime);
  const frameIdRef = useRef<number>(0);

  // ===== 4) ref 동기화 effect =====
  useEffect(() => {
    regimeRef.current = regime;
  }, [regime]);
  useEffect(() => {
    currentBehaviorRef.current = currentBehavior;
  }, [currentBehavior]);

  // ===== 5) 헬퍼 (avgConfidence 리셋) =====
  const clearAvgConfidence = useCallback((): void => {
    confWindowRef.current = [];
    setAvgConfidence(undefined);
  }, []);

  // ===== 6) handleResult — R2 C1 3상태 switch 그대로 =====
  const handleResult = useCallback(
    (detections: BehaviorDetection[], _frameId: number): void => {
      setLastDetections(detections);
      const top = detections[0] ?? null;
      const incoming = top?.classKey ?? NONE_KEY;
      const win =
        regimeRef.current === "night"
          ? CONFIRM_FRAMES_NIGHT
          : CONFIRM_FRAMES_DAY;

      // avgConfidence 누적: top 있을 때만 push (pending/confirmed 공통).
      if (top) {
        confWindowRef.current.push(top.confidence);
        if (confWindowRef.current.length > AVG_CONF_WINDOW) {
          confWindowRef.current.shift();
        }
        const sum = confWindowRef.current.reduce((a, b) => a + b, 0);
        setAvgConfidence(sum / confWindowRef.current.length);
      }

      const result = confirmDetection(historyRef.current, incoming, win);
      historyRef.current = result.newHistory;

      switch (result.status) {
        case "pending":
          // 창 미달/혼재 → 현재 유지 (단발 오탐이 확정 이벤트 안 깨뜨림).
          return;
        case "cleared":
          // windowSize 프레임 전부 NONE_KEY → 고양이 없음 확정.
          if (currentBehaviorRef.current !== null) {
            currentBehaviorRef.current = null;
            openEventRef.current = null;
            clearAvgConfidence();
            setCurrentBehavior(null);
          }
          return;
        case "confirmed":
          // 새 클래스 확정 — 같은 classKey 반복은 logger 가 ended_at 갱신.
          if (top && currentBehaviorRef.current?.classKey !== result.key) {
            currentBehaviorRef.current = top;
            openEventRef.current = { startedAt: new Date(), classKey: result.key };
            setCurrentBehavior(top);
          }
          return;
      }
    },
    [clearAvgConfidence],
  );

  // ===== 7) onBeforeInfer — sampling 이 호출. 30분 guard + 공용 리셋. =====
  const onBeforeInfer = useCallback((): void => {
    if (shouldForceClose(openEventRef.current, new Date())) {
      openEventRef.current = null;
      historyRef.current = [];
      clearAvgConfidence();
      if (currentBehaviorRef.current !== null) {
        currentBehaviorRef.current = null;
        setCurrentBehavior(null);
      }
    }
  }, [clearAvgConfidence]);

  // ===== 8) onHidden — visibility 진입 시 current/history/avg 리셋. =====
  const onHidden = useCallback((): void => {
    historyRef.current = [];
    clearAvgConfidence();
    if (currentBehaviorRef.current !== null) {
      currentBehaviorRef.current = null;
      openEventRef.current = null;
      setCurrentBehavior(null);
    }
  }, [clearAvgConfidence]);

  // ===== 9) lifecycle/health/sampling 합성 — ref-forward 4 콜백 (R9 §2). =====
  // 순환 의존 (driverHealth ↔ lifecycle.latencyRefs) 해소. 패턴: staging/docs/phase_b_ref_forward_pattern.md
  const bumpSuccessRef = useRef<() => void>(() => {});
  const bumpFailureRef = useRef<(err: unknown) => void>(() => {});
  const bumpTickRef = useRef<() => void>(() => {});
  const markInferringRef = useRef<(v: boolean) => void>(() => {});
  const onSuccess = useCallback((): void => bumpSuccessRef.current(), []);
  const onFailure = useCallback(
    (err: unknown): void => bumpFailureRef.current(err),
    [],
  );
  const onTick = useCallback((): void => bumpTickRef.current(), []);
  const markInferring = useCallback(
    (v: boolean): void => markInferringRef.current(v),
    [],
  );

  const lifecycle = useYoloWorkerLifecycle({
    enabled,
    onDetections: handleResult,
    frameIdRef,
    onSuccess,
    onFailure,
    markInferring,
  });

  const driverHealth = useDriverHealth({
    enabled,
    latencyRefs: lifecycle.latencyRefs,
  });

  // R9 §2: ref 동기화 — driverHealth.* 모두 deps [] stable, 첫 effect 1회만 실행.
  useEffect(() => {
    bumpSuccessRef.current = driverHealth.bumpSuccess;
    bumpFailureRef.current = driverHealth.bumpFailure;
    bumpTickRef.current = driverHealth.bumpTick;
    markInferringRef.current = driverHealth.markInferring;
  }, [
    driverHealth.bumpSuccess,
    driverHealth.bumpFailure,
    driverHealth.bumpTick,
    driverHealth.markInferring,
  ]);

  // ===== 10) sampling 훅 — tick/setInterval/visibility 전담. =====
  useYoloSampling({
    enabled,
    videoRef,
    workerRef: lifecycle.workerRef,
    readyRef: lifecycle.readyRef,
    busyRef: lifecycle.busyRef,
    frameIdRef,
    // R6 T4: latency 측정용 stamp ref — sampling 이 postMessage 직전 쓰기, lifecycle 이 result 에서 읽기.
    inferStartRef: lifecycle.inferStartRef,
    nextTickMs,
    shouldInferNow,
    onBeforeInfer,
    onHidden,
    onTick,
    onPostMessageError: onFailure,
    markInferring,
  });

  // ===== 11) disabled 전환 시 공용 상태 리셋 (deps.resetForDisabled deps [] stable). =====
  useEffect(() => {
    if (enabled) return;
    historyRef.current = [];
    confWindowRef.current = [];
    frameIdRef.current = 0;
    openEventRef.current = null;
    // R8 §1: healthRef 리셋은 useDriverHealth 가 단일 소유 — driver 는 callback 호출만.
    driverHealth.resetForDisabled();
    // R4 M1: React 19 baseline — Phase A 동일 정책 (Arch R4 §1.3).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvgConfidence(undefined);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastDetections([]);
    if (currentBehaviorRef.current !== null) {
      currentBehaviorRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentBehavior(null);
    }
  }, [enabled, driverHealth.resetForDisabled]);

  // ===== 12) Phase A logger 주입 — 전환 감지/INSERT/UPDATE 는 logger 담당. =====
  useBehaviorEventLogger({
    homeId,
    cameraId,
    currentBehavior,
    avgConfidence,
    identifiedCatId: identifiedCatId ?? null,
    supabaseClient,
  });

  return useMemo<DriverResult>(
    () => ({
      currentBehavior,
      backend: lifecycle.backend,
      isInferring: driverHealth.isInferring,
      lastDetections,
      regime,
      health: driverHealth.health,
      initStatus: lifecycle.initStatus,
      retryAttempt: lifecycle.retryAttempt,
    }),
    [
      currentBehavior,
      lifecycle.backend,
      driverHealth.isInferring,
      lastDetections,
      regime,
      driverHealth.health,
      lifecycle.initStatus,
      lifecycle.retryAttempt,
    ],
  );
}
