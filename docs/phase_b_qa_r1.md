# Phase B QA R1 결과

> 작성: 3번 QA Agent (R1, 이전 맥락 없음)
> 작성일: 2026-04-24
> 대상: Phase B (YOLO 온디바이스 추론 파이프라인) Dev 산출물 10개 파일.
> 기준: `docs/phase_b_arch_r1.md` + `CLAUDE.md` (WebRTC/Supabase 교훈 + 코드 품질 기준).

---

## 최종 판정: **REJECT**

9연속 PASS 규칙의 **R1 이라 엄격히 판정.** 근본 로직 1건(CRITICAL), 설계 불일치/회귀 2건(MAJOR), 정합성/잔결함 5건(MINOR) 발견. 세부 항목은 아래 참조.

### 라인수 / 한도 확인 (선행 체크)

| 파일 | LOC | 한도 | 결과 |
|------|-----|------|------|
| `yoloV2Flag.ts` | 39 | 400 | OK |
| `confirmFrames.ts` | 86 | 400 | OK |
| `maxDurationGuard.ts` | 54 | 400 | OK |
| `useBehaviorInferenceScheduler.ts` | 205 | 400 | OK |
| `useBroadcasterYoloDriver.ts` | 394 | 400 | OK (헐렁 아님, 400 거의 턱걸이) |
| `CameraBroadcastYoloMount.tsx` | 69 | 컴포넌트 100 | OK |
| `confirmFrames.test.ts` | 142 | 400 | OK |
| `maxDurationGuard.test.ts` | 89 | 400 | OK |
| `inferenceScheduler.parity.test.ts` | 153 | 400 | OK |
| `broadcasterYoloDriver.test.ts` | 234 | 400 | OK |

Driver 의 useState 6개 / useEffect 4개 — 한도 내. Mount 컴포넌트 props 6개 — 한도 내. `any` 사용 0건 (전부 `unknown` narrowing).

---

## R1 ~ R9 관점별 결과

### R1 동작 — **PASS (조건부)**

- 순수 lib 3개 (`yoloV2Flag`, `confirmFrames`, `maxDurationGuard`) 엄격 모드 TSC 통과.
- Worker URL `new URL("../workers/yoloInference.worker.ts", import.meta.url)` 는 기존 `useBehaviorDetection` 과 동일 패턴이므로 Next.js Turbopack 호환 확인됨.
- 프로젝트 전체 `tsc --noEmit` 은 `staging/` 이 `exclude` 되어 있어 Phase B 파일이 검증 대상에서 빠짐 (`tsconfig.json` line 33). → **MINOR 1**: Phase B 파일도 `tsconfig.staging-check.json` include 에 추가해야 실질 CI 검증 가능.

### R2 설계 일치 — **REJECT**

- 설계서 §3.3 명시: *"그 외 → confirmedKey = null (**현재 상태 유지하라는 뜻**)"*.
- Dev `useBroadcasterYoloDriver.handleResult` (line 139-144): `confirmedKey === null` 이면 `currentBehaviorRef.current` 를 **무조건 null 로 클리어**.
- 즉, 창(history) 이 아직 windowSize 미달이거나 혼재 상태에서도 현재 확정된 행동을 날려버린다 → 기존 `src/hooks/useBehaviorDetection.ts` 의 "3프레임 연속이어야만 전환" 보호막을 상실.
- **수정안:** `handleResult` 에서 `confirmedKey === null` 일 때 "이번 프레임이 실제로 `__none__` x windowSize 로 확정된 경우" vs "히스토리 부족/혼재" 를 구분해야 함. 구현 2가지 중 택1:
  1. `confirmDetection` 반환 타입에 `reason: "none-confirmed" | "pending" | "mixed"` 를 추가해 호출부가 분기.
  2. 기존 `useBehaviorDetection` 처럼 "windowSize 충족 + 전부 동일 + 키==NONE_KEY" 일 때만 `null` 로 전환, 그 외에는 **현재 상태 유지**.

### R3 단순화 — **REJECT (MINOR)**

- 394라인 driver 가 한도 400 에 너무 근접. 분리 후보:
  1. Worker lifecycle (disposeWorker / scheduleRetry / bumpFailure / handleWorkerError / handleWorkerMessage) → `staging/hooks/useYoloWorkerLifecycle.ts` (별도 훅).
  2. `tick` / `startInterval` / `stopInterval` (sampling 파트) → 그대로 유지.
- 현재는 함수 선언이 `useEffect` 뒤에 흩어져 있어 읽기 순서가 꼬임 (hoisting 에 의존). 분리하면 400/100 한도 안전 마진 확보 + 각 훅을 개별 테스트 가능.
- **수정안:** R2 에서 Arch 가 driver 를 2개 훅 (워커 수명 + 샘플링) 으로 분해할지 결정. 분해 없이 유지하면 R2 부터 fragile.

### R4 가독성 — **PASS (조건부)**

- 한글 주석 충분. 변수명 직관적 (`historyRef`, `confWindowRef`, `openEventRef`, `regimeRef`).
- ⚠️ `handleResult` (25줄) 내부에 검사 단계 번호 주석이 없다 → 비전공자 읽기 난이도 높음. **MINOR 2**.
- Driver 의 "function declaration after useEffect" 레이아웃은 JS hoisting 에 의존. ESLint "no-use-before-define" 룰 적용 시 경고 가능. **MINOR 3**.

### R5 엣지케이스 — **REJECT**

설계서 §4 의 14개 케이스 중 **미처리/부분처리** 목록:

| # | 케이스 | 상태 | 세부 |
|---|--------|------|------|
| 2 | 배터리 저전력 | 부분 | scheduler 는 tick 2배 처리. driver 는 아무 것도 안 함 (설계서 §4 #2 "level<0.1 이면 enabled=false" 는 R2 위임 명시 → 여기선 OK) |
| 3 | ONNX 로드 실패 | **부분 미준수** | MAX_INIT_FAILURES=3 초과 시 `scheduleRetry` 가 60초 뒤 **카운터만 리셋** — 실제 `new Worker` 재생성은 **호출되지 않음**. `useEffect` 재실행 트리거가 `enabled` deps 뿐이라 무한 대기. **CRITICAL 후보**. (아래 CRITICAL 절 참조) |
| 4 | 모델 버전 mismatch | 미처리 | worker 의 `inputNames/outputNames/dims` 런타임 검증은 `yoloInference.worker.ts` (Phase A) 에 존재. driver 는 "v1" 고정 — Phase E archive SQL 과 맞음. OK. |
| 5 | visibility hidden | OK | `historyRef.current=[]`, `confWindowRef.current=[]`, current → null 전환. 단 `avgConfidence` 는 리셋 안 됨. **MINOR 4**. |
| 7 | 백그라운드 탭 스로틀링 | **미준수** | 설계서는 `performance.now()` 기반 경과 체크를 R2 에 위임했으나 "scheduler.shouldInferNow" API 는 만들어 둠. driver 는 `setInterval` + busy guard 만 사용하고 `scheduler.shouldInferNow` 를 실제로 호출하지 않는다 (import 조차 안 함). `shouldInferNow` export 는 **Dead code**. |
| 10 | 30분 초과 | OK | tick 안에서 `shouldForceClose` 확인 + state 리셋. |
| 11 | Worker crash | 부분 | `handleWorkerError` 가 dispose 후 재시도는 `scheduleRetry` 에 위임. 위 #3 과 동일 문제 (재생성 미작동). |
| 14 | 뷰어 중복 INSERT | 미확인 | Dev 산출물은 방송폰 Mount 추가만 수행. 뷰어 측 `useBehaviorDetection` 의 `onBehaviorChange` 주입을 flag ON 시 미주입 처리하는 로직은 **아직 없음**. 설계서 §5.1 표 "flag ON → 뷰어는 프리뷰만" 약속을 코드로 강제하는 장치 0. 이 분리는 src/ 반영 단계에서 처리 예정이라 해도 **staging 컴포넌트 문서 (CameraBroadcastYoloMount.tsx 주석) 에도 언급이 없음**. R2 에 반영 필요. |

### R6 성능 — **REJECT (MINOR)**

- `setIsInferring(true)` → `finally` `setIsInferring(false)` — 둘 다 createImageBitmap/postMessage 동기 구간에서 설정/해제. React batching 으로 **isInferring 이 UI 에서 true 로 보이는 순간이 사실상 0**. Worker 결과 도착까지의 진짜 "추론 중" 상태를 표현 못 함. `busyRef.current` 를 토대로 `setIsInferring` 을 worker 응답(line 162) 에서 해제하는 게 맞음. **MINOR 5**.
- `setHealth((h) => ...)` 패턴을 4곳에서 각각 호출 → tick 1회당 최소 2회 state 업데이트 (ticksTotal + success/failure) → 400라인 근처에서 불필요 리렌더 증가. **MINOR 6**: health 는 ref 에 보관하고 별도 주기로 flush 하거나, inferSuccesses/Failures 만 노출하는 selector 훅으로 분리.
- `useBehaviorInferenceScheduler` 의 `useMemo` deps 에 `wallClockTick` 포함 — 의도적인 invalidation 이라 주석 달아뒀으나 `nowRef.current()` 를 호출하는 시점은 `useMemo` 재평가 시이므로 **22:00 경계 판정이 최대 60초 늦을 수 있음**. 설계서 허용 오차 내 (tick 주기 5s 에서 1분 지연은 무의미). OK.

### R7 보안 — **PASS**

- XSS / 하드코딩 시크릿 / RLS 우회 / localStorage 무단 접근 0건.
- `yoloV2Flag.ts` 는 `process.env.NEXT_PUBLIC_CAT_YOLO_V2` 만 읽음 (client-safe prefix).
- Worker URL 은 상대 경로 bundle. 외부 URL 주입 불가. OK.

### R8 영향 범위 — **PASS**

- `staging/hooks/useBehaviorEventLogger.ts` 와 `src/hooks/useBehaviorEventLogger.ts` **diff 0 lines** (Bash diff 확인).
- Phase B 신규 5개 파일(`yoloV2Flag.ts`, `confirmFrames.ts`, `maxDurationGuard.ts`, `useBehaviorInferenceScheduler.ts`, `useBroadcasterYoloDriver.ts`, `CameraBroadcastYoloMount.tsx`) 전부 `staging/` 하위. `src/` 파일 수정 0건.
- `src` 내부에서 Phase B staging 심볼 import 0 건 (Grep 검증). flag OFF 경로 무손상.

### R9 최종 품질 — **REJECT**

- R1 은 "탄탄한 기반" 이 필수인데 R2/R5 CRITICAL 이 남아있어 PASS 불가.
- 시니어 리뷰어라면 "confirm 의 null 의미 이원화" + "ONNX 재시도 무한 대기" 두 건을 가장 먼저 지적할 것.

---

## 추가 체크리스트 결과

- [x] `.catch()` 금지 패턴 (supabase.rpc) 위반 0건 — staging/ 내 `.catch()` 는 `navigator.getBattery()` / `document.exitFullscreen()` 등 **진짜 Promise** 에만 사용. Supabase rpc 에는 `.then(() => undefined, () => undefined)` 패턴 또는 void 만 사용 확인.
- [ ] `new Worker` 직전 기존 ref close — **부분 준수**. Line 188 `if (workerRef.current) disposeWorker();` 로 방어. ✅. 단 `disposeWorker` 내부의 `w.postMessage({type:"dispose"})` 가 **try/catch 밖이 아닌 안** 이라 OK. 그러나 `w.removeEventListener(..., handleWorkerMessage)` 는 `handleWorkerMessage` 가 useCallback stable 이라 문제없음.
- [x] 파일 400 / 컴포넌트 100 / useEffect 7 / useState 8 / props 12 한도 준수 — Driver 가 394/400 턱걸이 (R3 지적).
- [x] 콜백 중첩 3단계 이상 금지 — 준수 (최대 2단계).
- [x] `any` 사용 0건 — `unknown` narrowing + `satisfies` 조합 사용.
- [ ] 테스트 fixture 가 설계서 엣지케이스 커버 충분 — **부족**: 엣지 #3 (worker 실패 재시도), #11 (worker crash), #14 (뷰어 중복 INSERT) 테스트 없음. `broadcasterYoloDriver.test.ts` 는 순수 로직 시뮬레이터일 뿐 훅 본체 검증 아님. Dev 가 "vitest/jest 미도입" 을 이유로 유보한 건 이해하나, R2 에서 runner 도입 없이는 R1 통과 불가로 판정.
- [x] model_version="v1" 고정 — Phase A SQL effective_class 와 mismatch 위험 없음 (src/ Phase A logger `BEHAVIOR_MODEL_VERSION="v1"` 그대로 유지).
- [x] `NONE_KEY` 센티넬 충돌 위험 — `"__none__"` 문자열은 src/ `useBehaviorDetection.ts` line 48, src/ `useBehaviorEventLogger.ts` line 82, staging/ 와 완전 동일. 중복 정의지만 값 일치하므로 현 시점 문제 없음. 단 향후 변경 시 sync 필요 → **MINOR 7**: 공통 상수 모듈로 export 권장.

---

## REJECT 사유 요약 (우선순위)

### 1. CRITICAL (1건)

**C1. `confirmDetection` 의 `confirmedKey === null` 이원 의미를 driver 가 구분하지 못함.**
- 위치: `staging/hooks/useBroadcasterYoloDriver.ts:139-144`
- 설계서 §3.3 은 "창 혼재 / 히스토리 부족 → 현재 상태 유지" 를 명시했으나, 구현은 **무조건 현재 행동을 null 로 클리어**.
- 영향: 5초 tick 환경에서 단발 오탐(eating 프레임 1장이 sleeping 흐름에 섞임)만으로도 확정 sleeping 이벤트가 조기 close → `cat_behavior_events` row 폭증 → Supabase Nano pool 재고갈 (CLAUDE.md #7, #10). 기존 `useBehaviorDetection` 의 "3프레임 보호" 가 **퇴행**.
- 수정안: `confirmDetection` 반환 타입을 `{ status: "confirmed-key" | "confirmed-none" | "pending"; key?: string; newHistory: string[] }` 로 재설계하고 driver 가 status 기반 분기. 또는 driver 에서 `newHistory.length === windowSize && newHistory.every(===NONE_KEY)` 을 직접 판정하는 방식으로 우회.

### 2. MAJOR (2건)

**M1. ONNX 로드 실패 시 재시도 무한 대기.**
- 위치: `useBroadcasterYoloDriver.ts:189-192`, `310-316`.
- `initFailuresRef.current >= MAX_INIT_FAILURES` 분기에서 `scheduleRetry()` 호출. 60초 뒤 `initFailuresRef.current = 0` 으로 카운터만 리셋될 뿐, **`new Worker` 재생성 트리거가 없음**. `useEffect` 재실행은 `enabled` deps 변경에만 의존하는데 그대로면 영원히 깨어나지 않음.
- 수정안: scheduleRetry 에 `setRetryGen((n) => n + 1)` 같은 state 증가를 포함시켜 useEffect 재실행 유도. 또는 `retryTimerRef` 콜백에서 직접 worker 재생성 루틴 호출.

**M2. 설계서 §4 엣지 #14 (뷰어 측 `onBehaviorChange` 미주입) 를 enforce 하는 장치가 없음.**
- 설계서는 "flag ON 시 뷰어 측에서 `useBehaviorDetection` 은 프리뷰 전용, `onBehaviorChange` 미주입" 을 약속함. Dev 산출물은 방송폰 Mount 컴포넌트만 추가했고 뷰어 측 분리 코드/주석/가드 모두 부재. src/ 반영 단계에서 누락 시 **중복 INSERT** 발생 즉시 Supabase pool 고갈.
- 수정안: `CameraBroadcastYoloMount.tsx` 사용 예시 주석에 "src/ 반영 시 뷰어 `useBehaviorDetection` 의 `onBehaviorChange` 를 `isYoloV2Enabled() ? undefined : onChangeHandler` 로 게이트해야 함" 추가. Phase A 영향 체크리스트 업데이트. Arch R2 에 명시 요청.

### 3. MINOR (7건)

- M3. `tsconfig.staging-check.json` 에 Phase B 신규 6개 파일 미등록 → CI 타입체크 미작동.
- M4. `isInferring` state 가 실제 worker busy 상태를 반영하지 않음 (finally 즉시 false). `busyRef` 기반 노출 필요.
- M5. force-close / visibility-hidden 경로에서 `avgConfidence` 가 리셋되지 않음 → 새 row 첫 샘플이 stale 값 사용.
- M6. `scheduler.shouldInferNow` 가 driver 에서 호출되지 않음 → dead code (설계서 §4 #7 백그라운드 탭 스로틀링 대응 미구현).
- M7. `setHealth` 가 tick 당 2회 호출 → 불필요 리렌더. ref + debounced state 로 개선 권장.
- M8. `NONE_KEY = "__none__"` 가 staging/src 양쪽 훅에 각각 하드코딩 → 공통 상수 export 권장.
- M9. Driver 의 inner function declarations (disposeWorker/tick 등) 가 useEffect 뒤에 배치 — hoisting 의존. eslint `no-use-before-define` 적용 시 경고.

---

## 다음 R2 에 남길 힌트 / R2 Arch 에 요청할 사항

1. **`confirmDetection` API 재설계** (C1). 반환값에 status enum 도입 결정. 기존 테스트 8건도 갱신 필요.
2. **Worker 재시도 루프** (M1). useEffect 의 트리거 메커니즘을 state 증가로 바꿀지, refactor 해서 별도 `useYoloWorkerLifecycle` 훅으로 분리할지 결정.
3. **Driver 분해 여부** (R3). 394/400 턱걸이. Arch 가 "분해한다 vs 유지한다" 결정 주도.
4. **뷰어 측 `useBehaviorDetection` 게이트** (M2). `CameraBroadcastYoloMount` 주석에 src/ 반영 시 주의사항 1 블록 추가.
5. **백그라운드 탭 스로틀링 대응** (M6). `scheduler.shouldInferNow` 를 driver 에서 실제 활용하게 할지, 제거할지 결정.
6. **테스트 runner 도입 결정** (체크리스트). vitest 미도입 상태에서 R1 통과 가능한지 사장님 컨펌 필요. 현재 runner-agnostic export 형식은 CI 자동화 어려움.
7. **model_version 교체 시점** — R1 에선 "v1" 유지로 문제 없음. R2 이후 승인 시 `BEHAVIOR_MODEL_VERSION` 상수 1줄 변경.

---

**QA R1 최종 권고:** CRITICAL 1 + MAJOR 2 모두 R2 Arch 가 설계 단계에서 재결정해야 하는 사안. Dev 혼자 수정 불가. 우선순위: C1 (confirm 이원 의미) > M1 (재시도 루프) > M2 (뷰어 enforce) > 나머지 MINOR. R2 부터 9연속 PASS 카운트 시작.
