# Phase B ref-forward callback wrapper 패턴

> 작성: Phase B Arch/Dev Agent (R9 §2)
> 적용: `staging/hooks/useBroadcasterYoloDriver.ts` 의 bump 3 + markInferring 4 콜백 / `staging/hooks/useYoloWorkerLifecycle.ts` 의 콜백 ref 동기화
> 근거: R8 MINOR-R8-NEW-1 발견 → R9 §2 정식 명세화

## §0 배경

R8 driver 분할 시 `useDriverHealth` 가 `lifecycle.latencyRefs` 를 인자로 필요 → driver 안에서
lifecycle 합성이 useDriverHealth 합성보다 **먼저** 발생해야 함. 그러나 lifecycle args 의
`onSuccess`/`onFailure`/`markInferring` 은 driverHealth 의 callback 을 받아야 하므로 → driver 가
lifecycle args 작성 시점에 driverHealth.* 가 아직 미존재 → 순환 의존.

R8 Dev 가 ref-forward wrapper 패턴 (bump 3 콜백) 으로 해소. R9 §1 옵션 C 부분 흡수에서
markInferring 도 useDriverHealth 가 단일 소유 → driver 의 ref-forward 가 4 콜백으로 확장.
R9 §2 가 본 패턴을 Phase B 표준으로 정식 채택.

## §1 패턴 정의

**언제 쓰는가:**
- 합성 훅 (예: driver) 안에서 자식 훅 A (예: useDriverHealth) 의 callback 을 다른 자식 훅 B
  (예: lifecycle/sampling) 의 args 에 전달해야 하지만, **A 의 합성 자체가 B 의 출력 (예:
  latencyRefs) 에 의존** → 순환 의존 발생 시.

**왜 안전한가:**
- A 의 callback 이 useCallback(deps []) stable → ref 동기화 effect 가 첫 1회만 실행.
- ref 의 빈 함수 초기값 → 첫 렌더 ~ effect 실행 사이에 B 가 callback 호출 시 빈 함수 호출
  (손실 1회 가능성). 단 worker message 도달 ms 지연 > React effect 실행 ms → 실질 손실 0.
- 첫 렌더 race 가 우려되면 빈 함수 대신 console.warn 또는 측정 카운터 추가 가능.

## §2 코드 예시 (Phase B driver 의 4 콜백 ref-forward)

```ts
// (driver useBroadcasterYoloDriver.ts §9 발췌 — R9 §2 정식 채택)

// 1) ref 4종 선언 (callback placeholder, 빈 함수 초기값).
const bumpSuccessRef = useRef<() => void>(() => {});
const bumpFailureRef = useRef<(err: unknown) => void>(() => {});
const bumpTickRef = useRef<() => void>(() => {});
const markInferringRef = useRef<(v: boolean) => void>(() => {});

// 2) wrapper useCallback (deps []) — ref 통해 호출. lifecycle/sampling args 에 전달.
const onSuccess = useCallback((): void => bumpSuccessRef.current(), []);
const onFailure = useCallback((err: unknown): void => bumpFailureRef.current(err), []);
const onTick = useCallback((): void => bumpTickRef.current(), []);
const markInferring = useCallback((v: boolean): void => markInferringRef.current(v), []);

// 3) lifecycle 합성 — driverHealth 미존재 시점에 wrapper 만 prop.
const lifecycle = useYoloWorkerLifecycle({
  enabled, onDetections: handleResult, frameIdRef,
  onSuccess, onFailure, markInferring,
});

// 4) useDriverHealth 합성 — lifecycle.latencyRefs 인자 전달.
const driverHealth = useDriverHealth({ enabled, latencyRefs: lifecycle.latencyRefs });

// 5) ref 동기화 effect — driverHealth.* 모두 deps [] stable, 첫 1회만 실행.
useEffect(() => {
  bumpSuccessRef.current = driverHealth.bumpSuccess;
  bumpFailureRef.current = driverHealth.bumpFailure;
  bumpTickRef.current = driverHealth.bumpTick;
  markInferringRef.current = driverHealth.markInferring;
}, [
  driverHealth.bumpSuccess, driverHealth.bumpFailure,
  driverHealth.bumpTick, driverHealth.markInferring,
]);
```

## §3 안전성 분석

**race 조건 검토:**
- 첫 렌더: bumpSuccessRef.current = `() => {}` (빈 함수).
- 첫 effect 실행 직후: bumpSuccessRef.current = driverHealth.bumpSuccess (실제 콜백).
- 첫 effect 실행 ~ worker.onmessage(result) 도달 사이 시간: React 의 effect flush 는 동기 ms,
  worker onmessage 는 init → modelLoad → result 까지 최소 100ms ~ 수초. 실질 손실 0.

**한도:**
- 본 패턴은 Phase B 의 useYoloWorkerLifecycle / useYoloSampling 처럼 **순환 의존 발생 + callback
  이 stable** 일 때만 안전. 매 렌더 새 callback 이면 effect 매번 재실행 → 의도와 다름.

## §4 Phase B 안 현 적용 사례

| 위치 | 패턴 적용 사유 | 호출 ref |
|------|---------------|---------|
| driver §9 (line 207-219, R9) | useDriverHealth 가 lifecycle.latencyRefs 인자 → 순환 | bumpSuccessRef / bumpFailureRef / bumpTickRef / markInferringRef |
| lifecycle (line 144-153) | driver/sampling 의 콜백 stale 클로저 방지 | onDetectionsRef / onSuccessRef / onFailureRef / markInferringRef |

## §5 향후 적용 대상 (예측)

- Phase D 라벨링 UI 의 user_label callback (driver 와 라벨러 훅 사이 양방향 의존 시).
- Phase E export/archive 의 onClipSnap / onError 콜백.

## §6 R11 src/ 반영 PR 시점 안내

본 staging 문서는 Phase B src/ 반영 PR 시점에 `docs/ARCHITECTURE.md` §10 의
"훅 합성 패턴" 항목으로 흡수 — 본 .md archive 처리.
