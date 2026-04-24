# Phase B Arch R9 — driver 마진 회복 (옵션 C) + ref-forward 패턴 명세 정착 + mirror skip → fail 강화

> 작성: 1번 Arch Agent (R9, 독립 실행, 이전 대화 맥락 없음)
> 작성일: 2026-04-24
> 대상: Phase B R9 Dev (staging 반영) + R9 QA (9관점 독립 검증)
> 기준: `docs/phase_b_qa_r8.md` (PASS 6/9, MINOR 2 + R9 힌트 15) + `docs/phase_b_arch_r8.md` §10 R9 가이드 + `CLAUDE.md` + 현 staging 전체
> 관계: R3 (compose 분할) → R4 (STABLE_READY_MS) → R5 (관측성 초기) → R6 (관측성 + 실기기 + 응집도) → R7 (lifecycle 재분할 + health stale 제거 + isInferring 단일 소유) → R8 (driver 분할 + mirror 자동 검증 + chunks grep) → **R9 (driver 마진 회복 + ref-forward 명세 + mirror fail 강화)**

---

## §0. R8 PASS 6/9 → R9 7/9 목표 (R11 까지 3 라운드)

R8 QA PASS 로 **9연속 카운트 6/9 진입**. 신규 REJECT 0, MINOR 2건 (driver 320 = R8 한도 정확 일치 마진 0 + Arch §1 명세 변형 ref-forward 패턴 1건) + 관찰 2건 (useDriverHealth 헤더 9줄 ↔ Arch §0.2 권고 25 / renderHook case 5 미처리). R9 는 다음 3축 핵심 이슈를 **driver 마진 회복 + ref-forward 패턴 명세 정착 + mirror skip→fail 강화 + 7/9 진입** 으로 처리한다.

### 0.1 R9 처리 매트릭스 (R8 QA 힌트 15 + R8 Arch §10 R9 가이드 통합 → R9/R10 분배)

| 출처 | 항목 | R9 처리 | 사유 |
|------|------|--------|------|
| R8 QA #1 | 9연속 카운트 6/9 → 7/9 | **R9 결과 반영** | 자동 |
| R8 QA #2 / MINOR-R8-NEW-2 | driver 320 = R8 한도 정확 (마진 0) | **R9 §1 (옵션 C 채택)** | 1순위 — R10 추가 LOC 위험 차단 |
| R8 QA #3 / MINOR-R8-NEW-1 | Arch 명세 vs ref-forward 변형 정착 | **R9 §2 (ref-forward 정식 채택 + ARCHITECTURE.md §10 1섹션)** | 2순위 — 명세-구현 정합 |
| R8 QA #4 | mirror skip+warn → fail 강화 (silent regression 위험) | **R9 §3 (옵션 X 단순 fail 채택)** | 3순위 — T5 src/ 마커 확보돼 strict 가능 |
| R8 QA #5 / R8 §10 R9-C / T8 권고 | renderHook case 5 (재 confirmed + cleared) | **R9 §7** | 1 case 추가 |
| R8 QA #6 / T9 권고 | useDriverHealth 헤더 JSDoc 응축 → 25줄 | **R9 §1.5 (옵션 C 흡수 시 자연 보강)** | 옵션 C 합치기 |
| R8 QA #7 / R8 §10 R9-A | tracker LOC 응축 (172 → 140) | **R9 §4 (JSDoc 35→20 + 주석 응축)** | 시간 여유 시 R9 |
| R8 QA #8 / R8 §10 R9-B | yoloLatencyTracker.test.ts 228 LOC 압축 (6→4 cases) | **R9 §5 (테이블 통합)** | 시각적 가독성 |
| R8 QA #9 / R8 §10 R9-D | iOS 실기기 latency P95 임계값 결정 | **R10 이월** (사장님 실측 후) | 외부 의존 |
| R8 QA #10 / R8 §10 R9-E | STABLE_READY_MS 30/60/90/120 결정 | **R9 §6 (환경변수화 — default 60s + iOS 분기 보류)** | 환경변수만 추가 |
| R8 QA #11 / R8 §10 R9-F | Mirror 함수 NaN/Infinity 가드 | **R10 이월** (Phase D Arch 합의 후) | freeze spec 변경 사안 |
| R8 QA #12 / R8 §10 R9-I | Phase D Arch 초안 병렬 | **§9 팀장 권고** (R11 PASS 까지 보류) | 팀장 판단 |
| R8 QA #13 / R8 §10 R9-J | 체크리스트 §8.5 R7-S + 옵션 3 src/ 마커 commit 분리 | **§10 src/ 반영 PR 시점 이월** | atomic deploy 시점 |
| R8 QA #14 | driver line 217-219 빈 함수 초기값 race | **R9 §2.4 (ref-forward 표준화 후 race 분석)** | 명세 정착 시 자연 정리 |
| R8 QA #15 | Cloudflare R2 사장님 진행 | **§9 팀장 추적** (Arch 무관) | 외부 의존 |
| 관찰 | useDriverHealth 헤더 JSDoc 9줄 < Arch 권고 25줄 | **§1.5 옵션 C 흡수와 동시** | T9 합치기 |
| 관찰 | tracker latencyRefs useMemo 빈 deps 재확인 (R9-G) | **R10 이월** | tracker 응축 정착 후 |
| 관찰 | field_test_plan 32 체크박스 30분 가능성 | **R10 이월** | 사장님 실기기 후 |
| 관찰 | CLAUDE.md §🟣 운영 모드 자동 트리거 | **R11+ 이월** | Phase B 범위 밖 |

**R9 에서 7건 처리, R10 이월 6건, 자동/팀장/메타 5건.**

### 0.2 R9 산출물 요약 (Dev 가 받게 될 작업)

- **수정 파일 4개**:
  - `staging/hooks/useDriverHealth.ts` (R8 100 → R9 ≤120) — 옵션 C 흡수: `markInferring` state + callback 흡수 + `bumpSuccess`/`bumpFailure`/`bumpTick` 의 ref-forward 패턴을 본 훅 안으로 일원화 (driver 의 ref/wrapper 4종 흡수). 헤더 JSDoc 응축 25줄.
  - `staging/hooks/useBroadcasterYoloDriver.ts` (R8 320 → R9 ≤310) — 옵션 C 적용: useState 의 isInferring 제거, ref-forward 3종 (bumpSuccessRef/bumpFailureRef/bumpTickRef) + onSuccess/onFailure/onTick wrapper + 동기화 effect (line 217-246) 모두 useDriverHealth 가 export 하는 콜백으로 직접 prop. R9 헤더 갱신.
  - `staging/hooks/useYoloLatencyTracker.ts` (R8 172 → R9 ≤145) — JSDoc 35줄 → 20줄 응축. R9 §4.
  - `staging/tests/metadataFreezeMirror.test.ts` (R8 63 → R9 ≤55) — it 2 의 skip+warn → 즉시 fail. R9 §3.
- **수정 파일 1개 (테스트 압축)**:
  - `staging/tests/yoloLatencyTracker.test.ts` (R8 228 → R9 ≤180) — 6 cases → 4 cases 통합. R9 §5.
- **수정 파일 1개 (renderHook case 5)**:
  - `staging/tests/broadcasterYoloDriver.renderHook.test.ts` (R8 249 → R9 ≤310) — case 6 추가 (재 confirmed + cleared). R9 §7.
- **수정 파일 1개 (lifecycle 환경변수화)**:
  - `staging/hooks/useYoloWorkerLifecycle.ts` (R8 364 → R9 ≤368) — STABLE_READY_MS 환경변수화 +4 lines. R9 §6.
- **신규 문서 1개 (또는 ARCHITECTURE.md §10 추가)**:
  - **결정**: `staging/docs/phase_b_ref_forward_pattern.md` 신규 (~80 LOC). 이유 §2.1.
- **체크리스트 갱신**: `staging/docs/phase_b_src_migration_checklist.md` §3 또는 §8 에 STABLE_READY_MS 환경변수 PR 머지 시 `vercel env` 등록 1 체크박스 +5 lines.
- **src/ diff 0** (R8 T5 옵션 3 마커는 이미 적용됨 — 본 R9 는 src/ 무수정).

### 0.3 R9 LOC 마진 목표 (R8 320 한도 회복)

| 파일 | R8 LOC | R9 예상 | 한도 (R6 baseline / R8 강화) | R9 마진 |
|------|--------|---------|-----------------------------|---------|
| `useBroadcasterYoloDriver.ts` | 320 | **≤310** (옵션 C -10~-15) | 400 / **R9 ≤315 (R8 320 → -5 강화)** | ≥85 (R6) / ≥5 (R9 강화) ✅ |
| `useDriverHealth.ts` | 100 | **≤120** (옵션 C 흡수 +18~+20) | 400 / **R9 ≤120** | ≥280 (R6) / ≥0 (R9 강화) ✅ |
| `useYoloWorkerLifecycle.ts` | 364 | **≤368** (R9 §6 환경변수 +4) | 400 / 350 | 32 (R6) / -18 (R8 강화 — §3.2 보류 정신 그대로) |
| `useYoloLatencyTracker.ts` | 172 | **≤145** (R9 §4 응축 -27) | 400 / 350 | 255 ✅ |
| `useYoloSampling.ts` | 235 | 235 (변동 없음) | 400 / 350 | 115 ✅ |
| `YoloDriverDiagBadge.tsx` | 98 | 98 (변동 없음) | 100 | 2 ✅ |
| `CameraBroadcastYoloMount.tsx` | 89 | 89 (변동 없음) | 100 | 11 ✅ |
| `buildBehaviorEventMetadata.ts` | 47 | 47 (변동 없음) | 400 / 350 | 303 ✅ |
| `metadataFreezeMirror.test.ts` | 63 | **≤55** (skip→fail -8) | — | - |
| `yoloLatencyTracker.test.ts` | 228 | **≤180** (6→4 cases -48) | — | - |
| `broadcasterYoloDriver.renderHook.test.ts` | 249 | **≤310** (case 6 +60) | — | - |

**R9 LOC 정책:**
- driver `≤315` (R8 320 → R9 강화 -5). 옵션 C 효과 -10~-15 라 R9 마진 5~10 확보.
- useDriverHealth `≤120` (R8 100 → R9 +20 완화 — 옵션 C 흡수 비용).
- lifecycle `≤368` (R8 364 → R9 +4 완화 — STABLE_READY_MS 환경변수화 비용 only).
- tracker `≤145` (R8 172 → R9 강화 -27 — 응축).
- 기타 변동 없음 → R9 강화 한도 유지.

---

## §1. driver 마진 회복 — 옵션 C (useDriverHealth 흡수) 채택 (A 항목, MINOR-R8-NEW-2)

### 1.1 옵션 A/B/C/D 비교 + R9 결정

R8 driver 320 LOC = R8 한도 ≤320 정확 일치, 마진 0. R9 에서 1줄도 추가하면 즉시 REJECT 위험. 4 옵션 비교:

| 옵션 | 핵심 | LOC 효과 | 부작용 | R9 결정 |
|------|------|----------|--------|---------|
| **옵션 A** | 한도 ≤320 → ≤330 완화 (R9 약속) | driver 0 변경 | R6 baseline 400 의 80% 강화 약속 후퇴. R10/R11 에서 또 한도 위험 시 더 완화? 한도 인플레이션. | ❌ 기각 |
| **옵션 B** | driver JSDoc/주석 응축 (헤더 17줄 → 10줄) | driver -7 → ~313 | 헤더가 R3/R7/R8 분리 배경 설명을 잃음. 6개월 뒤 reader 가 분리 사유 파악 어려움. | ⚠️ 보조 (옵션 C 와 함께) |
| **옵션 C** ✅ | useDriverHealth 가 markInferring + 3 bump callback 의 ref-forward 까지 흡수 (driver 의 ref 3종 + wrapper 3종 + 동기화 effect 1개 = ~12 LOC 흡수) | driver -10~-15 → **~308** / useDriverHealth +18~+20 → **~118** | useDriverHealth 가 isInferring state 까지 소유 → driver 의 단일 소유 (R7 §3) 약속 변경. 단 markInferring callback 은 driver 외부 노출 X (lifecycle/sampling 의 args 만) → 외부 호환 영향 0. | ✅ 채택 |
| **옵션 D** | confirmFrames 결과 처리부 분리 (`useConfirmFramesHandler` 신설) | driver -50~-60 → ~265 | currentBehaviorRef + historyRef + openEventRef + clearAvgConfidence 가 prop drill 비대 (4~5 항목). R8 §1.6 옵션 B 와 동일 사유 — 응집도 손실. driver 분할의 응집도 증가 효과 < 응집도 손실 비용. | ❌ R10+ 보류 |

**R9 결정: 옵션 C 채택 + 옵션 B 헤더 갱신 (옵션 C 효과 부족 시 보조).**

**근거:**
1. **옵션 C 의 응집도 향상**: useDriverHealth 가 "방송폰 YOLO 추론 측정/상태 단일 책임" 으로 확장 — markInferring + bump 4종 콜백 모두 본 훅 내부 ref/state. driver 는 lifecycle/sampling args 에 useDriverHealth 의 callback 직접 prop → indirection 1단계 제거 (R8 ref-forward 의 우회 단순화).
2. **driver 마진 5~10 회복**: R9 강화 ≤315 통과 + R10 추가 LOC 1~5 줄 여유 확보.
3. **markInferring 의 외부 노출 0**: driver 의 useState `isInferring` 이 useMemo 반환의 `isInferring` 필드로만 forward (외부 사용 = DiagBadge 가 표시). useDriverHealth 가 useState 소유로 옮기면 driver 는 `driverHealth.isInferring` 으로 forward — 외부 호환 영향 0. R8 의 DriverHealth 일원화 (`export type DriverHealth = DriverHealthSnapshot`) 와 동일 패턴.
4. **순환 의존 해소**: R8 MINOR-R8-NEW-1 의 ref-forward 패턴은 useDriverHealth 가 `lifecycle.latencyRefs` 인자 → lifecycle 합성이 먼저 → driver 가 lifecycle args 작성 시점에 driverHealth.bump* 미존재 → 직접 sweep 불가능 사유. 옵션 C 도 동일 문제. **해결**: useDriverHealth 의 콜백을 `useCallback(deps [])` stable 로 만들고 driver 가 useDriverHealth 합성을 lifecycle/sampling 합성보다 **먼저** 호출. useDriverHealth 가 latencyRefs 인자를 받지 않고 후행 `setLatencyRefs(refs)` callback 으로 받음 → useDriverHealth 의 effect 가 ref 변경 시점부터 폴링 시작.
5. **옵션 D 보다 옵션 C 가 변경 범위 작음**: 옵션 D 는 currentBehaviorRef 양방향 의존성 풀어야 함 → R10+. 옵션 C 는 markInferring + 3 callback 만 흡수.

### 1.2 옵션 C 흡수 명세 — useDriverHealth 인터페이스 갱신

**현 useDriverHealth (R8) 인터페이스:**
```ts
export interface UseDriverHealthArgs {
  enabled: boolean;
  latencyRefs: { p50Ref: ...; p95Ref: ...; };
}
export interface UseDriverHealthResult {
  health: DriverHealthSnapshot;
  bumpTick: () => void;
  bumpSuccess: () => void;
  bumpFailure: (err: unknown) => void;
  resetForDisabled: () => void;
}
```

**R9 갱신 후 useDriverHealth (옵션 C) 인터페이스:**
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
  enabled: boolean;
  /**
   * R9 §1.4 — lifecycle 합성보다 먼저 useDriverHealth 호출하기 위해
   *  latencyRefs 를 후행 setLatencyRefs callback 으로 받음. 초기값은 빈 ref 한 쌍.
   *  driver 가 lifecycle 합성 후 즉시 setLatencyRefs(lifecycle.latencyRefs) 호출.
   *
   *  **선택**: 단순 옵션 — 본 args 에서 latencyRefs 는 옵셔널, 미제공 시 effect 폴링 0.
   *   driver 가 useEffect 로 setLatencyRefs 호출 시 effect 재실행 트리거.
   */
  latencyRefs?: {
    p50Ref: Readonly<MutableRefObject<number | null>>;
    p95Ref: Readonly<MutableRefObject<number | null>>;
  };
}

export interface UseDriverHealthResult {
  /** driver 가 useMemo 반환의 `health` 필드에 forward. */
  health: DriverHealthSnapshot;
  /**
   * R9 §1.2 — driver 의 R7 §3 isInferring 단일 소유 정책을 useDriverHealth 가 흡수.
   *  사유: markInferring 의 lifecycle/sampling 양쪽 호출 패턴 + bump 콜백과 ref 한 묶음.
   *  driver 외부 노출은 isInferring state 만 (useMemo 반환).
   */
  isInferring: boolean;
  markInferring: (v: boolean) => void;
  /** lifecycle/sampling args 에 직접 prop. driver 의 ref-forward 우회 제거. */
  bumpTick: () => void;
  bumpSuccess: () => void;
  bumpFailure: (err: unknown) => void;
  /** driver 의 disabled reset effect 가 호출 — healthRef 전체 리셋 + dirty=true. */
  resetForDisabled: () => void;
}

export function useDriverHealth(args: UseDriverHealthArgs): UseDriverHealthResult;
```

### 1.3 driver 측 변경 명세

**R8 driver line 99-107 의 isInferring 선언 제거 (-3 lines):**
```ts
// R9 §1: isInferring/markInferring 은 useDriverHealth 단일 소유 (R8 ref-forward 흡수).
//   driver 는 useMemo 반환의 isInferring: driverHealth.isInferring 으로 forward.
const driverHealth = useDriverHealth({ enabled });
```
(현 line 100-104 의 useState 4개 중 isInferring 만 제거. currentBehavior/lastDetections/avgConfidence 는 driver 유지.)

**R8 driver line 132-134 markInferring callback 제거 (-3 lines):**
- `markInferring` 은 `driverHealth.markInferring` 그대로 사용.
- driver 의 lifecycle/sampling args 의 `markInferring` 에 `driverHealth.markInferring` 전달.

**R8 driver line 213-246 ref-forward 패턴 전체 제거 (-15 lines):**
- bumpSuccessRef / bumpFailureRef / bumpTickRef 3 useRef 제거.
- onSuccess / onFailure / onTick 3 useCallback wrapper 제거.
- bump* ref 동기화 effect 제거.
- lifecycle args 의 onSuccess/onFailure 에 `driverHealth.bumpSuccess` / `driverHealth.bumpFailure` 직접 prop.
- sampling args 의 onTick/onPostMessageError 에 `driverHealth.bumpTick` / `driverHealth.bumpFailure` 직접 prop.

**driver 의 useDriverHealth 호출 순서 (R9 §1.4):**
```ts
// R9 §1: useDriverHealth 를 lifecycle/sampling 합성보다 먼저 호출.
//   초기에는 latencyRefs 인자 없음 → effect 폴링 0.
//   lifecycle 합성 후 useEffect 로 setLatencyRefs(lifecycle.latencyRefs) 호출
//   → useDriverHealth 가 effect 재실행 → 폴링 시작.
const driverHealth = useDriverHealth({ enabled });

// (handleResult / onBeforeInfer / onHidden 정의 — 기존 유지)

const lifecycle = useYoloWorkerLifecycle({
  enabled,
  onDetections: handleResult,
  frameIdRef,
  onSuccess: driverHealth.bumpSuccess,    // 직접 prop (ref-forward 제거)
  onFailure: driverHealth.bumpFailure,
  markInferring: driverHealth.markInferring,
});

useYoloSampling({
  enabled,
  videoRef,
  workerRef: lifecycle.workerRef,
  readyRef: lifecycle.readyRef,
  busyRef: lifecycle.busyRef,
  frameIdRef,
  inferStartRef: lifecycle.inferStartRef,
  nextTickMs,
  shouldInferNow,
  onBeforeInfer,
  onHidden,
  onTick: driverHealth.bumpTick,           // 직접 prop
  onPostMessageError: driverHealth.bumpFailure,
  markInferring: driverHealth.markInferring,
});
```

### 1.4 latencyRefs 후행 주입 — 순환 의존 해소

**문제 (R8 MINOR-R8-NEW-1)**: useDriverHealth 가 latencyRefs 를 인자로 받으면 lifecycle 합성이 먼저 → driver 가 lifecycle args 작성 시점에 driverHealth.bump* 미존재.

**R9 해결 옵션:**
- **옵션 1 (권고)**: useDriverHealth 의 `latencyRefs` 를 옵셔널 args 로 변경 + 내부 `useState<refs|null>` 보유. 미제공/null 시 effect 폴링 0. driver 가 lifecycle 합성 후 useEffect 로 `setLatencyRefs(lifecycle.latencyRefs)` 호출 — 단 setLatencyRefs 는 useDriverHealth 가 export 안 함 → useDriverHealth 자체가 args.latencyRefs 변화를 감지해 내부 state 갱신.
- **옵션 2**: useDriverHealth 의 `latencyRefs` 를 `MutableRefObject<refs|null>` 로 받고 driver 가 lifecycle 합성 후 ref.current = lifecycle.latencyRefs 세팅. effect 가 ref.current 폴링.

**R9 결정: 옵션 1 채택.**

**근거:**
1. **옵션 1 의 React-스러운 패턴**: args 의 변화 → useEffect deps → effect 재실행. ref 트릭보다 React 사상 일관.
2. **옵션 2 는 첫 effect 실행 시점에 ref.current=null → 다음 렌더에서 갱신 → 폴링 1 tick 지연**. 옵션 1 도 동일하지만 명시적이라 디버깅 쉬움.
3. **옵션 1 의 effect deps `[enabled, latencyRefs]` — latencyRefs 가 lifecycle 측 useMemo 안정 객체** → 첫 렌더 후 latencyRefs 변경 시점에만 effect 재실행 (1회). 이후 안정.

**구현 명세 (useDriverHealth R9):**
```ts
useEffect(() => {
  if (!enabled) return;
  if (!latencyRefs) return;  // R9 §1.4: 후행 주입 전 폴링 안 함.
  const { p50Ref, p95Ref } = latencyRefs;
  const id = window.setInterval(() => {
    // (R8 와 동일 폴링 로직)
  }, HEALTH_FLUSH_INTERVAL_MS);
  return () => window.clearInterval(id);
}, [enabled, latencyRefs]);
```

**driver 측 useDriverHealth 호출 단순화 (R9):**
```ts
const driverHealth = useDriverHealth({ enabled, latencyRefs: lifecycle?.latencyRefs });
```
**단** lifecycle 자체가 driver 본체 안에서 `useYoloWorkerLifecycle(...)` 호출 결과 → lifecycle 합성보다 먼저 useDriverHealth 호출 시 lifecycle 미존재.

**최종 R9 결정: useDriverHealth 합성을 lifecycle 합성보다 **나중** 으로 옮기되, lifecycle args 의 onSuccess/onFailure/markInferring 에 prop 으로 줄 콜백은 useDriverHealth 출력이라 순환 의존 발생.**

**R9 최종 해결책 (옵션 1.5 — driver 안에 useCallback 안정 wrapper)**:
- useDriverHealth 가 useState `[markedInferring, setMarkedInferring]` + useState `[health, setHealth]` 등을 소유.
- useDriverHealth 의 `markInferring`/`bumpSuccess`/`bumpFailure`/`bumpTick` 콜백은 `useCallback(deps [])` stable.
- driver 안에서 useDriverHealth 호출 → 그 다음 lifecycle 호출 (useDriverHealth.markInferring 등을 lifecycle args 에 직접 prop). lifecycle 호출 후 lifecycle.latencyRefs 를 useDriverHealth 의 후행 args 로 전달 — **옵션 1 의 latencyRefs 옵셔널 args 변화 감지** 패턴.

**즉:**
```ts
// 1단계: useDriverHealth 합성 (latencyRefs 미제공)
//   bumpSuccess/bumpFailure/bumpTick/markInferring 모두 useCallback deps [] stable.
const driverHealth = useDriverHealth({ enabled });

// 2단계: lifecycle 합성 — useDriverHealth 의 stable callback 직접 prop.
const lifecycle = useYoloWorkerLifecycle({
  enabled, onDetections: handleResult, frameIdRef,
  onSuccess: driverHealth.bumpSuccess,
  onFailure: driverHealth.bumpFailure,
  markInferring: driverHealth.markInferring,
});

// 3단계: lifecycle.latencyRefs 를 useDriverHealth 에 후행 주입.
//   useDriverHealth 가 args.latencyRefs 변화 감지하여 effect 재실행.
//   문제: 본 패턴은 useDriverHealth 호출 1번만 있으므로 args 갱신은 다음 렌더에서.
//   해결: driver 가 두 번 useDriverHealth 호출하지 않고, useDriverHealth 의 args
//        에 lifecycle?.latencyRefs 를 옵셔널로 받아 첫 렌더는 undefined → 폴링 0,
//        다음 렌더는 lifecycle.latencyRefs 정상 → effect 재실행 → 폴링 시작.
```

**최종 명세 — useDriverHealth 단일 호출 + args.latencyRefs 옵셔널 + 첫 렌더 미제공 → 다음 렌더 lifecycle.latencyRefs 제공:**

```ts
// driver 안에서:
//   1) lifecycle 을 useYoloWorkerLifecycle 호출로 먼저 만들면 args.markInferring 등이
//      driverHealth 의 callback 이 필요 → 순환.
//   2) 따라서 R9 의 최종 해법: driverHealth 를 lifecycle 보다 먼저 호출 + latencyRefs 미제공.
//      이후 lifecycle 합성 후 lifecycle.latencyRefs 를 다음 렌더 args 로 전달.
//      driver 본체 코드:
const driverHealth = useDriverHealth({ enabled, latencyRefs: undefined });  // 첫 렌더
// (handleResult/onBeforeInfer/onHidden 정의)
const lifecycle = useYoloWorkerLifecycle({
  enabled, onDetections: handleResult, frameIdRef,
  onSuccess: driverHealth.bumpSuccess,
  onFailure: driverHealth.bumpFailure,
  markInferring: driverHealth.markInferring,
});
// **여기서 driverHealth args 가 변경되어 다음 렌더에서 useDriverHealth 가 다시 호출되어야 하지만**
// React 의 단일 호출 패턴이라 useDriverHealth 는 매 렌더 동일 1번만 호출됨.
// **해결**: driver 가 useDriverHealth 호출 시 args 객체에 lifecycle 을 ref 로 참조하지 않고
//   lifecycle 을 미리 만들 수 없으므로 → useDriverHealth 호출 위치를 lifecycle 보다 뒤로
//   옮기되 args.latencyRefs 만 lifecycle.latencyRefs 그대로 받음.
//   문제: lifecycle args 에 driverHealth.bumpSuccess 가 필요 → 순환.
```

**완전한 R9 해결책 — driverHealth 를 두 번 useDriverHealth 호출 안 하고 ref-forward 패턴 유지**:

R8 의 ref-forward 패턴이 사실상 이 순환 의존을 해소하는 정해 (canonical) 패턴이라는 걸 R9 가 인정. **즉 옵션 C 의 흡수는 markInferring 만으로 한정**, bump 3 콜백의 ref-forward 는 유지하되 R9 §2 에서 "ref-forward 패턴" 을 정식 명세화.

### 1.5 R9 최종 결정 (수정)

**R9 결정: 옵션 C 부분 적용 — markInferring 만 useDriverHealth 흡수, bump 3 콜백 ref-forward 유지.**

**LOC 효과 재계산:**
- driver 의 useState `isInferring` 제거 (-1) + markInferring useCallback 제거 (-3) + lifecycle/sampling args 의 markInferring 전달 변경 (0) = **driver -4 → ~316**.
- useDriverHealth 의 markInferring + isInferring state 추가 (+8) → **useDriverHealth ~108**.
- driver 마진 회복 효과 미미 (320 → 316, 마진 -1 회복) → R9 강화 ≤315 미달 가능.

**R9 추가 응축 (옵션 B 보조):**
- driver 헤더 line 1-17 (17줄) → 12줄 응축. R8 §1 / R7 §3 / R3 분리 사실 유지하되 압축. driver -5 → **~311**.
- 추가 응축: ===== 6) handleResult / 8) onHidden / 11) disabled effect 의 한국어 주석 응축 1줄씩 -3 → **~308**.

**R9 최종 LOC 예측:**
- driver: 320 → **~308** (markInferring 흡수 -4 + 헤더 -5 + 본체 주석 -3 = -12). R9 강화 ≤315 마진 7. ✅
- useDriverHealth: 100 → **~115** (markInferring + isInferring +8 + 헤더 응축 25줄 권고 +7 = +15). R9 한도 ≤120 마진 5. ✅

### 1.6 useDriverHealth R9 명세 (옵션 C 부분 적용)

**인터페이스:**
```ts
export interface UseDriverHealthArgs {
  enabled: boolean;
  latencyRefs: {
    p50Ref: Readonly<MutableRefObject<number | null>>;
    p95Ref: Readonly<MutableRefObject<number | null>>;
  };
}

export interface UseDriverHealthResult {
  health: DriverHealthSnapshot;
  /** R9 §1.5 — markInferring/isInferring 은 useDriverHealth 단일 소유 (R7 §3 부분 흡수). */
  isInferring: boolean;
  markInferring: (v: boolean) => void;
  bumpTick: () => void;
  bumpSuccess: () => void;
  bumpFailure: (err: unknown) => void;
  resetForDisabled: () => void;
}
```

**구현 추가 (useDriverHealth.ts):**
- `useState<boolean>(false)` for isInferring.
- `useCallback((v: boolean) => setIsInferring(v), [])` for markInferring.
- resetForDisabled 안에서 `setIsInferring(false)` 추가.

**driver 측 변경:**
- useState `isInferring` 제거. `const isInferring = driverHealth.isInferring;` 만 사용.
- markInferring useCallback 제거. lifecycle/sampling args 에 `driverHealth.markInferring` 전달.
- bump 3 콜백의 ref-forward 패턴 (line 217-246) **유지** — R9 §2 에서 정식 명세화.
- useMemo 반환의 `isInferring: driverHealth.isInferring`.

### 1.7 driver 호환 검증

- `DriverArgs` / `DriverResult` 타입 무변경.
- DriverResult.isInferring 필드 그대로 (값 출처가 driver useState → driverHealth.isInferring 으로 변경, 외부 호환 영향 0).
- Mount 무영향.

### 1.8 LOC 예측 표

| 파일 | R8 LOC | R9 예상 |
|------|--------|---------|
| `useDriverHealth.ts` | 100 | **~115** (markInferring +8 + 헤더 응축 25줄 +7) |
| `useBroadcasterYoloDriver.ts` | 320 | **~308** (markInferring 흡수 -4 + 헤더 -5 + 본체 주석 -3) |

### 1.9 (참고) 옵션 D (confirmFrames 분리) 의 R10+ 보류 사유

옵션 D 는 driver -50~-60 효과 → driver ~248~258 → 마진 60~70 회복. 매력적이지만:
1. handleResult / onBeforeInfer / onHidden / clearAvgConfidence 가 **currentBehaviorRef + historyRef + openEventRef + confWindowRef + setCurrentBehavior + setLastDetections + setAvgConfidence** 7개 ref/state 공유 → 분리 시 prop drill 7개.
2. R8 §1.6 옵션 B 와 동일 사유 — 응집도 손실.
3. R10 에서 useDriverHealth 가 흡수 가능한 항목 (예: lastDetections state) 이 더 있는지 검토 후 결정.

**R10 권고**: 옵션 D 또는 useDriverHealth 추가 흡수 (lastDetections / avgConfidence) 검토.

---

## §2. ref-forward 패턴 명세 정착 (B 항목, MINOR-R8-NEW-1)

### 2.1 신규 문서 위치 결정

**옵션 비교:**

| 옵션 | 위치 | 장점 | 단점 |
|------|------|------|------|
| **옵션 X** | `staging/docs/phase_b_ref_forward_pattern.md` 신규 (~80 LOC) | Phase B 내부 산출물 — staging-only / 추적 쉬움 / Phase B src/ 반영 PR 시점에 src/ 와 동기 | 새 파일 1개 |
| **옵션 Y** | `docs/ARCHITECTURE.md` §10 에 1 섹션 추가 (~50 LOC) | 프로젝트 표준 문서 통합 | src/ 변경 — staging-only 정신 위배 (CLAUDE.md #13). 단 ARCHITECTURE.md 는 src/ 디렉터리 외부 (`docs/`) 라 #13 문구상으로는 staging 변경 가능 |

**R9 결정: 옵션 X 채택.**

**근거:**
1. **Phase B src/ 반영 PR 시점에 한꺼번에 ARCHITECTURE.md 갱신** — R11 PASS 후 src/ 반영 PR 안에서 ARCHITECTURE.md §10 에 ref-forward 패턴 항목 1개 추가 + staging 문서 archive. R9 단계에서는 staging 단독 문서로 시작.
2. **staging 문서 정신 일관성**: phase_b_field_test_plan / phase_b_src_migration_checklist 와 같은 staging/docs/ 위치.
3. **옵션 Y 의 ARCHITECTURE.md 변경은 R11 까지 보류** — R9 단계에서 일관 위치 유지.

### 2.2 패턴 정의 + 사용 예시 + 향후 적용 대상

**패턴 명: "ref-forward callback wrapper" (한글: ref 우회 콜백 래퍼)**

**언제 쓰는가:**
- 합성 훅 (예: driver) 안에서 자식 훅 A (예: useDriverHealth) 의 callback 을 다른 자식 훅 B (예: lifecycle/sampling) 의 args 에 전달해야 하지만, **A 의 합성 자체가 B 의 출력 (예: latencyRefs) 에 의존** → 순환 의존 발생 시.

**패턴 구조:**
```ts
// 1) 자식 훅 B 가 자식 훅 A 의 callback 을 args 로 받음.
// 2) 합성 훅 (driver) 안에서 A 합성 → B 합성 순서가 불가능하면, ref-forward wrapper 도입:
//    a. 합성 훅 안에서 ref 3종 선언 (callback 의 placeholder).
const aCallbackRef = useRef<() => void>(() => {});  // 빈 함수 초기값
//    b. 합성 훅 안에서 wrapper useCallback (deps []) 생성. ref 통해 호출.
const aCallback = useCallback((): void => aCallbackRef.current(), []);
//    c. B 합성 시 args 에 wrapper 전달.
const b = useChildB({ ..., onSomething: aCallback });
//    d. A 합성 (B 의 출력 사용 가능).
const a = useChildA({ ..., latencyRefs: b.latencyRefs });
//    e. effect 로 ref 동기화. deps 에 a.callback 포함 — stable 이라 1회만 실행.
useEffect(() => {
  aCallbackRef.current = a.callback;
}, [a.callback]);
```

**왜 안전한가:**
- A 의 callback 이 useCallback(deps []) stable → effect 재실행 0.
- ref 의 빈 함수 초기값 → 첫 렌더 ~ effect 실행 사이에 B 가 onSomething 호출 시 빈 함수 호출 → 손실 1회. 단 worker message 도달까지 ms 지연 → 실질적 손실 0 (worker effect 가 첫 렌더 직후 실행, message 도달은 그 이후).
- 첫 렌더 race 가 우려되면 빈 함수 대신 console.warn 또는 측정용 카운터 추가 가능.

**Phase B 안 현 적용 대상:**
1. **driver 의 bump 3 콜백** (R8 ~ R9 유지): bumpSuccessRef / bumpFailureRef / bumpTickRef → onSuccess/onFailure/onTick wrapper → lifecycle/sampling args 에 전달. useDriverHealth 가 lifecycle.latencyRefs 인자 의존 → ref-forward 필수.
2. **(R7 부분) lifecycle 의 markInferringRef** (lifecycle line 147): driver 가 markInferring 을 lifecycle args 로 전달 + lifecycle 내부 effect (line 148-153) 가 ref 동기화. 본 패턴의 변형 — 합성 시점에는 callback 이 stable 이지만 매 렌더 새 wrapper 가능성 방어. R9 §1.5 에서 markInferring 은 useDriverHealth 가 흡수하므로 lifecycle args 의 markInferring 이 driverHealth.markInferring (deps [] stable) 직접 prop → ref-forward 변형 유지 (lifecycle 내부 패턴 변경 X).
3. **lifecycle 의 onDetections / onSuccess / onFailure ref-forward** (line 144-153): 본 R9 §2 표준 패턴의 다른 적용 사례.

**향후 적용 대상 (예측):**
- Phase D 라벨링 UI 의 user_label callback (driver 와 라벨러 훅 사이 양방향 의존 시).
- Phase E export/archive 의 onClipSnap / onError 콜백.

**문서 LOC 예측: ~85 (헤더 15 + 패턴 정의 25 + 코드 예시 25 + Phase B 적용 사례 20).**

### 2.3 신규 문서 명세 — `staging/docs/phase_b_ref_forward_pattern.md`

**파일:** `staging/docs/phase_b_ref_forward_pattern.md` (신규)
**LOC:** ~85
**구조:**
```
# Phase B ref-forward callback wrapper 패턴

## §0 배경 (R8 MINOR-R8-NEW-1 발견)
## §1 패턴 정의 (언제 / 왜 / 구조)
## §2 코드 예시 (driver 의 bump 3 콜백)
## §3 안전성 분석 (race 분석 + 빈 함수 race 손실 평가)
## §4 Phase B 안 현 적용 사례 (driver bump 3 + lifecycle markInferring + lifecycle 콜백 ref-forward)
## §5 향후 적용 대상 (Phase D 라벨링 / Phase E export)
## §6 R11 src/ 반영 PR 시점 ARCHITECTURE.md §10 통합 안내
```

**Dev 가 paste 할 핵심 본문 (예시):**

```markdown
# Phase B ref-forward callback wrapper 패턴

> 작성: Phase B Arch Agent (R9 §2)
> 적용: `staging/hooks/useBroadcasterYoloDriver.ts` 의 bump 3 콜백 / `staging/hooks/useYoloWorkerLifecycle.ts` 의 콜백 ref 동기화
> 근거: R8 MINOR-R8-NEW-1 발견 → R9 §2 정식 명세화

## §0 배경

R8 driver 분할 시 useDriverHealth 가 lifecycle.latencyRefs 인자 → lifecycle 합성이 먼저 →
driver 가 lifecycle args 작성 시점에 driverHealth.bump* 미존재 → 순환 의존.

R8 Dev 가 ref-forward wrapper 패턴으로 해소. R9 가 본 패턴을 정식 채택.

## §1 패턴 정의

(생략 — 본 §2.2 와 동일 본문)

## §2 코드 예시

(driver line 217-246 코드 그대로 + 주석)

## §3 안전성 분석

빈 함수 초기값 race: 첫 렌더 ~ effect 실행 사이 B 가 callback 호출 시 빈 함수 호출 → 손실 1회.
실질적 손실 0 (worker message 도달 ms 지연 > React effect 실행 ms).

## §4 Phase B 안 현 적용 사례

| 위치 | 패턴 적용 사유 | 호출 ref |
|------|---------------|---------|
| driver line 217-246 | useDriverHealth 가 lifecycle.latencyRefs 인자 → 순환 | bumpSuccessRef/bumpFailureRef/bumpTickRef |
| lifecycle line 144-153 | driver/sampling 의 콜백 stale 클로저 방지 | onDetectionsRef/onSuccessRef/onFailureRef/markInferringRef |

## §5 향후 적용 대상

- Phase D 라벨링 UI 의 user_label callback
- Phase E export/archive 의 onClipSnap / onError

## §6 R11 src/ 반영 PR 시점 안내

본 staging 문서는 Phase B src/ 반영 PR 시점에 `docs/ARCHITECTURE.md` §10 의
"훅 합성 패턴" 항목으로 흡수 — 본 .md archive 처리.
```

### 2.4 R9 §1.5 후 ref-forward 적용 범위 재정리

R9 §1.5 결정 (markInferring 만 흡수) 후 driver 의 ref-forward 패턴 적용 범위:
- **유지 (3종)**: bumpSuccessRef / bumpFailureRef / bumpTickRef + onSuccess/onFailure/onTick wrapper + 동기화 effect.
- **제거 (1종)**: markInferring 은 driverHealth.markInferring 직접 prop (ref-forward 우회 제거).

**driver line 217-246 의 R9 후 모습 (수정 명세):**
```ts
// ===== 9) lifecycle/health/sampling 합성 — R9 §2 ref-forward 패턴 (정식 채택). =====
// useDriverHealth 가 lifecycle.latencyRefs 인자 → lifecycle 합성이 먼저. 따라서 lifecycle/sampling
// args 의 onSuccess/onFailure/onTick 은 driverHealth.bump* 를 ref forward 로 호출.
// markInferring 은 R9 §1.5 useDriverHealth 흡수 → 직접 prop (ref-forward 우회 제거).
// 자세한 패턴 안내: staging/docs/phase_b_ref_forward_pattern.md
const bumpSuccessRef = useRef<() => void>(() => {});
const bumpFailureRef = useRef<(err: unknown) => void>(() => {});
const bumpTickRef = useRef<() => void>(() => {});
const onSuccess = useCallback((): void => bumpSuccessRef.current(), []);
const onFailure = useCallback(
  (err: unknown): void => bumpFailureRef.current(err),
  [],
);
const onTick = useCallback((): void => bumpTickRef.current(), []);

const lifecycle = useYoloWorkerLifecycle({
  enabled,
  onDetections: handleResult,
  frameIdRef,
  onSuccess,
  onFailure,
  markInferring: driverHealth.markInferring,  // R9 §1.5: 직접 prop.
});

const driverHealth = useDriverHealth({
  enabled,
  latencyRefs: lifecycle.latencyRefs,
});

useEffect(() => {
  bumpSuccessRef.current = driverHealth.bumpSuccess;
  bumpFailureRef.current = driverHealth.bumpFailure;
  bumpTickRef.current = driverHealth.bumpTick;
}, [driverHealth.bumpSuccess, driverHealth.bumpFailure, driverHealth.bumpTick]);
```

**문제 발견**: `markInferring: driverHealth.markInferring` 사용 시 driverHealth 가 lifecycle 호출 후 합성 → 순환. **R9 §1.5 기각 → markInferring 도 ref-forward 유지 또는 lifecycle/sampling 의 markInferring args 도 ref-forward wrapper 로 변경 필요.**

### 2.5 R9 최종 결정 (수정 — markInferring 도 ref-forward 유지)

**R9 결정 (최종): markInferring 흡수 부분 보류 — bump 3 + markInferring 4 콜백 모두 ref-forward 유지. 옵션 C 의 흡수는 isInferring state 만 (driver useState → useDriverHealth useState 이전). markInferring callback 은 driver 가 wrapper 로 정의 후 useDriverHealth 가 export 한 markInferring 을 ref 로 통해 호출.**

**LOC 효과 재계산 (최종):**
- driver: useState `isInferring` 제거 (-1) + markInferring useCallback 변경 (-2 +2 = 0) + 헤더 응축 (-5) + 본체 주석 응축 (-3) + ref-forward 4종 (markInferring 추가) (+3 ~ +5). 합 -6 ~ -8 → **driver ~312~314**.
- useDriverHealth: isInferring state +5 + markInferring useCallback +3 + resetForDisabled 의 setIsInferring 추가 +2 + 헤더 25줄 응축 +7 = +17 → **useDriverHealth ~117**.

**R9 강화 한도 후 마진:**
- driver R9 강화 ≤315 통과 (마진 1~3) — 위태롭지만 통과. **R9 강화 ≤320 으로 완화 권고 (R8 320 유지)**: driver R9 ~312~314, 마진 6~8.
- useDriverHealth R9 한도 ≤120 통과 (마진 3).

### 2.6 R9 LOC 한도 확정 (옵션 C 부분 흡수 + ref-forward 유지 + 응축 조합)

| 파일 | R8 LOC | R9 한도 | R9 예상 | R9 마진 |
|------|--------|---------|---------|---------|
| `useBroadcasterYoloDriver.ts` | 320 | **≤320 (R8 유지)** | ~312~314 | 6~8 |
| `useDriverHealth.ts` | 100 | **≤120 (R8 +20 완화)** | ~117 | 3 |
| `useYoloWorkerLifecycle.ts` | 364 | **≤368 (R8 +4 완화 — R9 §6 환경변수)** | ~368 | 0 |
| `useYoloLatencyTracker.ts` | 172 | **≤145 (R8 -27 강화)** | ~145 | 0 |
| `metadataFreezeMirror.test.ts` | 63 | **≤55 (-8 강화)** | ~55 | 0 |
| `yoloLatencyTracker.test.ts` | 228 | **≤180 (-48 강화)** | ~180 | 0 |
| `broadcasterYoloDriver.renderHook.test.ts` | 249 | **≤315 (+66 완화 — case 6 추가)** | ~310 | 5 |

**핵심**: driver 한도 ≤320 유지 (R8 와 동일) — 이유: ref-forward 4 콜백 + 옵션 C 부분 흡수 가 LOC 회수 -6~-8 만 → 강화 ≤315 위험. 한도 ≤320 유지 + 응축으로 마진 6~8 확보.

---

## §3. mirror skip → fail 강화 (C 항목, R8 QA 권고 #3)

### 3.1 옵션 X/Y/Z 비교 + R9 결정

R8 의 `metadataFreezeMirror.test.ts` it 2 는 src/ 마커 부재 시 console.warn + return (skip) → vitest 가 PASS 카운트 → CI silent regression 위험.

**옵션 비교:**

| 옵션 | 핵심 | 장점 | 단점 |
|------|------|------|------|
| **옵션 X** ✅ | skip 제거하고 src/ 마커 부재 시 즉시 fail | 단순 / silent regression 차단 / R8 T5 적용으로 마커 이미 존재 → 즉시 fail 위험 0 | 옵션 R (staging-only) 정신과 충돌 가능성 — 단 T5 마커는 이미 src/ 에 존재 → 충돌 0 |
| **옵션 Y** | 환경변수 `STRICT_FREEZE_CHECK=1` 도입 | 로컬 skip / CI strict | 복잡도 증가 + 로컬 개발자가 STRICT 모드 잊을 가능성 |
| **옵션 Z** | console.warn → console.error + GitHub Actions stderr 감지 | 가장 가벼운 변경 | GitHub Actions 가 stderr 감지 안 하면 무의미 + CI 설정 추가 부담 |

**R9 결정: 옵션 X 채택.**

**근거:**
1. **R8 T5 src/ 마커 이미 적용 — strict 가능 환경 완성**: src/ logger line 225 에 `// metadata-freeze-spec: r7-1` 존재 (R8 QA 실측 확인). 옵션 X 의 즉시 fail 동작은 현 상태에서 PASS.
2. **옵션 R (staging-only) 정신은 src/ 코드 무수정** — 본 fail 강화는 staging 테스트 파일 변경뿐, src/ 영향 0.
3. **회귀 즉시 감지**: src/ 본체 변경으로 마커가 함께 사라지면 vitest 즉시 fail → CI 빌드 차단. silent skip 위험 차단.
4. **옵션 Y/Z 는 over-engineering** — 베타 단계 + Phase B 안 mirror 1 case 만 — strict / lenient 분기 의미 부족.

### 3.2 metadataFreezeMirror.test.ts 변경 명세

**현 it 2 (R8 line 49-62):**
```ts
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
```

**R9 후 it 2 (line 49-55, ~7 lines):**
```ts
it("src/ logger 에 마커 존재 (R9 §3 strict — 부재 시 즉시 fail)", () => {
  // R9 §3: R8 T5 적용으로 src/ 마커 이미 존재 → strict fail 안전.
  //   본체 변경으로 마커가 함께 사라지면 vitest 즉시 fail → CI 빌드 차단 → silent regression 차단.
  const content = readFileSafe(SRC_LOGGER_PATH);
  expect(content, `src/ logger 파일 부재: ${SRC_LOGGER_PATH}`).not.toBeNull();
  expect(content, `src/ logger 마커 '${MARKER}' 부재 — 본체 변경으로 마커 누락된 듯. R9 §3 참조`).toContain(MARKER);
});
```

**LOC 효과: 14 lines → 7 lines (-7).** 헤더 JSDoc 도 "skip + warn" 문장 제거 → ~63 → ~55.

### 3.3 R9 후 metadataFreezeMirror.test.ts 헤더 갱신 (R9 §3 사실 반영)

**R8 헤더 (line 1-17):**
```ts
/**
 * Phase B (R8 §2) — metadata mirror 마커 자동 검증.
 * ...
 * 미적용 단계 (src/ 마커 부재):
 *  - 본 테스트가 console.warn 후 조용히 return → R8 staging vitest 자체는 green.
 *  - 옵션 3 commit 머지 시 본 테스트는 자동 PASS (별도 코드 변경 없이 마커 추가만).
 */
```

**R9 갱신 후 헤더 (line 1-13):**
```ts
/**
 * Phase B (R8 §2 / R9 §3) — metadata mirror 마커 자동 검증 (strict).
 *
 * 의도:
 *  - R7 §4 옵션 R 채택으로 staging mirror (`buildBehaviorEventMetadata.ts`) 와 src/ logger
 *    (`useBehaviorEventLogger.ts`) 의 metadata 조립 블록은 1:1 동치를 약속.
 *  - 본 테스트는 양쪽 파일에 동일 마커 `// metadata-freeze-spec: r7-1` 가 존재하는지
 *    fs.readFileSync + 정규표현식 grep 으로 검증. 한쪽이라도 마커 부재 시 즉시 fail.
 *
 * R9 §3 strict 강화:
 *  - R8 까지 it 2 는 src/ 마커 부재 시 console.warn + return (skip) — silent regression 위험.
 *  - R9 §3 부터 src/ 마커 부재 시 즉시 fail — CI 빌드 차단 → drift 사전 차단.
 *  - R8 T5 적용으로 src/ logger line 225 에 마커 존재 (확인됨) → strict fail 안전 환경.
 */
```

### 3.4 LOC 예측

| 파일 | R8 LOC | R9 예상 |
|------|--------|---------|
| `metadataFreezeMirror.test.ts` | 63 | **~55** (헤더 17 → 13 + it 2 14 → 7 = -11. 다른 줄 +3 → 합 -8) |

---

## §4. tracker LOC 응축 (D 항목, R8 §10 R9-A)

### 4.1 JSDoc/주석 응축 가이드 (~27 LOC 회수)

**현 useYoloLatencyTracker.ts 172 LOC.** 응축 대상:

| 영역 | 현 LOC | R9 응축 LOC | 회수 |
|------|--------|-------------|------|
| 헤더 JSDoc (line 1-24) | 24 | 12 | -12 |
| `computePercentile` JSDoc (line 37-43) | 7 | 4 | -3 |
| `YoloLatencyTrackerArgs` / `Result` JSDoc (line 51-76) | 26 | 18 | -8 |
| 본체 코드 line 79-86 JSDoc (`@example`) | 8 | 4 | -4 |
| 합계 | 65 | 38 | **-27** |

**R9 후 예상**: 172 → **~145**.

**응축 원칙:**
- 분리 배경 (R6 → R7) 1줄 + 데이터 흐름 6줄 → 4줄 + 외부 노출 정책 7줄 → 4줄.
- `computePercentile` JSDoc 의 @param/@returns 단일 1줄.
- Args/Result 의 각 필드 JSDoc 2줄 → 1줄. (sampling/lifecycle 호출 패턴은 코드 옆 주석으로 옮김.)
- @example 코드 4줄 → 2줄.

### 4.2 응축 후 헤더 예시 (Dev 참고)

**R8 line 1-24 (24줄):**
```ts
/**
 * Phase B (R7 §1) — YOLO inference latency 측정 전담 훅.
 *
 * 분리 배경 (R7 Arch §1):
 *  - R6 까지 `useYoloWorkerLifecycle.ts` 안에 worker 생성/dispose/retry/armBehaviorLogger
 *    + latency 링버퍼 + 2초 flush 가 함께 있었음 (397 LOC, 한도 400 마진 3줄).
 *  - lifecycle = "Worker 의 born → dead 까지 한 사이클의 모든 부수효과" 단일 책임.
 *  - latency tracker = "stamp 받기 → 링버퍼 누적 → P50/P95 state flush" 측정 도메인.
 *    Worker 의 존재 자체와 독립 (Worker 가 없는 시기에는 enabled=false 로 들어와 reset).
 *
 * 데이터 흐름 (R7 Arch §1.2):
 *  1. sampling 이 postMessage 직전 → `tracker.inferStartRef.current = performance.now()`.
 *  2. lifecycle 의 worker.onmessage(result) 가 frameId 일치 확인 후 → `tracker.recordResult(performance.now())`.
 *  3. 내부에서 delta = now - stamp 계산 → `Number.isFinite(delta) && delta >= 0` 가드 → 링버퍼 push.
 *  4. 링버퍼 길이 > 10 일 때 가장 오래된 값 shift (FIFO).
 *  5. 2초 주기 setInterval 로 P50 (nearest-rank) / P95 state flush. prev-equal skip 으로 re-render 최소화.
 *  6. enabled=false → 링버퍼 / stamp / state 모두 reset.
 *
 * 외부 노출 정책 (R7 Arch §1.3):
 *  - `inferStartRef` 는 sampling 이 쓰기, lifecycle 은 읽기만 (실제로는 lifecycle 도 안 읽음
 *    — recordResult/invalidateStamp 메서드 호출만 사용).
 *  - state (P50/P95) 는 dev 배지가 driver 경유로 표시 — 2초 주기로 갱신.
 *  - ref (p50Ref/p95Ref) 는 driver 의 healthRef 가 deps 없이 폴링하기 위해 추가 노출 (R7 §2).
 */
```

**R9 응축 후 (12줄):**
```ts
/**
 * Phase B (R7 §1 / R9 §4) — YOLO inference latency 측정 전담 훅.
 *
 * 책임: stamp 받기 → 10개 링버퍼 누적 (FIFO) → 2초 setInterval 로 P50/P95 nearest-rank flush
 *  + prev-equal skip. enabled=false → 전체 reset. Worker 존재와 독립 (R6 → R7 분리).
 *
 * 데이터 흐름:
 *  1) sampling 이 postMessage 직전 → `inferStartRef.current = performance.now()`.
 *  2) lifecycle result → `recordResult(performance.now())` → delta 가드 (NaN/Infinity/음수 제외) → push.
 *  3) lifecycle error/dispose → `invalidateStamp()` / `clearBuffer()`.
 *  4) ref (p50Ref/p95Ref) — driver healthRef 가 deps 없이 폴링 (R7 §2).
 */
```

### 4.3 LOC 예측

| 파일 | R8 LOC | R9 예상 |
|------|--------|---------|
| `useYoloLatencyTracker.ts` | 172 | **~145** (-27) |

---

## §5. yoloLatencyTracker.test.ts 압축 (E 항목, R8 §10 R9-B)

### 5.1 6 → 4 cases 통합 명세

**현 6 cases (R8 line 30-228):**
1. 정상 stamp + recordResult 3회 → 2초 flush 후 P50/P95 state 반영
2. delta 엣지 4-in-1 (delta=0 / NaN / Infinity / 음수)
3. invalidateStamp → recordResult 호출해도 링버퍼 변경 없음
4. clearBuffer → 링버퍼 + stamp 모두 초기화 → flush 후 P50/P95 null
5. enabled=false → 링버퍼/stamp/state 모두 reset
6. latencyRefs.p50Ref / p95Ref 가 flush 시점에 state 와 동일 값으로 갱신

**R9 통합 후 4 cases:**
1. **정상 + 엣지 통합** (case 1 + case 2): "정상 3회 + delta=0/NaN/Infinity/음수 mix → 링버퍼 [80, 150, 300] + 0 만 통과". 한 테이블에서 검증.
2. **invalidateStamp + clearBuffer 통합** (case 3 + case 4): "invalidateStamp → recordResult 무시 → clearBuffer → 링버퍼 비움 → P50/P95 null".
3. **enabled false reset** (case 5 그대로): 별도 유지 — rerender 패턴이 다른 case 와 격리.
4. **latencyRefs 동기화** (case 6 그대로): driver healthRef 폴링용 ref 한 쌍 검증.

**R9 통합 효과: 6 → 4 cases (-33%) + LOC 228 → ~180 (-48).**

### 5.2 LOC 예측

| 파일 | R8 LOC | R9 예상 |
|------|--------|---------|
| `yoloLatencyTracker.test.ts` | 228 | **~180** (-48) |

### 5.3 (참고) Dev 가 통합 시 주의

- **case 1 + case 2 통합 시**: 정상 측정 (delta=150/80/300) + 엣지 (delta=0/NaN/Infinity/음수) 를 한 it 안에서 호출. 링버퍼 결과 [0, 80, 150, 300] (4개) 검증. P50 = idx ceil(0.5*4)-1=1 = 80. P95 = idx ceil(0.95*4)-1=3 = 300.
- **case 3 + case 4 통합 시**: 정상 1회 측정 → invalidateStamp → recordResult 호출 (무시) → clearBuffer → 링버퍼 비움 → flush 후 null. 단일 흐름 자연스러움.

---

## §6. STABLE_READY_MS 환경변수화 (F 항목, R8 §10 R9-E)

### 6.1 추가 위치 + default + iOS 분기 보류 사유

**현 lifecycle line 55:**
```ts
const STABLE_READY_MS = 60_000;
```

**R9 후 (line 53-58, +4 lines):**
```ts
/**
 * R4 §3.1 MAJOR-R4-A — ready 수신 후 "안정 유지 시간" (ms).
 * (기존 JSDoc 유지 — 본문 그대로)
 *
 * R9 §6: 환경변수화 — `NEXT_PUBLIC_YOLO_STABLE_READY_MS` (default 60_000).
 *  iOS 저사양 단말이 모델 init 60초 초과 시 운영자가 환경변수로 90_000 등 조정 가능.
 *  iOS UA 자동 분기는 베타 단계 over-engineering → R10 사장님 실기기 후 결정.
 */
const STABLE_READY_MS = (() => {
  const v = Number(process.env.NEXT_PUBLIC_YOLO_STABLE_READY_MS);
  return Number.isFinite(v) && v > 0 ? v : 60_000;
})();
```

**LOC 효과: 1 line → 5 lines (+4) → lifecycle 364 → 368.**

**R9 한도 ≤368 통과 (마진 0).**

### 6.2 iOS 분기 보류 사유 (R8 §10 R9-D / R8 QA #7)

- 현 베타 단계 사용자 7명 — iOS 환경 비율 미파악.
- iOS UA 감지 + 자동 90000 분기 = 5~10 LOC 추가 + 테스트 추가.
- R10 사장님 실기기 측정 후 임계값 (60s 충분 / 90s 필요) 결정 후 R10/R11 에서 분기 추가 검토.

### 6.3 체크리스트 갱신 (1 체크박스)

**파일:** `staging/docs/phase_b_src_migration_checklist.md`
**위치:** §3 (Vercel env 등록) 또는 §8 (운영 모드) 의 적합한 위치 1 체크박스 추가.
**내용:**
```
- [ ] **(R9 §6)** Phase B src/ 반영 PR 머지 후 Vercel env 에 `NEXT_PUBLIC_YOLO_STABLE_READY_MS` 등록 검토:
      ```
      vercel env add NEXT_PUBLIC_YOLO_STABLE_READY_MS  # default 60000, iOS 저사양 시 90000 등
      ```
      미등록 시 lifecycle.ts 의 default 60_000 ms 가 사용됨. R10 사장님 실기기 후 조정.
```

**LOC: ~5 lines.**

---

## §7. renderHook case 6 추가 (G 항목, R8 §10 R9-C / T8 권고)

### 7.1 markInferring(true) 후 worker disable 시 cleanup 검증

R8 §10 R9 가이드의 case 5 권고는 "재 confirmed + cleared" 흐름이지만, **R9 §7 에서 더 가치 있는 case 추가**:

**case 6 (R9 §7): "재 confirmed → 같은 classKey 유지 → cleared (NONE_KEY 3프레임) → currentBehavior null 검증.**

**현 case 5 (R8 line 175-185, OFF 상태 flush interval 미등록) 와 case 4 (line 190-248, ON → ready → confirmed → OFF) 사이의 빈 영역**:
- confirmed 상태에서 같은 classKey 재 입력 시 currentBehaviorRef.current?.classKey === result.key 분기 → setCurrentBehavior 호출 안 됨 (변경 없음). **본 동작 미검증**.
- confirmed 상태에서 NONE_KEY 3프레임 → cleared → currentBehavior null. **본 동작 미검증**.

### 7.2 case 6 명세

**파일:** `staging/tests/broadcasterYoloDriver.renderHook.test.ts`
**위치:** case 5 (line 175-185) 와 case 4 (line 190-248) 사이 또는 case 4 다음에 추가.
**LOC:** ~60 (R8 249 → R9 ~310, 한도 ≤315 마진 5).

**Dev 가 paste 할 case 6 본문:**

```ts
// R9 §7 case 6: confirmed → 같은 classKey 재 confirmed (변경 없음) → NONE_KEY 3프레임 cleared.
//   driver 의 handleResult 안 confirmed 분기에서 currentBehaviorRef.current?.classKey === result.key
//   조건이 setCurrentBehavior 호출을 방지하는지 + cleared 분기가 정상 작동하는지 검증.
it("R9 §7 case 6: confirmed → 동일 classKey 재 confirmed → NONE_KEY 3프레임 cleared → null", () => {
  const initialArgs = makeArgs({
    enabled: true,
    homeId: null,
    cameraId: null,
  });
  const { result } = renderHook(
    (props: DriverArgs) => useBroadcasterYoloDriver(props),
    { initialProps: initialArgs },
  );

  // 1. ON + ready emit.
  const w = workerStub.createdWorkers[0];
  act(() => {
    w._emit("message", { data: { type: "ready", backend: "webgpu" } });
  });

  // 2. sleeping 3프레임 → confirmed.
  for (let i = 0; i < 3; i += 1) {
    act(() => {
      w._emit("message", {
        data: {
          type: "result",
          frameId: 0,
          detections: [
            {
              classId: 1, classKey: "sleeping", label: "sleeping",
              confidence: 0.9, bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
            },
          ],
        },
      });
    });
  }
  expect(result.current.currentBehavior?.classKey).toBe("sleeping");
  const firstConfirmed = result.current.currentBehavior;

  // 3. sleeping 3프레임 재 입력 → currentBehavior 동일 유지 (참조 동일).
  for (let i = 0; i < 3; i += 1) {
    act(() => {
      w._emit("message", {
        data: {
          type: "result",
          frameId: 0,
          detections: [
            {
              classId: 1, classKey: "sleeping", label: "sleeping",
              confidence: 0.85, bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
            },
          ],
        },
      });
    });
  }
  // currentBehaviorRef.current?.classKey === result.key 조건 → setCurrentBehavior 호출 안 됨.
  expect(result.current.currentBehavior).toBe(firstConfirmed);

  // 4. NONE_KEY 3프레임 (detections 빈 배열) → cleared → currentBehavior null.
  for (let i = 0; i < 3; i += 1) {
    act(() => {
      w._emit("message", {
        data: { type: "result", frameId: 0, detections: [] },
      });
    });
  }
  expect(result.current.currentBehavior).toBeNull();
  expect(result.current.lastDetections).toEqual([]);
});
```

### 7.3 LOC 예측

| 파일 | R8 LOC | R9 예상 |
|------|--------|---------|
| `broadcasterYoloDriver.renderHook.test.ts` | 249 | **~310** (case 6 +60, 헤더 변동 +1) |

**vitest 카운트: R8 101 → R9 102 (case 6 추가 +1).**

---

## §8. R9 Dev TODO 리스트 (필수 / 권고 분리)

### 8.1 필수 (Required) — R9 PASS 조건

| ID | 출처 | 항목 | 완료기준 |
|----|------|------|---------|
| **T1** | §1.5 §1.6 | `useDriverHealth.ts` 갱신: isInferring useState + markInferring useCallback (deps []) 추가 + UseDriverHealthResult 에 isInferring/markInferring 2 필드 추가 + resetForDisabled 안에서 setIsInferring(false) 추가 + 헤더 JSDoc 25줄 응축 (분리 배경 + 데이터 흐름 + 4 API + reset 정책 + R9 §1 흡수 사실). LOC ≤120. | 파일 갱신 + LOC ≤120 + tsc green |
| **T2** | §1.5 §2.4 §2.5 | `useBroadcasterYoloDriver.ts` 갱신: useState `isInferring` 제거 + markInferring useCallback 제거 (driverHealth.markInferring 직접 사용) + lifecycle args.markInferring 에 ref-forward wrapper 추가 (markInferring 도 ref-forward 패턴 적용 — R9 §2.4 명세) + bump 3 콜백 ref-forward 유지 + useMemo 반환의 isInferring: driverHealth.isInferring + 헤더 12줄 응축 + 본체 한국어 주석 응축 (line 99/127/188/202 등 -3 lines). LOC ≤320. | 파일 갱신 + LOC ≤320 + tsc green + driver 외부 시그니처 무변경 |
| **T3** | §3.2 §3.3 | `staging/tests/metadataFreezeMirror.test.ts` 갱신: it 2 의 skip+warn 제거하고 toContain MARKER 강제 검증 (R9 §3 strict). 헤더 JSDoc 도 R9 §3 갱신. LOC ≤55. | 파일 갱신 + vitest run 시 it 2 PASS (T5 적용 상태) + tsc green |
| **T4** | §6.1 | `useYoloWorkerLifecycle.ts` 의 STABLE_READY_MS 상수 환경변수화 (`NEXT_PUBLIC_YOLO_STABLE_READY_MS`, default 60_000). LOC ≤368. | 파일 갱신 + tsc green + LOC 통과 |
| **T5** | §2.3 | 신규 파일 `staging/docs/phase_b_ref_forward_pattern.md` (~85 LOC) — 본 §2.3 명세 본문. ARCHITECTURE.md 갱신은 R11 src/ PR 시점 보류. | 파일 생성 + LOC ~85 (정확치 무관, 50~120 사이 OK) |
| **T6** | §6.3 | `staging/docs/phase_b_src_migration_checklist.md` §3 또는 §8 에 NEXT_PUBLIC_YOLO_STABLE_READY_MS Vercel env 등록 1 체크박스 (~5 lines) 추가. | 체크박스 1개 추가 + grep "NEXT_PUBLIC_YOLO_STABLE_READY_MS" 1건 (체크리스트 안) |

### 8.2 권고 (Optional) — 시간 여유 시 R9 처리, 부족 시 R10 이월

| ID | 출처 | 항목 | 완료기준 |
|----|------|------|---------|
| **T7** | §4.2 | `useYoloLatencyTracker.ts` JSDoc 응축 (헤더 24 → 12 + Args/Result 26 → 18 + computePercentile 7 → 4 + @example 8 → 4). LOC ≤145. | LOC ≤145 + tsc green + vitest 회귀 0 |
| **T8** | §5.1 | `yoloLatencyTracker.test.ts` 6 → 4 cases 통합 (case 1+2 / case 3+4 / case 5 / case 6). LOC ≤180. | vitest 4 cases all PASS + 회귀 0 |
| **T9** | §7.2 | `broadcasterYoloDriver.renderHook.test.ts` 에 case 6 추가 — confirmed → 동일 classKey 재 confirmed → NONE_KEY 3프레임 cleared → null. LOC ≤315. | vitest 신규 1 case PASS + 기존 5 cases 회귀 0 |

**필수 6건 + 권고 3건 = 총 9건.** R9 의 핵심은 T1 + T2 (옵션 C 부분 흡수 + 헤더/주석 응축으로 driver 마진 회복) + T3 (mirror strict) + T5 (ref-forward 명세 정착) 4건. T4 + T6 은 환경변수 1축. T7~T9 권고.

### 8.3 금지 사항 (R9 강화)

- **파일 삭제 금지** (CLAUDE.md). T1/T2 의 변경은 Edit 만 — 함수/라인 본체 교체.
- **driver `≤320` 강제** (R8 한도 유지). T2 후 driver ≤320 위반 시 즉시 REJECT.
- **useDriverHealth `≤120` 강제** (R9 한도). T1 후 ≤120 위반 시 즉시 REJECT.
- **lifecycle `≤368` 강제** (R8 +4 완화 한도). T4 외 추가 lifecycle 변경 0.
- **src/ 0 diff 강제** (CLAUDE.md #13). T5 src/ 마커는 R8 적용 → R9 는 src/ 무수정. R9 작업으로 인한 src/ 변경 발생 시 즉시 REJECT.
- **ref-forward 패턴 변경 금지** — bump 3 콜백 ref-forward 유지. markInferring 은 R9 §2.4 명세 따라 ref-forward 추가 (총 4 콜백 ref-forward).

### 8.4 Dev 가 Arch 에 질문해야 하는 경우

R6 §1.3 의 3조건 (테스트 회귀 증거 + self-sufficient 대체 + QA 사유 기록) 모두 만족 시 단독 보류 가능. R9 의 자동 질문 대상:
1. **T2 의 markInferring ref-forward 추가가 driver LOC 마진을 깎는가**: 현 ref-forward 3종 + markInferring ref-forward 추가 = 4종 → +4 lines. 옵션 C 흡수 -4 lines + 헤더 -5 + 주석 -3 = -12. 합 -8 → driver ~312. 한도 ≤320 통과. 단 마진 8 라 R10 추가 위험.
2. **T1 의 useDriverHealth 가 isInferring state 추가 시 외부 사용처 (DiagBadge) 가 driverResult.isInferring 참조 — 호환 검증**: DiagBadge 가 `driverResult.isInferring` 만 보므로 driver 가 useMemo 반환에 `isInferring: driverHealth.isInferring` forward → 호환.
3. **T7 응축 시 한국어 주석 줄임 → CLAUDE.md "비전공자가 읽을 수 있는가" 위배 우려**: 응축은 중복 제거 + 1줄 압축 — 의미 전달 유지. R9 QA 가 가독성 체크.

---

## §9. QA Agent 운영 권고 (R8 §8 동일 정책 + R9 강화)

### 9.1 R8 QA Bash 권한 회복 결과

R8 QA Agent 가 5개 명령 직접 실행 (tsc / vitest / git diff stat / git diff full / wc -l + 보강 grep 3종) — 실측 신뢰도 회복 + 6/9 진입 핵심.

### 9.2 R9 팀장 권고

R9 QA Agent 에 다음 6개 명령 실행 권한을 명시 허용 (R8 동일 5 + 1 신규):

```bash
npx tsc --noEmit -p tsconfig.staging-check.json
npx vitest run
git diff --stat src/
git diff src/
wc -l staging/hooks/*.ts staging/components/*.tsx staging/lib/behavior/*.ts staging/tests/*.ts staging/docs/*.md
```

추가 명령 (R9 신규 — R9 §6 환경변수 + R9 §3 mirror strict 검증):

```bash
grep -n "NEXT_PUBLIC_YOLO_STABLE_READY_MS" staging/hooks/useYoloWorkerLifecycle.ts staging/docs/phase_b_src_migration_checklist.md
grep -n "metadata-freeze-spec: r7-1" src/hooks/useBehaviorEventLogger.ts staging/lib/behavior/buildBehaviorEventMetadata.ts
```

**이유:**
- R9 변경은 useDriverHealth 인터페이스 변경 (T1) + driver markInferring/isInferring 흡수 (T2) + STABLE_READY_MS 환경변수 (T4) + mirror strict (T3) + 신규 문서 (T5) — **타입 변경 + 환경변수 추가 + 테스트 strict 강화** 다축 발생. 정적 검증만으로는 회귀 가능성.
- T4 환경변수 grep 은 lifecycle/checklist 양쪽 적용 검증의 단일 명령.
- T3 mirror strict 검증은 양쪽 마커 grep 동일 — silent regression 사전 차단.

### 9.3 권한 부족 시 R9 QA 보강 절차

R8 QA 와 동일 — 팀장이 직접 6개 명령 실측 → R9 QA 리포트 첨부.

### 9.4 R8 QA 가 명시 권고한 R9 우선 처리 3건 (재확인)

R8 QA 가 R9 권고로 명시한 3건의 본 R9 처리 매핑:

| R8 QA 권고 | R9 §  | T |
|-----------|-------|---|
| #1 driver 320 마진 회복 (옵션 A/B/C) | §1 (옵션 C 부분 + 옵션 B 보조 응축) | T1 + T2 |
| #2 ref-forward 패턴 명세 정착 | §2 (T5 신규 .md 문서) | T5 |
| #3 mirror skip → fail 강화 | §3 (옵션 X 단순 fail) | T3 |

3건 모두 R9 필수 TODO 로 반영 — R10 미루기 0.

---

## §10. R9 LOC 예측 표 (분할 후 파일별)

| 파일 | R8 LOC | R9 예상 | 한도 (R6/R8/R9) | R9 마진 | 변경 요약 |
|------|--------|---------|------------------|---------|-----------|
| `useBroadcasterYoloDriver.ts` | 320 | **~312** | 400 / **R8 ≤320 (R9 유지)** | **88 (R6) / 8 (R9)** | markInferring 흡수 -4 + 헤더 -5 + 주석 -3 + markInferring ref-forward +4 = -8 |
| `useDriverHealth.ts` | 100 | **~117** | 400 / **R9 ≤120 (R8 +20 완화)** | **283 / 3** | isInferring state +5 + markInferring useCallback +3 + setIsInferring resetForDisabled +2 + 헤더 응축 25줄 +7 = +17 |
| `useYoloWorkerLifecycle.ts` | 364 | **~368** | 400 / **R9 ≤368 (R8 +4 완화)** | 32 / 0 | STABLE_READY_MS 환경변수화 +4 |
| `useYoloLatencyTracker.ts` | 172 | **~145** | 400 / **R9 ≤145 (R8 -27 강화)** | 255 / 0 | JSDoc/주석 응축 -27 (T7 권고) |
| `useYoloSampling.ts` | 235 | 235 (변동 없음) | 400 / 350 | 115 | 변경 없음 |
| `YoloDriverDiagBadge.tsx` | 98 | 98 (변동 없음) | 100 | 2 | 변경 없음 |
| `CameraBroadcastYoloMount.tsx` | 89 | 89 (변동 없음) | 100 | 11 | 변경 없음 |
| `buildBehaviorEventMetadata.ts` | 47 | 47 (변동 없음) | 400 / 350 | 303 | 변경 없음 |
| `metadataFreeze.test.ts` | 132 | 132 (변동 없음) | — | - | 변경 없음 |
| `metadataFreezeMirror.test.ts` | 63 | **~55** | — | - | it 2 skip+warn → strict fail (T3) |
| `yoloLatencyTracker.test.ts` | 228 | **~180** | — | - | 6 → 4 cases 통합 (T8 권고) |
| `yoloWorkerLifecycle.test.ts` | 475 | 475 (변동 없음) | — | - | 변경 없음 |
| `broadcasterYoloDriver.renderHook.test.ts` | 249 | **~310** | — | - | case 6 추가 (T9 권고) |
| `phase_b_src_migration_checklist.md` | 446 | **~451** | — | - | NEXT_PUBLIC_YOLO_STABLE_READY_MS 1 체크박스 +5 (T6) |
| `phase_b_field_test_plan.md` | 174 | 174 | ≤180 | 6 | 변경 없음 |
| `phase_b_ref_forward_pattern.md` (신규) | - | **~85** | — | - | T5 신규 |
| `vitest.config.ts` | 56 | 56 (변동 없음) | — | - | 변경 없음 |
| `tsconfig.staging-check.json` | 46 | 46 (변동 없음) | — | - | 변경 없음 |
| `src/hooks/useBehaviorEventLogger.ts` | (R8 +1 line 적용 완료) | (변동 없음) | — | - | R9 src/ 무수정 |

**R9 핵심 LOC 효과:**
- driver 320 → ~312 (마진 8 회복 — MINOR-R8-NEW-2 해소).
- useDriverHealth 100 → ~117 (옵션 C 흡수 비용 + 헤더 응축으로 한도 ≤120 마진 3).
- lifecycle 364 → ~368 (R9 §6 환경변수 비용).
- tracker 172 → ~145 (R8 §10 R9-A 처리, T7 권고 채택 시).
- test 파일 응축/추가로 vitest 카운트 101 → 102 (case 6 추가 시).

**ref-forward 명세 정착 (T5)** + **mirror strict (T3)** 으로 silent regression 차단.

---

## §11. R10 이월 항목

R9 가 7건 처리, R10 이월 6건.

| ID | 항목 | 이월 사유 | R10 권고 |
|----|------|----------|---------|
| **R10-A** | iOS 실기기 latency P95 임계값 결정 | 사장님 실기기 30분 후 | dev 배지 inferLatencyP95Ms < 1000ms 임계값 결정 + STABLE_READY_MS iOS 자동 분기 검토 |
| **R10-B** | STABLE_READY_MS 30/60/90/120 결정 | R9 §6 환경변수 PR 적용 후 사장님 실측 | iOS UA 분기 추가 또는 default 변경 |
| **R10-C** | Mirror 함수 NaN/Infinity 가드 검토 | Phase D Arch 합의 후 | Number.isFinite 가드 추가 (freeze spec 변경 사안) |
| **R10-D** | tracker latencyRefs useMemo 빈 deps 재확인 | R9 §4 응축 정착 후 | useRef 두 개 직접 노출 검토 |
| **R10-E** | field_test_plan 32 체크박스 30분 가능성 | 사장님 실기기 후 | 시간 측정 + 우선순위 재배치 |
| **R10-F** | 옵션 D (confirmFrames 분리) 또는 useDriverHealth 추가 흡수 (lastDetections/avgConfidence) | R9 옵션 C 부분 흡수 정착 후 | driver 마진 추가 회복 검토 |
| **R10-G** | onnxruntime-web Worker terminate 순서 검증 (R4-h) | Playwright 통합 테스트 필요 | Phase C 이후 |
| **R10-H** | Phase D Arch 초안 병렬 (R8 §10 R9-I) | R11 PASS 까지 보류 | 팀장 판단 |
| **R10-I** | 체크리스트 §8.5 R7-S + 옵션 3 src/ 마커 commit 분리 검증 | src/ 반영 PR 시점 | atomic deploy + Vercel READY+PROMOTED + Rollback 메모 |

### 11.1 R10 가이드 (R9 PASS 가정)

R9 통과 시 R10 Arch 는 다음 우선순위:
1. **R9 변경의 정착 검증** — useDriverHealth 의 isInferring 흡수 후 회귀 0 + ref-forward 4 콜백 race 영향 0 + STABLE_READY_MS 환경변수 fallback 정상 + mirror strict 회귀 차단.
2. **iOS 실기기 결정 (R10-A/B)** — 사장님 실측 후 임계값 / STABLE_READY_MS 확정.
3. **driver 추가 마진 검토 (R10-F)** — 옵션 D 또는 useDriverHealth 흡수 추가.
4. **Phase B 9연속 PASS 7/9 → 8/9 목표** — R11 까지 직선 거리.

### 11.2 R10/R11 전망

- **R10**: iOS 결정 (사장님 실기기 가능 시점) + driver 추가 마진 (옵션 D 또는 흡수) + 8/9 카운트.
- **R11**: 마지막 회귀 검증 + 9/9 PASS — Phase B src/ 반영 PR 착수 가능 + ARCHITECTURE.md §10 ref-forward 패턴 통합 + R7-S mirror 합치기.

---

## §12. R9 검증 plan (R9 QA 가 따라갈 9관점)

| R | 관점 | R9 핵심 검증 |
|---|------|--------------|
| 1 | 동작 | tsc + vitest (101 → 102 case 6 추가 시) + git diff src/ (+0) + LOC 표 모두 green. T1~T6 필수 완료. |
| 2 | 설계 일치 | 옵션 C 부분 흡수 §1 / ref-forward 명세 §2 / mirror strict §3 / tracker 응축 §4 / test 통합 §5 / STABLE_READY_MS 환경변수 §6 / case 6 §7 모두 본 §1~§7 명세와 1:1 대응. |
| 3 | 단순화 | driver 312 마진 8 회복 / useDriverHealth 의 markInferring + isInferring 단일 소유 / mirror 1 case 즉시 fail / tracker 145 응축 / test 4 cases 통합. |
| 4 | 가독성 | useDriverHealth 헤더 25줄 응축 (5축 한국어 설명) / driver 헤더 12줄 압축 (R8 §1 / R7 §3 / R3 분리 사실 유지) / tracker 헤더 12줄 응축 (책임 + 데이터 흐름 4단계). |
| 5 | 엣지케이스 | useDriverHealth 의 disabled reset 시 setIsInferring(false) 추가 (R9 §1.6) / mirror strict 의 src/ 마커 부재 시 즉시 fail / case 6 의 confirmed → 동일 classKey → setCurrentBehavior 호출 0 + cleared 동작 검증. |
| 6 | 성능 | useDriverHealth 의 effect deps `[enabled, latencyRefs]` 안정 (latencyRefs lifecycle useMemo) → interval 재생성 0. ref-forward 4 콜백 (markInferring 추가) — driver 의 wrapper useCallback deps [] stable. |
| 7 | 보안 | src/ 0 diff 원칙 준수 (R9 작업 src/ 무수정) / mirror strict 회귀 차단 강화 / STABLE_READY_MS 환경변수 fallback 안전. |
| 8 | 영향 범위 | driver `DriverArgs` / `DriverResult` / Mount props 무변경. lifecycle / sampling args 무변경 (markInferring 출처만 변경). useDriverHealth 신규 export (isInferring/markInferring 추가) — 외부 import 0 (driver 만 사용). |
| 9 | 최종 품질 | LOC 마진 R9 강화 한도 모두 통과 (driver 마진 8 / useDriverHealth 마진 3 / lifecycle 마진 0 / tracker 마진 0 / 테스트 마진 5). 9연속 PASS 카운트 7/9 진입 가능. |

### 12.1 R9 QA REJECT 조건 예시

- T1~T6 중 1건이라도 **필수** 누락 → REJECT.
- driver LOC > 320 → REJECT (R9 한도 유지).
- useDriverHealth LOC > 120 → REJECT (R9 한도).
- lifecycle LOC > 368 → REJECT (R9 한도).
- tracker LOC > 145 (T7 채택 시) → REJECT.
- vitest run 1건이라도 fail → REJECT.
- src/ diff > 0 line → REJECT (R9 src/ 무수정 약속).
- useDriverHealth 의 isInferring/markInferring 누락 → REJECT.
- mirror it 2 가 skip + warn 으로 남아있으면 → REJECT.

---

## §13. R9 마지막 권고

R8 driver 320 = R8 한도 정확 일치 (마진 0) 가 R9 의 최대 위험. R9 옵션 C 부분 흡수 + 헤더/주석 응축 조합으로 마진 8 회복. 옵션 D (confirmFrames 분리) 의 응집도 손실 우려로 R10 보류.

**R9 의 핵심은 옵션 C 부분 흡수 (T1+T2) + ref-forward 정식 명세 (T5, .md 문서) + mirror strict (T3) 3축.** STABLE_READY_MS 환경변수 (T4+T6) 는 R10 사장님 실기기 결정의 사전 작업.

R9 Dev 는 §8.1 순서대로 T1 → T2 → T3 → T4 → T5 → T6 진행 시 의존 사슬 단절 없음:
- T1 (useDriverHealth isInferring + markInferring 추가) → T2 (driver markInferring 사용처 변경 + ref-forward 4 콜백 + 헤더/주석 응축) → T3 (mirror strict) → T4 (lifecycle 환경변수) → T5 (ref-forward 신규 .md 문서) → T6 (체크리스트 1 체크박스).

각 단계마다 `npx tsc --noEmit -p tsconfig.staging-check.json` + `npx vitest run` 실측 권고.

T7 (tracker 응축) / T8 (test 통합) / T9 (case 6) 는 권고. 시간 여유 시 R9 처리, 부족 시 R10 이월. 단 T9 (case 6) 는 본 R9 가 R8 §10 R9-C 의 명시 권고를 처리한다는 의미에서 **권고 중 가장 우선** — Dev 가 시간 부족 시 T7/T8 보다 T9 우선.

**R9 PASS 진입 시 9연속 카운트 7/9. R10/R11 2 라운드 남음. Phase B src/ 반영 PR 까지 직선 거리 단축.**

---

**R9 Arch 최종 권고:** 옵션 C 부분 흡수 (§1, isInferring/markInferring useDriverHealth 이전) + ref-forward 정식 명세 (§2, 신규 .md) + mirror strict 강화 (§3, skip 제거) + tracker 응축 (§4, 권고) + test 통합 (§5, 권고) + STABLE_READY_MS 환경변수 (§6, 1 상수 + 1 체크박스) + case 6 추가 (§7, 권고) 가 R9 의 핵심. 옵션 D 보류 (§1.9). QA Bash 권한 회복 (§9) 이 R8 와 동일 신뢰도 유지.

R8 QA 6/9 → R9 7/9 진입 + driver R9 마진 8 회복 (MINOR-R8-NEW-2 해소) + ref-forward 명세 정착 (MINOR-R8-NEW-1 해소) + mirror strict (silent regression 차단) + R10 권고 6건 명확 분리가 R9 합격선.
