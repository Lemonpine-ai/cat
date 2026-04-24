# Phase B Arch R7 — lifecycle 분할 + driver health stale 제거 + isInferring 단일 소유

> 작성: 1번 Arch Agent (R7, 독립 실행, 이전 대화 맥락 없음)
> 작성일: 2026-04-24
> 대상: Phase B R7 Dev (staging 반영) + R7 QA (9관점 독립 검증)
> 기준: `docs/phase_b_qa_r6.md` (PASS 4/9, MINOR 4 + 힌트 15) + `docs/phase_b_arch_r6.md` + `CLAUDE.md` + 현 staging 전체
> 관계: R3 (compose 분할) → R4 (STABLE_READY_MS) → R5 (관측성 초기) → R6 (관측성 + 실기기 + 응집도) → **R7 (lifecycle 재분할 + health stale 제거 + isInferring 단일 소유)**

---

## §0. R6 PASS 4/9 → R7 5/9 목표

R6 QA PASS 로 **9연속 카운트 4/9 진입**. 신규 REJECT 0, MINOR 4건 + 힌트 15개. R7 은 다음
4축 핵심 이슈를 **무손상 동작 보장 + LOC 한도 마진 확보 + 5/9 진입** 으로 처리한다.

### 0.1 R7 처리 매트릭스 (R6 힌트 15 → R7/R8 분배)

| 출처 | 항목 | R7 처리 | 사유 |
|------|------|--------|------|
| 힌트 #1 | 9연속 카운트 4/9 → 5/9 | **R7 결과 반영** | 자동 |
| 힌트 #2 | lifecycle 397 / driver 390 분할 | **R7 §1 / §2** | LOC 한도 마진 1순위 |
| 힌트 #3 | metadataFreeze logger 실코드 import | **R7 §4** | Dev TODO 1건 |
| 힌트 #4 | health flush deps latency 제거 | **R7 §2** | 분할과 함께 처리 |
| 힌트 #5 | isInferring 단일 소유 | **R7 §3** | T14 후속, R7 결정 |
| 힌트 #6 | renderHook case 4 ON→ready→confirmed→OFF→null | **R7 §6.2** | 신규 테스트 |
| 힌트 #7 | `pnpm build` chunks grep YoloDriverDiagBadge=0 | **R8 이월** (src/ 반영 PR 시 수행) | staging 단계에 측정 불가 |
| 힌트 #8 | latency delta 0/NaN/Infinity/음수 엣지 | **R7 §6.1** | 신규 테스트 |
| 힌트 #9 | DiagBadge React.memo 미사용 사유 주석 | **R7 §5.5 (D6)** | 1줄 주석 |
| 힌트 #10 | DiagBadge statusColorClass "retrying" dead | **R7 §5.3 (D4)** | MINOR-R6-NEW-4 |
| 힌트 #11 | field_test_plan §0 commit ID 메모 | **R7 §5.2 (D2)** | MINOR-R6-NEW-3 |
| 힌트 #12 | checklist §8 driver_health 신설 | **R7 §5.1 (D1)** | MINOR-R6-NEW-1 |
| 힌트 #13 | Cloudflare R2 사장님 진행상황 | **R8 이월** (사장님 작업, staging 무관) | - |
| 힌트 #14 | QA Agent Bash 권한 | **R7 §8** (팀장 권고) | 메타 |
| 힌트 #15 | Phase D Arch 초안 병렬 가능성 | **R8+ 이월** | R11 PASS 까지 보류 |

**R7 에서 8건 처리, R8 이월 4건, 자동/메타 3건.**

### 0.2 R7 산출물 요약 (Dev 가 받게 될 작업)

- **신규 파일 1개**: `staging/hooks/useYoloLatencyTracker.ts` (~110 LOC)
- **수정 파일 4개**: `useYoloWorkerLifecycle.ts` / `useBroadcasterYoloDriver.ts` /
  `YoloDriverDiagBadge.tsx` / `metadataFreeze.test.ts`
- **체크리스트/문서 수정 3개**: `phase_b_src_migration_checklist.md` (§8 신설) /
  `phase_b_field_test_plan.md` (§0 1줄 추가) / `useBroadcasterYoloDriver.ts` 헤더 1줄
- **신규 테스트 1 case**: yoloWorkerLifecycle.test 에 latency 엣지 4-in-1
- **신규 테스트 1 case**: broadcasterYoloDriver.renderHook.test 에 case 4
- **src/ 0 diff 강제** (CLAUDE.md #14 예외 적용 안 함, §4 결정)

### 0.3 R7 LOC 마진 목표

| 파일 | R6 LOC | R7 예상 LOC | 한도 | R7 마진 |
|------|--------|-------------|------|---------|
| `useYoloWorkerLifecycle.ts` | 397 | **≤290** (latency 분리 -67) | 400 | ≥110 ✅ |
| `useYoloLatencyTracker.ts` | (신규) | ~110 | 400 | 290 |
| `useBroadcasterYoloDriver.ts` | 390 | **≤340** (health flush 단순화 -50) | 400 | ≥60 ✅ |
| `useYoloSampling.ts` | 230 | 230 (변경 없음) | 400 | 170 |
| `YoloDriverDiagBadge.tsx` | 93 | 93 (주석 정리만) | 100 | 7 |
| `CameraBroadcastYoloMount.tsx` | 89 | 89 (변경 없음) | 100 | 11 |
| `metadataFreeze.test.ts` | 146 | **≤100** (mirror 도입 +0, 테스트 단순화) | 무제한 | - |

**R7 LOC 정책 (강화):** 분할 후 lifecycle / latency tracker / driver 모두 `≤350` 목표,
`>350` 일 시 R7 Arch 와 재상의 후 진행 (R7 §9 LOC 표 참조).

---

## §1. lifecycle 분할 — `useYoloLatencyTracker.ts` 신설 (A 항목, 힌트 #2)

### 1.1 분할 경계 / 책임 분담

R6 lifecycle 397 LOC 의 책임을 grep 으로 분류:

| 책임 영역 | 현 lifecycle line | LOC | 분할 후 위치 |
|----------|-------------------|-----|--------------|
| Worker 생성 / dispose / retry | 23-294 | ~270 | `useYoloWorkerLifecycle.ts` (유지) |
| `STABLE_READY_MS` 60s 타이머 | 47-55, 191-203, 240-243, 286-290, 348-360 | ~50 | `useYoloWorkerLifecycle.ts` (유지) |
| `armBehaviorLogger` arm/disarm | 341-346 | ~6 | `useYoloWorkerLifecycle.ts` (유지) |
| **R6 T4 latency 링버퍼 + flush** | 67-76, 134-136, 146-149, 210-220, 226-229, 259, 291-293, 363-384 | ~67 | **`useYoloLatencyTracker.ts` (신규)** |

**분할 원칙:**
- lifecycle = "Worker 의 born → dead 까지 한 사이클의 모든 부수효과" 단일 책임.
- latency tracker = "stamp 받기 → 링버퍼 누적 → P50/P95 state flush" 측정 도메인.
  Worker 의 존재 자체와 독립 (Worker 가 없는 시기에는 enabled=false 로 들어와 reset).

### 1.2 데이터 흐름 (inferStartRef / latencyBuffer / P50 / P95)

```
[sampling]
  postMessage 직전 → tracker.inferStartRef.current = performance.now()
       ↓
[lifecycle]
  worker.onmessage(result) →
    if (msg.frameId === frameIdRef.current && tracker.inferStartRef.current !== null) {
      tracker.recordResult(performance.now())   // ← 신규 API
    }
    onDetectionsRef.current(...) + onSuccessRef.current()
       ↓
[tracker (내부)]
  recordResult(now): const delta = now - inferStartRef.current
                    if (Number.isFinite(delta) && delta >= 0) buf.push(delta)
                    if (buf.length > 10) buf.shift()
                    inferStartRef.current = null

  setInterval 2s → setInferLatencyP50Ms / setInferLatencyP95Ms (prev-equal skip)

  enabled false → reset(): buf=[], inferStartRef.current=null, P50/P95 state=null
```

**핵심 결정:**
- `inferStartRef` 의 **소유권은 tracker** 로 이전. lifecycle 은 tracker 의 ref 를 prop 으로
  받지 않는다 — sampling 만 tracker 의 ref 에 쓰고 lifecycle 은 tracker 의 메서드 호출.
- lifecycle 의 result 핸들러는 `tracker.recordResult(performance.now())` 1줄 호출만.
  (현 lifecycle line 211-220 의 `startedAt = inferStartRef.current; if (...) { delta = ...; buf.push(...) }`
  9줄 → 1줄 축약.)
- lifecycle 의 error 핸들러는 `tracker.invalidateStamp()` 1줄 호출 (line 226-229 의 `inferStartRef.current = null` 대체).
- lifecycle 의 disposeWorker 는 `tracker.invalidateStamp() + tracker.clearBuffer()` 2줄 호출
  (line 291-293 대체).

### 1.3 export 시그니처 + driver 호환

**`useYoloLatencyTracker.ts` 의 export:**

```ts
export interface YoloLatencyTrackerArgs {
  /** lifecycle 의 enabled 와 동일 — disabled 시 내부 reset. */
  enabled: boolean;
}

export interface YoloLatencyTrackerResult {
  /** sampling 이 postMessage 직전 performance.now() 기록. lifecycle 은 읽기 전용. */
  inferStartRef: MutableRefObject<number | null>;

  /** lifecycle 의 result 핸들러가 호출 — delta 계산 + 링버퍼 push. */
  recordResult: (nowMs: number) => void;

  /** lifecycle 의 error/dispose 경로가 호출 — stamp 만 무효화 (링버퍼 유지). */
  invalidateStamp: () => void;

  /** lifecycle 의 disposeWorker 가 호출 — 새 세션 진입 시 링버퍼 초기화. */
  clearBuffer: () => void;

  /** dev 배지가 driver 경유로 읽음. 2s prev-equal skip 으로 re-render 최소. */
  inferLatencyP50Ms: number | null;
  inferLatencyP95Ms: number | null;
}

export function useYoloLatencyTracker(args: YoloLatencyTrackerArgs): YoloLatencyTrackerResult;
```

**driver 호환 결정 (가장 중요):**
- driver 는 **lifecycle 만 import 한다** (현 구조 유지). tracker 직접 접근 X.
- lifecycle 내부에서 tracker 를 합성하고, lifecycle 의 `YoloWorkerLifecycleResult` 에
  기존처럼 `inferStartRef` / `inferLatencyP50Ms` / `inferLatencyP95Ms` 를 노출 (tracker 결과를 그대로 forward).
- 즉 driver 와 sampling 은 변경 0 (Mount 무영향 보장).

**lifecycle 새 시그니처 (변경 없음 — driver 가 보는 인터페이스 유지):**

```ts
export interface YoloWorkerLifecycleResult {
  workerRef: Readonly<MutableRefObject<Worker | null>>;
  readyRef: Readonly<MutableRefObject<boolean>>;
  busyRef: MutableRefObject<boolean>;
  inferStartRef: MutableRefObject<number | null>;     // ← tracker 결과 forward
  initStatus: InitStatus;
  retryAttempt: number;
  backend: WorkerBackend;
  inferLatencyP50Ms: number | null;                   // ← tracker 결과 forward
  inferLatencyP95Ms: number | null;                   // ← tracker 결과 forward
}
```

### 1.4 LOC 예측

| 파일 | R6 LOC | R7 예상 |
|------|--------|---------|
| `useYoloLatencyTracker.ts` (신규) | - | ~110 (헤더 25 + 본체 60 + 주석 25) |
| `useYoloWorkerLifecycle.ts` | 397 | ~290 (latency 부분 제거 -67, tracker 호출 합성 +5, JSDoc 정리 -15, R7 분리 주석 +10) |
| `useBroadcasterYoloDriver.ts` | 390 | ~340 (§2 health flush 단순화 -50) |

**검증 기준:** lifecycle ≤300, tracker ≤120, driver ≤350 모두 통과 시 §1 OK.

---

## §2. driver health flush deps 개선 (B 항목, 힌트 #4)

### 2.1 옵션 X / Y / Z 비교 + R7 결정

R6 의 driver line 300-323 health flush effect 가 deps 에 `lifecycle.inferLatencyP50Ms` /
`P95Ms` 를 포함 → 값 변화 시마다 cleanup + 새 interval (2-4초 stale window).

**옵션 비교:**

| 옵션 | 핵심 | 장점 | 단점 | 호환 |
|------|------|------|------|------|
| **X** | lifecycle = state + ref 둘 다 노출. driver healthRef 는 ref 읽기, Badge 는 state 읽기 | 두 사용처 분리 명확 | tracker 가 양 쪽 다 유지 — 복잡 | OK |
| **Y** | lifecycle = ref 만 + getter 함수, Badge 는 useSyncExternalStore | re-render 최소화 | useSyncExternalStore 학습 곡선 + Badge 전용 추가 코드 | OK |
| **Z** | 현 구조 유지 + deps 만 제거 + 별도 ref-to-ref 동기화 effect | 변경 최소 | tracker state 와 ref 가 불일치 가능 (1-tick 정도) | OK |

**R7 결정: 옵션 X 채택.**

**근거:**
1. **§1 의 tracker 분리와 자연스럽게 합쳐짐.** tracker 가 P50/P95 state 를 관리하고
   ref 한 쌍 (`p50Ref` / `p95Ref`) 도 동시 노출. driver 의 healthRef 는 ref 만 읽음 (deps 0).
2. **Badge 는 driver state 의 health.inferLatencyP50Ms 를 그대로 읽음** — 별도 hook 학습 없이 표준 React 데이터 흐름 유지.
3. **deps 단순화 효과 측정 가능** — driver health flush deps `[enabled]` 1개로 환원.
   2초 주기 setInterval 재생성 0.

**옵션 Y 기각:** useSyncExternalStore 는 store 가 외부 (예: Redux / Zustand) 일 때 적합. tracker
내부 state 라면 React 표준 흐름이 더 단순.
**옵션 Z 기각:** tracker state ↔ ref 불일치 가능성 + 동기화 effect 추가 라인 → §1 의 분리와 중복.

### 2.2 driver 분할 여부 (`useDriverHealth.ts` 신설?)

**R7 결정: driver 추가 분할 안 함 (R8 이월).**

**근거:**
- R7 의 §1 (latency tracker 분리) + §2.1 옵션 X (deps 제거) 만으로 driver LOC 가 ~340 (마진 60).
- 추가 분할 (`useDriverHealth.ts` 신설) 은 driver 의 6개 책임 (handleResult / onBeforeInfer / onHidden / health bump / health flush / logger 주입) 중 health 만 떼는 셈 — 분리 후 driver 가 healthRef + bump 콜백을 prop 으로 전달하는 구조가 오히려 복잡.
- driver 350 LOC 미만 유지가 깨질 시 R8 에서 분할 재검토 (R7 §10 이월).

### 2.3 LOC 예측 + 새 driver health flush effect 명세

**driver line 300-323 (현 24 줄)** → R7 후 ~10 줄:

```ts
// R7 §2: latency 는 tracker 의 ref 를 healthRef 가 직접 읽음 → deps 단순화.
useEffect(() => {
  if (!enabled) return;
  const id = window.setInterval(() => {
    // 매 tick: tracker ref 값을 healthRef 에 동기화 (불변 객체 setHealth 발동 조건 비교).
    healthRef.current.inferLatencyP50Ms = lifecycle.latencyRefs.p50Ref.current;
    healthRef.current.inferLatencyP95Ms = lifecycle.latencyRefs.p95Ref.current;
    if (!healthDirtyRef.current) {
      // bump 가 없었어도 latency 변화만으로 setHealth (prev-equal skip).
      setHealth((prev) =>
        prev.inferLatencyP50Ms === healthRef.current.inferLatencyP50Ms &&
        prev.inferLatencyP95Ms === healthRef.current.inferLatencyP95Ms
          ? prev
          : { ...healthRef.current },
      );
      return;
    }
    healthDirtyRef.current = false;
    setHealth({ ...healthRef.current });
  }, HEALTH_FLUSH_INTERVAL_MS);
  return () => window.clearInterval(id);
}, [enabled]);   // ← deps 1개로 단순화 (R6 는 3개)
```

**lifecycle 의 추가 노출:**

```ts
export interface YoloWorkerLifecycleResult {
  // ... 기존 ...
  /** R7 §2: driver healthRef 가 deps 없이 폴링하기 위한 ref 한 쌍. */
  latencyRefs: {
    p50Ref: Readonly<MutableRefObject<number | null>>;
    p95Ref: Readonly<MutableRefObject<number | null>>;
  };
  // inferLatencyP50Ms / inferLatencyP95Ms 는 dev 배지가 driver 경유로 읽도록 그대로 유지.
}
```

**효과:** driver health flush effect 의 deps `[enabled, lifecycle.inferLatencyP50Ms, lifecycle.inferLatencyP95Ms]` (3) → `[enabled]` (1). 2초 주기 cleanup + 새 interval 발생 0. stale window 2-4초 제거.

---

## §3. isInferring 단일 소유 (C 항목, 힌트 #5 / R6 T14 후속)

### 3.1 옵션 A / B 비교 + R7 결정

**현 상태 (R6):**
- driver line 127 `const [isInferring, setIsInferring] = useState(false);`
- driver line 273 (lifecycle prop) + line 292 (sampling prop) — `setIsInferring` 양 쪽에 주입.
- 쓰기 주체 3곳:
  · sampling tick (line 160) — `setIsInferringRef.current(true)` (postMessage 직전)
  · sampling catch (line 175) — `setIsInferringRef.current(false)` (postMessage 실패)
  · lifecycle handleWorkerMessage (line 209 / 228) — `setIsInferringRef.current?.(false)` (result/error 수신)
  · driver disabled reset (현 effect 안에는 직접 setIsInferring 호출 없음 — `[enabled]` deps 의 다른 setter 만 호출. `isInferring` 은 sampling/lifecycle 로 자동 false 로 수렴 가정. R6 코멘트는 정확하지 않음.)

**옵션 비교:**

| 옵션 | 핵심 | 장점 | 단점 |
|------|------|------|------|
| **A** | sampling 이 단독 소유 (sampling 만 setIsInferring), lifecycle 은 onResult 콜백으로 false 신호 | 진입점이 sampling tick → 자연스러운 데이터 소유. lifecycle 의 setIsInferring prop 제거 | sampling 의 LOC 증가 (state 1개 추가) + driver 가 sampling 결과 받기 어려워짐 (현재 sampling 은 void return). |
| **B** | driver 가 단일 callback `markInferring(state: boolean)` 만 노출, sampling 과 lifecycle 둘 다 같은 callback 호출 | driver state 는 driver 가 단독 set (1곳). sampling/lifecycle 은 callback 만 호출 — 쓰기 주체 추적이 driver line 1개로 수렴 | 쓰기 호출 자체는 여전히 2곳 (sampling tick + lifecycle result/error). 단일 진입점이지만 멀티 소비자. |

**R7 결정: 옵션 B 채택.**

**근거:**
1. **driver 의 state 단일 소유 보장** — `useState` 와 `setState` 가 한 컴포넌트 안에 머무름.
   리뷰어 관점에서 "누가 isInferring 을 쓰는가?" → "driver 의 markInferring 이 유일" 1곳.
2. **sampling/lifecycle 은 callback 만 받음** — props 시그니처 변화 최소 (기존 setIsInferring 을 markInferring 으로 이름 변경 + 시그니처 동일).
3. **옵션 A 의 부수효과 큼** — sampling 은 React state 를 갖지 않는 "sampling 단일 책임 훅"
   원칙을 깨뜨림 (R6 §1.4 sampling 설계 원칙). sampling 이 state 갖는 순간 driver 가 sampling 의
   결과를 받기 위한 새 인터페이스 (콜백 / ref) 가 필요해짐 → 더 복잡.
4. **R7 변경 비용 최소** — driver 에 `markInferring = useCallback((v) => setIsInferring(v), [])` 1줄
   추가, lifecycle/sampling 의 prop 이름 변경 (`setIsInferring` → `markInferring`) 만 적용.

### 3.2 R7 vs R8 반영 시점 판단

**R7 결정: R7 에 반영.** R8 이월 안 함.

**근거:**
- 옵션 B 의 변경 범위가 작음 — driver/lifecycle/sampling 각 1-2줄 + tests prop 이름 sweep.
- §1 분할과 §2 deps 제거가 driver 의 LOC 를 줄이므로 R7 한 라운드에서 함께 반영 가능 (LOC 마진 OK).
- T14 가 R6 에 주석으로만 남았는데 R7 에 미해결 시 "주석 → R7 도 안 됨 → R8 이월" 누적이 R8 부담 가중.

### 3.3 R7 적용 명세

**driver 변경:**

```ts
// driver line 127 그대로 (state 선언):
const [isInferring, setIsInferring] = useState(false);

// driver 새 헬퍼 (line 130 직후 또는 #5 헬퍼 섹션 끝에):
// R7 §3 옵션 B: isInferring 단일 진입점. sampling/lifecycle 이 호출.
const markInferring = useCallback((v: boolean): void => {
  setIsInferring(v);
}, []);

// driver line 273 (lifecycle prop) + line 292 (sampling prop) — `setIsInferring` 을 `markInferring` 으로:
const lifecycle = useYoloWorkerLifecycle({
  // ... 기존 ...
  markInferring,   // ← 이름 변경
});

useYoloSampling({
  // ... 기존 ...
  markInferring,   // ← 이름 변경
});
```

**lifecycle 변경:**

```ts
export interface YoloWorkerLifecycleArgs {
  // ... 기존 ...
  /** R7 §3: driver 가 노출한 단일 진입점. result/error 시 false 호출.
   *  R6 까지의 `setIsInferring?` (옵셔널) → R7 부터 필수 callback. */
  markInferring: (v: boolean) => void;
}

// handleWorkerMessage 안에서:
//   현 line 209: setIsInferringRef.current?.(false);   →  markInferringRef.current(false);
//   현 line 228: setIsInferringRef.current?.(false);   →  markInferringRef.current(false);
```

**sampling 변경:**

```ts
export interface YoloSamplingArgs {
  // ... 기존 ...
  /** R7 §3: driver 가 노출한 단일 진입점. tick / catch 시 호출. */
  markInferring: (v: boolean) => void;
}

// tick 안에서:
//   현 line 160: setIsInferringRef.current(true);   →  markInferringRef.current(true);
//   현 line 175: setIsInferringRef.current(false);  →  markInferringRef.current(false);
```

**테스트 변경:**
- `staging/tests/yoloWorkerLifecycle.test.ts` — `setIsInferring: vi.fn()` 호출 0건 (R6 도 prop 미주입). 변경 없음 (옵셔널 → 필수 변경에도 호출이 없으면 컴파일 OK 위해 `markInferring: vi.fn()` 으로 테스트 fixture 만 갱신).
- `staging/tests/broadcasterYoloDriver.renderHook.test.ts` — driver 호출 시 markInferring 자동 주입 (driver 내부에서 생성). 변경 없음.
- `staging/tests/broadcasterYoloDriver.test.ts` — 동일.

### 3.4 호환성 검증 (CLAUDE.md 9관점 R8)

- **driver 외부 API (`DriverArgs` / `DriverResult`)**: 변경 없음. Mount 무영향.
- **lifecycle / sampling props 의 setIsInferring 이름 변경**: 외부 사용처는 driver 1곳뿐 (lifecycle/sampling 모두 driver 가 호출) — sweep 후 0 회귀.
- **isInferring state 의 동작 의미**: 동일. driver 가 setState 하는 위치는 markInferring 콜백 → 결국 같은 `setIsInferring(v)` 호출 → 회귀 0.

---

## §4. metadataFreeze 개선 (D 항목, 힌트 #3 / MINOR-R6-NEW-2 — CLAUDE.md #14 예외 검토)

### 4.1 src/ 수정 vs staging mirror 옵션 비교

R6 metadataFreeze.test 가 `buildMetadataForTest()` 복사본 사용 → logger 변경 시 검증 안 됨.

**옵션 비교:**

| 옵션 | 핵심 | CLAUDE.md #14 적용 | 장점 | 단점 |
|------|------|-------------------|------|------|
| **P** | `src/hooks/useBehaviorEventLogger.ts` 에 `export function buildBehaviorEventMetadata(detection, modelVersion)` 분리 + logger 본체가 호출. test 가 src 함수 import | **#14 예외 적용 — atomic deploy + Vercel READY 확인 필수** | freeze 의도 100% 달성 — logger 변경 즉시 테스트가 자동 검증 | src/ 수정 = #13 무손상 원칙의 예외 근거 필요 |
| **Q** | `staging/lib/behavior/buildBehaviorEventMetadata.ts` 신설 + logger 본체는 미수정 + test 가 staging 함수 import | #13 그대로 (staging 만) | src/ 수정 0 — 안전 | freeze 의도 50% — logger 가 staging 함수를 호출하지 않으므로 logger 변경 시 staging 함수와 어긋날 수 있음 |
| **R** | mirror + Phase B src/ 반영 PR 시점에 src/ 로 합치기 (mirror 의 함수가 logger 의 함수가 됨) | #13 (staging 단계) → #14 (src/ 반영 PR) | freeze 의도 100% (PR 시점에) + 단계적 검증 | 2단계 (R7 mirror + 향후 src/ 합치기) — 개발 추적 부담 |

### 4.2 R7 결정 + 적용 절차

**R7 결정: 옵션 R 채택 (mirror 도입 — staging 단계, src/ 합치기는 Phase B src/ 반영 PR 로 이월).**

**근거:**
1. **CLAUDE.md #14 예외는 "데이터 모델 변경" 에 한함.** logger 의 함수 분리는 데이터 모델 변경
   X (DB 스키마 / 12 클래스 / metadata 4 필드 모두 그대로). 단순 함수 export 분리 = 일반 리팩터링.
2. **#13 staging 무손상 원칙은 "src/ 기존 훅/컴포넌트는 절대 수정 금지" 인데**, src/ logger 본체
   수정 = flag OFF 경로 영향 가능성 있음 (R7 staging 단계에서 src/ logger 수정 시 즉시 prod 영향
   = beta 사용자 7명 / 가족 4명 영향).
3. **옵션 P 의 atomic deploy 부담** — Phase B 의 9연속 PASS 미달성 상태에서 src/ 변경 PR 분리는 추적 어려움.
4. **옵션 Q 는 freeze 의도 미달성** — mirror 가 logger 와 동기화 안 됨.
5. **옵션 R 의 2단계는 추적 가능** — R7 mirror 시 logger line 225-236 과 mirror 의 코드를 1:1 비교 주석으로 남김. Phase B src/ 반영 PR 시 mirror → src/ 합치기는 mechanical (변경 0).

**옵션 R 적용 절차 (R7 Dev TODO):**

1. 신규 파일 `staging/lib/behavior/buildBehaviorEventMetadata.ts` 신설 (≤45 LOC):

```ts
/**
 * Phase B (R7 §4) — Phase A logger 의 metadata 조립 로직 mirror.
 *
 * 목적:
 *  - `cat_behavior_events.metadata` JSONB freeze 검증을 위해 logger 본체의 조립 로직을
 *    독립 순수 함수로 추출. logger 본체는 R7 단계에서는 수정하지 않고, Phase B src/ 반영
 *    PR 시점에 본 함수로 치환 합치기 (CLAUDE.md #13 staging 무손상 원칙 준수).
 *
 * ⚠️ 동기화 약속 (R7 §4.2):
 *  - 본 함수의 코드는 `src/hooks/useBehaviorEventLogger.ts` line 225-236 의 metadata 조립
 *    블록과 1:1 동치이어야 한다. 변경 시 src/ 합치기 PR 까지 상시 정합성 유지.
 *  - 정합성 깨짐을 방지하기 위해 본 파일과 src/ logger 의 metadata 블록 양쪽에 동일 헤더
 *    `// metadata-freeze-spec: r7-1` 같은 마커를 두고 grep 으로 자동 검증 권고 (R8 이월 가능).
 *
 * Phase D 착수 시점까지 freeze 대상 4 필드:
 *  · model_version    — string, 항상
 *  · top2_class       — string, detection.top2Class !== undefined 일 때만
 *  · top2_confidence  — number, typeof === "number" 일 때만 (NaN 포함 — 현 동작 유지)
 *  · bbox_area_ratio  — number, typeof === "number" 일 때만 (NaN 포함 — 현 동작 유지)
 */

import type { BehaviorDetection } from "../../types/behavior";

export function buildBehaviorEventMetadata(
  detection: BehaviorDetection,
  modelVersion: string,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { model_version: modelVersion };
  if (detection.top2Class !== undefined) {
    metadata.top2_class = detection.top2Class;
  }
  if (typeof detection.top2Confidence === "number") {
    metadata.top2_confidence = detection.top2Confidence;
  }
  if (typeof detection.bboxAreaRatio === "number") {
    metadata.bbox_area_ratio = detection.bboxAreaRatio;
  }
  return metadata;
}
```

2. `staging/tests/metadataFreeze.test.ts` 수정:
   - line 26-42 의 `buildMetadataForTest` 로컬 정의 삭제.
   - `import { buildBehaviorEventMetadata } from "../lib/behavior/buildBehaviorEventMetadata";` 추가.
   - 7 개 case 의 `buildMetadataForTest` 호출을 `buildBehaviorEventMetadata` 로 sweep.
   - 헤더 JSDoc 의 §6-§16 (테스트 대상 설명) 을 "옵션 R mirror" 로 갱신.

3. **`staging/docs/phase_b_src_migration_checklist.md` §6 (R5+ 이관 항목) 또는 §7 끝에
   "**R7-S** logger metadata 조립 블록 mirror 합치기" 1줄 항목 추가:**
   ```
   - [ ] **R7-S** (R7 §4 옵션 R 후속): src/ 반영 PR 시 `staging/lib/behavior/buildBehaviorEventMetadata.ts`
         를 `src/lib/behavior/` 로 이전 + `src/hooks/useBehaviorEventLogger.ts` line 225-236 을
         `buildBehaviorEventMetadata(detection, BEHAVIOR_MODEL_VERSION)` 호출 1줄로 치환.
         #14 예외 적용: atomic deploy (단일 PR), Vercel READY+PROMOTED 확인, Rollback 경로 메모.
   ```

**효과:**
- staging 단계: freeze 의도 80% (mirror 의 코드 = src/ 의 코드, 단 자동 동기화 X 주석으로 수동 정합성).
- src/ 반영 PR 시점: 100% (logger 본체가 mirror 함수를 호출 — 변경 즉시 테스트 검증).

---

## §5. MINOR 4건 처리

### 5.1 D1: MINOR-R6-NEW-1 — checklist §8 신설 (driver_health 프로덕션 100+ 설계 — 힌트 #12)

**파일:** `staging/docs/phase_b_src_migration_checklist.md`
**위치:** 현 §7.6 끝 (line 379) 직후 **§8 신설**.
**LOC:** ≤25.

**§8 명세 (Dev 가 그대로 paste):**

```
---

## §8 프로덕션 100+ 전환 시 driver_health 테이블 + Edge Function 샘플링 (R7 D1 / R6 §3.4 후속)

R6 §3.4 에서 베타 단계 driver_health row INSERT 는 DB 부하 (베타 7명 × 5s tick × 24h
= 120,960 row/일 × Nano pool 15 한계) 로 **기각**. 프로덕션 100+ 사용자 도달 시점에 이 항목을 재검토.

### §8.1 채택 트리거
- CLAUDE.md §🟣 운영 모드 표 기준으로 사용자 100+ 도달 시점.
- 또는 사장님이 "iOS 실기기 latency 추세를 7일 단위 차트로 보고 싶다" 같은 운영 needs 발생 시.

### §8.2 테이블 설계 (안)

```sql
CREATE TABLE driver_health_samples (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  home_id UUID NOT NULL,
  camera_id UUID NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  backend TEXT,                 -- "webgpu" | "webgl" | "wasm" | NULL
  regime TEXT,                  -- "day-active" | "night" | "idle-throttled"
  init_status TEXT,             -- "idle" | "loading" | "ready" | "failed"
  retry_attempt INT,
  ticks_total BIGINT,
  infer_successes BIGINT,
  infer_failures BIGINT,
  infer_latency_p50_ms NUMERIC,
  infer_latency_p95_ms NUMERIC
);

ALTER TABLE driver_health_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select" ON driver_health_samples FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "owner insert" ON driver_health_samples FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_driver_health_camera_time
  ON driver_health_samples (camera_id, recorded_at DESC);
```

### §8.3 샘플링 주기 / 채널
- **Edge Function**: `POST /api/driver-health` — 클라이언트가 5분에 1회 본인 health snapshot 전송.
- 주기 = 5분 (tick 1초당 X 가 아닌, 사용자당 12 row/시간 → 100명 × 12 × 24 = 28,800 row/일, Nano 한도 내).
- **Realtime 구독 X** — 사장님 차트는 fetch 또는 cron 으로 일별 집계.

### §8.4 driver 측 변경
- `useBroadcasterYoloDriver` 의 health flush effect 에 5분 주기 health snapshot POST 추가.
- 베타 단계는 NEXT_PUBLIC_DRIVER_HEALTH_REPORT=0 (default OFF) 로 비활성.
```

### 5.2 D2: MINOR-R6-NEW-3 — field_test_plan §0 commit ID 메모 (힌트 #11)

**파일:** `staging/docs/phase_b_field_test_plan.md`
**위치:** §0 의 5개 체크박스 끝 (현 line 27) **직후 1줄 추가** (체크박스 1개).

**추가 1줄:**

```
- [ ] **0-6 이전 PROMOTED commit ID 메모** — Vercel MCP `getDeployments` 또는 대시보드에서
      현재 production 의 SHA(40자) 를 메모해 둔다. §6 실패 시 Instant Rollback 대상.
      (R7 D2 / MINOR-R6-NEW-3 해소.)
```

**§0 체크박스 5개 → 6개로 증가** — 31 → 32 체크박스. R6 T11 의 "20개 이상" 조건 유지.

### 5.3 D3 (NEW-2 = §4) + D4: MINOR-R6-NEW-4 DiagBadge statusColorClass 주석 정리 (힌트 #10)

**파일:** `staging/components/YoloDriverDiagBadge.tsx`
**위치:** line 30-36 의 statusColorClass 주석 + line 9 의 호버 툴팁 설명.

**현 line 30-36:**
```ts
/**
 * initStatus 에 따른 배지 배경색 클래스.
 * - ready: 정상 → 녹색
 * - loading: ONNX 초기화 중 → 노랑
 * - failed|retrying: 문제 상황 → 빨강
 * - idle: 비활성 → 회색
 */
function statusColorClass(initStatus: DriverResult["initStatus"]): string {
```

**R7 후 line 30-36 (수정):**
```ts
/**
 * initStatus 에 따른 배지 배경색 클래스.
 * - ready: 정상 → 녹색
 * - loading: ONNX 초기화 중 → 노랑
 * - failed: 5회 재시도 모두 소진 → 빨강
 * - idle: 비활성 → 회색
 *
 * (R7 D4 / MINOR-R6-NEW-4: "retrying" 은 InitStatus 타입에 없음 — 제거.
 *  retry 진행 상태는 driver.retryAttempt 숫자로 별도 노출.)
 */
function statusColorClass(initStatus: DriverResult["initStatus"]): string {
```

**현 line 9:**
```
 *    · 색상: initStatus ready=녹색 / loading=노랑 / retrying|failed=빨강
```

**R7 후 line 9 (수정):**
```
 *    · 색상: initStatus ready=녹색 / loading=노랑 / failed=빨강 / idle=회색
```

**`InitStatus` 타입 변경 안 함** (lifecycle line 58 의 `"idle" | "loading" | "ready" | "failed"` 유지).
실코드 line 39 `if (initStatus === "failed")` 는 정확 — 변경 0.

### 5.4 (NEW-2 = §4 D 항목 — 위에서 처리) + D5/D6 (선택, 힌트 #9)

**D5: driver header R7 변경 사항 1줄 갱신 (T14 갱신).**

**파일:** `staging/hooks/useBroadcasterYoloDriver.ts`
**위치:** line 20-23 (R6 T14 주석).

**현 line 20-23:**
```ts
 * R7+ 이관 항목 (R6 T14):
 *  - `isInferring` 단일 소유 — 현재는 driver 가 useState 선언 후 lifecycle/sampling 2곳에
 *    setter 주입 → 총 3곳에서 쓰기. 옵션 A (sampling 단일 소유, tick 시점이 진입점)
 *    또는 옵션 B (driver 가 callback 1곳만 노출) 중 R7 Arch 결정 후 반영.
```

**R7 후 (수정):**
```ts
 * R7 §3 적용 — `isInferring` 단일 소유:
 *  - driver 가 `markInferring(v)` callback 단일 진입점 노출. lifecycle 의 result/error 수신
 *    경로와 sampling 의 tick / catch 경로가 모두 markInferring 을 호출 → driver state 는
 *    한 곳에서 set. 옵션 B 채택 (R7 Arch §3.1).
```

**D6 (힌트 #9): DiagBadge React.memo 미사용 사유 1줄 주석.**

**파일:** `staging/components/YoloDriverDiagBadge.tsx`
**위치:** line 12-17 의 "설계 원칙" 블록 **마지막 줄 직후** 1줄 추가.

**추가 1줄 (line 17 직후):**
```
 *  - React.memo 미적용 사유: dev-only + DOM 1개 + 2초 주기 갱신이라 리렌더 비용이 무시 수준.
 *    prod 빌드는 NODE_ENV 가드로 null 반환 → memo 효과 0. (R7 D6 / 힌트 #9)
```

---

## §6. 신규 테스트 case 명세

### 6.1 latency delta 엣지 (0 / NaN / Infinity / 음수) — 힌트 #8

**파일:** `staging/tests/yoloWorkerLifecycle.test.ts` (또는 §1 의 분리 후
`staging/tests/yoloLatencyTracker.test.ts` 신설 가능 — Dev 판단).

**Dev 권고:** §1 분할 후 tracker 가 독립 훅이므로 **`staging/tests/yoloLatencyTracker.test.ts` 신설** 권장.
신규 파일 시 `vitest.config.ts` include 에 1줄 추가 + `tsconfig.staging-check.json` include 에 1줄 추가.

**테스트 case 4-in-1 (단일 it 블록 안에 4 시나리오):**

```ts
it("R7 §6.1 latency delta 엣지: delta=0 / NaN / Infinity / 음수 모두 링버퍼 제외 (또는 0 만 포함)", () => {
  // §1 후 tracker 직접 렌더 (또는 lifecycle 경유):
  const { result } = renderHook(() => useYoloLatencyTracker({ enabled: true }));

  // (a) delta=0: stamp == now → push (Number.isFinite(0)=true && 0>=0 → 통과). 링버퍼 [0].
  result.current.inferStartRef.current = 100;
  act(() => { result.current.recordResult(100); });   // delta=0
  // (b) NaN: stamp=NaN, now=200 → delta=NaN → Number.isFinite(NaN)=false → 제외.
  result.current.inferStartRef.current = NaN;
  act(() => { result.current.recordResult(200); });
  // (c) Infinity: stamp=-Infinity, now=200 → delta=Infinity → Number.isFinite=false → 제외.
  result.current.inferStartRef.current = -Infinity;
  act(() => { result.current.recordResult(200); });
  // (d) 음수: stamp=200, now=100 → delta=-100 → !(>=0) → 제외.
  result.current.inferStartRef.current = 200;
  act(() => { result.current.recordResult(100); });

  // 2초 flush.
  act(() => { vi.advanceTimersByTime(2_000); });
  // 링버퍼는 [0] 1개만. P50=0, P95=0.
  expect(result.current.inferLatencyP50Ms).toBe(0);
  expect(result.current.inferLatencyP95Ms).toBe(0);
});
```

**검증 의도:** R6 lifecycle line 213-214 의 가드 `if (Number.isFinite(delta) && delta >= 0)` 가
4 시나리오 모두 정확히 작동함을 회귀 fixture 로 고정.

### 6.2 renderHook case 4 (ON → ready → confirmed → OFF → null) — 힌트 #6

**파일:** `staging/tests/broadcasterYoloDriver.renderHook.test.ts`
**위치:** 기존 case 1-3 (R5 / R6) 이후 case 4 추가.

**테스트 case 명세:**

```ts
it("R7 §6.2 case 4: ON → ready → result emit → confirmed (3프레임) → OFF → currentBehavior null", () => {
  const args = makeArgs({ enabled: true, homeId: "h1", cameraId: "c1" });
  const { result, rerender } = renderHook((props: DriverArgs) =>
    useBroadcasterYoloDriver(props), { initialProps: args },
  );

  // 1. ON 직후 currentBehavior=null, initStatus=loading.
  expect(result.current.currentBehavior).toBeNull();

  // 2. worker stub 가 ready emit → initStatus=ready.
  const w = workerStub.created[0];
  act(() => { w._emit("message", { data: { type: "ready", backend: "webgpu" } }); });
  expect(result.current.initStatus).toBe("ready");

  // 3. confirmed 까지 3프레임 result emit (CONFIRM_FRAMES_DAY=3).
  //    각 frameId 는 driver 의 frameIdRef 를 직접 증가시키는 대신 sampling tick 흐름을 흉내내기 어려우므로
  //    직접 lifecycle 의 onmessage 경로를 트리거. handleResult 가 호출되어야 함.
  //    workerStubs.helpers 가 frameIdRef 갱신 helper 노출 권고 (R7 Dev TODO).
  for (let i = 1; i <= 3; i += 1) {
    act(() => {
      // sampling 흐름 흉내: frameIdRef = i (driver 내부 ref 직접 접근 불가 → workerStub helper 사용)
      workerStub.advanceFrameId(i);  // 신규 helper — workerStubs.ts 에서 export 필요
      w._emit("message", {
        data: {
          type: "result",
          frameId: i,
          detections: [{ classId: 1, classKey: "sleeping", label: "sleeping",
                         confidence: 0.9, bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }],
        },
      });
    });
  }
  // 3프레임 동일 classKey → confirmed 전환 → currentBehavior 설정.
  expect(result.current.currentBehavior?.classKey).toBe("sleeping");

  // 4. OFF 전환 (enabled=false) → driver disabled reset effect → currentBehavior null.
  act(() => { rerender({ ...args, enabled: false }); });
  expect(result.current.currentBehavior).toBeNull();
  expect(result.current.lastDetections).toEqual([]);
});
```

**Dev 종속성:** `staging/tests/helpers/workerStubs.ts` 에 `advanceFrameId(n)` helper 추가 필요
(현재 driver 의 frameIdRef 는 module 외부에서 접근 불가 → workerStubs 가 driver 내부 frameIdRef 를
공유 module 변수로 노출). 또는 sampling 의 tick 까지 fakeTimer 로 시간이동 + video stub 으로 우회.

**Dev 우회 옵션 (helper 추가 부담 회피):** sampling 흐름까지 함께 시뮬 — `vi.advanceTimersByTime(nextTickMs)` × 3 + video stub 의 `readyState=4 / videoWidth=640` 세팅 + worker stub 의 onmessage 를 result 로 응답. **R7 Dev 가 둘 중 단순한 쪽 선택**.

---

## §7. R7 Dev TODO 리스트 (필수 / 권고 분리)

### 7.1 필수 (Required) — R7 PASS 조건

| ID | 출처 | 항목 | 완료기준 |
|----|------|------|---------|
| **T1** | §1 | 신규 파일 `staging/hooks/useYoloLatencyTracker.ts` 신설 (~110 LOC). YoloLatencyTrackerArgs / YoloLatencyTrackerResult export, `recordResult` / `invalidateStamp` / `clearBuffer` API + 2s flush effect (prev-equal skip). | 파일 생성 + LOC ≤120 + tsc green |
| **T2** | §1 | `useYoloWorkerLifecycle.ts` 에서 latency 부분 제거: line 67-76 (computePercentile 등), line 134-136 (state 2개), line 146-149 (ref 3종), line 210-220 (delta 계산), line 226-229 (stamp 무효화 일부), line 259, line 291-293 (clear), line 363-384 (flush effect). 대신 `const tracker = useYoloLatencyTracker({ enabled });` 1줄 + tracker 메서드 호출 로 치환. lifecycle return 의 `inferStartRef` / `inferLatencyP50Ms` / `inferLatencyP95Ms` 는 tracker 결과 forward + `latencyRefs` 신규 추가. | tsc green + lifecycle LOC ≤300 + driver 가 본 결과 그대로 forward 가능 검증 (driver 무수정으로 빌드 통과) |
| **T3** | §2 | `useBroadcasterYoloDriver.ts` 의 health flush effect (line 300-323) 를 §2.3 명세대로 단순화. deps `[enabled]` 1개. healthRef 는 lifecycle.latencyRefs 의 ref 를 매 tick 폴링 동기화. | tsc green + driver LOC ≤350 + deps 변경 1줄 (test 가 회귀 없이 PASS) |
| **T4** | §3 | `useBroadcasterYoloDriver.ts` 에 `markInferring = useCallback((v) => setIsInferring(v), [])` 1줄 추가. lifecycle prop / sampling prop 의 `setIsInferring` 을 `markInferring` 으로 sweep. lifecycle / sampling args 시그니처에서 `setIsInferring?` 옵셔널 → `markInferring` 필수 변경. | tsc green + grep `setIsInferring` (테스트 제외) = 0 + 모든 vitest PASS |
| **T5** | §4 | 신규 파일 `staging/lib/behavior/buildBehaviorEventMetadata.ts` 신설 (≤45 LOC) — §4.2 명세 코드 그대로. logger 본체 (src/) 는 수정 안 함 (옵션 R). | 파일 생성 + LOC ≤45 + tsc green + src/ 0 diff |
| **T6** | §4 | `staging/tests/metadataFreeze.test.ts` 의 `buildMetadataForTest` 로컬 정의 삭제 + `buildBehaviorEventMetadata` import 로 sweep. 7 case 모두 신규 함수 호출. | grep `buildMetadataForTest` = 0 + 8 case PASS (R6 baseline 유지) |
| **T7** | §5.1 | `staging/docs/phase_b_src_migration_checklist.md` §8 신설 (≤25 LOC) — §5.1 D1 명세 그대로. | §8 섹션 존재 + LOC ≤25 + grep "프로덕션 100+ 전환 시 driver_health" 1건 |
| **T8** | §5.2 | `staging/docs/phase_b_field_test_plan.md` §0 끝에 "0-6 이전 PROMOTED commit ID 메모" 1줄 체크박스 추가. | 1줄 diff + grep "이전 PROMOTED commit ID" 1건 |
| **T9** | §5.3 | `staging/components/YoloDriverDiagBadge.tsx` line 9 + line 30-36 주석 수정 — "retrying" dead mention 제거. line 39 실코드 변경 없음. | grep "retrying" = 0 (주석 + 코드) + LOC 유지 (≤95) |
| **T10** | §5.4 | `staging/lib/behavior/buildBehaviorEventMetadata.ts` 신설 시 (T5 와 통합) — 변경 0. (이 항목은 T5 통합 — Dev 판단으로 합치기 가능) | T5 와 통합 |
| **T11** | §6.1 | `staging/tests/yoloLatencyTracker.test.ts` 신설 (또는 yoloWorkerLifecycle.test.ts 에 추가). latency 엣지 4-in-1 케이스 + 기본 1 case (정상 push). | 신규 파일 시 vitest.config.ts include 1줄 추가 + tsc include 1줄 추가 + 1+ tests PASS |
| **T12** | §6.2 | `staging/tests/broadcasterYoloDriver.renderHook.test.ts` 에 case 4 (ON → ready → confirmed → OFF → null) 추가. workerStubs 헬퍼 추가 또는 sampling 흐름 시뮬. | 1 case 추가 + PASS + 기존 case 회귀 없음 |
| **T13** | §5.4 D5 | `useBroadcasterYoloDriver.ts` 헤더 line 20-23 R6 T14 주석을 §5.4 D5 명세대로 갱신. | grep "R7 §3 적용" 1건 |

### 7.2 권고 (Optional) — R7 LOC 마진 보호

| ID | 출처 | 항목 | 완료기준 |
|----|------|------|---------|
| **T14** | §5.4 D6 | `staging/components/YoloDriverDiagBadge.tsx` line 12-17 설계 원칙 블록 끝에 "React.memo 미적용 사유" 1줄 추가. | 1줄 diff |
| **T15** | §3.3 | sampling/lifecycle args JSDoc 갱신 — `setIsInferring` → `markInferring` 의미 1줄. | 2개 JSDoc 라인 수정 |

**필수 13건 + 권고 2건 = 총 15건.**

### 7.3 금지 사항 (R7 재확인)

- **파일 삭제 금지** (CLAUDE.md). 기존 파일 분할 후 metadataFreeze 의 로컬 함수 삭제는
  "삭제" 가 아닌 "함수 본체 교체" 로 처리 (Edit, not file delete).
- **src/ 0 diff** (CLAUDE.md #13). §4 옵션 R 채택 근거.
- **lifecycle / driver 350 LOC 초과 금지** (R7 강화).

### 7.4 Dev 가 Arch 에 질문해야 하는 경우 (R7 재확인 — R6 §1.3 정책 그대로 적용)

R6 §1.3 의 3조건 (테스트 회귀 증거 + self-sufficient 대체 + QA 사유 기록) 모두 만족 시 단독 보류 가능. R7 의 자동 질문 대상:
1. T1 의 useYoloLatencyTracker tracker 가 lifecycle 외부에서 직접 호출될 필요가 있을 때 (현재 § 1.3 결정은 lifecycle 합성 — 외부 노출 안 함).
2. T4 의 markInferring 이름이 다른 export 와 충돌할 때 (`markInferringRef` 같은 ref 변수와 충돌 가능성 — 사전 grep).
3. T5 의 mirror 함수 시그니처가 `BehaviorDetection` 타입의 옵셔널 필드 변경으로 logger 와 어긋날 때.
4. T11 의 신규 테스트 파일 vs 기존 파일 추가 결정 (Dev 판단 OK 단 vitest include 누락 시 발견 어려움).

---

## §8. QA Agent 운영 권고 (힌트 #14 — 메타)

### 8.1 R6 QA 환경 제약 회고

R6 QA Agent 는 Bash/PowerShell 권한 거부로 `node node_modules/typescript/bin/tsc ...` 실행 불가. 정적 검증 (Read/Grep) 만 가능 → 실측 신뢰도 격차.

### 8.2 R7 팀장 권고

R7 QA Agent 에 다음 2개 명령 실행 권한을 명시 허용:

```bash
pnpm exec tsc --noEmit -p tsconfig.staging-check.json
pnpm exec vitest run
```

**이유:**
- R7 변경은 lifecycle/driver 분할 + tracker 신규 + markInferring sweep + metadataFreeze mirror — **타입 변경 + 함수 시그니처 변경** 이 동시 발생. 정적 검증만으로는 회귀 가능성 높음.
- R7 의 "5/9 PASS" 는 실측 정합성 확인 후 가능. R5 (실측 OK) → R6 (실측 부재 PASS) → R7 (실측 OK 회복) 흐름 권고.
- 추가로 `git diff --stat src/` 1회 실행 권한도 함께 (src/ 0 diff 강제 검증).

### 8.3 권한 부족 시 R7 QA 보강 절차

만약 R7 QA Agent 도 Bash 실행 불가 시:
1. 팀장이 직접 `pnpm exec tsc --noEmit -p tsconfig.staging-check.json` + `pnpm exec vitest run` 실측 → R7 QA 리포트 첨부.
2. R7 QA 는 정적 검증 + 팀장 실측 결과 합산 → PASS/REJECT 판정.

---

## §9. R7 LOC 예측 표 (분할 후 파일별)

| 파일 | R6 LOC | R7 예상 | 한도 | R7 마진 | 변경 요약 |
|------|--------|---------|------|---------|-----------|
| `useYoloWorkerLifecycle.ts` | 397 | **~290** | 400 | **110** | latency 전체 -67, tracker 호출 +5, R7 분리 주석 +10, JSDoc 정리 -55 |
| `useYoloLatencyTracker.ts` | (신규) | **~110** | 400 | 290 | 헤더 25 + 본체 60 + 주석 25 |
| `useBroadcasterYoloDriver.ts` | 390 | **~340** | 400 | **60** | health flush 단순화 -15, markInferring +1, 헤더 R7 갱신 +1, healthRef 폴링 +5, 주석 +5 |
| `useYoloSampling.ts` | 230 | 230 | 400 | 170 | markInferring 이름 변경만 (LOC 변동 0) |
| `YoloDriverDiagBadge.tsx` | 93 | 95 | 100 | 5 | 주석 정리 +2 (D6) |
| `CameraBroadcastYoloMount.tsx` | 89 | 89 | 100 | 11 | 변경 없음 |
| `metadataFreeze.test.ts` | 146 | **~100** | 무제한 | - | mirror 함수 import → 로컬 함수 -42, freeze 주석 +0 |
| `buildBehaviorEventMetadata.ts` | (신규) | ~45 | 400 | 355 | 헤더 + 단순 함수 |
| `yoloLatencyTracker.test.ts` | (신규) | ~80 | 무제한 | - | 5+ case |
| `broadcasterYoloDriver.renderHook.test.ts` | 186 | ~230 | 무제한 | - | case 4 신규 +44 |
| `phase_b_src_migration_checklist.md` | 380 | 405 | 무제한 | - | §8 신설 +25 |
| `phase_b_field_test_plan.md` | 170 | 173 | 무제한 | - | §0 1줄 +3 (체크박스 + 한 줄 설명) |
| `vitest.config.ts` | 53 | 54 | - | - | tracker test include +1 |
| `tsconfig.staging-check.json` | 41 | 43 | - | - | tracker test + tracker hook +2 |

**R7 핵심 LOC 효과: lifecycle 마진 3 → 110, driver 마진 10 → 60.** 양 훅 모두 분할 / 단순화 후 `≤350` 정책 통과.

---

## §10. R8 이월 항목 (R7 시간 부족 시)

R7 이 8건 처리, 7건은 R8 으로 이월 또는 외부 의존 항목으로 R8+ 재검토.

| ID | 항목 | 이월 사유 | R8 권고 |
|----|------|----------|---------|
| **R8-A** | 힌트 #7: `pnpm build` 후 chunks grep YoloDriverDiagBadge=0 | staging 단계 측정 불가 — Vercel 환경 필요 | src/ 반영 PR 시점 체크리스트 §1.1 또는 §3.1 에 추가 |
| **R8-B** | metadataFreeze mirror 동기화 자동 검증 (§4 마커 grep) | R7 옵션 R 의 약속 강화 | `pre-commit` 훅 or CI step 으로 마커 정합성 검사 — 후속 라운드 |
| **R8-C** | 힌트 #2 후속: driver `useDriverHealth.ts` 추가 분할 | R7 §2.2 결정으로 R7 미진행 | driver 가 R7 후 360+ LOC 도달 시 R8 에 분할 (현재 ~340 예상) |
| **R8-D** | 힌트 #15: Phase D Arch 초안 병렬 | R11 PASS 까지 보류 | R11 PASS 도달 시 팀장 판단 |
| **R8-E** | 힌트 #13: Cloudflare R2 사장님 진행 확인 | 사장님 작업, staging 무관 | 팀장이 사장님 진행 추적 |
| **R8-F** | sampling 의 `void tickFn()` 즉시 발사 (R4-e MINOR) | R5+ 이관 항목 미해소 | src/ 반영 PR 시 결정 |
| **R8-G** | onnxruntime-web Worker terminate 순서 검증 (R4-h) | Playwright 통합 테스트 필요 | Phase C 이후 |

### 10.1 R8 가이드 (R7 PASS 가정)

R7 통과 시 R8 Arch 는 다음 우선순위:
1. R7 변경의 정착 검증 (lifecycle 분할 후 retry 시나리오 회귀 없음 + driver health stale 0 측정).
2. R8-A 의 src/ 반영 PR 체크리스트 강화.
3. iOS 실기기 latency P95 임계값 결정 — R6 §9 #9 (사장님 iPhone 실측 후 조정).
4. STABLE_READY_MS 실기기 조정 — R6 §9 #5 (30/60/90/120 중 결정).

---

## §11. R7 검증 plan (R7 QA 가 따라갈 9관점)

| R | 관점 | R7 핵심 검증 |
|---|------|--------------|
| 1 | 동작 | tsc + vitest + git diff src/ + LOC 표 모두 green. T1~T13 완료. |
| 2 | 설계 일치 | tracker 분리 §1 / health flush deps §2 / markInferring §3 / mirror §4 / §8 신설 §5.1 모두 본 §1~§5 명세와 1:1 대응. |
| 3 | 단순화 | lifecycle latency 분리로 SRP 강화. health flush deps 1개로 환원. markInferring 1 callback. |
| 4 | 가독성 | tracker 신규 헤더 한국어 주석 ≥20% / lifecycle R7 분리 주석 / driver §3 적용 주석. |
| 5 | 엣지케이스 | latency 엣지 4-in-1 (§6.1) + renderHook case 4 (§6.2) + tracker reset 시 상태 일관성. |
| 6 | 성능 | health flush interval 재생성 0 (deps `[enabled]`). tracker prev-equal skip 유지. markInferring useCallback (deps []) → 재생성 0. |
| 7 | 보안 | src/ 0 diff (#13 준수). tracker / mirror 모두 staging 격리. |
| 8 | 영향 범위 | driver `DriverArgs` / `DriverResult` / Mount props 무변경. lifecycle / sampling args 의 setIsInferring 이름 변경만 — 외부 사용처 driver 1곳 sweep 으로 충분. |
| 9 | 최종 품질 | LOC 마진 110 / 60 확보. 9연속 PASS 카운트 5/9 진입 가능. |

### 11.1 R7 QA REJECT 조건 예시

- T1~T13 중 1건이라도 **필수** 누락 → REJECT.
- lifecycle 또는 driver LOC > 350 → REJECT (R7 강화 한도).
- vitest run 1건이라도 fail → REJECT.
- src/ diff > 0 line → REJECT.
- markInferring sweep 후 grep `setIsInferring` (테스트 mock 외) > 0 → REJECT.

---

## §12. R7 마지막 권고

R6 QA 가 정적 검증으로 PASS 한 4/9 의 신뢰도를 R7 에서 실측으로 회복하는 것이 5/9 진입의 핵심.
T1~T13 의 변경량이 크지만 (분할 + 신규 파일 2개 + 함수 sweep + mirror) 각 항목 자체는 mechanical.
R7 Dev 는 §7.1 순서대로 T1 → T2 → T3 → T4 → ... → T13 진행 시 의존 사슬 단절 없음:
- T1 (tracker 신설) → T2 (lifecycle 의 latency 부분 tracker 호출로 치환) → T3 (driver health flush 단순화) → T4 (markInferring sweep) → T5/T6 (metadataFreeze mirror) → T7~T9 (문서/주석) → T11/T12 (테스트 신규).

각 단계마다 `pnpm exec tsc --noEmit -p tsconfig.staging-check.json` + `pnpm exec vitest run` 실측 권고.

**R7 PASS 진입 시 9연속 카운트 5/9. R8~R11 4 라운드 남음. Phase B src/ 반영 PR 까지 직선 거리.**

---

**R7 Arch 최종 권고:** lifecycle 분할 (§1) + driver deps 단순화 (§2) + isInferring 옵션 B (§3)
이 3축이 R7 의 핵심. mirror (§4) 와 MINOR 4건 (§5) 은 작업량 작지만 freeze 의도와 dead code 정리 효과 확실. QA 실측 권한 회복 (§8) 이 R7 의 신뢰도 차이를 만든다.

R6 QA 4/9 → R7 5/9 진입 + LOC 마진 ≥60/≥110 확보 + src/ 0 diff 유지가 R7 합격선.
