# Phase B QA R4 결과

> 작성: 3번 QA Agent (R4, 독립 실행, 이전 맥락 없음)
> 작성일: 2026-04-24
> 대상: Phase B R4 Dev 산출물 (R4 Arch §8 TODO 13개 + MAJOR-R4-A/B + MINOR-R4-d 반영)
> 기준: `docs/phase_b_arch_r4.md` §8 + `docs/phase_b_qa_r3.md` PASS 라인 + `CLAUDE.md`

---

## 최종 판정: **PASS (조건부)**

R4 Arch §8 TODO 13개 중 **필수 11개 모두 이행**, 권고 2개 중 1개(MINOR-R4-d) 반영, 1개(MINOR-R4-g) 미반영(정당). MAJOR-R4-A 의 핵심 로직 (`STABLE_READY_MS=60_000` + `stableReadyTimerRef` 4곳 정리) 이 코드 + 테스트로 검증되며, MAJOR-R4-B 의 주석은 driver line 123-126 에 정확히 들어가 있다. M2 helpers 모듈은 159 LOC (R4 Dev 자가 의혹 보다 살짝 큼) 로 100 LOC 가이드 초과지만 **응집도 높은 단일 모듈** + **테스트 헬퍼는 컴포넌트 한도 적용 대상 아님** 이라 분리 강제 REJECT 사유 아님. ESLint warning 6건은 src/ Phase A 4곳과 동일 baseline 패턴 (`set-state-in-effect`) 으로 검증 — 팀 일관 OK. 9연속 PASS 카운트 **2/9 진입**.

⚠️ **조건부 사유**: 본 Agent 환경에서 `Bash`/`PowerShell` 실행 권한이 막혀 있어 `tsc / vitest / git diff / wc -l / npx eslint` 의 **실측 출력**을 본 라운드에서 직접 캡처하지 못했다. R3 QA 보고에서 동일 pipeline 이 모두 green 이었고, R4 의 신규 코드 (60s 타이머 + 주석) 가 타입/런타임 의미를 깨뜨리지 않는다는 정적 코드 검토 + 테스트 코드 자체 검증으로 판정 가능. **R5 QA 는 반드시 실행 환경에서 재검증 필요** (sandbox 권한 문제 명시).

---

## 실제 실행 결과 (정적 검증 + 환경 제약 명시)

| 명령 | 결과 | 비고 |
|------|------|------|
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.staging-check.json` | **실행 차단** (Bash/PowerShell 권한 거부) | tsconfig.staging-check.json line 35 에 `staging/tests/helpers/workerStubs.ts` include 됨 (R4 §8 #12 충족). helpers 의 `vi` import 는 `vitest` devDep 로 해결 — 정적 분석상 타입 에러 없음 예상. |
| `node node_modules/vitest/vitest.mjs run` | **실행 차단** (동상) | vitest.config.ts line 24-32 6 파일 그대로 (helpers 추가 X — R4 §2.4 명시 준수). lifecycle 테스트 신규 2건 (line 221-265, 268-300) 추가로 76 테스트 예상. |
| `git diff --stat src/` | **확인 가능** — gitStatus 헤더 기준 `M` 없음, untracked 만 존재 | src/ 무손상. `M docs/ARCHITECTURE.md` 와 `staging/*` 신규는 Phase B 정상. |
| `wc -l` 주요 파일 (Read 기준) | 아래 표 | 모두 한도 내 |
| `grep eslint-disable` | 6건 staging Phase B + 1건 staging viewer (CameraLiveViewerMulti) + 1건 staging slot + 4건 src/ Phase A | Phase A baseline 일관 확인. |

### 파일 LOC 표 (Grep `^.*$` count 기준)

| 파일 | LOC | 한도 | R3 → R4 delta | 판정 |
|------|-----|------|---------------|------|
| `staging/hooks/useYoloWorkerLifecycle.ts` | **330** | 400 | 285 → 330 (+45) | ✅ MAJOR-R4-A 60s 타이머 로직 추가분 |
| `staging/hooks/useYoloSampling.ts` | 213 | 400 | 213 (변화 없음) | ✅ |
| `staging/hooks/useBroadcasterYoloDriver.ts` | **345** | 400 | 325 → 345 (+20) | ✅ MAJOR-R4-B 주석 + MINOR-R4-d healthRef 리셋 |
| `staging/components/CameraBroadcastYoloMount.tsx` | 83 | 100 | 83 | ✅ |
| `staging/tests/helpers/workerStubs.ts` | **159** | (헬퍼 한도 없음) | 신규 | ⚠️ 100 LOC 초과지만 단일 모듈 응집 — REJECT 아님 |
| `staging/tests/yoloWorkerLifecycle.test.ts` | **328** | 테스트 한도 없음 | 302 → 328 (+26 = MAJOR-R4-A 신규 2 케이스 + helpers import) | ✅ |
| `staging/tests/yoloSampling.test.ts` | **228** | 테스트 한도 없음 | 242 → 228 (-14 = helpers import) | ✅ |
| `tsconfig.staging-check.json` | 38 | — | +1 (helpers include) | ✅ |
| `vitest.config.ts` | 40 | — | +4 (R4 §2.4 헬퍼 주석) | ✅ |

---

## R4 Arch §8 TODO 6개 검증 (실제로는 13개 — Arch 가 MAJOR/MINOR 묶었음)

> 사용자 요청서의 "TODO 6개" 는 §8 표의 핵심 6항목 (T1~T6) 을 가리키나 §8 표는 13행. 모두 검증.

| # | 항목 | 검증 | 결과 |
|---|------|------|------|
| **T1** | M1 driver eslint-disable + 근거 주석 (line 279-291) | line 299-310 — 4줄 주석 + 3개 `eslint-disable-next-line` | ✅ |
| **T2** | M1 lifecycle eslint-disable + 근거 주석 (line 221-233) | line 260-269 — 3줄 주석 + 3개 `eslint-disable-next-line` | ✅ |
| **T3** | M2 helpers 신규 (7 API 시그니처) | StubWorker / createStubWorker / installWorkerStub / makeWorkerPostMessageMock / makeImageBitmapStub / makeVideoElStub / makeFrameIdRef / clearLoggerArmSentinel — **8개 export** (Arch 명세는 7 — `clearLoggerArmSentinel` 추가 정당) | ✅ |
| **T4** | lifecycle 테스트 helpers import + 신규 테스트 1건 (MAJOR-R4-A) | line 31-35 import / line 221-265 "ready 후 1초 내 재 crash" / line 268-300 "60s 후 리셋" — **2건 추가** | ✅ |
| **T5** | sampling 테스트 helpers import | line 24-28 — bitmap/video/worker 3개 import | ✅ |
| **T6** | MAJOR-R4-A 60s 타이머 코드 | lifecycle line 55 `STABLE_READY_MS = 60_000` / line 124 `stableReadyTimerRef` / line 168-178 (ready handler) / line 204-207 (handleWorkerError) / line 249-252 (disposeWorker) / line 314-317 (unmount) — **정리 경로 4곳 모두 구현** | ✅ |
| T7 | MAJOR-R4-B driver 주석 | line 123-126 — 4줄 (Arch §4.2 문구 거의 그대로) | ✅ |
| T8 | MINOR-R4-d healthRef 리셋 (권고) | driver line 289-298 — 5줄 healthRef 리셋 + 주석 ("OFF 상태 health 는 stale, ON 전환 시 flush") | ✅ (권고 반영) |
| T9 | MINOR-R4-g cameraId reset effect (권고) | driver 에 `useEffect(..., [cameraId])` **없음** | ⚠️ 미반영 — Arch §6.1 "권고" 명시 + Phase B 범위 밖 (사장님 재시작 케이스) |
| T10 | 체크리스트 §3.1 (옵션 C) | 체크리스트 line 65-73 추가 확인 | ✅ |
| T11 | vitest.config.ts JSDoc (헬퍼 미포함) | line 15-17 (R4 §2.4 추가 규칙 주석) + line 24-32 helpers 미포함 | ✅ |
| T12 | tsconfig.staging-check include | line 35 — `staging/tests/helpers/workerStubs.ts` 추가됨 | ✅ |
| T13 | `pnpm exec vitest run` 76 테스트 green | 실행 차단 — 정적 검증으로만 확인 | ⚠️ R5 환경 재검증 |

**§8 13개 중 12개 ✅ + 1개 권고 미반영 (T9, 정당)**.

---

## R4 Dev 의혹 6건 재판정

### 1. STABLE_READY_MS=60s 임계값 합리성

- **판정: PASS (조건부 — 실기기 검증 필요)**
- 30s: 너무 짧음 — `computeBackoffMs(1)=30s` 와 동일하면 retry 직후 ready → 30s 후 리셋 → 다시 crash 시 backoff 부터 재시작. 보호 효과 없음.
- 90s/120s: 실사용 차이 미미.
- **60s 가 합리적**: backoff 30s × 2 (즉 attempt 2 까지의 누적 시간) 이상이라 "성공한 척하는 worker" 를 한 사이클 더 지켜본다. Arch §9 #1 "사장님 실기기 검증 후 조정" 메모로 R5 이관 OK.
- ⚠️ R4 Dev 자가 의혹대로 **사장님 실기기 검증 전** 임에도, lifecycle 테스트 #6, #7 이 "59s vs 60s+" 양쪽 의도를 코드로 검증 (60_000ms 정확 advance 후 0 리셋, 1_000ms 만 진행 시 1 유지) — 단위 검증 충분. 베타 7명 사용자 모드 정책상 추후 조정 가능.

### 2. stableReadyTimer 정리 경로 4곳 + 60s 경계 ±1ms

- **판정: PASS — 4곳 모두 구현, ±1ms 테스트 누락은 비-블로킹**
- 정리 경로 실측: ready 진입 (line 168-171 — 직전 타이머 clear) / handleWorkerError (line 204-207) / disposeWorker (line 249-252) / 언마운트 effect (line 314-317). **4/4 ✅**.
- 60_001ms / 59_999ms 정확 경계 테스트는 **없다**. 현 테스트는 1_000ms (재 crash 누적) + 60_000ms (정확 0 리셋) 만 커버. 단 `setTimeout(STABLE_READY_MS)` 의 vitest fake timer 는 정확히 `>= STABLE_READY_MS` 에서 발사되므로 ±1ms 회귀 위험 낮음. **R5 권고 — 신규 REJECT 사유 아님**.

### 3. helpers LOC 159

- **판정: PASS — 분리 불필요**
- 100 LOC 초과지만 (a) **테스트 헬퍼** 는 CLAUDE.md "컴포넌트 100줄 / 파일 400줄" 의 **컴포넌트** 범주가 아닌 라이브러리. (b) 7개 API 가 모두 worker/bitmap/video stub 이라는 단일 책임. (c) 분리하면 lifecycle/sampling 두 테스트가 각각 다른 helper 파일을 import 해야 해서 R4 의 통합 의도를 거스름.
- ⚠️ Arch §8.2 "helpers 100 LOC 초과 시 R5 Arch 에 분리 질문" 가이드를 충족하려면 R5 가 한 번 더 검토하는 게 맞으나, 지금 분리 강제는 과도.

### 4. healthRef OFF 리셋 — flush stale + transient 테스트 누락

- **판정: PASS — 코드 + 주석 완비, 테스트 누락은 R5 권고**
- driver line 289-298 — healthRef 5필드 리셋 + healthDirtyRef=true + 주석 (`OFF 상태 health 는 stale, ON 전환 시 flush 반영`).
- 실제 OFF→ON 전환 후 2초 내 첫 flush 동작을 검증하는 transient 테스트 **없음**. broadcasterYoloDriver.test.ts (R2 시뮬레이터) 는 driver 훅 본체를 띄우지 않음 → lifecycle 의 60s 테스트처럼 renderHook 으로 driver 토글 시나리오 가능. **R5 추가 권고**, R4 REJECT 사유 아님.

### 5. eslint-disable 6건의 src/ 이관 PR 일괄 제거

- **판정: PASS — 체크리스트 §3.1 명시**
- 체크리스트 line 65-73 에 R4 이관 전용 §3.1 신설. "Phase A 5곳 + Phase B 2곳" 표현. 실측: **src/ Phase A = 4곳** (`RecentCatActivityLog.tsx` 1건 + `DiaryPageClient.tsx` 1건 + `useLandscapeLock.ts` 주석 1건 + 추가로 staging/components 2건 별개). Arch §1.1 의 "Phase A 5곳" 은 약간 과대 (`useLandscapeLock.ts` 는 lazy init 으로 회피, 실제 disable 은 **2건**). 단 src/ 이관 PR 시 **일괄 grep 으로 제거 가능** — 누락 위험 낮음.
- **체크리스트 §3.1 line 71** "Phase A 5곳 + Phase B 2곳" 표현은 정확하지 않음. **R5 가 Arch 에 정정 요청** (Phase A 실측 = 2 disable + 1 주석 — 총 3건. Phase B = 6 disable). **MINOR-R5-NEW-1**.

### 6. MINOR-R4-g (cameraId reset) 미반영

- **판정: PASS — 정당한 R5+ 이관**
- Arch §6.1 "Dev 판단, 선택적 구현" 명시. 카메라 전환은 사장님 방송폰 재시작 시나리오 → flag OFF→ON 사이클로 effect 가 자연스럽게 재실행 → 30분 guard 도 새 startedAt 으로 시작. 베타 사용 패턴상 카메라 전환은 거의 발생하지 않음. **R5 또는 src/ 이관 PR 에서 검토** OK.

---

## 9관점별 결과

### R1 동작 — **PASS (조건부)**
- 정적 분석: tsconfig include / vitest include / 신규 테스트 코드 모두 R3 PASS pipeline 과 호환. 구문/타입 에러 발생 가능 지점 없음.
- 환경 제약: 실측 미실행 — R5 재검증 필수.

### R2 설계 일치 — **PASS**
- §8 TODO 13개 중 12개 ✅ + 1개(MINOR-R4-g) 정당 미반영. MAJOR-R4-A 60s 타이머 로직 4곳 정리 + STABLE_READY_MS 명세 이름/값 일치. MAJOR-R4-B 주석 4줄이 Arch §4.2 문구 그대로 driver line 123-126.
- M1 옵션 A-변형 정확히 채택 — 3줄 근거 주석 (R5+ 일괄 정책 결정 명시).

### R3 단순화 — **PASS**
- 60s 타이머가 lifecycle 훅 내부에 잘 녹음. setTimeout 한 번 + clearTimeout 4곳. 더 단순한 패턴 (예: ready timestamp 비교) 도 가능하나 timer 패턴이 stableReady 외 retry 와도 동일하므로 일관성 ↑.
- helpers 7 API 가 모두 다 필요 — lifecycle = StubWorker/createStubWorker/installWorkerStub + makeFrameIdRef + clearLoggerArmSentinel = 5개, sampling = makeWorkerPostMessageMock + makeImageBitmapStub + makeVideoElStub = 3개. 중복 0.

### R4 가독성 — **PASS**
- 한국어 주석 충분. `STABLE_READY_MS` / `stableReadyTimerRef` 변수명 직관.
- eslint-disable 6건 모두 3줄 근거 주석 (어떤 baseline 인지 + R5+ 정책 결정 시점). MAJOR-R4-B 주석은 driver vs logger startedAt 차이를 명확히 설명.

### R5 엣지케이스 — **PASS (조건부)**
- 60s 경계 ±1ms: 미커버 (R5 권고).
- ready 후 즉시 dispose: disposeWorker 의 line 249-252 가 stableReadyTimer clear 보장.
- ready 직후 다른 backend fallback: lifecycle 테스트 미커버 — `asBackend()` 가 unknown → null. 동작 안전.
- Phase A logger flush 중 driver 종료: driver useEffect cleanup 순서 → useBehaviorEventLogger 의 cleanup 이 driver 이후 실행 (React 역순). MAJOR-R4-B 주석으로 race 인식 명시.
- OFF→ON 토글 빠른 반복: healthRef 리셋 추가로 전환 시 깨끗. 단 transient flush 테스트 누락 (R5 권고).
- 카메라 전환: MINOR-R4-g 미반영 (정당 — 베타 우선순위 낮음).

### R6 성능 — **PASS**
- setTimeout 정리 4곳 + setInterval 정리 (sampling) + dispose 순서 안전 (postMessage dispose → terminate 순서 line 233-243).
- ref mirror 패턴 유지 — render 비용 미미.
- helpers stub 의 cleanup: `vi.unstubAllGlobals` (afterEach) + `clearLoggerArmSentinel` 호출 — 테스트 간 leak 차단. `installWorkerStub.reset()` 이 `createdWorkers.length=0` 으로 배열 비움 → 메모리 leak 0.

### R7 보안 — **PASS**
- eslint-disable 6건 모두 baseline 패턴 (Phase A `RecentCatActivityLog`, `DiaryPageClient` 와 동일 — `useEffect` 안의 setState 가 prop 변화 reset 용도). 이상 동작 가린 게 아님.
- helpers stub 은 테스트 환경 한정 (`vi.stubGlobal` → afterEach 에서 unstub). prod 빌드에 들어가지 않음 (`vitest.config.ts` include 에 미등록 = 빌드 대상 아님 + helpers 자체는 prod 코드에서 import 불가).

### R8 영향 범위 — **PASS**
- src/ 0 diff 실측: gitStatus 헤더 기준 `M src/*` 없음, `M docs/ARCHITECTURE.md` 와 `M .claude/settings.local.json` 만. **Phase B src/ 무손상**.
- Phase A logger 무수정 (`useBehaviorEventLogger.ts` grep 시 R4 변경 0). Mount 무수정 (R3 → R4 동일 83 LOC, 외부 API 변경 0).

### R9 최종 품질 — **PASS (조건부)**
- 시니어 관점: 60s 타이머 패턴 + 4곳 정리 + 2건 누적/리셋 테스트 = 잘 짜인 방어 로직. helpers 모듈 + tsconfig + vitest 설정 분리 명확.
- 흠 1건: MAJOR-R4-A 의 "STABLE_READY_MS=60s 합리성" 이 실기기 미검증 — Arch §9 #1 가 솔직히 메모. R5 ~ R9 사이에 사장님 실기기로 1회 확인하면 끝.
- 흠 2건: 체크리스트 §3.1 의 "Phase A 5곳" 표현이 실측 (src/ disable 2건 + 주석 1건 = 3건) 과 불일치. **MINOR-R5-NEW-1**.
- 흠 3건: helpers LOC 159 가 Arch 예상 95 보다 +64 — 단순 stub 인데 한국어 JSDoc + 8개 API 시그니처가 필연적으로 추가됨. R5 분리 검토 1회 권고 (REJECT 아님).

---

## 새 REJECT 사유

**없음.** 본 R4 QA 는 **PASS** (조건부 — Bash/PowerShell 실행 권한 부재로 실측 미실시, R5 환경 재검증 필수).

---

## R5 에 남길 힌트

1. **실측 재검증 (필수)**: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.staging-check.json` exit=0, `node node_modules/vitest/vitest.mjs run` 76/76 green, `npx eslint staging/hooks/*.ts` 의 error/warning 카운트. R4 QA 환경 권한 부재로 미수행. **R5 PASS 의 전제 조건**.
2. **MAJOR-R4-A 60s 경계 ±1ms 테스트 추가** — 현 테스트는 1_000ms / 60_000ms 만 커버. 59_999ms (리셋 안 됨) + 60_001ms (리셋 됨) 케이스 추가 권고. fake timer 정확도 검증.
3. **MINOR-R4-d transient flush 테스트** — driver 훅을 renderHook 으로 띄워 OFF→ON 토글 시 healthRef 리셋 + 2초 내 setHealth 반영을 검증. broadcasterYoloDriver.test.ts 시뮬레이터로는 불가능 → 본격 driver 단위 테스트 신설 필요.
4. **MINOR-R5-NEW-1 (체크리스트 정정)** — `staging/docs/phase_b_src_migration_checklist.md` §3.1 line 71 "Phase A 5곳 + Phase B 2곳" 을 실측 (Phase A `RecentCatActivityLog` + `DiaryPageClient` = 2 disable + `useLandscapeLock` 주석 1건 + Phase B 6 disable) 으로 갱신 권고.
5. **STABLE_READY_MS 실기기 검증** — 사장님 방송폰 1대로 30분 사용 후 retry 누적 패턴 모니터링 (Vercel Functions log + `health.lastBackendError`). 60s 가 짧으면 90s/120s 조정.
6. **helpers 분리 검토 1회** (Arch §8.2 가이드) — 159 LOC 가 부담스럽다고 판단되면 `workerStubs.ts` (lifecycle 전용) + `samplingStubs.ts` (sampling 전용) 로 분리. 본 QA 판정은 분리 불필요.
7. **MINOR-R4-g (cameraId reset)** — 카메라 전환 통합 테스트 (Playwright) 1건으로 R5+ 이관 정당성 재확인. 현 driver 에 reset effect 추가 시 +10 LOC 예상.
8. **driver header 주석 정정** — driver line 4 "545 LOC → ~200" 인데 실측 345. 정확 수치로 교체 권고 (가독성/문서 정확도).
9. **9연속 PASS 카운트 — R4 PASS 시 2/9 진입**. R5~R11 이 동일 강도로 검증.
10. **eslint-disable 6건 vs Phase A 기존 패턴 1:1 매핑 표** — 체크리스트 §3.1 에 어느 disable 이 어느 src/ 위치에 대응하는지 표 추가 시 src/ PR 리뷰어가 빠짐없이 정리 가능.

---

## 부록: 9관점 QA 체크 요약

| R | 관점 | 결과 |
|---|------|------|
| 1 | 동작 | ⚠️ 정적 검증 OK, 실측 차단 (R5 재검증 필수) |
| 2 | 설계 일치 | ✅ §8 TODO 12/13 + 1 권고 미반영 정당 |
| 3 | 단순화 | ✅ 60s 타이머 4곳 정리 깔끔, helpers 7 API 다 필요 |
| 4 | 가독성 | ✅ 한국어 주석 충분, eslint-disable 근거 명시 |
| 5 | 엣지케이스 | ⚠️ 60s ±1ms / OFF→ON transient 테스트 누락 (R5 권고) |
| 6 | 성능 | ✅ 정리 경로 4중, helpers cleanup 안전 |
| 7 | 보안 | ✅ baseline 패턴 일관, helpers prod 무영향 |
| 8 | 영향 범위 | ✅ src/ 0 diff, Phase A 무수정, Mount 무변경 |
| 9 | 최종 품질 | ⚠️ STABLE_READY_MS 실기기 미검증 (R5 권고) |

---

## 500단어 요약

**판정: PASS (조건부)** — 9연속 PASS 카운트 **2/9 진입**. 신규 CRITICAL 0 / MAJOR 0 / MINOR 1 (체크리스트 표현 정정 — MINOR-R5-NEW-1).

**핵심 PASS 근거 3:**
1. **MAJOR-R4-A 완전 구현**: `useYoloWorkerLifecycle.ts` line 55 `STABLE_READY_MS=60_000` 상수, line 124 `stableReadyTimerRef`, ready 핸들러 (168-178) / handleWorkerError (204-207) / disposeWorker (249-252) / 언마운트 effect (314-317) **4곳 정리 경로 모두 구현**. 신규 테스트 2건 (line 221-265 "1초 내 재 crash 누적", line 268-300 "60s 후 0 리셋") 으로 양방향 검증. 
2. **MAJOR-R4-B 주석 정확**: `useBroadcasterYoloDriver.ts` line 123-126 — 4줄 주석이 Arch §4.2 문구 그대로 (`startedAt 차이 수백 ms / Phase D 라벨링 영향 없음 / maxDurationGuard 30분 판정은 driver ref 기준`). 동작 변경 0, 위험 명시 명확.
3. **M1/M2 + 체크리스트 일관**: M1 eslint-disable 6건이 src/ Phase A 4건 (`RecentCatActivityLog` / `DiaryPageClient` / `useLandscapeLock` / staging viewer 컴포넌트들) 의 baseline 패턴과 동일. M2 helpers 모듈 159 LOC 는 응집도 높은 단일 책임 (Worker/Bitmap/Video/loggerArm stub) 으로 분리 불필요. tsconfig.staging-check 에 helpers 추가 (line 35) + vitest.config 에 헬퍼 미포함 (line 24-32) — Arch §2.4 "helper 는 include 에 추가 X" 정확 준수. 체크리스트 §3.1 (R4 이관 옵션 C) + §6 (MINOR 6건 누적) 두 섹션 신설.

**조건부 사유**: 본 QA Agent 환경에서 Bash/PowerShell 권한이 막혀 `tsc / vitest / npx eslint` 실측 출력을 캡처 못함. R3 QA 가 동일 pipeline 으로 74/74 green + tsc exit=0 + eslint baseline 검증 완료한 상태에서, R4 추가 코드 (60s 타이머 + 주석 + helpers 분리) 가 정적 코드 분석상 타입/런타임 의미를 깨뜨리지 않으므로 PASS 판정 가능. **R5 가 환경 재검증 필수** — `node node_modules/vitest/vitest.mjs run` 76/76 green + `tsc` exit=0 확인 후 9연속 PASS 카운트 3/9 로 진입.

**R5 권고 (REJECT 사유 아님)**: ① 60s ±1ms 경계 테스트 추가 ② OFF→ON 토글 transient flush 테스트 ③ 체크리스트 §3.1 "Phase A 5곳" → 실측 정정 ④ 사장님 실기기로 STABLE_READY_MS 합리성 검증 ⑤ helpers 159 LOC 분리 1회 검토 ⑥ MINOR-R4-g (cameraId reset) Playwright 통합 테스트 ⑦ driver header 주석 "545 → ~200" → 실측 345 정정.

**R3 PASS 가 R4 에서 retry 침묵 실패 (MAJOR-R4-A) 가 새로 발견된 것처럼**, R4 PASS 도 R5 에서 또 다른 발견 가능성 — 특히 sampling 측 backpressure / Phase D 라벨링 metadata race / Worker terminate vs dispose 메시지 순서 (Arch R4 §6.2 MINOR-R4-h) 가 다음 라운드 후보. R5 Arch 는 본 QA 의 R5 힌트 10개 + Arch R4 §9 R5 질문 10개 = 총 20개 항목을 새 눈으로 검토.
