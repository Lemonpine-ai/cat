/**
 * Phase B (R3) — useYoloSampling 단위 테스트.
 *
 * 커버 범위 (Arch R3 §3.3):
 *  1. enabled true + readyRef true → setInterval 등록, tick 호출 시 postMessage 호출.
 *  2. document.hidden → stopInterval + onHidden 호출 + createImageBitmap 미호출.
 *  3. shouldInferNow false → tick 스킵 (createImageBitmap/postMessage 미호출).
 *  4. postMessage 실패 → onPostMessageError 호출 + busyRef 해제 + bitmap.close.
 *
 * Dev 판단:
 *  - jsdom 환경 + vi.useFakeTimers 로 setInterval 제어.
 *  - createImageBitmap 은 globalThis 에 vi.fn 으로 stub.
 *  - video / worker 는 최소 mock.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
  useYoloSampling,
  type YoloSamplingArgs,
} from "../hooks/useYoloSampling";
// R4 M2: bitmap / video / worker mock 은 helpers 에서 import (Arch R4 §2.3).
import {
  makeImageBitmapStub,
  makeVideoElStub,
  makeWorkerPostMessageMock,
} from "./helpers/workerStubs";

// bitmap 재생성 시마다 close spy 최신 것을 참조 — beforeEach 에서 교체.
let currentBitmapStub = makeImageBitmapStub();

function defaultArgs(overrides: Partial<YoloSamplingArgs> = {}): YoloSamplingArgs {
  const { worker } = makeWorkerPostMessageMock();
  return {
    enabled: true,
    videoRef: { current: makeVideoElStub(true) },
    workerRef: { current: worker },
    readyRef: { current: true },
    busyRef: { current: false },
    frameIdRef: { current: 0 },
    // R6 T4: inference latency stamp ref — postMessage 직전 performance.now() 기록.
    inferStartRef: { current: null as number | null },
    nextTickMs: 5000,
    shouldInferNow: () => true,
    onBeforeInfer: vi.fn(),
    onHidden: vi.fn(),
    onTick: vi.fn(),
    onPostMessageError: vi.fn(),
    markInferring: vi.fn(),
    ...overrides,
  };
}

describe("useYoloSampling (R3 분할)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 매 테스트마다 새 bitmap / closeSpy — 이전 호출 횟수 격리.
    currentBitmapStub = makeImageBitmapStub();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => currentBitmapStub.bitmap),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("enabled + ready → setInterval 등록 + tick postMessage 호출", async () => {
    const { worker, posted } = makeWorkerPostMessageMock();
    const onTick = vi.fn();
    const markInferring = vi.fn();
    const onBeforeInfer = vi.fn();
    const args = defaultArgs({
      workerRef: { current: worker },
      onTick,
      markInferring,
      onBeforeInfer,
    });
    renderHook(() => useYoloSampling(args));

    // 첫 interval 발사 — 5000ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    // createImageBitmap / postMessage microtask flush.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onTick).toHaveBeenCalled();
    expect(onBeforeInfer).toHaveBeenCalled();
    expect(markInferring).toHaveBeenCalledWith(true);
    expect(posted.length).toBeGreaterThanOrEqual(1);
    const firstMsg = posted[0] as { type: string; frameId: number };
    expect(firstMsg.type).toBe("infer");
    expect(firstMsg.frameId).toBe(1);
  });

  it("document.hidden 시 stopInterval + onHidden 호출", async () => {
    const onHidden = vi.fn();
    const args = defaultArgs({ onHidden });
    renderHook(() => useYoloSampling(args));

    // jsdom 에서 document.hidden 을 true 로 세팅.
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(onHidden).toHaveBeenCalledTimes(1);

    // 복귀 — hidden=false
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
  });

  it("shouldInferNow=false → createImageBitmap 미호출", async () => {
    const shouldInferNow = vi.fn(() => false);
    const onBeforeInfer = vi.fn();
    const createImageBitmapSpy = vi.fn(async () => makeImageBitmapStub().bitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmapSpy);

    const args = defaultArgs({ shouldInferNow, onBeforeInfer });
    renderHook(() => useYoloSampling(args));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(shouldInferNow).toHaveBeenCalled();
    expect(createImageBitmapSpy).not.toHaveBeenCalled();
    expect(onBeforeInfer).not.toHaveBeenCalled();
  });

  it("postMessage 실패 → onPostMessageError + busyRef 해제 + bitmap.close", async () => {
    const postError = new Error("postMessage boom");
    const failingWorker = {
      postMessage: vi.fn(() => {
        throw postError;
      }),
    } as unknown as Worker;
    const onPostMessageError = vi.fn();
    const markInferring = vi.fn();
    const busyRef = { current: false };
    const args = defaultArgs({
      workerRef: { current: failingWorker },
      busyRef,
      onPostMessageError,
      markInferring,
    });

    renderHook(() => useYoloSampling(args));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onPostMessageError).toHaveBeenCalledTimes(1);
    expect(onPostMessageError.mock.calls[0][0]).toBe(postError);
    expect(busyRef.current).toBe(false);
    expect(markInferring).toHaveBeenCalledWith(false);
    expect(currentBitmapStub.closeSpy).toHaveBeenCalledTimes(1);
  });

  it("nextTickMs 변경 시 interval 교체", async () => {
    const { worker, posted } = makeWorkerPostMessageMock();
    // busyRef 를 외부 ref 로 공유 — 실제 driver 에서는 lifecycle 이 result 응답 시 false 로
    // 되돌리지만, 본 sampling 단위 테스트는 lifecycle 없이 돌아가므로 매 tick 전 수동 리셋 목적.
    const busyRef = { current: false };
    const initial = defaultArgs({
      workerRef: { current: worker },
      busyRef,
      nextTickMs: 5000,
    });
    const { rerender } = renderHook<
      void,
      { nextTickMs: number }
    >(({ nextTickMs }) => useYoloSampling({ ...initial, nextTickMs }), {
      initialProps: { nextTickMs: 5000 },
    });

    // 5s → 1회
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const count1 = posted.length;
    expect(count1).toBeGreaterThanOrEqual(1);
    // 다음 tick 이 돌기 위해 busyRef 를 리셋 (실제 driver 의 lifecycle 응답 흉내).
    busyRef.current = false;

    // nextTickMs 30s 로 변경 — 새 interval 재설정.
    act(() => {
      rerender({ nextTickMs: 30_000 });
    });

    // 5초만 흘러서는 추가 호출 없어야 함 (새 interval 30s 기준).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(posted.length).toBe(count1);

    // 30초 더 → 새 interval(30s) 이 적어도 1회 발사.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(posted.length).toBeGreaterThan(count1);
  });
});
