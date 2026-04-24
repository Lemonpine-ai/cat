/**
 * Phase B (R7 §6.1 / R9 §5) — useYoloLatencyTracker 단위 테스트.
 *
 * 커버 (R9 §5 6→4 cases 통합):
 *  1. 정상 경로 + 엣지 케이스 mix (R7 §6.1 / 힌트 #8) — delta=0/NaN/Infinity/음수.
 *  2. invalidateStamp + clearBuffer 통합 — stamp/링버퍼 초기화 단일 흐름.
 *  3. enabled false → ref/state/링버퍼 reset.
 *  4. latencyRefs (driver healthRef 폴링용) — flush 시점 state 와 동기 갱신.
 *
 * Dev 판단: jsdom 환경 + vi.useFakeTimers 로 2초 flush interval 제어.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useYoloLatencyTracker } from "../hooks/useYoloLatencyTracker";

describe("useYoloLatencyTracker (R7 §1 / R9 §5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 케이스 1 (R9 §5 통합): 정상 경로 + delta 엣지 mix.
  //   정상 측정 (delta=150/80/300) 후 엣지 (0/NaN/Infinity/음수) 추가 호출 → 0 만 통과 + 정상 3개 유지.
  //   링버퍼 [80, 150, 300, 0] (4개). P50 (ceil(0.5*4)-1=1, 정렬 [0,80,150,300]) = 80. P95 = 300.
  it("정상 측정 3회 + 엣지 (delta=0/NaN/Infinity/음수) → 0 만 추가 통과 + flush 후 P50/P95 반영", () => {
    const { result } = renderHook(() => useYoloLatencyTracker({ enabled: true }));

    expect(result.current.inferLatencyP50Ms).toBeNull();

    // 정상 3회: delta 150 / 80 / 300.
    result.current.inferStartRef.current = 100;
    act(() => result.current.recordResult(250));
    result.current.inferStartRef.current = 200;
    act(() => result.current.recordResult(280));
    result.current.inferStartRef.current = 500;
    act(() => result.current.recordResult(800));

    // 엣지: delta=0 통과 / NaN, Infinity, 음수 모두 가드 제외.
    result.current.inferStartRef.current = 100;
    act(() => result.current.recordResult(100)); // delta=0 → push.
    result.current.inferStartRef.current = NaN;
    act(() => result.current.recordResult(200)); // NaN → 제외.
    result.current.inferStartRef.current = -Infinity;
    act(() => result.current.recordResult(200)); // Infinity → 제외.
    result.current.inferStartRef.current = 200;
    act(() => result.current.recordResult(100)); // -100 → 제외.

    act(() => vi.advanceTimersByTime(2_000));

    // 링버퍼 [150, 80, 300, 0] → 정렬 [0, 80, 150, 300]. P50 = 80. P95 = 300.
    expect(result.current.inferLatencyP50Ms).toBe(80);
    expect(result.current.inferLatencyP95Ms).toBe(300);
  });

  // 케이스 2 (R9 §5 통합): invalidateStamp 후 recordResult 무시 + clearBuffer 후 링버퍼 비움.
  it("invalidateStamp → recordResult 무시 → clearBuffer → 링버퍼 비움 → P50/P95 null", () => {
    const { result } = renderHook(() => useYoloLatencyTracker({ enabled: true }));

    // 정상 1회 측정 → 링버퍼 [50].
    result.current.inferStartRef.current = 100;
    act(() => result.current.recordResult(150));

    // invalidateStamp → stamp null.
    act(() => result.current.invalidateStamp());
    expect(result.current.inferStartRef.current).toBeNull();

    // stamp null 상태로 recordResult → 링버퍼 변경 0.
    act(() => result.current.recordResult(500));

    // 첫 flush — 링버퍼 [50] 만 반영.
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.inferLatencyP50Ms).toBe(50);

    // clearBuffer → 링버퍼/stamp 비움.
    act(() => result.current.clearBuffer());
    expect(result.current.inferStartRef.current).toBeNull();

    // 다음 flush — 빈 버퍼 → null.
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.inferLatencyP50Ms).toBeNull();
    expect(result.current.inferLatencyP95Ms).toBeNull();
  });

  // 케이스 3: enabled=false 전환 → 링버퍼/stamp/state 모두 reset.
  it("enabled=false 전환 → 링버퍼/stamp/state 모두 reset", () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof useYoloLatencyTracker>,
      { enabled: boolean }
    >(({ enabled }) => useYoloLatencyTracker({ enabled }), {
      initialProps: { enabled: true },
    });

    // 측정 1회 + flush.
    result.current.inferStartRef.current = 100;
    act(() => result.current.recordResult(300)); // delta=200
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.inferLatencyP50Ms).toBe(200);

    // disabled 전환.
    act(() => rerender({ enabled: false }));

    // state/ref 즉시 null.
    expect(result.current.inferLatencyP50Ms).toBeNull();
    expect(result.current.inferLatencyP95Ms).toBeNull();
    expect(result.current.inferStartRef.current).toBeNull();
  });

  // 케이스 4: latencyRefs (driver healthRef 폴링용) — flush 시점 state 와 동기 갱신.
  it("latencyRefs.p50Ref / p95Ref 가 flush 시점에 state 와 동일 값으로 갱신", () => {
    const { result } = renderHook(() => useYoloLatencyTracker({ enabled: true }));

    // 측정 2회 — delta 100 / 200.
    result.current.inferStartRef.current = 0;
    act(() => result.current.recordResult(100));
    result.current.inferStartRef.current = 0;
    act(() => result.current.recordResult(200));

    // flush 전: ref 는 아직 null.
    expect(result.current.latencyRefs.p50Ref.current).toBeNull();
    expect(result.current.latencyRefs.p95Ref.current).toBeNull();

    act(() => vi.advanceTimersByTime(2_000));

    // [100, 200] 정렬. P50 (ceil(0.5*2)-1=0) = 100. P95 (ceil(0.95*2)-1=1) = 200.
    expect(result.current.latencyRefs.p50Ref.current).toBe(100);
    expect(result.current.latencyRefs.p95Ref.current).toBe(200);
    expect(result.current.inferLatencyP50Ms).toBe(100);
    expect(result.current.inferLatencyP95Ms).toBe(200);
  });

  // 케이스 5 (R10 §3): prev-equal skip — 동일값 채워진 링버퍼 → 두 번째 flush 의 추가 렌더 비용 0/극소.
  //   링버퍼 [100, 100, ...] → P50=100, P95=100. setInferLatencyP50/P95Ms 가 prev===p50 → prev 반환.
  //   React 19 의 commit 동작상 functional updater 결과가 동일 참조면 child re-render 발생 0
  //   (또는 batch 1회 안에 흡수). 본 case 는 "prev-equal skip 이 동작해서 누적 렌더 폭증 안 함" 검증.
  //
  //   기준: 두 번째 flush 후 추가 렌더 ≤ 1회. (정확히 0 이 아닌 ≤1 인 이유: React 19 Strict Mode
  //   double-render / functional updater 1차 평가 등 환경 영향 흡수.)
  it("R10 §3: 링버퍼 동일값 [100, 100, ...] → 두 번째 flush 시 prev-equal skip 동작 (추가 렌더 ≤1)", () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useYoloLatencyTracker({ enabled: true });
    });
    const initialRenders = renderCount;

    // 5회 측정 — 모두 delta=100ms.
    for (let i = 0; i < 5; i += 1) {
      result.current.inferStartRef.current = 0;
      act(() => result.current.recordResult(100));
    }

    // 첫 flush — null → 100 변화 → setState 발생 → 리렌더 ≥1.
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.inferLatencyP50Ms).toBe(100);
    expect(result.current.inferLatencyP95Ms).toBe(100);
    const rendersAfterFirstFlush = renderCount;
    expect(rendersAfterFirstFlush).toBeGreaterThan(initialRenders);

    // 추가 5회 측정 — 모두 delta=100ms (링버퍼 가득 채움).
    for (let i = 0; i < 5; i += 1) {
      result.current.inferStartRef.current = 0;
      act(() => result.current.recordResult(100));
    }

    // 두 번째 flush — P50/P95 모두 100 그대로 → setState prev-equal skip → 추가 렌더 폭증 차단.
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.inferLatencyP50Ms).toBe(100);
    expect(result.current.inferLatencyP95Ms).toBe(100);
    // prev-equal skip 회귀 방지: 두 번째 flush 추가 렌더 ≤1 (skip 미작동 시 ≥2 누적 발생).
    expect(renderCount - rendersAfterFirstFlush).toBeLessThanOrEqual(1);
  });
});
