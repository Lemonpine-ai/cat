/**
 * Phase B (R3) — YOLO 비디오 프레임 샘플링 훅.
 *
 * 역할:
 *  - **tick (setInterval) / visibilitychange / `shouldInferNow` 가드 / createImageBitmap /
 *    Worker postMessage** 책임을 담당. Worker 의 생성/dispose 는 `useYoloWorkerLifecycle` 이
 *    전담하며, 본 훅은 lifecycle 의 ref (workerRef/readyRef/busyRef) 만 읽고 busyRef 만 쓴다.
 *
 * R3 분할 배경 (R2 QA M-R2-A):
 *  - R2 driver 545 LOC → 3분할. 본 훅이 sampling 단일 책임.
 *
 * 책임 요약:
 *  1. sampling effect deps: `[enabled, nextTickMs, tick]`. cleanup 에서 stopInterval + visibility 해제.
 *  2. `tick` 은 useCallback 으로 선언 (deps 명시) — R2 QA m-R2-D 의 "tick hoisting" 문제 해소.
 *  3. visibility hidden → stopInterval + `onHidden()`. visible → startInterval(tick).
 *  4. tick 본문: video readyState/videoWidth/document.hidden 가드 → `shouldInferNow()` 가드 →
 *     `onTick()` (health bump) → `onBeforeInfer()` (driver maxDuration) → createImageBitmap →
 *     `markInferring(true)` → worker.postMessage(transferable). 실패 시 `onPostMessageError(err)`
 *     + bitmap.close 보장.
 *
 * 설계 원칙:
 *  - sampling 은 lifecycle 의 ref 만 읽는다 (쓰기 금지). 단 `busyRef` 는 postMessage 직전/실패 시
 *    sampling 이 세팅해야 해서 예외적으로 쓰기 허용.
 *  - 본 훅은 React state 를 직접 반환하지 않는다 (side-effect only). driver 가 필요로 하는
 *    상태 변경은 `markInferring` callback 주입으로 역전달 (R7 §3 옵션 B).
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject, RefObject } from "react";

import type { WorkerInMessage } from "../types/behavior";

export interface YoloSamplingArgs {
  /** flag ON + 방송 중 + homeId/cameraId 충족 시 true. */
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** lifecycle 훅이 보유한 workerRef — sampling 은 읽기 전용으로 받음. */
  workerRef: Readonly<MutableRefObject<Worker | null>>;
  /** lifecycle init "ready" 수신 여부. */
  readyRef: Readonly<MutableRefObject<boolean>>;
  /** 진행 중 flag — sampling 이 postMessage 직전 true, 응답/실패 시 false. */
  busyRef: MutableRefObject<boolean>;
  /** sampling 이 증가시키면 lifecycle result 핸들러가 검증에 사용. */
  frameIdRef: MutableRefObject<number>;
  /**
   * R6 T4 — inference latency stamp ref.
   *  sampling 이 postMessage 직전에 `performance.now()` 를 기록.
   *  lifecycle 의 result 핸들러가 delta 를 계산해 링버퍼에 누적한다.
   *  postMessage 실패/bitmap 실패 경로에서는 sampling 이 null 로 롤백.
   */
  inferStartRef: MutableRefObject<number | null>;
  /** scheduler 결과 — driver 가 그대로 전달. effect deps 변경 시 새 interval 교체. */
  nextTickMs: number;
  /** scheduler 판단 — 탭 숨김 복귀 폭주 방지. */
  shouldInferNow: () => boolean;
  /** tick 진행 직전 driver 콜백 — maxDurationGuard / 공용 reset 처리. */
  onBeforeInfer: () => void;
  /** visibility hidden 진입 시 driver reset. */
  onHidden: () => void;
  /** health 누적: tick 카운트. */
  onTick: () => void;
  /** postMessage 실패 / bitmap 생성 실패 시 driver 알림. */
  onPostMessageError: (err: unknown) => void;
  /**
   * R7 §3 옵션 B — `isInferring` 단일 진입점.
   *  driver 가 `useState` 와 `setState` 를 한 곳에 보유하고, sampling/lifecycle 양쪽이
   *  본 callback 만 호출. tick 시점 true / catch 시점 false. R6 까지의 `setIsInferring`
   *  prop 이름을 명확화 (의미 동일).
   */
  markInferring: (v: boolean) => void;
}

/**
 * 샘플링 단일 책임 훅 — 부수효과만, 반환값 없음.
 *
 * 사용 전제:
 *  - lifecycle 훅이 생성한 workerRef/readyRef/busyRef 를 그대로 전달.
 *  - scheduler 훅이 결정한 nextTickMs/shouldInferNow 를 그대로 전달.
 */
export function useYoloSampling(args: YoloSamplingArgs): void {
  const {
    enabled,
    videoRef,
    workerRef,
    readyRef,
    busyRef,
    frameIdRef,
    inferStartRef,
    nextTickMs,
    shouldInferNow,
    onBeforeInfer,
    onHidden,
    onTick,
    onPostMessageError,
    markInferring,
  } = args;

  // 콜백 stale 클로저 방지 — tick useCallback 의 deps 를 과도하게 키우지 않도록 ref 경유.
  // (shouldInferNow / onBeforeInfer / onHidden / onTick / onPostMessageError / markInferring
  //  은 모두 driver 가 매 렌더 재생성할 수 있으므로 ref 로 흡수.)
  const shouldInferNowRef = useRef(shouldInferNow);
  const onBeforeInferRef = useRef(onBeforeInfer);
  const onHiddenRef = useRef(onHidden);
  const onTickRef = useRef(onTick);
  const onPostMessageErrorRef = useRef(onPostMessageError);
  const markInferringRef = useRef(markInferring);
  useEffect(() => {
    shouldInferNowRef.current = shouldInferNow;
    onBeforeInferRef.current = onBeforeInfer;
    onHiddenRef.current = onHidden;
    onTickRef.current = onTick;
    onPostMessageErrorRef.current = onPostMessageError;
    markInferringRef.current = markInferring;
  }, [
    shouldInferNow,
    onBeforeInfer,
    onHidden,
    onTick,
    onPostMessageError,
    markInferring,
  ]);

  // interval id 보관 — stopInterval 이 참조.
  const intervalRef = useRef<number | null>(null);

  /** interval 중단. */
  const stopInterval = useCallback((): void => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /**
   * tick — setInterval 콜백으로 사용되는 1회 샘플링 단위.
   *
   * 가드 순서 (빠른 실패 우선):
   *  1. video / worker / ready 미준비 → skip
   *  2. busyRef (이전 tick 처리 중) → skip
   *  3. video.readyState < 2 / videoWidth=0 → skip
   *  4. document.hidden → skip (visibility 리스너 누락 대비 이중 가드)
   *  5. shouldInferNow() false → skip (백그라운드 탭 폭주 방어)
   *  6. 통과 → health bump + onBeforeInfer → createImageBitmap → postMessage(transferable)
   */
  const tick = useCallback(async (): Promise<void> => {
    const video = videoRef.current;
    const worker = workerRef.current;
    if (!video || !worker || !readyRef.current) return;
    if (busyRef.current) return;
    if (video.readyState < 2 || video.videoWidth === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;

    // R2 M6: 백그라운드 탭 스로틀링 방어 — scheduler 가 판단한 간격 미만이면 스킵.
    if (!shouldInferNowRef.current()) return;

    onTickRef.current();
    onBeforeInferRef.current();

    let bitmap: ImageBitmap | null = null;
    let transferred = false;
    try {
      busyRef.current = true;
      markInferringRef.current(true); // 응답 시점에 lifecycle 훅이 false 세팅.
      // R7 §3 옵션 B: isInferring 단일 진입점 — driver 의 markInferring callback 으로 수렴.
      //   sampling/lifecycle 모두 본 callback 만 호출 (driver 의 useState 가 단일 소유).
      bitmap = await createImageBitmap(video);
      const frameId = ++frameIdRef.current;
      const msg: WorkerInMessage = { type: "infer", frameId, bitmap };
      // R6 T4: postMessage 직전 latency stamp — lifecycle result 핸들러가 delta 계산에 사용.
      inferStartRef.current = performance.now();
      worker.postMessage(msg, [bitmap]);
      // R5 §5.2 MINOR-R5-g: transferable 이관 성공 → bitmap 은 이제 Worker 소유.
      //   여기서 close() 불필요 (메인 스레드 ownership 없음). 실패 시만 catch 에서 close().
      //   worker 쪽이 결국 yoloInference.worker.ts 에서 bitmap.close() 호출하여 GPU 자원 해제.
      transferred = true;
    } catch (err) {
      busyRef.current = false;
      markInferringRef.current(false); // postMessage 실패 경로 → 즉시 해제.
      // R6 T4: 실패 stamp 롤백 — 링버퍼에 왜곡된 값이 들어가지 않도록.
      inferStartRef.current = null;
      onPostMessageErrorRef.current(err);
    } finally {
      // transferred 실패 시 bitmap 수동 close (메모리 누수 방지).
      if (bitmap && !transferred) {
        try {
          bitmap.close();
        } catch {
          /* 무시 */
        }
      }
    }
  }, [videoRef, workerRef, readyRef, busyRef, frameIdRef, inferStartRef]);

  /** interval 시작 — nextTickMs 기준. 이미 돌고 있으면 건너뜀. */
  const startInterval = useCallback(
    (tickFn: () => Promise<void>): void => {
      if (intervalRef.current !== null) return;
      intervalRef.current = window.setInterval(() => {
        void tickFn();
      }, nextTickMs);
    },
    [nextTickMs],
  );

  // ===== Sampling effect (enabled + nextTickMs + tick) =====
  useEffect(() => {
    if (!enabled) {
      stopInterval();
      return;
    }
    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        stopInterval();
        onHiddenRef.current();
      } else {
        startInterval(tick);
      }
    };
    if (typeof document === "undefined" || !document.hidden) {
      startInterval(tick);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      stopInterval();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [enabled, nextTickMs, tick, startInterval, stopInterval]);
}
