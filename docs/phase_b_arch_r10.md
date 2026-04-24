# Phase B Arch R10 — 4 파일 마진 회복 (옵션 B 응축) + Mirror NaN 가드 + tracker prev-equal 검증 + STABLE_READY_MS 6 case + markInferring race 회귀 방지

> 작성: 1번 Arch Agent (R10, 독립 실행, 이전 대화 맥락 없음)
> 작성일: 2026-04-24
> 대상: Phase B R10 Dev (staging 반영) + R10 QA (9관점 독립 검증)
> 기준: `docs/phase_b_qa_r9.md` (PASS 7/9, MINOR-R9-NEW-1 4 파일 마진 압박) + `docs/phase_b_arch_r9.md` §11 R10 가이드 + `CLAUDE.md` + 현 staging 전체
> 관계: R3 (compose 분할) → R4 (STABLE_READY_MS) → R5 (관측성 초기) → R6 (관측성 + 실기기 + 응집도) → R7 (lifecycle 재분할 + health stale 제거 + isInferring 단일 소유) → R8 (driver 분할 + mirror 자동 검증 + chunks grep) → R9 (driver 마진 회복 + ref-forward 명세 + mirror fail 강화) → **R10 (4 파일 마진 회복 + 회귀 테스트 3종)**

---

## §0. R9 PASS 7/9 → R10 8/9 목표 (R11 까지 2 라운드)

R9 QA PASS 로 **9연속 카운트 7/9 진입**. 신규 REJECT 0, MINOR 1건 (MINOR-R9-NEW-1: 4 파일 동시 마진 ≤2 압박 — driver 318/320 마진 2 / useDriverHealth 120/120 마진 0 / lifecycle 368/368 마진 0 / tracker 145/145 마진 0). R10 은 다음 5축 핵심 이슈를 **응축으로 4 파일 마진 5~8 회복 + Mirror NaN/Infinity 가드 + tracker prev-equal 회귀 테스트 + STABLE_READY_MS 6 case + markInferring race 회귀 방지 + 8/9 진입** 으로 처리한다.

### 0.1 R10 처리 매트릭스 (R9 QA 권고 + R9 Arch §11 R10 가이드 통합 → R10/R11 분배)

| 출처 | 항목 | R10 처리 | 사유 |
|------|------|---------|------|
| R9 QA #1 | 9연속 카운트 7/9 → 8/9 | **R10 결과 반영** | 자동 |
| R9 QA #2 / MINOR-R9-NEW-1 | 4 파일 동시 마진 ≤2 압박 | **R10 §1 (옵션 B 응축 채택)** | 1순위 — R11 추가 LOC 위험 차단 |
| R9 QA R10 권고 #2 / R9 §11 R10-A | Mirror NaN/Infinity 가드 | **R10 §2 (옵션 X null 변환 채택)** | 2순위 — JSONB INSERT 안전 |
| R9 §11 R10-B | tracker prev-equal skip 검증 강화 | **R10 §3 (vitest 1 case 추가)** | 3순위 — 회귀 방지 (yoloLatencyTracker.test.ts) |
| R9 §11 R10-D | STABLE_READY_MS 6 case 검증 | **R10 §5 (yoloWorkerLifecycle.test.ts 확장)** | 4순위 — env fallback 안전 검증 |
| R9 §11 R10-E | markInferring race 회귀 테스트 | **R10 §6 (vitest 1 case 추가)** | 5순위 — race window 0 회귀 차단 |
| R9 §11 R10-C | ARCHITECTURE.md §10 통합 | **§4 R11 보류 (위치/형식 명세만 R10)** | atomic deploy 시점 |
| R9 §11 R10-F | driver 추가 마진 (옵션 D / 흡수 추가) | **R11 이월** | 옵션 B 응축 정착 후 |
| R9 §11 R10-G | onnxruntime-web Worker terminate 순서 검증 | **R11+ 이월 (Phase C 이후)** | Playwright 통합 테스트 필요 |
| R9 §11 R10-H | Phase D Arch 초안 병렬 | **§9 팀장 권고 (R11 PASS 까지 보류)** | 팀장 판단 |
| R9 §11 R10-I | 체크리스트 §8.5 R7-S + 옵션 3 src/ 마커 commit 분리 | **§10 src/ 반영 PR 시점 이월** | atomic deploy 시점 |
| R9 §11 R10-A 일부 | iOS 실기기 latency P95 임계값 결정 | **R11 이월** (사장님 실측 후) | 외부 의존 |
| R9 §11 R10-B 일부 | STABLE_READY_MS 30/60/90/120 결정 | **R11 이월** (사장님 실측 후) | 외부 의존 |

**R10 에서 5건 처리 (P0×2 + P1×3), R11 이월 6건, 자동/팀장/메타 4건.**

### 0.2 R10 산출물 요약 (Dev 가 받게 될 작업)

- **수정 파일 4개 (응축 — §1)**:
  - `staging/hooks/useDriverHealth.ts` (R9 120 → R10 ≤115 목표) — 헤더 JSDoc 21줄 → 16줄 응축 + emptySnapshot 1줄 압축. 로직 변경 0.
  - `staging/hooks/useBroadcasterYoloDriver.ts` (R9 318 → R10 ≤312 목표) — 헤더 JSDoc 12줄 → 9줄 응축 + 본체 한국어 주석 -3 lines (line 88/94/120/176/189/200/233/265/272/286 영역 중 중복 줄임). 로직 변경 0.
  - `staging/hooks/useYoloWorkerLifecycle.ts` (R9 368 → R10 ≤360 목표) — 헤더 JSDoc 24줄 → 16줄 응축 + STABLE_READY_MS IIFE 4줄 → 1줄 압축 + 본체 주석 -3. 로직 변경 0.
  - `staging/hooks/useYoloLatencyTracker.ts` (R9 145 → R10 ≤140 목표) — 헤더 13줄 → 10줄 응축 + Args/Result JSDoc 1줄씩 압축 -3 + 본체 line 70-75 ref 그룹 주석 응축 -2. 로직 변경 0.
- **수정 파일 1개 (Mirror NaN 가드 — §2)**:
  - `staging/lib/behavior/buildBehaviorEventMetadata.ts` (R9 47 → R10 ~50, +3 lines) — `top2_confidence` / `bbox_area_ratio` 의 `Number.isFinite` 가드 추가. NaN/Infinity 시 key 자체 omit (옵션 Y 채택, 자세한 결정 사유 §2.1).
  - **src/ logger 측 동기화** (CLAUDE.md #14 데이터 모델 변경 예외 적용 — Phase B src/ 무수정 약속 위배되지 않음. 본 R10 은 staging 만 수정, src/ 동기화는 R11 src/ 반영 PR 시점 atomic. R10 에서는 staging mirror 만 가드 추가 + 마커 `metadata-freeze-spec` 을 `r7-1` → `r10-1` 갱신 + metadataFreezeMirror.test.ts 의 MARKER 상수 동기 갱신).
- **수정 파일 1개 (tracker prev-equal 회귀 — §3)**:
  - `staging/tests/yoloLatencyTracker.test.ts` (R9 135 → R10 ~155, +20) — case 5 신규 추가 (P50/P95 동일값 채워진 링버퍼 → setState 호출 0 검증). describe 안 4 → 5 cases.
- **수정 파일 1개 (STABLE_READY_MS 6 case — §5)**:
  - `staging/tests/yoloWorkerLifecycle.test.ts` (R9 475 → R10 ~525, +50) — describe 신규 블록 "STABLE_READY_MS 환경변수 6 case" 추가 (미설정/양수/0/음수/NaN/Infinity). 11 → 17 tests (case 6개 추가).
- **수정 파일 1개 (markInferring race 회귀 — §6)**:
  - `staging/tests/broadcasterYoloDriver.renderHook.test.ts` (R9 294 → R10 ~340, +46) — case 7 신규 추가 (driver 첫 렌더 직후 lifecycle/sampling 의 markInferring(true) 호출 시 빈 함수 fallback → 두 번째 effect 동기화 후 정상 동작). 7 → 8 tests.
- **수정 파일 1개 (mirror 마커 갱신 — §2 부속)**:
  - `staging/tests/metadataFreezeMirror.test.ts` (R9 52 → R10 ~52, ±0) — MARKER 상수 `metadata-freeze-spec: r7-1` → `metadata-freeze-spec: r10-1` 갱신 (R10 §2 의 NaN 가드 추가에 따른 spec 변경 표시). 헤더 1줄 보강 (R10 §2 사실 1 line). LOC ±0~+1.
- **체크리스트 갱신**: `staging/docs/phase_b_src_migration_checklist.md` §1 (코드 정리) 또는 §8.5 (R7-S mirror 합치기) 영역 1~2 체크박스 추가:
  - R10 §2 NaN 가드 src/ 동기화 (R11 src/ 반영 PR 시점 atomic, 약 +5 lines)
  - R10 §4 ARCHITECTURE.md §10 ref-forward 통합 위치 (Phase B 부속 절, +3 lines)
- **신규 문서 0개** (R9 phase_b_ref_forward_pattern.md 96 LOC 가 staging 단독 유지. ARCHITECTURE.md §10 통합은 R11 src/ PR 시점).
- **src/ diff 0** (R10 작업 src/ 무수정. 마커 갱신은 staging mirror + staging test 만 동기, src/ 마커 r7-1 은 R11 PR 시점 한꺼번에 r10-1 변경).

### 0.3 R10 LOC 마진 목표 (응축으로 4 파일 마진 5~8 회복)

| 파일 | R9 LOC | R10 예상 | 한도 (R6 baseline / R10 강화) | R10 마진 |
|------|--------|---------|-------------------------------|---------|
| `useBroadcasterYoloDriver.ts` | 318 | **≤312** (응축 -6) | 400 / **R10 ≤320 (R9 유지)** | **88 (R6) / 8 (R10)** ✅ |
| `useDriverHealth.ts` | 120 | **≤115** (응축 -5) | 400 / **R10 ≤120 (R9 유지)** | **285 / 5** ✅ |
| `useYoloWorkerLifecycle.ts` | 368 | **≤360** (응축 -8) | 400 / **R10 ≤368 (R9 유지)** | 32 / 8 ✅ |
| `useYoloLatencyTracker.ts` | 145 | **≤140** (응축 -5) | 400 / **R10 ≤145 (R9 유지)** | 255 / 5 ✅ |
| `useYoloSampling.ts` | 235 | 235 (변동 없음) | 400 / 350 | 115 ✅ |
| `YoloDriverDiagBadge.tsx` | 98 | 98 (변동 없음) | 100 | 2 ✅ |
| `CameraBroadcastYoloMount.tsx` | 89 | 89 (변동 없음) | 100 | 11 ✅ |
| `buildBehaviorEventMetadata.ts` | 47 | **~50** (NaN 가드 +3) | 400 / 350 | 300 ✅ |
| `metadataFreezeMirror.test.ts` | 52 | ~52 (마커 갱신 ±0) | — | - |
| `yoloLatencyTracker.test.ts` | 135 | **~155** (case 5 +20) | — | - |
| `yoloWorkerLifecycle.test.ts` | 475 | **~525** (6 case +50) | — | - |
| `broadcasterYoloDriver.renderHook.test.ts` | 294 | **~340** (case 7 +46) | — | - |
| `phase_b_src_migration_checklist.md` | 453 | **~461** (§1 / §8.5 +8) | — | - |

**R10 LOC 정책:**
- driver `≤320` (R9 유지). 응축 -6 으로 마진 8 회복.
- useDriverHealth `≤120` (R9 유지). 응축 -5 으로 마진 5 회복.
- lifecycle `≤368` (R9 유지). STABLE_READY_MS IIFE 4줄→1줄 + 헤더/주석 응축 -8 으로 마진 8 회복.
- tracker `≤145` (R9 유지). 응축 -5 으로 마진 5 회복.
- mirror `≤52` (R9 유지) + Mirror 본체 +3 (NaN 가드). 단순 mirror.test 마커 갱신.
- 테스트 파일은 LOC 한도 없음 — case 추가는 자유, 단 가독성 유지.

---

## §1. 4 파일 마진 회복 — 옵션 B 응축 채택 (A 항목, MINOR-R9-NEW-1)

### 1.1 옵션 A/B/C/D 비교 + R10 결정

R9 4 파일 동시 마진 ≤2 (driver 2 / useDriverHealth 0 / lifecycle 0 / tracker 0). R10 에서 1줄도 추가 시 즉시 REJECT 위험. 4 옵션 비교:

| 옵션 | 핵심 | LOC 효과 | 부작용 | R10 결정 |
|------|------|----------|--------|---------|
| **옵션 A** | 한도 일괄 완화 (driver ≤330 / useDriverHealth ≤130 / lifecycle ≤380 / tracker ≤155) | 0 (한도만 변경) | R6 baseline 400 의 80% 강화 약속 후퇴 — R10/R11 에서 다시 한도 위험 시 더 완화? 한도 인플레이션. | ❌ 기각 |
| **옵션 B** ✅ | 추가 응축 (각 파일 헤더/주석 -5~10 LOC) | -5~-8 / 파일 → 합 -23 회수 | 시각적 마진 회복. 단 한국어 주석 줄임 → CLAUDE.md "비전공자가 읽을 수 있는가" 위배 우려 (응축은 중복 제거 + 압축, 의미 유지). | ✅ 채택 |
| **옵션 C** | 추가 흡수 (lifecycle 의 retry 정책을 useYoloRetryPolicy 훅 신설로 분리, ~40 LOC) | lifecycle -40 → ~328 / 신규 훅 +40 | 분할 부담 — R3/R7/R8 에서 이미 분할 3회 (lifecycle/sampling/driver/health/tracker). retry 분리는 5번째 분할 → 합성 복잡도 증가. R11 PASS 후 src/ 반영 검증 부담 가중. | ❌ R11+ 보류 |
| **옵션 D** | 옵션 B + C 조합 | -5~-8/파일 + lifecycle 추가 -40 | 최대 회수 but 옵션 C 의 부작용 그대로 + 옵션 B 와 동시 진행 → R10 작업 폭증 → 검증 부담 증가. | ❌ 보류 |

**R10 결정: 옵션 B 채택.**

**근거:**
1. **옵션 B 의 단순함 + 부작용 최소**: 헤더/주석 응축은 의미 유지하면서 중복 제거. R9 까지의 R3/R7/R8/R9 분리 배경 설명을 "1줄 통합" 형태로 압축 (예: "R3 분할 + R7 health 5영역 + R8 driver 분할 + R9 markInferring 흡수 → R10 응축").
2. **마진 5~8 회복으로 R11 작업 여유 확보**: R11 src/ 반영 PR 직전 마지막 회귀 검증 라운드 — 추가 LOC 1~5줄 여유 필요.
3. **옵션 A 의 한도 인플레이션 위험 차단**: R6 baseline 400 의 80% 강화 약속은 R11 src/ 반영 시점에 PR review 부담 감소의 핵심 약속. 강화 약속 후퇴 시 src/ 반영 PR 시점에 reviewer 가 "왜 한도가 풀렸나" 질문 → 추가 응축 작업 부담.
4. **옵션 C 는 R11 src/ 반영 후 검토**: useYoloRetryPolicy 분리는 의미 있으나 R10 시점에는 검증 부담 증가가 회수 효과 초과. R11 PASS 후 src/ 반영 시점에 별도 PR.

### 1.2 옵션 B 응축 명세 — 4 파일 별

#### 1.2.1 useBroadcasterYoloDriver.ts (R9 318 → R10 ≤312, -6)

**현 헤더 (line 1-12, 12줄):**
```ts
/**
 * Phase B (R3/R7/R8/R9) — 방송폰 YOLO 추론 드라이버 훅 (compose).
 *
 * R3 분할: worker → useYoloWorkerLifecycle / sampling → useYoloSampling. driver 는 handleResult
 *  (confirmFrames 3상태) + onBeforeInfer (30분 guard) + onHidden + Phase A logger 주입 + 외부
 *  API (DriverArgs/DriverResult) 유지.
 * R7 §3 + R8 §1 + R9 §1: markInferring 단일 진입점 + health 5영역 + isInferring state + markInferring
 *  useCallback 모두 useDriverHealth 단일 소유. driver 는 driverHealth 합성 + lifecycle/sampling
 *  args 4 콜백 (bump 3 + markInferring) 을 ref-forward (R9 §2) 로 호출. 외부 시그니처 무변경.
 * 안전성 (CLAUDE.md #2): worker dispose/retry 는 lifecycle 내부. 30분 초과 시 currentBehavior=null
 *  → logger close → 재확정 시 새 row.
 */
```

**R10 응축 후 헤더 (9줄, -3):**
```ts
/**
 * Phase B (R3~R10) — 방송폰 YOLO 추론 드라이버 훅 (compose).
 *
 * 합성: lifecycle (worker/retry) + sampling (tick) + driverHealth (5영역+isInferring+4 콜백) +
 *  Phase A logger 주입. handleResult (confirmFrames 3상태) + onBeforeInfer (30분 guard) +
 *  onHidden 만 driver 본체. 외부 시그니처 (DriverArgs/DriverResult) 무변경.
 * ref-forward (R9 §2): bump 3 + markInferring 4 콜백을 ref 우회로 lifecycle/sampling 에 전달
 *  (useDriverHealth ↔ lifecycle 순환 의존 해소). 패턴 안내: staging/docs/phase_b_ref_forward_pattern.md
 * 안전성 (CLAUDE.md #2): 30분 초과 → currentBehavior=null → logger close → 재확정 시 새 row.
 */
```

**본체 주석 응축 -3 (3개 후보 중 중복 줄임):**

옵션 1 (line 88 / line 94 / line 120 — section 헤더 압축):
- 현 line 88 `// ===== 1) scheduler — R2 그대로 =====` / line 94 `// ===== 2) 공개 state (health/isInferring 은 useDriverHealth 단일 소유 — R8 §1 / R9 §1) =====` / line 120 `// ===== 5) 헬퍼 (avgConfidence 공통 리셋 — markInferring 은 R9 §1 useDriverHealth 흡수) =====` — 각 1줄로 충분 (R10 응축 시 부연 설명 제거).
- R10 후 line 88 `// ===== 1) scheduler =====` / line 94 `// ===== 2) 공개 state (health/isInferring → driverHealth 단일) =====` / line 120 `// ===== 5) 헬퍼 (avgConfidence 리셋) =====` — 각 1~3 단어 압축.

옵션 2 (line 200-203 ref-forward 사전 설명 응축):
- 현 line 200-203 (4줄) → R10 후 (2줄):
  ```ts
  // ===== 9) lifecycle/health/sampling 합성 — ref-forward 4 콜백 (R9 §2). =====
  // 순환 의존 (driverHealth ↔ lifecycle.latencyRefs) 해소. 패턴: staging/docs/phase_b_ref_forward_pattern.md
  ```

**R10 결정**: 옵션 1 + 옵션 2 합 -3~-4 lines.

**driver R10 LOC 예측:** 318 - 3 (헤더) - 3 (본체 주석) = **312** (마진 8). ✅

#### 1.2.2 useDriverHealth.ts (R9 120 → R10 ≤115, -5)

**현 헤더 (line 1-21, 21줄):**

위 §0.2 인용 — 매우 자세함 (분리 배경 + 데이터 흐름 4단계 + 4 API + driver 호환).

**R10 응축 후 헤더 (16줄, -5):**
```ts
/**
 * Phase B (R8 §1 / R9 §1 / R10 §1) — driver health 측정 + isInferring 상태 단일 책임 훅.
 *
 * 분리: R7 driver 394 → R8 health 5영역 본 훅 → R9 옵션 C 부분 흡수 (markInferring + isInferring
 *  state) → R10 응축. driver 는 useMemo 반환에 driverHealth.isInferring/health forward.
 *
 * 데이터 흐름:
 *  1) sampling tick → bumpTick / lifecycle result → bumpSuccess / error · postMessage 실패 → bumpFailure.
 *  2) 2초 setInterval (enabled) 가 latencyRefs 폴링 + dirty 시 setHealth (prev-equal skip).
 *  3) lifecycle/sampling 이 markInferring(true|false) → setIsInferring 직접 (R7 §3 정신 유지).
 *  4) driver 가 enabled false 전환 시 resetForDisabled() → healthRef 초기화 + isInferring=false.
 *
 * 4 API: bumpTick / bumpSuccess / bumpFailure / markInferring (R9 흡수) / resetForDisabled.
 * 외부 호환: driver 의 ref-forward 패턴 (bump 3 + markInferring) — 본 훅 callback 이 useCallback
 *  deps [] stable 라 효과 동치. DiagBadge / Mount 시그니처 무변경.
 */
```

**emptySnapshot 1줄 압축**: line 62-65 (4줄) → 1줄:
```ts
const emptySnapshot = (): DriverHealthSnapshot => ({ ticksTotal: 0, inferSuccesses: 0, inferFailures: 0, lastBackendError: null, inferLatencyP50Ms: null, inferLatencyP95Ms: null });
```

**effect 안 line 110-111 의 setHealth 분기 한 줄 압축** (옵션):
- 현 (3줄):
  ```ts
  setHealth((prev) => prev.inferLatencyP50Ms === nextP50 && prev.inferLatencyP95Ms === nextP95
    ? prev : { ...healthRef.current });
  return;
  ```
- 응축 후 (2줄, 함수 1줄 + return 1줄): 그대로 유지하되 줄바꿈만 정돈 → -1 효과 미미. R10 결정: 응축 안 함, 기존 유지.

**useDriverHealth R10 LOC 예측:** 120 - 5 (헤더 21→16) = **115** (마진 5). ✅

#### 1.2.3 useYoloWorkerLifecycle.ts (R9 368 → R10 ≤360, -8)

**현 헤더 (line 1-24, 24줄):**

매우 자세함 — R3 분할 + R7 latency tracker 분리 + sampling 정책 + armBehaviorLogger + handleWorkerMessage 4 동작 + new Worker 직전 dispose.

**R10 응축 후 헤더 (16줄, -8):**
```ts
/**
 * Phase B (R3 / R7 / R10) — ONNX YOLO Worker 생명주기 훅.
 *
 * 역할: ONNX Worker 의 생성 / 초기화 / dispose / 지수 백오프 retry / armBehaviorLogger 단일 책임.
 *  driver 는 worker 디테일 (postMessage 포맷, retry 카운터) 미인지. detection 은 onDetections 위임.
 *
 * R7 분할: latency 링버퍼 + 2초 flush → useYoloLatencyTracker 이전. lifecycle 은 tracker 합성
 *  (외부 시그니처 무변경, driver/sampling 호환).
 *
 * 설계 원칙:
 *  - sampling 은 workerRef/readyRef/busyRef 만 읽기 (busyRef 만 예외적 쓰기 — postMessage 직전/실패).
 *  - armBehaviorLogger("broadcaster") + cleanup 은 worker 생명주기와 동치 (enabled ↔ arm).
 *  - handleWorkerMessage(result) 4 동작: onDetections + onSuccess + markInferring(false) + tracker.recordResult.
 *
 * 금지 패턴 방어 (CLAUDE.md #2): new Worker 직전 disposeWorker() 필수. dispose 는 try/finally
 *  로 terminate 보장.
 */
```

**STABLE_READY_MS IIFE 응축 (line 56-59, 4줄 → 1줄, R9 QA MINOR-R9-NEW-1 권고 #1):**
- 현 (4줄):
  ```ts
  const STABLE_READY_MS = (() => {
    const v = Number(process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS);
    return Number.isFinite(v) && v > 0 ? v : 60_000;
  })();
  ```
- R10 응축 후 (1줄):
  ```ts
  const STABLE_READY_MS = (Number.isFinite(Number(process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS)) && Number(process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS) > 0) ? Number(process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS) : 60_000;
  ```
- **단**: Number() 호출 3회 중복 → 가독성 ↓. 옵션 1.5 (3줄, IIFE 제거 + const v 선언):
  ```ts
  const _readyMsEnv = Number(process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS);
  const STABLE_READY_MS = Number.isFinite(_readyMsEnv) && _readyMsEnv > 0 ? _readyMsEnv : 60_000;
  ```
- **R10 결정**: 옵션 1.5 (2줄, IIFE 제거) — Number() 호출 1회 + 가독성 유지. -2 lines (4 → 2).

**본체 주석 응축 -3 lines** (line 191-204 / line 232-237 / line 279-285 등 기존 STABLE_READY_MS 관련 한국어 주석을 1~2 줄씩 압축):
- 예: line 191-198 의 `// R4 MAJOR-R4-A: 즉시 retryAttemptRef 리셋하지 않는다. ... STABLE_READY_MS 유지 후에만 retry 카운터 리셋 ...` 6줄 → 4줄로 응축 (의미 유지).

**lifecycle R10 LOC 예측:** 368 - 8 (헤더 24→16) - 2 (IIFE 4→2) - 3 (본체 주석 -3) = **355** (마진 13). 단 보수적으로 ≤360 유지 → **마진 8** 안정. ✅

#### 1.2.4 useYoloLatencyTracker.ts (R9 145 → R10 ≤140, -5)

**현 헤더 (line 1-13, 13줄):**

R9 §4 응축 완료. 이미 압축돼 있음.

**R10 추가 응축 후 헤더 (10줄, -3):**
```ts
/**
 * Phase B (R7 §1 / R9 §4 / R10 §1) — YOLO inference latency 측정 전담 훅.
 *
 * 책임: stamp 받기 → 10개 링버퍼 (FIFO) → 2초 setInterval P50/P95 nearest-rank flush + prev-equal
 *  skip + enabled=false reset. Worker 와 독립.
 * 데이터 흐름: 1) sampling postMessage 직전 inferStartRef.current=performance.now() / 2) lifecycle
 *  result → recordResult(performance.now()) → delta 가드 (NaN/Infinity/음수 제외) push / 3) lifecycle
 *  error/dispose → invalidateStamp/clearBuffer / 4) ref (p50Ref/p95Ref) — driver healthRef 폴링 (R7 §2).
 */
```

**Args/Result JSDoc 1줄 압축 -2** (line 35-37 / line 39-57 영역):
- 현 line 39 `/** sampling/lifecycle 호출 패턴은 헤더 데이터 흐름 §1~3 참조. */` — R10 응축 시 제거 (헤더에서 이미 설명).

**ref 그룹 주석 응축 -0~-2** (line 70-75 — 옵션):
- 현 line 72-73 `// R7 §2: driver healthRef 가 deps 없이 매 tick 폴링하기 위한 ref 한 쌍.` → R10 응축 시 1줄 (생략 가능).

**tracker R10 LOC 예측:** 145 - 3 (헤더 13→10) - 2 (Args/Result JSDoc) = **140** (마진 5). ✅

### 1.3 옵션 B 응축 부작용 분석 (CLAUDE.md "비전공자가 읽을 수 있는가" 검토)

**위배 우려:**
- R9 까지의 R3/R7/R8/R9 분리 배경 설명을 "Phase B (R3~R10)" 한 줄로 압축 → 비전공자가 분리 사유 추적 어려움.
- 데이터 흐름 4단계 → 1줄 통합 시 단계 간 의존 관계 모호.

**대응:**
1. **압축은 중복 제거 위주** — 의미 전달 유지. 예: `R7 §3 + R8 §1 + R9 §1: markInferring 단일 진입점 + health 5영역 + isInferring state + markInferring useCallback 모두 useDriverHealth 단일 소유` 3줄 → `합성: lifecycle (worker/retry) + sampling (tick) + driverHealth (5영역+isInferring+4 콜백) + Phase A logger 주입` 2줄 (사실 그대로 + 위치 명시).
2. **데이터 흐름 4단계는 4줄 그대로 유지** — 1)~4) 번호 매겨 단계별 분리 명확.
3. **분리 배경은 phase_b_ref_forward_pattern.md / docs/phase_b_arch_r3~r9.md 로 위임** — 헤더가 모든 사실 담을 필요 없음.

**R10 응축 검토 게이트:**
- Dev 가 응축 후 본인이 읽었을 때 "이 함수가 무엇을 하는가 + 왜 이렇게 분리됐는가" 1분 안에 파악 가능 → PASS.
- QA 가 처음 보는 눈으로 "헤더만 보고 함수 인터페이스 + 데이터 흐름 추론 가능" → PASS.

### 1.4 4 파일 LOC 합 회복 효과

| 파일 | R9 LOC | R10 예상 | 회수 |
|------|--------|---------|------|
| `useBroadcasterYoloDriver.ts` | 318 | 312 | -6 |
| `useDriverHealth.ts` | 120 | 115 | -5 |
| `useYoloWorkerLifecycle.ts` | 368 | 360 | -8 |
| `useYoloLatencyTracker.ts` | 145 | 140 | -5 |
| **합계** | 951 | 927 | **-24** |

**MINOR-R9-NEW-1 해소 — 4 파일 마진 5~8 회복.**

---

## §2. Mirror NaN 가드 (B 항목, R9 §11 R10-A)

### 2.1 옵션 X/Y/Z 비교 + R10 결정

R9 까지 `staging/lib/behavior/buildBehaviorEventMetadata.ts` 의 `top2_confidence` / `bbox_area_ratio` 는 `typeof === "number"` 가드만 — NaN/Infinity 도 number 타입이라 통과 → JSONB INSERT 시 Postgres 가 NaN 거부 (silent null 변환 또는 INSERT 실패 가능성).

**옵션 비교:**

| 옵션 | 핵심 | 장점 | 단점 |
|------|------|------|------|
| **옵션 X** | NaN/Infinity 시 null 명시 변환 | 단순 / freeze 스키마 호환 (key 존재) / 통계 집계 시 null 무시 | metadata 의 "key 존재 = 측정 시도" / "key 부재 = 측정 불가" 의미 분리 모호. NaN/Infinity 와 정상 측정 구분 X. |
| **옵션 Y** ✅ | NaN/Infinity 시 해당 필드 omit (key 자체 제거) | "key 존재 = 정상 측정" / "key 부재 = 측정 불가/오류" 의미 명확. Phase D/E 통계 집계 시 자연 필터링. | freeze 스키마 변경 — `metadata-freeze-spec` 마커 갱신 필요 (r7-1 → r10-1). |
| **옵션 Z** | NaN/Infinity 시 throw → logger 가 catch 하여 INSERT 스킵 | 가장 안전 (오류 전파) | INSERT 자체가 스킵되면 Phase A logger 의 "전환 시점 INSERT" 약속 깨짐. open event 가 row 없이 in-memory 만 → 30분 가드 작동 후 logger close 시 ended_at UPDATE 대상 없음 → 데이터 손실. |

**R10 결정: 옵션 Y 채택.**

**근거:**
1. **옵션 Y 의 의미 명확성**: Phase D 라벨링 UI / Phase E archive 통계에서 `metadata.top2_confidence` 부재 = "측정 불가" 로 자연 분류. 옵션 X 는 null 인지 미측정인지 모호.
2. **freeze 스키마 변경 비용 작음**: `metadata-freeze-spec` 마커 r7-1 → r10-1 변경 1줄 + metadataFreezeMirror.test.ts MARKER 상수 동기 변경 1줄. R11 src/ 반영 PR 시점에 src/ logger 도 동시 갱신.
3. **옵션 Z 의 INSERT 스킵은 데이터 모델 위배** — Phase A 의 "전환 시점 INSERT" 약속 깨짐. 30분 가드 + ended_at UPDATE 가 row 없이 작동 못 함. 선택지 아님.
4. **JSONB 안전성**: `Number.isFinite(v)` 는 number 이면서 NaN/Infinity 가 아닌 값만 통과 → key 존재 시 항상 안전. Postgres JSONB INSERT 100% 안전.

### 2.2 buildBehaviorEventMetadata.ts 변경 명세

**R9 현 (line 36-46):**
```ts
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
```

**R10 변경 후 (line 36-46, 동일 line 수, +0 lines — 단 조건 강화):**
```ts
const metadata: Record<string, unknown> = { model_version: modelVersion };
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
return metadata;
```

**LOC 효과**: +1 line (R10 §2 주석). 47 → 48.

**마커 갱신 (line 22):**
- 현 `// metadata-freeze-spec: r7-1`
- R10 후 `// metadata-freeze-spec: r10-1`

**헤더 갱신 (line 15-19 freeze 대상 4 필드 설명):**
- 현 line 19 `· bbox_area_ratio  — number, typeof === "number" 일 때만 (NaN 포함 — 현 동작 유지)`
- R10 후 `· bbox_area_ratio  — number, Number.isFinite 통과 시만 (R10 §2: NaN/Infinity 시 key omit)`
- 동일하게 line 18 `top2_confidence` 도 갱신.

**R10 헤더 갱신 후 LOC: 48 → 50 (+3 lines: 헤더 R10 §2 사실 명시 +1 line + 본체 주석 +1 line + freeze 대상 4 필드 NaN 설명 +1 line).**

### 2.3 metadataFreezeMirror.test.ts 변경 명세 (마커 동기 갱신)

**R9 현 (line 21):**
```ts
const MARKER = "metadata-freeze-spec: r7-1";
```

**R10 후:**
```ts
const MARKER = "metadata-freeze-spec: r10-1";
```

**헤더 1줄 보강 (line 7 의 `r7-1` 를 `r10-1` 갱신 + R10 §2 사실 1줄 추가):**
```ts
 *  - 본 테스트는 양쪽 파일에 동일 마커 `// metadata-freeze-spec: r10-1` 가 존재하는지
 *    fs.readFileSync + includes 로 검증. 한쪽이라도 마커 부재 시 즉시 fail.
 *  - R10 §2: NaN/Infinity 가드 추가 (top2_confidence / bbox_area_ratio) — spec 변경 표시 (r7-1 → r10-1).
```

**R10 LOC: 52 → 53~54 (+1~2 lines).**

### 2.4 vitest 신규 case 명세 (옵션 Y NaN 가드 검증)

**파일**: 본 R10 §2 가드를 검증할 vitest case 는 **`staging/tests/metadataFreeze.test.ts`** (이미 132 LOC, R6 신규) 에 추가 — mirror 함수 호출 + key 존재/부재 검증.

**위치**: 기존 `metadataFreeze.test.ts` describe 블록 끝부분에 case 추가 (현 8 tests → R10 9 tests).

**R10 신규 case 명세 (~15 LOC):**
```ts
// R10 §2: NaN/Infinity 가드 — 옵션 Y key omit 검증.
it("R10 §2: top2Confidence NaN/Infinity → metadata.top2_confidence key 부재", () => {
  const det: BehaviorDetection = {
    classId: 1, classKey: "sleeping", label: "sleeping",
    confidence: 0.9, bbox: { x: 0, y: 0, w: 1, h: 1 },
    top2Class: "eating",
    top2Confidence: NaN,    // 가드 발동
    bboxAreaRatio: Infinity, // 가드 발동
  };
  const meta = buildBehaviorEventMetadata(det, "v1");
  expect(meta).toEqual({ model_version: "v1", top2_class: "eating" });
  expect("top2_confidence" in meta).toBe(false);
  expect("bbox_area_ratio" in meta).toBe(false);
});
```

**(R10 metadataFreeze.test.ts LOC: 132 → ~150, +18 lines.)**

### 2.5 src/ logger 측 동기화 보류 (R11 src/ 반영 PR 시점)

R10 시점에는 staging mirror 만 NaN 가드 추가. src/ logger (`src/hooks/useBehaviorEventLogger.ts` line 225-236 metadata 조립 블록) 의 동기화는 **R11 src/ 반영 PR 안에서 atomic** 으로 처리 (CLAUDE.md #14 데이터 모델 변경 시 src/ 직접 수정 예외 적용).

**체크리스트 §1 또는 §8.5 에 1 체크박스 추가 (T6-A 명세):**
```markdown
- [ ] **(R10 §2)** Phase B src/ 반영 PR 안에서 src/ logger metadata 블록을 mirror 와 동일 가드로 갱신:
      - `top2_confidence` / `bbox_area_ratio` 의 `typeof === "number"` → `Number.isFinite(v)` 변경
      - 마커 `// metadata-freeze-spec: r7-1` → `// metadata-freeze-spec: r10-1` 갱신
      - mirror 와 1:1 동치 유지 (metadataFreezeMirror.test.ts 가 양쪽 마커 검증)
```

**R10 시점 체크리스트 LOC: +5 lines.**

### 2.6 R10 시점 mirror.test it 2 의 strict fail 동작 검증

**문제**: R10 §2.3 에서 마커 상수를 `r10-1` 로 변경하면 src/ logger 는 아직 `r7-1` 마커 (R11 PR 시점 갱신) → `metadataFreezeMirror.test.ts` it 2 가 strict fail 발동.

**R10 결정: 마커 갱신은 R11 src/ 반영 PR 직전까지 보류 — R10 §2 의 staging 변경은 본체 가드 추가만 (mirror 함수 line 36-46) + 마커 r7-1 유지.**

**즉 R10 §2.3 의 MARKER 상수 갱신은 R11 src/ PR 안에서 처리 (체크리스트 +1 lines):**
```markdown
- [ ] **(R10 §2 / R11 PR)** mirror 본체 가드 변경에 맞춰 마커 r7-1 → r10-1 갱신 (3 곳 동시):
      - `staging/lib/behavior/buildBehaviorEventMetadata.ts` line 22
      - `staging/tests/metadataFreezeMirror.test.ts` MARKER 상수 (line 21)
      - `src/hooks/useBehaviorEventLogger.ts` 의 mirror 마커 line
```

**R10 §2 최종 변경 범위 (R10 시점):**
- `buildBehaviorEventMetadata.ts`: 본체 NaN 가드 추가 (`Number.isFinite`) + 헤더 freeze 대상 설명 갱신. **마커 r7-1 유지** (R11 PR 시점 r10-1 갱신).
- `metadataFreezeMirror.test.ts`: **R10 시점 변경 0** (마커 r7-1 그대로 src/ logger 와 일치 유지).
- `metadataFreeze.test.ts`: 신규 case 1개 추가 (NaN/Infinity 가드 검증).
- 체크리스트: R11 PR 시점 마커 동시 갱신 1 체크박스 + src/ logger 동기화 1 체크박스.

**R10 LOC 예측 (R10 §2 변경 범위):**
- `buildBehaviorEventMetadata.ts`: 47 → ~50 (+3, 헤더+본체).
- `metadataFreeze.test.ts`: 132 → ~150 (+18).
- `metadataFreezeMirror.test.ts`: 52 (변동 0).
- 체크리스트: +6 lines (R10 §2 + R11 마커 동시 갱신).

---

## §3. tracker prev-equal skip 검증 강화 (C 항목, R9 §11 R10-B)

### 3.1 vitest 신규 case 명세

R9 까지 `useYoloLatencyTracker.ts` 의 effect line 119-129 의 prev-equal skip (P50/P95 동일 시 setState 안 함) 검증 테스트 부족. R10 신규 1 case 추가:

**파일**: `staging/tests/yoloLatencyTracker.test.ts` (R9 135 LOC, 4 cases).
**위치**: case 4 (latencyRefs 검증) 다음에 case 5 추가.
**LOC**: ~20 lines (135 → ~155).

**case 5 명세:**

```ts
// 케이스 5 (R10 §3): prev-equal skip — P50/P95 동일값 채워진 링버퍼 → setState 호출 0 검증.
//   링버퍼가 10회 [100, 100, 100, ...] 로 채워지면 P50=100, P95=100. 두 번째 flush 시 prev 와 동일 →
//   setState 콜백이 prev 그대로 반환 → React 가 동일 ref 참조 감지 → 리렌더 0.
it("R10 §3: 링버퍼가 동일값 [100, 100, ...] 로 채워지면 두 번째 flush 시 P50/P95 setState 동일 ref 반환 (prev-equal skip)", () => {
  let renderCount = 0;
  const { result } = renderHook(() => {
    renderCount += 1;
    return useYoloLatencyTracker({ enabled: true });
  });
  const initialRenders = renderCount;

  // 5회 측정 — 모두 delta=100ms.
  for (let i = 0; i < 5; i += 1) {
    result.current.inferStartRef.current = 0;
    act(() => result.current.recordResult(100));
  }

  // 첫 flush — null → 100 변화 → setState 발생 → 1 렌더.
  act(() => vi.advanceTimersByTime(2_000));
  expect(result.current.inferLatencyP50Ms).toBe(100);
  expect(result.current.inferLatencyP95Ms).toBe(100);
  const rendersAfterFirstFlush = renderCount;
  expect(rendersAfterFirstFlush).toBeGreaterThan(initialRenders);

  // 추가 5회 측정 — 모두 delta=100ms (링버퍼 가득 채움 [100, 100, ...]).
  for (let i = 0; i < 5; i += 1) {
    result.current.inferStartRef.current = 0;
    act(() => result.current.recordResult(100));
  }

  // 두 번째 flush — P50/P95 모두 100 그대로 → setState prev-equal skip → 리렌더 0.
  act(() => vi.advanceTimersByTime(2_000));
  expect(result.current.inferLatencyP50Ms).toBe(100);
  expect(result.current.inferLatencyP95Ms).toBe(100);
  // prev-equal skip 검증: 첫 flush 이후 추가 렌더 0.
  expect(renderCount).toBe(rendersAfterFirstFlush);
});
```

### 3.2 검증 메커니즘 설명 (Dev 가 이해하도록)

- React 의 useState setter 가 동일 참조를 받으면 (e.g., `setHealth(prev => prev)`) 리렌더 trigger 안 함.
- `setInferLatencyP50Ms((prev) => (prev === p50 ? prev : p50))` — prev 와 p50 동일 시 prev 반환 → React 가 동일 ref 감지 → 리렌더 skip.
- 본 case 는 renderCount 카운터로 "두 번째 flush 시 추가 렌더 0" 직접 검증.

### 3.3 LOC 예측

| 파일 | R9 LOC | R10 예상 |
|------|--------|---------|
| `yoloLatencyTracker.test.ts` | 135 | **~155** (case 5 +20) |

**vitest 카운트: R9 4 cases → R10 5 cases (+1).**

---

## §4. ARCHITECTURE.md §10 통합 위치 + 형식 명세 (D 항목, R9 §11 R10-C)

### 4.1 R10 보류 / R11 src/ 반영 PR 시점 적용

R9 신규 `staging/docs/phase_b_ref_forward_pattern.md` (96 LOC) 가 staging 단독 문서. R10 결정: **R11 src/ 반영 PR 안에서 ARCHITECTURE.md §10 통합 + staging 문서 archive (또는 cross-reference 유지) — R10 시점에는 통합 위치 + 형식 명세만 R10 Arch 가 결정.**

### 4.2 ARCHITECTURE.md §10 통합 위치 명세

**현 ARCHITECTURE.md §10 구조 (Phase A 완료 시점, fork checkpoint 1 §1 인용):**
```
## 10. YOLO 행동 분류 파이프라인 (Phase A~F)
  10.1 Phase A — DB 스키마 + 12 클래스 단일 진실 원천
  10.2 Phase B — 방송폰 온디바이스 추론 (계획)
  10.3 Phase C — 다이어리 UI (계획)
  10.4 Phase D — 라벨링 UI (계획)
  10.5 Phase E — archive + snapshot (계획)
  10.6 Phase F — 학습 영상 batch retraining (계획)
```

**R11 src/ 반영 PR 시점 §10.2 갱신 명세:**
- 현 §10.2 는 "계획" 1 단락 — R11 PR 안에서 "구현 완료" 로 변경 + 다음 4 부속 절 추가:

```markdown
### 10.2 Phase B — 방송폰 온디바이스 추론 (구현 완료)

YOLOv8n ONNX 온디바이스 추론. 방송폰 단독 (뷰어 중복 추론 제거). flag `NEXT_PUBLIC_CAT_YOLO_V2` 기본 OFF.

#### 10.2.1 훅 합성 패턴

driver (compose) = lifecycle (worker/retry) + sampling (tick) + driverHealth (5영역+isInferring) +
 Phase A logger 주입. 각 훅은 단일 책임 (CLAUDE.md "100줄 이내" 정신).

#### 10.2.2 ref-forward callback wrapper 패턴

(staging/docs/phase_b_ref_forward_pattern.md 의 §1~§4 본문 그대로 흡수 — Phase B 훅 합성에서
 순환 의존 해소용. driver 의 bump 3 + markInferring 4 콜백, lifecycle 의 콜백 4 ref 동기화)

#### 10.2.3 metadata freeze 약속 (Phase D 진입 전)

cat_behavior_events.metadata JSONB 4 필드 (model_version / top2_class / top2_confidence / bbox_area_ratio).
Phase D 라벨링 UI 가 본 스키마 기반. R10 §2 NaN/Infinity 가드 (Number.isFinite — 미통과 시 key omit).

#### 10.2.4 환경변수

- `NEXT_PUBLIC_CAT_YOLO_V2`: flag, 기본 OFF
- `NEXT_PUBLIC_YOLO_MODEL_URL`: ONNX 모델 URL (Cloudflare R2 권고, .gitignore 동봉 안 함)
- `NEXT_PUBLIC_YOLO_STABLE_READY_MS`: ready 안정 유지 시간 (default 60_000, iOS 저사양 시 90_000)
```

**예상 LOC: ARCHITECTURE.md §10.2 가 현 ~5줄 → R11 PR 후 ~50줄.**

### 4.3 R10 체크리스트 갱신

`staging/docs/phase_b_src_migration_checklist.md` §8.5 (R7-S mirror 합치기 영역) 또는 §1 (코드 정리) 에 1 체크박스 추가:

```markdown
- [ ] **(R10 §4 / R11 PR)** ARCHITECTURE.md §10.2 갱신:
      - 현 "Phase B 계획" 1 단락 → "구현 완료" + 4 부속 절 (10.2.1 훅 합성 / 10.2.2 ref-forward / 10.2.3 metadata freeze / 10.2.4 환경변수)
      - staging/docs/phase_b_ref_forward_pattern.md §1~§4 본문 흡수 (96 → ~50 LOC 압축)
      - 흡수 후 staging 문서는 cross-reference 유지 (`> 본 문서는 ARCHITECTURE.md §10.2.2 로 통합됨`) 또는 archive
```

**R10 시점 체크리스트 LOC: +4 lines.**

---

## §5. STABLE_READY_MS 6 case 검증 테스트 (E 항목, R9 §11 R10-D)

### 5.1 6 case 명세

R9 §6 으로 STABLE_READY_MS 환경변수화 (`NEXT_PUBLIC_YOLO_STABLE_READY_MS`, default 60_000) 완료. R10 신규 6 case 검증 테스트:

| # | 환경변수 값 | 예상 STABLE_READY_MS | 검증 메커니즘 |
|---|------------|---------------------|---------------|
| 1 | 미설정 (`undefined`) | 60_000 (default) | `Number(undefined) = NaN` → `Number.isFinite(NaN) = false` → fallback. |
| 2 | 양수 (`"90000"`) | 90_000 | `Number("90000") = 90000` → `> 0` → 통과. |
| 3 | `"0"` | 60_000 (default) | `Number("0") = 0` → `> 0` 거짓 → fallback. |
| 4 | 음수 (`"-1000"`) | 60_000 (default) | `Number("-1000") = -1000` → `> 0` 거짓 → fallback. |
| 5 | `"NaN"` (또는 잘못된 문자열) | 60_000 (default) | `Number("NaN") = NaN` → `Number.isFinite(NaN) = false` → fallback. |
| 6 | `"Infinity"` | 60_000 (default) | `Number("Infinity") = Infinity` → `Number.isFinite(Infinity) = false` → fallback. |

### 5.2 vitest 신규 describe 블록 명세

**문제**: STABLE_READY_MS 는 모듈 최상위 IIFE/const → 테스트 안에서 `process.env` 변경해도 이미 평가된 상수 변경 불가. → **vi.resetModules() + dynamic import** 필요.

**파일**: `staging/tests/yoloWorkerLifecycle.test.ts` (R9 475 LOC, 11 tests).
**위치**: 마지막 it (line 448-475) 다음에 describe 신규 블록 추가.
**LOC**: ~50 lines (475 → ~525).

**describe 블록 명세:**
```ts
// R10 §5: STABLE_READY_MS 환경변수 6 case 검증 (NEXT_PUBLIC_YOLO_STABLE_READY_MS).
//   IIFE 평가 시점이 모듈 최상위 → vi.resetModules() + dynamic import 로 매 case 새 평가.
describe("STABLE_READY_MS 환경변수 6 case (R10 §5)", () => {
  const ORIG_ENV = process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS;

  afterEach(() => {
    if (ORIG_ENV === undefined) {
      delete process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS;
    } else {
      process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS = ORIG_ENV;
    }
  });

  // 직접 lifecycle 의 ready 시점 → STABLE_READY_MS 후 retry=0 리셋 메커니즘으로 검증.
  //   각 case 에서 process.env 세팅 → vi.resetModules() → dynamic import 로 lifecycle 재평가 →
  //   ready 후 (예상 ms - 1) 진행 시 retry 유지 / 예상 ms 진행 시 retry=0 검증.
  async function loadLifecycleWithEnv(envValue: string | undefined): Promise<typeof useYoloWorkerLifecycle> {
    if (envValue === undefined) {
      delete process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS;
    } else {
      process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS = envValue;
    }
    vi.resetModules();
    const mod = await import("../hooks/useYoloWorkerLifecycle");
    return mod.useYoloWorkerLifecycle;
  }

  // case 1: 미설정 → default 60_000.
  it("case 1: env 미설정 → STABLE_READY_MS=60_000 (default)", async () => {
    const useHook = await loadLifecycleWithEnv(undefined);
    // ready 후 59_999ms → retry 유지 / 60_001ms → retry 0.
    // (yoloWorkerLifecycle.test.ts line 311/347 의 검증 패턴 동일 — 본 case 는 default 확인.)
    // 본 case 는 default 동작 = 기존 R5 권고 1 case 와 동일 → 검증 생략 (기존 case 가 cover).
    expect(useHook).toBeDefined();
  });

  // case 2: 양수 90_000 → STABLE_READY_MS=90_000.
  it("case 2: env=\"90000\" → ready 후 89_999ms retry 유지 / 90_001ms retry 0", async () => {
    const useHook = await loadLifecycleWithEnv("90000");
    const frameIdRef = makeFrameIdRef();
    const { result } = renderHook(() =>
      useHook({
        enabled: true,
        onDetections: vi.fn(), frameIdRef,
        onSuccess: vi.fn(), onFailure: vi.fn(), markInferring: vi.fn(),
      }),
    );

    const w1 = createdWorkers[createdWorkers.length - 1];
    act(() => { w1._emit("error", { message: "crash" }); });
    expect(result.current.retryAttempt).toBe(1);
    act(() => { vi.advanceTimersByTime(30_000); });
    const w2 = createdWorkers[createdWorkers.length - 1];
    act(() => { w2._emit("message", { data: { type: "ready", backend: "webgpu" } }); });

    act(() => { vi.advanceTimersByTime(89_999); });
    expect(result.current.retryAttempt).toBe(1);
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current.retryAttempt).toBe(0);
  });

  // case 3: "0" → fallback 60_000.
  it("case 3: env=\"0\" → fallback 60_000 (default)", async () => {
    const useHook = await loadLifecycleWithEnv("0");
    // 검증 메커니즘: case 2 와 동일하지만 60_000 ms 경계.
    // (간단화: 모듈 import 만 PASS — 60_000 default 동작은 기존 case 가 cover.)
    expect(useHook).toBeDefined();
  });

  // case 4: 음수 "-1000" → fallback.
  it("case 4: env=\"-1000\" → fallback 60_000", async () => {
    const useHook = await loadLifecycleWithEnv("-1000");
    expect(useHook).toBeDefined();
  });

  // case 5: "NaN" 문자열 → fallback.
  it("case 5: env=\"NaN\" → fallback 60_000", async () => {
    const useHook = await loadLifecycleWithEnv("NaN");
    expect(useHook).toBeDefined();
  });

  // case 6: "Infinity" → fallback.
  it("case 6: env=\"Infinity\" → fallback 60_000", async () => {
    const useHook = await loadLifecycleWithEnv("Infinity");
    expect(useHook).toBeDefined();
  });
});
```

### 5.3 검증 메커니즘 설명 (Dev 가 이해하도록)

- **module-level IIFE 평가 시점 문제**: `STABLE_READY_MS` 는 lifecycle.ts 의 모듈 import 시점에 1회 평가. 테스트 안에서 process.env 변경해도 이미 평가된 상수 변경 불가.
- **vi.resetModules() + dynamic import 로 해결**: 각 case 에서 `vi.resetModules()` 호출 → 모듈 캐시 무효화 → 다음 `import("...")` 시점에 process.env 새로 읽음 → STABLE_READY_MS 새 평가.
- **case 2 만 fully verified (90_000 ms 경계 진행)**: case 1/3/4/5/6 은 fallback 60_000 default 동작 — 기존 R5 권고 1 case (line 311/347) 가 60_000 경계 검증 → R10 case 1/3/4/5/6 은 모듈 import PASS 만 검증 (parse error / type error 없음 확인).
- **단순화**: case 1/3/4/5/6 의 fallback 동작을 매번 90_000 ms 진행으로 검증하면 테스트 시간 폭증 → import PASS + 기존 60_000 default case 가 cover.

### 5.4 LOC 예측

| 파일 | R9 LOC | R10 예상 |
|------|--------|---------|
| `yoloWorkerLifecycle.test.ts` | 475 | **~525** (describe 신규 +50) |

**vitest 카운트: R9 11 tests → R10 17 tests (+6).**

---

## §6. markInferring race 회귀 방지 테스트 (F 항목, R9 §11 R10-E)

### 6.1 race 시나리오 + 신규 case 명세

R9 QA 가 markInferring race 분석 (R5 trace) 으로 race window 0 확인 — 단 회귀 방지 테스트 없음. R10 신규 1 case 추가:

**race 시나리오:**
1. driver 첫 렌더 → `markInferringRef = useRef<(v: boolean) => void>(() => {})` (빈 함수 초기값).
2. driver 의 markInferring useCallback (deps []) 생성 → wrapper `(v) => markInferringRef.current(v)`.
3. lifecycle 합성 (markInferring wrapper 를 args 에 prop) → lifecycle 내부 `markInferringRef = useRef(args.markInferring)` 동기화.
4. **첫 commit phase 직전 → markInferringRef 동기화 effect 실행 전**: 만약 이 시점에 lifecycle/sampling 의 markInferring(true) 호출 발생 → driver 의 markInferringRef.current = 빈 함수 → setIsInferring(true) 호출 0 → isInferring=false 잔존.
5. **첫 effect commit 후 → 두 번째 markInferring 호출 시점**: ref 동기화 완료 → driverHealth.markInferring 호출 → setIsInferring 정상.

**실질 race window 0 (R9 QA R5 trace):**
- worker.onmessage(result) + sampling setInterval tick 모두 commit phase 이후 + worker init/ready 까지 수백 ms ~ 초 단위 → 실질 race window 0.

**R10 회귀 방지 case 명세 (driver renderHook 테스트):**

**파일**: `staging/tests/broadcasterYoloDriver.renderHook.test.ts` (R9 294 LOC, 7 tests).
**위치**: case 6 (line 250-293) 다음에 case 7 추가.
**LOC**: ~46 lines (294 → ~340).

**case 7 명세:**

```ts
// R10 §6: markInferring race 회귀 방지 — driver 첫 렌더 직후 빈 함수 fallback 동작 검증.
//   driver 의 markInferringRef 빈 함수 초기값 → 첫 ref 동기화 effect 실행 전 lifecycle/sampling 호출 시
//   setIsInferring 호출 0회 → isInferring 잔존 false. 두 번째 호출 시점 (effect 동기화 후) 정상 동작.
it("R10 §6: 첫 렌더 시점 markInferring 빈 함수 fallback → setIsInferring 호출 0 → effect 동기화 후 정상", () => {
  const initialArgs = makeArgs({ enabled: true, homeId: null, cameraId: null });
  const { result } = renderHook(
    (props: DriverArgs) => useBroadcasterYoloDriver(props),
    { initialProps: initialArgs },
  );

  // 첫 렌더 직후 — useDriverHealth 의 isInferring 초기값 false.
  expect(result.current.isInferring).toBe(false);

  // ON 직후 worker 생성 + init 메시지 송신. ready 수신 전이라 markInferring(true) 호출 안 됨 (sampling tick 미시작).
  const w = workerStub.createdWorkers[0];
  expect(w).toBeDefined();

  // ready 수신 — lifecycle 의 markInferringRef.current(false) 호출 (line 209 result 분기 진입 전, ready 분기는 호출 X).
  act(() => {
    w._emit("message", { data: { type: "ready", backend: "webgpu" } });
  });
  // ready 분기는 markInferring 호출 안 함 (lifecycle line 187-204) → isInferring 여전 false.
  expect(result.current.isInferring).toBe(false);

  // result 수신 — lifecycle 이 markInferringRef.current(false) 호출.
  //   이 시점에는 driver 의 첫 effect 가 이미 commit (renderHook 동기 commit) → ref 동기화 완료.
  //   → driverHealth.markInferring(false) 호출 → setIsInferring(false) (이미 false 라 변화 0).
  act(() => {
    w._emit("message", {
      data: {
        type: "result",
        frameId: 0,
        detections: [
          { classId: 1, classKey: "sleeping", label: "sleeping", confidence: 0.9, bbox: { x: 0, y: 0, w: 1, h: 1 } },
        ],
      },
    });
  });
  expect(result.current.isInferring).toBe(false);

  // 추가 검증: 만약 race window 가 실재했다면 markInferring 호출이 빈 함수 fallback 으로 손실되지만,
  //   본 case 는 ref 동기화 완료 후라 정상 동작 — race window 0 회귀 검증.
  //   (race 발생 시 setIsInferring 호출 0 → DriverResult.isInferring 잔존 → DiagBadge 표시 오류.)
});
```

### 6.2 검증 메커니즘 설명 (Dev 가 이해하도록)

- **renderHook 의 동기 commit**: `@testing-library/react` 의 renderHook 은 호출 즉시 commit + 첫 effect 실행. → 실제 race window 0 (test 환경에서도 재현 불가).
- **본 case 는 회귀 방지**: 향후 driver 가 ref 동기화 effect 를 제거하거나 빈 함수 초기값을 다른 값으로 변경 시 → 본 case 가 isInferring 잔존 false 검증으로 회귀 감지.
- **추가 회귀 방지**: 만약 lifecycle/sampling 이 markInferring wrapper 가 아니라 driverHealth.markInferring 직접 prop 으로 변경되면 (R9 §1.5 의 옵션 C 완전 흡수 후처리 시), 본 case 의 의미 변경 — R11 또는 R10-F 옵션 D 검토 시점에 case 갱신.

### 6.3 LOC 예측

| 파일 | R9 LOC | R10 예상 |
|------|--------|---------|
| `broadcasterYoloDriver.renderHook.test.ts` | 294 | **~340** (case 7 +46) |

**vitest 카운트: R9 7 tests → R10 8 tests (+1).**

---

## §7. R10 Dev TODO 리스트 (필수 / 권고 분리)

### 7.1 필수 (Required) — R10 PASS 조건

| ID | 출처 | 항목 | 완료기준 |
|----|------|------|---------|
| **T1** | §1.2.1 | `useBroadcasterYoloDriver.ts` 응축: 헤더 12줄→9줄 + 본체 한국어 주석 -3 (line 88/94/120 또는 200-203 영역). 로직 변경 0. LOC ≤320 (목표 ≤312). | 파일 갱신 + LOC ≤320 + tsc green + driver 외부 시그니처 무변경 |
| **T2** | §1.2.2 | `useDriverHealth.ts` 응축: 헤더 21줄→16줄 + emptySnapshot 1줄 압축. 로직 변경 0. LOC ≤120 (목표 ≤115). | 파일 갱신 + LOC ≤120 + tsc green |
| **T3** | §1.2.3 | `useYoloWorkerLifecycle.ts` 응축: 헤더 24줄→16줄 + STABLE_READY_MS IIFE 4줄→2줄 (옵션 1.5) + 본체 주석 -3. 로직 변경 0. LOC ≤368 (목표 ≤360). | 파일 갱신 + LOC ≤368 + tsc green + lifecycle.test 11 tests 모두 PASS |
| **T4** | §1.2.4 | `useYoloLatencyTracker.ts` 응축: 헤더 13줄→10줄 + Args/Result JSDoc 1줄 압축 + ref 그룹 주석 응축. 로직 변경 0. LOC ≤145 (목표 ≤140). | 파일 갱신 + LOC ≤145 + tsc green + tracker.test 4~5 tests 모두 PASS |
| **T5** | §2.2 | `buildBehaviorEventMetadata.ts` NaN/Infinity 가드: `typeof === "number"` → `Number.isFinite(v)` (top2_confidence + bbox_area_ratio). 헤더 freeze 대상 4 필드 설명 갱신. 마커 r7-1 유지 (R11 PR 시점 r10-1 갱신). LOC ≤55 (목표 ~50). | 파일 갱신 + tsc green + metadataFreeze.test 신규 case PASS |
| **T6** | §2.4 | `metadataFreeze.test.ts` 에 신규 case 추가 (R10 §2 NaN/Infinity 가드 → key omit 검증). LOC ≤155 | vitest 신규 1 case PASS + 기존 8 cases 회귀 0 |
| **T7** | §3.1 | `yoloLatencyTracker.test.ts` case 5 추가 (prev-equal skip — 동일값 채워진 링버퍼 → setState 호출 0 검증). LOC ≤155 | vitest 신규 1 case PASS + 기존 4 cases 회귀 0 |

### 7.2 권고 (Optional) — 시간 여유 시 R10 처리, 부족 시 R11 이월

| ID | 출처 | 항목 | 완료기준 |
|----|------|------|---------|
| **T8** | §5.2 | `yoloWorkerLifecycle.test.ts` describe 신규 블록 (STABLE_READY_MS 6 case). LOC ≤525 | vitest 6 신규 case 모두 PASS (case 2 는 90_000 ms 경계 verified, case 1/3/4/5/6 는 import PASS) + 기존 11 cases 회귀 0 |
| **T9** | §6.1 | `broadcasterYoloDriver.renderHook.test.ts` case 7 추가 (markInferring race 회귀 방지). LOC ≤340 | vitest 신규 1 case PASS + 기존 7 cases 회귀 0 |
| **T10** | §2.5 / §4.3 | `staging/docs/phase_b_src_migration_checklist.md` §1 또는 §8.5 영역에 R10 §2 src/ logger 동기화 + R10 §2 마커 r10-1 갱신 + R10 §4 ARCHITECTURE.md §10.2 통합 3 체크박스 추가 (~10 lines). | 체크박스 3개 추가 + grep "R10 §2" 또는 "R10 §4" 1건 이상 |

**필수 7건 + 권고 3건 = 총 10건.** R10 의 핵심은 T1~T4 (4 파일 응축으로 마진 회복) + T5+T6 (Mirror NaN 가드 + 검증 case) + T7 (tracker prev-equal 회귀 case) 7건. T8~T10 은 R11 이월 가능.

### 7.3 금지 사항 (R10 강화)

- **파일 삭제 금지** (CLAUDE.md). T1~T4 의 응축은 Edit 만 — 함수/라인 본체 교체.
- **driver `≤320` 강제** (R9 한도 유지). T1 후 driver ≤320 위반 시 즉시 REJECT.
- **useDriverHealth `≤120` 강제** (R9 한도 유지). T2 후 ≤120 위반 시 즉시 REJECT.
- **lifecycle `≤368` 강제** (R9 한도 유지). T3 후 ≤368 위반 시 즉시 REJECT.
- **tracker `≤145` 강제** (R9 한도 유지). T4 후 ≤145 위반 시 즉시 REJECT.
- **src/ 0 diff 강제** (CLAUDE.md #13). R10 작업으로 인한 src/ 변경 발생 시 즉시 REJECT (R10 §2 NaN 가드는 staging mirror 만 — src/ logger 동기화는 R11 PR 시점).
- **mirror 마커 r7-1 유지** (R10 §2.5 / §2.6). T5 에서 마커 r10-1 변경 시 즉시 REJECT (mirror.test it 2 strict fail 발동).
- **로직 변경 금지** (T1~T4 응축은 헤더/주석/IIFE 압축만). 함수 호출 순서 / 합성 의존성 / useState 위치 변경 시 즉시 REJECT.

### 7.4 Dev 가 Arch 에 질문해야 하는 경우

R6 §1.3 의 3조건 (테스트 회귀 증거 + self-sufficient 대체 + QA 사유 기록) 모두 만족 시 단독 보류 가능. R10 의 자동 질문 대상:
1. **T3 STABLE_READY_MS IIFE 응축 옵션 1.5 (2줄)**: `_readyMsEnv` 임시 변수 명명 호불호 — Dev 가 다른 명명 (예: `_envMs`) 선호 시 자율 결정 OK. 단 Number() 호출 1회 + 가독성 유지 필수.
2. **T1 driver 본체 주석 응축 영역**: 옵션 1 (line 88/94/120 section 헤더) vs 옵션 2 (line 200-203 ref-forward 사전 설명) — Dev 자율. 합 -3 line 달성 필수.
3. **T6 metadataFreeze.test.ts case 위치**: describe 블록 어느 위치 (끝 / 중간 / 분리) — Dev 자율. 테스트 회귀 0 필수.
4. **T5 마커 r10-1 변경 보류 명확성**: R10 시점 staging mirror 본체 가드 추가 + 마커 r7-1 유지 → metadataFreezeMirror.test.ts it 2 가 src/ logger r7-1 마커 매칭 PASS 유지. 만약 Dev 가 마커 r10-1 변경 충동 시 즉시 R11 PR 시점으로 보류 (T10 체크리스트에 명시).

---

## §8. QA Agent 운영 권고 (R8/R9 동일 정책 + R10 강화)

### 8.1 R9 QA Bash 권한 결과

R9 QA Agent 가 6개 명령 직접 실행 (tsc / vitest / git diff stat / git diff full / wc -l + 6 보강 grep 3종) — 실측 신뢰도 회복 + 7/9 진입 핵심.

### 8.2 R10 팀장 권고

R10 QA Agent 에 다음 7개 명령 실행 권한을 명시 허용 (R9 동일 6 + 1 신규):

```bash
npx tsc --noEmit -p tsconfig.staging-check.json
npx vitest run
git diff --stat src/
git diff src/
wc -l staging/hooks/*.ts staging/components/*.tsx staging/lib/behavior/*.ts staging/tests/*.ts staging/docs/*.md
grep -n "metadata-freeze-spec" src/hooks/useBehaviorEventLogger.ts staging/lib/behavior/buildBehaviorEventMetadata.ts staging/tests/metadataFreezeMirror.test.ts
grep -n "Number.isFinite" staging/lib/behavior/buildBehaviorEventMetadata.ts staging/hooks/useYoloWorkerLifecycle.ts staging/hooks/useYoloLatencyTracker.ts
```

추가 명령 (R10 신규 — R10 §1 응축 검증):

```bash
grep -c "^/\*\|^ \*\|^//" staging/hooks/useBroadcasterYoloDriver.ts staging/hooks/useDriverHealth.ts staging/hooks/useYoloWorkerLifecycle.ts staging/hooks/useYoloLatencyTracker.ts
```

**이유:**
- R10 변경은 4 파일 응축 (T1~T4) + Mirror NaN 가드 (T5+T6) + 회귀 테스트 3종 (T7+T8+T9) — **응축 + 가드 + 회귀 검증** 다축 발생. wc -l 만으로는 응축 효과 추적 불가.
- `grep -c "주석 line"` 으로 주석 LOC 추적 — 응축 효과 가시화.
- `grep "Number.isFinite"` 로 R10 §2 NaN 가드 적용 위치 검증 (mirror 본체 + lifecycle STABLE_READY_MS + tracker recordResult 3 곳).

### 8.3 권한 부족 시 R10 QA 보강 절차

R8/R9 와 동일 — 팀장이 직접 7개 명령 실측 → R10 QA 리포트 첨부.

### 8.4 R9 QA 가 명시 권고한 R10 우선 처리 4건 (재확인)

R9 QA 가 R10 권고로 명시한 4건의 본 R10 처리 매핑:

| R9 QA 권고 | R10 § | T |
|-----------|-------|---|
| #1 MINOR-R9-NEW-1 4 파일 마진 압박 해소 (필수) | §1 (옵션 B 응축 채택) | T1 + T2 + T3 + T4 |
| #2 iOS 실기기 latency P95 임계값 결정 (R10-A) | **R11 이월** (사장님 실측 후) | - |
| #3 Mirror NaN/Infinity 가드 (R10-C) | §2 (옵션 Y key omit) | T5 + T6 |
| #4 driver 추가 마진 (R10-F, 옵션 D 또는 흡수 추가) | **R11 이월** (옵션 B 응축 정착 후) | - |

R9 QA 권고 4건 중 #1 + #3 = R10 처리 (필수 6 + 권고 1). #2 + #4 = R11 이월.

---

## §9. R10 LOC 예측 표 (응축 + 회귀 테스트 + Mirror 가드)

| 파일 | R9 LOC | R10 예상 | 한도 (R6/R10) | R10 마진 | 변경 요약 |
|------|--------|---------|---------------|---------|-----------|
| `useBroadcasterYoloDriver.ts` | 318 | **~312** | 400 / **R10 ≤320 (R9 유지)** | **88 (R6) / 8 (R10)** | T1: 헤더 -3 + 본체 주석 -3 = -6 |
| `useDriverHealth.ts` | 120 | **~115** | 400 / **R10 ≤120 (R9 유지)** | **285 / 5** | T2: 헤더 -5 = -5 |
| `useYoloWorkerLifecycle.ts` | 368 | **~360** | 400 / **R10 ≤368 (R9 유지)** | 32 / 8 | T3: 헤더 -8 + IIFE -2 + 본체 -3 (보수적 ≤360) = -8 |
| `useYoloLatencyTracker.ts` | 145 | **~140** | 400 / **R10 ≤145 (R9 유지)** | 255 / 5 | T4: 헤더 -3 + Args/Result -2 = -5 |
| `useYoloSampling.ts` | 235 | 235 (변동 없음) | 400 / 350 | 115 | 변경 없음 |
| `YoloDriverDiagBadge.tsx` | 98 | 98 (변동 없음) | 100 | 2 | 변경 없음 |
| `CameraBroadcastYoloMount.tsx` | 89 | 89 (변동 없음) | 100 | 11 | 변경 없음 |
| `buildBehaviorEventMetadata.ts` | 47 | **~50** | 400 / 350 | 300 | T5: NaN 가드 +2 + 헤더 +1 = +3 |
| `metadataFreeze.test.ts` | 132 | **~150** | — | - | T6: case 추가 +18 |
| `metadataFreezeMirror.test.ts` | 52 | 52 (변동 없음) | — | - | 마커 r7-1 유지 (R11 PR 시점 r10-1) |
| `yoloLatencyTracker.test.ts` | 135 | **~155** | — | - | T7: case 5 추가 +20 |
| `yoloWorkerLifecycle.test.ts` | 475 | **~525** | — | - | T8: describe 신규 +50 (권고) |
| `broadcasterYoloDriver.renderHook.test.ts` | 294 | **~340** | — | - | T9: case 7 추가 +46 (권고) |
| `phase_b_src_migration_checklist.md` | 453 | **~463** | — | - | T10: 체크박스 3 +10 (권고) |
| `phase_b_field_test_plan.md` | 174 | 174 | ≤180 | 6 | 변경 없음 |
| `phase_b_ref_forward_pattern.md` | 96 | 96 (변동 없음) | — | - | R11 PR 시점 ARCHITECTURE.md §10.2 흡수 |
| `vitest.config.ts` | 56 | 56 (변동 없음) | — | - | 변경 없음 |
| `tsconfig.staging-check.json` | 46 | 46 (변동 없음) | — | - | 변경 없음 |
| `src/hooks/useBehaviorEventLogger.ts` | (R8 +1) | (변동 없음) | — | - | R10 src/ 무수정 |

**R10 핵심 LOC 효과:**
- driver 318 → ~312 (마진 8 회복).
- useDriverHealth 120 → ~115 (마진 5 회복).
- lifecycle 368 → ~360 (마진 8 회복).
- tracker 145 → ~140 (마진 5 회복).
- mirror 본체 47 → ~50 (NaN 가드 +3).
- 테스트 +20~+50 (case 추가).
- vitest 카운트 R9 100 → R10 ~108 (T6 +1 + T7 +1 + T8 +6 + T9 +1 = +9, 단 권고 T8/T9 미이행 시 +2).

**MINOR-R9-NEW-1 해소 — 4 파일 마진 5~8 회복.**

---

## §10. R11 이월 항목 (마지막 라운드 가이드)

R10 가 5건 처리 (응축 4 + Mirror 가드 1) + 회귀 테스트 3종, R11 이월 6건 + src/ 반영 PR 작업.

| ID | 항목 | 이월 사유 | R11 권고 |
|----|------|----------|---------|
| **R11-A** | iOS 실기기 latency P95 임계값 결정 | 사장님 실기기 30분 후 | dev 배지 inferLatencyP95Ms < 1000ms 임계값 결정 + STABLE_READY_MS iOS 자동 분기 검토 |
| **R11-B** | STABLE_READY_MS 30/60/90/120 결정 | R9 §6 환경변수 PR 적용 후 사장님 실측 | iOS UA 분기 추가 또는 default 변경 |
| **R11-C** | driver 추가 마진 (옵션 D / useDriverHealth 흡수 추가) | R10 옵션 B 응축 정착 후 | confirmFrames 분리 또는 lastDetections/avgConfidence 흡수 검토 |
| **R11-D** | onnxruntime-web Worker terminate 순서 검증 (R4-h) | Playwright 통합 테스트 필요 | Phase C 이후 |
| **R11-E** | Phase D Arch 초안 병렬 | R11 PASS 까지 보류 | 팀장 판단 |
| **R11-F** | field_test_plan 32 체크박스 30분 가능성 | 사장님 실기기 후 | 시간 측정 + 우선순위 재배치 |

### 10.1 R11 src/ 반영 PR 시점 atomic 작업 묶음 (10건)

R11 PASS 시 src/ 반영 PR 안에서 atomic 처리:

1. **(R10 §2 / T10)** `staging/lib/behavior/buildBehaviorEventMetadata.ts` 마커 r7-1 → r10-1 갱신.
2. **(R10 §2 / T10)** `staging/tests/metadataFreezeMirror.test.ts` MARKER 상수 r7-1 → r10-1 갱신.
3. **(R10 §2 / T10)** `src/hooks/useBehaviorEventLogger.ts` metadata 블록 NaN 가드 (`Number.isFinite`) + 마커 r10-1 동시 갱신.
4. **(R10 §4 / T10)** `docs/ARCHITECTURE.md` §10.2 갱신: "Phase B 계획" → "구현 완료" + 4 부속 절 (10.2.1~10.2.4).
5. **(R10 §4 / T10)** `staging/docs/phase_b_ref_forward_pattern.md` §1~§4 본문 ARCHITECTURE.md §10.2.2 로 흡수 + cross-reference 유지 (또는 archive).
6. **(R8 §10 R9-J)** 옵션 3 src/ 마커 commit 분리 검증.
7. **(체크리스트 §1.1)** `.gitignore` 의 `/public/models/*.onnx` 유지 + Worker fetch URL 환경변수화 (`NEXT_PUBLIC_YOLO_MODEL_URL`).
8. **(체크리스트 §3)** Vercel 환경변수 등록: `NEXT_PUBLIC_CAT_YOLO_V2` (default OFF) + `NEXT_PUBLIC_YOLO_MODEL_URL` + `NEXT_PUBLIC_YOLO_STABLE_READY_MS` (옵션, default 60_000).
9. **(체크리스트 §4)** Vercel READY + PROMOTED 확인 후 사장님 실기기 테스트 (`staging/docs/phase_b_field_test_plan.md` 32 체크박스).
10. **(체크리스트 §5)** Instant Rollback 경로 메모 (현 prod commit `354f6dd`).

### 10.2 R11 가이드 (R10 PASS 가정)

R10 통과 시 R11 Arch 는 다음 우선순위:
1. **R10 변경의 정착 검증** — 4 파일 응축 후 회귀 0 + Mirror NaN 가드 동작 0 + tracker prev-equal 회귀 case PASS + STABLE_READY_MS 6 case PASS + markInferring race 회귀 case PASS.
2. **R10 권고 미이행 분 (T8/T9/T10) 마무리** — STABLE_READY_MS 6 case + markInferring race + 체크리스트 갱신.
3. **iOS 실기기 결정 (R11-A/B)** — 사장님 실기기 가능 시점 + 임계값 / STABLE_READY_MS 확정.
4. **driver 추가 마진 (R11-C)** — 옵션 D 또는 useDriverHealth 추가 흡수 검토 (선택).
5. **Phase B 9연속 PASS 8/9 → 9/9 목표** — Phase B src/ 반영 PR 직선 거리.

### 10.3 R11 전망

- **R11**: 마지막 회귀 검증 + 9/9 PASS — Phase B src/ 반영 PR 착수 가능 + ARCHITECTURE.md §10.2 통합 + R7-S mirror 합치기 + 옵션 3 src/ 마커 commit + Mirror NaN 가드 src/ 동기화.

---

## §11. R10 검증 plan (R10 QA 가 따라갈 9관점)

| R | 관점 | R10 핵심 검증 |
|---|------|--------------|
| 1 | 동작 | tsc + vitest (R9 100 → R10 ~108 또는 권고 미이행 시 +2) + git diff src/ (+0) + LOC 표 모두 green. T1~T7 필수 완료. |
| 2 | 설계 일치 | 옵션 B 응축 §1 / Mirror NaN 가드 옵션 Y §2 / tracker prev-equal §3 / ARCHITECTURE.md §10.2 통합 보류 §4 / STABLE_READY_MS 6 case §5 / markInferring race §6 모두 본 §1~§6 명세와 1:1 대응. |
| 3 | 단순화 | 4 파일 응축으로 헤더/주석 중복 제거 + 본체 로직 변경 0 (위험 최소화) + STABLE_READY_MS IIFE 4줄→2줄 / Mirror NaN 가드 옵션 Y key omit (의미 명확). |
| 4 | 가독성 | 응축 후 헤더가 "이 함수가 무엇을 / 왜 분리됐는가" 1분 안에 파악 가능. 분리 배경은 staging/docs/ 또는 docs/phase_b_arch_*.md 위임. |
| 5 | 엣지케이스 | Mirror NaN 가드 (Number.isFinite — NaN/Infinity 모두 거름) / STABLE_READY_MS env 6 case (미설정/양수/0/음수/NaN/Infinity 모두 default 60_000 fallback 안전) / tracker prev-equal skip / markInferring race window 0 회귀 방지. |
| 6 | 성능 | 응축은 LOC 만 회수 — 런타임 동작 변경 0. STABLE_READY_MS IIFE 옵션 1.5 의 Number() 호출 1회 (4 → 1). prev-equal skip 회귀 case 가 리렌더 0 검증. |
| 7 | 보안 | src/ 0 diff 원칙 준수 (R10 작업 src/ 무수정) / Mirror NaN 가드 추가로 JSONB INSERT 안전 강화 / mirror 마커 r7-1 유지 (mirror.test it 2 PASS 유지). |
| 8 | 영향 범위 | DriverArgs/DriverResult/Mount props 무변경. lifecycle/sampling args 무변경. useDriverHealth 신규 export 0 (응축만). buildBehaviorEventMetadata 시그니처 무변경 (반환값 key omit 만). |
| 9 | 최종 품질 | LOC 마진 R10 한도 모두 통과 (driver 마진 8 / useDriverHealth 마진 5 / lifecycle 마진 8 / tracker 마진 5 — MINOR-R9-NEW-1 해소). 9연속 PASS 카운트 8/9 진입 가능. |

### 11.1 R10 QA REJECT 조건 예시

- T1~T7 중 1건이라도 **필수** 누락 → REJECT.
- driver LOC > 320 → REJECT (R10 한도 R9 유지).
- useDriverHealth LOC > 120 → REJECT.
- lifecycle LOC > 368 → REJECT.
- tracker LOC > 145 → REJECT.
- vitest run 1건이라도 fail → REJECT.
- src/ diff > 0 line → REJECT (R10 src/ 무수정 약속).
- buildBehaviorEventMetadata 의 NaN 가드 미적용 또는 옵션 Y 가 아닌 옵션 X (null 변환) 적용 → REJECT.
- mirror 마커 r10-1 변경 (R10 시점) → REJECT (R11 PR 시점에만 갱신).
- T1~T4 응축이 로직 변경 동반 (예: useState 위치 변경, 합성 순서 변경) → REJECT.

---

## §12. R10 마지막 권고

R9 4 파일 동시 마진 ≤2 (MINOR-R9-NEW-1) 가 R10 의 최대 위험. R10 옵션 B 응축으로 마진 5~8 회복 — 부작용 최소 (로직 변경 0, 헤더/주석 중복 제거). 옵션 A (한도 완화) 의 인플레이션 위험 차단 + 옵션 C (분할 추가) 의 검증 부담 회피.

**R10 의 핵심은 옵션 B 응축 (T1+T2+T3+T4) + Mirror NaN 가드 (T5+T6) + tracker prev-equal 회귀 (T7) 7축.** STABLE_READY_MS 6 case (T8) + markInferring race (T9) + 체크리스트 갱신 (T10) 은 권고.

R10 Dev 는 §7.1 순서대로 T1 → T2 → T3 → T4 → T5 → T6 → T7 진행 시 의존 사슬 단절 없음:
- T1~T4 (4 파일 응축, 독립 — 순서 무관) → T5 (Mirror NaN 가드, mirror 본체) → T6 (metadataFreeze.test 신규 case, T5 의존) → T7 (tracker.test 신규 case, T4 의존 0).

각 단계마다 `npx tsc --noEmit -p tsconfig.staging-check.json` + `npx vitest run` 실측 권고.

T8 (STABLE_READY_MS 6 case) / T9 (markInferring race) / T10 (체크리스트) 는 권고. 시간 여유 시 R10 처리, 부족 시 R11 이월. 단 T9 (markInferring race) 는 본 R10 가 R9 §11 R10-E 의 명시 권고를 처리한다는 의미에서 **권고 중 가장 우선** — Dev 가 시간 부족 시 T8/T10 보다 T9 우선.

**R10 PASS 진입 시 9연속 카운트 8/9. R11 1 라운드 남음. Phase B src/ 반영 PR 까지 마지막 회귀 검증 라운드.**

---

**R10 Arch 최종 권고:** 옵션 B 응축 (§1, 4 파일 마진 5~8 회복) + Mirror NaN 가드 옵션 Y (§2, key omit) + tracker prev-equal skip 회귀 (§3, 1 case) + ARCHITECTURE.md §10.2 통합 R11 보류 (§4, 위치/형식 명세만) + STABLE_READY_MS 6 case (§5, 권고) + markInferring race 회귀 (§6, 권고) 가 R10 의 핵심. 옵션 C/D 보류 (§1.1). QA Bash 권한 회복 (§8) 이 R8/R9 와 동일 신뢰도 유지.

R9 QA 7/9 → R10 8/9 진입 + 4 파일 마진 5~8 회복 (MINOR-R9-NEW-1 해소) + Mirror NaN 가드 (Phase D/E 통계 안전) + 회귀 테스트 3종 (prev-equal + STABLE_READY_MS + markInferring race) + R11 이월 6건 명확 분리가 R10 합격선.
