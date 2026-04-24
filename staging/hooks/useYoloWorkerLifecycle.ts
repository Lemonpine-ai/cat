/**
 * Phase B (R3 / R7 / R10) — ONNX YOLO Worker 생명주기 훅.
 *
 * 역할: ONNX Worker 의 생성 / 초기화 / dispose / 지수 백오프 retry / armBehaviorLogger 단일 책임.
 *  driver 는 worker 디테일 (postMessage 포맷, retry 카운터) 미인지. detection 은 onDetections 위임.
 *
 * R7 분할: latency 링버퍼 + 2초 flush → useYoloLatencyTracker 이전. lifecycle 은 tracker 합성
 *  (외부 시그니처 무변경, driver/sampling 호환).
 *
 * 설계 원칙:
 *  - sampling 은 workerRef/readyRef/busyRef 만 읽기 (busyRef 만 예외적 쓰기 — postMessage 직전/실패).
 *  - armBehaviorLogger("broadcaster") + cleanup 은 worker 생명주기와 동치 (enabled ↔ arm).
 *  - handleWorkerMessage(result) 4 동작: onDetections + onSuccess + markInferring(false) + tracker.recordResult.
 *
 * 금지 패턴 방어 (CLAUDE.md #2): new Worker 직전 disposeWorker() 필수. dispose 는 try/finally
 *  로 terminate 보장.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import type {
  BehaviorDetection,
  WorkerInMessage,
  WorkerOutMessage,
} from "../types/behavior";
import { armBehaviorLogger } from "../lib/behavior/loggerArmGuard";
import {
  canRetry,
  computeBackoffMs,
} from "../lib/behavior/yoloRetryPolicy";
import { useYoloLatencyTracker } from "./useYoloLatencyTracker";

/** ONNX 모델 파일 경로 (public/models/). */
const MODEL_URL = "/models/cat_behavior_yolov8n.onnx";

/**
 * R4 §3.1 MAJOR-R4-A — ready 수신 후 "안정 유지 시간" (ms).
 *
 * ready 즉시 `retryAttemptRef=0` 리셋하면 "ready 후 1초만에 재 crash" 시나리오에서 retry 카운터가
 * 계속 0 으로 초기화 → MAX_RETRIES 경로로 못 가고 30초 주기 crash 루프. 해결: ready 수신 시
 * STABLE_READY_MS 후에야 retry 카운터 리셋. 그 안에 재 crash 시 누적.
 *
 * R9 §6: 환경변수화 — `NEXT_PUBLIC_YOLO_STABLE_READY_MS` (default 60_000). iOS 저사양 단말이
 *  모델 init 60초 초과 시 운영자가 환경변수로 90_000 등 조정 가능. iOS UA 자동 분기는 R10 보류.
 */
const _readyMsEnv = Number(process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS);
const STABLE_READY_MS = Number.isFinite(_readyMsEnv) && _readyMsEnv > 0 ? _readyMsEnv : 60_000;

/** ONNX 초기화 상태 — UI 가 "AI 비정상" 메시지를 결정하기 위한 노출값. */
export type InitStatus = "idle" | "loading" | "ready" | "failed";

/** backend 문자열을 타입 좁힘 — 알 수 없는 값은 null. */
export type WorkerBackend = "webgpu" | "webgl" | "wasm" | null;

function asBackend(s: unknown): WorkerBackend {
  return s === "webgpu" || s === "webgl" || s === "wasm" ? s : null;
}

export interface YoloWorkerLifecycleArgs {
  /** 상위 driver 가 결정한 활성 여부 (flag ON + 방송 중 + homeId/cameraId 충족). */
  enabled: boolean;
  /** worker "result" 메시지 수신 시 호출되는 detection 처리 콜백.
   *  driver 의 handleResult 가 여기에 들어온다. stable 참조 권장 (useCallback). */
  onDetections: (detections: BehaviorDetection[], frameId: number) => void;
  /** sampling 훅이 증가시킨 마지막 frameId — result 수신 시 검증 대상. */
  frameIdRef: MutableRefObject<number>;
  /** health 누적 콜백 — 성공/실패 카운터를 driver 의 healthRef 에 누적. */
  onSuccess: () => void;
  onFailure: (err: unknown) => void;
  /**
   * R7 §3 옵션 B — `isInferring` 단일 진입점.
   *  driver 가 노출한 callback 하나만 lifecycle/sampling 양쪽에서 호출.
   *  R6 까지의 옵셔널 `setIsInferring?` → R7 부터 필수 callback (기본 패턴 명확화).
   */
  markInferring: (v: boolean) => void;
}

export interface YoloWorkerLifecycleResult {
  /** 외부 sampling 훅이 postMessage 호출에 사용. null 이면 미준비. */
  workerRef: Readonly<MutableRefObject<Worker | null>>;
  /** worker init "ready" 메시지 수신 여부 — sampling 훅이 tick guard 로 사용. */
  readyRef: Readonly<MutableRefObject<boolean>>;
  /** postMessage 진행 중 (race 방지) — sampling 훅이 setting + check. */
  busyRef: MutableRefObject<boolean>;
  /** R7 §1 — tracker 의 stamp ref forward. sampling 이 postMessage 직전에 `performance.now()` 기록. */
  inferStartRef: MutableRefObject<number | null>;
  /** 외부에 노출되는 상태값 — driver 가 그대로 forward. */
  initStatus: InitStatus;
  retryAttempt: number;
  backend: WorkerBackend;
  /** R7 §1 — tracker state forward. driver 가 health 에 매 tick 동기화. */
  inferLatencyP50Ms: number | null;
  inferLatencyP95Ms: number | null;
  /** R7 §2 — driver healthRef 가 deps 없이 폴링하기 위한 ref 한 쌍. */
  latencyRefs: {
    p50Ref: Readonly<MutableRefObject<number | null>>;
    p95Ref: Readonly<MutableRefObject<number | null>>;
  };
}

/**
 * Worker 생명주기 단일 책임 훅.
 *
 * @example
 * const lifecycle = useYoloWorkerLifecycle({
 *   enabled, onDetections: handleResult, frameIdRef,
 *   onSuccess: bumpSuccess, onFailure: bumpFailure, markInferring,
 * });
 * // 이후 lifecycle.workerRef / readyRef / busyRef 를 sampling 훅에 전달.
 */
export function useYoloWorkerLifecycle(
  args: YoloWorkerLifecycleArgs,
): YoloWorkerLifecycleResult {
  const { enabled, onDetections, frameIdRef, onSuccess, onFailure, markInferring } = args;

  // ===== 공개 state (driver 가 forward) =====
  const [initStatus, setInitStatus] = useState<InitStatus>("idle");
  const [retryAttempt, setRetryAttempt] = useState<number>(0);
  const [backend, setBackend] = useState<WorkerBackend>(null);
  // retry 재시도 트리거 — state 증가 → worker effect deps 변화 → cleanup → 새 worker 생성.
  const [retryGen, setRetryGen] = useState<number>(0);

  // ===== R7 §1: latency tracker 합성 — 측정 도메인 단일 책임 훅으로 분리. =====
  const tracker = useYoloLatencyTracker({ enabled });

  // ===== 내부 ref =====
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef<boolean>(false);
  const busyRef = useRef<boolean>(false);
  const retryAttemptRef = useRef<number>(0);
  const retryTimerRef = useRef<number | null>(null);
  // R4 MAJOR-R4-A: ready 후 STABLE_READY_MS 경과 시에만 retryAttemptRef 리셋 예약 타이머.
  const stableReadyTimerRef = useRef<number | null>(null);

  // 콜백 stale 클로저 방지용 ref — handleWorkerMessage 가 매번 최신 콜백 참조.
  const onDetectionsRef = useRef(onDetections);
  const onSuccessRef = useRef(onSuccess);
  const onFailureRef = useRef(onFailure);
  const markInferringRef = useRef(markInferring);
  useEffect(() => {
    onDetectionsRef.current = onDetections;
    onSuccessRef.current = onSuccess;
    onFailureRef.current = onFailure;
    markInferringRef.current = markInferring;
  }, [onDetections, onSuccess, onFailure, markInferring]);

  // ===== 헬퍼 =====

  /** 지수 백오프로 다음 retry 예약 — MAX_RETRIES 소진 시 "failed". */
  const scheduleRetry = useCallback((): void => {
    if (retryTimerRef.current !== null) return; // 이미 예약됨
    const nextAttempt = retryAttemptRef.current + 1;
    if (!canRetry(nextAttempt)) {
      setInitStatus("failed");
      return;
    }
    retryAttemptRef.current = nextAttempt;
    setRetryAttempt(nextAttempt);
    const delay = computeBackoffMs(nextAttempt);
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      // state 증가 → worker useEffect deps 변화 → cleanup → 새 worker 생성.
      setRetryGen((n) => n + 1);
    }, delay);
  }, []);

  // R7 §1: tracker 메서드는 useCallback 으로 stable 한 참조 — 직접 deps 에 넣으면 안전.
  //   tracker return 객체 전체를 deps 에 넣으면 매 렌더 새 객체라 effect 폭증 → 메서드만 분해.
  const { recordResult, invalidateStamp, clearBuffer } = tracker;

  /** worker message 핸들러 — ready / result / error 3종. */
  const handleWorkerMessage = useCallback(
    (ev: MessageEvent<WorkerOutMessage>) => {
      const msg = ev.data;
      if (msg.type === "ready") {
        readyRef.current = true;
        setInitStatus("ready");
        setBackend(asBackend(msg.backend));
        // R4 MAJOR-R4-A: 즉시 리셋 X — 이전 stableReady 타이머가 있으면 clear 후 재예약.
        if (stableReadyTimerRef.current !== null) {
          window.clearTimeout(stableReadyTimerRef.current);
          stableReadyTimerRef.current = null;
        }
        // STABLE_READY_MS 유지 후에만 retry 카운터 리셋 (그 전 crash 시 handleWorkerError 가 clearTimeout 으로 누적 유지).
        stableReadyTimerRef.current = window.setTimeout(() => {
          stableReadyTimerRef.current = null;
          retryAttemptRef.current = 0;
          setRetryAttempt(0);
        }, STABLE_READY_MS);
        return;
      }
      if (msg.type === "result") {
        busyRef.current = false;
        // R7 §3: 단일 진입점 markInferring 호출 (이전 setIsInferringRef 옵셔널 → 필수 callback).
        markInferringRef.current(false);
        // R7 §1: latency 측정 — frameId 일치 시에만 delta 기록 (stale skip).
        if (msg.frameId === frameIdRef.current) {
          recordResult(performance.now());
        }
        if (msg.frameId !== frameIdRef.current) return;
        onDetectionsRef.current(msg.detections, msg.frameId);
        onSuccessRef.current();
        return;
      }
      // msg.type === "error" — R7 §1: stamp 만 무효화 (링버퍼에 실패 시간 넣지 않음).
      busyRef.current = false;
      markInferringRef.current(false);
      invalidateStamp();
      onFailureRef.current(new Error(msg.message));
    },
    [frameIdRef, recordResult, invalidateStamp],
  );

  /** worker error 이벤트 핸들러 — dispose + retry 예약. 동일 함수 참조로 자기 자신을 전달. */
  const handleWorkerErrorRef = useRef<(ev: ErrorEvent) => void>(() => {});
  const handleWorkerError = useCallback((ev: ErrorEvent) => {
    onFailureRef.current(new Error(ev.message || "worker error"));
    // R4 MAJOR-R4-A: 안정 유지 타이머가 예약돼 있으면 취소 — STABLE_READY_MS 경과 전 crash
    //   이므로 retryAttemptRef 는 리셋되지 않고 누적된다.
    if (stableReadyTimerRef.current !== null) {
      window.clearTimeout(stableReadyTimerRef.current);
      stableReadyTimerRef.current = null;
    }
    // 여기서는 workerRef 정리만 — 신규 생성은 retryGen 증가로 worker effect 재실행에 위임.
    const w = workerRef.current;
    if (w) {
      w.removeEventListener("message", handleWorkerMessage);
      w.removeEventListener("error", handleWorkerErrorRef.current);
      try {
        w.terminate();
      } catch {
        /* 무시 */
      }
      workerRef.current = null;
    }
    readyRef.current = false;
    busyRef.current = false;
    invalidateStamp(); // R7 §1: crash 시 진행 중 stamp 폐기 (링버퍼 유지).
    scheduleRetry();
  }, [handleWorkerMessage, scheduleRetry, invalidateStamp]);
  useEffect(() => {
    handleWorkerErrorRef.current = handleWorkerError;
  }, [handleWorkerError]);

  /** worker 정리 — dispose 메시지 + 리스너 해제 + terminate + ref null. */
  const disposeWorker = useCallback((): void => {
    const w = workerRef.current;
    if (w) {
      try {
        w.postMessage({ type: "dispose" } satisfies WorkerInMessage);
      } catch {
        /* 이미 죽은 worker */
      }
      w.removeEventListener("message", handleWorkerMessage);
      w.removeEventListener("error", handleWorkerErrorRef.current);
      try {
        w.terminate();
      } catch {
        /* 무시 */
      }
      workerRef.current = null;
    }
    readyRef.current = false;
    busyRef.current = false;
    // R4 MAJOR-R4-A: worker 를 정리할 때 stableReady 타이머도 정리.
    if (stableReadyTimerRef.current !== null) {
      window.clearTimeout(stableReadyTimerRef.current);
      stableReadyTimerRef.current = null;
    }
    // R7 §1: 새 세션의 latency 만 집계하도록 stamp/링버퍼 초기화.
    clearBuffer();
  }, [handleWorkerMessage, clearBuffer]);

  // ===== Worker lifecycle (enabled + retryGen effect) =====
  useEffect(() => {
    if (!enabled) {
      // enabled false → 모든 상태 리셋 (disabled 전환).
      disposeWorker();
      // R4 M1: disabled 전환 시 공용 state 리셋은 prop 변화 이벤트 핸들러 패턴으로 옮길 수 없음 (React 19).
      //   팀 baseline: Phase A useBehaviorDetection/useBehaviorEventLogger/useLandscapeLock 동일.
      //   R5+ 또는 src/ 반영 단계에서 .eslintrc off 일괄 정책 결정 예정 (Arch R4 §1.3).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitStatus("idle");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBackend(null);
      retryAttemptRef.current = 0;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRetryAttempt(0);
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      return;
    }
    // 기존 worker 남아 있으면 먼저 정리 (CLAUDE.md #2 — new Worker 직전 dispose 필수).
    if (workerRef.current) {
      disposeWorker();
    }
    setInitStatus("loading");
    try {
      const worker = new Worker(
        new URL("../workers/yoloInference.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      worker.addEventListener("message", handleWorkerMessage);
      worker.addEventListener("error", handleWorkerErrorRef.current);
      const initMsg: WorkerInMessage = { type: "init", modelUrl: MODEL_URL };
      worker.postMessage(initMsg);
    } catch (err) {
      onFailureRef.current(err);
      scheduleRetry();
    }
    return () => {
      disposeWorker();
    };
  }, [enabled, retryGen, disposeWorker, handleWorkerMessage, scheduleRetry]);

  // ===== R2 M2-L3: logger arm guard — enabled 동안 전역 sentinel 세팅 =====
  useEffect(() => {
    if (!enabled) return;
    const disarm = armBehaviorLogger("broadcaster");
    return () => disarm();
  }, [enabled]);

  // 언마운트 시 retry / stableReady 타이머 정리 — 전용 effect.
  useEffect(
    () => () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (stableReadyTimerRef.current !== null) {
        window.clearTimeout(stableReadyTimerRef.current);
        stableReadyTimerRef.current = null;
      }
    },
    [],
  );

  return {
    workerRef,
    readyRef,
    busyRef,
    // R7 §1: tracker 결과를 그대로 forward — driver/sampling 호환 유지 (외부 시그니처 무변경).
    inferStartRef: tracker.inferStartRef,
    initStatus,
    retryAttempt,
    backend,
    inferLatencyP50Ms: tracker.inferLatencyP50Ms,
    inferLatencyP95Ms: tracker.inferLatencyP95Ms,
    latencyRefs: tracker.latencyRefs,
  };
}
