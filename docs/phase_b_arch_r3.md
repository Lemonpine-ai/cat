# Phase B Arch R3 — R2 REJECT 대응 (Driver 분할 + vitest 정리)

> 작성: 1번 Arch Agent (R3, 독립 실행)
> 작성일: 2026-04-24
> 선행 문서: `docs/phase_b_arch_r2.md` (기조 유지) · `docs/phase_b_qa_r2.md` (REJECT 사유)
> 범위: R2 QA 가 REJECT 한 MAJOR 2 (M-R2-A Driver 545 LOC, M-R2-B vitest include 폭주) +
>       MINOR 3 (m-R2-C Mount 102 LOC, m-R2-D tick hoisting, m-R2-E setInterval 타이밍).
> 원칙: R2 §1 (3상태 union) · §2 (retry state machine) · §3 (3중 방어선) · §5 (flag 정책) ·
>       §6 (Phase A logger 통합) 은 그대로 유지. 본 문서는 **분할/정리 delta 만** 명시.
>       파일 삭제 금지 (CLAUDE.md). src/ 0 diff 유지 (CLAUDE.md #13).

---

## 0. R2 REJECT 2건 재설계 요약

| 코드 | 레벨 | R2 QA 지적 | R3 재설계 핵심 |
|------|------|-----------|-----------------|
| **M-R2-A** | MAJOR | `useBroadcasterYoloDriver` 545 LOC — 팀 한도 400 +145 초과. R2 Arch §5.4 가 약속한 420 도 +125 밀림. SRP 위반 (worker lifecycle + sampling + health flush + handleResult + logger arm 동시 보유). Phase C/D/F 추가 시 600+ 진입 명백. | **3분할.** `useYoloWorkerLifecycle` (worker 생성/dispose/retry/initStatus/armBehaviorLogger, ~180 LOC) + `useYoloSampling` (tick/setInterval/visibility/health bump, ~160 LOC) + `useBroadcasterYoloDriver` (compose + handleResult/maxDuration/health flush/logger 주입, ~200 LOC). 각 파일 400 한도 내, 합계 ≈ 540 (기존과 거의 동일하나 책임 단위로 쪼갬). |
| **M-R2-B** | MAJOR | `vitest.config.ts` include `staging/tests/**/*.test.ts` 가 describe/it 래핑이 0 인 Phase A 레거시 테스트 2건 (`behaviorClasses.invariants.test.ts`, `effectiveClass.parity.test.ts`) 까지 매치 → vitest v2 `passWithNoTests: false` 기본값에서 "No test found in suite" 에러. `pnpm test` 첫 실행부터 red. | **옵션 A 채택.** `vitest.config.ts` `test.include` 를 Phase B 4개 파일로 명시 축소. Phase A 2개는 runner-agnostic 상태로 보존 (R3에서 describe/it 래퍼는 `staging/tests/legacy/` 이동 없이도 추가하지 않음 — 다른 채택지로 회귀 위험 0). |

---

## 1. M-R2-A 재설계 — Driver 3분할

### 1.1 `useYoloWorkerLifecycle` (신규)

**경로:** `staging/hooks/useYoloWorkerLifecycle.ts`

**목적:** ONNX Worker 의 생성/메시지 송수신/dispose/retry/armBehaviorLogger 책임을 단일 훅으로 격리. driver 가 worker 디테일을 모르도록 한다.

**인자 타입 (구현 X):**

```
export interface YoloWorkerLifecycleArgs {
  /** 상위 driver 가 결정한 활성 여부 (flag ON + 방송 중 + homeId/cameraId 충족). */
  enabled: boolean;
  /** worker "result" 메시지 수신 시 호출되는 detection 처리 콜백.
   *  driver 의 handleResult 가 여기에 들어옴. stable 참조 (useCallback) 권장. */
  onDetections: (detections: BehaviorDetection[], frameId: number) => void;
  /** 마지막으로 worker 에 전송한 frameId 와 일치하는지 체크하기 위한 ref.
   *  하위 훅이 외부 ref 를 받음으로써, 상위 sampling 훅이 같은 ref 를 공유 가능. */
  frameIdRef: MutableRefObject<number>;
  /** health 누적 콜백 — 성공/실패 카운터를 상위 driver 의 healthRef 에 누적. */
  onSuccess: () => void;
  onFailure: (err: unknown) => void;
}

export interface YoloWorkerLifecycleResult {
  /** 외부 sampling 훅이 postMessage 호출에 사용. null 이면 미준비. */
  workerRef: Readonly<MutableRefObject<Worker | null>>;
  /** worker init "ready" 메시지 수신 여부 — sampling 훅이 tick guard 로 사용. */
  readyRef: Readonly<MutableRefObject<boolean>>;
  /** postMessage 진행 중 (race 방지) — sampling 훅이 setting + check. */
  busyRef: MutableRefObject<boolean>;
  /** 외부에 노출되는 상태값 — driver 가 그대로 forward. */
  initStatus: InitStatus;
  retryAttempt: number;
  backend: "webgpu" | "webgl" | "wasm" | null;
}
```

**책임 (구현 X, 명세만):**
1. `enabled === false` → 기존 worker dispose, retryTimer clear, retryAttemptRef 0, initStatus="idle".
2. `enabled === true` → 기존 worker dispose 후 신규 `new Worker(URL, { type: "module" })`, init 메시지 송신, initStatus="loading".
3. message handler: `ready` → readyRef.current=true, retryAttemptRef=0, setInitStatus("ready"), setBackend. `result` → busyRef=false, frameId 검증, `onDetections(detections, frameId)` 호출, `onSuccess()`. `error` → busyRef=false, `onFailure(...)`.
4. error event handler: `onFailure(...)`, dispose, `scheduleRetry()`.
5. `scheduleRetry`: yoloRetryPolicy `canRetry` / `computeBackoffMs` 사용, MAX_RETRIES 소진 시 setInitStatus("failed").
6. retry effect deps: `[enabled, retryGen]`. retryGen 증가 → cleanup → 새 worker 생성.
7. `armBehaviorLogger("broadcaster")` 호출 + cleanup 에서 disarm — **이 훅 내부**에서 처리 (worker 생명주기와 logger arm 생명주기가 동치이므로 자연 이동).
8. unmount 시 retryTimer + workerRef + listener 모두 정리.

**의존:**
- `staging/lib/behavior/yoloRetryPolicy.ts` (computeBackoffMs / canRetry / MAX_RETRIES)
- `staging/lib/behavior/loggerArmGuard.ts` (armBehaviorLogger)
- `staging/types/behavior.ts` (Worker* 메시지 타입)
- `staging/workers/yoloInference.worker.ts` (URL 참조)

**예상 LOC:** **약 180** (jsdoc 30 + import 10 + state/ref 25 + dispose/scheduleRetry 헬퍼 35 + message/error handler 40 + worker effect 30 + arm effect 5 + cleanup 5).

### 1.2 `useYoloSampling` (신규)

**경로:** `staging/hooks/useYoloSampling.ts`

**목적:** scheduler tick / setInterval / visibilitychange / `shouldInferNow` 가드 / bitmap 생성 / postMessage 책임. worker lifecycle 은 알지 못하고 ref 로만 통신.

**인자 타입 (구현 X):**

```
export interface YoloSamplingArgs {
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** lifecycle 훅이 보유한 workerRef — sampling 은 읽기 전용으로 받음. */
  workerRef: Readonly<MutableRefObject<Worker | null>>;
  readyRef: Readonly<MutableRefObject<boolean>>;
  busyRef: MutableRefObject<boolean>;
  /** sampling 이 증가시키면 lifecycle 의 result 핸들러가 검증에 사용. */
  frameIdRef: MutableRefObject<number>;
  /** scheduler 결과 — driver 가 useBehaviorInferenceScheduler 호출 후 그대로 전달. */
  nextTickMs: number;
  shouldInferNow: () => boolean;
  /** tick 시작 직전(샘플링 진행 결정 후) driver 콜백 — maxDurationGuard / current reset 등 처리. */
  onBeforeInfer: () => void;
  /** visibility hidden 진입 시 driver 가 처리해야 할 reset (currentBehavior null 등). */
  onHidden: () => void;
  /** health 누적: tick 카운트 / postMessage 실패 카운트. */
  onTick: () => void;
  onPostMessageError: (err: unknown) => void;
  /** isInferring state setter — postMessage 직전 true, lifecycle 응답 시점 false (lifecycle 에서 별도 호출). */
  setIsInferring: (v: boolean) => void;
}

export type YoloSamplingResult = void;  // 부수효과만, 반환값 없음.
```

**책임 (구현 X, 명세만):**
1. sampling effect deps: `[enabled, nextTickMs]`. cleanup 에서 stopInterval + visibilitychange 해제.
2. `tick` 함수: video readyState/videoWidth/document.hidden 가드 → `shouldInferNow()` 가드 → `onTick()` (health bump) → `onBeforeInfer()` (driver 의 maxDuration 체크) → `createImageBitmap` → `setIsInferring(true)` → `worker.postMessage({type:"infer", frameId, bitmap}, [bitmap])`. 실패 시 `setIsInferring(false)` + `onPostMessageError(err)` + bitmap.close 보장.
3. visibilitychange: hidden → stopInterval + `onHidden()`. visible → startInterval(tick) (단 enabled true 일 때만).
4. `tick` 함수는 effect 내부 IIFE 또는 useCallback 으로 선언 — **M-R2-d (m-R2-D) 해결: useCallback 으로 deps 명시**.

**의존:**
- 외부 lifecycle 훅의 ref 들 (workerRef/readyRef/busyRef/frameIdRef)
- driver 의 콜백들 (onBeforeInfer/onHidden/onTick/onPostMessageError/setIsInferring)
- 브라우저 API: `createImageBitmap`, `document.visibilityState`, `setInterval/clearInterval`

**예상 LOC:** **약 160** (jsdoc 25 + import 10 + tick useCallback 50 + sampling effect 40 + visibility handler 20 + 헬퍼 startInterval/stopInterval 15).

### 1.3 `useBroadcasterYoloDriver` (core, 수정)

**경로:** `staging/hooks/useBroadcasterYoloDriver.ts` (기존 파일 — Edit only)

**목적:** 두 하위 훅을 compose. confirmFrames switch 분기 (handleResult), 30분 maxDurationGuard, avgConfidence 계산, health debounce flush, Phase A logger 주입을 담당.

**인자/반환 타입:** **R2 와 동일** (`DriverArgs` / `DriverResult`). 외부 API 변경 없음 — Mount 컴포넌트 무손상.

**내부 구조 (구현 X):**

```
function useBroadcasterYoloDriver(args): DriverResult {
  const { videoRef, enabled, homeId, cameraId, identifiedCatId, supabaseClient, motionActive } = args;

  // 1) scheduler — R2 그대로
  const { nextTickMs, regime, shouldInferNow } = useBehaviorInferenceScheduler({ enabled, motionActive });

  // 2) 공유 state/ref (handleResult 가 갱신)
  const [currentBehavior, setCurrentBehavior] = useState<BehaviorDetection | null>(null);
  const [lastDetections, setLastDetections] = useState<BehaviorDetection[]>([]);
  const [isInferring, setIsInferring] = useState(false);
  const [avgConfidence, setAvgConfidence] = useState<number | undefined>(undefined);
  const [health, setHealth] = useState<DriverHealth>({...});

  const historyRef = useRef<string[]>([]);
  const confWindowRef = useRef<number[]>([]);
  const openEventRef = useRef<OpenEventLite | null>(null);
  const currentBehaviorRef = useRef<BehaviorDetection | null>(null);
  const regimeRef = useRef<SchedulerRegime>(regime);
  const frameIdRef = useRef<number>(0);
  const healthRef = useRef<DriverHealth>({...});
  const healthDirtyRef = useRef<boolean>(false);

  // 3) ref 동기화 effect (R2 와 동일)
  useEffect(() => { regimeRef.current = regime; }, [regime]);
  useEffect(() => { currentBehaviorRef.current = currentBehavior; }, [currentBehavior]);

  // 4) 헬퍼 (clearAvgConfidence, bumpTick/Success/Failure, resetSharedState)

  // 5) handleResult — useCallback (frameId 무관, detections 만)
  const handleResult = useCallback((detections, frameId) => { /* R2 §1.3 switch 그대로 */ }, []);

  // 6) onBeforeInfer — sampling 이 호출, maxDurationGuard 처리
  const onBeforeInfer = useCallback(() => {
    if (shouldForceClose(openEventRef.current, new Date())) {
      openEventRef.current = null;
      historyRef.current = [];
      clearAvgConfidence();
      currentBehaviorRef.current = null;
      setCurrentBehavior(null);
    }
  }, []);

  // 7) onHidden — visibility 진입 시 reset
  const onHidden = useCallback(() => {
    historyRef.current = [];
    clearAvgConfidence();
    if (currentBehaviorRef.current !== null) {
      currentBehaviorRef.current = null;
      openEventRef.current = null;
      setCurrentBehavior(null);
    }
  }, []);

  // 8) lifecycle 훅 호출 — 결과 ref 들을 sampling 에 전달
  const lifecycle = useYoloWorkerLifecycle({
    enabled,
    onDetections: handleResult,
    frameIdRef,
    onSuccess: bumpSuccess,
    onFailure: bumpFailure,
  });

  // 9) sampling 훅 호출 — lifecycle 의 ref 와 driver 의 콜백 결합
  useYoloSampling({
    enabled,
    videoRef,
    workerRef: lifecycle.workerRef,
    readyRef: lifecycle.readyRef,
    busyRef: lifecycle.busyRef,
    frameIdRef,
    nextTickMs,
    shouldInferNow,
    onBeforeInfer,
    onHidden,
    onTick: bumpTick,
    onPostMessageError: bumpFailure,
    setIsInferring,
  });

  // 10) health debounced flush (R2 §M7 그대로)
  useEffect(() => { /* setInterval HEALTH_FLUSH_INTERVAL_MS */ }, [enabled]);

  // 11) Phase A logger 주입 (R2 그대로)
  useBehaviorEventLogger({ homeId, cameraId, currentBehavior, avgConfidence, identifiedCatId, supabaseClient });

  // 12) lifecycle "result" 응답 시 isInferring=false 처리:
  //  - lifecycle 훅의 onSuccess/onFailure 가 호출되는 시점이 곧 worker 응답 시점이므로
  //    onSuccess 와 onFailure 를 wrap 해서 setIsInferring(false) 동시 호출 (또는 lifecycle
  //    내부에서 별도 콜백 onWorkerIdle 추가). R3 결정: bumpSuccess/bumpFailure 안에서
  //    setIsInferring(false) 호출 — 단순화 우선.

  return useMemo<DriverResult>(() => ({
    currentBehavior, backend: lifecycle.backend, isInferring, lastDetections,
    regime, health, initStatus: lifecycle.initStatus, retryAttempt: lifecycle.retryAttempt,
  }), [...]);
}
```

**예상 LOC:** **약 200** (jsdoc 30 + import 20 + state/ref 30 + 헬퍼 35 + useCallback 3개 30 + lifecycle/sampling/logger 호출 30 + health flush effect 15 + return 10).

**합계:** lifecycle 180 + sampling 160 + driver 200 = **540 LOC** (R2 545 와 거의 동일). 핵심은 **개별 파일 모두 400 한도 내**.

### 1.4 분할 후 테스트 전략

| 테스트 파일 | 유형 | 커버 범위 | 비고 |
|-------------|------|-----------|------|
| `staging/tests/yoloWorkerLifecycle.test.ts` (신규) | 통합 (mock Worker) | enabled=false→true 전환 시 worker 생성, ready 메시지 → initStatus="ready", error → scheduleRetry, MAX_RETRIES 소진 → "failed". | global Worker 를 vi.fn 으로 stub. armBehaviorLogger 도 spy. |
| `staging/tests/yoloSampling.test.ts` (신규) | 통합 (mock workerRef) | enabled true + readyRef true 시 setInterval 등록, hidden → stopInterval + onHidden 호출, shouldInferNow false → tick 스킵, postMessage 실패 시 onPostMessageError + bitmap.close. | jsdom + fake timers (vi.useFakeTimers). |
| `staging/tests/broadcasterYoloDriver.test.ts` (수정 — R2 그대로 유지 + 분할 후에도 시뮬레이터 기반 시나리오 보존) | 단위 (시뮬레이터) | confirm 3상태 switch, maxDurationGuard 호출 순서, retry 백오프 계산. | 기존 R2 시뮬레이터 그대로. 훅 본체 테스트는 위 두 파일에 위임. |
| `staging/tests/confirmFrames.test.ts` (R2 그대로) | 단위 | confirmDetection 12+건. | 변경 없음. |
| `staging/tests/maxDurationGuard.test.ts` (R2 그대로) | 단위 | shouldForceClose 경계. | 변경 없음. |
| `staging/tests/inferenceScheduler.parity.test.ts` (R2 그대로) | parity | regime / shouldInferNow 경계. | 변경 없음. |

**핵심 변화:** 기존 `broadcasterYoloDriver.test.ts` 시뮬레이터 테스트는 **그대로 보존**. 분할로 인해 추가되는 lifecycle/sampling 단위 테스트만 신규 생성. 이로써 **회귀 0건**.

### 1.5 React hooks 규칙 준수

분할 후에도 다음 규칙 엄수:
1. lifecycle/sampling 모두 **최상위 호출만** (조건부 호출 금지). driver 가 enabled=false 여도 두 훅은 호출되며, 각 훅 내부에서 enabled 체크.
2. driver 의 useCallback (handleResult/onBeforeInfer/onHidden) 은 **의존성 배열을 빈 배열 [] 로** (ref 만 참조). lifecycle 훅의 onDetections / sampling 훅의 onBeforeInfer 등은 stable 참조여야 effect 재실행이 폭주하지 않음.
3. lifecycle 의 `workerRef` 는 외부에 **읽기 전용 (`Readonly<MutableRefObject<...>>`)** 으로 노출. sampling 은 읽기만. 쓰기 (workerRef.current = null) 는 lifecycle 내부에서만.
4. 두 훅 모두 cleanup 함수를 반드시 등록 — sampling 의 stopInterval, visibility 리스너 / lifecycle 의 disposeWorker, retryTimer, disarm.
5. `react-hooks/exhaustive-deps` 경고 회피용 `eslint-disable` 코멘트는 정당화 1줄과 함께만 허용 (R2 의 sampling effect 의 tick deps 누락 패턴 그대로).

---

## 2. M-R2-B 재설계 — vitest include 정책

### 2.1 옵션 비교

| 옵션 | 변경 위치 | 장점 | 단점 | R3 채택 여부 |
|------|-----------|------|------|--------------|
| **A. `vitest.config.ts` include 명시 축소** | `vitest.config.ts` 1파일 | (1) 가장 작은 변경. (2) Phase A 레거시 파일 무손상. (3) 신규 Phase B 테스트만 vitest 가 매치 → "No test found" 에러 0. (4) Phase B 테스트 파일 추가 시 명시적 등록 필요 → 의도 명확. | 신규 Phase B 테스트 추가 시 include 배열 업데이트 누락 위험 (CI 가 "테스트 늘었는데 안 돌아감" 감지 못함). | **채택** |
| **B. Phase A 레거시 2개 파일에 describe/it 래퍼 추가** | `behaviorClasses.invariants.test.ts`, `effectiveClass.parity.test.ts` 각각 | (1) include 패턴 와일드카드 유지 가능. (2) Phase A 테스트도 vitest 에서 자동 실행. | (1) Phase A 파일을 수정해야 함 — 런너 무관 export (`runInvariants` / `checkParity`) 와 vitest DSL 양립. (2) `import { describe, it, expect } from "vitest"` 추가 필요. (3) 다른 환경 (node CLI) 에서 실행 시 vitest 가 dependency 로 잡혀야 함. | 미채택 (Phase A 회귀 위험) |
| **C. `staging/tests/legacy/` 로 이동 + include 제외** | 파일 2개 이동 + `vitest.config.ts` exclude 추가 | (1) 명시적 분리. (2) include 와일드카드 유지. | (1) **CLAUDE.md "파일 삭제 절대 금지" 위반 가능성** — `mv` 가 git 에서는 delete + add 로 표현되어 회피 모호. (2) 파일 이동 시 import 경로가 깨질 수 있음 (`../lib/...` → `../../lib/...`). (3) Phase A 호출 패턴이 README 등 문서에 박혀 있을 수 있음. | 미채택 (CLAUDE.md 위반 회피 + 회귀 위험) |

### 2.2 최종 권고 (옵션 A)

**`vitest.config.ts` 변경 명세 (구현 X):**

```
test: {
  include: [
    "staging/tests/confirmFrames.test.ts",
    "staging/tests/maxDurationGuard.test.ts",
    "staging/tests/inferenceScheduler.parity.test.ts",
    "staging/tests/broadcasterYoloDriver.test.ts",
    // R3 신규 (Driver 분할 대응):
    "staging/tests/yoloWorkerLifecycle.test.ts",
    "staging/tests/yoloSampling.test.ts",
  ],
  exclude: ["node_modules", "tests", "staging/tests/node_modules"],
  environment: "node",
  // ⚠️ jsdom 으로 전환 검토 — sampling 테스트의 document.hidden / setInterval 사용 시 필요.
  // R3 Dev 가 첫 시도에서 node 환경으로 fake timer 만으로 충분한지 실측 후 결정.
}
```

**제외된 (의도) 파일:**
- `staging/tests/behaviorClasses.invariants.test.ts` — Phase A. `runInvariants()` export 만, describe/it 0. CLI 스크립트 또는 Phase A 테스트 러너로 실행 (또는 R4+ 에서 별도 정리).
- `staging/tests/effectiveClass.parity.test.ts` — Phase A. `checkParity()` export 만. 동일.
- `staging/tests/static-assets-smoke.spec.ts` — `.spec.ts` 확장자라 include 패턴(`*.test.ts`)에 원래부터 미매치. 무관.

**근거:**
1. CLAUDE.md "파일 삭제 절대 금지" 직접 충돌 회피 (옵션 C 탈락).
2. Phase A 테스트의 runner-agnostic export 패턴은 의도된 설계 — vitest 미설치 환경에서 node CLI 로도 실행 가능. 이 가치를 보존 (옵션 B 의 vitest DSL 강제 회피).
3. 옵션 A 의 단점 (신규 테스트 등록 누락) 은 §5 R3 Dev TODO 에 "신규 테스트 추가 시 vitest.config.ts include 동시 수정" 명시로 보완.
4. R4+ 에서 Phase A 레거시 정리 정책이 결정되면 옵션 B 또는 C 로 자연 마이그레이션 가능 — 옵션 A 가 가장 reversible.

### 2.3 검증 방법

R3 Dev 가 다음을 수행:
1. `pnpm install` (vitest 설치 확인).
2. `pnpm exec vitest run` → 6개 파일 (4 R2 + 2 R3) 모두 green.
3. Phase A 2개 파일은 vitest 출력에 등장하지 않음을 확인 (`No test found` 0건).
4. R3 QA 가 동일 명령으로 재실측.

---

## 3. MINOR 3건 반영

### 3.1 m-R2-C — Mount 컴포넌트 102 → 100 LOC 이하

**위치:** `staging/components/CameraBroadcastYoloMount.tsx` (현재 102 LOC)

**원인:** L84-98 `useEffect` 안의 `console.warn` 블록 + JSDoc 41 줄.

**수정 명세 (구현 X):**
1. JSDoc 의 "사용 예시" 블록 (line 23-33, 11줄) 을 `staging/docs/phase_b_src_migration_checklist.md` 로 이동. JSDoc 에는 "사용 예시: 체크리스트 문서 §2 참조" 1줄로 축약.
2. 절감 LOC: 약 8~10줄. → **최종 92~94 LOC**, 100 한도 여유 5~7.

**대안 (택1, R3 Dev 자유):**
- 대안 A: JSDoc 단축 (위 제안).
- 대안 B: console.warn 호출을 `staging/lib/behavior/loggerArmGuard.ts` 또는 신규 `staging/lib/behavior/initFailureWarn.ts` 로 추출 → Mount 에서 1줄 호출.

**채택 권고:** **대안 A** — 새 파일 추가 없이 해결. 체크리스트 문서가 이미 존재하므로 자연 이전.

### 3.2 m-R2-D — `tick` 함수 hoisting 의존 완전 해결

**위치:** R2 `useBroadcasterYoloDriver.ts` line 475 의 `async function tick()` 이 line 407-433 sampling effect 의 `startInterval(tick)` 호출에 의해 hoisting 으로 참조됨.

**R3 자연 해결:** **분할 (§1.2) 로 인해 자동 해소.** sampling 훅 내부에서 `tick` 을 `useCallback` 으로 선언 → 같은 파일 내 effect 가 deps 배열에 명시적으로 포함:

```
const tick = useCallback(async (): Promise<void> => {
  // ... R2 의 tick 본문 그대로
}, [
  videoRef, workerRef, readyRef, busyRef, frameIdRef,
  shouldInferNow, onBeforeInfer, onTick, onPostMessageError, setIsInferring,
]);

useEffect(() => {
  if (!enabled) { stopInterval(); return; }
  const onVisibility = () => { ... };
  if (!document.hidden) startInterval(tick);
  document.addEventListener("visibilitychange", onVisibility);
  return () => { stopInterval(); document.removeEventListener("visibilitychange", onVisibility); };
}, [enabled, nextTickMs, tick]);
```

**ESLint `no-use-before-define` 경고 0** + `react-hooks/exhaustive-deps` 도 만족 (eslint-disable 불필요).

### 3.3 m-R2-E — `setInterval` / `nextTickMs` 타이밍 테스트 가능

**R2 QA 지적:** sampling useEffect 가 `[enabled, nextTickMs]` deps 로 새 interval 을 깔지만 wallClockTick 이 60s 단위라 22:00 경계 판정이 최대 60s 지연. 현 수준 PASS 허용 가능 (R2 QA §m-R2-E).

**R3 결정:** **현 수준 유지.** 단 sampling 분할로 다음 테스트가 가능해짐:

| 테스트 시나리오 | 검증 항목 |
|------------------|-----------|
| `nextTickMs` 5000 → 30000 변경 시 sampling effect 재실행 → 새 interval delay 30s | `vi.useFakeTimers()` + `vi.advanceTimersByTime(30_000)` 으로 검증 |
| `enabled` true→false 시 `stopInterval` 호출 | spy `clearInterval` |
| `document.hidden` 진입 시 stopInterval + `onHidden` 콜백 호출 | dispatchEvent("visibilitychange") 후 spy 확인 |
| `shouldInferNow()` false 반환 시 tick 본문 (createImageBitmap) 진입 0회 | mock `shouldInferNow` 반환값 토글 |

R3 Dev 의 `staging/tests/yoloSampling.test.ts` 가 위 4건을 커버.

---

## 4. 파일 변경 요약 (R2 Dev 결과물 대비 delta)

### 4.1 신규 (3개)

| 경로 | 목적 | 예상 LOC |
|------|------|---------|
| `staging/hooks/useYoloWorkerLifecycle.ts` | M-R2-A 분할 — Worker 생성/dispose/retry/initStatus/armBehaviorLogger | ~180 |
| `staging/hooks/useYoloSampling.ts` | M-R2-A 분할 — tick/setInterval/visibility/shouldInferNow guard | ~160 |
| `staging/tests/yoloWorkerLifecycle.test.ts` | lifecycle 훅 단위 테스트 (mock Worker) | ~120 |
| `staging/tests/yoloSampling.test.ts` | sampling 훅 단위 테스트 (fake timers) | ~140 |

### 4.2 수정 (4개)

| 파일 | 변경 | 예상 LOC 증감 |
|------|------|---------------|
| `staging/hooks/useBroadcasterYoloDriver.ts` | (a) lifecycle/sampling 두 훅 호출로 단순화. (b) handleResult/onBeforeInfer/onHidden useCallback 으로 추출. (c) worker 관련 ref/effect 모두 lifecycle 으로 이동. (d) tick/sampling effect 모두 sampling 으로 이동. (e) armBehaviorLogger 호출 lifecycle 으로 이동. (f) health debounce flush + Phase A logger 주입은 driver 에 잔류. | **545 → ~200** (−345) |
| `staging/components/CameraBroadcastYoloMount.tsx` | JSDoc "사용 예시" 11줄을 체크리스트 문서로 이전. JSDoc 에 "체크리스트 §2 참조" 1줄. | **102 → ~92~94** (−8~10) |
| `staging/docs/phase_b_src_migration_checklist.md` | "§2 사용 예시 (방송폰 mount JSX)" 섹션 신규 추가. Mount 에서 빠진 JSDoc 코드 블록 이전. | +15 (문서) |
| `vitest.config.ts` | `test.include` 를 와일드카드에서 6개 파일 명시로 축소. JSDoc 에 "신규 테스트 추가 시 본 배열 업데이트" 경고 1줄. | +10 |
| `tsconfig.staging-check.json` | 신규 4개 파일 (lifecycle/sampling 훅 + 두 테스트) include 배열에 추가. | +4 |

### 4.3 R3 에서 변경 없음 (R2 그대로 유지)

- `staging/lib/behavior/confirmFrames.ts` — 3상태 union (R2 §1) 그대로.
- `staging/lib/behavior/maxDurationGuard.ts` — R1 그대로.
- `staging/lib/behavior/yoloRetryPolicy.ts` — R2 신규 그대로.
- `staging/lib/behavior/loggerArmGuard.ts` — R2 신규 그대로.
- `staging/lib/behavior/yoloV2Flag.ts` — R1 그대로.
- `staging/hooks/useBehaviorInferenceScheduler.ts` — R2 §M6 (`decideShouldInferNow`) 구현 그대로.
- `staging/hooks/useBehaviorEventLogger.ts` — Phase A 그대로.
- `staging/workers/yoloInference.worker.ts` — Phase A 초안 그대로.
- `staging/tests/confirmFrames.test.ts` — R2 그대로.
- `staging/tests/maxDurationGuard.test.ts` — R2 그대로.
- `staging/tests/inferenceScheduler.parity.test.ts` — R2 그대로.
- `staging/tests/broadcasterYoloDriver.test.ts` — R2 시뮬레이터 그대로 (분할 후에도 시뮬레이터 자체는 핵심 보존).
- `staging/tests/behaviorClasses.invariants.test.ts` — Phase A. **R3 에서 손대지 않음.**
- `staging/tests/effectiveClass.parity.test.ts` — Phase A. **R3 에서 손대지 않음.**

### 4.4 삭제 파일

**없음.** CLAUDE.md "파일 삭제 절대 금지" 준수.

### 4.5 LOC 합계 변화

| 항목 | R2 Dev 결과 | R3 Dev 예상 |
|------|-------------|-------------|
| `useBroadcasterYoloDriver.ts` | 545 | ~200 |
| `useYoloWorkerLifecycle.ts` | 0 | ~180 |
| `useYoloSampling.ts` | 0 | ~160 |
| `CameraBroadcastYoloMount.tsx` | 102 | ~92~94 |
| `vitest.config.ts` | 27 | ~37 |
| 신규 테스트 (lifecycle + sampling) | 0 | ~260 |
| **순증감** | — | **+225** (구현 +195, 테스트 +260, mount/driver/vitest 정리 −350) |

**핵심:** **개별 파일 모두 400 LOC 이하** (driver 200, lifecycle 180, sampling 160, mount 92, vitest 37). 컴포넌트 100 한도 (mount 92) 도 통과.

---

## 5. R3 Dev 에 전달할 TODO

| # | 작업 | 완료 기준 |
|---|------|-----------|
| 1 | `staging/hooks/useYoloWorkerLifecycle.ts` 신규 작성 | §1.1 인자/반환 타입 + 책임 8개 항목 모두 구현. armBehaviorLogger 호출 + cleanup. retryGen state + worker effect deps. **180 LOC ± 20 이내.** |
| 2 | `staging/hooks/useYoloSampling.ts` 신규 작성 | §1.2 인자/반환 + 책임 4개 항목. tick 을 `useCallback` 으로 선언 (m-R2-D 해결). sampling effect deps `[enabled, nextTickMs, tick]`. **160 LOC ± 20 이내.** |
| 3 | `useBroadcasterYoloDriver.ts` 리팩터 | §1.3 구조로 수정. lifecycle/sampling 호출 + handleResult/onBeforeInfer/onHidden useCallback. health debounce flush + Phase A logger 주입은 잔류. 외부 API (`DriverArgs`/`DriverResult`) 변경 0. **200 LOC ± 30 이내.** |
| 4 | `CameraBroadcastYoloMount.tsx` JSDoc 단축 (m-R2-C) | "사용 예시" JSX 블록 11줄 제거 → "체크리스트 §2 참조" 1줄. **100 LOC 이하 (목표 ~92).** |
| 5 | `staging/docs/phase_b_src_migration_checklist.md` 에 "§2 사용 예시" 섹션 추가 | Mount 에서 옮겨온 JSX 코드 블록 + 사용처 (CameraBroadcastClient 위치) 설명. |
| 6 | `vitest.config.ts` include 명시 축소 (M-R2-B) | 옵션 A 대로 6개 파일 명시. JSDoc 에 "신규 테스트 추가 시 include 배열 동시 수정" 경고 1줄. |
| 7 | `tsconfig.staging-check.json` include 에 4개 신규 파일 추가 | `pnpm exec tsc --noEmit -p tsconfig.staging-check.json` 에러 0. |
| 8 | `staging/tests/yoloWorkerLifecycle.test.ts` 신규 작성 | global Worker stub. ready → "ready" / error → scheduleRetry / MAX_RETRIES → "failed" / disarm 호출 4건 검증. |
| 9 | `staging/tests/yoloSampling.test.ts` 신규 작성 | jsdom + fake timers. nextTickMs 변경 시 새 interval / hidden 시 stopInterval+onHidden / shouldInferNow false 시 createImageBitmap 미호출 / postMessage 실패 시 onPostMessageError 4건 검증. |
| 10 | `pnpm exec vitest run` 실행 | **6 개 파일 전부 green.** Phase A 2개 파일은 출력에 등장하지 않음 확인. |

### 5.1 금지 사항 (재확인)

- `src/` 파일 수정 **금지** (CLAUDE.md #13).
- 파일 삭제 **금지** (CLAUDE.md). 이동도 금지 — `staging/tests/legacy/` 옵션 채택 안 함.
- `supabase.rpc(...).catch()` 사용 금지 (CLAUDE.md WebRTC 교훈 #1).
- `new Worker` 직전 기존 ref dispose 없이 신규 할당 금지 (`useYoloWorkerLifecycle` 내부 책임).
- React Hook 조건부 호출 금지 — lifecycle/sampling 모두 driver 의 `enabled` 와 무관하게 항상 호출.

### 5.2 Dev 가 Arch 에 되물어야 하는 경우

- lifecycle 또는 sampling 단일 파일이 **200 LOC 초과** 시 추가 분할 여부 R3 Arch 에 질문.
- `tick` useCallback 의 deps 배열이 6개 초과로 비대해지면 일부 ref 통합 또는 derived ref 도입 여부 질문.
- `vi.useFakeTimers()` 가 `setInterval` + `requestAnimationFrame` 동시 사용 시 race 발생하면 jsdom 환경 도입 여부 질문.

---

## 6. R4 에 남길 질문 (vitest 실제 실행 검증 등)

1. **vitest 실측 결과** — R3 QA 가 `pnpm install && pnpm exec vitest run` 실행 후 6개 파일 모두 green / Phase A 2개 파일 미매치를 직접 확인. 본 R3 Arch 는 정적 분석만.
2. **Phase A 레거시 처우** — 옵션 A (R3 채택) 는 reversible. R4+ 에서 Phase A 정리 정책 결정 시 옵션 B (describe/it 추가) 또는 옵션 C (이동 — CLAUDE.md 완화 필요) 로 마이그레이션 가능.
3. **lifecycle/sampling 단위 테스트의 Worker mock 깊이** — global Worker 를 vi.fn 으로 stub 하는 수준이 충분한지, 아니면 실제 onnxruntime-web 통합 테스트 (Playwright 기반) 가 Phase C 에서 필요한지.
4. **R2 Arch §5.4 의 "LOC 예상 실패" 재발 방지** — R3 예상 (driver 200 / lifecycle 180 / sampling 160) 도 또 +50 씩 밀릴 가능성. R4 QA 가 실측 후 재초과 시 추가 분할 (예: lifecycle 의 retry 부분만 `useYoloRetryController.ts` 로 또 분리) 검토.
5. **m-R2-D 해결 확인** — `tick` 을 useCallback 으로 변환 시 deps 배열 크기. 만약 6개 초과면 prop drilling 패턴 재검토.
6. **m-R2-E sampling 분할 후 22:00 경계 60s 지연 허용** — sampling 훅이 wallClockTick 을 직접 받지 않고 nextTickMs 만 받으므로 R2 와 동일한 60s 지연. 이를 30s 또는 즉시로 줄이려면 scheduler 가 `chrono` 같은 외부 시간 변경 이벤트를 emit 해야 함 — R4+ 결정.
7. **NONE_KEY 공통 상수화 (M8)** — R2 와 동일하게 R3 에서도 src/ 수정 필요로 인해 보류. **Phase B src/ 반영 PR 단계** (별도 작업) 에서 처리. 체크리스트에 이중 추적 유지.
8. **`initStatus="failed"` UX (R2 §7.2 #3)** — R3 범위 외. Phase C 에서 토스트/자동 OFF 결정.
9. **lifecycle 훅이 `setIsInferring` 도 호출해야 하는가** — 현재 §1.3 (12) 항목에서 "bumpSuccess/bumpFailure 안에 setIsInferring(false) 동시 호출" 로 단순화했으나, 책임 분리 관점에서 lifecycle 이 isInferring 까지 관리하는게 깔끔할 수도. R4 QA 가 결정.
10. **sampling 훅 환경: node vs jsdom** — `document.hidden` / `visibilitychange` 사용 시 jsdom 필요. R3 Dev 가 첫 시도에서 노드 환경에서 mock 으로 충분한지 실측.

---

## 7. 변경 없음 항목 (R2 결정 그대로)

- §1 confirmFrames 3상태 union (R2 §1.1~1.5).
- §2 ONNX retry state machine (R2 §2.1~2.7).
- §3 뷰어 게이트 3중 방어 (L1 체크리스트 / L2 Mount JSDoc / L3 armBehaviorLogger). 단 m-R2-C 처리로 L2 JSDoc 의 "사용 예시" 블록만 체크리스트로 이전.
- §5 flag 정책 (NEXT_PUBLIC_CAT_YOLO_V2 OFF 기본).
- §6 Phase A logger 통합 (driver 잔류, model_version="v1" 유지).
- §7 테스트 매트릭스 (vitest 도입 + parity 테스트). R3 에서 6개 파일로 명시.

---

**Arch R3 최종 권고:**
- M-R2-A 는 **3분할 (lifecycle/sampling/driver)** 로 SRP 회복 + 개별 파일 400 한도 통과. 합계 LOC 는 거의 동일하지만 책임 단위로 쪼갬.
- M-R2-B 는 **옵션 A (vitest include 명시 축소)** 로 Phase A 무손상 + CLAUDE.md "파일 삭제 금지" 충돌 회피.
- m-R2-C 는 JSDoc "사용 예시" 11줄 → 체크리스트 문서로 이전 (Mount 92 LOC 목표).
- m-R2-D 는 분할로 **자동 해소** (sampling 의 tick 이 useCallback 으로 effect 같은 파일 내 선언).
- m-R2-E 는 sampling 분할 덕에 fake timer 기반 단위 테스트 가능 — `staging/tests/yoloSampling.test.ts` 4건 커버.
- R3 Dev 는 §5 의 10개 TODO 를 순서대로 수행. 1, 2, 3 (lifecycle/sampling/driver) 은 의존 관계상 1 → 2 → 3 순서. 4~9 는 병렬 가능. 10은 마지막.
- R4 QA 는 §6 의 10개 질문을 검증 항목으로 활용 + LOC 실측 (각 파일 ±20 이내인지).
