# Phase B Arch R4 — MINOR 반영 + 장시간 운영 재검토

> 작성: 1번 Arch Agent (R4, 독립 실행)
> 작성일: 2026-04-24
> 선행 문서: `docs/phase_b_arch_r1.md` · `docs/phase_b_arch_r2.md` · `docs/phase_b_arch_r3.md` · `docs/phase_b_qa_r3.md`
> 상태: R3 QA **PASS (9연속 PASS 1/9)**, MINOR 2건 보유 → 본 R4 는 (a) MINOR 2건 해소 설계 + (b) R3 PASS 이후 **새로운 관점**(장시간/logger 타이밍/Phase C·D 호환/동시성/미세 최적화) 재검토.
> 원칙: R1 §1 파일 구조 · R2 §1–§3 · R3 §1–§3 **그대로 유지**. 본 문서는 delta + 신규 검증 결과만 기록. 파일 삭제 금지 (CLAUDE.md). src/ 0 diff 유지.

---

## 0. R4 요약

| 구분 | 개수 | 비고 |
|------|------|------|
| **M1 대응** (react-hooks/set-state-in-effect 2건) | 해결 — **옵션 A-변형 (주석 명시 + `useSyncExternalStore` 마이그레이션 후보 지정)** | 코드 차단 아님, 팀 baseline 이므로 `eslint-disable-next-line` + 근거 주석. .eslintrc 수정은 Phase B 범위 밖. |
| **M2 대응** (테스트 헬퍼 중복) | 해결 — `staging/tests/helpers/workerStubs.ts` 신규 + 공용 API 4개 | lifecycle/sampling 테스트 각 ~40 LOC 감소 예상. |
| **R4 재검토 신규 발견** | **CRITICAL 0 · MAJOR 2 · MINOR 6** | 가장 중요 3건: (1) retryAttemptRef 재성공 리셋 타이밍 vs ready 반복 crash race (`MAJOR-R4-A`), (2) frameIdRef 64bit overflow 전 unsigned wrap 없음 장시간 위험 (`MINOR-R4-b`), (3) Phase A logger 의 openEventRef vs driver 의 openEventRef **이중 보유** (`MAJOR-R4-B`). |
| **방향** | R3 PASS **유지 가능** (CRITICAL 없음). R4 Dev 는 M1/M2 + MAJOR 2건만 소화. MINOR 6건은 체크리스트로 누적 추적. |

---

## 1. M1 대응 — react-hooks/set-state-in-effect 2건

### 1.1 문제 재확인

| 위치 | 코드 | 설명 |
|------|------|------|
| `staging/hooks/useBroadcasterYoloDriver.ts` line 285 | `setAvgConfidence(undefined)` (disabled reset effect) | `enabled=false` 전환 시 공용 상태 리셋하는 effect 본문에서 setState 호출. |
| `staging/hooks/useYoloWorkerLifecycle.ts` line 225 | `setInitStatus("idle")` + `setBackend(null)` + `setRetryAttempt(0)` (worker effect `enabled=false` 분기) | 동일 패턴. |

React 19 신규 룰 `react-hooks/set-state-in-effect` 는 "effect 안에서 setState → 재렌더 트리거로 무한 루프 위험" 을 경고. Phase A 기존 코드 (`useBehaviorDetection`, `useBehaviorEventLogger`, `useLandscapeLock`, `RecentCatActivityLog`, `DiaryPageClient`) 5곳에 **동일 warning** 존재 → **팀 baseline**. 빌드 차단 아님 (`next build` 는 eslint error 로 halt 하지 않음, lint 단계만 exit=1).

### 1.2 옵션 3종 비교표

| 옵션 | 구현 난이도 | 런타임 영향 | 팀 일관성 | 회귀 위험 | 본 R4 판정 |
|------|-------------|-------------|-----------|-----------|-------------|
| **A. `eslint-disable-next-line` + 근거 주석** | ★ (5분) | 0 | **O** (Phase A 5곳과 동일 패턴) | 0 | **채택 (기본)** |
| **B. `useSyncExternalStore` / event handler 전환** | ★★★ (2h) | 0 (정상 경로 동일) | X (Phase A 와 분기) | 중 — lifecycle reset 은 `enabled` 변화 이벤트가 아니라 **React 렌더 트리거**에서 발생하므로 순수 event handler 변환이 어려움. prop change 를 "이벤트" 로 보는 구조가 React 에 없음. | 미채택 |
| **C. `.eslintrc` 에서 해당 규칙 off** | ★★ (30분) | 0 | O (팀 baseline 으로 수용) | 저 — 다만 src/ 수정 필요 (루트 `.eslintrc`) + 향후 진짜 무한 루프 버그를 숨길 위험 | 미채택 (**Phase B src/ 반영 PR에 별도 항목으로 이관**) |

### 1.3 채택안 — 옵션 A 변형

**패턴 (구현 X, 주석 문구 명세만):**

```
useEffect(() => {
  if (!enabled) {
    // ... 리소스 정리 ...
    // eslint-disable-next-line react-hooks/set-state-in-effect -- disabled 전환 시
    //   공용 state 리셋은 prop 변화 이벤트 핸들러 패턴으로 옮길 수 없음 (React 19).
    //   팀 baseline: Phase A useBehaviorDetection/useBehaviorEventLogger/useLandscapeLock 동일.
    //   R5+ 또는 src/ 반영 단계에서 .eslintrc off 일괄 정책 결정 예정.
    setInitStatus("idle");
    setBackend(null);
    setRetryAttempt(0);
    return;
  }
  // ...
}, [enabled, retryGen, ...]);
```

**대상 위치:**
1. `useBroadcasterYoloDriver.ts` line 279–291 (disabled 공용 상태 리셋 effect).
2. `useYoloWorkerLifecycle.ts` line 221–233 (worker effect 의 `!enabled` 분기).

두 곳 모두 **eslint-disable-next-line + 3줄 근거 주석** (영어/한글 혼용 허용). 주석에 "R5+ 또는 src/ 반영 단계에서 규칙 일괄 off 검토" 를 명시해 R5 Arch 가 놓치지 않도록 브리지.

### 1.4 옵션 C 를 Phase B src/ 반영 PR 로 넘기는 이유

- Phase A 5곳 + Phase B 2곳 = 7건 동시 대응이 필요한데, 규칙 off 는 루트 `.eslintrc` 수정 → CLAUDE.md #13 (staging 단계 src/ 수정 금지) 걸림.
- 규칙 off 이후에도 **진짜 무한 루프** 감지 수단 (예: 렌더 횟수 sentinel) 을 짜야 하므로 설계 비용이 별도.
- 따라서 R4 는 옵션 A 로 warn 표면을 정리 + **`staging/docs/phase_b_src_migration_checklist.md` §3 신규 항목** 추가:
  - [ ] `.eslintrc` 에 `"react-hooks/set-state-in-effect": "warn"` (또는 `"off"`) 로 일괄 하향 조정
  - [ ] Phase A 5곳 + Phase B 2곳 의 `eslint-disable-next-line` 주석 일괄 제거
  - [ ] 규칙 off 일 경우 대체 안전 장치: production 빌드에서만 `StrictMode` 이중 렌더 감시.

---

## 2. M2 대응 — 테스트 헬퍼 공용화

### 2.1 중복 식별

`yoloWorkerLifecycle.test.ts` (302 LOC) 와 `yoloSampling.test.ts` (242 LOC) 에서 다음 공통 패턴:

| 헬퍼 | lifecycle 파일 위치 | sampling 파일 위치 | 공용화 가능 |
|------|----------------------|---------------------|-------------|
| `StubWorker` 클래스 + 리스너/메시지 버퍼 | line 32–74 (43 LOC) | 해당 없음 — sampling 은 `makeWorkerMock` 만 사용 | **분기 — StubWorker 만 lifecycle 전용. postMessage 스파이는 sampling 전용** |
| `createStubWorker(url)` | line 47 | 없음 | lifecycle 전용 |
| `makeBitmap()` / `bitmapCloseSpy` | 없음 | line 25–28 | sampling 전용 |
| `makeVideoEl(ready)` | 없음 | line 30–36 | sampling 전용 |
| `makeWorkerMock()` | 없음 | line 38–46 | sampling 전용 |
| `makeFrameIdRef()` | line 87–90 | 없음 | 공용화 가능 |
| `window.__catBehaviorLoggerArmed__` 청소 | line 103–106 (afterEach) | 없음 | 공용화 가능 |

**핵심 발견:** 중복은 QA R3 가 보고한 것만큼 심하지 않다. 두 파일이 각자 다른 side 를 mock 하고 있어 **서로 다른 헬퍼 세트**. 진짜 공용화 후보는 `makeFrameIdRef` + `loggerArmCleanup` 2개뿐.

### 2.2 재설계 — `staging/tests/helpers/workerStubs.ts` 신규

**경로:** `staging/tests/helpers/workerStubs.ts` (신규)

**공개 API (구현 X, 시그니처만):**

```ts
/** lifecycle 테스트용 — Worker 전체를 제어 가능한 stub. */
export interface StubWorker {
  url: URL;
  messages: unknown[];
  listeners: Record<string, Array<(ev: unknown) => void>>;
  terminated: boolean;
  postMessage(msg: unknown): void;
  addEventListener(type: string, handler: (ev: unknown) => void): void;
  removeEventListener(type: string, handler: (ev: unknown) => void): void;
  terminate(): void;
  /** 테스트 헬퍼 — 외부에서 worker 응답을 emit. */
  _emit(type: string, payload: unknown): void;
}

/** `new Worker(url)` 생성자가 반환할 stub 인스턴스 1개. */
export function createStubWorker(url: URL): StubWorker;

/** `vi.stubGlobal("Worker", ...)` 에 쓸 생성자 클래스 + 내부 created 배열 반환. */
export function installWorkerStub(): {
  readonly createdWorkers: ReadonlyArray<StubWorker>;
  /** beforeEach 에서 호출. vi.stubGlobal 까지 수행. */
  reset(): void;
};

/** sampling 테스트용 — postMessage 만 필요한 간이 Worker mock. */
export function makeWorkerPostMessageMock(): {
  worker: Worker;
  posted: unknown[];
};

/** sampling 테스트용 — createImageBitmap 결과. close() 스파이 포함. */
export function makeImageBitmapStub(): {
  bitmap: ImageBitmap;
  closeSpy: ReturnType<typeof vi.fn>;
};

/** sampling 테스트용 — readyState/videoWidth 만 노출하는 video 최소 shape. */
export function makeVideoElStub(ready: boolean): HTMLVideoElement;

/** 공용 — frameIdRef / busyRef / readyRef 단순 생성. */
export function makeFrameIdRef(initial?: number): { current: number };

/** 공용 — dev-only sentinel `window.__catBehaviorLoggerArmed__` 청소.
 *  afterEach 에서 호출. */
export function clearLoggerArmSentinel(): void;
```

### 2.3 각 테스트 파일의 리팩터 범위

| 파일 | 제거 라인 | import 추가 | 예상 LOC 감소 |
|------|-----------|-------------|----------------|
| `staging/tests/yoloWorkerLifecycle.test.ts` | line 30–90 (`StubWorker` 인터페이스 + `createStubWorker` + `StubWorkerCtor` + `makeFrameIdRef`) = 약 61 LOC | `import { installWorkerStub, makeFrameIdRef, clearLoggerArmSentinel } from "./helpers/workerStubs"` | **−50 LOC** (302 → ~252) |
| `staging/tests/yoloSampling.test.ts` | line 25–46 (`bitmapCloseSpy` + `makeBitmap` + `makeVideoEl` + `makeWorkerMock`) = 약 22 LOC | `import { makeImageBitmapStub, makeVideoElStub, makeWorkerPostMessageMock } from "./helpers/workerStubs"` | **−15 LOC** (242 → ~227) |
| `staging/tests/helpers/workerStubs.ts` | (신규) | vitest `vi` 타입만 | **+95 LOC** (신규 총량) |

**순 delta:** 테스트 총 +30 LOC (helpers 95 − 개별 감소 65). **LOC 이득은 크지 않지만 중복 제거 + 향후 Phase C/D 추가 테스트 재사용 기반**이 본 설계의 핵심 가치.

### 2.4 `vitest.config.ts` include 갱신

`staging/tests/helpers/workerStubs.ts` 는 **helper** 이므로 `test.include` 에 **추가하지 않는다**. `tsconfig.staging-check.json` 의 `include` 에는 추가.

```
// vitest.config.ts include — 변경 없음 (6개 파일 그대로)
// tsconfig.staging-check.json include — "staging/tests/helpers/workerStubs.ts" 추가
```

---

## 3. 장시간 운영 재검토

### 3.1 retryGen 영구 누적

**가설:** 방송폰이 8시간 이상 ON 상태일 때 worker 가 주기적으로 crash → retry → 성공 → 재 crash 루프가 발생하면 `retryGen` 이 영원히 증가하여 `useEffect` deps 변화 폭증.

**실측 분석 (코드 리뷰):**

- `useYoloWorkerLifecycle.ts` line 104: `const [retryGen, setRetryGen] = useState<number>(0);` — JS `Number` 는 `2^53 - 1` 까지 안전. 1초마다 증가해도 **285,616년**. overflow 불가능.
- line 151 `retryAttemptRef.current = 0` — ready 메시지 수신 시 **retryAttemptRef 만 리셋**, retryGen 은 유지. 설계 의도상 정당 (retry **시도 횟수** 는 0 으로 되돌아가고, retry **세대 번호** 는 단조 증가).
- `useEffect(..., [enabled, retryGen, ...])` — retryGen 변화 시 cleanup → 새 Worker. 정상.

**발견한 문제 (MAJOR-R4-A):**

**시나리오:** worker 성공 → ready → 5분 정상 동작 → crash → handleWorkerError (line 176) → `onFailureRef` → `disposeWorker` (인라인) → `scheduleRetry()` (line 192) → `retryAttemptRef.current = 1` → 30초 backoff → `setRetryGen` → 새 Worker → ready → **retryAttemptRef 다시 0 (line 151)**. 

이 자체는 정상이지만 R4 관점: **"ready 후 1초만에 또 crash"** 케이스. `retryAttemptRef=0` 으로 리셋된 직후 crash 하면 retryAttemptRef=1 로 다시 시작 → 30초 backoff. 하지만 **8시간 내내 이 패턴** 이면 사용자는 30초 주기로 worker 가 깨지는 걸 모른다 (`initStatus="ready"` 가 계속 표시).

**권고 (MAJOR-R4-A 대응):**

- **대안 1 (가벼움):** `retryAttemptRef` 리셋 조건을 "ready 후 **유지 시간 ≥ STABLE_THRESHOLD_MS (예: 60초)** 일 때" 로 강화. 즉 첫 ready 에서는 리셋하지 않고, 60초 후 타이머가 `retryAttemptRef = 0` 실행. crash 가 그 전에 오면 retryAttemptRef 가 누적되어 MAX_RETRIES 경로로 합류.
- **대안 2 (무거움):** health flush 에 `recentCrashCount` 를 추가해 5분 sliding window crash 횟수 노출. Phase C UX 결정.

**R4 결정:** **대안 1 채택**. `useYoloWorkerLifecycle.ts` 에 `STABLE_READY_MS = 60_000` 상수 + `stableReadyTimerRef` 추가. ready 수신 시 `setTimeout(() => { retryAttemptRef.current = 0; setRetryAttempt(0); }, 60_000)` 예약. 다음 ready 수신 시 기존 타이머 `clearTimeout`. 이 로직은 **R4 Dev 구현 필수** (MAJOR).

### 3.2 setInterval 재설정 안정성

**가설:** `useYoloSampling.ts` line 186–212 의 sampling effect 가 `[enabled, nextTickMs, tick, startInterval, stopInterval]` deps 로 재실행 → 기존 interval cleanup → 새 interval. 재설정 중간에 tick 이 "이미 발사됨" 이면 race 가능.

**실측 분석:**

- `startInterval` (line 175) 은 `intervalRef.current !== null` 이면 **early return** — 이중 interval 방지. 정상.
- cleanup (line 206–211) 은 `stopInterval()` 호출 → `clearInterval` → `intervalRef.current = null`. 재진입 시 `startInterval` 이 새 id 발사. 정상.
- `visibilitychange` 리스너가 cleanup 에서 `removeEventListener` 로 해제 — 누수 없음.

**발견한 문제 (MINOR-R4-a):**

- cleanup → (동시성 race) → 새 effect start 사이에 `onVisibility` 이벤트가 들어오면 **old onVisibility handler** 가 동작 (이미 detach) — 브라우저가 발사 중이었다면 handler 가 closure 로 이전 `tick` 을 참조 → 이전 tick 은 이미 GC 대상 아님 (ref 로 참조 유지). 실제로는 안전.
- 단 **React Strict Mode** 에서 effect 가 mount → cleanup → 재mount 을 한번 더 돈다. `intervalRef` 가 단일이라 OK.

**권고:** 이대로 유지. 단 R4 는 주석 1줄 추가 권고: "strict mode 이중 mount 시에도 `intervalRef` single guard 로 안전" (sampling line 175 위).

### 3.3 confirmFrames 메모리

**가설:** `confirmDetection` 은 `history.slice(-windowSize)` 로 window 크기만 유지. 장시간 누적 0 — 정상.

**실측 분석:**

- `staging/lib/behavior/confirmFrames.ts` line 74–76: `merged.length > windowSize ? merged.slice(-windowSize) : merged`. windowSize=3 (낮), 2 (야간). **최대 3 프레임** 만 보관.
- driver (`useBroadcasterYoloDriver.ts` line 121) `historyRef.current: string[]` 에 **반환된 newHistory 대입** — 누적 없음.
- `confWindowRef.current: number[]` (avgConfidence) 도 line 177–179 에서 `AVG_CONF_WINDOW=3` 초과 시 `shift()` — 최대 3개.

**결론:** 메모리 누수 없음. 단 **MINOR-R4-b 발견**:

- `frameIdRef.current = ++frameIdRef.current` (sampling line 154) — 1초당 0.2 tick (5초 주기) × 8시간 = **5,760**. 1년이어도 약 2백만. JS Number 안전 범위 (2^53) 에 도달하려면 **28만년**. 안전.
- 하지만 `msg.frameId !== frameIdRef.current` 검증 (lifecycle line 161) 에서 frameId 가 Worker → Main 을 거치며 **postMessage 구조화 복제** 경유. 숫자 동일성 유지 OK.
- **단 overflow 는 이론적으로 안 남. MINOR 하향.**

### 3.4 health ref / flush

**가설:** `healthRef.current` 누적 (`ticksTotal`/`successes`/`failures`) 은 flush 에 의해 state 로 옮겨지지 않아도 영원히 증가. 8시간 × 5초 = 5,760 tick. 안전 범위.

**실측 분석:**

- `useBroadcasterYoloDriver.ts` line 268–276: 2초마다 `healthDirtyRef` 체크 → dirty 시 `setHealth({...healthRef.current})` spread. spread 는 **정수 3개 + 문자열 1개 복사** → 8시간 × 1,800 flush = 14,400 spread. React 재렌더 비용 미미 (health 는 `DriverResult` 반환용으로만 쓰임).
- flush 실패 (setHealth throw) 는 React 가 잡아서 ErrorBoundary 로 보냄 — 실질적으로 throw 불가능.
- **MINOR-R4-c 발견:** `healthRef.current.lastBackendError: string | null` 이 계속 최신 에러로 덮어쓰여 누적 아님. 정상.
- **MINOR-R4-d 발견:** `ticksTotal` 은 onTick 에서만 증가, health debounce flush 는 dirty bit 체크. disabled=false 로 전환 후 `healthRef.current` 가 **리셋되지 않는다** (line 280–290 disabled reset effect 에 healthRef 초기화 없음). 재 enabled 시 누적값이 남아있음. **베타 사용 중 flag OFF/ON 토글 반복 시 오해 여지**.

**권고 (MINOR-R4-d):**

- `useBroadcasterYoloDriver.ts` disabled reset effect (line 279–291) 에 다음 3줄 추가:
  ```
  healthRef.current = { ticksTotal: 0, inferSuccesses: 0, inferFailures: 0, lastBackendError: null };
  healthDirtyRef.current = true;
  // setHealth 는 dirty flush 가 다음 interval 에서 처리 — eslint set-state-in-effect 경고 추가 회피.
  ```
- 단 이 경우 `enabled=false` 상태에서는 flush interval 자체가 안 돌므로 (line 269 `if (!enabled) return`) **setHealth 는 다음 enabled=true 전환 시에야 반영**. R4 Dev 는 이 동작을 주석으로 명시 ("OFF 상태의 health 값은 stale — ON 전환 시 2초 내 flush").

---

## 4. Phase A logger 주입 타이밍

### 4.1 Mount 첫 tick race

**시나리오:** 

1. `CameraBroadcastYoloMount` mount → `useBroadcasterYoloDriver` 호출 → 내부 `useBehaviorEventLogger` 호출 (line 294).
2. React 가 **동일 렌더 내** effect 실행 순서: logger 의 useEffect (supabase init) → driver 의 useEffect (worker 생성) → sampling 의 useEffect (interval 시작).
3. `setInterval` 첫 발사까지 **최소 `nextTickMs` 대기** (line 178 `window.setInterval(tickFn, nextTickMs)` — 즉시 발사하지 않음).
4. `useBehaviorEventLogger` 는 logger 이므로 supabase init + onMount 동기화에 100ms~2s 소요. 첫 tick (5초) 이전에 완료.

**결론:** 기본 5초 간격 기준 race 없음. 단 **MINOR-R4-e 발견**:

- Mount 렌더 직후 `setInterval` 이 발사되는 첫 시점까지 정확히 `nextTickMs` 만큼 기다림. 사용자는 "flag ON 했는데 5초간 아무것도 안 일어남" 으로 체감.
- 첫 tick 을 `setTimeout(0)` 으로 즉시 발사하는 패턴이 UX 에 좋지만, 그러면 `shouldInferNow()` 내부 `lastInferAtRef=0` 분기로 인해 그대로 진행. race 없음.
- **R4 권고:** `startInterval` 에서 interval 시작 직후 `void tickFn()` 을 **선반영 호출** (Arch 제안만, Dev 는 반영 선택적). 단 sampling 테스트가 변경되므로 R5 로 이관 가능.

**결론:** MINOR-R4-e 는 **R5 이관** (UX 미세 개선, R4 필수 아님).

### 4.2 Flush 중 driver 종료

**시나리오:** 방송폰 사용자가 뒤로가기 → `CameraBroadcastYoloMount` unmount → driver cleanup. Phase A logger 는 `useBehaviorEventLogger` 내부의 cleanup (`openEventRef.current` close + localStorage queue flush) 을 실행.

**실측 분석 (Phase A 코드 재확인):**

- `useBehaviorEventLogger.ts` line 80: `openEventRef` 가 logger 내부에 **자체 보유** — driver 의 `openEventRef` (driver line 123) 와 **이름만 같고 별개 인스턴스**. 
- **MAJOR-R4-B 발견:** driver 도 `openEventRef` 를 보유 (maxDurationGuard 판정용, line 123). logger 도 `openEventRef` 보유 (DB UPDATE 타겟, Phase A line 80). **같은 개념을 두 훅이 독립적으로 추적**.
  - 정합성 위험: driver 가 `shouldForceClose=true` 로 판단해 `setCurrentBehavior(null)` 하면 logger 가 close (Phase A 전환 감지) — 여기까지는 동기화.
  - 하지만 driver 의 `openEventRef.current = null` (line 219) 는 driver 내부에서만 리셋. logger 의 openEventRef 는 logger 자신이 관리.
  - 다음 confirmed 감지 시: driver 가 `openEventRef.current = { startedAt: new Date(), classKey }` (line 204–207) 로 새로 세팅. logger 는 `currentBehavior` 변화 감지로 INSERT → logger 의 openEventRef 가 새 row id 로 갱신. 여기서 **driver 의 `startedAt` 과 logger 의 DB `started_at` 이 약간 다를 수 있음** (driver 는 `new Date()` 즉시, logger 는 INSERT 결과 `created_at`).
- 실제 30분 guard 는 driver 기준 → logger 의 row 가 30분 01초로 기록될 수 있음. 실용적 영향 무시 가능하나, **Phase D 라벨링 UI 가 "driver 판정 vs DB 값" 을 가지고 오탐 판단** 시 혼란.

**권고 (MAJOR-R4-B 대응):**

- **옵션 1 (가벼움):** driver 의 `openEventRef.current.startedAt` 을 "logger 의 insert 성공 이후 callback" 으로 갱신. 구조 변경 크고 Phase A 수정 필요 → 미채택.
- **옵션 2 (중간):** driver 의 `openEventRef.startedAt` 에 `Date.now()` 를 그대로 사용 (현재 로직). 30분 guard 의 오차 허용 ~수백 ms → **실용상 무관**. Phase D 는 DB 값만 보므로 영향 없음. **문서화만 하고 수용**.
- **옵션 3 (무거움):** driver 의 openEventRef 를 완전 제거. maxDurationGuard 판정을 logger 의 openEventRef 에서 가져옴. 구조 변경 큼.

**R4 결정:** **옵션 2 채택**. driver line 123 `openEventRef` 위에 주석 1줄 추가 (Dev 필수):

```
// ⚠️ 이 ref 의 startedAt 은 "확정 감지 시점" 이며, logger 의 DB started_at 과
//   수백 ms 차이 가능. maxDurationGuard 의 30분 판정은 이 값 기준.
//   Phase D 라벨링 UI 는 DB 값만 참조하므로 실용상 영향 없음 (Arch R4 §4.2).
```

정합성 이상은 **MAJOR-R4-B 로 기록하되, Phase C 착수 시 재검토** (Phase C 에서 실제 UI 가 openEvent.startedAt 을 노출하는 설계가 나오면 옵션 3 로 선회).

---

## 5. Phase C/D 확장 호환성 검증

### 5.1 C 다이어리 구독 호환

**Phase C 가 기대할 구독 패턴:**
1. `cat_behavior_events` Realtime 채널 구독 (home_id 기준).
2. INSERT/UPDATE 이벤트 수신 → 다이어리 UI 에 실시간 반영.
3. 일/주/월 집계 (Phase A `weeklyBehaviorAvg` 재사용).

**본 driver 설계와의 호환성:**

| Phase C 요구 | driver 현재 | 호환 여부 |
|---------------|-------------|-----------|
| 전환 시점만 row 기록 (중복 최소) | Phase A logger 가 이미 "전환 감지 → INSERT" 수행 | ✅ |
| `ended_at` 필드로 duration 표현 | Phase A logger 가 ended_at UPDATE 수행 | ✅ |
| `metadata.top2_class` / `top2_confidence` / `bbox_area_ratio` | yoloPostprocess 가 채움 | ✅ |
| `model_version="v1"` 필터 | logger 내부 상수 (line 29) | ✅ |
| 최대 30분 row split | driver maxDurationGuard | ✅ |
| 장시간 wake-lock 대비 row 손실 대응 | Phase A localStorage queue (R1 §4 #1) | ✅ |

**발견한 제약 (MINOR-R4-f):** Phase C 가 **"진짜 고양이 없음"** 구간을 다이어리에 표시하려면 `cleared` 상태가 row 로 기록되어야. 현재 driver 는 `cleared` 시 `setCurrentBehavior(null)` → logger 가 이전 row close + **새 row 안 만듦**. "NONE" 이 DB 에 row 로 저장되지 않음.

- 이 설계는 R1 §2 의 "전환 시점 INSERT + duration 갱신" 방침과 일치. 의도된 동작.
- Phase C 가 "NONE" 구간을 UI 에서 보여주려면 **클라이언트에서 gap 계산** (인접 row 사이 시간 = NONE duration). SQL 집계로도 가능.
- 만약 Phase C 가 명시적 NONE row 를 요구하면 **driver 수정 필요** — R5 Arch 가 결정.

**결론:** Phase C 호환성 **OK**. 단 "NONE row 저장 여부" 는 R5 Arch + Phase C Arch 합의 필요. MINOR-R4-f 체크리스트 추가.

### 5.2 D 라벨링 metadata race

**Phase D 가 기대할 수정 패턴:**
1. 사용자가 다이어리에서 잘못된 행동 클릭 → 라벨 수정 UI 열림.
2. 수정된 값이 `cat_behavior_events.behavior_class` 또는 `metadata.user_corrected_class` 에 UPDATE.
3. driver 가 동시에 실시간 INSERT 중.

**race 분석:**

- Phase D UI 가 수정하는 row 는 **이미 `ended_at` 있는 과거 row** (보통 어제 이전). driver 는 **현재 열린 row 만** UPDATE. 동일 row UPDATE 충돌 가능성 희박.
- 동시성 최악 케이스: 사용자가 "방금 끝난 1분 전 이벤트" 를 수정하려 열었는데 driver 가 그 row 를 30분 guard 로 `ended_at` 갱신 중이면 race. Supabase 는 last-write-wins (naive UPDATE) → 어느 쪽이 나중이 이김. 현 설계상 driver 는 `ended_at` 만 수정하고 `metadata` 는 INSERT 시점에 고정 → 컬럼 레벨 충돌 없음.

**발견한 제약 (MAJOR-R4 아님, 설계 이슈):**

- `user_corrected_class` 같은 새 컬럼이 Phase D 에 필요. 스키마 변경 → Phase D Arch 담당. 본 R4 범위 밖.
- driver 의 `metadata.model_version` 은 **"v1" 고정**. Phase D 가 "v1 자동 라벨을 사용자가 수정 후 재학습" 하는 경우 `v1+manual` 같은 태그 필요. Phase D 설계 시 결정.

**결론:** Phase D 호환성 **OK** (driver 쪽 수정 없음). Phase D 전용 스키마 변경은 D Arch 가 담당.

---

## 6. 동시성 / race conditions

### 6.1 비디오 element 교체

**시나리오:** 방송 중 카메라 장치 전환 (전/후면 카메라 toggle) → `videoRef.current` 가 새 `HTMLVideoElement` 를 가리킴. driver 는 cameraId 변경 감지.

**현재 설계 분석:**

- driver `DriverArgs.cameraId: string | null` — cameraId 변화 시 Mount 컴포넌트 (`CameraBroadcastYoloMount`) 가 새 props 받음. driver 는 `enabled` 가 true 유지이면서 cameraId 만 바뀜.
- **문제:** driver 의 `useEffect` deps 는 대부분 `enabled` 만 체크. cameraId 변화가 worker 재생성/interval 재설정 트리거 X.
- videoRef 는 **안정 참조** — tick 마다 `videoRef.current` 를 새로 읽음. 새 video element 로 자동 전환. 하지만 기존 video 에 대한 tick 이 진행 중이면 (busyRef=true + postMessage 대기) 중간 tick 이 이전 프레임을 처리 후 완료. 정상.

**발견한 문제 (MINOR-R4-g):**

- cameraId 변화 시 **logger 는 cameraId 를 deps 로 받아 별도 처리**. driver 의 `openEventRef` 는 cameraId 변경을 모르므로 "30분 guard 판정이 이전 카메라의 startedAt 기준으로 유지". 실제로는 카메라 전환은 Phase B 범위 밖 (사장님이 방송폰을 재시작해야 하는 케이스) → 무시 가능.
- **권고:** driver 에 `useEffect(() => { ... reset ... }, [cameraId])` 추가. 내용은 disabled reset effect 와 동일. **R4 Dev 선택적 구현** (MINOR).

### 6.2 Worker 재생성 중 postMessage

**시나리오:** lifecycle 의 worker effect 가 `retryGen` 변화로 cleanup → `disposeWorker()` → 새 Worker → init 전송. 이 사이에 sampling 의 setInterval 이 tick 을 발사.

**현재 설계 방어:**

- sampling tick (line 137): `if (!video || !worker || !readyRef.current) return` — worker null 이면 skip. 정상.
- disposeWorker (lifecycle line 199): `workerRef.current = null` + `readyRef.current = false`. sampling 이 읽을 때 모두 falsy → skip.
- 새 Worker 생성 → init 메시지 전송 → **"ready" 수신 전까지** `readyRef.current` false → sampling skip.

**결론:** race 없음. 단 **MINOR-R4-h 발견**:

- `disposeWorker` 와 `new Worker` 사이 (line 238 → 242) 는 동기 실행이라 race 불가. 하지만 disposeWorker 가 `w.postMessage({type:"dispose"})` 를 호출 (line 203). 이 dispose 메시지가 worker 큐에 들어가기 전에 `w.terminate()` 호출되면 dispose 가 묵살됨.
- worker 쪽이 dispose 메시지 수신 시 onnx session 정리 수행 — 묵살되면 **GPU 자원이 terminate 에 의해 강제 해제**. 메모리 누수 없으나 worker 내부 finalizer 코드가 안 돌 수도. onnxruntime-web 은 terminate 시 자체 cleanup 을 수행하는 것으로 알려짐 (공식 문서 확인 필요 — R5 이관).

**결론:** 체크리스트 항목 추가, R4 Dev 는 현 설계 유지.

### 6.3 Broadcaster + Viewer 동시 armed

**시나리오:** 한 브라우저에 방송폰과 뷰어폰을 동시에 연 개발 환경.

**현재 설계 방어:**

- `armBehaviorLogger("broadcaster")` (lifecycle line 262) — 방송폰 driver 가 arm.
- src/ 반영 시 viewer 경로에서 `armBehaviorLogger("viewer")` 호출 (R2 §3.4).
- `loggerArmGuard.ts` line 71–78: 다른 source 가 이미 armed 면 **dev 경고 + no-op cleanup** 반환.

**분석:**

- 같은 탭에서 broadcaster + viewer 를 **각각 다른 routes** 로 여는 경우 (예: `/camera/broadcast` + `/camera/view`) → Next.js 라우트 전환으로 한 번에 하나만 mount. 충돌 없음.
- 사용자가 SPA 내 탭 전환으로 두 페이지를 동시 mount 시키는 경우는 없음 (라우터 구조상 불가).
- **실제 충돌 가능 케이스:** 개발자가 실수로 `<CameraBroadcastYoloMount>` 를 뷰어 페이지에도 달았을 때. loggerArmGuard 가 **dev 경고** 로 감지. 정상.

**결론:** 현 설계로 충분. 단 **MINOR-R4-i**: prod 환경에서는 loggerArmGuard 가 no-op → 실수로 ON 된 상태로 배포 시 감지 불가. Phase C 에서 "서버 측 동시 로거 감지" (Supabase 트리거 알림) 를 추가 검토.

---

## 7. 성능 미세 최적화

### 7.1 confirmFrames 내 windowRef 배열 복사 비용

- `confirmDetection` 은 매 tick 마다 `[...history, incomingKey]` spread + `slice(-windowSize)` 수행. 배열 길이 최대 4 (spread 후) → 복사 비용 **ns 단위**.
- 5초 주기 × 8시간 = 5,760 호출. 총 비용 무시 가능.
- **권고:** 최적화 불필요. 현 설계 유지.

### 7.2 health debounce 2초 간격 적절?

- `HEALTH_FLUSH_INTERVAL_MS = 2_000` (driver line 50). 2초마다 dirty 체크.
- 5초 tick 기준 → 2.5 tick 당 1회 flush. 충분히 반응적.
- 만약 UX 가 health 값을 실시간 볼 수 있는 디버그 패널 (Phase C) 이면 **1000ms 로 하향** 검토 가능. 현재는 불필요.
- **권고:** 2000ms 유지. Phase C 디버그 요구 시 재평가.

### 7.3 ref mirror 패턴의 유지 비용 vs 이점

- lifecycle line 113–123: `onDetectionsRef` / `onSuccessRef` / `onFailureRef` / `setIsInferringRef` 4개 ref + useEffect 동기화.
- sampling line 87–110: 6개 ref + useEffect 동기화.
- 매 렌더마다 `useRef(cb).current = cb` 실행 — 비용 **마이크로초 이하**. 재렌더 유발 0 (ref 는 state 가 아님).
- 이점: driver 가 매 렌더에 handleResult/onBeforeInfer 를 useCallback 으로 재생성해도 lifecycle/sampling effect 는 재실행되지 않음. **effect 폭주 방지** 의 핵심 방어선.
- **결론:** 현 설계 유지. Arch R5 는 "3개 이상 ref mirror 패턴 반복되면 `useLatestRef` 공용 헬퍼 (5 LOC) 도입" 을 고려 (QA R3 §9 ref wrapper pattern 비대 가능성 언급과 동일).

---

## 8. R4 Dev TODO 리스트 + 완료기준

| # | 작업 | 필수도 | 완료 기준 |
|---|------|--------|-----------|
| 1 | M1 대응 — driver line 279–291 disabled reset effect 에 `eslint-disable-next-line react-hooks/set-state-in-effect` + 근거 주석 3줄 (본 문서 §1.3). | **필수** | `npx eslint staging/hooks/useBroadcasterYoloDriver.ts` 출력에서 해당 error 미등장. |
| 2 | M1 대응 — lifecycle line 221–233 worker effect `!enabled` 분기 동일 처리. | **필수** | `npx eslint staging/hooks/useYoloWorkerLifecycle.ts` 출력에서 해당 error 미등장. |
| 3 | M2 대응 — `staging/tests/helpers/workerStubs.ts` 신규 작성 (본 문서 §2.2 API 명세). | **필수** | 7개 공개 API export. vitest include 에는 **추가하지 않는다**. tsconfig.staging-check 에는 추가. |
| 4 | M2 대응 — `yoloWorkerLifecycle.test.ts` 리팩터: StubWorker/makeFrameIdRef/클린업을 helpers 에서 import. | **필수** | 파일 LOC 302 → 252 ±10. `vitest run` 6번 테스트 전부 green. |
| 5 | M2 대응 — `yoloSampling.test.ts` 리팩터: bitmap/video/worker mock 을 helpers 에서 import. | **필수** | 파일 LOC 242 → 227 ±10. `vitest run` 5번 테스트 전부 green. |
| 6 | MAJOR-R4-A — lifecycle 에 `STABLE_READY_MS = 60_000` + `stableReadyTimerRef` 추가. ready 수신 시 60초 후 `retryAttemptRef=0` / `setRetryAttempt(0)` 예약. 재 crash 시 기존 타이머 `clearTimeout`. | **필수** | `yoloWorkerLifecycle.test.ts` 에 신규 테스트 1건: "ready 후 1초 내 crash 시 retryAttempt 누적 유지" green. |
| 7 | MAJOR-R4-B — driver line 123 `openEventRef` 위에 주석 3줄 추가 (본 문서 §4.2 문구). | **필수** | diff 에 주석만 포함. 동작 변경 0. |
| 8 | MINOR-R4-d — driver disabled reset effect (line 279–291) 에 healthRef 초기화 3줄 추가. | 권고 | Dev 판단. 추가 시 주석 "OFF 상태 health 는 stale, ON 전환 시 flush" 포함. |
| 9 | MINOR-R4-g — driver 에 cameraId 변화 시 reset effect 추가 (disabled reset 과 동일 내용). | 권고 | Dev 판단. LOC +10 예상. |
| 10 | 체크리스트 문서 갱신 — `staging/docs/phase_b_src_migration_checklist.md` §3 에 옵션 C (`.eslintrc` 일괄 off) 항목 추가. | **필수** | 마크다운 체크박스 3개 (본 문서 §1.4). |
| 11 | `vitest.config.ts` comment 갱신 — "helpers 는 include 에 추가하지 않음" 한 줄. | **필수** | JSDoc 주석 업데이트. |
| 12 | `tsconfig.staging-check.json` include 에 `staging/tests/helpers/workerStubs.ts` 추가. | **필수** | `npx tsc --noEmit -p tsconfig.staging-check.json` exit=0. |
| 13 | `pnpm exec vitest run` — 6개 파일, 74→75+ 테스트 전부 green (MAJOR-R4-A 테스트 1건 추가). | **필수** | vitest 출력 "X passed / X total" (X >= 75). |

### 8.1 금지 사항 (재확인)

- `src/` 수정 **금지** (M1 옵션 C 는 Phase B src/ 반영 PR 로 이관).
- 파일 삭제 **금지**. 이동도 금지.
- `supabase.rpc(...).catch()` 금지.
- 기존 테스트 green 상태를 깨면 즉시 REJECT.

### 8.2 Dev 가 Arch 에 되물어야 하는 경우

- MAJOR-R4-A 의 `STABLE_READY_MS` 값 (60초) 이 짧거나 길다고 판단되면 R5 Arch 에 질문.
- `yoloWorkerLifecycle.test.ts` 에 추가할 신규 테스트가 fake timer + renderHook 으로 불가능하면 R5 Arch 에 대안 (integration test Phase E) 협의.
- helpers 파일이 100 LOC 초과하면 여러 파일로 분리 여부 질문.

---

## 9. R5 에 남길 질문

1. **MAJOR-R4-A `STABLE_READY_MS=60_000`** — 60초 임계값이 실제 운영에서 "정상 안정화" 를 판별하기에 적절한지. 사장님 실기기 테스트 후 조정 (30s / 90s / 120s 후보).
2. **MAJOR-R4-B openEventRef 이중 보유** — Phase C 라벨링 UI 에서 driver 의 openEvent.startedAt 이 노출되는지 설계 나오면 옵션 3 (driver ref 제거) 재검토.
3. **MINOR-R4-e 첫 tick 즉시 발사** — UX 미세 개선 요구가 있으면 sampling 의 `startInterval` 에 선반영 tick 추가.
4. **MINOR-R4-f NONE row 저장** — Phase C 다이어리가 NONE 구간을 UI 에 표시하려면 driver 가 cleared 시점에 "NONE row" 를 INSERT 할지 결정.
5. **MINOR-R4-h Worker terminate vs dispose 메시지 순서** — onnxruntime-web 공식 문서 확인 또는 통합 테스트 (Playwright) 로 실제 자원 해제 검증.
6. **M1 옵션 C 전환 시점** — Phase B src/ 반영 PR 에서 `.eslintrc` 수정 시 Phase A 5곳 동시 정리 가능한지 QA 확인.
7. **eslint warning `_frameId` unused** (driver line 165) — `_` 접두어로 충분하지만, tsconfig `noUnusedParameters` 가 향후 켜지면 재검토. 현재는 무시.
8. **`useLatestRef` 공용 헬퍼 도입 시점** — ref wrapper 패턴이 3개 이상 파일에 반복되면 `staging/hooks/useLatestRef.ts` (5 LOC) 추가 여부.
9. **9연속 PASS 카운트 — R4 PASS 시 2/9 진입** — R5~R12 팀이 계속 독립 검증.
10. **베타 → 성장 모드 전환 시** (사용자 30명) Phase B 재검증 필요 여부. 현재 베타 7명 → Phase B 전체 적용 시 row 폭증 유무가 SGM (성장 모드) 전환 트리거에 영향.

---

## 10. 변경 없음 항목 (R1~R3 결정 유지)

- §1 confirmFrames 3상태 union (R2 §1).
- §2 ONNX retry state machine (R2 §2).
- §3 뷰어 게이트 3중 방어선 (R2 §3).
- §5 flag 정책 (R1 §5).
- §6 Phase A logger 통합 (R1 §6).
- R3 의 driver 3분할 (lifecycle / sampling / driver compose).
- R3 의 vitest include 6파일 명시.

---

**Arch R4 최종 권고:**

- **M1 (react-hooks/set-state-in-effect 2건)**: 옵션 A-변형 (eslint-disable-next-line + 근거 주석). 옵션 C (.eslintrc off) 는 Phase B src/ 반영 PR 로 이관.
- **M2 (테스트 헬퍼 중복)**: `staging/tests/helpers/workerStubs.ts` 신규. 7개 API. 두 테스트 파일 각각 50/15 LOC 감소. vitest include 에는 추가 X.
- **R4 신규 발견**: **CRITICAL 0 · MAJOR 2 · MINOR 6**.
  - MAJOR-R4-A: retry 성공 후 즉시 재 crash 시 `retryAttemptRef` 리셋 타이밍 취약 → `STABLE_READY_MS` 60초 지연 리셋 도입 (**필수**).
  - MAJOR-R4-B: driver 와 logger 가 `openEventRef` 를 이중 보유 → driver 쪽 ref 는 startedAt 오차 수백 ms 허용 수용 + 주석 명시 (**필수**).
  - MINOR: R4-a/b/c/d/e/f/g/h/i 는 체크리스트 누적. R4 Dev 는 R4-d, R4-g 권고 (선택적).
- **R3 PASS 판정 유지 가능** — 본 R4 발견 중 **CRITICAL 없음**. R4 Dev 는 §8 의 TODO 13개만 수행하면 R5 QA 에서 PASS 가능.
- **9연속 PASS 카운트** — R4 Dev 산출물을 R5 QA 가 검증 시 PASS 면 **2/9 진입**.
