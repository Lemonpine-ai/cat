/**
 * Phase B (R5) — useBroadcasterYoloDriver renderHook 통합 테스트.
 *
 * 배경 (R5 Arch §2.2 권고 2):
 *  - 기존 `broadcasterYoloDriver.test.ts` 는 confirmFrames 시뮬레이터 기반.
 *    driver 훅 자체를 띄우지 않아 "OFF→ON 전환 시 healthRef 리셋 + 2초 내 flush" 같은
 *    실제 React 훅 동작은 검증되지 않았다.
 *  - 본 테스트는 `renderHook` 으로 driver 를 띄워 OFF→ON transient flush + disabled 시
 *    공용 상태 리셋 동작을 검증.
 *
 * 격리 전략:
 *  - Worker 는 `installWorkerStub()` 으로 stub (lifecycle 테스트와 동일 패턴).
 *  - Supabase client 는 `makeSupabaseStub()` 으로 chainable Proxy 반환 — 실제 IO 없음.
 *  - homeId/cameraId 를 null 로 두면 logger 본 effect 가 bail out → INSERT 안 일어남.
 *  - vi.useFakeTimers 로 health flush interval 2_000ms 를 시간이동 advance.
 *
 * Dev 판단:
 *  - driver 가 export 하지 않은 internal ref (healthRef 등) 는 직접 건드릴 수 없음.
 *    대신 외부 관찰 가능한 state (`result.current.health` / `currentBehavior`) 만 검증.
 *  - 신규 테스트 파일 추가 → vitest.config.ts include 에 한 줄 추가 필수.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
  useBroadcasterYoloDriver,
  type DriverArgs,
} from "../hooks/useBroadcasterYoloDriver";
import {
  installWorkerStub,
  makeSupabaseStub,
  clearLoggerArmSentinel,
} from "./helpers/workerStubs";
import type { SupabaseClient } from "@supabase/supabase-js";

// installWorkerStub: driver 가 lifecycle 훅을 통해 new Worker(...) 호출 시 가로챈다.
const workerStub = installWorkerStub();

/** 테스트마다 새 videoRef + supabase stub 생성 헬퍼. */
function makeArgs(overrides: Partial<DriverArgs> = {}): DriverArgs {
  const videoRef = { current: null as HTMLVideoElement | null };
  const { client } = makeSupabaseStub();
  return {
    videoRef,
    enabled: false,
    homeId: null,
    cameraId: null,
    identifiedCatId: null,
    supabaseClient: client as SupabaseClient,
    motionActive: false,
    ...overrides,
  };
}

describe("useBroadcasterYoloDriver — renderHook (R5 권고 2)", () => {
  beforeEach(() => {
    workerStub.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearLoggerArmSentinel();
  });

  // 케이스 1: flag OFF 상태에서 renderHook → health 가 초기값.
  //   driver 가 enabled=false 면 worker 안 만들고 ticksTotal 도 안 누적.
  it("flag OFF 상태 start 시 health 초기값 + worker 미생성", () => {
    const args = makeArgs({ enabled: false });
    const { result } = renderHook(() => useBroadcasterYoloDriver(args));

    // 초기 노출값 검증. R6 T4: inferLatencyP50Ms/P95Ms 필드 추가.
    expect(result.current.health).toEqual({
      ticksTotal: 0,
      inferSuccesses: 0,
      inferFailures: 0,
      lastBackendError: null,
      inferLatencyP50Ms: null,
      inferLatencyP95Ms: null,
    });
    expect(result.current.currentBehavior).toBeNull();
    expect(result.current.initStatus).toBe("idle");
    // OFF → worker 안 만들어짐 (CLAUDE.md #13 무손상 OFF 경로).
    expect(workerStub.createdWorkers.length).toBe(0);

    // 2초 advance — flush interval 도 안 돌므로 health 변화 없음.
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.health.ticksTotal).toBe(0);
  });

  // 케이스 2: OFF→ON 전환 → 첫 flush (2_000ms 후) 에서 health 가 새 초기값으로 노출.
  //   driver 의 disabled effect 가 healthRef 리셋 + healthDirtyRef=true 세팅 →
  //   ON 전환 후 flush interval 이 즉시 새 ref 값을 setHealth.
  it("OFF→ON 토글 시 healthRef 초기화 + 2초 flush 에서 ticksTotal=0 노출", () => {
    let currentArgs = makeArgs({ enabled: false });
    const { result, rerender } = renderHook(
      (args: DriverArgs) => useBroadcasterYoloDriver(args),
      { initialProps: currentArgs },
    );

    // 초기: OFF → health 초기값.
    expect(result.current.health.ticksTotal).toBe(0);

    // OFF → ON 전환. 같은 videoRef/supabaseClient 유지 (props 안정성 위해).
    currentArgs = { ...currentArgs, enabled: true };
    act(() => {
      rerender(currentArgs);
    });

    // ON 직후: lifecycle 훅이 worker 생성. flush 는 아직 안 돌았으므로 stale 가능.
    expect(workerStub.createdWorkers.length).toBe(1);

    // 2초 advance — flush interval 1회 실행 → setHealth({ ...healthRef.current })
    //   healthRef 는 disabled effect 에서 초기값으로 리셋 + healthDirtyRef=true.
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.health).toEqual({
      ticksTotal: 0,
      inferSuccesses: 0,
      inferFailures: 0,
      lastBackendError: null,
      inferLatencyP50Ms: null,
      inferLatencyP95Ms: null,
    });
  });

  // 케이스 3: ON 유지 상태에서 2초 flush 가 반복돼도 health 안정 노출.
  //   (2번째 flush 시점에 추가 변동 없으면 동일값 유지.)
  it("ON 유지 시 2초 flush 반복 — health 안정 노출", () => {
    const args = makeArgs({ enabled: true });
    const { result } = renderHook(() => useBroadcasterYoloDriver(args));

    // 첫 2초 flush.
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    const firstFlush = result.current.health;

    // 두 번째 2초 flush — healthDirtyRef=false 라면 setHealth 호출 안 됨 (참조 동일).
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.health).toEqual(firstFlush);
    expect(result.current.health.ticksTotal).toBe(0);
  });

  // 케이스 4: ON → OFF 전환 시 currentBehavior 가 null 로 리셋.
  //   driver 의 disabled effect 가 currentBehaviorRef.current=null + setCurrentBehavior(null).
  it("ON→OFF 전환 시 currentBehavior null 로 리셋", () => {
    let currentArgs = makeArgs({ enabled: true });
    const { result, rerender } = renderHook(
      (args: DriverArgs) => useBroadcasterYoloDriver(args),
      { initialProps: currentArgs },
    );

    // 초기 ON 상태에서 currentBehavior 는 null.
    expect(result.current.currentBehavior).toBeNull();

    // OFF 전환.
    currentArgs = { ...currentArgs, enabled: false };
    act(() => {
      rerender(currentArgs);
    });
    expect(result.current.currentBehavior).toBeNull();
    expect(result.current.initStatus).toBe("idle");
  });

  // 케이스 5: OFF 상태에서는 flush interval 자체가 등록 안 됨.
  //   2초가 두 번 흘러도 setHealth 가 안 호출됨 → 동일 health 객체 참조.
  it("OFF 상태 유지 — flush interval 미등록", () => {
    const args = makeArgs({ enabled: false });
    const { result } = renderHook(() => useBroadcasterYoloDriver(args));
    const initialHealthRef = result.current.health;

    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    // 동일 객체 참조 유지 (setHealth 안 호출).
    expect(result.current.health).toBe(initialHealthRef);
  });

  // R7 §6.2 case 4: ON → ready → result 3프레임 → confirmed → OFF → null.
  //   driver 가 worker stub 의 result 메시지를 받아 confirmFrames 로직으로 currentBehavior 를
  //   3프레임 동안 같은 classKey 로 채우면 confirmed 전환. 이후 OFF 시 null 로 리셋.
  it("R7 §6.2 case 4: ON → ready → result 3프레임 confirmed → OFF → currentBehavior null", () => {
    const initialArgs = makeArgs({
      enabled: true,
      homeId: null,
      cameraId: null,
    });
    const { result, rerender } = renderHook(
      (props: DriverArgs) => useBroadcasterYoloDriver(props),
      { initialProps: initialArgs },
    );

    // 1. ON 직후 currentBehavior=null, lifecycle worker 1개 생성.
    expect(result.current.currentBehavior).toBeNull();
    expect(workerStub.createdWorkers.length).toBe(1);

    // 2. worker stub 가 ready emit → initStatus=ready.
    const w = workerStub.createdWorkers[0];
    act(() => {
      w._emit("message", { data: { type: "ready", backend: "webgpu" } });
    });
    expect(result.current.initStatus).toBe("ready");

    // 3. result 3프레임 emit (CONFIRM_FRAMES_DAY=3 — 같은 classKey 반복).
    //    sampling 이 frameIdRef 를 ++하지 않으므로 driver 의 frameIdRef 는 0 유지.
    //    handleResult 는 frameId mismatch 와 무관 — driver 가 confirmFrames 만 본다.
    //    lifecycle 의 result 핸들러는 frameId 가 일치할 때만 onDetections 호출.
    //    frameIdRef 가 0 이고 emit frameId 도 0 이면 일치 → onDetections (=handleResult) 호출.
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        w._emit("message", {
          data: {
            type: "result",
            frameId: 0,
            detections: [
              {
                classId: 1,
                classKey: "sleeping",
                label: "sleeping",
                confidence: 0.9,
                bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
              },
            ],
          },
        });
      });
    }

    // 3프레임 동일 classKey → confirmed 전환 → currentBehavior 설정.
    expect(result.current.currentBehavior?.classKey).toBe("sleeping");
    expect(result.current.lastDetections.length).toBe(1);

    // 4. OFF 전환 → driver disabled effect → currentBehavior null + lastDetections [].
    act(() => {
      rerender({ ...initialArgs, enabled: false });
    });
    expect(result.current.currentBehavior).toBeNull();
    expect(result.current.lastDetections).toEqual([]);
    expect(result.current.initStatus).toBe("idle");
  });

  // R9 §7 case 6: confirmed → 동일 classKey 재 confirmed (변경 0) → NONE_KEY 3프레임 cleared → null.
  //   driver handleResult 의 confirmed 분기 가드 (currentBehaviorRef.current?.classKey === result.key)
  //   가 setCurrentBehavior 호출 방지 + cleared 분기 정상 작동 검증.
  it("R9 §7 case 6: confirmed → 동일 classKey 재 confirmed → NONE_KEY 3프레임 cleared → null", () => {
    const initialArgs = makeArgs({ enabled: true, homeId: null, cameraId: null });
    const { result } = renderHook(
      (props: DriverArgs) => useBroadcasterYoloDriver(props),
      { initialProps: initialArgs },
    );
    // 1. ON + ready emit.
    const w = workerStub.createdWorkers[0];
    act(() => {
      w._emit("message", { data: { type: "ready", backend: "webgpu" } });
    });
    // 헬퍼: sleeping 단일 detection 1프레임 emit.
    const emitSleeping = (confidence: number): void => {
      act(() => {
        w._emit("message", {
          data: {
            type: "result", frameId: 0,
            detections: [{
              classId: 1, classKey: "sleeping", label: "sleeping",
              confidence, bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
            }],
          },
        });
      });
    };
    // 2. sleeping 3프레임 → confirmed.
    for (let i = 0; i < 3; i += 1) emitSleeping(0.9);
    expect(result.current.currentBehavior?.classKey).toBe("sleeping");
    const firstConfirmed = result.current.currentBehavior;
    // 3. sleeping 3프레임 재 입력 → 참조 동일 유지 (setCurrentBehavior 호출 0).
    for (let i = 0; i < 3; i += 1) emitSleeping(0.85);
    expect(result.current.currentBehavior).toBe(firstConfirmed);
    // 4. NONE_KEY 3프레임 → cleared → currentBehavior null.
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        w._emit("message", { data: { type: "result", frameId: 0, detections: [] } });
      });
    }
    expect(result.current.currentBehavior).toBeNull();
    expect(result.current.lastDetections).toEqual([]);
  });

  // R10 §6 case 7: markInferring race 회귀 방지 — driver 첫 렌더 직후 markInferringRef 빈 함수
  //   초기값 + ref 동기화 effect 가 commit 후 채워지는 흐름. 첫 렌더 시점 isInferring=false,
  //   ready 메시지 분기는 markInferring 호출 안 함 (false 유지), result 메시지 분기에서 lifecycle
  //   이 markInferringRef.current(false) 호출 시 ref 동기화 완료 후라 정상 동작 (false 유지).
  //   회귀 가설: 향후 ref 동기화 effect 가 제거되거나 빈 함수 초기값이 다른 값으로 바뀌면
  //   본 case 가 isInferring 상태 잔존 false 검증으로 회귀 감지.
  it("R10 §6 case 7: 첫 렌더 markInferring 빈 함수 fallback → ready/result 후 isInferring 잔존 false (race 0)", () => {
    const initialArgs = makeArgs({ enabled: true, homeId: null, cameraId: null });
    const { result } = renderHook(
      (props: DriverArgs) => useBroadcasterYoloDriver(props),
      { initialProps: initialArgs },
    );

    // 첫 렌더 직후 — useDriverHealth 의 isInferring 초기값 false.
    expect(result.current.isInferring).toBe(false);

    // ON 직후 worker 생성 확인.
    const w = workerStub.createdWorkers[0];
    expect(w).toBeDefined();

    // ready 수신 — lifecycle ready 분기는 markInferring 호출 안 함 → isInferring 변화 0.
    act(() => {
      w._emit("message", { data: { type: "ready", backend: "webgpu" } });
    });
    expect(result.current.isInferring).toBe(false);

    // result 수신 — lifecycle 이 markInferringRef.current(false) 호출. renderHook 의 동기 commit
    //   특성상 첫 effect 가 이미 commit 완료 → ref 동기화 끝남 → driverHealth.markInferring(false)
    //   정상 호출. setIsInferring(false) (이미 false 라 변화 0).
    act(() => {
      w._emit("message", {
        data: {
          type: "result",
          frameId: 0,
          detections: [
            { classId: 1, classKey: "sleeping", label: "sleeping", confidence: 0.9, bbox: { x: 0, y: 0, w: 1, h: 1 } },
          ],
        },
      });
    });
    expect(result.current.isInferring).toBe(false);
    // 회귀 검증 보강: race 발생 시 markInferring 호출이 빈 함수 fallback 으로 손실되는데,
    //   본 case 의 detection 처리 결과가 정상 반영됐는지 lastDetections 로 간접 확인.
    expect(result.current.lastDetections.length).toBe(1);
  });
});
