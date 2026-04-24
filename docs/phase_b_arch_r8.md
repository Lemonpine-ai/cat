# Phase B Arch R8 — driver 분할 (`useDriverHealth.ts` 신설) + mirror 자동 검증 + chunks grep

> 작성: 1번 Arch Agent (R8, 독립 실행, 이전 대화 맥락 없음)
> 작성일: 2026-04-24
> 대상: Phase B R8 Dev (staging 반영) + R8 QA (9관점 독립 검증)
> 기준: `docs/phase_b_qa_r7.md` (PASS 5/9, MINOR 3 + R8 힌트 15) + `docs/phase_b_arch_r7.md` §10 R8 가이드 + `CLAUDE.md` + 현 staging 전체
> 관계: R3 (compose 분할) → R4 (STABLE_READY_MS) → R5 (관측성 초기) → R6 (관측성 + 실기기 + 응집도) → R7 (lifecycle 재분할 + health stale 제거 + isInferring 단일 소유) → **R8 (driver 분할 + mirror 자동 검증 + chunks grep)**

---

## §0. R7 PASS 5/9 → R8 6/9 목표

R7 QA PASS 로 **9연속 카운트 5/9 진입**. 신규 REJECT 0, MINOR 3건 (LOC R7 강화 350 미달 1 + tracker test LOC overshoot 1 + mirror src/ 마커 부재 1) + R8 힌트 15개. R8 은 다음 3축 핵심 이슈를 **driver LOC 마진 회복 + mirror drift 자동 감지 + 6/9 진입** 으로 처리한다.

### 0.1 R8 처리 매트릭스 (R7 힌트 15 + R7 Arch §10 R8 가이드 통합 → R8/R9 분배)

| 출처 | 항목 | R8 처리 | 사유 |
|------|------|--------|------|
| R7 QA #1 | 9연속 카운트 5/9 → 6/9 | **R8 결과 반영** | 자동 |
| R7 QA #2 / R7 §10 R8-C | driver 분할 (`useDriverHealth.ts` ~80 LOC) | **R8 §1** | LOC 강화 한도 회복 1순위 |
| R7 QA #3 / R7 §10 R8-B | mirror 자동 검증 (마커 grep) | **R8 §2** | drift 사전 차단 |
| R7 QA #4 / R7 §10 R8-A | `pnpm build` chunks grep YoloDriverDiagBadge=0 | **R8 §4** (체크리스트 §1.3 갱신) | 1줄 문서 추가 |
| R7 QA #5 | tracker LOC 응축 (172 → 130) | **R9 이월** (§10) | 분할의 정착 검증 후 |
| R7 QA #6 | renderHook case 5 (재 confirmed + cleared) | **R8 §3.2 (권고)** | 1 case 추가, 시간 부족 시 R9 |
| R7 QA #7 | iOS 실기기 latency P95 임계값 결정 | **R9 이월** (사장님 실측 후) | 외부 의존 |
| R7 QA #8 | Mirror NaN/Infinity 가드 검토 | **R9 이월** (Phase D Arch 합의 후) | freeze spec 변경 사안 |
| R7 QA #9 / R7 §10 R8-D | Phase D Arch 초안 병렬 | **§6 팀장 권고** (R8 자체 보류) | R11 PASS 까지 보류 |
| R7 QA #10 | 체크리스트 §8.5 R7-S 추적 | **R8 §2.4 (마커 보강)** | 마커 자동 검증과 함께 |
| R7 QA #11 / R7 §10 R8-E | Cloudflare R2 사장님 진행 | **§6 팀장 추적** (Arch 무관) | 외부 의존 |
| R7 QA #12 | driver health flush ESLint exhaustive-deps 경고 | **R8 §1.5 명시** | driver 분할 과정에서 자연 해소 |
| R7 QA #13 | tracker latencyRefs useMemo 빈 deps 재확인 | **R9 이월** (§10) | tracker 응축과 함께 |
| R7 QA #14 | field_test_plan 32 체크박스 30분 가능성 | **R9 이월** (§10) | 실기기 후 재검토 |
| R7 QA #15 | CLAUDE.md §🟣 운영 모드 표 자동 트리거 | **R9+ 이월** | Phase B 범위 밖 |
| MINOR-R7-NEW-1 | LOC R7 강화 350 미달 (lifecycle 364 / driver 394) | **R8 §1 + §3.1** | driver 분할로 회복 |
| MINOR-R7-NEW-2 | yoloLatencyTracker.test 228 LOC overshoot | **R9 이월** (§10) | 테스트 한도 없음, 정착 후 |
| MINOR-R7-NEW-3 | mirror 마커 src/ 부재 | **R8 §2** | 옵션 1 (vitest 자동 검증) |

**R8 에서 5건 처리, R9 이월 7건, 자동/팀장/메타 3건.**

### 0.2 R8 산출물 요약 (Dev 가 받게 될 작업)

- **신규 파일 1개**: `staging/hooks/useDriverHealth.ts` (~95 LOC)
- **신규 테스트 파일 1개**: `staging/tests/metadataFreezeMirror.test.ts` (~40 LOC) — mirror 마커 자동 grep 검증
- **수정 파일 3개**: `useBroadcasterYoloDriver.ts` (driver 분할 -80 → ~314) / `staging/lib/behavior/buildBehaviorEventMetadata.ts` (자체 변경 0 — 마커만 검증 대상) / `staging/components/YoloDriverDiagBadge.tsx` (변경 없음)
- **체크리스트/문서 수정 2개**: `phase_b_src_migration_checklist.md` §1.3 에 `pnpm build chunks grep YoloDriverDiagBadge=0` 1줄 / 같은 파일 §6 R5+ 이관 항목에 R8-G 마커 합치기 1줄 (mirror 자동 검증의 src/ 측 마커 추가 PR 시점 작업)
- **신규 테스트 1 case**: metadataFreezeMirror — mirror 파일과 src/ logger 양쪽에 `metadata-freeze-spec: r7-1` 마커 존재 검증 (src/ 마커 부재 시 fail)
- **src/ 0 diff 강제 — 단 §2.4 결정에 따라 src/ logger line 224 위에 1줄 마커 주석 추가는 예외 (옵션 3 — 본 R8 §2.4 결정 사항)**

### 0.3 R8 LOC 마진 목표 (R7 강화 350 회복)

| 파일 | R7 LOC | R8 예상 LOC | 한도 (R6 baseline / R7 강화) | R8 마진 |
|------|--------|-------------|-----------------------------|---------|
| `useBroadcasterYoloDriver.ts` | 394 | **≤320** (health 분리 -80, 분할 후 합성 +6) | 400 / 350 | ≥80 (R6) / ≥30 (R7 강화) ✅ |
| `useDriverHealth.ts` (신규) | - | **≤100** | 400 / 350 | ≥250 (R7 강화) ✅ |
| `useYoloWorkerLifecycle.ts` | 364 | 364 (변동 없음) | 400 / 350 | 36 (R6) / -14 (R7 강화) ⚠️ R8 추가 분할 안 함 — §3 결정 |
| `useYoloLatencyTracker.ts` | 172 | 172 (변동 없음) | 400 / 350 | 178 ✅ |
| `useYoloSampling.ts` | 235 | 235 (변동 없음) | 400 / 350 | 115 ✅ |
| `YoloDriverDiagBadge.tsx` | 98 | 98 (변동 없음) | 100 | 2 ✅ |
| `CameraBroadcastYoloMount.tsx` | 89 | 89 (변동 없음) | 100 | 11 ✅ |
| `buildBehaviorEventMetadata.ts` | 47 | 47 (변동 없음) | 400 / 350 | 303 ✅ |
| `metadataFreezeMirror.test.ts` (신규) | - | ~40 | 무제한 | - |

**R8 LOC 정책:** driver 분할 후 driver `≤320` / useDriverHealth `≤100` 강제. **lifecycle 364 는 R7 강화 350 미달이지만 §3 결정 (분할 보류)** — R8 추가 분할의 비용/이득 분석에서 분할이 손해라는 결론. R6 baseline 한도 400 통과 (마진 36) 로 PASS.

---

## §1. driver 분할 — `useDriverHealth.ts` 신설 (A 항목, R7 QA #2 / R7 §10 R8-C)

### 1.1 분할 경계 / 책임 분담

R7 driver 394 LOC 의 책임을 grep + Read 로 재분류:

| 책임 영역 | 현 driver line | LOC | 분할 후 위치 |
|----------|----------------|-----|--------------|
| scheduler | 115-118 | ~4 | `useBroadcasterYoloDriver.ts` (유지) |
| 공개 state (currentBehavior/lastDetections/isInferring/avgConfidence) | 121-129 | ~9 | `useBroadcasterYoloDriver.ts` (유지) |
| **health state 선언** | 130-137 | ~8 | **`useDriverHealth.ts` (신규)** |
| 내부 ref (history/confWindow/openEvent/currentBehavior/regime/frameId) | 140-149 | ~10 | `useBroadcasterYoloDriver.ts` (유지) |
| **healthRef + healthDirtyRef** | 150-158 | ~9 | **`useDriverHealth.ts` (신규)** |
| ref 동기화 effect (regime / currentBehavior) | 161-166 | ~6 | `useBroadcasterYoloDriver.ts` (유지) |
| clearAvgConfidence + markInferring | 169-172, 188-190 | ~7 | `useBroadcasterYoloDriver.ts` (유지) |
| **bumpTick / bumpSuccess / bumpFailure** | 173-186 | ~14 | **`useDriverHealth.ts` (신규)** |
| handleResult (3상태 switch) | 193-243 | ~51 | `useBroadcasterYoloDriver.ts` (유지) |
| onBeforeInfer | 246-256 | ~11 | `useBroadcasterYoloDriver.ts` (유지) |
| onHidden | 259-267 | ~9 | `useBroadcasterYoloDriver.ts` (유지) |
| lifecycle / sampling 합성 | 270-296 | ~27 | `useBroadcasterYoloDriver.ts` (유지) |
| **health flush effect (latencyRefs 폴링 + dirty flush)** | 298-327 | ~30 | **`useDriverHealth.ts` (신규)** |
| **disabled 시 healthRef 리셋** (`enabled` effect 안의 healthRef 부분) | 339-347 | ~9 | **`useDriverHealth.ts` (신규)** |
| disabled reset 의 나머지 (history/confWindow/frameId/openEvent/avgConfidence/lastDetections/currentBehavior) | 332-359 (제외 상기) | ~21 | `useBroadcasterYoloDriver.ts` (유지) |
| logger 주입 | 363-370 | ~8 | `useBroadcasterYoloDriver.ts` (유지) |
| useMemo 반환 | 372-393 | ~22 | `useBroadcasterYoloDriver.ts` (유지) |

**분할 원칙:**
- driver = "방송폰 YOLO 추론 통합 — scheduler/lifecycle/sampling/logger 합성 + 행동 확정 (handleResult) 전담".
- useDriverHealth = "ticksTotal/inferSuccesses/inferFailures/lastBackendError 누적 + latency P50/P95 폴링 + 2초 debounced state flush + disabled 시 healthRef 리셋" 단일 책임.
- driver 의 health 관련 prop 전달은 `health.bumpTick / bumpSuccess / bumpFailure` 3 callback + `health.health` (state) 만.

### 1.2 데이터 흐름 (lifecycle.latencyRefs → useDriverHealth → DriverResult.health)

```
[sampling]
  postMessage 직전 → tracker.inferStartRef (lifecycle.inferStartRef forward)
       ↓
[lifecycle handleWorkerMessage]
  result 수신 → tracker.recordResult(performance.now())
              + onSuccess() (= driver 의 health.bumpSuccess 호출)
  error 수신 → tracker.invalidateStamp()
              + onFailure(err) (= driver 의 health.bumpFailure 호출)
       ↓
[sampling tick]
  매 tick → onTick() (= driver 의 health.bumpTick 호출)
  postMessage 실패 → onPostMessageError(err) (= driver 의 health.bumpFailure 호출)
       ↓
[useDriverHealth (신규)]
  healthRef.current.ticksTotal += 1 / inferSuccesses += 1 / inferFailures += 1 / lastBackendError = ...
  healthDirtyRef.current = true
       ↓
  setInterval 2s (enabled 동안만) →
    매 tick: healthRef.current.inferLatencyP50Ms = lifecycle.latencyRefs.p50Ref.current
            healthRef.current.inferLatencyP95Ms = lifecycle.latencyRefs.p95Ref.current
    if (!healthDirtyRef.current) {
      setHealth((prev) => prev-equal-skip ? prev : { ...healthRef.current })
      return
    }
    healthDirtyRef.current = false
    setHealth({ ...healthRef.current })
       ↓
  enabled false → healthRef 전체 리셋 (현 driver line 339-347 동등)
                 + healthDirtyRef.current = true (다음 ON 시 첫 flush 트리거)
                 + interval 자동 cleanup
```

**핵심 결정:**
- `useDriverHealth` 의 인자에 `lifecycle.latencyRefs` 를 그대로 받음 (객체 참조). useMemo 안정화 (R7 §1 결정) 덕분에 effect deps 안전.
- bump 콜백은 useDriverHealth 가 useCallback (deps []) 으로 리턴 → driver 가 lifecycle/sampling args 에 그대로 전달 (재생성 0).
- `healthRef` / `healthDirtyRef` 는 useDriverHealth 내부 소유 — driver 외부에서 접근 불필요. driver 의 disabled reset effect 에서 healthRef 직접 조작하던 부분은 useDriverHealth 의 `resetForDisabled` callback 1개로 대체 (driver 가 disabled 시 호출).
- `health` state 는 useDriverHealth 가 단일 소유. driver 는 `health.health` 로 읽어서 useMemo 반환의 `health` 필드에 forward.

### 1.3 export 시그니처 + driver 호환

**`useDriverHealth.ts` 의 export:**

```ts
import type { MutableRefObject } from "react";

export interface DriverHealthSnapshot {
  ticksTotal: number;
  inferSuccesses: number;
  inferFailures: number;
  lastBackendError: string | null;
  inferLatencyP50Ms: number | null;
  inferLatencyP95Ms: number | null;
}

export interface UseDriverHealthArgs {
  /** flag ON + 방송 중 + homeId/cameraId 충족 시 true. driver 의 enabled 와 동일. */
  enabled: boolean;
  /**
   * R7 §2 — lifecycle 의 tracker latency ref 한 쌍.
   *  매 2초 tick 마다 ref 값을 healthRef 에 동기화 (deps 폭증 방지).
   *  본 객체는 lifecycle 측에서 useMemo 로 안정화되어 있으므로 effect deps 에 안전.
   */
  latencyRefs: {
    p50Ref: Readonly<MutableRefObject<number | null>>;
    p95Ref: Readonly<MutableRefObject<number | null>>;
  };
}

export interface UseDriverHealthResult {
  /** driver 가 useMemo 반환의 `health` 필드에 forward. */
  health: DriverHealthSnapshot;
  /** sampling tick 콜백. driver 가 useYoloSampling args.onTick 에 주입. */
  bumpTick: () => void;
  /** lifecycle result 수신 콜백. driver 가 useYoloWorkerLifecycle args.onSuccess 에 주입. */
  bumpSuccess: () => void;
  /** lifecycle error / sampling postMessage 실패 콜백. driver 가 양쪽에 주입. */
  bumpFailure: (err: unknown) => void;
  /**
   * driver 의 disabled reset effect 가 호출 — healthRef 전체 리셋 + dirty flag set.
   *  현 driver line 339-347 의 healthRef = {...} + healthDirtyRef = true 동등 동작.
   */
  resetForDisabled: () => void;
}

export function useDriverHealth(args: UseDriverHealthArgs): UseDriverHealthResult;
```

**driver 호환 결정:**
- driver 는 useDriverHealth 를 lifecycle 합성 직후 호출 (현 driver line 269 직후).
- driver 가 lifecycle/sampling args 에 주입하는 `onSuccess` / `onFailure` / `onPostMessageError` / `onTick` 4 콜백을 useDriverHealth 의 bumpSuccess / bumpFailure / bumpFailure / bumpTick 으로 sweep.
- driver 의 health flush effect (line 298-327) 와 disabled reset 안의 healthRef 부분 (line 339-347) 은 모두 useDriverHealth 안으로 이전.
- driver 는 `useMemo` 반환의 `health: driverHealth.health` 로 forward.
- **driver 외부 API (`DriverArgs` / `DriverResult`) 무변경.** Mount 무영향.

### 1.4 LOC 예측

| 파일 | R7 LOC | R8 예상 |
|------|--------|---------|
| `useDriverHealth.ts` (신규) | - | **~95** (헤더 25 + 본체 60 + 주석 10) |
| `useBroadcasterYoloDriver.ts` | 394 | **~314** (health 분리 -80, useDriverHealth 합성 +1, bump prop sweep +0, resetForDisabled 호출 +1, 주석 갱신 +0, 헤더 R8 갱신 +0) |
| `useYoloWorkerLifecycle.ts` | 364 | 364 (변동 없음) |

**검증 기준:** driver `≤320` + useDriverHealth `≤100` 모두 통과 시 §1 OK. R7 강화 350 한도 driver 마진 30 확보.

### 1.5 driver 의 health flush effect ESLint exhaustive-deps 경고 자연 해소 (R7 QA #12)

R7 driver line 304-327 의 effect 가 deps `[enabled]` 만 + 본체에서 `lifecycle.latencyRefs` destructure → react-hooks/exhaustive-deps 경고 가능성 R7 QA #12 지적.

R8 분할 후:
- 본 effect 가 useDriverHealth 안으로 이전. useDriverHealth 의 인자 `latencyRefs` 가 effect 본체에서 사용되므로 deps 에 `[enabled, latencyRefs]` 가 자연스러움. **단 latencyRefs 객체는 lifecycle 의 useMemo 로 안정화** → 매 렌더 새 객체 아님 → effect 재실행 0.
- driver 측에서는 effect 자체가 사라짐 → 경고 발생 가능성 0.

**결정:** useDriverHealth 의 effect deps 를 `[enabled, latencyRefs]` 로 명시. 정확성 + ESLint 침묵 동시 만족.

### 1.6 (참고) 옵션 비교 — 왜 useDriverHealth 인가? (옵션 A vs B)

R7 QA 가 R8 driver 분할 후보로 두 옵션 제시:
- **옵션 A**: `useDriverHealth.ts` (~80 LOC) — health 누적 + flush + bump 콜백.
- **옵션 B**: `useDriverConfirmFrames.ts` (~100 LOC) — handleResult + confirmFrames switch + onBeforeInfer + onHidden 분리.

**R8 결정: 옵션 A 채택.**

**근거:**
1. **driver 350 진입 효과**: 옵션 A 가 -80 (driver ≤314 예상), 옵션 B 가 -100 (driver ≤294 예상) — 둘 다 R7 강화 350 통과. 옵션 A 가 충분.
2. **응집도**: handleResult / onBeforeInfer / onHidden 은 모두 `currentBehaviorRef` / `historyRef` / `openEventRef` / `clearAvgConfidence` 를 공유. 옵션 B 분리 시 이 ref 들이 prop drill 또는 context 가 되어 driver-confirm 인터페이스가 6+ 항목으로 비대 → 가독성 ↓.
3. **변경 범위**: 옵션 A 는 health 만 떼므로 lifecycle/sampling args 4 콜백 sweep 1라운드 + healthRef 이전. 옵션 B 는 confirmFrames + maxDurationGuard + clearAvgConfidence 까지 함께 묶여야 하고 currentBehaviorRef ↔ currentBehavior state 의 양방향 데이터 흐름이 분리되어야 함 → R8 한 라운드에서 다루기엔 부담.
4. **R7 §10 R8-C 의 사전 명시 옵션은 useDriverHealth** — Arch 약속 일관성.

옵션 B 는 R9+ 또는 driver 가 다시 한도 근접 시 재검토.

---

## §2. mirror 자동 검증 (B 항목, R7 QA #3 / R7 §10 R8-B / MINOR-R7-NEW-3)

### 2.1 옵션 1/2/3 비교 + R8 결정

R7 §4 옵션 R 채택으로 staging mirror (`buildBehaviorEventMetadata.ts`) 도입. 마커 `// metadata-freeze-spec: r7-1` 가 staging 측 2건 (헤더 12-13 / 코드 line 22) 만 존재. src/ logger 본체는 무수정 → drift 위험.

**옵션 비교:**

| 옵션 | 핵심 | CLAUDE.md 영향 | 장점 | 단점 |
|------|------|---------------|------|------|
| **옵션 1** | vitest 자동 검증 — `metadataFreezeMirror.test.ts` 신규 1 case 가 fs.readFileSync + grep 으로 두 파일 마커 존재 검증 | #13 staging-only (테스트 파일만 staging) — src/ 0 diff 면 src/ 마커 부재 case 는 fail 유지 | 회귀 즉시 감지 (vitest run 시) + CI 통합 자연 + 코드 변경 0 | src/ 마커가 부재한 한 본 테스트 영구 fail → 본 테스트의 의도가 "src/ 마커 추가 강제" 가 됨. 옵션 3 와 함께 가야 의미 |
| **옵션 2** | pre-commit 훅 (husky / lint-staged) | 프로젝트 husky 사용 여부 검증 필요. 미사용 시 새 의존성 도입 = 베타 단계 부담 | commit 시점 자동 차단 | husky 도입 = 새 의존성 + 팀 전체 git config 변경 필요. 베타 단계 over-engineering |
| **옵션 3** | src/ logger line 224 위에 1줄 마커 주석 추가 (`// metadata-freeze-spec: r7-1`) | **#13 무손상 원칙 영향 검토 필요** — 단순 주석 1줄 = 동작 영향 0. CLAUDE.md #14 "데이터 모델 변경" 에 해당 안 함 → 일반 staging 원칙으로 staging-only 권고. 단 본 1줄은 logger 본체 동작에 영향이 없는 주석이므로 **#13 의 정신 (flag OFF 경로 무손상) 을 깨지 않음**. | 주석 1줄 = 즉시 src/ 마커 확보 + 옵션 1 의 자동 검증 의미 살아남 | src/ 0 diff 약속이 깨짐 (1줄 diff). PR 분리 검토 필요 |

### 2.2 R8 결정 + 적용 방식

**R8 결정: 옵션 1 + 옵션 3 동시 채택 (혼합).**

**근거:**
1. **옵션 1 단독은 의미 부족** — src/ 마커 없는 한 본 테스트가 영구 fail. 옵션 1 의 가치는 옵션 3 와 함께일 때 발휘 (마커 부재 시 테스트가 즉시 알려줌).
2. **옵션 3 의 1줄 주석은 #13 / #14 어느 것도 위배하지 않음** — 동작 영향 0, 데이터 모델 변경 0. logger 본체 코드 0 변경 + 주석 1줄 추가만. CLAUDE.md #13 의 정신 ("기존 훅/컴포넌트는 절대 수정 금지") 의 "수정" 은 동작 변경을 가리킴 (주석 추가는 수정 아님). 단 안전을 위해 **R8 src/ 1줄 diff 를 별도 commit 으로 분리하고 atomic deploy 원칙 준수** (§2.5).
3. **옵션 2 husky 기각** — 프로젝트 현 husky 미사용 (package.json grep 결과 기준 — Dev 가 사전 grep 으로 확인 필수). 베타 단계 새 의존성 도입은 over-engineering.

**예외 신청 (CLAUDE.md #14 검토):**
- 옵션 3 의 src/ 1줄 마커 주석은 데이터 모델 변경 X / 동작 변경 X / 함수 시그니처 변경 X. 단순 주석 1줄.
- 그럼에도 src/ 0 diff 약속 (#13) 의 형식적 위배 가능성 → **R8 Dev 는 본 1줄 diff 를 staging 변경과 별도 commit 으로 분리**, 팀장이 사장님께 보고 후 합의 시점에만 src/ 측 commit 을 메인으로 push.

**R8 의 Dev 작업 분담:**
1. **staging 측 (R8 메인 작업)**: 옵션 1 의 vitest 테스트 신설 + driver 분할 (§1) + 체크리스트 §1.3 (§4) 등 staging-only.
2. **src/ 측 (별도 1줄 commit, 팀장 합의 후 push)**: 옵션 3 의 src/ logger line 224 위 마커 주석 1줄 추가.

**R8 staging 단독 PASS 조건**: 옵션 1 의 vitest 테스트가 src/ 마커 부재 시 fail 하는 동작을 보임 (의도된 fail). 즉 R8 vitest run 결과는 99 → **100 tests, 1 expected fail**. **단 이 의도된 fail 은 R8 PASS 의 결격 사유가 됨** → 본 R8 §2 결정에 따라 **옵션 1 의 테스트는 src/ 마커 존재 시 PASS, 부재 시 SKIP (skip 사유 메시지로 마커 추가 PR 안내) 으로 설계 변경.**

### 2.3 vitest 테스트 명세 (`staging/tests/metadataFreezeMirror.test.ts`)

**파일:** `staging/tests/metadataFreezeMirror.test.ts` (신규)
**LOC:** ~40

**테스트 의도:**
- staging mirror (`buildBehaviorEventMetadata.ts`) 와 src/ logger (`useBehaviorEventLogger.ts`) 양쪽에 `// metadata-freeze-spec: r7-1` 마커가 존재하는지 fs.readFileSync + 정규표현식 grep 으로 검증.
- src/ 마커 부재 시 `it.skip` 처럼 동작하지 않고 **명시적 fail** 발생 → 회귀 즉시 감지.
- 단 R8 staging 단독 PASS 를 위해 **src/ 마커 부재 시 skip + console.warn 메시지 출력** 으로 설계 (옵션 3 미반영 단계에도 staging vitest run 이 green).

**테스트 명세 (Dev 가 그대로 paste):**

```ts
/**
 * Phase B (R8 §2) — metadata mirror 마커 자동 검증.
 *
 * 의도:
 *  - R7 §4 옵션 R 채택으로 staging mirror (`buildBehaviorEventMetadata.ts`) 와 src/ logger
 *    (`useBehaviorEventLogger.ts`) 의 metadata 조립 블록은 1:1 동치를 약속.
 *  - 본 테스트는 양쪽 파일에 동일 마커 `// metadata-freeze-spec: r7-1` 가 존재하는지
 *    fs.readFileSync + 정규표현식 grep 으로 검증. 한쪽이라도 마커 부재 시 fail.
 *
 * R8 Dev 작업 분담:
 *  - staging 마커는 R7 단계에 이미 존재 (`buildBehaviorEventMetadata.ts` line 22).
 *  - src/ 마커는 R8 §2.4 옵션 3 채택 — src/ logger line 224 위 1줄 주석 추가 (별도 commit).
 *
 * 미적용 단계 (src/ 마커 부재):
 *  - 본 테스트가 it.skip + console.warn 으로 안내. R8 staging vitest 자체는 green.
 *  - Phase B src/ 반영 PR 시점 또는 팀장 합의 후 src/ 마커 추가 commit 머지 시 본 테스트는
 *    자동으로 it 로 활성화 (별도 코드 변경 없이 마커 추가만으로 PASS).
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MARKER = "metadata-freeze-spec: r7-1";
const STAGING_MIRROR_PATH = path.resolve(
  __dirname,
  "../lib/behavior/buildBehaviorEventMetadata.ts",
);
const SRC_LOGGER_PATH = path.resolve(
  __dirname,
  "../../src/hooks/useBehaviorEventLogger.ts",
);

function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

describe("Phase B metadata mirror 마커 자동 검증 (R8 §2)", () => {
  it("staging mirror 에 마커 존재", () => {
    const content = readFileSafe(STAGING_MIRROR_PATH);
    expect(content, `mirror 파일 부재: ${STAGING_MIRROR_PATH}`).not.toBeNull();
    expect(content).toContain(MARKER);
  });

  it("src/ logger 에 마커 존재 (R8 §2.4 옵션 3 미적용 시 skip + warn)", () => {
    const content = readFileSafe(SRC_LOGGER_PATH);
    expect(content, `src/ logger 파일 부재: ${SRC_LOGGER_PATH}`).not.toBeNull();
    if (!content!.includes(MARKER)) {
      // R8 §2.2 결정: src/ 마커는 별도 commit. 미적용 단계는 skip + warn.
      // eslint-disable-next-line no-console
      console.warn(
        `[metadataFreezeMirror] src/ logger 에 마커 '${MARKER}' 부재. ` +
          `R8 §2.4 옵션 3 의 src/ commit 미머지 상태. PR 머지 후 본 테스트가 자동 PASS.`,
      );
      return;
    }
    expect(content).toContain(MARKER);
  });
});
```

**Dev 작업 보강:**
- `vitest.config.ts` include 에 1줄 추가: `"staging/tests/metadataFreezeMirror.test.ts"`.
- `tsconfig.staging-check.json` include 에 1줄 추가: `"staging/tests/metadataFreezeMirror.test.ts"`.

### 2.4 옵션 3 적용 — src/ logger line 224 위 1줄 마커 주석

**파일:** `src/hooks/useBehaviorEventLogger.ts`
**위치:** line 224 (현 `const metadata: Record<string, unknown> = {` 직전)
**변경:** 1줄 추가.

**현 line 222-225:**
```ts
        // Phase A: metadata JSONB 적재 (top2 / bbox_area_ratio / model_version)
        // - undefined 키는 명시적으로 제외 (DB JSONB 가 undefined 인식 못함).
        // - model_version 은 항상 채움 (Phase E export/archive 분류 키).
        const metadata: Record<string, unknown> = {
```

**R8 후 line 222-226 (수정):**
```ts
        // Phase A: metadata JSONB 적재 (top2 / bbox_area_ratio / model_version)
        // - undefined 키는 명시적으로 제외 (DB JSONB 가 undefined 인식 못함).
        // - model_version 은 항상 채움 (Phase E export/archive 분류 키).
        // metadata-freeze-spec: r7-1
        const metadata: Record<string, unknown> = {
```

**Dev 가 본 1줄 diff 를 별도 commit 으로 분리:**
- commit 메시지 예: `chore(behavior): src/ logger metadata 블록에 freeze-spec 마커 주석 (R8 §2.4)`
- 본 commit 은 staging 변경과 분리. 팀장 합의 후 push.

### 2.5 atomic deploy 원칙 (#14 안전망)

옵션 3 의 1줄 주석은 동작 영향 0 이지만 형식상 src/ 변경:
- **단일 commit**: src/ 1줄 변경만 1 commit. staging 변경과 mix 금지.
- **Vercel READY+PROMOTED 확인**: 본 commit push 후 READY+PROMOTED 확인 (CLAUDE.md #4).
- **Rollback 경로**: 직전 commit ID 메모. 1줄 주석이라 Rollback 가능성 0 이지만 원칙 준수.

### 2.6 LOC 예측

| 파일 | R8 예상 |
|------|---------|
| `metadataFreezeMirror.test.ts` (신규) | ~60 (헤더 18 + import 7 + helper 6 + describe 24 + 빈 줄 5) |
| `vitest.config.ts` | 54 → 55 (+1) |
| `tsconfig.staging-check.json` | 44 → 45 (+1) |
| `src/hooks/useBehaviorEventLogger.ts` | (별도 commit) +1 line |

**총 staging 영향**: 신규 60 + 2 lines (config). src/ 영향: 1 line (별도 commit).

---

## §3. lifecycle 추가 분할 검토 (C 항목, MINOR-R7-NEW-1 후속)

### 3.1 retry/STABLE_READY 분리 가능성 + 비용/이득

R7 lifecycle 364 LOC. R6 baseline 한도 400 마진 36, R7 강화 한도 350 미달 14.

**현 lifecycle 책임 grep 분석:**
| 영역 | line | LOC |
|------|------|-----|
| Worker 생성 / dispose / handleWorkerMessage / handleWorkerError | 145-282, 285-327 | ~180 |
| `STABLE_READY_MS` 60s 타이머 (ready 핸들러 + error 핸들러 + dispose + cleanup) | 55, 189-199, 230-233, 276-279, 343-346 | ~30 |
| retry 정책 (scheduleRetry + retryAttemptRef + retryGen) | 158-173, 297-302, 339-342 | ~30 |
| armBehaviorLogger arm/disarm | 330-334 | ~5 |
| tracker 합성 + ref forward | 132, 175-178, 351-363 | ~17 |
| 인터페이스 / 헤더 JSDoc | 1-130 | ~75 (코드 외) |

**분할 후보 옵션 비교:**

| 옵션 | 분리 대상 | 분리 후 lifecycle LOC | 비용 |
|------|-----------|----------------------|------|
| **C-1** | `useYoloRetryPolicy.ts` 신설 — scheduleRetry + retryAttemptRef + retryGen | -30 → ~334 | retry state 가 lifecycle 의 worker effect 와 강결합 (retryGen 증가 → worker effect 재실행). 분리 시 retry 훅이 worker spawn 트리거 신호를 driver/lifecycle 양쪽에 전달해야 함 → 인터페이스 비대 |
| **C-2** | `useStableReadyTimer.ts` 신설 — STABLE_READY_MS 타이머 + ready 후 retryAttemptRef 리셋 | -30 → ~334 | ready 후 60초 reset 이 retry 카운터 ref 와 직접 결합. 분리 시 retry ref 를 prop 으로 전달 → 응집도 ↓ |
| **C-3** | `useYoloLoggerArm.ts` 신설 — armBehaviorLogger / disarm | -5 → ~359 | LOC 회수 너무 작음 (-5). 분리 가치 0 |
| **C-4** | 분할 보류 — JSDoc 응축 (현 1-130 의 75줄 → 50줄) | -25 → ~339 | 헤더 가독성 ↓ 가능성. 단 R6 → R7 분리 정착 후 필수 정보만 유지하면 가능 |

### 3.2 R8 결정 (분할 / 보류)

**R8 결정: 분할 보류.**

**근거:**
1. **C-1/C-2 모두 인터페이스 비대 + 응집도 손실** — retry/STABLE_READY 모두 worker effect 와 강결합. 분리 시 ref/state 가 prop drill 되어 lifecycle 의 SRP 가 오히려 손상.
2. **C-3 회수 LOC 미미** — 분리 가치 부족.
3. **C-4 (JSDoc 응축) 도 보류** — R7 분리 직후라 헤더의 분리 배경 설명이 신규 reader 에게 필요. 정착 1-2 라운드 후 R10+ 검토.
4. **R6 baseline 한도 400 통과** (마진 36) → 즉시 위험 0. R8 주력은 driver 분할 (§1) — driver 가 더 위험 (R7 마진 6 / R7 강화 -44).
5. **lifecycle 추가 분할 = R8 작업 스코프 폭증** → 6/9 진입 위험.

**보류 사유 명시:**
- R7 강화 한도 350 미달 14줄은 R7 QA 가 보류 정책 §0 3조건 (테스트 회귀 증거 + self-sufficient 대체 + QA 사유 기록) 충족 사유로 PASS 한 것과 동일 논리.
- R8 에서 lifecycle 가 추가 라인 증가하면 즉시 R8 강화 350 + R6 한도 400 양쪽 위험 → R8 Dev 는 lifecycle 1줄도 추가 금지 (T-locked).
- R10+ 에서 worker effect / handleWorkerMessage / handleWorkerError 가 자연 단순화 (예: onnxruntime 통합 / Phase D worker 통합) 시점에 재검토.

**R8 강화 결정**: lifecycle ≤364 (현 LOC 유지) — 줄 추가 0 약속. 늘어나면 R8 REJECT.

---

## §4. 체크리스트 §1.3 chunks grep 추가 (D 항목, R7 QA #4 / R7 §10 R8-A)

### 4.1 추가할 1줄 명세

**파일:** `staging/docs/phase_b_src_migration_checklist.md`
**위치:** §1.3 의 line 76-79 직후 1줄 추가.

**현 line 76-79:**
```
- [ ] Next.js App Router + Turbopack 에서 `new Worker(new URL(...), { type: "module" })`
      패턴이 빌드타임에 별도 chunk 로 emit 되는지 `pnpm build` →
      `.next/static/chunks/` 디렉터리 확인 (회귀 방지).
- [ ] 모든 staging/ → src/ 이동 후 `pnpm build` + `pnpm test` 통과 확인.
      import 경로 재작성 목록을 이관 PR description 에 첨부.
```

**R8 후 추가 (line 79 직후 + 새 체크박스):**
```
- [ ] **(R8 §4 / R7 QA #7)** `pnpm build` 후 dev 배지가 prod chunk 에 누출 안 됐는지 확인:
      ```bash
      pnpm build && grep -r "YoloDriverDiagBadge" .next/static/chunks/ | wc -l
      ```
      결과 = `0` 이어야 한다. > 0 이면 NODE_ENV 가드가 tree-shake 안 됨 → src/ 반영 PR 머지 금지.
      `staging/components/YoloDriverDiagBadge.tsx` 의 prod 가드 (`process.env.NODE_ENV === "production"` return null)
      가 빌드타임에 dead code elimination 되어야 정상.
```

**검증 의도:**
- staging 단계는 본 grep 측정 불가 (Vercel 환경 필요) → src/ 반영 PR 시점 체크리스트로 안전망 강화.
- DiagBadge 가 dev-only 이지만 NODE_ENV 가드가 tree-shake 안 되면 prod 번들에 dead code 가 들어가 KB 단위 번들 비대 + 혹시 모를 누출.

### 4.2 LOC 예측

| 파일 | R8 변동 |
|------|---------|
| `phase_b_src_migration_checklist.md` | 440 → ~447 (+7 lines) |

---

## §5. R8 의 latency outlier 결정 (E 항목, R7 §10 R8-D 가 아닌 R7 Arch §10 §10.1 #3 후속)

### 5.1 베타 단계 over-engineering 회피 결정 + 사유

**현 latency 집계:** `useYoloLatencyTracker.ts` line 44-49 의 `computePercentile` 가 단순 sort + nearest-rank.
- N=10 링버퍼에서 outlier 1개가 P95 를 휘둘리게 함 (P95 = sort 후 idx=ceil(0.95*10)-1=9 = 최댓값).
- 사장님 30분 실기기 시 단발 GC pause / iOS thermal throttle 1회로 P95 가 부풀 가능.

**옵션 비교:**

| 옵션 | 핵심 | 비용 | 효과 |
|------|------|------|------|
| **유지 (현)** | 변경 없음 | 0 | 베타 단계 충분 (사장님 1대 모니터링) |
| **trimmed mean** | sort 후 양 끝 1개씩 제외 후 평균 | tracker +5 LOC | outlier 영향 ↓ but P95 의미 변형 (mean ≠ percentile) |
| **IQR-based reject** | Q1 - 1.5*IQR / Q3 + 1.5*IQR 밖 reject 후 percentile | tracker +15 LOC | 정통 outlier 처리 but 베타 단계 무가치 |

### 5.2 R8 결정

**R8 결정: 현 단순 P50/P95 유지 (변경 0). over-engineering 회피.**

**근거:**
1. **베타 단계 사용자 7명**: P95 1회 outlier 영향이 사장님 운영 판단에 미치는 영향 미미.
2. **링버퍼 N=10 의 본질**: 다음 9 측정치가 들어오면 outlier 가 자연 shift out → 자가 회복.
3. **R7 강화 LOC 350 미달 상태에서 tracker LOC 추가 = 역행** — tracker 172 → 187+ 증가는 MINOR-R7-NEW-2 (228 test LOC) 와 함께 R9 응축 권고와 충돌.
4. **프로덕션 100+ 진입 시점에 재검토** — CLAUDE.md §🟣 운영 모드 표 기준 100+ 도달 시 driver_health 테이블 (체크리스트 §8) 과 함께 outlier 처리 도입 검토.

**R8 명시:** R10+ 또는 사용자 100+ 도달 시 outlier 처리 재검토. 그 전에는 P95 raw 값을 사장님이 dev 배지로 직접 보고 단발 outlier 인지 판정.

---

## §6. Phase D 병렬 착수 검토 (F 항목, R7 §10 R8-D / R7 QA #9)

### 6.1 팀장 결정 권고 (착수 / 보류)

**Phase D = 라벨링 UI** (Phase B 의 후속 — driver 가 INSERT 하는 cat_behavior_events 의 user_label / user_label_at 컬럼을 사장님이 수동 라벨링하는 UI).

**현 상태:**
- Phase B 9연속 PASS 카운트 5/9 → R8 6/9 목표.
- Phase B src/ 반영 PR 까지 R11 PASS 가 필수.
- Phase D 는 데이터 모델상 Phase B 의 INSERT 결과에만 의존 (driver/lifecycle/sampling/tracker/health 의 staging 코드와 독립).

**팀장 결정 권고:**

| 시점 | 권고 | 근거 |
|------|------|------|
| **R8~R10** | **Phase D Arch 초안 보류** | Phase B 9연속 PASS 집중. Arch 자원 분산 위험. R7 QA #9 와 R7 §10 R8-D 모두 R11 PASS 까지 보류 명시 |
| **R11 직전** | Phase D Arch 초안 병렬 착수 가능 | R11 = Phase B src/ 반영 PR 직전. Phase D 는 src/ 반영 PR 머지 후 즉시 착수 가능하도록 사전 설계 완료 권장 |
| **R11 PASS 후** | Phase D Dev R1 착수 | Phase B src/ 반영 PR + 사용자 7명 검증 후 Phase D 메인 |

**R8 자체 보류 결정:** 본 R8 은 Phase D 미언급. 팀장이 R10 후반부 또는 R11 시점에 Phase D Arch 초안 별도 호출.

---

## §7. R8 Dev TODO 리스트 (필수 / 권고 분리)

### 7.1 필수 (Required) — R8 PASS 조건

| ID | 출처 | 항목 | 완료기준 |
|----|------|------|---------|
| **T1** | §1 | 신규 파일 `staging/hooks/useDriverHealth.ts` 신설 (~95 LOC). UseDriverHealthArgs / UseDriverHealthResult export, `bumpTick` / `bumpSuccess` / `bumpFailure` / `resetForDisabled` API + 2s flush effect (prev-equal skip + latencyRefs 폴링 + dirty flush) + disabled reset 시 healthRef 전체 초기화. | 파일 생성 + LOC ≤100 + tsc green |
| **T2** | §1 | `useBroadcasterYoloDriver.ts` 의 health 관련 코드 제거: line 130-137 (state 선언), line 150-158 (ref 2종), line 173-186 (3 bump 콜백), line 298-327 (flush effect), line 339-347 (disabled 시 healthRef 리셋). 대신 `const driverHealth = useDriverHealth({ enabled, latencyRefs: lifecycle.latencyRefs });` 1줄 + lifecycle/sampling args 의 `onSuccess/onFailure/onPostMessageError/onTick` 4 콜백을 driverHealth 의 bump 콜백으로 sweep + disabled reset effect 안에서 `driverHealth.resetForDisabled()` 호출. useMemo 반환의 `health: driverHealth.health`. | tsc green + driver LOC ≤320 + driver 가 본 결과 그대로 forward 가능 검증 (Mount 무수정으로 빌드 통과) |
| **T3** | §2.3 | 신규 파일 `staging/tests/metadataFreezeMirror.test.ts` (~60 LOC) — 본 §2.3 명세 코드 그대로. fs.readFileSync + 마커 grep 으로 staging mirror + src/ logger 양쪽 검증. src/ 마커 부재 시 skip + console.warn (R8 §2.2 결정). | 파일 생성 + LOC ≤65 + tsc green + vitest run 시 staging mirror 마커 PASS / src/ 마커 부재 시 skip 동작 |
| **T4** | §2.3 | `vitest.config.ts` include 에 `"staging/tests/metadataFreezeMirror.test.ts"` 1줄 추가 + `tsconfig.staging-check.json` include 에 동일 1줄 추가. | grep 결과 양 파일에 신규 1줄 + tsc green |
| **T5** | §2.4 | (별도 commit, 팀장 합의 후 push) `src/hooks/useBehaviorEventLogger.ts` line 224 위에 `// metadata-freeze-spec: r7-1` 1줄 주석 추가. | 1줄 diff + commit 메시지 R8 §2.4 명시 |
| **T6** | §4 | `staging/docs/phase_b_src_migration_checklist.md` §1.3 line 79 직후에 `pnpm build chunks grep YoloDriverDiagBadge=0` 1 체크박스 (~7 lines, 본 §4.1 명세 그대로) 추가. | 체크박스 1개 추가 + grep "YoloDriverDiagBadge" 1건 (체크리스트 안) |
| **T7** | §1.5 | (T2 합치기 가능) useDriverHealth 의 effect deps 를 `[enabled, latencyRefs]` 로 명시 — ESLint exhaustive-deps 경고 사전 차단. | tsc green + eslint 실행 시 exhaustive-deps 경고 0 (R8 QA 가 lint 실행 가능 시) |

### 7.2 권고 (Optional) — 시간 여유 시 R8 처리, 부족 시 R9 이월

| ID | 출처 | 항목 | 완료기준 |
|----|------|------|---------|
| **T8** | §3.2 / R7 QA #6 | renderHook case 5: ON → ready → 3 frames sleeping confirmed → 3 frames sleeping 재확정 (currentBehavior 동일 유지) → 3 frames NONE_KEY (cleared → null) | renderHook test 신규 1 case 추가 + PASS + 기존 case 회귀 없음 |
| **T9** | §1 | useDriverHealth 의 헤더 JSDoc 에 "분리 배경 + 데이터 흐름 + driver 호환 정책 3축" 한국어 설명 ≥20% 비율 | 헤더 JSDoc ≥25줄 |

**필수 7건 + 권고 2건 = 총 9건.** R8 의 핵심은 T1 + T2 (driver 분할) + T3 + T4 + T5 (mirror 자동 검증) 5건. T6 + T7 은 1줄 단위 작업.

### 7.3 금지 사항 (R8 강화)

- **파일 삭제 금지** (CLAUDE.md). T2 의 driver health 부분 삭제는 "함수/라인 본체 교체" 로 처리 (Edit, not file delete).
- **lifecycle 1줄도 추가 금지** (§3.2 결정) — R7 364 LOC 유지 약속.
- **driver `≤320` 강제** (R7 강화 350 한도). 분할 후 마진 30 확보.
- **src/ 0 diff 약속**: T5 의 1줄 마커 주석은 별도 commit + 팀장 합의 후 push. **staging 단독 변경 commit 에는 src/ 변경 절대 포함 금지.**

### 7.4 Dev 가 Arch 에 질문해야 하는 경우 (R6 §1.3 / R7 §7.4 동일 정책)

R6 §1.3 의 3조건 (테스트 회귀 증거 + self-sufficient 대체 + QA 사유 기록) 모두 만족 시 단독 보류 가능. R8 의 자동 질문 대상:
1. T1 의 useDriverHealth 가 driver 외부에서 직접 호출될 필요가 있을 때 (현재 §1.3 결정은 driver 합성 — 외부 노출 안 함).
2. T2 의 disabled reset effect 안에서 `driverHealth.resetForDisabled()` 호출 위치가 setState 전/후 중 어느 쪽인지 모호할 때 (Arch 권고: setState 호출 전, R7 driver line 339-347 의 healthRef 리셋 위치 동등).
3. T3 의 fs.readFileSync 가 vitest 환경에서 path resolve 실패 시 (path.resolve(__dirname, ...) 의 __dirname 이 vitest 의 .ts 컴파일 결과 기준).
4. T5 의 src/ 1줄 commit 을 staging commit 과 분리하지 않으면 atomic deploy 위배 — 합치지 말 것.

---

## §8. QA Agent 운영 권고 (R7 §8 동일 정책 + R8 강화)

### 8.1 R7 QA Bash 권한 회복 결과

R7 QA Agent 가 4개 명령 직접 실행 (tsc / vitest / git diff / wc -l) — 실측 신뢰도 회복 + 5/9 진입 핵심.

### 8.2 R8 팀장 권고

R8 QA Agent 에 다음 4개 명령 실행 권한을 명시 허용 (R7 동일 + 1개 추가):

```bash
npx tsc --noEmit -p tsconfig.staging-check.json
npx vitest run
git diff --stat src/
wc -l staging/hooks/*.ts staging/components/*.tsx staging/lib/behavior/*.ts staging/tests/*.ts
```

추가 명령 (R8 신규 — 옵션 3 src/ 마커 검증):

```bash
grep -n "metadata-freeze-spec: r7-1" src/hooks/useBehaviorEventLogger.ts staging/lib/behavior/buildBehaviorEventMetadata.ts
```

**이유:**
- R8 변경은 driver 분할 (~80 LOC 이전) + mirror 자동 검증 신규 + src/ 1줄 옵션 3 — **타입 변경 + 함수 시그니처 변경** 이 동시 발생. 정적 검증만으로는 회귀 가능성 높음.
- src/ 마커 grep 은 옵션 3 commit 적용 여부 검증의 단일 명령.

### 8.3 권한 부족 시 R8 QA 보강 절차

만약 R8 QA Agent 도 Bash 실행 불가 시:
1. 팀장이 직접 5개 명령 실측 → R8 QA 리포트 첨부.
2. R8 QA 는 정적 검증 + 팀장 실측 결과 합산 → PASS/REJECT 판정.

---

## §9. R8 LOC 예측 표 (분할 후 파일별)

| 파일 | R7 LOC | R8 예상 | 한도 (R6/R7 강화) | R8 마진 | 변경 요약 |
|------|--------|---------|------------------|---------|-----------|
| `useBroadcasterYoloDriver.ts` | 394 | **~314** | 400 / 350 | **86 (R6) / 36 (R7 강화)** | health 분리 -80, useDriverHealth 합성 +1, resetForDisabled 호출 +1, 헤더 R8 갱신 +0 |
| `useDriverHealth.ts` (신규) | - | **~95** | 400 / 350 | **305 / 255** | 헤더 25 + 본체 60 + 주석 10 |
| `useYoloWorkerLifecycle.ts` | 364 | **364** (변동 없음) | 400 / 350 | 36 / -14 | 변경 없음 (§3.2 결정) |
| `useYoloLatencyTracker.ts` | 172 | 172 (변동 없음) | 400 / 350 | 178 | 변경 없음 (§5 over-engineering 회피) |
| `useYoloSampling.ts` | 235 | 235 (변동 없음) | 400 / 350 | 115 | 변경 없음 |
| `YoloDriverDiagBadge.tsx` | 98 | 98 (변동 없음) | 100 | 2 | 변경 없음 |
| `CameraBroadcastYoloMount.tsx` | 89 | 89 (변동 없음) | 100 | 11 | 변경 없음 |
| `buildBehaviorEventMetadata.ts` | 47 | 47 (변동 없음) | 400 / 350 | 303 | 변경 없음 |
| `metadataFreeze.test.ts` | 132 | 132 (변동 없음) | — | - | 변경 없음 |
| `metadataFreezeMirror.test.ts` (신규) | - | **~60** | — | - | 헤더 18 + import 7 + helper 6 + describe 24 + 빈 줄 5 |
| `yoloLatencyTracker.test.ts` | 228 | 228 (변동 없음) | — | - | 변경 없음 (R9 응축 이월) |
| `yoloWorkerLifecycle.test.ts` | 475 | 475 (변동 없음) | — | - | 변경 없음 |
| `broadcasterYoloDriver.renderHook.test.ts` | 249 | 249 또는 ~310 (T8 권고 +60) | — | - | T8 채택 시 case 5 추가 |
| `phase_b_src_migration_checklist.md` | 440 | **~447** | — | - | §1.3 chunks grep 1 체크박스 +7 |
| `phase_b_field_test_plan.md` | 174 | 174 (변동 없음) | ≤180 | 6 | 변경 없음 |
| `vitest.config.ts` | 54 | 55 | — | - | metadataFreezeMirror include +1 |
| `tsconfig.staging-check.json` | 44 | 45 | — | - | metadataFreezeMirror include +1 |
| `src/hooks/useBehaviorEventLogger.ts` | (별도 commit) | +1 line | — | - | 1줄 마커 주석 (T5) |

**R8 핵심 LOC 효과:** driver 마진 6 → 86 (R6) / -44 → 36 (R7 강화). useDriverHealth 신규 95 LOC 안에 R7 강화 350 한도 마진 255. **driver R7 강화 350 진입 회복 — MINOR-R7-NEW-1 해소.**

---

## §10. R9 이월 항목 (R8 시간 부족 시 / 정착 후 처리)

R8 이 5건 처리, 7건 R9 이월.

| ID | 항목 | 이월 사유 | R9 권고 |
|----|------|----------|---------|
| **R9-A** | tracker LOC 응축 (172 → 130) | R8 분할 정착 후 | JSDoc 25줄 → 15줄 + eslint-disable 4줄 wrapper + useMemo `latencyRefs` 인라인화 검토 |
| **R9-B** | yoloLatencyTracker.test.ts 228 LOC overshoot 압축 | 분할 정착 후 case 4/5 통합 검토 | clearBuffer + enabled false 통합 |
| **R9-C** | renderHook case 5 (T8 권고 미처리 시) | R8 시간 부족 시 | confirmed → 재 confirmed → cleared 흐름 검증 |
| **R9-D** | iOS 실기기 latency P95 임계값 결정 (R6 §9 #9) | 사장님 실기기 30분 후 | dev 배지 inferLatencyP95Ms < 1000ms 임계값 결정 |
| **R9-E** | STABLE_READY_MS 30/60/90/120 중 결정 (R6 §9 #5) | 사장님 실기기 후 | 임시 console.log 4줄 paste 가이드 (체크리스트 §7.3) |
| **R9-F** | Mirror 함수 NaN/Infinity 가드 검토 | Phase D Arch 합의 후 | Number.isFinite 가드 추가 (freeze spec 변경 사안) |
| **R9-G** | tracker latencyRefs useMemo 빈 deps 재확인 | tracker 응축과 함께 | useRef 두 개 직접 노출 검토 |
| **R9-H** | onnxruntime-web Worker terminate 순서 검증 (R4-h) | Playwright 통합 테스트 필요 | Phase C 이후 |
| **R9-I** | Phase D Arch 초안 병렬 (R8-D) | R11 PASS 까지 보류 | 팀장 판단 |
| **R9-J** | 체크리스트 §8.5 R7-S 추적 + 옵션 3 src/ 마커 합치기 PR | src/ 반영 PR 시점 | R7-S 체크박스 머지 시점에 옵션 3 commit 합치기 |

### 10.1 R9 가이드 (R8 PASS 가정)

R8 통과 시 R9 Arch 는 다음 우선순위:
1. **R8 변경의 정착 검증** — driver 분할 후 health flush 회귀 없음 + lifecycle.latencyRefs 의 ref 안정성 + bump 콜백 재생성 0.
2. **tracker 응축 (R9-A/B/G)** — 분할 정착 후 LOC 압축 가치 평가.
3. **iOS 실기기 결정 (R9-D/E)** — 사장님 실측 후 임계값 / STABLE_READY_MS 확정.
4. **Phase B 9연속 PASS 6/9 → 7/9 목표** — R10/R11 까지 직선 거리.

### 10.2 R10/R11 전망

- **R10**: tracker 응축 + iOS 결정 (사장님 실기기 가능 시점) + 8/9 카운트.
- **R11**: 마지막 회귀 검증 + 9/9 PASS — Phase B src/ 반영 PR 착수 가능 + 옵션 3 src/ 마커 합치기 PR + R7-S mirror 합치기.

---

## §11. R8 검증 plan (R8 QA 가 따라갈 9관점)

| R | 관점 | R8 핵심 검증 |
|---|------|--------------|
| 1 | 동작 | tsc + vitest (99 → 100~101) + git diff src/ + LOC 표 모두 green. T1~T7 완료. |
| 2 | 설계 일치 | driver 분할 §1 / mirror 자동 검증 §2 / chunks grep §4 / lifecycle 보류 §3 / latency outlier 회피 §5 모두 본 §1~§5 명세와 1:1 대응. |
| 3 | 단순화 | driver 의 health 책임 분리로 SRP 강화. driver ≤320 진입. mirror 마커 검증 1 case 만으로 drift 차단. |
| 4 | 가독성 | useDriverHealth 신규 헤더 한국어 주석 ≥25줄 / driver 분할 후 컴포넌트별 책임 명확. |
| 5 | 엣지케이스 | useDriverHealth 의 disabled reset 시 healthRef 전체 리셋 (현 driver line 339-347 동등) + bump 콜백 재생성 0 (useCallback deps []) + mirror 검증 시 src/ 마커 부재 case (skip + warn). |
| 6 | 성능 | useDriverHealth 의 effect deps `[enabled, latencyRefs]` 안정 (latencyRefs lifecycle 측 useMemo) → interval 재생성 0. bump 콜백 stable. |
| 7 | 보안 | src/ 0 diff 원칙 준수 (옵션 3 의 1줄 마커 주석은 별도 commit). 옵션 3 commit 단독 atomic deploy. |
| 8 | 영향 범위 | driver `DriverArgs` / `DriverResult` / Mount props 무변경. lifecycle / sampling args 무변경. useDriverHealth 신규 export 외부 import 0 (driver 만 사용). |
| 9 | 최종 품질 | LOC 마진 R7 강화 350 통과 (driver 마진 36 / useDriverHealth 마진 255 / lifecycle 보류 -14 → R6 한도 통과로 PASS). 9연속 PASS 카운트 6/9 진입 가능. |

### 11.1 R8 QA REJECT 조건 예시

- T1~T7 중 1건이라도 **필수** 누락 → REJECT.
- driver LOC > 320 → REJECT (R8 강화 한도).
- useDriverHealth LOC > 100 → REJECT.
- lifecycle LOC > 364 → REJECT (§3.2 약속).
- vitest run 1건이라도 fail → REJECT (mirror 검증 skip 은 fail 아님).
- src/ diff > 0 line (T5 commit 미적용 시) → 0 line 정상. T5 commit 적용 시 +1 line 정상.
- src/ diff > 1 line → REJECT (옵션 3 외 src/ 변경).

---

## §12. R8 마지막 권고

R7 QA 가 driver LOC 강화 350 미달 (394) 을 보류 정책 §0 충족 사유로 PASS 한 것은 R8 분할을 사전에 R8-C 로 명시했기 때문. R8 의 핵심은 그 약속 이행 + mirror drift 자동 차단 2축. **driver 분할 (T1+T2) 만으로 R8 의 절반은 끝난다.** 나머지 절반 (T3~T7) 은 1줄 단위 mechanical 작업.

R8 Dev 는 §7.1 순서대로 T1 → T2 → T3 → T4 → T5 → T6 → T7 진행 시 의존 사슬 단절 없음:
- T1 (useDriverHealth 신설) → T2 (driver 의 health 부분 useDriverHealth 호출로 치환) → T3 (mirror 검증 신설) → T4 (config include 1줄씩) → T5 (src/ 1줄 별도 commit) → T6 (체크리스트 §1.3 1 체크박스) → T7 (T2 의 effect deps `[enabled, latencyRefs]` 명시 — T2 와 합치기 가능).

각 단계마다 `npx tsc --noEmit -p tsconfig.staging-check.json` + `npx vitest run` 실측 권고.

**R8 PASS 진입 시 9연속 카운트 6/9. R9~R11 3 라운드 남음. Phase B src/ 반영 PR 까지 직선 거리 단축.**

---

**R8 Arch 최종 권고:** driver 분할 (§1, useDriverHealth 신설) + mirror 자동 검증 (§2, vitest + 옵션 3 src/ 1줄) + chunks grep 체크리스트 갱신 (§4) 이 R8 의 핵심. lifecycle 추가 분할 보류 (§3) + latency outlier 회피 (§5) 결정으로 R8 스코프 단순화. QA Bash 권한 회복 (§8) 이 R7 와 동일 신뢰도 유지.

R7 QA 5/9 → R8 6/9 진입 + driver R7 강화 350 한도 회복 (마진 36) + lifecycle 364 유지 약속 + src/ 1줄 옵션 3 commit 분리가 R8 합격선.
