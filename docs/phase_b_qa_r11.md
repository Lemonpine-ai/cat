# Phase B QA R11 결과 — 마지막 라운드

> 작성: 3번 QA Agent (R11, 독립 실행, 이전 대화 맥락 없음)
> 작성일: 2026-04-24
> 대상: Phase B R11 Dev 산출물 (R11 Arch §8 D1~D5) — 마지막 라운드, R12 PR 직전 검증
> 기준: `docs/phase_b_arch_r11.md` (1,348 LOC §0~§14) + `docs/phase_b_qa_r10.md` (PASS 8/9 + R11 권고 6건 + MINOR-R10-NEW-1) + `docs/phase_b_fork_checkpoint_2026-04-24.md` + `staging/docs/phase_b_src_migration_checklist.md` (597 LOC) + `staging/docs/phase_b_field_test_plan.md` (180 LOC) + `CLAUDE.md` (#13/#14)

---

## 최종 판정: **PASS**

**9연속 PASS 카운트 9/9 달성 — Phase B src/ 반영 PR (R12) 즉시 착수 가능.**

R11 Arch §8 D1~D5 5건 **전원 이행 확인.** R11 = 변경 최소화 라운드 — 코드 파일 변동 0 / 테스트 추가 0 / 응축·분할·리팩터 0 / 마커 r10-1 변경 0. Dev 가 권한 거부로 미실측한 D1 7개 명령 + 추가 grep 모두 R11 QA 가 직접 실행 — 7축 모두 green (tsc exit 0 / vitest 10 files **109 passed** / src/ +1 line (R8 T5 마커만, R11 추가 0) / 4 코드 파일 LOC 모두 R10 한도 그대로 유지 마진 6~11 정착 / field_test_plan = 180 LOC (한도 ≤180 정확 충족) / 양쪽 마커 grep r7-1 5건 일치 (r10-1 0건 — R12 PR 시점 갱신 보류 정확) / NaN 가드 4건 정착 (mirror 본체 line 41+44 + lifecycle line 50 + tracker line 79) / typeof 잔존 0건 / ref-forward 4 ref + ref 동기화 4건 정착). 신규 REJECT 0, 신규 MINOR 1건 (MINOR-R11-NEW-1 — §9.2 DO 의 src/ logger 헤더 주석 (line 222-224) 동기 갱신 명시 누락, R12 PR 단계 흡수 권고 수준).

**핵심 PASS 근거 5:**

1. **D1 정착 검증 7+3 명령 모두 green — R10 변경 회귀 0 확인.** 실측 (R11 QA 직접 실행, Dev 권한 거부 보강): tsc exit 0 / vitest 109 passed / git diff stat src/ = `src/hooks/useBehaviorEventLogger.ts | 1 +` (R8 T5 마커만, R11 추가 0) / git diff full = `+ // metadata-freeze-spec: r7-1` 1줄 / wc -l 4 코드 파일 모두 한도 통과 (driver=313 마진 7 / useDriverHealth=112 마진 8 / lifecycle=357 마진 11 / tracker=139 마진 6 — R10 그대로) / mirror 마커 grep r7-1 5건 일치 (mirror line 13 헤더 + line 22 마커 + src logger line 225 마커 + mirror.test line 7 헤더 + line 21 MARKER 상수, r10-1 0건 — R12 PR 시점 갱신 보류 정확) / Number.isFinite grep 4건 (mirror line 41 top2_confidence + line 44 bbox_area_ratio + lifecycle line 50 STABLE_READY_MS + tracker line 79 recordResult delta) / typeof === "number" 잔존 grep 0건 (mirror 본체) / ref-forward 4 ref grep 4건 (driver line 199-202 bumpSuccessRef/bumpFailureRef/bumpTickRef/markInferringRef) + ref 동기화 4건 (driver line 230-233). driver useState grep 3건 (currentBehavior/lastDetections/avgConfidence) — isInferring useState 0건 R10 정착 그대로.

2. **D2 R12 PR 사전 검증 3 체크박스 정확 추가 (체크리스트 §1.1 line 59/62/65).** ① line 59-61 "(R11 D2 / R12 PR 사전 검증) Vercel MCP getDeployments → readyState READY + readySubstate PROMOTED + buildError 0건 인지 PR 머지 직전 최종 확인" — CLAUDE.md 교훈 #4 재발 방지. ② line 62-64 "curl -I -H Origin https://whatnyan.com $NEXT_PUBLIC_YOLO_MODEL_URL → HTTP/2 200 + CORS 헤더 (Access-Control-Allow-Origin + Vary: Origin) 동시 확인" — R2 CORS 정책 변경 가능성 차단. ③ line 65-67 "R12 PR 머지 commit ID(40자) 별도 메모 — '이전 PROMOTED commit' 과 두 줄 분리 기록" — Instant Rollback 타겟. 모두 Arch §3.6/§3.9 명세 1:1 일치.

3. **D3 field_test_plan §0 0-7 정확 추가 (line 32-36, LOC 180 한도 정확 충족).** 신규 0-7 체크박스 본문: "(R11 D3) 본 테스트 직전 2건: ① R12 머지 commit ID(40자) 메모 (0-6 '이전 PROMOTED' 와 별개 기록 — Instant Rollback 대상). ② curl -I -H 'Origin: https://whatnyan.com' $NEXT_PUBLIC_YOLO_MODEL_URL → HTTP/2 200 + Access-Control-Allow-Origin: https://whatnyan.com + Vary: Origin 3건. 0-2 는 vercel Origin → 0-7 은 정식 도메인 마지막 재확인". 헤더 line 14 "다음 7개 항목" + line 15 "R11 D3 추가: 0-7 — R12 PR atomic 7 commit 직후" + line 180 "R11 D3: §0 0-7 R12 PR commit ID + R2 CORS 마지막 확인 1개 추가" 모두 명시. **LOC = 180 (한도 ≤180 정확 충족, 마진 0)** — Arch §0.4 예측 +6 LOC 일치.

4. **D4 §9 R12 atomic 7 commit 체크리스트 신설 정확 (line 491-597, +106 LOC).** 9 절 구조: §9.1 commit 1 (마커 r7-1→r10-1 3곳 동시) / §9.2 commit 2 (src/ logger NaN 가드) / §9.3 commit 3 (staging→src/ 이관 + R7-S 합치기) / §9.4 commit 4 (ARCHITECTURE.md §10.2 통합) / §9.5 commit 5 (Vercel ENV — 사장님) / §9.6 commit 6 (baseline 기록) / §9.7 commit 7 (사장님 실기기 테스트) / §9.8 머지 절차 (단일 PR + merge 권고 squash 금지) / §9.9 24시간 운영 모니터링 (4 항목). 각 commit 별 PRE/DO/POST/롤백 트리거 4 단계 명세 일관. Arch §3.1~§3.10 1:1 매핑 + R12 PR 책임자가 §9 만 봐도 진행 가능. **단 D4 LOC delta 가 Arch 예측 +52 보다 큰 +106 → §9 가 자세함 (PRE/DO/POST/롤백 4 단계 × 7 commit = 28 영역 + §9.8/§9.9 머지+모니터링) 정당.** 단순화 측면에서 작아도 무방하나 R12 PR 책임자 안전망 강화로 가독성 우선.

5. **D5 MINOR-R10-NEW-1 R12 PR 후 재검토 체크박스 정확 (체크리스트 §1.4 line 103-109).** "(R11 D5 / MINOR-R10-NEW-1 / R12 PR 후 재검토) T7 (yoloLatencyTracker prev-equal skip) case 5 expectation 완화 ('= 0' → '≤ 1') 의 React 19 prod 빌드 환경 동작 확정. R12 PR 머지 + commit 7 사장님 실기기 테스트 후 React 19 prod commit 동작 실측 시점에 재검토. 옵션: · '정확히 1회 발생' 확인 시 → expect(renderCount - rendersAfterFirstFlush).toBe(1) 정확값 검증 / · '0~1회 변동' 확인 시 → 현 ≤1 명세 유지 + 코드 주석에 React 19 환경 명시. 참조: docs/phase_b_qa_r10.md MINOR-R10-NEW-1 / docs/phase_b_arch_r11.md §5". Arch §5.1 옵션 2 (R12 PR 후 재검토) 명세와 1:1 일치.

**MINOR 1건 (R12 PR 단계 흡수):**
- **MINOR-R11-NEW-1** (§9.2 DO 의 src/ logger 헤더 주석 동기 갱신 명시 누락): R10 QA `R11 신규 점검 권고 #3` 에 명시된 "src/ logger 의 NaN 가드 변경 시 line 225 의 `// Phase A: metadata JSONB 적재 ...` 헤더 주석도 동기 갱신 (mirror 의 R10 §2 주석 line 40 과 일치)" 가 §9.2 DO 본문에 명시적으로 누락. §9.2 DO 의 "mirror 와 1:1 동치 유지" 표현 안에 헤더 주석 동기화도 자연 포함된다고 해석 가능하나 명시적 체크박스 부재. **판정**: PASS 차단 사유 아님 — R12 PR 작업 시점에 commit 2 안에서 처리 가능 (별도 R 라운드 불필요). R12 PR 책임자가 commit 2 진행 시 line 222-224 의 3 줄 헤더 주석 (`// Phase A: metadata JSONB 적재 ...` / `// - undefined 키는 명시적으로 제외 ...` / `// - model_version 은 항상 채움 ...`) 을 mirror 의 line 40 (`// R10 §2: NaN/Infinity 시 key omit — JSONB INSERT 안전 + Phase D/E 통계 의미 명확.`) 와 1:1 동치 유지하도록 갱신.

---

## 실측 결과 (R11 QA Bash 권한 직접 실행 — 8개 명령 + 보강 grep, Dev 미실측 3건 보강)

| # | 명령 | 결과 | 판정 |
|---|------|------|------|
| 1 | `npx tsc --noEmit -p tsconfig.staging-check.json` | exit 0 (no output) | ✅ |
| 2 | `npx vitest run` | 10 files / **109 passed** / 2.07s | ✅ |
| 3 | `git diff --stat src/` | `src/hooks/useBehaviorEventLogger.ts \| 1 +` (R8 T5 마커 1줄만) | ✅ |
| 4 | `git diff src/` | `+ // metadata-freeze-spec: r7-1` 1줄 (R11 추가 변경 0) | ✅ |
| 5 | `wc -l staging/...` | driver=313 / useDriverHealth=112 / lifecycle=357 / tracker=139 / mirror=48 / metadataFreeze.test=146 / mirror.test=52 / tracker.test=177 / lifecycle.test=574 / renderHook.test=340 / **field_test_plan=180 (한도 정확)** / **checklist=597 (R10 468 → R11 +129)** | ✅ |
| 6 | `grep "metadata-freeze-spec"` 양쪽 + 테스트 | mirror=2건 (line 13 헤더 + line 22 마커, r7-1) + src/ logger=1건 (line 225 마커, r7-1) + mirror.test=2건 (line 7 헤더 + line 21 MARKER 상수, r7-1) — 5건 r7-1 양쪽 일치, **r10-1 0건 (R12 PR 시점 갱신 보류 정확)** | ✅ |
| 7 | `grep "Number.isFinite"` 가드 | mirror=2건 (line 41 top2_confidence + line 44 bbox_area_ratio) + lifecycle=1건 (line 50 STABLE_READY_MS) + tracker=1건 (line 79 recordResult delta) — **4건 정확 적용** | ✅ |
| 8 | `grep 'typeof.*=== "number"'` mirror | 0건 (mirror 본체 잔존 0) | ✅ |
| 보강-A | `grep "useRef<.*=> .*>.*=> {}"` driver | 4건 (line 199-202 bumpSuccessRef/bumpFailureRef/bumpTickRef/markInferringRef) | ✅ |
| 보강-B | `grep "markInferringRef\|bumpSuccessRef\|bumpFailureRef\|bumpTickRef"` | 4 ref 선언 (line 199-202) + 4 ref 동기화 (line 230-233) + 4 콜백 wrapper (line 203-210) = 12건 정착 | ✅ |
| 보강-C | `grep "useState"` driver | useState import (line 14) + 3 useState 호출 (line 94/95/96 — currentBehavior/lastDetections/avgConfidence) — **isInferring useState 0건 (R9 §1 흡수 R10 유지 R11 정착)** | ✅ |
| 보강-D | `grep "STABLE_READY_MS"` lifecycle + lifecycle.test | lifecycle 8건 (헤더 R9 §6 명시 + IIFE 2줄 + 본문 6 위치 + 1 명세) + lifecycle.test 14건 (R10 §5 describe + ORIG_ENV + loadLifecycleWithEnv helper + 6 case + 기존 224/262/272/339) — IIFE 응축 + 6 case 정착 | ✅ |
| 보강-E | `grep "^## §9"` checklist | line 491 `## §9 R12 PR atomic 7 commit 체크리스트 (R11 D4 신설 — Arch §3.1~§3.10)` — D4 신설 확인 | ✅ |
| 보강-F | `grep "0-7\|§0"` field_test_plan | line 15 헤더 보강 + line 32 0-7 체크박스 + line 179-180 합계 안내 — D3 추가 확인 | ✅ |
| 보강-G | `grep "R11 D2\|R11 D5"` checklist | line 59 + 62 + 65 (D2 3건) + line 103 (D5 1건) + line 159 (D2 진행 안내 1건) — 5건 정확 위치 | ✅ |

**vitest 파일별 분포 (R10 그대로 정착, R11 변동 0):**

| 파일 | R10 tests | R11 tests | delta |
|------|-----------|-----------|-------|
| confirmFrames.test.ts | 13 | 13 | 0 |
| maxDurationGuard.test.ts | 7 | 7 | 0 |
| metadataFreeze.test.ts | 9 | 9 | 0 |
| metadataFreezeMirror.test.ts | 2 | 2 | 0 (마커 r7-1 유지) |
| broadcasterYoloDriver.test.ts | 20 | 20 | 0 |
| inferenceScheduler.parity.test.ts | 23 | 23 | 0 |
| yoloLatencyTracker.test.ts | 5 | 5 | 0 |
| yoloSampling.test.ts | 5 | 5 | 0 |
| yoloWorkerLifecycle.test.ts | 17 | 17 | 0 |
| broadcasterYoloDriver.renderHook.test.ts | 8 | 8 | 0 |
| **합계** | **109** | **109** | **0 net (R11 변경 최소화 정확)** |

R11 변경 최소화 원칙 준수 — 신규 vitest case 0, 회귀 0.

---

## 파일 LOC 표 (R10 정착 그대로 유지 검증, wc -l 직접 실측)

| 파일 | R10 LOC | R11 실측 | R11 한도 | R11 마진 | 판정 |
|------|--------|---------|---------|---------|------|
| `useBroadcasterYoloDriver.ts` | 313 | **313 (변동 0)** | ≤320 | 7 | ✅ R10 정착 |
| `useDriverHealth.ts` | 112 | **112 (변동 0)** | ≤120 | 8 | ✅ R10 정착 |
| `useYoloWorkerLifecycle.ts` | 357 | **357 (변동 0)** | ≤368 | 11 | ✅ R10 정착 |
| `useYoloLatencyTracker.ts` | 139 | **139 (변동 0)** | ≤145 | 6 | ✅ R10 정착 |
| `useYoloSampling.ts` | 235 | 235 | ≤350 | 115 | ✅ 변동 없음 |
| `YoloDriverDiagBadge.tsx` | 98 | 98 | 100 | 2 | ✅ 변동 없음 |
| `CameraBroadcastYoloMount.tsx` | 89 | 89 | 100 | 11 | ✅ 변동 없음 |
| `buildBehaviorEventMetadata.ts` | 48 | 48 | 350 | 302 | ✅ 변동 없음 (마커 r7-1 유지) |
| `metadataFreeze.test.ts` | 146 | 146 | — | - | ✅ 변동 없음 |
| `metadataFreezeMirror.test.ts` | 52 | 52 | ≤55 | 3 | ✅ 마커 r7-1 유지 |
| `yoloLatencyTracker.test.ts` | 177 | 177 | — | - | ✅ 변동 없음 |
| `yoloWorkerLifecycle.test.ts` | 574 | 574 | — | - | ✅ 변동 없음 |
| `broadcasterYoloDriver.renderHook.test.ts` | 340 | 340 | — | - | ✅ 변동 없음 |
| `phase_b_src_migration_checklist.md` | 468 | **597 (+129)** | — | - | ✅ D2 +9 / D5 +7 / D4 §9 신설 +106 / 기타 정리 +7 |
| `phase_b_field_test_plan.md` | 174 | **180 (+6)** | **≤180** | **0** | ✅ D3 정확 +6 한도 정확 충족 |
| `phase_b_ref_forward_pattern.md` | 96 | 96 | — | - | ✅ R12 PR 시점 ARCHITECTURE.md §10.2.2 흡수 |
| `vitest.config.ts` | 56 | 56 | — | - | ✅ 변동 없음 |
| `tsconfig.staging-check.json` | 46 | 46 | — | - | ✅ 변동 없음 |
| `src/hooks/useBehaviorEventLogger.ts` | (R8 +1) | (변동 0) | — | - | ✅ R11 src/ 무수정 (R8 마커 1줄 그대로) |

**R11 LOC 효과 합계:**
- 코드 파일 변동 0 (8 ts/tsx 파일) — R11 변경 최소화 원칙 정확 준수.
- 테스트 파일 변동 0 (5 test 파일) — vitest 109 그대로.
- 문서 2 파일 갱신: checklist +129 (D2+D4+D5) / field_test_plan +6 (D3) = 합 +135 LOC.
- src/ 변동 0 (R8 마커 1줄 그대로 유지 — R11 추가 변경 0).
- field_test_plan **180 LOC = 한도 정확 충족 (마진 0)** — R11 D3 +6 가 한도 압박 발생, R12 PR 후 추가 보강 필요 시 별도 라운드.

**핵심**: R10 의 4 파일 마진 6/8/11/6 정착 + R11 신규 변경 0 + 문서 2 파일만 갱신.

---

## R11 Arch §8 D1~D5 검증

| ID | 출처 | 항목 | 검증 증거 | 판정 |
|----|------|------|-----------|------|
| **D1** | §2.2/§2.3 | R10 변경 정착 검증 — 7개 명령 + 2 옵션 grep + 회귀 0 | tsc 0 / vitest 109 / git diff src/ 1 line / wc -l 4 코드 한도 통과 + field_test_plan 180 한도 정확 / 마커 r7-1 5건 일치 / NaN 가드 4건 / typeof 잔존 0 / ref-forward 4 ref + 4 ref 동기화. **Dev 가 권한 거부로 미실측 3건 (tsc/vitest/git diff) — R11 QA 직접 실행 보강 완료.** | ✅ |
| **D2** | §3.6/§3.9 | 체크리스트 §1.1 + §3 영역에 R12 PR 사전 검증 3 체크박스 추가 | line 59-67 (§1.1 영역) 3 체크박스 정확 추가 — Vercel READY+PROMOTED + buildError 0건 + R2 CORS curl + R12 머지 commit ID 별도 메모. line 159-161 (§3 영역) "위 3건은 R12 PR atomic 7 commit 으로 분리 진행 — §9 commit 1+2+4 참조" 진행 안내 1건 추가. grep "R12 PR" 결과 다수. | ✅ |
| **D3** | §3.8 | field_test_plan §0 영역에 0-7 체크박스 추가 + LOC ≤180 | line 32-36 0-7 체크박스 정확 추가 — R12 머지 commit ID(40자) 메모 + R2 CORS 마지막 확인 (whatnyan.com Origin). line 14-15 헤더 보강 ("다음 7개 항목" + R11 D3 명시). line 180 합계 안내 갱신. **LOC = 180 (한도 ≤180 정확 충족, 마진 0)** — Arch §0.4 예측 +6 정확. | ✅ |
| **D4** | §3.1~§3.10 | 체크리스트 끝부분에 §9 신설 — R12 atomic 7 commit 체크리스트 (각 commit PRE/POST/롤백 트리거 + 머지 절차 + 운영 모니터링) | line 491-597 §9 신설 +106 LOC. 9 부속 절: §9.1 commit 1 (마커 r7-1→r10-1) / §9.2 commit 2 (NaN 가드) / §9.3 commit 3 (이관 + R7-S 합치기) / §9.4 commit 4 (ARCHITECTURE.md §10.2) / §9.5 commit 5 (Vercel ENV 사장님 작업) / §9.6 commit 6 (baseline) / §9.7 commit 7 (실기기 테스트) / §9.8 머지 절차 (merge 권고 squash 금지) / §9.9 24시간 운영 모니터링. 각 commit PRE/DO/POST/롤백 4 단계 명세. Arch §3.1~§3.10 1:1 매핑. | ✅ |
| **D5** | §5.2 | 체크리스트 §1 영역에 MINOR-R10-NEW-1 R12 PR 후 재검토 1 체크박스 추가 | line 103-109 (§1.4 영역) 정확 추가 — T7 case 5 expectation 완화의 React 19 prod 동작 확정 / R12 PR 머지 + commit 7 사장님 실기기 후 React 19 prod commit 실측 / 옵션 1 정확값 검증 / 옵션 2 ≤1 명세 유지 + 주석 명시. Arch §5.1 옵션 2 (R12 PR 후 재검토) 명세 1:1 일치. | ✅ |

**D1~D5 5건 전원 이행.** R11 = 변경 최소화 라운드 명세 (코드 변동 0 / 테스트 추가 0 / 응축·분할·리팩터 0 / 마커 r10-1 변경 0) 정확 준수.

---

## R10 QA 힌트 재판정 (R11 권고 6건 → R11 처리 매핑)

R10 QA `docs/phase_b_qa_r10.md` `## R11 에 남길 힌트` 권고 6건의 R11 처리 매핑:

| # | R10 QA 권고 | R11 처리 | 검증 |
|---|-----------|---------|------|
| 1 | R10 변경 정착 검증 (필수) | D1 7개 명령 + 보강 grep | ✅ R11 QA 직접 실측 — 회귀 0 |
| 2 | MINOR-R10-NEW-1 R5 검토 (선택) | D5 R12 PR 후 재검토 체크박스 (체크리스트 §1.4) | ✅ Arch §5.1 옵션 2 채택 (R11 변경 최소화) |
| 3 | R11 src/ PR 직전 atomic 작업 묶음 10건 최종 점검 (필수) | D2 + D4 (체크리스트 §1.1 3 체크박스 + §9 7 commit) | ✅ §9 가 R12 PR 진행 가이드 |
| 4 | iOS 실기기 latency P95 임계값 결정 (R11-A) | D3 (field_test_plan §0 0-7 체크박스) + Arch §6.1 (R12 commit 7 후 결정) | ✅ §0 0-7 + Arch §6.1 |
| 5 | driver 추가 마진 (R11-C) | (작업 0 — 변경 최소화) | ✅ R11 보류 (마진 7 충분) |
| 6 | 마커 r7-1 → r10-1 갱신 시 mirror + src + mirror.test 3 곳 동시 (필수) | D4 §9.1 commit 1 명세 (3 파일 동시 단일 commit) | ✅ §9.1 PRE/DO/POST/롤백 4 단계 |

R10 QA 권고 6건 모두 R11 에서 처리 또는 보류 정책으로 정당화. **R11 신규 점검 권고 #3** (src/ logger 헤더 주석 동기 갱신) 만 §9.2 DO 명시 누락 — MINOR-R11-NEW-1 (R12 PR 단계 흡수 권고).

---

## D2~D5 문서 갱신 검증 (§9 7 commit 명세 안전성)

### 1. §9.1 commit 1 (마커 r7-1 → r10-1 3곳 동시)

**의도**: R10 §2 NaN 가드 추가에 따른 spec 변경 표시. 마커 변경 = "이 코드는 r10-1 약속 따른다" 선언.

**3 파일 동시**:
- `staging/lib/behavior/buildBehaviorEventMetadata.ts` line 22
- `staging/tests/metadataFreezeMirror.test.ts` line 21 (MARKER 상수)
- `src/hooks/useBehaviorEventLogger.ts` line 225

**안전망 검증**:
- PRE: R11 PASS 9/9 + git diff src/ 1 line + 새 branch — **명확**
- DO: 3 파일 동시 단일 commit — **atomic**
- POST: grep r10-1 3건 / r7-1 0건 / mirror.test PASS — **자동 검증 메커니즘**
- 롤백: 3 파일 중 1건 r7-1 잔존 → mirror.test it 2 strict fail → CI 차단 → revert HEAD — **즉시 회복 경로**

**시뮬레이션 결과 — commit 1 단독 fail 시**:
- 3 파일 중 1건만 갱신 → mirror.test MARKER (r10-1) ≠ 미갱신 파일 마커 (r7-1) → it 2 strict fail (R9 §3) → CI 차단. → revert HEAD 1 commit. **안전.**

### 2. §9.2 commit 2 (src/ logger NaN 가드)

**의도**: src/ logger 본체를 mirror 와 1:1 동치 — Number.isFinite + key omit.

**안전망 검증**:
- PRE: commit 1 완료 + diff src/logger 마커 1줄 — **명확**
- DO: line 225-236 metadata 블록 typeof → Number.isFinite (top2_confidence + bbox_area_ratio 2건) — **mirror 1:1 동치**
- POST: grep typeof === "number" 0건 / Number.isFinite 2건 / vitest 109 / pnpm build 통과 — **자동 검증**
- 롤백: vitest fail (mirror 동치 깨짐) 또는 pnpm build TS 에러 → revert HEAD — **즉시 회복**

**MINOR-R11-NEW-1 발견**: §9.2 DO 본문에 "mirror 와 1:1 동치 유지" 만 명시 — src/ logger line 222-224 의 3 줄 헤더 주석 (`// Phase A: metadata JSONB 적재 ...` / `// - undefined 키는 명시적으로 제외 ...` / `// - model_version 은 항상 채움 ...`) 을 mirror line 40 (`// R10 §2: NaN/Infinity 시 key omit — JSONB INSERT 안전 + Phase D/E 통계 의미 명확.`) 와 동기 갱신 명시 누락. R10 QA 가 R11 신규 점검 권고 #3 에 명시한 사항. → R12 PR 책임자가 commit 2 진행 시 헤더 주석 동기 갱신 자율 판단 필요. PASS 차단 사유 아님 (체크리스트 안 "1:1 동치" 표현이 함의).

### 3. §9.3 commit 3 (staging → src/ 이관 + R7-S 합치기)

**의도**: staging/ 코드 일괄 src/ 이전 + R7-S mirror 합치기 (logger 가 buildBehaviorEventMetadata 호출).

**안전망 검증**:
- PRE: commit 1+2 완료 + 모든 staging 파일 R10 PASS — **명확**
- DO: hooks/components/lib/workers/tests 일괄 이전 + import 경로 재작성 + tsconfig + vitest 정리 + Mount + 뷰어 게이트 추가 — **atomic 단위 명확**
- POST: pnpm build/test PASS + find staging 0건 + grep "from \"./staging/" src/ 0건 — **자동 검증**
- 롤백: build/test fail → 해당 파일만 fix-up commit (commit revert 가 아님) / 회복 불능 시 commit 3 통째 revert + 단계 분할 — **단계적 회복**

**검토**: §9.3 의 fix-up commit 권고가 atomic PR 원칙과 충돌하지 않는가? PR 안 commit 3 작업 진행 중 fix-up 은 **PR push 전** 단계. PR push 후 fail 시는 commit 3 통째 revert 가 정확. 명세 안전.

### 4. §9.4 commit 4 (ARCHITECTURE.md §10.2 통합)

**의도**: ref_forward_pattern.md 본문을 ARCHITECTURE.md §10.2.2 로 흡수 + 4 부속 절 신설.

**안전망 검증**:
- PRE: commit 1~3 완료 + 현 §10.2 "Phase B (계획)" 1 단락만 — **명확**
- DO: §10.2 → "구현 완료" + 10.2.1~10.2.4 + cross-reference + R12 완료 표시 — **명확**
- POST: grep 4 부속 절 + staging/docs 3 .md 보존 — **자동 검증**
- 롤백: Markdown 깨짐 → revert / 삭제 시도 발견 → CLAUDE.md 위반 보고 — **방어**

### 5. §9.5 commit 5 (Vercel ENV — 사장님 작업, 머지 후)

**의도**: 머지 후 Vercel ENV 3개 등록 + 빈 커밋 강제 재빌드.

**안전망 검증**:
- PRE: commit 1~4 PR 머지 완료 + Cloudflare R2 §7.6 6 체크박스 모두 [x] — **명확**
- DO: ENV 3개 (NEXT_PUBLIC_CAT_YOLO_V2=0 안전 default + URL + STABLE_READY_MS) + 빈 커밋 push — **CLAUDE.md 교훈 #6**
- POST: getEnvVar 3건 / getDeployments READY+PROMOTED / console flag=0 — **3축 자동 검증**
- 롤백: ENV 누락 → 빈 커밋 재시도 / 배포 fail → Instant Rollback (5초) — **즉시 회복**

**보안 검증**: `NEXT_PUBLIC_CAT_YOLO_V2=0` (안전 default) — flag OFF 머지 시 기존 Phase A 동작 100% 보존. Vercel Instant Rollback commit ID 메모 절차 §1.1 + §9.1 PRE 양쪽 명시. **#13 무손상 정확.**

### 6. §9.6 commit 6 (baseline 기록)

**의도**: 머지 + 배포 직후 baseline 측정 (row 4건 + Pool + 콘솔 + Vercel 상태).

**안전망 검증**:
- PRE: commit 5 완료 + 머지 직후 30분 이내 — **명확**
- DO: docs/phase_b_post_merge_baseline_<날짜>.md 신규 — **위치 명확**
- POST: row 합계 < 1000 (CLAUDE.md 교훈 #12) + Pool < 60% — **자동 검증**
- 롤백: row > 1000 → 누수 의심 → flag OFF 유지 + 조사 / Pool > 60% → flag OFF + Pro 검토 (교훈 #7) — **사장님 의사결정 트리**

### 7. §9.7 commit 7 (사장님 실기기 테스트)

**의도**: 24시간 baseline 무이상 → flag ON 30분 테스트 → flag OFF 복귀 → 결과 기록.

**안전망 검증**:
- PRE: commit 6 의 24시간 baseline 무이상 + field_test_plan §0 7 체크박스 통과 (R11 D3 0-7 포함) — **명확**
- DO: flag ON → §1~§3 의 15 체크박스 → §5 7 지표 → iOS latency 결정 → flag OFF 복귀 → 결과 문서 작성 — **사장님 가이드 명확**
- POST: 7 지표 PASS + Phase D 착수 결론 — **명확**
- 롤백: 임계값 1건 미달 → §6 로그 수집 7 체크박스 → flag OFF (5초) — **즉시 회복**

### 8. §9.8 머지 절차

**의도**: 단일 PR + 4 commit (1~4) atomic + merge 권고 (squash 금지).

**검증**: PR description 6 항목 명시 (Phase B 9연속 PASS / flag OFF default / §9 commit 1~4 / Instant Rollback 354f6dd / R2 §7.6 모두 [x] / pnpm test 109 + build 통과). **squash 금지 권고 정확** — atomic 단위 보존 (commit revert 가능).

### 9. §9.9 24시간 운영 모니터링

**의도**: row 6h / Pool 12h / Vercel 에러 12h / 사용자 보고 수시 → 24h 무이상 → commit 7.

**검증**: 4 항목 모두 임계값 명시 + Supabase MCP / Vercel MCP 호출 명시. **운영 가이드 명확.**

---

### commit 순서 의존성 검증

**시뮬레이션 1: commit 1 (마커) 보다 commit 2 (NaN 가드) 가 먼저 가면?**
- src/ logger NaN 가드만 변경 → 마커는 r7-1 그대로 → mirror.test PASS (마커는 양쪽 r7-1 일치)
- 단 commit 2 의 의도 ("r10-1 약속 따른다 선언") 무효 → spec 변경 표시 누락
- **회복**: 다음 commit 으로 commit 1 수행 → 정상화. **CI 차단 X.**
- **결론**: 강제 의존성 X. 단 §9.1/§9.2 순서 명세는 "마커가 spec 변경 선언" 의미적 이유 정당.

**시뮬레이션 2: commit 1 단독 진행, commit 2 누락 시?**
- 마커는 r10-1 (3 파일 일치) — mirror.test PASS
- src/ logger 본체는 typeof 그대로 — mirror 본체와 동치 깨짐 (mirror 만 NaN 가드 추가)
- **회복**: commit 2 수행 → 정상화. **mirror.test 는 본체 동치 검증 X — silent regression 가능.**
- **명세 보강 검토**: §9.2 POST 의 `grep -n 'typeof.*=== "number"' src/hooks/useBehaviorEventLogger.ts` 0건 검증이 본체 동치 확인 — 안전망. PR description 안 commit 1+2 동시 진행 책임자 자각 필요.

**시뮬레이션 3: commit 3 (이관) 만 진행, commit 1+2 누락 시?**
- staging→src/ 이관 + R7-S mirror 합치기 (src/ logger 가 buildBehaviorEventMetadata 호출)
- mirror 는 NaN 가드 + 마커 r7-1 그대로 — src/ logger 가 mirror 호출이므로 자연스럽게 NaN 가드 적용 + 마커 r7-1
- mirror.test 는 양쪽 r7-1 일치 → PASS
- 단 commit 1 의 r10-1 갱신 의도 무효
- **회복**: commit 1 수행 (이관 후 mirror 가 src/lib/behavior/ 에 있음) → 마커 r10-1 (mirror + mirror.test MARKER 상수 — src/ logger 는 mirror 호출이라 마커 무) → mirror.test 검증 대상 변경 필요 (src/ logger 가 import 한 mirror 의 마커 검증으로). **검증 메커니즘 변경 부담**.
- **결론**: §9.2 명세가 정확 — commit 1+2 가 commit 3 의 R7-S 합치기 전에 처리. R7-S 후에는 commit 1+2 의미 변경. 순서 명세 정당.

**시뮬레이션 4: commit 5 (Vercel ENV) 누락 시?**
- 머지 완료 + ENV 3개 미등록 → flag 분기 동작 안 함 (NEXT_PUBLIC_CAT_YOLO_V2 undefined → false → flag OFF 동작 — 안전)
- 단 commit 7 의 flag ON 토글 시점에 ENV=0 부재 → 빈 커밋 후 ENV 등록 필요
- **회복**: §9.5 의 ENV 등록 + 빈 커밋 절차 — Vercel MCP getEnvVar 3건 / getDeployments READY+PROMOTED 검증
- **명세 보강 검토**: §9.5 의 PRE 가 "commit 1~4 PR 머지 완료" 만 — Cloudflare R2 §7.6 6 체크박스 명시. ENV 미등록 시 자동 감지 메커니즘 X — 사장님 자각 필요. 단 flag OFF default 동작이라 위험 X.

**전체 commit 순서 결론**: §9.1 → §9.2 → §9.3 → §9.4 의 순서가 의존성 명확 (commit 1 의 spec 선언 → commit 2 의 본체 동기 → commit 3 의 이관 + R7-S → commit 4 의 문서 통합). §9.5~§9.7 은 머지 후 사장님 작업 — 단계별 자동 감지 메커니즘 명확. **안전망 충분.**

---

## 9관점 검토 (R1~R9)

| R | 관점 | 검증 | 판정 |
|---|------|------|------|
| **R1** | 동작 | tsc exit 0 / vitest 10 files **109 passed** / git diff src/ 1 line / 4 코드 파일 LOC R10 정착 / D1 7개 명령 + 보강 grep 모두 green. R11 변경 최소화 정확 — 코드/테스트 변동 0. | ✅ |
| **R2** | 설계 일치 | R11 Arch §0~§14 1:1 매핑 — §1 변경 최소화 / §2 정착 검증 7개 명령 / §3 R12 atomic 7 commit / §4 #13/#14 검토 (마커+NaN 가드는 #13) / §5 MINOR-R10-NEW-1 옵션 2 / §6 iOS latency / §7 Phase D / §8 D1~D5 5건 전원 이행 / §12 종합 회고 6 부속 절. D1~D5 5건 모두 §0.3 명세 1:1 대응. | ✅ |
| **R3** | 단순화 | R11 작업이 D1 정착 검증 + D2~D5 문서 갱신만 — 코드 변동 0. R12 atomic 7 commit 명세가 단일 PR + 머지 후 단계별 작업 명확 분리 (각 commit 단일 책임). 단 D4 §9 신설 LOC +106 (Arch 예측 +52 보다 +54 자세함) — R12 PR 책임자 안전망 강화로 가독성 우선 정당. | ✅ |
| **R4** | 가독성 | R11 설계서 §0~§14 13 절 구조 — R12 PR 책임자가 §3 + 체크리스트 §9 만 봐도 7 commit 진행 가능. field_test_plan §0 0-7 체크박스가 사장님 따라하기 명확 (curl + Origin 명시). Phase B 종합 회고 §12 가 6 부속 절 분류 (9연속 PASS / ref-forward / mirror freeze / LOC 한도 / field_test_plan / 다음 Phase). | ✅ |
| **R5** | 엣지케이스 | R10 변경 정착 (Mirror NaN 가드 / STABLE_READY_MS 6 case / prev-equal skip / markInferring race) 모두 정착 확인. **§9 commit 순서 의존성 시뮬레이션 4 시나리오 검증** — 강제 의존성은 commit 1 → commit 2 (의미적), commit 1+2 → commit 3 (R7-S 합치기 전 처리 필수), commit 4 → 머지 → commit 5~7 (단계별). 각 commit 별 PRE/POST/롤백 트리거 안전망 충분. silent regression 위험 1건 (commit 1 단독, commit 2 누락 — body 동치 깨짐) 은 §9.2 POST 의 grep typeof 0건 검증으로 차단. | ✅ |
| **R6** | 성능 | R11 작업 0 코드 변경 → 런타임 동작 변경 0. R12 PR 의 staging→src/ 이관도 코드 동작 무변경 (위치만 이동). | ✅ |
| **R7** | 보안 | src/ R11 추가 변경 0 (R8 마커 1줄 그대로). R12 PR 의 commit 5 가 NEXT_PUBLIC_CAT_YOLO_V2=0 안전 default 명시 (flag OFF 머지). Instant Rollback commit ID 메모 절차 §1.1 + §9.1 + §9.5 + §9.7 다중 명시. R12 PR 의 모든 변경이 #13 (flag OFF 무손상) 적용 — Arch §4 명확. #14 트리거 X (마커/NaN 가드는 양방향 호환). | ✅ |
| **R8** | 영향 범위 | git diff --stat src/ = 1 line (R8 T5 마커만, R11 추가 0). R11 변경이 staging/docs/ 2 파일만 (checklist + field_test_plan). 코드 import 경로 변동 0. 외부 시그니처 무변경. R12 PR 의 외부 영향은 commit 1+2 (src/ logger 마커+NaN 가드) + commit 3 (src/ 신규 파일 + Mount + 뷰어 게이트) + commit 5 (Vercel ENV) — 모두 atomic + 자동 검증. | ✅ |
| **R9** | 최종 품질 | 9연속 PASS 9/9 진입 — Phase B src/ PR (R12) 직선 거리 단축. Phase B 종합 회고 §12 6 부속 절이 다음 Phase C/D/E/F 적용 패턴 정리 (9연속 PASS / ref-forward / mirror freeze / LOC 한도 / field_test_plan / 다음 Phase). 시니어 관점에서 R12 PR 진행 가이드 (§9 + §9.8 + §9.9) 가 안전망 충분. 단 MINOR-R11-NEW-1 (§9.2 헤더 주석 동기 갱신 명시 누락) 은 R12 PR 단계 흡수 권고. | ✅ |

---

## 새 REJECT 사유

**없음.**

- D1 정착 검증 7개 명령 1건 fail: 모두 PASS (R10 변경 회귀 0).
- 코드 파일 (.ts/.tsx) LOC 변동 발견: 변동 0 (R11 변경 최소화 정확).
- 신규 vitest case 추가 발견: 변동 0 (109 그대로).
- 마커 r10-1 변경 발견 (R11 시점): r7-1 5건 그대로 (R12 PR 시점 갱신 보류 정확).
- src/ R11 추가 변경 발견: 1 line 그대로 (R8 마커만).
- D2/D3/D4/D5 문서 갱신 누락: 모두 정확 위치 + 본문 명세 일치.
- driver LOC > 320: 313 통과 (마진 7).
- useDriverHealth LOC > 120: 112 통과 (마진 8).
- lifecycle LOC > 368: 357 통과 (마진 11).
- tracker LOC > 145: 139 통과 (마진 6).
- field_test_plan LOC > 180: 180 정확 통과 (한도 정확 충족, 마진 0).
- §9 commit 순서 의존성 위반 (예: commit 1 보다 commit 2 가 먼저): §9.1~§9.7 순서 정당 + 시뮬레이션 4 시나리오 검증 통과.
- 9관점 1개 이상 REJECT: 모두 PASS.

---

## 신규 발견 MINOR (R12 PR 단계 흡수 권고)

### MINOR-R11-NEW-1: §9.2 DO 의 src/ logger 헤더 주석 동기 갱신 명시 누락 — R12 PR 단계 흡수

**증상:**
- R10 QA 가 R11 신규 점검 권고 #3 에 명시: "src/ logger 의 NaN 가드 변경 시 line 225 의 `// Phase A: metadata JSONB 적재 ...` 헤더 주석도 동기 갱신 (mirror 의 R10 §2 주석 line 40 과 일치)"
- §9.2 DO 본문에 "mirror (`buildBehaviorEventMetadata.ts`) 와 1:1 동치 유지" 만 명시 — 헤더 주석 (line 222-224 의 3 줄) 동기 갱신 명시적 체크박스 없음
- 현 src/ logger line 222-224:
  ```
  // Phase A: metadata JSONB 적재 (top2 / bbox_area_ratio / model_version)
  // - undefined 키는 명시적으로 제외 (DB JSONB 가 undefined 인식 못함).
  // - model_version 은 항상 채움 (Phase E export/archive 분류 키).
  ```
- mirror line 40:
  ```
  // R10 §2: NaN/Infinity 시 key omit — JSONB INSERT 안전 + Phase D/E 통계 의미 명확.
  ```

**판정**: PASS 차단 사유 아님.
- §9.2 DO 의 "1:1 동치 유지" 표현이 헤더 주석 동기화도 자연 함의
- §9.2 POST 의 grep typeof === "number" 0건 + Number.isFinite 2건 검증이 본체 동치 자동 검증
- 헤더 주석 누락은 검증 메커니즘 X — 그러나 mirror 의 R10 §2 의도 (NaN 가드 사유) 가 src/ 본체에서도 명시되어야 차후 변경자 혼동 방지

**고치는 법** (R12 PR 단계 흡수):
1. **§9.2 DO 본문에 헤더 주석 동기 갱신 1 줄 추가** — "또한 line 222-224 의 헤더 주석 3 줄을 mirror line 40 의 R10 §2 주석과 1:1 동치 유지 (NaN 가드 사유 명시)"
2. **또는 R12 PR 책임자가 commit 2 진행 시 자율 판단** — line 225-236 본체 변경 시 line 222-224 헤더 주석도 동기 갱신:
   ```
   // Phase A: metadata JSONB 적재 (top2 / bbox_area_ratio / model_version)
   // - undefined 키는 명시적으로 제외 (DB JSONB 가 undefined 인식 못함).
   // - model_version 은 항상 채움 (Phase E export/archive 분류 키).
   // - R10 §2: NaN/Infinity 시 key omit — JSONB INSERT 안전 + Phase D/E 통계 의미 명확.
   ```

R12 PR 진행 시 commit 2 안에서 처리 — 별도 R 라운드 불필요. R12 PR description 의 "체크리스트 §9 commit 1~4 진행" 안내 하단에 본 항목 inline 메모 추가 권고.

---

## R12 PR (src/ 반영) 진행 권고

### 1. PR description 템플릿 검증

R11 Arch §11.1 의 PR description 템플릿 (line 1110-1182) 검토 결과:
- 변경 내역 7 commit 명세 정확 (commit 1 마커 / commit 2 NaN 가드 / commit 3 이관 / commit 4 ARCHITECTURE / commit 5 ENV / commit 6 baseline / commit 7 실기기)
- 안전성 검증 5 항목 (#13 무손상 / R2 §7.6 / Instant Rollback 354f6dd / pnpm test+build / src/ 직접 수정 commit 1+2+3 만)
- 체크리스트 §1~§9 / field_test_plan §0~§3 cross-reference
- CLAUDE.md 준수 4 항목 (#13 / #14 X / 9연속 PASS R11 완료 / 파일 삭제 0)

**보완 권고**: PR description 끝부분에 MINOR-R11-NEW-1 inline 메모 추가 — "commit 2 진행 시 src/ logger line 222-224 헤더 주석 (R10 §2 NaN 가드 사유) 동기 갱신 자율 처리".

### 2. commit 순서 의존성 최종 확인

§9 의 commit 순서 (1 → 2 → 3 → 4 → 5 → 6 → 7) 의 의존성:
- commit 1 (마커) → commit 2 (본체 NaN 가드): **의미적 의존** (마커 = spec 선언 → 본체 동기). 순서 강제 X 단 권고.
- commit 1+2 → commit 3 (이관 + R7-S 합치기): **강제 의존** — R7-S 합치기 후 commit 1+2 의 src/ logger 마커/본체 변경 의미 변경 (logger 가 mirror 호출이라 src/ logger 본체 NaN 가드 자체 사라짐).
- commit 3 → commit 4 (ARCHITECTURE.md 통합): **강제 의존** — 이관 완료 후 §10.2 "구현 완료" 의미 정확.
- commit 4 → 머지 → commit 5 (Vercel ENV): **강제 의존** — 머지 완료 후 사장님 작업.
- commit 5 → commit 6 (baseline): **강제 의존** — 배포 READY 후 baseline 측정.
- commit 6 → commit 7 (실기기 테스트): **강제 의존** — 24시간 baseline 무이상 후 사장님 실기기.

**시뮬레이션 결과**: 모든 강제 의존 통과. commit 1 → 2 의 의미적 의존은 §9.2 POST 의 grep typeof 0건 검증으로 silent regression 차단.

### 3. 사장님 작업 단계 (Vercel env / R2 CORS / Rollback ID) 정합성

**§9.5 commit 5 (사장님 작업)**:
- Vercel ENV 3개 등록 (`NEXT_PUBLIC_CAT_YOLO_V2=0` 안전 default + URL + STABLE_READY_MS)
- 빈 커밋 강제 재빌드 (CLAUDE.md 교훈 #6)
- Vercel MCP getEnvVar 3건 + getDeployments READY+PROMOTED 검증
- 브라우저 console flag=0 직접 확인

**§9.7 commit 7 (사장님 + 가족 작업)**:
- field_test_plan §0 7 체크박스 통과 (R11 D3 0-7 포함)
- flag ON 토글 + 빈 커밋
- §1~§3 의 15 체크박스 진행
- §5 7 지표 실측
- iOS latency 임계값 결정
- flag OFF 복귀

**Instant Rollback commit ID 메모 다중 명시**:
- 체크리스트 §1.1 line 58 (이전 PROMOTED, 일반)
- 체크리스트 §1.1 line 65-67 (R12 PR 머지 commit, R11 D2 추가)
- 체크리스트 §9.1 PRE (R11 PASS 9/9 + 새 branch)
- 체크리스트 §9.5 POST (Vercel MCP 검증)
- 체크리스트 §9.7 롤백 트리거 (5초 이내)
- field_test_plan §0 0-6 (이전 PROMOTED, 일반)
- field_test_plan §0 0-7 (R12 PR 머지 commit, R11 D3 추가)

**정합성**: "이전 PROMOTED" 와 "R12 PR 머지 commit" 두 줄 분리 기록 일관 — Instant Rollback 의사결정 시 즉시 식별 가능. **안전망 충분.**

---

## Phase B 9연속 PASS 회고 (R1~R11 전체 흐름 요약)

R11 Arch §12 의 Phase B 종합 회고 6 부속 절 검증:

### 1. 9연속 PASS 시스템 효과 (Arch §12.1)

**11 라운드 흐름 (R1 REJECT + R2 REJECT + R3~R11 PASS 9 라운드 = 9/9 카운트 달성)**:

| 라운드 | 핵심 산출 | tests | 9연속 카운트 |
|--------|----------|-------|--------------|
| R1 | 초기 10 파일 1,420 LOC | 0 (계획) | - (REJECT CRITICAL 1 + MAJOR 2 + MINOR 7) |
| R2 | 3상태 union + retryGen + 3중 방어 | ? | - (REJECT MAJOR 2: Driver 545 / vitest include) |
| R3 | Driver 3분할 (lifecycle/sampling/core) | 74 | 1/9 |
| R4 | retry 침묵 실패 + STABLE_READY_MS 60s + helpers | 76 | 2/9 |
| R5 | CRITICAL-R5-C 발견 + renderHook + Supabase stub | 83 | 3/9 |
| R6 | latency 링버퍼 + DiagBadge + metadataFreeze + field_test_plan | 92 | 4/9 |
| R7 | latencyTracker 분리 + isInferring 단일 + health stale 제거 | 96 | 5/9 |
| R8 | useDriverHealth 분리 + mirror 마커 자동 검증 | 98 | 6/9 |
| R9 | driver 마진 회복 + ref-forward 명세 + mirror strict fail | 100 | 7/9 |
| R10 | 4 파일 응축 (마진 6~11) + Mirror NaN 가드 + 회귀 3종 | 109 | 8/9 |
| **R11** | **정착 검증 + R12 명세 + 회고 (변경 최소화)** | **109 (변동 0)** | **9/9 ✅** |

**효과**:
1. 점진적 분할 + 응축의 균형 — R3 분할 → R7/R8 분할 → R10 응축으로 LOC 회복.
2. 매 라운드 회귀 0 — vitest 카운트 단조 증가 (74 → 76 → 83 → 92 → 96 → 98 → 100 → 109 → 109).
3. MINOR 누적 + 단계적 해소 — MINOR-R5-NEW-1 (Dev 보류 정책 §0 명문화) / MINOR-R6-NEW-1~4 / MINOR-R8-NEW-1 (ref-forward 발견) / MINOR-R9-NEW-1 (4 파일 마진 압박) / MINOR-R10-NEW-1 (T7 expectation 완화) / MINOR-R11-NEW-1 (§9.2 헤더 주석) 모두 다음 라운드 처리 또는 보류 정책 정당화.

### 2. ref-forward 패턴 정착 (Arch §12.2)

R8 driver 분할 시 useDriverHealth ↔ lifecycle.latencyRefs 순환 의존 → R8 Dev ref-forward wrapper 발견 (MINOR-R8-NEW-1) → R9 §2 정식 명세 (`phase_b_ref_forward_pattern.md` 96 LOC) → R10 markInferring 4 콜백 확장 → R10 §6 회귀 방지 vitest case 7 → R11 정착 (driver line 199-202 ref + line 230-233 동기화). **Phase D/E 적용 후보** (라벨링 UI / archive 콜백).

### 3. mirror freeze 의도 정착 (Arch §12.3)

R6 freeze 선언 → R7 §4 옵션 R (mirror 1:1 동치) → R8 §2 마커 자동 검증 → R9 §3 strict 강화 → R10 §2 NaN 가드 확장 → **R12 commit 1+2 마커 r10-1 갱신 + src/ logger NaN 가드 동기화** (R11 §9.1+§9.2 명세). Phase D 착수 시점 metadata 4 필드 스키마 신뢰 가능.

### 4. LOC 한도 운영 (Arch §12.4)

R6 baseline (400/100) → R7~R9 강화 (320/80 옵션) → R10 한도 그대로 (≤320/≤120/≤368/≤145) + 응축 마진 6~11 회복 → R11 한도 그대로 + 변경 0 정착. **마진 운영 원칙**: 마진 ≤2 시 응축/분할 검토 / 회복 후 신규 작업 시 마진 ≥5 유지. R12 PR 후 src/ 측 동일 한도 적용.

### 5. 사장님 검증 가이드 (Arch §12.5)

R6 도입 → R7 D2 commit ID 메모 → R11 D3 R12 PR 직후 commit ID + R2 CORS 마지막 확인 (0-7 추가) → R12 commit 7 활용 (24시간 baseline 무이상 후 30분 실기기 테스트). **합계 22 체크박스 (베타) + 7 (실패) + 4 (성장 전환).** field_test_plan LOC = 180 한도 정확 충족.

### 6. 다음 Phase 적용 권고 (Arch §12.6)

Phase B 학습 패턴 + Phase C/D/E/F 적용:
- **9연속 PASS 시스템** → Level 2~3 작업 5/9 또는 9/9
- **Arch → Dev → QA 독립 Agent** → 매 라운드 3 Agent 동일
- **Dev 보류 정책 §0** → 3조건 (회귀 증거 + self-sufficient + QA 기록)
- **staging/ → src/ atomic PR** → 단일 PR + commit 분리
- **Vercel ENV 빈 커밋 강제 재빌드** → CLAUDE.md #4/#6 항상 적용
- **사장님 사전 체크 + 30분 실기기 테스트** → 사용자 영향 큰 변경 시
- **mirror 마커 자동 검증** → user_label freeze / archive 컬럼 freeze
- **ref-forward callback wrapper** → 합성 훅 + 순환 의존 시
- **LOC 마진 6~8 + 응축 옵션** → 마진 ≤2 시 응축 우선
- **R12 PR atomic 7 commit + PRE/POST/롤백 트리거** → Phase D/E/F 동일 형식

**Phase B 발견 신 패턴 (다음 Phase 표준화)**:
1. ref-forward callback wrapper
2. mirror 마커 자동 검증
3. STABLE_READY_MS 환경변수 fallback
4. option Y key omit (NaN/Infinity)

---

## 부록: 9관점 QA 체크 요약

| R | 관점 | 결과 |
|---|------|------|
| R1 | 동작 | ✅ tsc/vitest/src diff 모두 green (109 passed +0 net, R10 정착) |
| R2 | 설계 일치 | ✅ R11 Arch §0~§14 1:1 + D1~D5 5건 §0.3 명세 정확 이행 |
| R3 | 단순화 | ✅ R11 변경 최소화 정확 (코드/테스트 변동 0) + §9 R12 atomic 7 commit 명세 안전망 강화 |
| R4 | 가독성 | ✅ §9 9 부속 절 + field_test_plan §0 0-7 사장님 따라하기 명확 + 종합 회고 §12 6 부속 절 |
| R5 | 엣지케이스 | ✅ R10 변경 정착 + §9 commit 순서 의존성 4 시나리오 시뮬레이션 통과 + silent regression 차단 메커니즘 |
| R6 | 성능 | ✅ R11 작업 0 코드 변경 → 런타임 동작 변경 0 |
| R7 | 보안 | ✅ src/ 0 R11 추가 변경 + flag OFF default + Instant Rollback ID 다중 명시 |
| R8 | 영향 범위 | ✅ git diff src/ 1 line 그대로 + 외부 시그니처 무변경 + 영향 staging/docs/ 2 파일만 |
| R9 | 최종 품질 | ✅ 9/9 진입 + R12 PR 안전망 충분 + 종합 회고 다음 Phase 패턴 정리 (단 MINOR-R11-NEW-1 R12 PR 단계 흡수) |

---

## 500단어 요약

R11 Dev 산출물 검증 결과 **PASS — 9연속 PASS 카운트 9/9 달성. Phase B src/ 반영 PR (R12) 즉시 착수 가능.** R11 = 변경 최소화 라운드 명세 (코드 변동 0 / 테스트 추가 0 / 응축·분할·리팩터 0 / 마커 r10-1 변경 0) 정확 준수. Dev 가 권한 거부로 미실측한 D1 7개 명령 + 추가 grep 모두 R11 QA 가 직접 실행 보강 — 회귀 0 확인.

**D1~D5 5건 전원 이행:** D1 정착 검증 (tsc 0 / vitest 109 passed / git diff src/ 1 line / 4 코드 한도 통과 + field_test_plan 180 한도 정확 / 마커 r7-1 5건 일치 / NaN 가드 4건 / typeof 0건 / ref-forward 4 ref + 4 동기화). D2 체크리스트 §1.1 R12 PR 사전 검증 3 체크박스 (Vercel READY+PROMOTED + R2 CORS curl + R12 머지 commit ID 별도 메모, line 59-67) + §3 진행 안내 1건 (line 159-161). D3 field_test_plan §0 0-7 체크박스 정확 (line 32-36, R12 머지 commit ID + R2 CORS 마지막 확인). D4 §9 R12 atomic 7 commit 체크리스트 신설 (line 491-597, 9 부속 절 — commit 1 마커 r10-1 / commit 2 NaN 가드 / commit 3 이관 + R7-S / commit 4 ARCHITECTURE / commit 5 ENV / commit 6 baseline / commit 7 실기기 / 머지 절차 / 24시간 모니터링, 각 commit PRE/DO/POST/롤백 4 단계). D5 MINOR-R10-NEW-1 R12 PR 후 재검토 1 체크박스 (체크리스트 §1.4 line 103-109).

**8개 명령 + 보강 grep 직접 실측 (Dev 미실측 3건 보강):** tsc exit 0 / vitest 10 files 109 passed (R10 그대로 변동 0) / git diff --stat src/ 1 line (R8 마커만, R11 추가 0) / git diff src/ + // metadata-freeze-spec: r7-1 1줄 / wc -l 4 코드 한도 통과 + field_test_plan **180 한도 정확 (마진 0)** + checklist 597 (R10 468 → R11 +129) / 마커 grep r7-1 5건 일치 (mirror line 13+22 + src logger line 225 + mirror.test line 7+21, r10-1 0건) / Number.isFinite 4건 (mirror line 41+44 + lifecycle line 50 + tracker line 79) / typeof 잔존 0건 / ref-forward 4 ref (line 199-202) + 4 동기화 (line 230-233) / driver useState 3건 (isInferring 0건 R10 정착) / STABLE_READY_MS lifecycle 8건 + lifecycle.test 14건 / §9 신설 line 491 / §0 0-7 line 32 / R11 D2/D5 체크박스 위치 정확.

**§9 commit 순서 의존성 4 시나리오 시뮬레이션 통과:** commit 1↔2 의미적 의존 (마커=spec 선언) / commit 1+2 → commit 3 강제 의존 (R7-S 합치기 후 의미 변경) / commit 3 → commit 4 강제 의존 / commit 4 → 머지 → commit 5~7 단계별. silent regression 위험 1건 (commit 1 단독, commit 2 누락 — body 동치 깨짐) 은 §9.2 POST 의 grep typeof 0건 검증으로 차단. 안전망 충분.

**MINOR-R11-NEW-1** (§9.2 DO 의 src/ logger 헤더 주석 line 222-224 동기 갱신 명시 누락): R10 QA R11 신규 점검 권고 #3 명시 사항. PASS 차단 사유 아님 — §9.2 DO 의 "1:1 동치 유지" 표현이 헤더 주석 동기화도 자연 함의 + R12 PR 책임자 commit 2 진행 시 자율 처리 가능. R12 PR description 안 inline 메모 추가 권고.

**Phase B 9연속 PASS 회고 §12 6 부속 절** (9연속 PASS / ref-forward / mirror freeze / LOC 한도 / field_test_plan / 다음 Phase) 가 다음 Phase C/D/E/F 적용 패턴 표준화. R12 PR atomic 7 commit 명세 + 머지 후 사장님 + 모니터링 단계별 작업 안전망 충분 — Phase B src/ PR 직선 거리 단축. R11 PASS 9/9 → R12 PR (atomic 7 commit) 즉시 착수 + Phase D 착수 가능 시점 명확화 (R12 commit 7 의 5 트리거 만족 후).
