# Phase B QA R9 결과

> 작성: 3번 QA Agent (R9, 독립 실행, 이전 대화 맥락 없음)
> 작성일: 2026-04-24
> 대상: Phase B R9 Dev 산출물 (R9 Arch §8 T1~T9)
> 기준: `docs/phase_b_arch_r9.md` §0~§13 + `docs/phase_b_qa_r8.md` (PASS 6/9 + R9 힌트) + `CLAUDE.md`

---

## 최종 판정: **PASS**

9연속 PASS 카운트 **7/9 진입**. R9 §8 T1~T6 (필수 6) + T7~T9 (권고 3) 전원 이행 확인. 실측 6축 모두 green (tsc exit 0 / vitest 10 files **100 passed** / src/ +1 line (R8 T5 마커만, R9 추가 0) / driver 318 LOC (한도 ≤320 마진 2) / 양쪽 마커 grep 일치 / 환경변수 grep 4건). 신규 REJECT 0, MINOR 1건 (driver 318 마진 2 회복 + useDriverHealth 120 마진 0 + lifecycle 368 마진 0 + tracker 145 마진 0 — 4 파일 동시 마진 ≤2 의 R10 압박). R8 MINOR 2건 모두 해소.

**핵심 PASS 근거 4:**

1. **옵션 C 부분 흡수 정확 이행 (T1+T2) — driver 318 마진 회복 + isInferring 단일 소유 이전.** `useDriverHealth.ts` 100 → 120 LOC (한도 ≤120 마진 0). `useState<boolean>(false)` for `isInferring` (line 72) + `useCallback((v) => setIsInferring(v), [])` for `markInferring` (line 90-92) + `setIsInferring(false)` in `resetForDisabled` (line 97) 모두 Arch §1.6 명세 정확. UseDriverHealthResult 에 `isInferring: boolean` + `markInferring: (v: boolean) => void` 2 필드 추가 (line 53-54). 헤더 JSDoc 25줄 응축 (R8 9줄 → R9 21줄, R9 옵션 C 흡수 사실 + 4 API + 데이터 흐름 4단계 + driver 호환성). `useBroadcasterYoloDriver.ts` 320 → **318** LOC (한도 ≤320 마진 2). useState `isInferring` 제거 확인 (driver 의 useState 검색 결과: currentBehavior/lastDetections/avgConfidence 3개만, isInferring 없음). useMemo 반환 line 300 `isInferring: driverHealth.isInferring` forward — 외부 시그니처 무변경. DriverResult 인터페이스 line 66 `isInferring: boolean` 그대로 (값 출처만 변경).

2. **ref-forward 패턴 정식 채택 (T2+T5) — markInferring 도 4 콜백 ref-forward 로 확장 + 신규 .md 문서 96 LOC.** driver line 204-217 ref 4종 (bumpSuccessRef/bumpFailureRef/bumpTickRef/markInferringRef) + wrapper 4종 (onSuccess/onFailure/onTick/markInferring useCallback deps []) + line 219-226 lifecycle 합성 (markInferring wrapper prop) + line 228-231 useDriverHealth 합성 (lifecycle.latencyRefs 인자) + line 234-244 ref 동기화 effect (deps 4 stable callbacks) — Arch §2.4/§2.5 명세 1:1 일치. 순환 의존 (useDriverHealth 가 lifecycle.latencyRefs 인자 → lifecycle 합성이 먼저) 해소. `staging/docs/phase_b_ref_forward_pattern.md` 96 LOC 신규 (Arch §2.3 예상 ~85, +11). §0 배경 / §1 패턴 정의 / §2 코드 예시 (driver §9 발췌) / §3 안전성 분석 (race + 한도) / §4 Phase B 안 현 적용 사례 (driver 4종 + lifecycle 4종) / §5 향후 (Phase D/E) / §6 R11 ARCHITECTURE.md 흡수 안내 — Arch §2.3 6 섹션 구조 정확.

3. **mirror strict 강화 (T3) + STABLE_READY_MS 환경변수화 (T4+T6) + case 6 (T9).** `metadataFreezeMirror.test.ts` 63 → **52** LOC (한도 ≤55 마진 3). it 2 (line 46-51): `expect(content).toContain(MARKER)` 강제, `it.skip` / `console.warn` / `return` 잔존 0건 (Read 정독 확인). vitest run 시 it 2 PASS — R8 T5 마커 src/ logger line 225 정확 보존 → strict fail 안전. `useYoloWorkerLifecycle.ts` line 56-59: `STABLE_READY_MS` IIFE 환경변수 fallback (`Number.isFinite(v) && v > 0 ? v : 60_000`) — NaN/Infinity/음수/0 모두 default 60_000 안전 분기. lifecycle 364 → **368** LOC (한도 ≤368 마진 0). 체크리스트 §3 line 129-133 (R9 §6 1 체크박스 +5 lines, T6 정확). 기존 lifecycle/sampling args.markInferring 패턴 (R7 §3 옵션 B 정신) 유지 — driver 가 자체 wrapper 를 prop, lifecycle/sampling 내부 markInferringRef 동기화 변경 0. case 6 (`broadcasterYoloDriver.renderHook.test.ts` line 250-293, T9 권고): "confirmed → 동일 classKey 재 confirmed → NONE_KEY 3프레임 cleared → null". 헬퍼 함수 emitSleeping 으로 LOC 절약 — Arch 예상 ~310 → 실측 294 (마진 21).

4. **CLAUDE.md #13 안전 + 회귀 0 + R8 MINOR 2건 해소.** `git diff --stat src/` = `1 file changed, 1 insertion(+)` (R8 T5 마커만, R9 추가 변경 0). vitest R8 101 → R9 100 = -1 net (T8 통합 6→4 cases -2 + T9 case 6 +1 = -1). 정확 일치. tracker 172 → 145 LOC (T7 권고, 한도 ≤145 마진 0) — Arch §4.1 응축 27 LOC 회수 정확. yoloLatencyTracker.test.ts 228 → 135 LOC (T8 권고, Arch 예상 ≤180 마진 45). MINOR-R8-NEW-1 (Dev 가 Arch §1 직접 sweep 패턴을 ref-forward 변형) 해소 — R9 §2 Arch 명시로 ref-forward 정식 채택, .md 문서 정착. MINOR-R8-NEW-2 (driver 320 마진 0) 해소 — driver 318 마진 2 회복.

**MINOR 1건 (R10 권고):**
- **MINOR-R9-NEW-1** (마진 0/2 4 파일 동시 압박): driver 318 (마진 2) / useDriverHealth 120 (마진 0) / lifecycle 368 (마진 0) / tracker 145 (마진 0). R10 에서 어느 한 파일이라도 1줄 추가 시 즉시 REJECT. R10 에서 Arch 가 한도 완화 또는 추가 응축 검토 필요. **권고**: useDriverHealth 의 헤더 JSDoc 21줄 → 18줄 추가 응축 (3 LOC 회수) 또는 lifecycle 의 STABLE_READY_MS IIFE 4줄 → 1줄 응축 (`const v = Number(process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS); const STABLE_READY_MS = Number.isFinite(v) && v > 0 ? v : 60_000;`) 등.

---

## 실측 결과 (R9 QA Bash 권한 직접 실행 — 6개 명령)

| # | 명령 | 결과 | 판정 |
|---|------|------|------|
| 1 | `npx tsc --noEmit -p tsconfig.staging-check.json` | exit 0 (no output) | ✅ |
| 2 | `npx vitest run` | 10 files / **100 passed** / 2.06s | ✅ |
| 3 | `git diff --stat src/` | `src/hooks/useBehaviorEventLogger.ts \| 1 +` (R8 T5 마커 1줄만) | ✅ |
| 3b | `git diff src/` | `+ // metadata-freeze-spec: r7-1` 1줄 (R9 추가 변경 0) | ✅ |
| 4 | `wc -l staging/...` | driver=318 / useDriverHealth=120 / lifecycle=368 / tracker=145 / mirror.test=52 / tracker.test=135 / renderHook.test=294 / ref-forward.md=96 / checklist=453 | ✅ |
| 5 | `grep "metadata-freeze-spec: r7-1"` 양쪽 + 테스트 | staging/lib mirror=1건 (line 22) + src/ logger=1건 (line 225) + staging/tests/metadataFreezeMirror=2건 (line 7 헤더 + line 21 MARKER) | ✅ |
| 6 | `grep "NEXT_PUBLIC_YOLO_STABLE_READY_MS" staging/` | lifecycle=2건 (line 53 JSDoc + line 57 IIFE) + checklist=2건 (line 129/131) | ✅ |
| 보강 | `grep "isInferring\|markInferring"` 4 훅 | useDriverHealth (state/callback/return 단일 소유) + driver (ref-forward wrapper + useMemo forward) + lifecycle (markInferringRef 기존 패턴 유지) + sampling (markInferringRef 기존 패턴 유지) | ✅ |
| 보강 | `grep "useState" staging/hooks/useBroadcasterYoloDriver.ts` | useState import (line 16) + 3 useState 호출 (line 96/97/98 — currentBehavior/lastDetections/avgConfidence) — **isInferring useState 0건 (R9 §1 흡수 확정)** | ✅ |

**vitest 파일별 분포 (R9 변동):**

| 파일 | R8 tests | R9 tests | delta |
|------|----------|----------|-------|
| confirmFrames.test.ts | 13 | 13 | 0 |
| maxDurationGuard.test.ts | 7 | 7 | 0 |
| metadataFreeze.test.ts | 8 | 8 | 0 |
| metadataFreezeMirror.test.ts | 2 | 2 | 0 (it 2 strict 강화, count 동일) |
| broadcasterYoloDriver.test.ts | 20 | 20 | 0 |
| inferenceScheduler.parity.test.ts | 23 | 23 | 0 |
| **yoloLatencyTracker.test.ts** | **6** | **4** | **-2 (T8 통합)** |
| yoloSampling.test.ts | 5 | 5 | 0 |
| yoloWorkerLifecycle.test.ts | 11 | 11 | 0 |
| **broadcasterYoloDriver.renderHook.test.ts** | **6** | **7** | **+1 (T9 case 6)** |
| **합계** | **101** | **100** | **-1 net** |

R8 101 → R9 100 = T8 -2 + T9 +1 = -1 정확.

---

## 파일 LOC 표 (wc -l 직접 실측)

| 파일 | R8 LOC | R9 실측 | R9 한도 | R9 마진 | 판정 |
|------|--------|---------|---------|---------|------|
| `useBroadcasterYoloDriver.ts` | 320 | **318** | ≤320 | **2** | ✅ MINOR-R8-NEW-2 해소 |
| `useDriverHealth.ts` | 100 | **120** | ≤120 | **0** | ✅ 정확 일치 (R10 압박) |
| `useYoloWorkerLifecycle.ts` | 364 | **368** | ≤368 | **0** | ✅ 정확 일치 (T4 +4) |
| `useYoloLatencyTracker.ts` | 172 | **145** | ≤145 | **0** | ✅ 정확 일치 (T7 -27) |
| `useYoloSampling.ts` | 235 | 235 | ≤350 | 115 | ✅ 변동 없음 |
| `YoloDriverDiagBadge.tsx` | 98 | 98 | 100 | 2 | ✅ 변동 없음 |
| `CameraBroadcastYoloMount.tsx` | 89 | 89 | 100 | 11 | ✅ 변동 없음 |
| `buildBehaviorEventMetadata.ts` | 47 | 47 | 350 | 303 | ✅ 변동 없음 |
| `metadataFreeze.test.ts` | 132 | 132 | — | - | ✅ 변동 없음 |
| `metadataFreezeMirror.test.ts` | 63 | **52** | ≤55 | 3 | ✅ T3 strict (-11) |
| `yoloLatencyTracker.test.ts` | 228 | **135** | ≤180 | 45 | ✅ T8 통합 (-93, Arch 예상보다 -45 추가 응축) |
| `yoloWorkerLifecycle.test.ts` | 475 | 475 | — | - | ✅ 변동 없음 |
| `broadcasterYoloDriver.renderHook.test.ts` | 249 | **294** | ≤315 | 21 | ✅ T9 case 6 (+45, Arch 예상 +60 보다 -15 효율) |
| `phase_b_src_migration_checklist.md` | 446 | **453** | — | - | ✅ T6 +5 + 기존 +2 |
| `phase_b_field_test_plan.md` | 174 | 174 | ≤180 | 6 | ✅ 변동 없음 |
| `phase_b_ref_forward_pattern.md` (신규) | - | **96** | — | - | ✅ T5 신규 (Arch 예상 ~85, +11) |
| `vitest.config.ts` | 56 | 56 | — | - | ✅ 변동 없음 |
| `tsconfig.staging-check.json` | 46 | 46 | — | - | ✅ 변동 없음 |
| `src/hooks/useBehaviorEventLogger.ts` | (R8 +1) | (변동 0) | — | - | ✅ R9 src/ 무수정 |

**R9 LOC 효과 합계:**
- driver -2 (320 → 318) — MINOR-R8-NEW-2 해소.
- useDriverHealth +20 (100 → 120) — 옵션 C 부분 흡수 + 헤더 응축.
- lifecycle +4 (364 → 368) — STABLE_READY_MS 환경변수.
- tracker -27 (172 → 145) — T7 응축.
- mirror.test -11 (63 → 52) — T3 strict.
- tracker.test -93 (228 → 135) — T8 통합.
- renderHook.test +45 (249 → 294) — T9 case 6.
- 신규 ref-forward.md +96.
- 체크리스트 +7 (446 → 453) — T6 +5 + 기존 r9 마커 +2.

**핵심**: driver/useDriverHealth/lifecycle/tracker 4 파일 마진 ≤2 (driver 2 / 나머지 0). MINOR-R9-NEW-1 → R10 권고.

---

## R9 Arch §8 T1~T9 검증

### T1~T6 (필수)

| ID | 출처 | 항목 | 검증 증거 | 판정 |
|----|------|------|-----------|------|
| **T1** | §1.5 §1.6 | useDriverHealth 갱신 — isInferring useState + markInferring useCallback (deps []) + UseDriverHealthResult 2필드 추가 + resetForDisabled 의 setIsInferring(false) + 헤더 25줄 응축. LOC ≤120 | line 72 `useState<boolean>(false)` + line 90-92 `useCallback((v) => setIsInferring(v), [])` + line 53-54 result.isInferring/markInferring 2필드 + line 97 `setIsInferring(false)` in resetForDisabled + 헤더 line 1-21 응축 (R9 §1 흡수 사실 + 4 API + 데이터 흐름 4단계 명시). LOC = 120 (한도 정확). tsc green. | ✅ |
| **T2** | §1.5 §2.4 §2.5 | driver 갱신 — useState isInferring 제거 + ref-forward 4 콜백 (markInferring 추가) + driverHealth/lifecycle 합성 + useMemo 반환 + 헤더/주석 응축. LOC ≤320 | useState 검색 결과 driver 안 isInferring 0건 (currentBehavior/lastDetections/avgConfidence 3건만). line 204-217 ref 4종 + wrapper 4 useCallback (markInferringRef 추가). line 219-226 lifecycle 합성 (markInferring wrapper prop). line 228-231 useDriverHealth 합성 (lifecycle.latencyRefs 인자). line 234-244 effect 4 deps 동기화. line 300 useMemo 반환 isInferring: driverHealth.isInferring forward. 헤더 line 1-12 (R3/R7/R8/R9 한 묶음 응축). LOC = 318 (한도 ≤320 마진 2). | ✅ |
| **T3** | §3.2 §3.3 | mirror.test it 2 의 skip+warn 제거 → strict fail. 헤더 R9 §3 갱신. LOC ≤55 | line 46-51 `expect(content).toContain(MARKER)` 강제, console.warn / return 잔존 0건. 헤더 line 1-14 R9 §3 strict 사실 + R8 까지 skip+warn 사실 + R8 T5 적용 사실 명시. LOC = 52 (한도 ≤55 마진 3). vitest run 시 it 2 PASS (T5 마커 보존). | ✅ |
| **T4** | §6.1 | lifecycle STABLE_READY_MS 환경변수화 (`NEXT_PUBLIC_YOLO_STABLE_READY_MS`, default 60_000). LOC ≤368 | line 53-54 R9 §6 사실 + iOS 보류 사유 JSDoc. line 56-59 IIFE: `const v = Number(...); return Number.isFinite(v) && v > 0 ? v : 60_000;` — NaN/Infinity/0/음수 모두 default fallback 안전. line 144/197/203/232 등 기존 STABLE_READY_MS 참조 그대로 (라인 번호만 +4 시프트). LOC = 368 (한도 정확). lifecycle.test 11 cases 모두 PASS — process.env 미정의 시 default 60_000 동작. | ✅ |
| **T5** | §2.3 | 신규 `staging/docs/phase_b_ref_forward_pattern.md` (~85 LOC) — Arch §2.3 6 섹션 구조 (배경/패턴/예시/안전성/적용/R11 안내) | 파일 96 LOC. §0 배경 (line 7-16, R8 발견 → R9 정착) / §1 패턴 정의 (line 18-29, 언제 + 왜 안전) / §2 코드 예시 (line 31-67, driver §9 발췌 5단계) / §3 안전성 분석 (line 69-79, race 검토 + 한도) / §4 Phase B 적용 사례 표 (line 81-86, driver 4종 + lifecycle 4종) / §5 향후 (line 88-91, Phase D/E) / §6 R11 안내 (line 93-96). Arch 예상 ~85 +11 — race 분석 + 향후 사례 기술 수준 우수. | ✅ |
| **T6** | §6.3 | 체크리스트 §3 또는 §8 에 NEXT_PUBLIC_YOLO_STABLE_READY_MS 1 체크박스 (~5 lines) | line 129-133 `(R9 §6) Phase B src/ 반영 PR 머지 후 Vercel env 등록 검토` + bash 명령 + default 60000 안내 + R10 사장님 실기기 후 조정 명시. 5 lines. grep 결과 NEXT_PUBLIC_YOLO_STABLE_READY_MS 체크리스트 안 2건 (line 129/131) — 정확. | ✅ |

### T7~T9 (권고)

| ID | 출처 | 항목 | 검증 증거 | 판정 |
|----|------|------|-----------|------|
| **T7** | §4.2 | tracker 헤더/Args/Result/example 응축 -27 LOC. ≤145 | line 1-13 헤더 13줄 (Arch 예상 12, +1) — 책임 + 데이터 흐름 4단계. line 26-32 computePercentile JSDoc 1줄. line 34-37 Args JSDoc 압축. line 39-57 Result JSDoc 압축 (필드별 1줄). line 113-118 헬퍼 응축. LOC = 145 (한도 정확). vitest tracker.test 4 cases 모두 PASS. | ✅ |
| **T8** | §5.1 | tracker.test 6 → 4 cases 통합 (case 1+2 / 3+4 / 5 / 6). LOC ≤180 | 4 tests 모두 PASS (vitest 출력 확인). LOC = 135 (Arch 예상 ≤180 마진 45 — 추가 응축 우수). 회귀 0. | ✅ |
| **T9** | §7.2 | renderHook case 6 추가 — confirmed 동일 classKey 재 confirmed (변경 0) → NONE_KEY 3프레임 cleared → null. LOC ≤315 | line 250-293 case 6: emitSleeping 헬퍼로 LOC 절약. 1) ON+ready / 2) sleeping 3프레임 confirmed 검증 / 3) sleeping 3프레임 재 입력 → `expect(result.current.currentBehavior).toBe(firstConfirmed)` (참조 동일성 강한 검증) / 4) NONE_KEY 3프레임 cleared null. 7 tests (R8 6 + 1) 모두 PASS. LOC = 294 (한도 ≤315 마진 21). | ✅ |

**T1~T9 9건 전원 이행.** R9 의 핵심 옵션 C 부분 흡수 + ref-forward 명세 정착 + mirror strict 3축 모두 처리.

---

## R8 QA 권고 3건 재판정

R8 QA 가 "R9 우선 권고 3건" 으로 명시:

| # | R8 권고 | R9 처리 | 검증 |
|---|---------|---------|------|
| 1 | driver 320 마진 회복 (옵션 A/B/C) | T1 + T2 (옵션 C 부분 + 헤더/주석 응축) | driver 320 → 318 (마진 2 회복) ✅ |
| 2 | ref-forward 패턴 명세 정착 | T5 (신규 .md 96 LOC) | Arch §2.3 6 섹션 구조 + race 분석 + Phase B 적용 사례 표 ✅ |
| 3 | mirror skip → fail 강화 | T3 (옵션 X 단순 strict fail) | it 2 의 console.warn/return 0건, toContain MARKER 강제 ✅ |

3건 모두 R9 라운드 안에서 처리 — R10 미루기 0.

---

## 9관점 검토 (R1~R9)

| R | 관점 | 검증 | 판정 |
|---|------|------|------|
| **R1** | 동작 | tsc exit 0 / vitest 10 files 100 passed / src/ +0 R9 변경 / driver 318 / useDriverHealth 120 / lifecycle 368 / tracker 145 모두 한도 통과. T8 -2 + T9 +1 = -1 net 정확. | ✅ |
| **R2** | 설계 일치 | Arch §1.5 옵션 C 부분 흡수 (markInferring + isInferring) 정확 — bump 3 + markInferring = 4 콜백 ref-forward (Arch §2.4 명세). Arch §3 옵션 X (단순 strict fail) 정확. T1~T9 9건 모두 §1~§7 명세 1:1 대응. | ✅ |
| **R3** | 단순화 | 옵션 C 부분 흡수가 진정한 응집도 향상 — useDriverHealth 가 "driver health 측정 + isInferring 상태 단일 책임" 명시 (line 2 헤더). markInferring 흡수 + bump 3 ref-forward 유지 의 비대칭은 순환 의존 사실 (lifecycle.latencyRefs 인자 의존) 의 자연 결과 — Arch §1.4/§1.5 결정 합리. ref-forward .md 가 패턴 정착 명확. | ✅ |
| **R4** | 가독성 | useDriverHealth 헤더 21줄 한국어 (분리 배경 + 데이터 흐름 4단계 + 4 API + 호환성) — 비전공자도 이해 가능. driver 헤더 line 7-9 R7+R8+R9 통합 1 단락 — 압축됐으나 ref-forward .md 참조 (line 203) 로 보완. ref-forward.md 96 LOC 가 코드 예시 5단계 + race 분석 + Phase B 적용 표 — 새 사람이 봐도 이해 가능. | ✅ |
| **R5** | 엣지케이스 | **markInferring race 검증**: driver line 207 markInferringRef 빈 함수 초기값. 첫 렌더 ~ ref 동기화 effect 사이 lifecycle/sampling 의 markInferring(true|false) 호출 가능성? 코드 trace: lifecycle line 152-157 effect 가 args.markInferring (= driver wrapper) 을 markInferringRef 에 동기화 — wrapper 자체는 driver 의 markInferringRef.current 호출 (line 215). lifecycle/sampling 의 markInferringRef.current(true|false) 호출 시점은 worker.onmessage(result) (line 209) + sampling tick (line 165) — 모두 setInterval/worker async 경로 → React 의 commit phase (effect flush) 이후. **첫 effect commit ~ 첫 setInterval tick 사이 race 시: driver 의 markInferringRef 빈 함수 호출 → setIsInferring 호출 0회 → isInferring 잔존 false (초기값 false 와 동일)**. 실질 영향 0 — 첫 isInferring 변화는 첫 sampling tick (수십 ms) 이후. STABLE_READY_MS 환경변수 가드 (line 56-59) — `Number.isFinite(v) && v > 0` 으로 NaN/Infinity/0/음수 모두 default 60_000 fallback 안전. mirror strict (it 2): src/ 마커 사라지면 즉시 fail (silent regression 차단). case 6: confirmed 동일 classKey 재 입력 → currentBehaviorRef.current?.classKey === result.key 가드 → setCurrentBehavior 0회 + 참조 동일성 (`toBe(firstConfirmed)`) 검증. 우수. | ✅ |
| **R6** | 성능 | useDriverHealth 의 isInferring useState 추가 — markInferring 호출 시 setIsInferring 1회 → driver 가 driverHealth.isInferring 변화 감지 → useMemo deps 변화 → DriverResult 재생성. R8 driver 의 useState `isInferring` 와 동일 비용 (소유 위치만 변경). ref-forward 4 콜백 — driver wrapper 4 useCallback deps [] stable + ref 4종 (매 렌더 동일 ref). 동기화 effect deps 4 (driverHealth.bump 3 + markInferring) 모두 useDriverHealth deps [] stable → effect 첫 1회만 실행. 추가 리렌더 0. | ✅ |
| **R7** | 보안 | src/ 0 line R9 추가 변경 (R8 마커 1줄만 유지) — CLAUDE.md #13 무손상 원칙 정확. STABLE_READY_MS 환경변수 default 60_000 안전 (NaN/Infinity/0/음수 가드). mirror strict — drift 발생 시 CI 빌드 차단 (silent regression 0). XSS / 하드코딩 시크릿 / RLS 우회 0. | ✅ |
| **R8** | 영향 범위 | git diff --stat src/ = 1 line (R8 T5 마커만, R9 추가 0). DriverArgs/DriverResult 무변경 (line 51-74). Mount props 무영향 (CameraBroadcastYoloMount.tsx 89 LOC 변동 없음). useDriverHealth 신규 export 2 필드 (isInferring/markInferring) — 외부 import 검색 결과 driver 만 사용. lifecycle/sampling args.markInferring 시그니처 무변경 (출처만 driver wrapper → driverHealth.markInferring 으로 ref-forward 경유). | ✅ |
| **R9** | 최종 품질 | 시니어에게 보여줘도 부끄럽지 않음. driver 318 (마진 2) / useDriverHealth 120 (마진 0) / lifecycle 368 (마진 0) / tracker 145 (마진 0) — 4 파일 동시 마진 ≤2 의 R10 압박은 **MINOR-R9-NEW-1** 로 별도 표기. R8 MINOR 2건 모두 해소. T1~T9 9건 전원 이행 (필수 6 + 권고 3). 9연속 PASS 7/9 진입. | ✅ (단 MINOR-R9-NEW-1 R10 권고) |

---

## 새 REJECT 사유

**없음.**

- driver LOC > 320: 318 통과.
- useDriverHealth LOC > 120: 120 정확 일치 (REJECT 조건은 `> 120` 이므로 PASS).
- lifecycle LOC > 368: 368 정확 일치 (PASS).
- tracker LOC > 145: 145 정확 일치 (PASS).
- vitest 1건 fail: 100 passed (PASS).
- src/ R9 추가 변경 > 0: R8 T5 마커 1줄만 (PASS).
- T1~T6 필수 누락: 6건 전원 이행 (PASS).
- markInferring race 회귀 증거: 첫 effect ~ 첫 sampling tick 사이 race 가능성 분석 결과 실질 영향 0 (R5 trace).
- 9관점 1개 이상 REJECT: 모두 PASS.

---

## 신규 발견 MINOR

### MINOR-R9-NEW-1: 마진 0/2 4 파일 동시 압박 (R10 권고)

**증상:**
- driver 318 (마진 2)
- useDriverHealth 120 (마진 0)
- lifecycle 368 (마진 0)
- tracker 145 (마진 0)

R10 에서 어느 한 파일이라도 1줄 추가 시 즉시 REJECT. 4 파일 동시 마진 ≤2 는 R8 driver 320 마진 0 (1 파일) 보다 위험.

**고치는 법 (3 옵션):**
1. **추가 응축** (권고): useDriverHealth 헤더 21줄 → 18줄 (3 회수) + lifecycle STABLE_READY_MS IIFE 4줄 → 1줄 (3 회수, `const v = Number(process.env...); const STABLE_READY_MS = Number.isFinite(v) && v > 0 ? v : 60_000;`).
2. **한도 완화**: R10 Arch 가 useDriverHealth ≤125 / lifecycle ≤375 / tracker ≤150 으로 완화 (각 +5).
3. **흡수 추가**: useDriverHealth 가 lastDetections/avgConfidence 흡수 (Arch §1.9 옵션 D 의 부분 적용) — driver 마진 추가 회복 + useDriverHealth 비대 위험.

**판정**: PASS 차단 사유 아님 — R10 Arch 결정 사안.

---

## R10 에 남길 힌트

### R10 우선 권고 4건

1. **MINOR-R9-NEW-1 해소** (필수): 마진 0/2 4 파일 추가 응축 또는 한도 완화. R10 Arch 가 옵션 1/2/3 중 결정.
2. **iOS 실기기 latency P95 임계값 결정** (R10-A, 사장님 실측 후): dev 배지 inferLatencyP95Ms < 1000ms 임계값 + STABLE_READY_MS iOS 자동 분기 검토.
3. **Mirror NaN/Infinity 가드** (R10-C, Phase D Arch 합의 후): buildBehaviorEventMetadata.ts 의 `top2`/`bbox_area_ratio` 계산 시 Number.isFinite 가드 추가.
4. **driver 추가 마진** (R10-F): 옵션 D (confirmFrames 분리) 또는 useDriverHealth 추가 흡수 (lastDetections/avgConfidence) 검토.

### R11 전망

R10 PASS 시 8/9. R11 PASS 시 9/9 → Phase B src/ 반영 PR 착수 + ARCHITECTURE.md §10 ref-forward 패턴 통합 + R7-S mirror 합치기 + 옵션 3 src/ 마커 commit 분리.

### R10 신규 점검 권고

- useDriverHealth 의 `isInferring` 단일 소유 후 driver 의 useEffect 의존성 (line 284 `[enabled, driverHealth.resetForDisabled]`) 안정성 재확인 — driverHealth.resetForDisabled deps [] stable 라 effect 첫 1회만, OFF 전환 시에만 실행.
- ref-forward 4 콜백 effect deps (line 239-243) 의 4 callback 모두 useDriverHealth 의 useCallback deps [] — effect 첫 commit 1회 실행 후 재실행 0. 매 렌더 effect 미실행 검증 (React DevTools profiler 권고).
- markInferring race 의 빈 함수 손실 0 보장 — 첫 렌더 ~ effect commit 사이 worker effect 가 worker 생성 → worker init → ready 전까지 sampling tick 미시작 (수백 ms ~ 초 단위). 실질 race window 0.

---

## 부록: 9관점 QA 체크 요약

| R | 관점 | 결과 |
|---|------|------|
| R1 | 동작 | ✅ tsc/vitest/src diff 모두 green |
| R2 | 설계 일치 | ✅ Arch §1~§7 1:1 |
| R3 | 단순화 | ✅ 옵션 C 부분 흡수 합리 |
| R4 | 가독성 | ✅ 한국어 21~25줄 헤더 |
| R5 | 엣지케이스 | ✅ markInferring race 분석 + STABLE_READY_MS 가드 + mirror strict |
| R6 | 성능 | ✅ ref-forward stable callback + 추가 리렌더 0 |
| R7 | 보안 | ✅ src/ 0 R9 추가 + env fallback 안전 |
| R8 | 영향 범위 | ✅ 외부 시그니처 무변경 |
| R9 | 최종 품질 | ✅ (단 MINOR-R9-NEW-1 R10 권고) |

---

## 500단어 요약

R9 Dev 산출물 검증 결과 **PASS** — 9연속 카운트 7/9 진입. R8 driver 320 마진 0 의 핵심 위험을 옵션 C 부분 흡수 (markInferring + isInferring 을 useDriverHealth 단일 소유로 이전) + 헤더/주석 응축 조합으로 driver 318 마진 2 회복. R8 MINOR 2건 (driver 마진 0 + ref-forward 패턴 변형) 모두 해소.

**T1~T9 9건 전원 이행** (필수 6 + 권고 3). T1 useDriverHealth 갱신 (100 → 120 LOC, isInferring useState + markInferring useCallback + resetForDisabled 의 setIsInferring(false) + 헤더 21줄 응축) — UseDriverHealthResult 에 isInferring/markInferring 2 필드 추가, Arch §1.6 명세 정확. T2 driver 갱신 (320 → 318 LOC) — useState isInferring 제거 (useState 검색 결과 driver 안 0건), ref-forward 4 콜백 (markInferring 추가, Arch §2.4 명세) + driverHealth/lifecycle 합성 + useMemo 반환 isInferring forward + 헤더/주석 응축. T3 mirror strict (63 → 52 LOC) — it 2 console.warn/return 제거, toContain MARKER 강제. T4 lifecycle STABLE_READY_MS 환경변수화 (364 → 368 LOC, IIFE + Number.isFinite 가드, NaN/Infinity/0/음수 모두 default 60_000 fallback 안전). T5 신규 ref-forward.md (96 LOC, Arch §2.3 6 섹션 구조 정확). T6 체크리스트 1 체크박스 (5 lines). T7 tracker 응축 (172 → 145 LOC). T8 tracker.test 통합 (228 → 135 LOC, 6 → 4 cases). T9 renderHook case 6 추가 (249 → 294 LOC, confirmed 동일 classKey 재 confirmed → cleared 흐름 검증).

**6개 명령 실측 직접 실행:** tsc exit 0 / vitest 10 files 100 passed (R8 101 → R9 100 = T8 -2 + T9 +1 = -1 net 정확) / git diff --stat src/ 1 line (R8 T5 마커만, R9 추가 0) / wc -l 모두 한도 통과 / 양쪽 마커 grep 일치 / NEXT_PUBLIC_YOLO_STABLE_READY_MS grep 4건 (lifecycle 2 + checklist 2).

**markInferring race 분석:** driver 의 markInferringRef 빈 함수 초기값 (line 207). 첫 렌더 ~ ref 동기화 effect 사이 lifecycle/sampling 호출 가능성 코드 trace 결과 — worker.onmessage(result) + sampling setInterval tick 모두 commit phase 이후 + worker init/ready 까지 수백 ms ~ 초 단위 → 실질 race window 0. 첫 isInferring 변화 시점에는 effect 동기화 완료. **회귀 증거 0.**

**MINOR-R9-NEW-1**: driver 318 (마진 2) / useDriverHealth 120 (마진 0) / lifecycle 368 (마진 0) / tracker 145 (마진 0) — 4 파일 동시 마진 ≤2. R10 에서 1줄 추가 시 REJECT 위험. R10 Arch 가 추가 응축 / 한도 완화 / 추가 흡수 중 결정 권고.

R10/R11 2 라운드 남음. R11 PASS 시 Phase B src/ 반영 PR 착수 + ARCHITECTURE.md §10 ref-forward 통합 + R7-S mirror 합치기 + 옵션 3 src/ 마커 commit 분리. R9 의 옵션 C 부분 흡수 + ref-forward 정식 명세 + mirror strict 3축 모두 R8 QA 권고 그대로 처리 — Phase B src/ 진입까지 직선 거리 단축.
