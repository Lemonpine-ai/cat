/**
 * Phase B (R3) — useYoloWorkerLifecycle 단위 테스트.
 *
 * 커버 범위 (Arch R3 §1.4):
 *  1. enabled=false → true 전환 시 new Worker 생성 + init 메시지 송신.
 *  2. "ready" 메시지 수신 시 initStatus="ready" / backend 세팅 / retryAttempt 0.
 *  3. "result" 메시지 수신 시 onDetections 호출 + onSuccess + markInferring(false).
 *     frameId mismatch 는 onDetections 미호출.
 *  4. "error" 메시지 수신 시 onFailure 호출 + busyRef 해제.
 *  5. worker error 이벤트 시 dispose + scheduleRetry → retryAttempt 증가.
 *  6. armBehaviorLogger("broadcaster") 호출 + cleanup 에서 disarm.
 *
 * Dev 판단:
 *  - global Worker 를 vi.fn 으로 stub. 실제 onnxruntime-web 로드는 하지 않음.
 *  - jsdom 환경 + vi.useFakeTimers 로 scheduleRetry 의 setTimeout 제어.
 *  - React 훅 실행은 testing-library/react 대신 최소한의 renderHook 수준 필요.
 *    본 테스트는 vitest 가 설치된 경우에만 describe/it 블록이 동작 — Arch R3 §5 TODO 10 의
 *    "pnpm exec vitest run" 에서 검증.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
  useYoloWorkerLifecycle,
  type YoloWorkerLifecycleArgs,
} from "../hooks/useYoloWorkerLifecycle";
import type { BehaviorDetection } from "../types/behavior";
// R4 M2: StubWorker / installWorkerStub / makeFrameIdRef / clearLoggerArmSentinel
//   은 helpers 에서 import (중복 제거, Arch R4 §2.3).
import {
  installWorkerStub,
  makeFrameIdRef,
  clearLoggerArmSentinel,
} from "./helpers/workerStubs";

// installWorkerStub: createdWorkers 관찰 배열 + reset() 제공.
const workerStub = installWorkerStub();
const createdWorkers = workerStub.createdWorkers;

describe("useYoloWorkerLifecycle (R3 분할)", () => {
  beforeEach(() => {
    workerStub.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearLoggerArmSentinel();
  });

  it("enabled=false → true 전환 시 new Worker 생성 + init 메시지", () => {
    const frameIdRef = makeFrameIdRef();
    const onDetections = vi.fn();
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    const { rerender } = renderHook<
      ReturnType<typeof useYoloWorkerLifecycle>,
      { enabled: boolean }
    >(
      ({ enabled }) =>
        useYoloWorkerLifecycle({
          enabled,
          onDetections,
          frameIdRef,
          onSuccess,
          onFailure,
          markInferring: vi.fn(),
        } satisfies YoloWorkerLifecycleArgs),
      { initialProps: { enabled: false } },
    );

    expect(createdWorkers.length).toBe(0);

    act(() => {
      rerender({ enabled: true });
    });

    expect(createdWorkers.length).toBe(1);
    const w = createdWorkers[0];
    expect(w.messages[0]).toEqual({
      type: "init",
      modelUrl: "/models/cat_behavior_yolov8n.onnx",
    });
  });

  it("\"ready\" 메시지 → initStatus=\"ready\" + backend 세팅", () => {
    const frameIdRef = makeFrameIdRef();
    const onDetections = vi.fn();
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    const { result } = renderHook(() =>
      useYoloWorkerLifecycle({
        enabled: true,
        onDetections,
        frameIdRef,
        onSuccess,
        onFailure,
        markInferring: vi.fn(),
      }),
    );

    expect(result.current.initStatus).toBe("loading");
    const w = createdWorkers[0];
    act(() => {
      w._emit("message", { data: { type: "ready", backend: "webgpu" } });
    });
    expect(result.current.initStatus).toBe("ready");
    expect(result.current.backend).toBe("webgpu");
    expect(result.current.retryAttempt).toBe(0);
  });

  it("\"result\" + 일치 frameId → onDetections + onSuccess + markInferring(false)", () => {
    const frameIdRef = makeFrameIdRef(5);
    const onDetections = vi.fn();
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    // R7 §3 옵션 B: setIsInferring → markInferring 이름 변경 (시그니처 동일).
    const markInferring = vi.fn();

    renderHook(() =>
      useYoloWorkerLifecycle({
        enabled: true,
        onDetections,
        frameIdRef,
        onSuccess,
        onFailure,
        markInferring,
      }),
    );

    const w = createdWorkers[0];
    const detections: BehaviorDetection[] = [
      {
        classId: 1,
        classKey: "sleeping",
        label: "sleeping",
        confidence: 0.9,
        bbox: { x: 0, y: 0, w: 1, h: 1 },
      },
    ];

    // frameId mismatch: 호출 안 됨
    act(() => {
      w._emit("message", { data: { type: "result", frameId: 999, detections } });
    });
    expect(onDetections).not.toHaveBeenCalled();
    expect(markInferring).toHaveBeenCalledWith(false);
    markInferring.mockClear();

    // frameId match: 호출됨
    act(() => {
      w._emit("message", { data: { type: "result", frameId: 5, detections } });
    });
    expect(onDetections).toHaveBeenCalledWith(detections, 5);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(markInferring).toHaveBeenCalledWith(false);
  });

  it("\"error\" 메시지 → onFailure + markInferring(false)", () => {
    const frameIdRef = makeFrameIdRef();
    const onDetections = vi.fn();
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const markInferring = vi.fn();

    renderHook(() =>
      useYoloWorkerLifecycle({
        enabled: true,
        onDetections,
        frameIdRef,
        onSuccess,
        onFailure,
        markInferring,
      }),
    );

    const w = createdWorkers[0];
    act(() => {
      w._emit("message", { data: { type: "error", message: "onnx load fail" } });
    });
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(markInferring).toHaveBeenCalledWith(false);
    const err = onFailure.mock.calls[0][0] as Error;
    expect(err.message).toBe("onnx load fail");
  });

  it("worker error 이벤트 → dispose + retry 예약 → retryAttempt 증가", () => {
    const frameIdRef = makeFrameIdRef();
    const onDetections = vi.fn();
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    const { result } = renderHook(() =>
      useYoloWorkerLifecycle({
        enabled: true,
        onDetections,
        frameIdRef,
        onSuccess,
        onFailure,
        markInferring: vi.fn(),
      }),
    );

    const w = createdWorkers[0];
    expect(w.terminated).toBe(false);
    act(() => {
      w._emit("error", { message: "worker crashed" });
    });
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(w.terminated).toBe(true);
    // scheduleRetry 가 state setRetryAttempt 1 로 갱신.
    expect(result.current.retryAttempt).toBe(1);
    // backoff 30s 경과 → 새 Worker 생성.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(createdWorkers.length).toBe(2);
  });

  // R4 MAJOR-R4-A: ready 수신 후 STABLE_READY_MS (60s) 경과 전에 재 crash 시 retryAttempt 누적 유지.
  it("ready 후 1초 내 재 crash → retryAttempt 누적 (리셋 안 됨)", () => {
    const frameIdRef = makeFrameIdRef();
    const onDetections = vi.fn();
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    const { result } = renderHook(() =>
      useYoloWorkerLifecycle({
        enabled: true,
        onDetections,
        frameIdRef,
        onSuccess,
        onFailure,
        markInferring: vi.fn(),
      }),
    );

    // 1차 crash → retryAttempt=1 → 30s 후 2번째 worker 생성.
    const w1 = createdWorkers[0];
    act(() => {
      w1._emit("error", { message: "crash#1" });
    });
    expect(result.current.retryAttempt).toBe(1);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(createdWorkers.length).toBe(2);

    // 2번째 worker ready 수신 — 즉시 retryAttempt 가 0으로 리셋되면 안 됨.
    const w2 = createdWorkers[1];
    act(() => {
      w2._emit("message", { data: { type: "ready", backend: "webgpu" } });
    });
    // ready 직후: initStatus="ready" 이지만 retryAttempt 는 아직 유지.
    expect(result.current.initStatus).toBe("ready");
    expect(result.current.retryAttempt).toBe(1);

    // 1초만 흐르고 (STABLE_READY_MS=60s 미만) 재 crash → retryAttempt=2 누적.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    act(() => {
      w2._emit("error", { message: "crash#2" });
    });
    expect(result.current.retryAttempt).toBe(2);
  });

  // R4 MAJOR-R4-A: STABLE_READY_MS 경과 후에는 retryAttempt 가 0으로 리셋.
  it("ready 후 60초 유지 시 retryAttempt 0 리셋", () => {
    const frameIdRef = makeFrameIdRef();
    const { result } = renderHook(() =>
      useYoloWorkerLifecycle({
        enabled: true,
        onDetections: vi.fn(),
        frameIdRef,
        onSuccess: vi.fn(),
        onFailure: vi.fn(),
        markInferring: vi.fn(),
      }),
    );

    // 1차 crash + retry → 2nd worker ready.
    const w1 = createdWorkers[0];
    act(() => {
      w1._emit("error", { message: "crash" });
    });
    expect(result.current.retryAttempt).toBe(1);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const w2 = createdWorkers[1];
    act(() => {
      w2._emit("message", { data: { type: "ready", backend: "webgpu" } });
    });
    expect(result.current.retryAttempt).toBe(1);

    // 60초 유지 → 리셋.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.retryAttempt).toBe(0);
  });

  // R5 권고 1: 60s 경계 ±1ms — 59_999ms 에는 리셋 안 됨 / 60_001ms 에는 리셋 완료.
  // setTimeout(fn, 60_000) 은 vitest fake timer 에서 advance >= 60_000 일 때 발사.
  // → advanceTimersByTime(59_999) 시 미발사 = retryAttempt 유지.
  it("ready 후 정확히 59_999ms → retryAttempt 유지 (리셋 안 됨)", () => {
    const frameIdRef = makeFrameIdRef();
    const { result } = renderHook(() =>
      useYoloWorkerLifecycle({
        enabled: true,
        onDetections: vi.fn(),
        frameIdRef,
        onSuccess: vi.fn(),
        onFailure: vi.fn(),
        markInferring: vi.fn(),
      }),
    );

    // 1차 crash → retry=1 → 2번째 worker 생성.
    const w1 = createdWorkers[0];
    act(() => {
      w1._emit("error", { message: "crash" });
    });
    expect(result.current.retryAttempt).toBe(1);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const w2 = createdWorkers[1];
    act(() => {
      w2._emit("message", { data: { type: "ready", backend: "webgpu" } });
    });
    expect(result.current.retryAttempt).toBe(1);

    // 정확히 59_999ms 만 진행 — STABLE_READY_MS=60_000 미만이라 리셋 타이머 미발사.
    act(() => {
      vi.advanceTimersByTime(59_999);
    });
    expect(result.current.retryAttempt).toBe(1);
  });

  // R5 권고 1: 60_001ms 진행 시 리셋 타이머가 확실히 발사되었음을 검증 (60_000 + 여유 1ms).
  it("ready 후 정확히 60_001ms → retryAttempt 0 리셋 완료", () => {
    const frameIdRef = makeFrameIdRef();
    const { result } = renderHook(() =>
      useYoloWorkerLifecycle({
        enabled: true,
        onDetections: vi.fn(),
        frameIdRef,
        onSuccess: vi.fn(),
        onFailure: vi.fn(),
        markInferring: vi.fn(),
      }),
    );

    // 1차 crash + retry → 2nd worker ready.
    const w1 = createdWorkers[0];
    act(() => {
      w1._emit("error", { message: "crash" });
    });
    expect(result.current.retryAttempt).toBe(1);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const w2 = createdWorkers[1];
    act(() => {
      w2._emit("message", { data: { type: "ready", backend: "webgpu" } });
    });
    expect(result.current.retryAttempt).toBe(1);

    // 60_001ms = 60_000 (리셋 발사 시점) + 여유 1ms → 리셋 확정.
    act(() => {
      vi.advanceTimersByTime(60_001);
    });
    expect(result.current.retryAttempt).toBe(0);
  });

  // R6 T4: inference latency 링버퍼 검증 — postMessage 시점 stamp → result 수신 시 delta 측정 → P50/P95 state 반영.
  it("inference latency 링버퍼 → 2초 flush 후 P50/P95 state 반영", () => {
    const frameIdRef = makeFrameIdRef(0);
    const { result } = renderHook(() =>
      useYoloWorkerLifecycle({
        enabled: true,
        onDetections: vi.fn(),
        frameIdRef,
        onSuccess: vi.fn(),
        onFailure: vi.fn(),
        markInferring: vi.fn(),
      }),
    );

    // 초기값: null
    expect(result.current.inferLatencyP50Ms).toBeNull();
    expect(result.current.inferLatencyP95Ms).toBeNull();

    const w = createdWorkers[0];
    // ready 수신
    act(() => {
      w._emit("message", { data: { type: "ready", backend: "webgpu" } });
    });

    // performance.now() 를 모킹 — stamp 직전 = 100, result 시점 = 250 → delta = 150ms.
    //   frameIdRef 는 sampling 이 ++ 한다고 가정 (여기서는 수동).
    const nowSpy = vi.spyOn(performance, "now");

    // 첫 tick 시뮬레이트 — sampling 이 stamp 쓰는 것을 직접 모킹.
    frameIdRef.current = 1;
    result.current.inferStartRef.current = 100;
    nowSpy.mockReturnValueOnce(250); // result 수신 시 performance.now() 반환
    act(() => {
      w._emit("message", { data: { type: "result", frameId: 1, detections: [] } });
    });

    // 두 번째 tick — delta = 80ms (200 → 280).
    frameIdRef.current = 2;
    result.current.inferStartRef.current = 200;
    nowSpy.mockReturnValueOnce(280);
    act(() => {
      w._emit("message", { data: { type: "result", frameId: 2, detections: [] } });
    });

    // 세 번째 tick — delta = 300ms.
    frameIdRef.current = 3;
    result.current.inferStartRef.current = 500;
    nowSpy.mockReturnValueOnce(800);
    act(() => {
      w._emit("message", { data: { type: "result", frameId: 3, detections: [] } });
    });

    // 2초 경과 → latency flush effect 발사.
    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    // 링버퍼 [150, 80, 300] 정렬 시 [80, 150, 300].
    //   P50 (nearest-rank, ceil(0.5*3)-1 = 1) → 150
    //   P95 (nearest-rank, ceil(0.95*3)-1 = 2) → 300
    expect(result.current.inferLatencyP50Ms).toBe(150);
    expect(result.current.inferLatencyP95Ms).toBe(300);

    nowSpy.mockRestore();
  });

  it("unmount 시 worker terminate + logger sentinel 해제", () => {
    const frameIdRef = makeFrameIdRef();
    const { unmount } = renderHook(() =>
      useYoloWorkerLifecycle({
        enabled: true,
        onDetections: vi.fn(),
        frameIdRef,
        onSuccess: vi.fn(),
        onFailure: vi.fn(),
        markInferring: vi.fn(),
      }),
    );

    expect(
      (window as unknown as { __catBehaviorLoggerArmed__?: string })
        .__catBehaviorLoggerArmed__,
    ).toBe("broadcaster");
    const w = createdWorkers[0];
    act(() => {
      unmount();
    });
    expect(w.terminated).toBe(true);
    expect(
      (window as unknown as { __catBehaviorLoggerArmed__?: string })
        .__catBehaviorLoggerArmed__,
    ).toBeUndefined();
  });
});

// R10 §5: STABLE_READY_MS 환경변수 6 case 검증 (NEXT_PUBLIC_YOLO_STABLE_READY_MS).
//   IIFE/const 평가 시점이 모듈 최상위 → vi.resetModules() + dynamic import 로 매 case 새 평가.
//   case 2 만 90_000 ms 경계 fully verified, case 1/3/4/5/6 는 module import PASS 만 검증
//   (default 60_000 동작은 기존 case "ready 후 60_001ms → 0 리셋" 가 cover).
describe("STABLE_READY_MS 환경변수 6 case (R10 §5)", () => {
  const ORIG_ENV = process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS;

  beforeEach(() => {
    workerStub.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearLoggerArmSentinel();
    if (ORIG_ENV === undefined) {
      delete process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS;
    } else {
      process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS = ORIG_ENV;
    }
  });

  // env 세팅 → vi.resetModules() → dynamic import 로 lifecycle 모듈 재평가 (STABLE_READY_MS 새 계산).
  async function loadLifecycleWithEnv(envValue: string | undefined): Promise<typeof useYoloWorkerLifecycle> {
    if (envValue === undefined) {
      delete process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS;
    } else {
      process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS = envValue;
    }
    vi.resetModules();
    // installWorkerStub 의 globalThis.Worker stub 은 resetModules 와 무관 (vi.stubGlobal) → 그대로 유지.
    const mod = await import("../hooks/useYoloWorkerLifecycle");
    return mod.useYoloWorkerLifecycle;
  }

  // case 1: env 미설정 → default 60_000.
  it("case 1: env 미설정 → STABLE_READY_MS=60_000 (default), import PASS", async () => {
    const useHook = await loadLifecycleWithEnv(undefined);
    expect(useHook).toBeDefined();
  });

  // case 2: 양수 "90000" → STABLE_READY_MS=90_000 (fully verified — 89_999ms retry 유지 / 90_001ms 리셋).
  it("case 2: env=\"90000\" → ready 후 89_999ms retry 유지 / 90_001ms retry 0", async () => {
    const useHook = await loadLifecycleWithEnv("90000");
    const frameIdRef = makeFrameIdRef();
    const { result } = renderHook(() =>
      useHook({
        enabled: true,
        onDetections: vi.fn(),
        frameIdRef,
        onSuccess: vi.fn(),
        onFailure: vi.fn(),
        markInferring: vi.fn(),
      }),
    );

    // 1차 crash → retry=1.
    const w1 = createdWorkers[createdWorkers.length - 1];
    act(() => { w1._emit("error", { message: "crash" }); });
    expect(result.current.retryAttempt).toBe(1);
    // 백오프 30s 진행 → 새 worker 생성 → ready emit.
    act(() => { vi.advanceTimersByTime(30_000); });
    const w2 = createdWorkers[createdWorkers.length - 1];
    act(() => { w2._emit("message", { data: { type: "ready", backend: "webgpu" } }); });

    // 89_999ms — STABLE_READY_MS=90_000 미만 → 리셋 미발사.
    act(() => { vi.advanceTimersByTime(89_999); });
    expect(result.current.retryAttempt).toBe(1);
    // +2ms (총 90_001ms) → 리셋 타이머 발사.
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current.retryAttempt).toBe(0);
  });

  // case 3: "0" → fallback 60_000.
  it("case 3: env=\"0\" → fallback 60_000 (default), import PASS", async () => {
    const useHook = await loadLifecycleWithEnv("0");
    expect(useHook).toBeDefined();
  });

  // case 4: 음수 "-1000" → fallback 60_000.
  it("case 4: env=\"-1000\" → fallback 60_000, import PASS", async () => {
    const useHook = await loadLifecycleWithEnv("-1000");
    expect(useHook).toBeDefined();
  });

  // case 5: "NaN" 문자열 → fallback 60_000.
  it("case 5: env=\"NaN\" → fallback 60_000, import PASS", async () => {
    const useHook = await loadLifecycleWithEnv("NaN");
    expect(useHook).toBeDefined();
  });

  // case 6: "Infinity" → fallback 60_000.
  it("case 6: env=\"Infinity\" → fallback 60_000, import PASS", async () => {
    const useHook = await loadLifecycleWithEnv("Infinity");
    expect(useHook).toBeDefined();
  });
});
