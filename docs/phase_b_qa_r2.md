# Phase B QA R2 결과

> 작성: 3번 QA Agent (R2, 독립 실행, 이전 맥락 없음)
> 작성일: 2026-04-24
> 대상: Phase B R2 Dev 산출물 (`staging/` + `tsconfig.staging-check.json` + `vitest.config.ts` + `package.json`)
> 기준: `docs/phase_b_arch_r2.md` §6.1 14 TODO + `docs/phase_b_qa_r1.md` REJECT 사유 + `CLAUDE.md`

---

## 최종 판정: **REJECT**

R1 QA 의 CRITICAL/MAJOR 3건은 **실제로 해결**됐으나, R2 Arch §5.2 에서 "+25 LOC → 약 420" 으로 예고한 Driver 가 실제로는 **545 LOC 로 +151 증가 (한도 400 초과 +145)** 했고, vitest 설정이 describe/it 래핑이 없는 Phase A 기존 테스트 2건까지 include 해 버려 실제 `pnpm test` 가 **그린이 될 수 없는 구조**로 커밋됐다. 9연속 PASS 규칙의 R2 이므로 두 건 모두 REJECT 사유로 계수. 아래 상세 참조.

---

## 실제 실행 결과

| 명령 | 결과 | 비고 |
|------|------|------|
| `git diff --stat src/` | **0 lines** (빈 출력) | ✅ src/ 0 diff 검증 통과 |
| `git status --short src/` | **빈 출력** | ✅ src/ 변경/추가 0 건 |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.staging-check.json` | **EXIT=0, 에러 0개** | ✅ TypeScript 엄격 모드 통과 |
| `wc -l staging/hooks/useBroadcasterYoloDriver.ts` | **545 줄** | ❌ 팀 한도 400 / R2 Arch 예상 420 모두 초과 |
| `wc -l staging/hooks/useBehaviorInferenceScheduler.ts` | 272 줄 | ✅ |
| `wc -l staging/lib/behavior/confirmFrames.ts` | 97 줄 | ✅ |
| `wc -l staging/lib/behavior/yoloRetryPolicy.ts` | 48 줄 | ✅ |
| `wc -l staging/lib/behavior/loggerArmGuard.ts` | 90 줄 | ✅ |
| `wc -l staging/components/CameraBroadcastYoloMount.tsx` | 102 줄 | ⚠️ 컴포넌트 100 한도 +2 초과 (사소) |
| `pnpm install` / `pnpm exec vitest run` | **실행 불가** | vitest 미설치 상태 + 하네스 sandbox 가 `pnpm install` 차단. 정적 리뷰로 대체. |
| vitest include 매치 결과 | **6 개 파일** (`behaviorClasses.invariants.test.ts`, `effectiveClass.parity.test.ts`, `confirmFrames.test.ts`, `maxDurationGuard.test.ts`, `inferenceScheduler.parity.test.ts`, `broadcasterYoloDriver.test.ts`) | ❌ 앞 2개는 describe/it 래핑 0. vitest v2 `passWithNoTests: false` 기본값에서 "No test found in suite" 에러 위험 |

**보조 파일 LOC 합계:** 8 개 Phase B 구현/컴포넌트 파일 총 **1,247 줄** (테스트 미포함). Arch R2 §5.4 예상 1,620 대비 Dev 는 더 적었지만, Driver 쏠림이 문제.

---

## R1 → R2 REJECT 해결 검증

### [x] **C1 (confirmDetection 이원 의미) — 해결 완료**
- `confirmFrames.ts:45-48` 반환이 `ConfirmResult` 3상태 discriminated union (`confirmed` / `pending` / `cleared`). Arch R2 §1.1 시그니처와 1:1 일치.
- `useBroadcasterYoloDriver.ts:290-321` 의 `handleResult` 가 `switch (result.status)` 로 3갈래 분기. `pending` 블록은 진짜로 **return 만** 수행 — currentBehavior 변경 라인 0. `cleared` 만 null 세팅, `confirmed` 만 새 top 주입.
- 테스트 `confirmFrames.test.ts` 12 건 커버 (설계 §1.4 엣지 표 7 + 확장 5). R2 Arch §1.5 요구 "최소 10건" 초과 달성.
- `broadcasterYoloDriver.test.ts` 시나리오 3 ("단발 오탐 1건 후에도 sleeping 유지") 이 정확히 R1 버그 회귀 fixture. ✅

### [x] **M1 (ONNX retry 무한 대기) — 해결 완료**
- `yoloRetryPolicy.ts:32-39` `computeBackoffMs` 가 `30 / 60 / 120 / 240 / 480` 초 (`2 ** (attempt-1) * 30s`, clamp 480s) 순수 함수로 분리.
- `useBroadcasterYoloDriver.ts:233-248` `scheduleRetry` 가 `retryAttemptRef.current += 1` → `computeBackoffMs(nextAttempt)` delay → `setRetryGen(n => n + 1)`. worker 생성 `useEffect` deps 에 `retryGen` 포함 (line 404) → 실제로 재실행됨.
- `canRetry(nextAttempt)` 가 `MAX_RETRIES=5` 초과 시 `setInitStatus("failed")` + return. 더 이상 타이머 예약 없음.
- `ready` 메시지 수신 시 `retryAttemptRef.current = 0` + `setRetryAttempt(0)` + `setInitStatus("ready")`. (line 328-334)
- `DriverResult` 에 `initStatus`, `retryAttempt` 노출. Mount 컴포넌트가 `initStatus === "failed"` 시 `console.warn` 1회 출력 (line 89-92). ✅

### [x] **M2 (뷰어 게이트 3중 방어) — 해결 완료 (단, L3 한계 있음)**
- **L1 문서:** `staging/docs/phase_b_src_migration_checklist.md` 생성. 플래그 ON 전 8항목 / 직후 4항목 / 롤백 3항목 / R3 이관 4항목. `isYoloV2Enabled() ? undefined : existingHandler` 게이트 문법 명시. ✅
- **L2 주석:** `CameraBroadcastYoloMount.tsx:9-40` JSDoc 에 "⚠️⚠️⚠️ src/ 반영 시 필수 작업" 경고 블록 + 2026-04-22 장애 재현 언급. ✅
- **L3 런타임:** `loggerArmGuard.ts` + driver `useEffect(armBehaviorLogger("broadcaster"))` (line 447-451). prod no-op 확인 (`isProduction()` → `process.env.NODE_ENV === "production"`). idempotent + 다른 source 감지 → `console.error`. ✅
- ⚠️ L3 한계: prod 빌드에는 경고 미발생 (설계서 §3.4 한도 명시). L1/L2 로 3중 방어. 이는 설계 결정이므로 PASS.

### MINOR 7건 반영 상태

| # | 항목 | 상태 | 근거 |
|---|------|------|------|
| M3 | `tsconfig.staging-check.json` Phase B 파일 등록 | ✅ | include 배열에 10개 파일(6 src + 4 test) 추가. `tsc --noEmit -p` exit 0. |
| M4 | `isInferring` worker 응답 시점 해제 | ✅ | `tick` 에서 `setIsInferring(true)` (line 501), `handleWorkerMessage` result/error 분기 둘 다에서 `setIsInferring(false)` (line 338, 346). |
| M5 | avgConfidence 공통 리셋 | ✅ | `clearAvgConfidence()` 헬퍼 (line 186-189). `cleared` 분기 (301) + visibility-hidden (416) + force-close (492) 3곳에서 호출. |
| M6 | `scheduler.shouldInferNow` dead code 해결 | ✅ | `decideShouldInferNow` 구현 + `useCallback` 노출. tick 선두 (line 484) 에서 `if (!shouldInferNowRef.current()) return`. parity 테스트 6건 추가. |
| M7 | health ref + debounced flush | ✅ | `healthRef` + `healthDirtyRef` 누적, `setInterval(HEALTH_FLUSH_INTERVAL_MS=2000ms)` effect 에서 state flush (line 436-444). tick 당 setState 호출 0. |
| M8 | NONE_KEY 공통 상수화 | 🕓 R3 이관 (체크리스트 명시) | staging/src 중복은 R3 src/ 반영 PR 에서 처리. 체크리스트 L1 #5 항목 + §49 R3 이관 항목에 이중 추적. **R2 에서는 의도적 유보** — 설계서 §4 M8 "CLAUDE.md #13 준수" 타당. |
| M9 | 함수 배치 재정리 / no-use-before-define | ⚠️ **부분 준수** | ref/useState → 헬퍼 function → useCallback → useEffect 순서는 정리됨. 그러나 **`tick` 함수는 여전히 useEffect 뒤 (line 475) 에 배치**, sampling useEffect (407-433) 가 tick 을 참조. 엄격한 `no-use-before-define` 기본값(`functions: true`) 에선 여전히 경고. Dev 가 의도적 hoisting 의존을 주석으로 정당화 (line 474). **→ R2 Arch §4 M9 "부분 반영" 주장은 설계 상으로만 맞고 구현 수준에서는 R1 버그 그대로 잔존.** |

---

## R1 ~ R9 관점별 결과

### R1 동작 — **PASS (조건부)**
- `tsc --noEmit -p tsconfig.staging-check.json` 실제 실행 → **exit 0, 에러 0**.
- `pnpm install` / `pnpm exec vitest run` 은 하네스 sandbox 가 신규 네트워크 접근을 차단하여 실행 불가. 정적 리뷰로 보완 (아래 R9 참조). 4개 R2 테스트 파일은 벡터 타입 / API import 결합 오류 없음 (tsc 통과로 간접 증명).

### R2 설계 일치 — **PASS (조건부)**
- §6.1 14 TODO 중 **12 완전 충족, 1 부분 (M9), 1 R3 이관 (M8)**.
- C1/M1/M2 핵심 재설계는 1:1 반영. 지수 백오프 상수 정확, 3상태 union 타입 시그니처 일치, checklist 파일 존재.
- R2 Arch §5.4 "Driver 420 LOC" 예상은 **실제 545 LOC 로 초과** — 아래 R3 / Driver 판단 참조.

### R3 단순화 — **REJECT (MAJOR)**
- **Driver 545 LOC** 는 팀 한도(400) 를 +145 초과, Arch R2 §5.4 예고치(420) 도 +125 초과. 설계 예측 실패 + 팀 컨벤션 무시의 이중 문제.
- 추가된 25 LOC 예상은 retry state 3개 + initStatus + health ref 의 계정. 실제 증가 +151 의 배경은 ref 동기화 useEffect 3개 (line 151-159), 헬퍼 함수 확장 (resetSharedState/clearAvgConfidence/bumpTick/bumpSuccess/bumpFailure), 긴 JSDoc 등의 누적.
- Phase C (스냅샷 훅 포인트) / D (라벨링 UI feedback) / F (썸네일 upload) 추가 시 600+ 진입 명백. R2 허용 → R4 분해는 "부채가 2배 쌓인 후 수정" 패턴.
- **QA 독립 판단:** R3 QA 가 "분해하라" 고 REJECT 해야 R4 Arch 가 `useYoloWorkerLifecycle` (worker 생성/dispose/retry/에러) + `useYoloSampling` (tick/interval/visibility) 로 쪼갤 수 있다. 현 상태로 PASS 하면 부채 고착.

### R4 가독성 — **PASS (조건부)**
- 한국어 주석 풍부 (특히 driver JSDoc §1-16, handleResult 각 분기 설명, tick 번호 주석 — R1 QA MINOR 2 대응 반영됨).
- 변수명 직관적. `healthRef/healthDirtyRef`, `retryAttemptRef/retryTimerRef`, `shouldInferNowRef` 등 의도 명확.
- **M9 (hoisting)** 는 여전히 tick 이 useEffect 뒤 → 흐름 읽기 어려움. R4 MINOR.

### R5 엣지케이스 — **PASS (조건부)**
- R1 설계 §4 의 14 케이스 재검증:
  - #2 배터리 저전력 → scheduler `batteryLow × 2`, driver 위임 유지 OK.
  - #3 ONNX 로드 실패 → **완전 해결** (retryGen + 지수 백오프 + MAX_RETRIES).
  - #5 visibility hidden → history/avgConfidence/current 리셋 3종 세트 (R1 QA M5 해결).
  - #7 백그라운드 탭 스로틀 → shouldInferNow tick 선두 가드 (R1 QA M6 해결).
  - #10 30분 force-close → avgConfidence 포함 리셋 (M5 확장).
  - #11 worker crash → handleWorkerErrorCb dispose + scheduleRetry.
- **미검증 잔여:**
  - R2 Arch §2.7 "5회 실패 후 reload 만이 회복" — Mount 의 `warnedRef` 는 ready 시 false 로 리셋하지만, 사용자가 reload 없이 복구하려면 flag OFF/ON 왕복 필요. 의도 설계 OK.
  - iOS Safari `navigator.getBattery` 미지원 시 `getBatteryAsync()` 가 `Promise.resolve(null)` 반환 → 기본 `batteryLow=false` 유지. OK.
  - Worker context 에서 `loggerArmGuard` 호출 차단 → `typeof window === "undefined"` 가드로 no-op. OK.

### R6 성능 — **PASS**
- `setHealth` tick 당 0 호출 → 2초 debounce 로만 1회. R1 QA MINOR 6 해결.
- `setIsInferring` 도 올바르게 worker 응답 시점에만 해제. React batching 착시 문제 사라짐 (R1 QA MINOR 5 해결).
- `retryGen` state 증가 → useEffect cleanup → 새 worker 생성 경로 검증됨 (M1 핵심).
- ref 동기화 effect 3개 (`nextTickMsRef`, `regimeRef`, `shouldInferNowRef`) 는 React 19 `react-hooks/refs` 규칙 준수. 각각 단일 deps + 단일 할당 — 필요악이지만 올바른 패턴.

### R7 보안 — **PASS**
- `loggerArmGuard` 의 `window.__catBehaviorLoggerArmed__` 전역 프로퍼티는 CATvisor prefix 로 충돌 위험 낮음. 설계서 §3.4 "Dev 판단" 에 근거 명시.
- `console.error` 문구에 장애 ID / RLS 키 / 사용자 ID 노출 없음. "경로 소스 이름" 만 표시.
- Worker URL 은 `new URL("../workers/yoloInference.worker.ts", import.meta.url)` 상대 경로 — 외부 URL 주입 불가.
- `yoloV2Flag` 는 `NEXT_PUBLIC_CAT_YOLO_V2 === "1"` 엄격 비교. truthy string 우회 없음.
- XSS / RLS / localStorage 무단 0 건.

### R8 영향 범위 — **PASS**
- `git diff --stat src/` → **0 lines** (빈 출력 확인).
- `git status --short src/` → **빈 출력** (untracked/modified 0건).
- 신규 파일 전부 `staging/` 하위. `tsconfig.staging-check.json`, `vitest.config.ts`, `package.json` 은 프로젝트 루트 설정 파일 수정 — 빌드 영향 확인 필요 사항. `package.json` 변경은 devDep `vitest` 추가 + script `test` 추가만 (dependencies 변화 0). `next build` 영향 없음.
- **NONE_KEY 공통화는 R3 이관** 이 적절히 체크리스트에 명시됨. src/ 수정 PR 에서 리뷰어가 놓치기 어려운 체크박스 형태. PASS.

### R9 최종 품질 — **REJECT**
- 시니어 리뷰어가 드러날 첫 문제: **Driver 545 LOC**. "400 한도를 50% 이상 초과한 파일을 허용 논거로 덮으려는 시도" 로 보임. Arch R2 §5.4 의 "420 예상" 이 +125 밀린 것은 Arch 예측 실패도 공동 책임.
- 두 번째: **vitest 가 실제 green 을 낼 수 없다**. R2 Arch §6.1 #9 "기존 4개 테스트 파일 vitest 전환. `pnpm test` 로 전부 green" 이 미충족. `staging/tests/**/*.test.ts` include 가 Phase A 기존 `behaviorClasses.invariants.test.ts` / `effectiveClass.parity.test.ts` 2개도 먹지만 이 2개는 describe/it 0 이라 vitest v2 기본 설정에서 "No test found" 오류.
- 세 번째: **M9 tick hoisting** 는 Dev 가 주석으로 정당화했으나 R1 QA 가 MINOR 로 지적한 핵심 리팩터링 의도를 일부만 수행.

---

## Driver 545 줄 판단

**QA 독립 결정: R3 에서 분해 REJECT.**

근거 6가지:
1. **예측 실패 폭이 큼.** Arch R2 §5.4 에서 "420 LOC 예상" 으로 명시적 수치 약속. 실제 545 는 30% 초과. 설계가 수치 못 맞추면 "허용 예외" 선례가 남아 Phase C/D/F 추가 시 600+ 진입 자명.
2. **단일 책임 원칙 위반.** 한 훅이 (a) worker 생성/dispose, (b) retry 상태 머신, (c) sampling interval, (d) visibility handling, (e) health flush, (f) logger arm, (g) tick 내부 로직, (h) bitmap 전송 을 모두 수행. `useYoloWorkerLifecycle` (a+b+f) + `useYoloSampling` (c+d+g+h) + `useYoloHealthFlush` (e) 3분할로 자연 경계 존재.
3. **테스트 가능성.** 현재 driver 는 훅 본체 단위 테스트 0 건 (broadcasterYoloDriver.test.ts 는 순수 로직 시뮬레이터). 분해 후 각 하위 훅에 jsdom + testing-library 를 훅 단위로 적용 가능.
4. **R3 QA 가 안 지적하면 R4 분해 명분 소실.** Arch R2 §5.2 가 이미 "R3 QA 재지적 시 R4 에서 분해" 명시한 안전장치. QA 가 여기서 쓰지 않으면 설계 예외가 영구화.
5. **Arch R2 §5.4 의 "LOC 예상 410 → 420 구간 진입 시 R3 QA 가 재지적하면 R4 에서 분해" 조건이 이미 달성.** 545 는 430 을 훨씬 초과 (§6.3 Dev 에게 되물어라는 임계값). Dev 가 Arch 에 되묻지 않고 그대로 커밋 — 이 자체가 프로세스 위반 후보.
6. **팀 컨벤션의 강도.** CLAUDE.md "파일 400 줄 초과 금지" 는 명시적 금지. "부득이한 경우 허용" 조항 없음. Arch R2 가 예외를 요청했으나 이는 설계 권고이지 팀 수칙 변경이 아님.

---

## REJECT 사유 (우선순위별)

### 1. MAJOR (2건) — R3 필수 해결

**M-R2-A. Driver 545 LOC — 팀 한도 400 초과 +145**
- 위치: `staging/hooks/useBroadcasterYoloDriver.ts` 전체.
- 수정안:
  1. `staging/hooks/useYoloWorkerLifecycle.ts` 신규 — worker 생성/dispose, retryGen effect, initStatus, retryAttempt, armBehaviorLogger. 200~220 LOC 목표.
  2. `staging/hooks/useYoloSampling.ts` 신규 — tick, setInterval, visibilitychange, shouldForceClose. 150~180 LOC 목표.
  3. `staging/hooks/useBroadcasterYoloDriver.ts` (유지) — 상위 훅. 두 하위 훅 조합 + handleResult (confirm switch) + health debounced flush + logger 주입. 150~200 LOC.
- 우선순위: 높음. R3 Arch 가 파일 분해 설계 필요.

**M-R2-B. vitest 실행 불가 구조 — Phase A 테스트 2건 describe/it 누락**
- 위치: `vitest.config.ts` include 와 `staging/tests/behaviorClasses.invariants.test.ts` / `staging/tests/effectiveClass.parity.test.ts`.
- 증상: vitest v2 기본 `passWithNoTests: false` 에서 describe/it 블록이 없는 파일은 "No test suite found in file" 에러로 처리될 위험. 본 QA 가 `pnpm install` 실행 불가 환경이라 실측 불가지만 정적 분석 결과 확실.
- 수정안 (택1):
  1. `vitest.config.ts` `test.include` 를 Phase B 테스트 4개 파일로 명시 축소 (`staging/tests/{confirmFrames,maxDurationGuard,inferenceScheduler.parity,broadcasterYoloDriver}.test.ts`).
  2. `staging/tests/behaviorClasses.invariants.test.ts` 와 `effectiveClass.parity.test.ts` 하단에 `confirmFrames.test.ts` 와 동일한 `describe/it` 래퍼 블록 4~6줄 추가 (Phase A 호환).
  3. `vitest.config.ts` 에 `test: { passWithNoTests: true }` 추가 (가장 약한 해결책 — 향후 진짜 빈 suite 도 통과시켜 회귀 위험).
- R2 Arch §6.1 #9 "기존 4개 테스트 파일 vitest 전환" 완료 기준 미충족.
- 우선순위: 높음. `pnpm test` 가 첫 실행부터 실패 → CI 도입 의미 상실.

### 2. MINOR (3건) — R3 에서 동시 처리 권장

**m-R2-C. `CameraBroadcastYoloMount.tsx` 102 LOC — 컴포넌트 한도 100 초과 +2**
- 근소하지만 "한도 초과 0 관용" 원칙 위반. `useEffect` 에서 경고 로깅을 함수로 분리하거나 JSDoc 을 1블록 축약하면 충분히 수용 가능.

**m-R2-D. `tick` 함수 여전히 useEffect 뒤 (M9 부분 준수)**
- 위치: `useBroadcasterYoloDriver.ts:407-433` (sampling useEffect) 가 line 475 의 `tick` 을 참조. hoisting 의존.
- 수정안: `tick` 을 `useCallback` 으로 변환해 sampling useEffect 전에 선언. deps 정리 부담 있으나 ESLint 친화.
- 대안: ESLint 설정에 `no-use-before-define` 의 `functions: false` 적용 — 프로젝트 전체 룰이므로 팀 합의 필요.

**m-R2-E. `startInterval(tick)` 이 `nextTickMsRef.current` 를 setInterval 생성 시점에 한 번만 읽음**
- 위치: `useBroadcasterYoloDriver.ts:253`.
- 이슈: setInterval 이 생성된 후 nextTickMs 가 day → night 경계에서 바뀌어도, sampling useEffect 가 nextTickMs deps 로 재실행되어 새 interval 을 깔지만 이는 **60초 wallClockTick 흐름** 이후의 일. 즉, 22:00 경계 판정이 최대 60초 지연 — 설계서 허용 오차 내. 추가로 `setInterval` 생성 시 읽은 `nextTickMsRef.current` 가 그 사이 바뀌면 다음 interval 에 반영. 실제로 함수형 prop 이 아니라 ref 에 의존하는 구조가 미묘하게 꼬일 여지. 현재는 `[enabled, nextTickMs]` deps 로 안전.
- 우선순위: 관찰 후 결정. 현 수준 PASS 허용 가능.

### 3. 행정상 이슈 (1건)

**a-R2-F. `pnpm install` / `pnpm exec vitest run` 실행 미확인**
- 본 QA 환경은 sandbox 상 `pnpm install` 신규 실행 차단. 실제 vitest 실행 결과는 사장님 로컬 또는 Vercel preview 빌드에서 재확인 필요.
- R3 QA 는 반드시 `pnpm install && pnpm test` 를 실행 가능한 환경에서 실측.

---

## R3 에 남길 힌트

1. **Driver 분해 설계** — M-R2-A 해결을 위한 Arch R3 작업. 제안 3분할 (workerLifecycle + sampling + 상위 driver). ref 공유는 상위 훅이 생성한 ref 를 props/args 로 하위 훅에 전달 (또는 `useRef` 를 상위에서만 보유). 각 하위 훅 LOC 목표 200 이하.
2. **vitest 테스트 매트릭스 정리** — M-R2-B. include 축소 or Phase A 2개 파일에 describe/it 래퍼 추가. Dev 가 어느 경로 택할지 Arch R3 결정 주도.
3. **Mount 컴포넌트 102 → 100 이하** — m-R2-C. JSDoc 간소화 or 경고 로깅 함수 추출.
4. **ESLint `no-use-before-define` 룰 합의** — m-R2-D. 프로젝트 전역 룰 여부를 먼저 결정하고 tick 을 useCallback 전환할지 ESLint 설정만 바꿀지 선택.
5. **R3 QA 실측 필수** — `pnpm install && pnpm exec tsc --noEmit -p tsconfig.staging-check.json && pnpm exec vitest run` 3단계 실제 실행 후 결과 기록. 본 R2 QA 는 tsc 까지만 실측.
6. **NONE_KEY 공통 상수화 시점** — R3 Arch 가 "Phase B src/ 반영 PR 에 포함" vs "별도 선행 PR" 결정.
7. **`initStatus === "failed"` UX** — Phase C 로 이관 결정됐으나 베타 사용자 5회 재시도 실패 시 "AI 불가" 토스트 필요 여부 사장님 컨펌.
8. **Driver `tick` 내부 `document.hidden` 가드 중복** — line 481 에서 가드, line 412-425 visibilitychange 에서 stopInterval → 이중 방어지만 과잉 가능성. R3 검토.

---

**QA R2 최종 권고:**
- CRITICAL 0 건, MAJOR 2 건 (Driver 545 LOC + vitest 실행 불가 구조), MINOR 3 건.
- R1 REJECT 3건 핵심은 전부 해결됐으나 R2 자체의 MAJOR 2 건이 새로 발견. 9연속 PASS 카운트 **0 에서 시작** (첫 PASS 미달성).
- R3 Arch 가 (1) Driver 분해 설계, (2) vitest include 정리 두 건을 우선 처리. Dev 는 혼자 수정 금지 — Arch 설계 선행 필수.
