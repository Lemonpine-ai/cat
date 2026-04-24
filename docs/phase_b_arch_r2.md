# Phase B Arch R2 — R1 REJECT 대응 재설계

> 작성: 1번 Arch Agent (R2, 독립 실행)
> 작성일: 2026-04-24
> 선행 문서: `docs/phase_b_arch_r1.md` (기본 틀 유지), `docs/phase_b_qa_r1.md` (REJECT 사유)
> 범위: R1 QA 가 REJECT 한 CRITICAL 1 + MAJOR 2 의 설계 재결정 + MINOR 7 건 처리 방침.
> 원칙: R1 §1 파일 구조 / §5 flag 정책 / §6 Phase A 통합은 **그대로 유지**. 본 문서는 "수정 delta" 만 명시.

---

## 0. R1 REJECT 3건 재설계 요약

| 코드 | 레벨 | R1 QA 지적 | R2 재설계 핵심 |
|------|------|-------------|----------------|
| **C1** | CRITICAL | `confirmDetection` 의 `confirmedKey=null` 이 "히스토리 부족/혼재"와 "NONE × windowSize 확정"을 **동일 반환값**으로 압축 → driver 가 두 케이스 모두 currentBehavior 클리어 → 단발 오탐으로 확정 이벤트 조기 close → row 폭증 → Supabase Nano pool 재고갈 | `confirmDetection` 반환을 **3상태 discriminated union** 으로 재설계: `confirmed` / `pending` / `cleared`. Driver `handleResult` 는 status 별로 분기 — `pending` 은 **상태 유지**, `cleared` 만 currentBehavior → null. |
| **M1** | MAJOR | `scheduleRetry` 가 60초 뒤 failure counter 만 리셋 → `useEffect` 재실행 트리거 없음 → 영원히 재생성 안 됨 | retry 전용 **`useState<number>` (retryGen)** 도입 → `scheduleRetry` 가 `setRetryGen(n => n + 1)` 호출 → worker 생성 `useEffect` 의 deps 에 `retryGen` 추가 → 재실행 트리거. 최대 재시도 5회 + 지수 백오프 (30s/60s/120s/240s/480s). 사용자 노출 상태 `initStatus: "idle" \| "loading" \| "ready" \| "failed"`. |
| **M2** | MAJOR | 뷰어 측 `onBehaviorChange` 미주입 약속을 강제하는 장치 (코드/가드/체크리스트) 전무 | (a) **런타임 가드**: `useBehaviorDetection` 에 `isViewer` 옵션 추가 예약 (src/ 반영 시) + staging 단계에서는 `CameraBroadcastYoloMount` 주석/README 에 enforce 요구. (b) **체크리스트 파일 신규**: `staging/docs/phase_b_src_migration_checklist.md`. (c) **env 감시**: staging 컨텍스트에서 `isYoloV2Enabled() && typeof window !== "undefined" && window.__catViewerBehaviorLoggerArmed__` 전역 플래그로 "두 경로 동시 활성 시" dev 전용 console.error 경고. |

---

## 1. C1 재설계 — `confirmFrames` 3상태 반환

### 1.1 TypeScript 타입 시그니처 (구현 X)

```
export const NONE_KEY = "__none__" as const;

/**
 * 3상태 discriminated union.
 *  - "confirmed": 최근 windowSize 프레임이 전부 동일 실제 클래스로 확정.
 *                key 는 12 화이트리스트 중 하나 (NONE_KEY 아님).
 *  - "pending":   아직 windowSize 미충족 or 창 내 키가 혼재 → 호출부는 "현재 상태 유지".
 *  - "cleared":   최근 windowSize 프레임이 전부 NONE_KEY 로 동일 → "진짜 고양이 없음" 확정 →
 *                호출부는 currentBehavior 를 null 로 close.
 */
export type ConfirmResult =
  | { readonly status: "confirmed"; readonly key: string; readonly newHistory: string[] }
  | { readonly status: "pending"; readonly newHistory: string[] }
  | { readonly status: "cleared"; readonly newHistory: string[] };

export function confirmDetection(
  history: readonly string[],
  incomingKey: string,
  windowSize: number,
): ConfirmResult;
```

**불변식 (테스트로 강제):**
1. `windowSize < 1` 이면 throw (기존 유지).
2. `newHistory.length <= windowSize` 항상 성립.
3. `status === "confirmed"` 이면 `key !== NONE_KEY` 이고 `newHistory.every(k => k === key)`.
4. `status === "cleared"` 이면 `newHistory.length === windowSize && newHistory.every(k => k === NONE_KEY)`.
5. `status === "pending"` 이면 **그 외 전부** (길이 미달 or 혼재 or NONE 미충족).

### 1.2 판정 로직 (pseudo-code, 구현 X)

```
1) newHistory = [...history, incomingKey].slice(-windowSize)
2) if (newHistory.length < windowSize) return { status: "pending", newHistory }
3) first = newHistory[0]
4) if (!newHistory.every(k => k === first)) return { status: "pending", newHistory }
5) if (first === NONE_KEY) return { status: "cleared", newHistory }
6) return { status: "confirmed", key: first, newHistory }
```

### 1.3 driver `handleResult` 각 status 분기 (pseudo-code, 구현 X)

```
function handleResult(detections):
  top = detections[0] ?? null   // 최상위 신뢰도 1개
  incomingKey = top?.classKey ?? NONE_KEY

  // avgConfidence 누적: top 있을 때만 푸시 (pending/cleared 모두 공통)
  if (top) pushAvgConfidence(top.confidence)

  win = regime === "night" ? CONFIRM_FRAMES_NIGHT : CONFIRM_FRAMES_DAY
  result = confirmDetection(historyRef.current, incomingKey, win)
  historyRef.current = result.newHistory

  switch (result.status):
    case "pending":
      // 아무 것도 하지 않는다. currentBehavior 변경 X, logger 주입 X.
      // ← R1 버그 수정 핵심: 단발 오탐으로 확정 이벤트를 깨지 않음.
      return

    case "cleared":
      // 진짜 고양이 없음 확정 → open event close.
      if (currentBehaviorRef.current !== null):
        currentBehaviorRef.current = null
        openEventRef.current = null
        avgConfWindowRef.current = []       // ← MINOR M5 동시 해결 (stale 방지)
        setAvgConfidence(undefined)
        setCurrentBehavior(null)
      return

    case "confirmed":
      // 새 클래스 확정 or 동일 클래스 유지.
      if (currentBehaviorRef.current?.classKey !== result.key and top is not null):
        currentBehaviorRef.current = top
        openEventRef.current = { startedAt: new Date(), classKey: result.key }
        setCurrentBehavior(top)
      // 같은 classKey 면 logger 가 알아서 ended_at 갱신 (Phase A 책임).
      return
```

### 1.4 엣지케이스 처리

| 케이스 | 입력 예 | 결과 |
|--------|---------|------|
| 창 크기 미만 | history=[], incoming="sleeping", win=3 | `pending`, newHistory=["sleeping"] |
| 창 크기 경계 (딱 충족) | history=["sleeping","sleeping"], incoming="sleeping", win=3 | `confirmed` "sleeping" |
| NONE 섞임 (혼재) | history=["sleeping","sleeping"], incoming=NONE, win=3 | `pending` (NONE 하나로는 cleared 못 감) |
| NONE × windowSize (cleared) | history=[NONE,NONE], incoming=NONE, win=3 | `cleared` |
| 클래스 전환 (pending 구간) | history=["sleeping","sleeping","eating"], win=3 | `pending` (혼재) |
| 클래스 전환 완료 | history=["eating","eating"], incoming="eating", win=3 | `confirmed` "eating" |
| 야간 완화 (win=2) | history=["sleeping"], incoming="sleeping", win=2 | `confirmed` "sleeping" |

**핵심 변화:** "히스토리 부족/혼재 (pending)" 과 "NONE 확정 (cleared)" 이 **절대 섞이지 않는다**. Driver 는 status enum 만 보고 분기 → 설계서 §3.3 의 "현재 상태 유지하라는 뜻" 의미가 타입 레벨에서 강제됨.

### 1.5 기존 테스트 갱신 요구

- `staging/tests/confirmFrames.test.ts` 8건 반환 구조 전면 재작성 필요 (`.confirmedKey` 접근 → `.status` 분기).
- 최소 테스트 매트릭스 (Dev 구현 기준):
  1. pending: 창 미달
  2. pending: 혼재
  3. pending: NONE 1개 섞임
  4. confirmed: 최초 충족
  5. confirmed: 클래스 전환
  6. cleared: NONE × windowSize
  7. cleared → confirmed 전환
  8. confirmed → pending (혼재로 떨어짐) → 기존 currentBehavior 유지됨을 driver 통합 테스트로 검증
  9. windowSize=1 경계 (즉시 확정)
  10. windowSize < 1 throw

---

## 2. M1 재설계 — ONNX retry 복구 경로

### 2.1 retry state 관리 방식

**결정:** `useState<number>` (retryGen) + worker 생성 `useEffect` deps 포함.

**근거:**
- `setTimeout` 콜백 안에서 worker 생성 로직을 직접 호출하는 경로는 "현재 enabled 값" 을 closure 에서 stale 하게 읽을 위험. deps 기반 재실행이 React 관례와 일치.
- retryGen 증가 → effect cleanup → effect 재실행 → `new Worker` → 정상 경로로 합류. 기존 cleanup 이 `disposeWorker()` 를 실행하므로 리소스 누수 없음.

### 2.2 상태/리소스 추가

```
// useState
const [retryGen, setRetryGen] = useState<number>(0);
const [initStatus, setInitStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");

// useRef
const retryAttemptRef = useRef<number>(0);        // 누적 retry 횟수 (0..MAX_RETRIES)
const retryTimerRef = useRef<number | null>(null); // 기존 유지, setTimeout id
```

### 2.3 상수

```
const MAX_RETRIES = 5;                                // 최대 재시도 횟수 (5회 시도 → 6회 총 시도)
const RETRY_BASE_MS = 30_000;                         // 첫 재시도 30초
const RETRY_MAX_MS = 480_000;                         // 상한 8분 (지수 백오프 포화점)
// 지수 백오프: delay = min(RETRY_BASE_MS * 2^(attempt-1), RETRY_MAX_MS)
//  attempt=1 → 30s, 2 → 60s, 3 → 120s, 4 → 240s, 5 → 480s
```

### 2.4 재설계된 `scheduleRetry` (pseudo-code, 구현 X)

```
function scheduleRetry():
  if (retryTimerRef.current !== null) return  // 이미 예약됨
  if (retryAttemptRef.current >= MAX_RETRIES):
    setInitStatus("failed")                   // 사용자 노출 상태 — UI 가 flag 자동 OFF 유도
    return

  retryAttemptRef.current += 1
  delay = min(RETRY_BASE_MS * 2^(retryAttemptRef.current - 1), RETRY_MAX_MS)

  retryTimerRef.current = window.setTimeout(() => {
    retryTimerRef.current = null
    initFailuresRef.current = 0
    setRetryGen(n => n + 1)                   // ← effect 재실행 트리거 (핵심)
  }, delay)
```

### 2.5 worker 생성 `useEffect` deps 변경

기존 deps: `[enabled]`
**신규 deps:** `[enabled, retryGen]`

- 같은 enabled 값이라도 retryGen 이 바뀌면 재실행 → cleanup → 새 worker 생성.
- 성공 시 (`msg.type === "ready"`) `retryAttemptRef.current = 0; initFailuresRef.current = 0; setInitStatus("ready")`.
- enabled → false 로 전환되면 retryAttemptRef/retryTimerRef 모두 리셋 (cleanup 내).

### 2.6 사용자 visible 상태 (DriverResult 확장)

기존:
```
health: { ticksTotal, inferSuccesses, inferFailures, lastBackendError }
```

**신규 추가:**
```
initStatus: "idle" | "loading" | "ready" | "failed";
retryAttempt: number;           // 0..MAX_RETRIES (현재 누적 시도 수)
```

`CameraBroadcastYoloMount` 는 `initStatus === "failed"` 시 디버그 로그를 console.warn 으로 1회 출력. UI 표시는 Phase C 로 미룸 (MINOR 확장 여지).

### 2.7 엣지케이스

| 케이스 | 처리 |
|--------|------|
| enabled=true → false 전환 중 retry 대기 | cleanup 에서 `clearTimeout(retryTimerRef.current)` + `retryAttemptRef.current = 0` 리셋. |
| retry 성공 후 worker 또 crash | `retryAttemptRef` 는 "ready 메시지 수신 시점에" 0으로 리셋되므로 새 계열의 backoff 시작 (정상). |
| 5회 모두 실패 | `initStatus="failed"`. 사용자가 reload 해야 회복. UX 는 Phase C 가 결정 (R3 위임). |
| 네트워크 이슈로 모델 fetch 지연 | ort 자체 타임아웃은 worker 쪽 책임. 외부에서는 "ready 안 옴" = 일정 시간 후 error 메시지 수신 → 재시도 루프로 합류. |

---

## 3. M2 재설계 — 뷰어 게이트 강제

### 3.1 3중 방어선

| 층 | 수단 | 목적 | 시점 |
|----|------|------|------|
| **L1 (문서)** | `staging/docs/phase_b_src_migration_checklist.md` (신규) | src/ 반영 PR 리뷰어가 누락 체크 | R2 Dev 단계 |
| **L2 (주석)** | `CameraBroadcastYoloMount.tsx` JSDoc + README 블록 | Dev 가 wrapper 컴포넌트 볼 때 1차 경고 | R2 Dev 단계 |
| **L3 (런타임)** | dev-only 전역 sentinel 플래그 + console.error | 개발/스테이징에서 "두 경로 동시 활성" 즉시 감지 | R2 Dev 단계 |

### 3.2 L1 — 체크리스트 파일 (신규, staging/docs/)

**경로:** `staging/docs/phase_b_src_migration_checklist.md`

**내용 구조 (Dev 가 작성할 항목, Arch 가 명시):**
```
# Phase B → src/ 반영 체크리스트

## 플래그 ON 전 필수 작업
- [ ] src/hooks/useBehaviorDetection.ts 의 onBehaviorChange 호출부를 다음과 같이 게이트:
      onBehaviorChange: isYoloV2Enabled() ? undefined : existingHandler
      (또는 isViewer 옵션을 훅에 추가하고 상위에서 true 로 주입)
- [ ] src/app/camera/view/* 에서 useBehaviorDetection 을 import 하는 곳 1건 찾아
      동일 게이트 적용 (Grep: "useBehaviorDetection(")
- [ ] 방송폰 경로 (src/app/camera/broadcast/CameraBroadcastClient.tsx) 에
      <CameraBroadcastYoloMount /> 한 줄 추가 (flag 분기는 Mount 컴포넌트 내부에서 수행)
- [ ] Vercel env NEXT_PUBLIC_CAT_YOLO_V2=1 설정 + 빈 커밋 push + getDeployments READY 확인
- [ ] Supabase MCP 로 cat_behavior_events row 수 baseline 기록
- [ ] 방송폰 1대 24시간 모니터링 (row 증가율 / Realtime pool 소진 여부)

## 플래그 ON 직후 30분 관찰
- [ ] 뷰어 탭에서 DB INSERT 가 0건임을 SQL 로 확인 (중복 기록 없음)
- [ ] 방송폰에서만 INSERT 발생하는지 camera_id 분포 확인
- [ ] Supabase DB pool 사용률 60% 이하 유지

## 롤백 경로
- [ ] Vercel Instant Rollback 대상 commit ID 메모
- [ ] env 를 "0" 으로 되돌리고 빈 커밋 push (DB 변경 없음 → 데이터 보존)
```

### 3.3 L2 — wrapper 컴포넌트 주석 (수정)

`CameraBroadcastYoloMount.tsx` 최상단 JSDoc 에 다음 블록 필수 삽입 (Dev 가 작성):

```
/**
 * ⚠️ src/ 반영 시 필수 작업 (CLAUDE.md #13, Phase B Arch R2 §3.3):
 *
 *   1. src/hooks/useBehaviorDetection.ts 를 호출하는 **뷰어폰** 경로에서
 *      `onBehaviorChange` 를 flag ON 시 `undefined` 로 전달해야 한다.
 *      (방송폰 = 이 컴포넌트, 뷰어폰 = src/app/camera/view/*)
 *
 *   2. 미실행 시 방송폰 INSERT + 뷰어 4명 INSERT 동시 발생 →
 *      Supabase Nano pool (=15) 즉시 고갈 → 전면 timeout (2026-04-22 장애 재현).
 *
 *   3. 체크리스트: staging/docs/phase_b_src_migration_checklist.md
 */
```

### 3.4 L3 — 런타임 dev-only sentinel

**아이디어:** `window.__catBehaviorLoggerArmed__` 전역 sentinel 로 "logger 경로가 이미 누군가에 의해 활성화됨" 을 표시. 두 경로가 모두 활성되면 dev 환경에서만 `console.error` + 1회 logger 주입 차단.

**API 명세 (구현 X):**
```
// staging/lib/behavior/loggerArmGuard.ts (신규 파일)

/** Dev 환경에서만 동작. Prod 에선 no-op. */
export function armBehaviorLogger(source: "broadcaster" | "viewer"): () => void;

/**
 * 규칙:
 *  - 첫 호출: window.__catBehaviorLoggerArmed__ = source
 *  - 두번째 호출 (다른 source): console.error + unarm 콜백 반환값 호출자가 즉시 실행
 *  - 동일 source 재호출: 안전 (idempotent)
 *  - production 빌드 (process.env.NODE_ENV === "production"): no-op + () => {} 반환
 *
 * 반환:
 *  - cleanup 함수. 컴포넌트 unmount 시 호출하여 sentinel 해제.
 */
```

**사용처:**
- `useBroadcasterYoloDriver` 의 enabled=true effect 에서 `armBehaviorLogger("broadcaster")` 호출, cleanup 에서 해제.
- src/ 반영 시 뷰어 `useBehaviorDetection` 에서 `onBehaviorChange` 주입되는 경로에만 `armBehaviorLogger("viewer")` 호출 추가 (R2 Dev 는 staging 내 주석으로만 명시, 실제 src/ 수정은 최종 머지 PR 에서).

**한도:** 이 가드는 dev 환경에서만 **경고**를 낸다. prod 에서 누락된 상태로 머지되면 감지 못 함. 그래서 L1 (체크리스트) + L2 (주석) 과 3중 방어.

### 3.5 뷰어 훅 호출 컨벤션 (정책 고정)

- flag ON 시: 뷰어 `useBehaviorDetection` 은 **프리뷰 전용** = `onBehaviorChange: undefined`. 내부 state (overlay 표시용) 는 계속 업데이트. DB INSERT 는 완전 차단.
- flag OFF 시: 기존과 동일 (`onBehaviorChange` 주입 → logger 경유 → INSERT). 방송폰 경로는 Mount 렌더 skip.
- 뷰어 훅에 `isViewer` 옵션 **추가하지 않는다** (R2 결정). 이유: src/ 수정 최소화 원칙 (CLAUDE.md #13). 상위 컴포넌트가 `onBehaviorChange` 를 `undefined` 로 내리는 것만으로 충분.

---

## 4. MINOR 대응

| # | MINOR | R2 처리 | 근거 |
|---|-------|---------|------|
| M3 | `tsconfig.staging-check.json` 에 Phase B 파일 미등록 | **R2 반영** | CI 검증 필수. Dev 가 해당 tsconfig 의 `include` 배열에 Phase B 6개 파일 + 4개 테스트 파일 추가. |
| M4 | `isInferring` state 가 worker busy 반영 못함 | **R2 반영** | `handleResult` finally 에서 `setIsInferring(false)` 제거 → worker `"result"` or `"error"` 메시지 수신 시점에 `setIsInferring(false)` 호출. `tick` 직후 postMessage 성공 시점에 `setIsInferring(true)`. busyRef 와 일관. |
| M5 | visibility-hidden / force-close 경로에서 `avgConfidence` 리셋 누락 | **R2 반영** (§1.3 `cleared` 분기에 이미 포함) | `avgConfWindowRef.current = []; setAvgConfidence(undefined)` 를 cleared / visibility-hidden / force-close 3곳에 공통 유틸로 분리 (Dev 판단). |
| M6 | `scheduler.shouldInferNow` dead code | **R2 반영** | 두 가지 선택지: (a) **제거** — driver 가 실제 쓰지 않으면 API 삭제. (b) **활용** — tick 내부에서 호출하여 백그라운드 스로틀링 방어. **(b) 채택**. tick 선두에서 `if (!scheduler.shouldInferNow()) return` 추가. `shouldInferNow` 는 `performance.now()` 기반 "마지막 tick 이후 경과 ms ≥ nextTickMs × 0.8" 을 반환 (미구현 → scheduler 내부에서 구현 완성). |
| M7 | `setHealth` tick 당 2회 호출 → 불필요 리렌더 | **R2 반영** | health 를 `useRef` + `useState<number>(healthTick)` 패턴으로 전환. ticksTotal/success/failure 는 ref 에 누적, 2초 debounced 로 state flush (setInterval 250ms 안에서 체크). DriverResult 에서 노출되는 `health` 는 selector 로 얇게. |
| M8 | `NONE_KEY="__none__"` src/staging 중복 하드코딩 | **R3 이관** | 공통 상수 모듈은 src/ 수정 필요 (`src/hooks/useBehaviorDetection.ts` line 48 등). CLAUDE.md #13 에 의해 staging 단계에선 src/ 불변. Phase B src/ 반영 PR 단계에서 공통 상수로 리팩터. 체크리스트 파일에 항목 추가. |
| M9 | Driver inner function declarations 가 useEffect 뒤 → hoisting 의존 | **R2 반영 (부분)** | Driver 를 분해하지 않고 유지 (아래 §5.2 이유). 대신 함수 배치 순서를 재정리: `useRef` 선언 블록 → 순수 헬퍼 함수 (`disposeWorker/scheduleRetry/...`) → `useCallback` (`handleResult/handleWorkerMessage`) → `useEffect`. ESLint `no-use-before-define` 위반 0 으로 맞춤. |
| R3 지적 (394/400 LOC 턱걸이) | Driver 분해 권고 | **R2 에서는 유지 (분해 X)** | (a) M1 재설계로 retryGen state + initStatus state 추가 → LOC 약 15줄 증가 예상. (b) 분해 시 worker lifecycle 훅과 sampling 훅 사이 ref 공유 복잡도 증가 → 새 버그 온상. (c) 대신 §5.3 에서 **파일 내부 섹션 주석 + 함수 순서 정리** + 일부 헬퍼를 `staging/lib/behavior/yoloRetryPolicy.ts` 로 추출 (지수 백오프 계산 함수만). LOC 예상 410 → 420 구간 진입 시 R3 QA 가 재지적하면 R4 에서 분해. |
| 테스트 runner 미도입 | vitest/jest 도입 | **R2 반영** | `vitest` 도입. `package.json` devDependencies + `vitest.config.ts` 최소 설정 + `package.json` scripts.test 추가. 기존 runner-agnostic export 는 vitest 의 `describe/it/expect` 로 변환. CI 자동화 가능. Arch R2 는 도입 결정만. Dev 가 세부 config 수행. |
| model_version="v1" 고정 | Phase E 전환 | **R3 이관** | R1 §6.3 결정 유지. 사장님 승인 후 `"yolov8n-v1.0-20260424"` 로 교체. Phase E archive SQL 도 동일 업데이트. R2 범위 아님. |

---

## 5. 파일 변경 요약 (R1 Dev 결과물 대비 delta)

### 5.1 신규 파일 (5개)

| 경로 | 목적 | 예상 LOC |
|------|------|---------|
| `staging/lib/behavior/loggerArmGuard.ts` | L3 런타임 sentinel (M2 §3.4) | 50 |
| `staging/lib/behavior/yoloRetryPolicy.ts` | 지수 백오프 계산 순수 함수 (driver LOC 경감) | 30 |
| `staging/docs/phase_b_src_migration_checklist.md` | L1 체크리스트 (M2 §3.2) | — (문서) |
| `staging/tests/loggerArmGuard.test.ts` | armGuard 단위 테스트 | 80 |
| `staging/tests/yoloRetryPolicy.test.ts` | 백오프 계산 테스트 | 60 |

### 5.2 수정 파일 (R1 Dev 결과물 delta)

| 파일 | 주요 변경 | 예상 LOC 증감 |
|------|-----------|---------------|
| `staging/lib/behavior/confirmFrames.ts` | 반환 타입 `ConfirmResult` 를 3상태 union 으로 전면 변경. `confirmedKey` 필드 제거, `status` 필드 도입 (§1.1). 판정 로직 §1.2 로 교체. JSDoc 전면 갱신. | +20 (80 → 100) |
| `staging/lib/behavior/confirmFrames.test.ts` | 기존 8건 → 10건으로 확장. 반환 구조 변경 반영. vitest `describe/it/expect` 로 전환. | +30 |
| `staging/hooks/useBroadcasterYoloDriver.ts` | (a) `handleResult` 를 status switch 로 재작성 (§1.3). (b) `useState<number>(retryGen)` + `useState<InitStatus>(initStatus)` 추가. (c) worker 생성 useEffect deps 에 `retryGen` 추가. (d) `scheduleRetry` 를 지수 백오프로 재작성 + `setRetryGen` 호출 (§2.4). (e) `isInferring` 을 worker 응답 시점에 해제 (M4). (f) `health` 를 ref + debounced state 로 전환 (M7). (g) 함수 순서 재배치 (M9). (h) `armBehaviorLogger("broadcaster")` 호출 + cleanup. (i) tick 선두에 `scheduler.shouldInferNow()` 체크 (M6). (j) `cleared` 경로에서 avgConfidence 리셋 (M5). (k) DriverResult 에 `initStatus`, `retryAttempt` 추가. | +25 (394 → 약 420) |
| `staging/hooks/useBehaviorInferenceScheduler.ts` | `shouldInferNow` 실제 구현 완성 (performance.now 기반 경과 ms 체크) (M6). | +15 |
| `staging/components/CameraBroadcastYoloMount.tsx` | JSDoc 경고 블록 추가 (§3.3). `initStatus === "failed"` 시 console.warn 1회. | +15 |
| `staging/tests/broadcasterYoloDriver.test.ts` | vitest 전환 + retry 시나리오 + cleared vs pending 시나리오 추가 + M4 isInferring 타이밍 검증. | +50 |
| `staging/tests/inferenceScheduler.parity.test.ts` | vitest 전환 + `shouldInferNow` 경계 테스트. | +30 |
| `staging/tests/maxDurationGuard.test.ts` | vitest 전환. | +5 |
| `tsconfig.staging-check.json` | `include` 배열에 Phase B 파일 10개 추가 (M3). | +10 |
| `package.json` | `vitest` devDependency, `scripts.test` 추가. `vitest.config.ts` 신규. | +5 |

### 5.3 삭제 파일

**없음.** CLAUDE.md "파일 삭제 절대 금지" 준수.

### 5.4 총 LOC 변화 예상

기존 R1 Dev 합계 약 1,420 LOC → R2 Dev 예상 약 1,620 LOC (+200). 파일당 400 한도 유지 가능. Driver 420 LOC 는 한도 턱걸이지만 §4 표의 근거로 허용. R3 QA 가 재지적 시 R4 에서 분해.

---

## 6. R2 → R2 Dev 에 전달할 지시사항

### 6.1 필수 TODO (완료 기준 포함)

| # | 작업 | 완료 기준 |
|---|------|-----------|
| 1 | `confirmFrames.ts` 반환 타입을 3상태 union 으로 변경 | §1.1 타입 시그니처와 정확히 일치. §1.4 표 7건 테스트 전부 green. |
| 2 | `handleResult` 를 status switch 로 재작성 | `pending` 분기에서 `currentBehavior` 변경 0 라인 (ref/state 접근 없음 verify). `cleared` 분기에서만 null 세팅. `confirmed` 분기에서 top 주입. |
| 3 | retry state (`retryGen`, `initStatus`, `retryAttemptRef`) 도입 | worker effect deps 에 `retryGen` 포함. 5회 실패 → `initStatus="failed"` + 더 이상 setTimeout 예약 없음. DriverResult 에 `initStatus`, `retryAttempt` 노출. |
| 4 | `scheduleRetry` 를 지수 백오프로 재작성 | §2.3 상수 + §2.4 pseudo-code 일치. `yoloRetryPolicy.computeBackoffMs(attempt)` 를 순수 함수로 추출. |
| 5 | `staging/lib/behavior/loggerArmGuard.ts` 신규 작성 | §3.4 API 명세 정확 준수. dev 에서만 경고, prod no-op. `useBroadcasterYoloDriver` enabled effect 에서 arm/disarm. |
| 6 | `CameraBroadcastYoloMount.tsx` JSDoc 경고 블록 추가 | §3.3 주석 문구 그대로 (내용 동등 허용, 장애 재현 언급 필수). `initStatus === "failed"` 시 console.warn 1회. |
| 7 | `staging/docs/phase_b_src_migration_checklist.md` 신규 작성 | §3.2 체크리스트 구조 + 항목 전부 포함. 마크다운 체크박스. |
| 8 | `tsconfig.staging-check.json` include 에 Phase B 10개 파일 추가 | `pnpm exec tsc --noEmit -p tsconfig.staging-check.json` 에러 0. |
| 9 | vitest 도입 | `package.json` devDependencies + `vitest.config.ts` + `scripts.test`. 기존 4개 테스트 파일 vitest 전환. `pnpm test` 로 전부 green. |
| 10 | `scheduler.shouldInferNow` 실제 구현 + tick 선두 호출 | performance.now 기반. backgroundTab 1000ms 스로틀 테스트 green. |
| 11 | `isInferring` 을 worker 응답 시점 해제로 변경 | tick 직후 `setIsInferring(true)`, `handleWorkerMessage` result/error 분기에서 `setIsInferring(false)`. |
| 12 | `health` state 를 ref + debounced flush (2초) 로 전환 | tick 당 setState 호출 횟수 2 → 0 (debounce 주기에서만 1회). |
| 13 | `cleared` 경로에서 `avgConfWindowRef = []; setAvgConfidence(undefined)` | visibility-hidden + force-close 경로도 동일 처리 (공통 헬퍼 추출 권장). |
| 14 | 함수 배치 순서 재정리 (M9) | ESLint `no-use-before-define` 규칙 적용 시 경고 0. |

### 6.2 금지 사항 (재확인)

- `src/` 파일 수정 **금지** (M2 뷰어 게이트는 체크리스트 + 주석으로만). 실제 src/ 수정은 최종 머지 PR 이 담당.
- `supabase.rpc(...).catch()` 사용 금지 (CLAUDE.md).
- `new RTCPeerConnection` 직전 기존 ref close 없이 신규 할당 금지 (driver 내 worker 도 동일 원칙 — 기존 worker.terminate 먼저).
- 파일 삭제 금지. 이미 존재하는 파일은 Edit 만.

### 6.3 Dev 가 Arch 에게 되물어야 하는 경우

- driver LOC 가 430 을 초과하면 "분해" 여부를 Arch R3 에 질문.
- vitest 설정 중 turbopack/onnxruntime-web 의존성 때문에 worker mock 불가한 이슈 발생 시 R3 Arch 에 질문.
- 지수 백오프 상한 (8분) 이 사장님 UX 에서 너무 길다고 판단되면 R3 Arch 에 재조정 요청.

---

## 7. 리스크 & R3 에 남길 질문

### 7.1 R2 에서 처리한 것

- C1 (confirm 이원 의미) — status union 으로 타입 레벨 강제.
- M1 (retry 무한 대기) — retryGen state + 지수 백오프 + MAX_RETRIES.
- M2 (뷰어 게이트) — 3중 방어선 (문서/주석/런타임 sentinel).
- M3/M4/M5/M6/M7/M9 (MINOR 6건) — Dev TODO 에 모두 포함.
- 테스트 runner — vitest 도입.

### 7.2 R3 에 남길 질문

1. **Driver LOC 420 허용 여부** — R3 QA 가 "400 초과" 를 지적하면 분해 (§5.2 R3 지적 항목). Arch R4 대응 필요.
2. **M8 NONE_KEY 공통 상수화** — Phase B src/ 머지 PR 에서 처리하기로 했으나 src/ 수정이 `useBehaviorDetection.ts` + `useBehaviorEventLogger.ts` 2곳. 이 둘의 수정 범위가 M2 게이트 작업과 묶일지 분리될지 R3 결정.
3. **`initStatus="failed"` 시 UX** — 현재 console.warn 만. 사용자에게 "AI 기능 불가" 토스트를 띄울지, flag 자동 OFF 로직을 추가할지 R3 에서 UX 결정.
4. **vitest + onnxruntime-web 호환성** — worker mock 설정이 의존성 때문에 복잡해질 가능성. R3 QA 가 실행 테스트 후 결과 보고.
5. **dev-only sentinel 의 한계** — prod 빌드에서 누락 감지 불가. 중요도가 높다면 edge runtime 서버 사이드 감시 (Supabase realtime logging + trigger) 를 Phase C 로 이관 검토.
6. **30분 force-close 직후 재감지 시 row 분할 UX** — 라벨링 UI (Phase D) 에서 연속 행동이 30분 경계로 잘려 보이는 문제. Phase D 설계 단계에서 UI 가 병합 표시 여부 결정.
7. **model_version 교체 시점** — 사장님 승인 대기. R3 에서 확정.

### 7.3 베타 운영 리스크 (변경 없음, R1 §9 계승)

- 방송폰 배터리 실측 (WebGPU + 5초 tick) — 사장님 실기기 24시간 테스트 결과 필수.
- iOS Safari 배터리 API 미지원 — scheduler 기본값 동작 검증 필요.
- Supabase Nano pool=15 환경에서 방송폰 1대 + 뷰어 4명 동시 시 Realtime 소켓 수 추정 (CLAUDE.md #9).

---

**Arch R2 최종 권고:**
- C1/M1/M2 근본 해결 설계 완료. Dev R2 는 §6.1 의 14개 TODO 를 순서대로 수행.
- R2 Dev 는 특히 **C1 (§1) 과 M1 (§2) 을 최우선**으로 처리. M2 3중 방어선은 L3 런타임 가드가 staging 단계에서 제일 검증 가능한 경로.
- LOC 턱걸이 유지 결정 (§5.2 R3 지적 항목) 은 QA R3 가 재지적하면 분해로 선회.
- R3 QA 는 §6.1 완료 기준 14항목을 체크리스트로 활용. 하나라도 미충족이면 REJECT.
