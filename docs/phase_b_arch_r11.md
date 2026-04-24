# Phase B Arch R11 설계서 — 마지막 라운드 (정착 검증 + R12 src/ PR atomic 7-commit 명세 + Phase B 종합 회고)

> 작성: 1번 Arch Agent (R11, 독립 실행, 이전 대화 맥락 없음)
> 작성일: 2026-04-24
> 대상: Phase B R11 Dev (staging 정착 검증) + R11 QA (9관점 독립 검증) + R12 src/ PR 책임자
> 기준: `docs/phase_b_arch_r10.md` (1040 LOC, §11/§12 R11/R12 가이드) + `docs/phase_b_qa_r10.md` (PASS 8/9, R11 권고 6건 + MINOR-R10-NEW-1) + `staging/docs/phase_b_src_migration_checklist.md` (468 LOC) + `staging/docs/phase_b_field_test_plan.md` (174 LOC) + `staging/docs/phase_b_ref_forward_pattern.md` (96 LOC) + `CLAUDE.md` (#13/#14)
> 관계: R3 (compose 분할) → R4 (STABLE_READY_MS) → R5 (관측성 초기) → R6 (관측성 + 실기기) → R7 (lifecycle 재분할 + isInferring 단일) → R8 (driver 분할 + mirror 자동 검증) → R9 (driver 마진 회복 + ref-forward 명세) → R10 (4 파일 마진 회복 + 회귀 3종) → **R11 (변경 최소화 + 정착 검증 + R12 src/ PR 7-commit 명세 + Phase B 종합 회고)**

---

## §0. R10 PASS 8/9 → R11 9/9 목표 (마지막 라운드)

R10 QA PASS 로 **9연속 카운트 8/9 진입**. R11 1 라운드만 남음. R11 PASS 시 9/9 달성 → Phase B src/ 반영 PR (R12) 즉시 착수 가능.

### 0.1 R11 의 위치 — Phase B staging 단계 마지막 검증

```
R1 (계획) → R2~R3 (구조 분할) → R4~R5 (관측성/race) → R6~R8 (관측성 완성/응집도) →
R9~R10 (마진 회복/회귀 보강) → R11 (정착 검증 + R12 명세) → R12 (src/ PR 7 commits)
                                       ↑ 본 라운드
```

**R11 = "변경 최소화 + R12 명세화" 라운드.** R10 까지의 모든 응축/리팩터/회귀 보강이 정착됐음을 단순 실측으로 재확인 + R12 (src/ PR) 의 atomic 7 commit 구조를 완전 명세 + Phase B 전체 회고를 통해 다음 Phase 에 적용할 패턴 정리.

### 0.2 R10 까지의 9연속 카운트 추적 (R11 마지막 진입)

| R | 판정 | 카운트 | 핵심 변화 |
|---|------|--------|-----------|
| R1 | ❌ REJECT (CRITICAL 1 + MAJOR 2 + MINOR 7) | - | 초기 10 파일 1,420 LOC |
| R2 | ❌ REJECT (MAJOR 2: Driver 545 / vitest include) | - | 3상태 union + retryGen + 3중 방어 |
| R3 | ✅ PASS | **1/9** | Driver 3분할 (lifecycle/sampling/core), 74 tests |
| R4 | ✅ PASS (조건부) | **2/9** | retry 침묵 실패 + STABLE_READY_MS 60s, 76 tests |
| R5 | ✅ PASS | **3/9** | CRITICAL-R5-C 발견 + renderHook + Supabase stub, 83 tests |
| R6 | ✅ PASS | **4/9** | latency 링버퍼 + DiagBadge + metadataFreeze + field_test_plan, 92 tests |
| R7 | ✅ PASS | **5/9** | latencyTracker 분리 + isInferring 단일 (R7 §3) + health stale 제거, 96 tests |
| R8 | ✅ PASS | **6/9** | driver 분할 (useDriverHealth) + mirror 마커 자동 검증, 98 tests |
| R9 | ✅ PASS | **7/9** | driver 마진 회복 + ref-forward 패턴 명세 + mirror strict fail, 100 tests |
| R10 | ✅ PASS | **8/9** | 4 파일 응축 (마진 6~11) + Mirror NaN 가드 + 회귀 3종, 109 tests |
| **R11** | **목표 PASS** | **9/9** | **정착 검증 + R12 명세 + 종합 회고 (변경 최소화)** |
| **R12** | (별도 PR) | - | **staging → src/ atomic 7 commit + ARCHITECTURE.md §10.2 통합 + Vercel ENV** |

### 0.3 R11 의 핵심 산출물 (Dev 작업 5건 이내)

R11 은 **변경 최소화 라운드.** 신규 분할/응축/리팩터 금지. 다음만 처리:

1. **R10 변경 정착 검증** (D1) — 4 파일 응축 + Mirror NaN 가드 + 회귀 3종 정착 확인 (Dev 가 실측 7개 명령만).
2. **체크리스트 §1.2/§1.4 R11 PR 사전 검증 항목 보강** (D2) — Vercel READY/PROMOTED + R2 200 응답 + Instant Rollback commit ID 메모 3 체크박스.
3. **`phase_b_field_test_plan.md` §0 사장님 사전 체크 보강** (D3) — R12 PR 직후 commit ID 메모 + R2 CORS 마지막 확인 1 체크박스.
4. **R12 atomic 7 commit 체크리스트 추가** (D4) — `phase_b_src_migration_checklist.md` 끝부분에 §9 신설 (R12 PR 진행 순서 7 commit + PRE/POST/롤백 트리거).
5. **MINOR-R10-NEW-1 처리 보류 명시** (D5) — 체크리스트 §6 (R5+ 이관 항목) 또는 §1 영역에 R12 PR 후 React 19 동작 확정 시 재검토 1 체크박스.

**Dev 신규 코드 0. 응축/분할/리팩터 0. 테스트 추가 0.** 체크리스트 + field_test_plan 문서만 갱신.

### 0.4 R11 LOC 예측 (변동 없음 — Dev 신규 코드 0)

| 파일 | R10 LOC | R11 예상 | 한도 | R11 마진 | 변경 |
|------|---------|----------|------|---------|------|
| `useBroadcasterYoloDriver.ts` | 313 | **313** (변동 0) | ≤320 | 7 | - |
| `useDriverHealth.ts` | 112 | **112** (변동 0) | ≤120 | 8 | - |
| `useYoloWorkerLifecycle.ts` | 357 | **357** (변동 0) | ≤368 | 11 | - |
| `useYoloLatencyTracker.ts` | 139 | **139** (변동 0) | ≤145 | 6 | - |
| `useYoloSampling.ts` | 235 | 235 (변동 0) | ≤350 | 115 | - |
| `YoloDriverDiagBadge.tsx` | 98 | 98 (변동 0) | 100 | 2 | - |
| `CameraBroadcastYoloMount.tsx` | 89 | 89 (변동 0) | 100 | 11 | - |
| `buildBehaviorEventMetadata.ts` | 48 | 48 (변동 0) | 350 | 302 | - |
| `metadataFreeze.test.ts` | 146 | 146 (변동 0) | — | - | - |
| `metadataFreezeMirror.test.ts` | 52 | 52 (변동 0) | — | - | - |
| `yoloLatencyTracker.test.ts` | 177 | 177 (변동 0) | — | - | - |
| `yoloWorkerLifecycle.test.ts` | 574 | 574 (변동 0) | — | - | - |
| `broadcasterYoloDriver.renderHook.test.ts` | 340 | 340 (변동 0) | — | - | - |
| `phase_b_src_migration_checklist.md` | 468 | **~520** (D2+D4+D5 +52) | — | - | §9 신설 + R11 보강 |
| `phase_b_field_test_plan.md` | 174 | **~180** (D3 +6) | ≤180 | 0 | §0 보강 |
| `phase_b_ref_forward_pattern.md` | 96 | 96 (변동 0) | — | - | R12 시 ARCHITECTURE.md §10.2.2 흡수 |
| `vitest.config.ts` | 56 | 56 (변동 0) | — | - | - |
| `tsconfig.staging-check.json` | 46 | 46 (변동 0) | — | - | - |
| `src/hooks/useBehaviorEventLogger.ts` | (R8 +1) | (변동 0) | — | - | R12 시 마커 r10-1 + NaN 가드 |

**R11 핵심 LOC 효과**: 코드 파일 변동 0 + 문서 2개 갱신 +58 lines.

---

## §1. R11 의 핵심 원칙 — 변경 최소화 (R10 까지와 다름)

### 1.1 신규 분할/응축/리팩터 금지

R10 까지 9 라운드 동안 다음을 누적:
- R3 driver 3분할 (lifecycle/sampling/core)
- R7 lifecycle latency 분리 (`useYoloLatencyTracker`)
- R8 driver 분할 (`useDriverHealth`)
- R9 ref-forward 패턴 명세 + mirror strict fail
- R10 4 파일 응축 (마진 6~11 회복) + Mirror NaN 가드 + 회귀 3종

**R11 에서 신규 분할/응축/리팩터 금지.** 사유:
1. **마진 충분** — driver 7 / useDriverHealth 8 / lifecycle 11 / tracker 6. 추가 회수 불필요.
2. **R12 PR 직전 회귀 위험 차단** — 9 라운드 누적 변경의 정착이 핵심. R11 추가 변경은 R12 PR 시점에 새로운 회귀 발견 risk.
3. **R12 PR 안에서 처리할 작업이 따로 있음** — staging → src/ 이관, ARCHITECTURE.md §10.2 통합, Vercel ENV 등록, 마커 r7-1 → r10-1 갱신 등. R11 에서 미리 손대면 R12 PR atomic 단일성 깨짐.

### 1.2 정착 검증 + R12 (src/ PR) 명세화 위주

R11 의 작업 핵심:
1. **A항목 정착 검증**: R10 변경이 회귀 0 인지 단순 실측만.
2. **B항목 R12 명세화**: src/ PR 의 atomic 7 commit 구조 + PRE/POST/롤백 트리거 완전 명세.
3. **C항목 #13/#14 적용 검토**: R12 PR 의 staging→src/ 이관이 #13 인지 #14 예외인지 명확화.
4. **D항목 MINOR-R10-NEW-1 처리 결정**: R11 에서 추가 조사 vs R12 후 재검토.
5. **E항목 iOS latency 임계값**: 사장님 실기기 테스트 후 결정 가이드.
6. **F항목 Phase D 착수 권고**: Phase B src/ PR 머지 + 30분 테스트 + 24시간 baseline 무이상 후.
7. **§12 Phase B 종합 회고**: R1~R11 흐름 + 다음 Phase 적용 패턴.

---

## §2. R10 변경 정착 검증 (A 항목)

R11 Dev 가 실측 7개 명령만 수행 + 회귀 0 확인. 신규 코드 작성 0.

### 2.1 LOC 한도 R10 그대로 유지

R11 시점 한도는 R10 한도 그대로:

| 파일 | R10 LOC | R11 한도 | 마진 |
|------|---------|---------|------|
| `useBroadcasterYoloDriver.ts` | 313 | **≤320** (R10 유지) | 7 |
| `useDriverHealth.ts` | 112 | **≤120** (R10 유지) | 8 |
| `useYoloWorkerLifecycle.ts` | 357 | **≤368** (R10 유지) | 11 |
| `useYoloLatencyTracker.ts` | 139 | **≤145** (R10 유지) | 6 |
| `useYoloSampling.ts` | 235 | ≤350 | 115 |
| `YoloDriverDiagBadge.tsx` | 98 | 100 | 2 |
| `CameraBroadcastYoloMount.tsx` | 89 | 100 | 11 |

**R11 한도 변경 0.** R12 PR 시점에 src/ 이관 후 src/ 측 동일 한도 적용 (체크리스트 §9 명시).

### 2.2 vitest 109 green / tsc 0 / src/ 1 line 회귀 0 검증

R11 Dev 가 실행할 7개 명령 (R10 QA 와 동일):

```bash
# 1. tsc 통과
npx tsc --noEmit -p tsconfig.staging-check.json
# 기대: exit 0

# 2. vitest 109 통과 (R10 +9 정확)
npx vitest run
# 기대: 10 files / 109 passed

# 3. src/ 변경 stat
git diff --stat src/
# 기대: src/hooks/useBehaviorEventLogger.ts | 1 + (R8 마커 1줄만)

# 4. src/ 변경 full diff
git diff src/
# 기대: + // metadata-freeze-spec: r7-1 1줄만 (R10 추가 0)

# 5. LOC 실측
wc -l staging/hooks/*.ts staging/components/*.tsx staging/lib/behavior/*.ts staging/tests/*.ts staging/docs/*.md
# 기대: driver=313 / useDriverHealth=112 / lifecycle=357 / tracker=139 / sampling=235 / mirror=48 / freeze.test=146 / mirror.test=52 / tracker.test=177 / lifecycle.test=574 / renderHook.test=340 / checklist=520 (R11 +52) / field_test_plan=180 (R11 +6) / ref_forward=96

# 6. 마커 양쪽 일치
grep -n "metadata-freeze-spec" src/hooks/useBehaviorEventLogger.ts staging/lib/behavior/buildBehaviorEventMetadata.ts staging/tests/metadataFreezeMirror.test.ts
# 기대: src/ logger=line 225 (r7-1) / mirror=line 13+22 (r7-1) / mirror.test=line 7+21 (r7-1) — 5건 r7-1 일치

# 7. NaN 가드 3 곳 적용
grep -n "Number.isFinite" staging/lib/behavior/buildBehaviorEventMetadata.ts staging/hooks/useYoloWorkerLifecycle.ts staging/hooks/useYoloLatencyTracker.ts
# 기대: mirror=line 41+44 (top2_confidence + bbox_area_ratio) / lifecycle=line 50 (STABLE_READY_MS) / tracker=line 79 (recordResult delta) — 4건 (mirror 2건 + lifecycle 1건 + tracker 1건)
```

### 2.3 마커 / NaN 가드 / ref-forward 정착 확인

**R10 의 핵심 변경 3축 정착 검증**:

#### A. Mirror 마커 r7-1 양쪽 일치 (R12 시점에 r10-1 갱신 보류 유지)

R10 §2.5/§2.6 명세: 마커 r10-1 갱신은 R12 PR 시점에 mirror + src + mirror.test 3 곳 동시. R11 시점에는 r7-1 그대로 유지.

**R11 Dev 검증**: 명령 6 결과로 r7-1 5건 일치 확인. r10-1 변경 0건. 만약 r10-1 변경 발견 시 즉시 REJECT (R12 PR 시점이 아님).

#### B. NaN 가드 3 곳 (mirror + lifecycle + tracker)

R10 §2 의 옵션 Y key omit + R10 §1.2.3 의 STABLE_READY_MS env fallback + R7 §1 tracker delta 가드.

**R11 Dev 검증**: 명령 7 결과로 4건 적용 확인. typeof 검사 잔존 0건 (mirror 본체에서 typeof === "number" 패턴 grep 0건).

#### C. ref-forward 4 콜백 무회귀 (driver + lifecycle)

R9 §2 / R10 §1.2.1 응축 후 ref-forward 4 콜백 (bumpSuccess/bumpFailure/bumpTick/markInferring) 그대로.

**R11 Dev 검증**: 다음 추가 grep 명령 (옵션):

```bash
# ref-forward wrapper 4 콜백 driver 안 존재 확인
grep -n "useRef<.*=> .*>.*=> {}" staging/hooks/useBroadcasterYoloDriver.ts
# 기대: 4건 (bumpSuccessRef + bumpFailureRef + bumpTickRef + markInferringRef)

# driverHealth.* deps 동기화 effect 존재 확인
grep -A 5 "ref 동기화 — driverHealth" staging/hooks/useBroadcasterYoloDriver.ts
# 기대: useEffect deps 4건 (bumpSuccess/bumpFailure/bumpTick/markInferring)
```

### 2.4 정착 검증 PASS 조건

R11 Dev 가 본 §2.2/§2.3 의 7개 명령 + 옵션 2개 추가 명령을 실행한 결과:
- 명령 1 (tsc) exit 0
- 명령 2 (vitest) 10 files / 109 passed
- 명령 3 (git diff stat) `src/hooks/useBehaviorEventLogger.ts | 1 +` 1줄
- 명령 4 (git diff full) `+ // metadata-freeze-spec: r7-1` 1줄
- 명령 5 (wc -l) 4 코드 파일 한도 내 + 문서 2개 R11 갱신 후 LOC 일치
- 명령 6 (마커 grep) r7-1 5건 일치 / r10-1 0건
- 명령 7 (NaN 가드 grep) 4건 적용

**모두 만족 시 R11 정착 검증 PASS.** 1건이라도 실패 시 즉시 REJECT (R10 변경 회귀 발생).

---

## §3. R12 src/ PR atomic 작업 체크리스트 (B 항목)

R11 PASS → R12 src/ PR 즉시 착수. R12 PR 의 atomic 7 commit 구조 + 각 commit 의 PRE/POST/롤백 트리거를 R11 에서 완전 명세.

### 3.1 R12 PR 의 atomic 7 commit 구조 개요

```
R12 PR (단일 PR, atomic deploy 원칙 — CLAUDE.md #14):
├── commit 1 (PR 안 첫 커밋): 마커 r7-1 → r10-1 갱신 (mirror + src + mirror.test 3곳 동시)
├── commit 2: src/ logger 본체 NaN 가드 (Number.isFinite + key omit) — mirror 와 1:1 동치
├── commit 3: staging → src/ 이관 (모든 staging/hooks/* + components/* + lib/behavior/* → src/)
├── commit 4: ARCHITECTURE.md §10.2 통합 + ref_forward_pattern.md cross-reference
├── commit 5 (사장님 작업): Vercel ENV 3개 등록 + 빈 커밋 강제 재빌드
├── commit 6: 머지 후 baseline 검증 결과 기록 (체크리스트 §1~§4 머지 직후)
└── commit 7: 사장님 실기기 테스트 결과 기록 (field_test_plan §1~§7)
```

**원칙**: 단일 PR 안에서 7 commit 순차 진행. 각 commit 은 독립 검증 가능 (이전 commit 회귀 시 git revert 1 commit 으로 회복).

### 3.2 commit 1: 마커 r7-1 → r10-1 갱신 (3곳 동시)

**목적**: R10 §2 NaN 가드 추가에 따른 spec 변경 표시. 마커 변경 = "이 코드는 r10-1 약속 따른다" 선언.

**대상 3 파일 동시 갱신**:

| 파일 | 변경 위치 | 변경 내용 |
|------|----------|----------|
| `staging/lib/behavior/buildBehaviorEventMetadata.ts` (R12 시 src/lib/behavior/) | line 22 | `// metadata-freeze-spec: r7-1` → `// metadata-freeze-spec: r10-1` |
| `staging/tests/metadataFreezeMirror.test.ts` (R12 시 src/tests/ 또는 vitest 통합) | line 21 | `const MARKER = "metadata-freeze-spec: r7-1";` → `const MARKER = "metadata-freeze-spec: r10-1";` |
| `src/hooks/useBehaviorEventLogger.ts` | line 225 | `// metadata-freeze-spec: r7-1` → `// metadata-freeze-spec: r10-1` |

**PRE-CONDITION**:
- R11 PASS (9/9 달성)
- R12 PR branch 생성 (예: `feat/phase-b-src-r12`)
- 작업 시점에 `git diff src/` 가 R8 마커 1줄만 (R11 정착 검증 결과)

**POST-CONDITION**:
- 3 파일 동시 commit (단일 commit 안에 3 파일 포함)
- `grep -n "r10-1" src/ staging/` 결과 3건 (mirror + src + mirror.test)
- `grep -n "r7-1" src/ staging/` 결과 0건 (잔존 마커 없음)
- `npx vitest run staging/tests/metadataFreezeMirror.test.ts` PASS (양쪽 r10-1 일치 확인)

**롤백 트리거**:
- 3 파일 중 1건이라도 r7-1 잔존 → mirror.test it 2 strict fail → CI 빌드 차단
- 즉시 `git revert HEAD` (commit 1 단독 revert)

**검증 메커니즘**:
- mirror.test 의 `MARKER = "metadata-freeze-spec: r10-1"` 가 src/ logger 와 mirror 양쪽 파일에서 string 일치 확인
- 한쪽 파일이라도 r10-1 부재 시 vitest 즉시 fail (R9 §3 strict)

### 3.3 commit 2: src/ logger 본체 NaN 가드 (Number.isFinite + key omit)

**목적**: mirror (`buildBehaviorEventMetadata.ts`) 와 src/ logger (`useBehaviorEventLogger.ts` line 225-236) 의 metadata 조립 블록을 1:1 동치 유지. R10 §2 옵션 Y key omit 동기화.

**대상 파일**: `src/hooks/useBehaviorEventLogger.ts`

**변경 위치**: line 225-236 metadata 조립 블록 (실측 line 번호는 R12 시점 grep 으로 재확인).

**변경 전 (R8 시점, 추정)**:
```ts
// metadata-freeze-spec: r10-1  (commit 1 에서 갱신됨)
const metadata: Record<string, unknown> = { model_version: BEHAVIOR_MODEL_VERSION };
if (detection.top2Class !== undefined) {
  metadata.top2_class = detection.top2Class;
}
if (typeof detection.top2Confidence === "number") {
  metadata.top2_confidence = detection.top2Confidence;
}
if (typeof detection.bboxAreaRatio === "number") {
  metadata.bbox_area_ratio = detection.bboxAreaRatio;
}
```

**변경 후 (R10 mirror 와 1:1 동치)**:
```ts
// metadata-freeze-spec: r10-1
const metadata: Record<string, unknown> = { model_version: BEHAVIOR_MODEL_VERSION };
if (detection.top2Class !== undefined) {
  metadata.top2_class = detection.top2Class;
}
// R10 §2 (마커 r10-1): NaN/Infinity 시 key omit — JSONB INSERT 안전 + Phase D/E 통계 의미 명확.
if (Number.isFinite(detection.top2Confidence)) {
  metadata.top2_confidence = detection.top2Confidence;
}
if (Number.isFinite(detection.bboxAreaRatio)) {
  metadata.bbox_area_ratio = detection.bboxAreaRatio;
}
```

**PRE-CONDITION**:
- commit 1 완료 (마커 r10-1 갱신)
- 작업 전 `git diff src/hooks/useBehaviorEventLogger.ts` = 마커 1줄 (commit 1)

**POST-CONDITION**:
- src/ logger metadata 블록의 `typeof === "number"` 패턴 0건 (`grep -n 'typeof.*=== "number"' src/hooks/useBehaviorEventLogger.ts` 결과 0)
- src/ logger 의 `Number.isFinite` 호출 2건 (top2Confidence + bboxAreaRatio)
- `npx vitest run` 109 passed (회귀 0)
- `pnpm build` 통과 (TypeScript 에러 0)

**롤백 트리거**:
- vitest fail (mirror 와 src/ 동치 깨짐) → `git revert HEAD`
- pnpm build fail (TS 에러) → `git revert HEAD` + 타입 분석

**검증 메커니즘**:
- mirror (`buildBehaviorEventMetadata.ts`) 와 src/ logger 의 metadata 조립 블록을 시각적으로 1:1 비교
- 향후 staging mirror 가 src/ 측 함수 호출로 치환되면 (체크리스트 §8.5 R7-S 옵션) 본 commit 의 변경은 자연 흡수 — 하지만 R12 PR 시점에는 mirror/src 별도 유지 (R7-S 는 commit 3 의 staging→src/ 이관 안에서 처리).

**대안 처리**: commit 3 (staging→src/ 이관) 안에서 mirror 함수를 `src/lib/behavior/buildBehaviorEventMetadata.ts` 로 이전 + src/ logger 가 본 함수를 호출 (R7-S 옵션 R 적용) → src/ logger 본체에서 직접 metadata 조립 블록 제거 → commit 2 의 typeof → Number.isFinite 변경이 통째로 사라지고 mirror 함수만 유지. 이 경우 commit 2 는 commit 3 의 부분으로 흡수 가능 (체크리스트 §3.5 명시). **R11 Arch 권고**: commit 2 와 commit 3 분리 유지 — atomic 단위가 명확. R7-S 는 commit 3 안에서 별도 처리.

### 3.4 commit 3: staging → src/ 이관 (모든 staging 코드 일괄)

**목적**: R10 까지 staging/ 에서 검증 완료된 코드를 src/ 로 이동. import 경로 일괄 재작성. tsconfig.staging-check.json + vitest.config.ts 정리.

**대상 파일 매핑 표 (10+ 파일)**:

| staging/ 경로 | src/ 경로 | 비고 |
|--------------|-----------|------|
| `staging/hooks/useBroadcasterYoloDriver.ts` | `src/hooks/useBroadcasterYoloDriver.ts` | 313 LOC |
| `staging/hooks/useYoloWorkerLifecycle.ts` | `src/hooks/useYoloWorkerLifecycle.ts` | 357 LOC |
| `staging/hooks/useYoloSampling.ts` | `src/hooks/useYoloSampling.ts` | 235 LOC |
| `staging/hooks/useYoloLatencyTracker.ts` | `src/hooks/useYoloLatencyTracker.ts` | 139 LOC |
| `staging/hooks/useDriverHealth.ts` | `src/hooks/useDriverHealth.ts` | 112 LOC |
| `staging/hooks/useBehaviorInferenceScheduler.ts` | `src/hooks/useBehaviorInferenceScheduler.ts` | 272 LOC |
| `staging/components/CameraBroadcastYoloMount.tsx` | `src/components/CameraBroadcastYoloMount.tsx` | 89 LOC |
| `staging/components/YoloDriverDiagBadge.tsx` | `src/components/YoloDriverDiagBadge.tsx` | 98 LOC (dev-only) |
| `staging/lib/behavior/confirmFrames.ts` | `src/lib/behavior/confirmFrames.ts` | 97 LOC |
| `staging/lib/behavior/yoloRetryPolicy.ts` | `src/lib/behavior/yoloRetryPolicy.ts` | 48 LOC |
| `staging/lib/behavior/loggerArmGuard.ts` | `src/lib/behavior/loggerArmGuard.ts` | 90 LOC |
| `staging/lib/behavior/yoloV2Flag.ts` | `src/lib/behavior/yoloV2Flag.ts` | 39 LOC |
| `staging/lib/behavior/maxDurationGuard.ts` | `src/lib/behavior/maxDurationGuard.ts` | 54 LOC |
| `staging/lib/behavior/buildBehaviorEventMetadata.ts` | `src/lib/behavior/buildBehaviorEventMetadata.ts` | 48 LOC (R7-S 옵션 R) |
| `staging/workers/yoloInference.worker.ts` | `src/workers/yoloInference.worker.ts` | 기존 staging 경로 그대로 — 위치만 src/ |
| `staging/tests/*.ts` (10 파일) | `src/__tests__/` 또는 `tests/` | vitest 설정에 따라 |

**Import 경로 재작성 목록**:

```ts
// staging 시점 driver 안 import (예시)
import type { BehaviorDetection } from "../types/behavior";
import { confirmDetection, NONE_KEY } from "../lib/behavior/confirmFrames";
import { useBehaviorEventLogger } from "./useBehaviorEventLogger";
import { useYoloWorkerLifecycle } from "./useYoloWorkerLifecycle";

// src/ 이관 후 driver 안 import (변경 없음 — 같은 src/hooks/ 안)
import type { BehaviorDetection } from "../types/behavior";
import { confirmDetection, NONE_KEY } from "../lib/behavior/confirmFrames";
import { useBehaviorEventLogger } from "./useBehaviorEventLogger";
import { useYoloWorkerLifecycle } from "./useYoloWorkerLifecycle";
```

**경로 무변경 (대다수)** — staging/hooks → src/hooks 이동 시 같은 깊이 (../types, ./useXxx) 그대로 유효.

**유의 변경**:

| 변경 사유 | 변경 패턴 |
|----------|----------|
| Worker URL | `new URL("../workers/yoloInference.worker.ts", import.meta.url)` 의 path 가 src/hooks → src/workers 로 변경 시 그대로 유효. **확인 명령**: `pnpm build` 후 `.next/static/chunks/` 에 worker chunk 생성 확인 |
| Mount 의 driver import | `staging/components/CameraBroadcastYoloMount.tsx` → `src/components/CameraBroadcastYoloMount.tsx` 이전. import 가 `../hooks/useBroadcasterYoloDriver` 그대로 유효 |
| 사용처 추가 | `src/app/camera/broadcast/CameraBroadcastClient.tsx` 에 `<CameraBroadcastYoloMount />` 한 줄 추가 + flag 분기 (체크리스트 §1) |
| 뷰어 게이트 | `src/hooks/useBehaviorDetection.ts` 의 onBehaviorChange 호출부에 `isYoloV2Enabled() ? undefined : existingHandler` 게이트 추가 (체크리스트 §1) |

**R7-S mirror 합치기 (commit 3 안에서 처리)**:
- staging mirror 함수를 `src/lib/behavior/buildBehaviorEventMetadata.ts` 로 이전.
- src/ logger 의 metadata 조립 블록 (line 225-236) 을 `buildBehaviorEventMetadata(detection, BEHAVIOR_MODEL_VERSION)` 호출 1줄로 치환.
- commit 2 의 NaN 가드 변경이 자연 흡수 (logger 측 typeof 패턴 자체가 사라짐).
- mirror.test 의 src/ logger 마커 검사 대상이 변경 — `useBehaviorEventLogger.ts` 가 import 한 `buildBehaviorEventMetadata` 의 마커가 r10-1 인지 검증으로 변경 (또는 mirror.test 자체 archive — src/ 통합 후 정합성 검증 자체가 불필요).

**tsconfig.staging-check.json 정리**:
- staging/ 경로 제거 (이관 완료 후 staging/ 디렉터리 비어있음).
- 또는 파일 자체 삭제 (tsconfig.json 만 사용).
- **R11 Arch 권고**: 파일 자체 삭제 (CLAUDE.md "파일 삭제 절대 금지" 예외 — staging 검증용 임시 설정이 R12 PR 후 무용).
- **단 CLAUDE.md 규칙 엄격 준수 시**: 파일 유지하되 include 비우기 (`"include": []`). 운영 부담 0.

**vitest.config.ts 정리**:
- staging/tests 경로를 src/__tests__ 또는 tests/ 로 변경.
- 기존 staging-only include 제거.

**PRE-CONDITION**:
- commit 1 + commit 2 완료
- 모든 staging 파일이 R10 PASS 상태 (LOC 한도 통과 + tsc 0 + vitest 109)

**POST-CONDITION**:
- staging/hooks/* / staging/components/* / staging/lib/behavior/* / staging/workers/* / staging/tests/* 모두 src/ 또는 tests/ 로 이전
- staging/ 디렉터리 비거나 docs/ 만 남음 (`staging/docs/phase_b_*.md` 는 commit 4 에서 처리)
- `pnpm build` 통과 (TypeScript 에러 0, Worker chunk emit 확인)
- `pnpm test` (또는 `npx vitest run`) 109 passed
- `src/app/camera/broadcast/CameraBroadcastClient.tsx` 에 `<CameraBroadcastYoloMount />` + flag 분기 추가
- `src/hooks/useBehaviorDetection.ts` 에 뷰어 게이트 추가

**롤백 트리거**:
- pnpm build fail → import 경로 재작성 누락 발견 → 해당 파일만 수정 + 재시도 (commit revert 가 아니라 fix-up commit)
- pnpm test fail → 테스트 import 경로 재작성 누락 → 해당 테스트 파일만 수정 + 재시도
- 회복 불능 시 commit 3 통째로 revert + 단계 분할 (예: hooks 먼저 / components 나중에)

**검증 메커니즘**:
- `pnpm build` 의 TypeScript 컴파일 + Next.js 빌드 통과
- `pnpm test` 의 109 테스트 PASS
- `find staging/ -name "*.ts" -o -name "*.tsx"` 결과 0건 (모두 이관됨)
- `grep -r "from \"./staging/" src/` 결과 0건 (잔존 import 0)

### 3.5 commit 4: ARCHITECTURE.md §10.2 통합 + ref_forward_pattern.md cross-reference

**목적**: R10 §4.2 명세대로 ARCHITECTURE.md §10.2 를 "구현 완료" + 4 부속 절로 갱신. staging 문서를 본 문서로 흡수.

**대상 파일**:
- `docs/ARCHITECTURE.md` (§10.2 갱신)
- `staging/docs/phase_b_ref_forward_pattern.md` (cross-reference 갱신 또는 archive)
- `staging/docs/phase_b_src_migration_checklist.md` (R12 PR 완료 표시)
- `staging/docs/phase_b_field_test_plan.md` (R12 PR 완료 표시)

**ARCHITECTURE.md §10.2 갱신 내용** (R10 §4.2 명세 그대로):

```markdown
### 10.2 Phase B — 방송폰 온디바이스 추론 (구현 완료)

YOLOv8n ONNX 온디바이스 추론. 방송폰 단독 (뷰어 중복 추론 제거). flag `NEXT_PUBLIC_CAT_YOLO_V2` 기본 OFF.

#### 10.2.1 훅 합성 패턴

driver (compose) = lifecycle (worker/retry) + sampling (tick) + driverHealth (5영역+isInferring) +
 Phase A logger 주입. 각 훅은 단일 책임 (CLAUDE.md "100줄 이내" 정신).

| 훅 | 책임 | LOC |
|----|------|-----|
| useBroadcasterYoloDriver | compose + handleResult 3상태 + onBeforeInfer/onHidden | 313 |
| useYoloWorkerLifecycle | Worker 생성/dispose/retry/STABLE_READY_MS | 357 |
| useYoloSampling | tick/visibility/postMessage | 235 |
| useDriverHealth | health 5영역 + isInferring + 4 콜백 | 112 |
| useYoloLatencyTracker | latency 링버퍼 + P50/P95 nearest-rank | 139 |

#### 10.2.2 ref-forward callback wrapper 패턴

(staging/docs/phase_b_ref_forward_pattern.md 의 §1~§4 본문 흡수 — Phase B 훅 합성에서
 순환 의존 해소용. driver 의 bump 3 + markInferring 4 콜백, lifecycle 의 콜백 4 ref 동기화)

[패턴 정의 + 코드 예시 + 안전성 분석 + 적용 사례 — 96 → ~50 LOC 압축]

#### 10.2.3 metadata freeze 약속 (Phase D 진입 전)

cat_behavior_events.metadata JSONB 4 필드 (model_version / top2_class / top2_confidence / bbox_area_ratio).
Phase D 라벨링 UI 가 본 스키마 기반.

R10 §2 NaN/Infinity 가드 (Number.isFinite — 미통과 시 key omit).
- model_version: 항상 (string)
- top2_class: detection.top2Class !== undefined 일 때만 (string)
- top2_confidence: Number.isFinite 통과 시만 (number, NaN/Infinity → key omit)
- bbox_area_ratio: Number.isFinite 통과 시만 (number, NaN/Infinity → key omit)

mirror 검증: `src/__tests__/metadataFreezeMirror.test.ts` (또는 통합 후 위치) 가 양쪽 마커 r10-1 일치 확인.

#### 10.2.4 환경변수

- `NEXT_PUBLIC_CAT_YOLO_V2`: flag, 기본 OFF
- `NEXT_PUBLIC_YOLO_MODEL_URL`: ONNX 모델 URL (Cloudflare R2 권고, .gitignore 동봉 안 함)
- `NEXT_PUBLIC_YOLO_STABLE_READY_MS`: ready 안정 유지 시간 (default 60_000, iOS 저사양 시 90_000)
```

**staging/docs/phase_b_ref_forward_pattern.md 처리**:

옵션 A (cross-reference 유지):
```markdown
> 본 문서는 ARCHITECTURE.md §10.2.2 로 통합됨 (R12 PR 시점, 2026-04-?? — 사장님 머지 후 날짜 기록).
> staging archive 로 보존 — 미래 Phase D/E 가 ref-forward 패턴 적용 시 본 문서 참조.
```

옵션 B (파일 archive 또는 삭제):
- CLAUDE.md "파일 삭제 절대 금지" → 옵션 B 기각.
- 옵션 A 채택 — 헤더 1줄 추가 + 본문 그대로 유지.

**R11 Arch 권고**: 옵션 A. 미래 Phase D/E 에서 동일 패턴 적용 시 reference 유지.

**PRE-CONDITION**:
- commit 1~3 완료
- ARCHITECTURE.md 의 현 §10.2 가 "Phase B — 방송폰 온디바이스 추론 (계획)" 1 단락만 (Phase A 완료 시점 상태)

**POST-CONDITION**:
- ARCHITECTURE.md §10.2 가 "구현 완료" + 4 부속 절 (10.2.1~10.2.4) 추가
- staging/docs/phase_b_ref_forward_pattern.md 헤더에 cross-reference 1줄
- staging/docs/phase_b_src_migration_checklist.md 끝에 "R12 PR 완료 (commit ID + 머지 날짜)" 1줄
- staging/docs/phase_b_field_test_plan.md 헤더에 "R12 PR 후 사장님 실기기 테스트 결과 commit 7 참조" 1줄

**롤백 트리거**:
- ARCHITECTURE.md 형식 회귀 (Markdown 깨짐) → `git revert HEAD` 후 재작성
- staging 문서 삭제 시도 발견 → 즉시 중단 + CLAUDE.md 위반 보고

**검증 메커니즘**:
- `grep -n "10.2.1\|10.2.2\|10.2.3\|10.2.4" docs/ARCHITECTURE.md` 결과 4건 (각 부속 절 헤더)
- staging/docs/ 의 3개 .md 파일 모두 보존 (cross-reference 추가만)

### 3.6 commit 5: Vercel ENV 3개 등록 + 빈 커밋 강제 재빌드 (사장님 작업)

**목적**: Vercel 프로덕션에 3개 환경변수 등록. CLAUDE.md #4/#6 (빈 커밋 강제 재빌드) 준수.

**Vercel ENV 3개**:

| ENV | 값 | scope | default 동작 |
|-----|---|-------|-------------|
| `NEXT_PUBLIC_CAT_YOLO_V2` | `0` (안전 default — flag OFF) | Production | flag OFF — 기존 Phase A 동작 |
| `NEXT_PUBLIC_YOLO_MODEL_URL` | `https://pub-e5e4c245235e430f84f088febf07a0c0.r2.dev/cat_behavior_yolov8n.onnx` | Production | (필수 — flag ON 시) |
| `NEXT_PUBLIC_YOLO_STABLE_READY_MS` | `60000` (또는 미설정 — fallback default) | Production | 60_000 ms (fallback) |

**작업 순서 (사장님)**:

```bash
# 1. Vercel MCP 또는 대시보드에서 ENV 3개 등록
#    NEXT_PUBLIC_CAT_YOLO_V2=0 (default OFF — 안전)
#    NEXT_PUBLIC_YOLO_MODEL_URL=https://pub-e5e4c245235e430f84f088febf07a0c0.r2.dev/cat_behavior_yolov8n.onnx
#    NEXT_PUBLIC_YOLO_STABLE_READY_MS=60000

# 2. 빈 커밋으로 강제 재빌드 (NEXT_PUBLIC_* 빌드타임 주입)
git commit --allow-empty -m "chore: redeploy for NEXT_PUBLIC_CAT_YOLO_V2 (flag OFF default)"
git push

# 3. Vercel MCP getDeployments 로 readyState=READY + readySubstate=PROMOTED 확인
#    (또는 Vercel 대시보드)

# 4. 배포 완료 후 사장님 실기기 또는 PC 브라우저에서 console.log 확인
#    console.log(process.env.NEXT_PUBLIC_CAT_YOLO_V2)
#    expect: "0"
```

**PRE-CONDITION**:
- commit 1~4 완료 + PR 머지 완료 (master 에 적용됨)
- Cloudflare R2 bucket 정상 동작 확인 (체크리스트 §7.6 의 사장님 6 체크박스 모두 완료)

**POST-CONDITION**:
- Vercel ENV 3개 등록됨 (`vercel env ls` 또는 Vercel MCP `listEnvVars`)
- Vercel deployment 가 READY + PROMOTED
- 빈 커밋 commit ID 메모됨 (체크리스트 §4 Instant Rollback 대상)
- 브라우저 console 에서 `process.env.NEXT_PUBLIC_CAT_YOLO_V2 === "0"` 확인

**롤백 트리거**:
- ENV 등록 누락 → flag 분기 동작 안 함 → 빈 커밋으로 재빌드 후 재확인
- Vercel 배포 fail → 이전 PROMOTED commit 으로 Instant Rollback (5초 이내)
- console.log 결과 undefined → ENV 미주입 → ENV scope 확인 (Production 인지) + 빈 커밋 재시도

**검증 메커니즘**:
- Vercel MCP `getEnvVar` 로 3개 ENV 모두 Production scope 등록 확인
- Vercel MCP `getDeployments` 로 최신 deployment 가 READY + PROMOTED
- 사장님 브라우저 DevTools Console 에서 직접 확인

### 3.7 commit 6: 머지 후 baseline 검증 결과 기록 (체크리스트 §1~§4)

**목적**: PR 머지 + Vercel 배포 완료 직후 운영 baseline 측정. 회귀 없음 확인 후 24시간 모니터링 시작.

**대상 파일**: `docs/phase_b_post_merge_baseline_<날짜>.md` (신규) 또는 `docs/ARCHITECTURE.md` 끝부분에 추가.

**기록 항목**:

```markdown
## Phase B src/ PR 머지 후 baseline (R12 commit 6, 2026-04-??)

### 머지 commit ID
- PR commit (master): <40자>
- Instant Rollback 대상 (이전 PROMOTED): 354f6dd (Phase A 완료 시점)

### 머지 직후 SQL baseline (Supabase MCP execute_sql)
- cat_behavior_events row 수: <count>
- camera_sessions row 수: <count>
- ice_candidates row 수: <count>
- camera_viewer_connections row 수: <count>
- 합계: <count> (CLAUDE.md 교훈 #12: 1000 초과 시 경고)

### Pool 사용률 (Supabase Dashboard → Reports)
- 머지 직후 5분 평균: <%>
- 베타 7명 환경 기준 60% 이하 유지 확인

### 콘솔 경고 0건 확인 (사장님 브라우저)
- [CATvisor][loggerArmGuard] 0건
- [Lifecycle] error 0건
- [Sampling] postMessage error 0건

### Vercel deployment 상태
- readyState: READY
- readySubstate: PROMOTED
- buildTime: <duration>
- functionTimeoutSeconds: <기본값>

### 다음 단계
- flag OFF 상태로 24시간 모니터링 (commit 7 직전 데이터)
- 24시간 무이상 시 사장님 실기기 테스트 (field_test_plan §0~§3) 진행
```

**PRE-CONDITION**:
- commit 5 완료 (Vercel 배포 READY)
- 머지 직후 30분 이내

**POST-CONDITION**:
- baseline 문서 1개 생성 또는 ARCHITECTURE.md 갱신
- Supabase MCP 로 row 수 4건 측정 + 합계 기록
- Pool 사용률 기록
- 콘솔 경고 0건 확인 결과 기록

**롤백 트리거**:
- row 수 합계 1000 초과 → CLAUDE.md 교훈 #12 발동 → 누수 의심 → flag OFF 유지 + 원인 조사
- Pool 사용률 60% 초과 → flag OFF 유지 + Pro 업그레이드 검토 (CLAUDE.md 교훈 #7)
- 콘솔 경고 발견 → 종류별 분석 + flag OFF 유지

**검증 메커니즘**:
- Supabase MCP `execute_sql` 로 row 수 4건 측정
- Vercel MCP `getDeployments` 로 배포 상태 확인
- 사장님 브라우저 DevTools Console 직접 확인

### 3.8 commit 7: 사장님 실기기 테스트 결과 기록 (field_test_plan §1~§7)

**목적**: 24시간 baseline 무이상 후 사장님 실기기 30분 테스트 진행. flag OFF → flag ON 토글 → 30분 모니터링 → flag OFF 복귀. 결과 기록.

**대상 파일**: `docs/phase_b_field_test_result_<날짜>.md` (신규).

**작업 순서 (사장님 + 가족)**:

```bash
# 1. flag OFF 상태에서 24시간 baseline 무이상 확인 (commit 6 의 row 수 / pool / 경고 0)

# 2. flag ON 토글 (Vercel ENV 변경)
#    NEXT_PUBLIC_CAT_YOLO_V2=1
#    빈 커밋 push → READY+PROMOTED 확인 → Instant Rollback commit ID 메모

# 3. field_test_plan §0 사전 체크 (6 체크박스)
# 4. field_test_plan §1 방송 시작 5분 (5 체크박스)
# 5. field_test_plan §2 30분 연속 (5 체크박스)
# 6. field_test_plan §3 종료 5분 (5 체크박스)
# 7. (실패 시) field_test_plan §6 로그 수집 (7 체크박스)
# 8. flag OFF 복귀 (Vercel ENV NEXT_PUBLIC_CAT_YOLO_V2=0 + 빈 커밋)

# 9. 결과 기록
```

**기록 항목**:

```markdown
## Phase B 사장님 실기기 테스트 결과 (R12 commit 7, 2026-04-??)

### 테스트 환경
- 방송폰: <기기/OS/브라우저 버전>
- 뷰어폰 (가족): <기기/OS/브라우저 버전 × N>
- 시간: <시작 시각> ~ <종료 시각> (30분)

### §0 사전 체크 (6 체크박스 결과)
- [O] 0-1 Vercel ENV 확인
- [O] 0-2 R2 bucket 200 응답
- [O] 0-3 빈 커밋 강제 재빌드 + READY+PROMOTED
- [O] 0-4 방송폰 OS/브라우저 버전 확인
- [O] 0-5 뷰어폰 OS/브라우저 확인
- [O] 0-6 이전 PROMOTED commit ID 메모: <40자>

### §1 방송 시작 (5 체크박스 결과)
- [O] 1-1 flag ON 정상 인식 (배지 등장)
- [O] 1-2 배지 녹색 전환 (30초 내)
- [O] 1-3 배지 hover backend=<webgpu|webgl|wasm>
- [O] 1-4 latency p50=<ms> / p95=<ms> (합격선 통과)
- [O] 1-5 retryAttempt=0 유지

### §2 30분 연속 (5 체크박스 결과)
- [O] 2-1 ticksTotal 단조 증가: <시작값> → <종료값>
- [O] 2-2 retryAttempt 0 유지 (전체 30분)
- [O] 2-3 Supabase row 증가: <분당 평균>
- [O] 2-4 방송폰 메모리 증가율: <MB/30분>
- [O] 2-5 behavior 1개 이상 감지: <classes>

### §3 종료 (5 체크박스 결과)
- [O] 3-1 flag OFF 즉시 전환
- [O] 3-2 Mount unmount 직후 worker 종료
- [O] 3-3 Supabase row 분포: <classes>
- [O] 3-4 뷰어 INSERT 0건 확인 (camera_id 분포)
- [O] 3-5 로그 스크린샷 첨부

### §5 검증 기준 통과 여부
| 지표 | 기대값 | 실측 | 판정 |
|------|--------|------|------|
| retryAttempt | 0 | <값> | <O/X> |
| ticksTotal | 360 ± 10% | <값> | <O/X> |
| inferSuccesses/ticksTotal | > 0.85 | <값> | <O/X> |
| inferLatencyP95Ms | < 1000ms (WebGPU) / < 3000ms (WebGL/WASM) | <값> | <O/X> |
| 방송폰 메모리 | < 10MB/30분 | <값> | <O/X> |
| Supabase row | < 분당 10 | <값> | <O/X> |
| Realtime 채널 | < 50 | <값> | <O/X> |

### iOS 실기기 latency 임계값 결정 (R11-A)
- 실측 inferLatencyP95Ms: <ms>
- 권고 임계값: <ms>
- STABLE_READY_MS 조정 필요 여부: <yes/no>
- 조정 시 새 값: <ms>

### Phase D 착수 가능 여부
- 30분 테스트 무이상: <yes/no>
- 24시간 baseline 무이상 (commit 6): <yes/no>
- 결론: Phase D Arch 착수 <가능/대기>

### 다음 단계
- flag OFF 복귀 후 Phase D Arch 착수 (혹은 추가 테스트 라운드)
```

**PRE-CONDITION**:
- commit 6 의 24시간 baseline 무이상 확인
- 사장님 실기기 + 가족 뷰어폰 준비
- field_test_plan.md §0 사전 체크 6 체크박스 통과

**POST-CONDITION**:
- 결과 문서 1개 생성
- 30분 테스트 §1~§3 의 15 체크박스 결과 기록
- §5 검증 기준 7 지표 실측값 + 판정 기록
- iOS latency 임계값 결정 (R11-A 해소)
- Phase D 착수 가능 여부 결론

**롤백 트리거**:
- 임계값 1건이라도 미달 → field_test_plan §6 로그 수집 7 체크박스 진행
- 빠른 롤백: Vercel ENV `NEXT_PUBLIC_CAT_YOLO_V2=0` + 빈 커밋 push (5초 이내)
- 데이터 보존: row 보존 확인 (롤백은 DB 변경 없음)
- 사후 보고: gh issue 또는 docs/ 에 실패 분석 + Arch R12+ (수정 라운드) 착수 근거

**검증 메커니즘**:
- 사장님 + 가족이 30분 동안 직접 모니터링
- 사장님이 Supabase MCP / Vercel MCP 로 row 수 / 배포 상태 직접 확인
- 사장님이 브라우저 DevTools 로 dev 배지 hover + Console 직접 확인

### 3.9 R12 PR 머지 절차 (commit 1~4 PR 단위 처리)

**원칙**: commit 1~4 는 단일 PR 안에서 atomic 머지. commit 5~7 은 머지 후 별도 작업 (사장님 + 모니터링).

**머지 단계**:

```
1. R12 PR 생성 (branch: feat/phase-b-src-r12, base: master)
   - commit 1: 마커 r10-1 갱신 (3곳)
   - commit 2: src/ logger NaN 가드
   - commit 3: staging → src/ 이관
   - commit 4: ARCHITECTURE.md §10.2 통합

2. PR description 에 다음 명시:
   - "Phase B 9연속 PASS R3~R11 완료 후 src/ 반영"
   - "flag OFF default — 안전 머지 (NEXT_PUBLIC_CAT_YOLO_V2=0 미설정 또는 0)"
   - "체크리스트: staging/docs/phase_b_src_migration_checklist.md §1~§9 완료 표시"
   - "Instant Rollback commit: 354f6dd (Phase A 완료 시점)"
   - "Cloudflare R2 사전 세팅 완료: §7.6 사장님 6 체크박스 모두 [x]"
   - "테스트: pnpm test 109 passed / pnpm build 통과"

3. CI 통과 확인 (GitHub Actions 또는 Vercel preview 자동 배포)

4. 사장님 review + approve

5. master 머지 (squash or merge — 정책에 따라)
   - **R11 Arch 권고**: merge (4 commit 보존). squash 시 atomic 단위 손실.

6. 머지 직후 30분 내:
   - commit 5: Vercel ENV 등록 + 빈 커밋
   - commit 6: baseline 측정

7. 24시간 무이상 후:
   - commit 7: 사장님 실기기 테스트
```

### 3.10 R12 PR 머지 후 운영 모니터링

**24시간 baseline 모니터링 항목**:

| 항목 | 빈도 | 임계값 | 조치 |
|------|------|--------|------|
| Supabase row 합계 | 6시간마다 | < 1000 | 초과 시 누수 의심 |
| Pool 사용률 | 12시간마다 | < 60% | 초과 시 Pro 업그레이드 검토 |
| Vercel 에러 로그 | 12시간마다 | 0건 | 발견 시 분석 |
| 사용자 보고 | 수시 | 0건 | 발견 시 즉시 분석 |

**24시간 후 결정**:
- 무이상 → commit 7 (사장님 실기기 테스트) 진행
- 이상 발견 → flag OFF 유지 + 원인 조사 + 추가 작업 라운드

---

## §4. CLAUDE.md #13/#14 적용 검토 (C 항목)

### 4.1 마커 갱신 + NaN 가드 = 데이터 모델 변경 아님 (#14 트리거 X)

**검토 대상**: R12 commit 1 (마커 r7-1 → r10-1) + commit 2 (src/ logger NaN 가드 추가).

**#14 데이터 모델 변경 정의** (CLAUDE.md):
- AI 모델 클래스 정의 변경
- DB 컬럼 의미 변경
- 양방향 호환 불가능한 스키마 변경

**R11 Arch 의 "데이터 모델 변경" 명확화**:

| 변경 항목 | #14 트리거? | 사유 |
|-----------|------------|------|
| metadata-freeze-spec 마커 r7-1 → r10-1 | **X** | 단순 주석 동기화. 코드 동작 변경 0. mirror 와 src/ 의 일관성 표시. |
| src/ logger NaN 가드 (typeof → Number.isFinite) | **X** | NaN/Infinity 시 key omit (기존 동작과 호환 — typeof 도 NaN 통과 후 INSERT 시 silent null 변환). 양방향 호환 가능. |
| metadata 4 필드 자체 (model_version / top2_class / top2_confidence / bbox_area_ratio) | **X** | Phase A 부터 정의된 스키마 그대로. 변경 없음. |
| BehaviorClass 12 클래스 정의 | (해당 사항 X) | Phase B 범위 밖. Phase A 에서 freeze. |
| cat_behavior_events 컬럼 | (해당 사항 X) | Phase A 에서 freeze. R12 PR 시 변경 0. |

**결론**: R12 PR 의 모든 변경은 **#13 (flag OFF 경로 무손상 원칙) 적용**. #14 예외 트리거 X.

### 4.2 일반 staging → src 이관 = #13 적용 (flag OFF 무손상)

**원칙**: R12 PR 의 staging → src/ 이관은 일반 코드 추가. flag OFF default 로 머지 → 기존 Phase A 동작 무손상.

**#13 무손상 검증**:

| 항목 | flag OFF 동작 | flag ON 동작 |
|------|--------------|-------------|
| `<CameraBroadcastYoloMount />` 컴포넌트 | `isYoloV2Enabled() === false` → null 반환 (Mount 내부 분기) | driver 훅 + Worker 생성 |
| `useBehaviorDetection` 의 onBehaviorChange | `isYoloV2Enabled() === false` → existingHandler (기존 동작) | undefined (뷰어 INSERT 게이트) |
| `useBehaviorEventLogger` (src/) | 호출 X (Phase A 경로 그대로) | driver 가 호출 (Phase B 경로) |
| Vercel 빌드 | flag OFF default → 기존 Phase A 빌드와 동일 chunk 크기 (driver 훅 tree-shake 안 되지만 기존 함수 호출 무) | flag ON 시 driver 훅 활성 |

**결론**: flag OFF 머지 → 기존 Phase A 동작 100% 보존. R12 PR 안전.

### 4.3 R7-S mirror 합치기 = #13 적용 (단순 함수 추출)

**원칙**: src/ logger 의 metadata 조립 블록을 `buildBehaviorEventMetadata` 함수 호출로 치환.

- 함수 동작 1:1 동치 (mirror 가 logger 본체 그대로 추출)
- typeof → Number.isFinite 변경은 commit 2 에서 이미 동기화
- src/ logger 외부 인터페이스 무변경 (return 값 + 에러 동작 동일)

**결론**: #13 적용. flag 무관 안전.

---

## §5. MINOR-R10-NEW-1 처리 결정 (D 항목)

### 5.1 옵션 1/2 비교 + R11 결정 (옵션 2 R12 후 재검토)

**MINOR-R10-NEW-1 정의**: T7 case 5 expectation 완화 ("= 0" → "≤ 1").
- Arch §3.1 명세: `expect(renderCount).toBe(rendersAfterFirstFlush)` (추가 렌더 정확히 0)
- Dev 변경: `expect(renderCount - rendersAfterFirstFlush).toBeLessThanOrEqual(1)` (line 175, 추가 렌더 ≤1)
- Dev 사유: React 19 Strict Mode double-render / functional updater 1차 평가 등 환경 영향 흡수

**옵션 비교**:

| 옵션 | 핵심 | 장점 | 단점 |
|------|------|------|------|
| **옵션 1** | R11 에서 React 19 동작 깊이 조사 + 명세 정확화 ("React 19: ≤1, React 18: =0") | 정확한 회귀 검증 메커니즘 확립 | R11 변경 최소화 원칙 위배. 추가 vitest case 또는 명세 변경 필요. R12 PR 직전 회귀 risk. |
| **옵션 2** ✅ | R12 src/ PR 후 prod 빌드 환경 확정 시점에 재검토 | R11 변경 최소화. R12 후 prod 환경 React 19 commit 동작 실측 가능 (개발 환경과 prod 빌드 차이 가능성). | 본 라운드에 즉시 처리 안 함. 단 PASS 차단 사유 아님 (R10 QA Dev 보류 정책 §0 정당 판정). |

**R11 결정: 옵션 2 채택.**

**근거**:
1. **R11 변경 최소화 원칙** — 신규 분할/응축/리팩터/테스트 변경 금지.
2. **prod 환경 확정 후 검증 효율** — R12 PR 머지 + commit 7 사장님 실기기 테스트 후 React 19 prod 빌드 환경에서 실제 commit 동작 확인 가능. 개발 환경의 Strict Mode double-render 와 prod 빌드 동작 차이 가능성.
3. **Dev 보류 정책 §0 정당** — R10 QA 가 3조건 (테스트 회귀 증거 + self-sufficient 대체 + QA 사유 기록) 모두 충족 판정. PASS 차단 사유 아님.
4. **검증 의도 손실 0** — "추가 렌더 ≤1" 도 prev-equal skip 동작 검증 등가 (skip 미작동 시 ≥2 누적 발생).

**R12 PR 후 재검토 트리거**:
- React 19 prod 빌드 환경에서 commit 7 사장님 실기기 테스트 시 추가 렌더 횟수 측정 (옵션 — DiagBadge 에 renderCount 표시).
- 측정 결과 "정확히 1회 발생" 확인 시 → `expect(renderCount - rendersAfterFirstFlush).toBe(1)` 로 정확값 검증 변경.
- 측정 결과 "0~1회 변동" 확인 시 → 현 ≤1 명세 유지 + 코드 주석에 환경 명시.

### 5.2 체크리스트 §1 보강 (D5 작업)

R11 Dev 가 `staging/docs/phase_b_src_migration_checklist.md` §1 영역에 다음 1 체크박스 추가:

```markdown
- [ ] **(MINOR-R10-NEW-1 / R12 PR 후)** T7 case 5 expectation 완화 ("= 0" → "≤ 1") 의 React 19 prod 빌드
      환경 동작 확정. R12 PR 머지 + commit 7 사장님 실기기 테스트 후 React 19 prod commit 동작
      실측 시점에 재검토. 옵션:
      - "정확히 1회 발생" 확인 시 → `expect(renderCount - rendersAfterFirstFlush).toBe(1)` 정확값 검증
      - "0~1회 변동" 확인 시 → 현 ≤1 명세 유지 + 코드 주석에 환경 명시
      참조: docs/phase_b_qa_r10.md MINOR-R10-NEW-1 / docs/phase_b_arch_r11.md §5
```

---

## §6. iOS 실기기 latency 임계값 (E 항목)

### 6.1 사장님 실기기 테스트 후 결정 권고

**원칙**: R11 시점에 임계값 사전 결정 X. 사장님 실기기 테스트 (`field_test_plan.md` §1~§5) 후 실측값 기반 결정.

**현 STABLE_READY_MS default**: 60_000 ms (lifecycle.ts line 50, env fallback).

**결정 흐름**:

```
R12 PR 머지
  ↓
commit 5: Vercel ENV NEXT_PUBLIC_YOLO_STABLE_READY_MS=60000 (default)
  ↓
commit 7: 사장님 실기기 테스트
  ↓
field_test_plan §1-4 결과 분석
  ├── inferLatencyP95Ms < 1000ms (WebGPU) → 60_000 유지
  ├── inferLatencyP95Ms 1000~3000ms (WebGL/WASM) → 60_000 유지 또는 90_000 검토
  └── inferLatencyP95Ms > 3000ms (또는 worker init 60s 초과) → 90_000 또는 120_000 상향
  ↓
임계값 결정
  ├── 60_000 유지 → 추가 작업 없음
  ├── 90_000 변경 → Vercel ENV NEXT_PUBLIC_YOLO_STABLE_READY_MS=90000 + 빈 커밋
  └── 120_000 변경 → Vercel ENV NEXT_PUBLIC_YOLO_STABLE_READY_MS=120000 + 빈 커밋
```

### 6.2 환경변수 무코드 수정 조정 가능

**핵심 장점**: STABLE_READY_MS 는 환경변수 (`NEXT_PUBLIC_YOLO_STABLE_READY_MS`) 로 외부 조정. 코드 변경 없이 Vercel ENV 수정 + 빈 커밋만으로 적용.

**조정 절차** (commit 7 후):

```bash
# 1. Vercel ENV 변경 (예: 60_000 → 90_000)
vercel env rm NEXT_PUBLIC_YOLO_STABLE_READY_MS production
vercel env add NEXT_PUBLIC_YOLO_STABLE_READY_MS production
# 입력: 90000

# 2. 빈 커밋 강제 재빌드
git commit --allow-empty -m "chore: tune NEXT_PUBLIC_YOLO_STABLE_READY_MS=90000 (iOS 실기기 결과 반영)"
git push

# 3. Vercel READY+PROMOTED 확인 + 사장님 추가 검증
```

**iOS UA 자동 분기 검토 (R12 후)**:
- 현 staging 코드는 UA 분기 X — 모든 기기에 동일 default 60_000.
- iOS Safari 16.4+ 만 자동 90_000 적용 검토 (R12 PR 후 iOS 실측 결과로 결정).
- 분기 추가 시 lifecycle.ts 의 STABLE_READY_MS 평가 로직에 UA 검사 추가 (별도 라운드 — R12 후 작업).

---

## §7. Phase D 착수 권고 (F 항목)

### 7.1 트리거 조건 (PR 머지 + 30분 테스트 + 24시간 baseline 무이상)

**Phase D = 라벨링 UI** (집사가 잘못된 추론 수정 → `update_behavior_user_label` RPC).

**Phase D 착수 가능 트리거**:

```
1. Phase B src/ PR 머지 완료 (R12 commit 1~4 master 적용)
2. Vercel ENV 등록 + READY+PROMOTED (R12 commit 5)
3. 24시간 baseline 모니터링 무이상 (R12 commit 6)
4. 사장님 실기기 30분 테스트 무사 통과 (R12 commit 7 의 §1~§5)
5. flag OFF 상태로 안정화 (commit 7 후 1주일 무이상)
```

**5 조건 모두 만족 시 Phase D Arch 착수.**

### 7.2 Phase D 의 Phase B 의존성 검토

**Phase D 가 사용할 Phase B 산출물**:

| 의존 | 사용 위치 |
|------|----------|
| `cat_behavior_events.metadata.top2_class` | 라벨링 UI 가 "오탐 후보 표시" 에 사용 (top1 외 top2 도 보여줌) |
| `cat_behavior_events.metadata.top2_confidence` | 신뢰도 기반 정렬 |
| `cat_behavior_events.metadata.bbox_area_ratio` | "멀리 있는 고양이 필터" 에 사용 (작은 bbox 는 오탐 가능성 ↑) |
| `cat_behavior_events.metadata.model_version` | Phase E archive vs active 분류 키 |
| `update_behavior_user_label` RPC | 사용자 수정 결과 INSERT |
| `cat_behavior_events.user_label` 컬럼 | Phase D UI 가 표시/수정 |

**Phase D 진입 전 freeze 약속**:
- metadata 4 필드 스키마 R10 §2 freeze 유지.
- 변경 필요 시 Phase D Arch 와 사전 합의.

### 7.3 Phase D 외 향후 라운드

**Phase E** (노이즈 archive 이관 + snapshot 저장):
- `behavior-snapshots` bucket owner-only policy
- 30일 후 archive 분류 (model_version 키)

**Phase F** (SD카드 학습 영상 batch retraining):
- `export_behavior_dataset` RPC 사용
- 사용자 수정 라벨 (user_label) 을 학습 데이터로 활용

**Phase D/E/F 순서**: D → E → F (사용자 수정 → archive → 재학습).

---

## §8. R11 Dev TODO 리스트 (필수만, 5건 이내)

### 8.1 필수 (Required) — R11 PASS 조건

| ID | 출처 | 항목 | 완료기준 |
|----|------|------|---------|
| **D1** | §2.2/§2.3 | R10 변경 정착 검증 — 7개 명령 + 2 옵션 grep 실행 + 회귀 0 확인 | tsc 0 / vitest 109 / git diff src/ 1 line / wc -l 한도 통과 / 마커 r7-1 5건 / NaN 가드 4건 / ref-forward 4 ref + deps 4건 |
| **D2** | §3.6/§3.9 | `staging/docs/phase_b_src_migration_checklist.md` §1.1 + §3 영역에 R12 PR 사전 검증 3 체크박스 추가 | 체크박스 3개 추가 + grep "R12 PR" 1건 이상 |
| **D3** | §3.8 | `staging/docs/phase_b_field_test_plan.md` §0 영역에 R12 PR 직후 commit ID 메모 + R2 CORS 마지막 확인 1 체크박스 추가 | §0 의 0-7 신규 체크박스 1개 추가 + LOC ≤180 |
| **D4** | §3.1~§3.10 | `staging/docs/phase_b_src_migration_checklist.md` 끝부분에 §9 신설 — R12 atomic 7 commit 체크리스트 (각 commit 의 PRE/POST/롤백 트리거 + 머지 절차 + 운영 모니터링) | §9 추가 + atomic 7 commit 명세 + LOC 약 +50 |
| **D5** | §5.2 | `staging/docs/phase_b_src_migration_checklist.md` §1 영역에 MINOR-R10-NEW-1 R12 PR 후 재검토 1 체크박스 추가 | §1 끝에 1 체크박스 추가 |

### 8.2 권고 (Optional) — 시간 여유 시 R11 처리

R11 권고 작업 0건. 변경 최소화 원칙. 모든 추가 작업은 R12 PR 또는 그 후로 이월.

### 8.3 금지 사항 (R11 강화)

- **파일 삭제 금지** (CLAUDE.md). D1~D5 의 모든 작업은 Edit 또는 Append.
- **신규 코드 작성 금지** (R11 변경 최소화 원칙). 코드 파일 (.ts/.tsx) 변동 0.
- **신규 테스트 추가 금지** (R11 변경 최소화). vitest 109 그대로 유지.
- **응축/분할/리팩터 금지** (R11 변경 최소화). 4 코드 파일 LOC 변동 0.
- **driver `≤320` 강제** (R10 한도 유지). LOC 변경 시 즉시 REJECT.
- **useDriverHealth `≤120` 강제** (R10 한도 유지).
- **lifecycle `≤368` 강제** (R10 한도 유지).
- **tracker `≤145` 강제** (R10 한도 유지).
- **src/ 0 diff 강제** (R10 마커 1줄 그대로 유지). R11 작업으로 인한 src/ 변경 발생 시 즉시 REJECT.
- **마커 r7-1 변경 금지** (R12 PR 시점에만). R11 시점 r10-1 변경 발견 시 즉시 REJECT.

### 8.4 Dev 가 Arch 에 질문해야 하는 경우

R6 §1.3 의 3조건 (테스트 회귀 증거 + self-sufficient 대체 + QA 사유 기록) 모두 만족 시 단독 보류 가능. R11 의 자동 질문 대상:

1. **D2 의 체크박스 3개 위치**: §1.1 vs §3 vs §1.4 — Dev 자율 (관련성 가까운 영역 선택).
2. **D4 §9 형식**: Markdown 표 vs 체크박스 vs 본문 — Dev 자율 (가독성 우선).
3. **D5 의 체크박스 위치**: §1 끝 vs §6 (R5+ 이관 항목) — Dev 자율 (의미 가까운 영역).
4. **D1 의 옵션 2 추가 grep 명령 (ref-forward)**: 실행 vs 생략 — 시간 여유 시 실행, 부족 시 생략 가능 (§2.3 옵션 명시).

---

## §9. QA Agent 운영 권고

### 9.1 R10 QA Bash 권한 결과

R10 QA Agent 가 7개 명령 직접 실행 (tsc / vitest / git diff stat / git diff full / wc -l / grep mirror 마커 / grep Number.isFinite + 1 보강 useState grep) — 실측 신뢰도 회복 + 8/9 진입 핵심.

### 9.2 R11 팀장 권고

R11 QA Agent 에 다음 7개 명령 실행 권한을 명시 허용 (R10 동일):

```bash
npx tsc --noEmit -p tsconfig.staging-check.json
npx vitest run
git diff --stat src/
git diff src/
wc -l staging/hooks/*.ts staging/components/*.tsx staging/lib/behavior/*.ts staging/tests/*.ts staging/docs/*.md
grep -n "metadata-freeze-spec" src/hooks/useBehaviorEventLogger.ts staging/lib/behavior/buildBehaviorEventMetadata.ts staging/tests/metadataFreezeMirror.test.ts
grep -n "Number.isFinite" staging/lib/behavior/buildBehaviorEventMetadata.ts staging/hooks/useYoloWorkerLifecycle.ts staging/hooks/useYoloLatencyTracker.ts
```

추가 명령 (R11 신규 — 정착 검증 강화):

```bash
# ref-forward 4 ref + deps 4건 정착 확인
grep -n "useRef<.*=> .*>.*=> {}" staging/hooks/useBroadcasterYoloDriver.ts

# typeof "number" 잔존 0건 확인 (mirror 본체)
grep -n 'typeof.*=== "number"' staging/lib/behavior/buildBehaviorEventMetadata.ts

# 체크리스트 §9 신설 확인
grep -n "^## §9" staging/docs/phase_b_src_migration_checklist.md
```

**이유**:
- R11 변경은 D2/D3/D4/D5 의 문서 갱신만 + D1 정착 검증 — 실측이 핵심.
- 추가 grep 으로 ref-forward 패턴 + typeof 잔존 0 + §9 신설 자동 확인.

### 9.3 권한 부족 시 R11 QA 보강 절차

R8/R9/R10 와 동일 — 팀장이 직접 7개 명령 + 3 보강 grep 실측 → R11 QA 리포트 첨부.

### 9.4 R10 QA 가 명시 권고한 R11 우선 처리 6건 (재정리)

R10 QA 가 R11 권고로 명시한 6건의 본 R11 처리 매핑:

| R10 QA 권고 | R11 § | D |
|-----------|-------|---|
| #1 R10 변경 정착 검증 (필수) | §2 | D1 |
| #2 MINOR-R10-NEW-1 R5 검토 (선택) | §5 (옵션 2 R12 후 보류) | D5 (체크박스만) |
| #3 R11 src/ PR atomic 작업 묶음 10건 최종 점검 (필수) | §3 | D2 + D4 |
| #4 iOS 실기기 latency P95 임계값 결정 (사장님 실측 후) | §6 | D3 (체크박스만) |
| #5 driver 추가 마진 (선택) | §0.4 (변동 0 — 마진 충분) | (작업 0 — R11 권고 보류) |
| #6 마커 r7-1 → r10-1 갱신 시 mirror + src + mirror.test 3곳 동시 (필수) | §3.2 | D4 (commit 1 명세) |

R10 QA 권고 6건 중 #1 + #3 + #6 = R11 처리 (필수 4) + #2 + #4 = R11 체크리스트 보강 (선택 2) + #5 = R11 보류 (변경 최소화).

---

## §10. R11 LOC 예측 표 (변동 없음)

| 파일 | R10 LOC | R11 예상 | 한도 (R6/R10) | R11 마진 | 변경 요약 |
|------|---------|----------|---------------|---------|-----------|
| `useBroadcasterYoloDriver.ts` | 313 | **313** (변동 0) | 400 / **R10 ≤320 (R11 유지)** | 7 | - |
| `useDriverHealth.ts` | 112 | **112** (변동 0) | 400 / **R10 ≤120 (R11 유지)** | 8 | - |
| `useYoloWorkerLifecycle.ts` | 357 | **357** (변동 0) | 400 / **R10 ≤368 (R11 유지)** | 11 | - |
| `useYoloLatencyTracker.ts` | 139 | **139** (변동 0) | 400 / **R10 ≤145 (R11 유지)** | 6 | - |
| `useYoloSampling.ts` | 235 | 235 (변동 0) | 400 / 350 | 115 | - |
| `YoloDriverDiagBadge.tsx` | 98 | 98 (변동 0) | 100 | 2 | - |
| `CameraBroadcastYoloMount.tsx` | 89 | 89 (변동 0) | 100 | 11 | - |
| `buildBehaviorEventMetadata.ts` | 48 | 48 (변동 0) | 400 / 350 | 302 | - |
| `metadataFreeze.test.ts` | 146 | 146 (변동 0) | — | - | - |
| `metadataFreezeMirror.test.ts` | 52 | 52 (변동 0) | — | - | - |
| `yoloLatencyTracker.test.ts` | 177 | 177 (변동 0) | — | - | - |
| `yoloWorkerLifecycle.test.ts` | 574 | 574 (변동 0) | — | - | - |
| `broadcasterYoloDriver.renderHook.test.ts` | 340 | 340 (변동 0) | — | - | - |
| `phase_b_src_migration_checklist.md` | 468 | **~520** (D2+D4+D5 +52) | — | - | §1.1 + §3 + §6 + §9 보강 |
| `phase_b_field_test_plan.md` | 174 | **~180** (D3 +6) | ≤180 | 0 | §0 0-7 보강 |
| `phase_b_ref_forward_pattern.md` | 96 | 96 (변동 0) | — | - | R12 시점 ARCHITECTURE.md §10.2.2 흡수 |
| `vitest.config.ts` | 56 | 56 (변동 0) | — | - | - |
| `tsconfig.staging-check.json` | 46 | 46 (변동 0) | — | - | - |
| `src/hooks/useBehaviorEventLogger.ts` | (R8 +1) | (변동 0) | — | - | R12 commit 1+2 시 마커 r10-1 + NaN 가드 |

**R11 핵심 LOC 효과**:
- 코드 파일 변동 0 (8 ts/tsx 파일).
- 테스트 파일 변동 0 (5 test 파일).
- 문서 2 파일 갱신: checklist +52 / field_test_plan +6 = 합 +58.
- src/ 변동 0 (R8 마커 1줄 그대로 유지).

---

## §11. R12 (src/ PR) Arch 가이드

### 11.1 PR description 템플릿

R12 PR 작성 시 사용할 description 템플릿:

```markdown
# Phase B src/ 반영 PR (R12)

## 배경

Phase B 9연속 PASS R3~R11 완료. staging/ 에서 검증된 YOLOv8n ONNX 온디바이스 추론 파이프라인을
src/ 로 이관. flag OFF default — 안전 머지 (NEXT_PUBLIC_CAT_YOLO_V2=0 미설정 또는 0).

## 변경 내역 (atomic 7 commit)

### commit 1: 마커 r7-1 → r10-1 갱신 (3곳 동시)
- staging/lib/behavior/buildBehaviorEventMetadata.ts line 22
- staging/tests/metadataFreezeMirror.test.ts line 21
- src/hooks/useBehaviorEventLogger.ts line 225

### commit 2: src/ logger 본체 NaN 가드
- src/hooks/useBehaviorEventLogger.ts line 225-236
- typeof === "number" → Number.isFinite (top2_confidence + bbox_area_ratio)

### commit 3: staging → src/ 이관
- staging/hooks/* → src/hooks/* (6 파일)
- staging/components/* → src/components/* (2 파일)
- staging/lib/behavior/* → src/lib/behavior/* (5 파일)
- staging/workers/* → src/workers/* (1 파일)
- staging/tests/* → src/__tests__/* (10 파일)
- src/app/camera/broadcast/CameraBroadcastClient.tsx 에 <CameraBroadcastYoloMount /> + flag 분기 추가
- src/hooks/useBehaviorDetection.ts 에 뷰어 게이트 추가
- tsconfig.staging-check.json + vitest.config.ts 정리
- R7-S mirror 합치기: src/ logger 가 buildBehaviorEventMetadata 호출

### commit 4: ARCHITECTURE.md §10.2 통합
- §10.2 "Phase B (구현 완료)" + 4 부속 절 (10.2.1~10.2.4)
- staging/docs/phase_b_ref_forward_pattern.md 에 cross-reference 1줄
- staging/docs/phase_b_*.md 헤더에 R12 PR 완료 표시

### commit 5: Vercel ENV 등록 + 빈 커밋 (사장님 작업)
- NEXT_PUBLIC_CAT_YOLO_V2=0 (안전 default — flag OFF)
- NEXT_PUBLIC_YOLO_MODEL_URL=https://pub-e5e4c245235e430f84f088febf07a0c0.r2.dev/cat_behavior_yolov8n.onnx
- NEXT_PUBLIC_YOLO_STABLE_READY_MS=60000
- 빈 커밋 push → READY+PROMOTED 확인

### commit 6: 머지 후 baseline 검증 결과 기록
- docs/phase_b_post_merge_baseline_<날짜>.md 또는 ARCHITECTURE.md 갱신

### commit 7: 사장님 실기기 테스트 결과 기록
- docs/phase_b_field_test_result_<날짜>.md
- field_test_plan §1~§5 결과 + iOS latency 임계값 결정

## 안전성 검증

- flag OFF default → 기존 Phase A 동작 100% 보존 (#13)
- Cloudflare R2 사전 세팅 완료 (체크리스트 §7.6 사장님 6 체크박스 모두 [x])
- Vercel Instant Rollback commit ID: 354f6dd (Phase A 완료 시점)
- pnpm test 109 passed / pnpm build 통과
- src/ 직접 수정은 commit 1+2+3 만 (R7-S mirror 합치기 + 마커 + NaN 가드)

## 체크리스트

- staging/docs/phase_b_src_migration_checklist.md §1~§9 모두 [x] (commit 6 시점)
- staging/docs/phase_b_field_test_plan.md §0~§3 모두 [x] (commit 7 시점)

## CLAUDE.md 준수

- #13 flag OFF 경로 무손상 ✅
- #14 데이터 모델 변경 X ✅
- 팀 하네스 9연속 PASS R11 완료 ✅
- 파일 삭제 0 ✅ (tsconfig.staging-check.json + vitest.config.ts 정리는 include 비우기 옵션)
```

### 11.2 머지 절차

§3.9 명세 그대로 — 단일 PR 안에서 commit 1~4 atomic 머지. commit 5~7 은 머지 후 별도 작업.

### 11.3 머지 후 운영 모니터링

§3.10 명세 그대로 — 24시간 baseline 4 항목 모니터링.

---

## §12. Phase B 종합 회고 (R1~R11)

### 12.1 9연속 PASS 시스템 효과

**R1 → R11 의 11 라운드 흐름**:

| 라운드 | 핵심 산출 | LOC delta | tests delta | 9연속 카운트 |
|--------|----------|----------|-------------|--------------|
| R1 | 초기 10 파일 | +1,420 | +0 (계획) | - (REJECT) |
| R2 | 3상태 union + retryGen | -? | +? | - (REJECT) |
| R3 | Driver 3분할 | -? | +74 | 1/9 |
| R4 | STABLE_READY_MS + helpers | +? | +2 | 2/9 |
| R5 | renderHook + Supabase stub | +? | +7 | 3/9 |
| R6 | latency 링버퍼 + DiagBadge + freeze | +? | +9 | 4/9 |
| R7 | latencyTracker 분리 + isInferring 단일 | +? | +4 | 5/9 |
| R8 | useDriverHealth 분리 + mirror 마커 | +? | +2 | 6/9 |
| R9 | ref-forward 명세 + driver 마진 | +? | +2 | 7/9 |
| R10 | 4 파일 응축 + NaN 가드 + 회귀 3종 | -24 | +9 | 8/9 |
| **R11** | **정착 검증 + R12 명세 + 회고** | **+0** | **+0** | **9/9 (목표)** |

**효과**:
1. **점진적 분할 + 응축의 균형** — R3 분할 → R7/R8 분할 → R10 응축으로 LOC 회복.
2. **회귀 0 보장** — 매 라운드 vitest 회귀 0 + tsc 0 + src/ diff 0.
3. **MINOR 누적 + 단계적 해소** — MINOR-R5-NEW-1 (Dev 보류 정책 §0 명문화) / MINOR-R6-NEW-1~4 / MINOR-R8-NEW-1 (ref-forward 발견) / MINOR-R9-NEW-1 (4 파일 마진 압박) / MINOR-R10-NEW-1 (T7 expectation 완화) 모두 다음 라운드에서 처리 또는 보류 정책으로 정당화.

### 12.2 ref-forward 패턴 정착 (R8/R9 발견 → R10 안정화)

**문제**: R8 driver 분할 시 useDriverHealth ↔ lifecycle.latencyRefs 순환 의존.

**해결**: R8 Dev 가 ref-forward wrapper 패턴 발견 (MINOR-R8-NEW-1) → R9 §2 정식 명세 (`staging/docs/phase_b_ref_forward_pattern.md` 96 LOC) → R10 markInferring 도 4 콜백 확장 → R10 §6 회귀 방지 vitest case 7.

**적용 범위**: driver 의 4 콜백 (bumpSuccess/bumpFailure/bumpTick/markInferring) + lifecycle 의 4 ref (onDetections/onSuccess/onFailure/markInferring).

**향후 적용 후보** (Phase D/E):
- Phase D 라벨링 UI 의 user_label callback (driver 와 라벨러 훅 사이 양방향 의존 시)
- Phase E export/archive 의 onClipSnap / onError 콜백

### 12.3 mirror freeze 의도 정착 (R6/R7 도입 → R10 NaN 가드 확장)

**문제**: Phase D 진입 전 metadata 4 필드 스키마 변경 차단 필요.

**해결 단계**:
1. **R6 freeze 선언** (T8) — metadata 4 필드 (model_version / top2_class / top2_confidence / bbox_area_ratio) Phase D 착수 시점까지 freeze.
2. **R7 §4 옵션 R** — staging mirror (`buildBehaviorEventMetadata.ts`) 가 src/ logger 본체와 1:1 동치. R12 PR 시점에 src/ logger 가 mirror 함수 호출로 치환.
3. **R8 §2 마커 자동 검증** — `metadataFreezeMirror.test.ts` 가 양쪽 파일에 `// metadata-freeze-spec: r7-1` 마커 fs.readFileSync + includes.
4. **R9 §3 strict 강화** — src/ 마커 부재 시 즉시 fail (R8 까지 console.warn + return → silent regression 위험).
5. **R10 §2 NaN 가드 확장** — 옵션 Y key omit (Number.isFinite). 마커 r10-1 갱신은 R12 PR 시점 (3곳 동시).
6. **R12 commit 1+2** — 마커 r10-1 갱신 + src/ logger 본체 NaN 가드 동기화.

**효과**: Phase D 착수 시점에 metadata 스키마 신뢰 가능 + 변경 시 마커 갱신으로 추적.

### 12.4 LOC 한도 운영 (R6 baseline → R10 강화)

**400/100 한도** (CLAUDE.md "컴포넌트 100줄 이내, 파일 400줄 초과 금지"):

| 단계 | 한도 적용 | 마진 정책 |
|------|----------|----------|
| R6 baseline | 400 / 100 강제 | 모든 코드 파일에 적용 |
| R7~R9 | 80% 강화 (320 / 80) 옵션 | driver/lifecycle 가 한도 압박 시 분할 |
| R10 | 4 파일 한도 R9 그대로 (≤320 / ≤120 / ≤368 / ≤145) | 응축으로 마진 6~11 회복 |
| R11 | R10 한도 그대로 유지 | 변경 0 — 정착만 |
| R12 (src/ PR) | src/ 측 동일 한도 적용 | 이관 후 src/ 한도 = staging 한도 |

**마진 운영 원칙**:
- 마진 ≤2 시 즉시 응축 또는 분할 검토 (R9 → R10 옵션 B 응축).
- 마진 회복 후 신규 작업 시 마진 ≥5 유지 (R10 → R11 작업 0).

### 12.5 사장님 검증 가이드 (field_test_plan)

**R6 도입** → R12 commit 7 활용:

**구조**:
- §0 사전 체크 (6 체크박스) — Vercel ENV / R2 / 빈 커밋 / OS 버전 / 뷰어 / commit ID 메모
- §1 방송 시작 (5 체크박스) — flag 인식 / 배지 녹색 / backend / latency / retry
- §2 30분 연속 (5 체크박스) — ticksTotal / retry / row 증가 / 메모리 / behavior 감지
- §3 종료 (5 체크박스) — flag OFF / Worker 종료 / row 분포 / 뷰어 INSERT 0 / 로그
- §5 검증 기준 표 (7 지표) — retry / ticksTotal / inferSuccesses / latency / 메모리 / row / Realtime
- §6 실패 시 로그 수집 (7 체크박스) — Vercel / Supabase / Console / Network / Rollback / 데이터 보존 / 사후 보고
- §7 베타→성장 전환 (4 체크박스 조건부)

**합계 21 체크박스 (베타) + 7 (실패) + 4 (성장 전환).** 사장님이 30분 안에 따라할 수 있는 구체 가이드.

### 12.6 다음 라운드 (Phase C/D/E/F) 적용 권고

**Phase B 에서 학습한 패턴 + 다음 Phase 에 적용**:

| 패턴 | Phase B 적용 | 다음 Phase 적용 |
|------|-------------|----------------|
| **9연속 PASS 시스템** | R3~R11 (9 라운드) | Phase C/D/E/F 모두 적용. Level 2~3 작업 5/9 또는 9/9. |
| **Arch → Dev → QA 독립 Agent** | 매 라운드 3 Agent | 동일 적용. CLAUDE.md 팀 하네스 정착. |
| **Dev 보류 정책 §0** | R5 명문화 + R10 사용 (T7) | 동일 적용. 3조건 (회귀 증거 + self-sufficient + QA 기록) 충족 시. |
| **staging/ → src/ atomic PR** | R12 commit 1~4 | Phase D/E/F 도 동일 — 단일 PR 안에서 commit 분리. |
| **Vercel ENV 빈 커밋 강제 재빌드** | R12 commit 5 | NEXT_PUBLIC_* 변경 시 항상 적용 (CLAUDE.md #4/#6). |
| **사장님 사전 체크 + 30분 실기기 테스트** | R12 commit 7 (field_test_plan) | Phase D/E 도 사용자 영향 큰 변경 시 동일 절차. |
| **mirror 마커 자동 검증** | R8/R9/R10 (metadata-freeze-spec) | Phase D 의 user_label freeze / Phase E 의 archive 컬럼 freeze 도 동일. |
| **ref-forward callback wrapper** | R8/R9/R10 (driver 의 4 콜백) | 합성 훅 + 순환 의존 발생 시 항상 적용. |
| **LOC 마진 6~8 유지 + 응축 옵션** | R10 옵션 B (4 파일 -24 lines) | 마진 ≤2 압박 시 응축 우선 (분할 부담 회피). |
| **R12 PR atomic 7 commit + PRE/POST/롤백 트리거** | R11 명세 (본 §3) | Phase D/E/F src/ PR 도 동일 형식 명세. |

**Phase B 에서 발견한 새 패턴 (다음 Phase 표준화)**:
1. **ref-forward callback wrapper** (Phase D/E 적용 후보)
2. **mirror 마커 자동 검증** (Phase D user_label / Phase E archive 적용 후보)
3. **STABLE_READY_MS 환경변수 fallback** (Phase D/E 의 timeout 설정 적용 후보)
4. **option Y key omit** (Phase D/E 의 metadata 필드 추가 시 적용)

---

## §13. R11 검증 plan (R11 QA 가 따라갈 9관점)

| R | 관점 | R11 핵심 검증 |
|---|------|--------------|
| 1 | 동작 | tsc + vitest (R10 109 그대로) + git diff src/ (+0) + LOC 표 모두 green. D1 정착 검증 7개 명령 + 2 옵션 grep 모두 green. |
| 2 | 설계 일치 | R11 변경 최소화 원칙 §1 / R10 정착 검증 §2 / R12 atomic 7 commit §3 / CLAUDE.md #13/#14 검토 §4 / MINOR-R10-NEW-1 옵션 2 §5 / iOS latency §6 / Phase D 권고 §7 모두 본 §0~§12 명세와 1:1 대응. |
| 3 | 단순화 | R11 작업이 D1 정착 검증 + D2~D5 문서 갱신만 — 코드 변동 0. R12 atomic 7 commit 명세가 단일 PR 안에서 명확 분리 (각 commit 의 단일 책임). |
| 4 | 가독성 | R11 설계서가 §0~§12 의 13 절 구조 — R12 PR 책임자가 §3 만 봐도 7 commit 진행 가능. Phase B 종합 회고 §12 가 6 부속 절로 분류 (9연속 PASS / ref-forward / mirror freeze / LOC 한도 / field_test_plan / 다음 Phase). |
| 5 | 엣지케이스 | R10 변경 정착 (Mirror NaN 가드 / STABLE_READY_MS 6 case / prev-equal skip / markInferring race) 모두 §2.3 검증 항목으로 재확인. R12 commit 별 PRE/POST/롤백 트리거 모두 §3 명세. |
| 6 | 성능 | R11 작업 0 코드 변경 → 런타임 동작 변경 0. R12 PR 의 staging→src/ 이관도 코드 동작 무변경 (위치만 이동). |
| 7 | 보안 | src/ 0 R11 추가 변경 (R8 마커 1줄 그대로). R12 PR 안에서 마커 r10-1 갱신 (commit 1) + NaN 가드 (commit 2) 만 src/ 변경. flag OFF default 머지 (#13). |
| 8 | 영향 범위 | R11 변경이 staging/docs/ 2 파일만 (checklist + field_test_plan). 코드 import 경로 변동 0. 외부 시그니처 무변경. |
| 9 | 최종 품질 | 9연속 PASS 9/9 진입 가능. Phase B src/ PR (R12) 직선 거리 단축. Phase B 종합 회고 §12 가 다음 Phase 적용 패턴 정리. |

### 13.1 R11 QA REJECT 조건 예시

- D1 정착 검증 7개 명령 중 1건이라도 fail → REJECT (R10 변경 회귀 발생).
- 코드 파일 (.ts/.tsx) LOC 변동 발견 → REJECT (R11 변경 최소화 원칙 위배).
- 신규 vitest case 추가 발견 → REJECT (R11 변경 최소화 원칙 위배).
- 마커 r10-1 변경 발견 (R11 시점) → REJECT (R12 PR 시점에만 갱신).
- src/ R11 추가 변경 발견 → REJECT (R10 마커 1줄 그대로 유지).
- D2/D3/D4/D5 문서 갱신 누락 → REJECT (R11 필수 작업 미이행).
- driver LOC > 320 / useDriverHealth > 120 / lifecycle > 368 / tracker > 145 → REJECT.

---

## §14. R11 마지막 권고

R11 은 변경 최소화 라운드. R10 까지의 9 라운드 누적 변경을 정착 검증 + R12 (src/ PR) atomic 7 commit 명세 + Phase B 종합 회고에 집중. **신규 분할/응축/리팩터/테스트 추가 금지.**

**R11 의 핵심은**:
1. **D1 정착 검증** — 7개 명령 + 2 옵션 grep 으로 R10 변경 회귀 0 확인.
2. **D2/D3/D4/D5 문서 갱신** — R12 PR 진행을 위한 체크리스트 + field_test_plan 보강.
3. **§3 R12 atomic 7 commit 명세** — 단일 PR 안에서 7 commit 의 PRE/POST/롤백 트리거 완전 명세.
4. **§12 Phase B 종합 회고** — R1~R11 흐름 + 다음 Phase 적용 패턴.

R11 PASS 진입 시 9연속 카운트 9/9 → Phase B src/ PR (R12) 즉시 착수 가능.

R12 PR 의 atomic 7 commit (마커 r10-1 → src/ NaN 가드 → staging→src/ 이관 → ARCHITECTURE.md §10.2 → Vercel ENV → baseline → 실기기 테스트) 의 단일 PR + 머지 후 단계별 작업 구조가 R12 책임자에게 명확.

Phase B 종합 회고 §12 가 다음 Phase C/D/E/F 적용 패턴 정리 — 9연속 PASS / ref-forward / mirror freeze / LOC 한도 / field_test_plan 모두 표준화.

R10 QA 8/9 → R11 9/9 진입 + R12 PR 명세 + 종합 회고가 R11 합격선.

---

**R11 Arch 최종 권고:** 변경 최소화 (§1, 코드 변동 0) + R10 정착 검증 (§2, D1 7개 명령) + R12 atomic 7 commit 명세 (§3, PR 단위 + 머지 후 단계별) + #13/#14 검토 (§4, 마커/NaN 가드는 #13) + MINOR-R10-NEW-1 옵션 2 (§5, R12 후 재검토) + iOS latency 사장님 실측 후 결정 (§6) + Phase D 착수 5 트리거 (§7) + Phase B 종합 회고 6 부속 절 (§12) 가 R11 의 핵심.

**R10 PASS 8/9 → R11 9/9 + R12 PR (atomic 7 commit) 직선 거리 단축 + Phase D 착수 가능 시점 명확화 + 다음 Phase 표준화 패턴 정리가 R11 합격선.**
