# Phase B Arch R1 — YOLO 온디바이스 추론 파이프라인

> 작성: 1번 Arch Agent (R1)
> 작성일: 2026-04-24
> 범위: Phase A (12 클래스 DB/logger) 완료 이후, 방송폰에서 ONNX 추론을 돌려 `cat_behavior_events` 에 이벤트를 적재하기까지.
> 원칙: CLAUDE.md #13 (flag OFF 무손상), #14 비적용 — 신기능이므로 `staging/` 전용.

---

## 0. 핵심 결정 요약 (Q1~Q6 답변)

| Q | 결정 | 근거 (요약) |
|---|------|-------------|
| **Q1 추론 위치** | **방송폰 단독 (primary)**. 뷰어폰 `useBehaviorDetection` 은 "프리뷰 전용" 으로 기존 경로 유지. | 가족 4명 동시 시청 시 뷰어 측 추론은 4× 중복 (동일 프레임 × 4기기). 방송폰 1회로 충분. Supabase pool=15 환경에서 이벤트 INSERT 를 "1 frame = 1 writer" 로 통일해야 경합 제거. 방송폰 배터리/CPU 부담은 주기 제어 + WebGPU 백엔드 + OffscreenCanvas 로 완화. |
| **Q2 추론 주기** | **낮 5초 간격 / 야간(22~06시) 30초 간격**. `useGlobalMotion` 이 "정적" 판단 시 120초 스로틀. | Phase A 문서의 "5분/30분" 은 다이어리 집계 샘플링 의도였고, 이벤트 탐지는 더 조밀해야 전환 경계가 살아남. 2 FPS 는 방송폰 상시 구동 시 배터리 과열. 5초는 사람이 관찰해도 "행동 전환 감지" 에 충분. motion=false 면 120s 로 늘려 sleeping 장시간 구간 CPU 낭비 방지. |
| **Q3 이벤트 모델** | **전환 시점 INSERT + duration 갱신 하이브리드** (기존 Phase A 로거 구조 계승). 최대 30분 단위 강제 close 규칙 추가. | 연속 20분 sleeping 을 1 row 로 기록 (ended_at 으로 duration 표현). Gemini 의 "개별 detection 배치" 는 row 폭증 → Supabase Nano pool 고갈 재발 위험. 단, 끊기지 않은 super-long row (새벽 8시간 sleeping) 는 라벨링 UI 비효율 → 30분 초과 시 자동 close + 새 row 로 분할. |
| **Q4 feature flag** | **`NEXT_PUBLIC_CAT_YOLO_V2`**. 기본 **OFF**. 베타 10명 중 사장님 1명부터 ON → 1주 모니터링 → 전체 ON. | 롤백 경로 확실. 빌드타임 주입이라 전환 시 빈 커밋 push 필요 (CLAUDE.md #6 교훈). src/ 기존 `useBehaviorDetection` 는 무손상 유지. |
| **Q5 기존 worker 재사용** | **재사용 + 보강**. `staging/workers/yoloInference.worker.ts` 초안 품질은 R1 기준 합격선. 단 `releaseSession` 누수 1건 / backend probe 타임아웃 누락 2건 / init 재시도 정책 0 건 은 R2 에서 보강. | 0부터 재작성은 낭비. 기존 훅이 이미 WebGPU→WebGL→WASM + warmup + transferable bitmap 을 구현. Phase B 는 worker 재사용 + 새 "driver hook" 만 staging/ 에 추가. |
| **Q6 Phase A 통합** | **Phase A `useBehaviorEventLogger` 를 그대로 재사용**. 새 훅 `useBroadcasterYoloDriver` 가 detection 을 logger 에 주입. metadata 필드는 yoloPostprocess 가 이미 채워줌. `model_version` 은 **`"v1"` 유지** (R2 에서 사장님 승인 후 `"yolov8n-2026-04-24"` 로 교체 검토). | logger 를 건드리면 Phase A 회귀 위험. "v1" 유지 시 Phase E archive 분류 로직도 변경 불필요. model_version 교체는 DB 마이그레이션 0건이므로 언제든 가능. |

---

## 1. 파일 구조 (staging/ 전용)

Phase B 는 신기능 → `staging/` 만 수정. 최종 승인 후 `src/` 반영은 팀장이 별도 PR 로 atomic deploy.

| 경로 | 목적 | 공개 API (요약) | 예상 LOC | 의존성 |
|------|------|-----------------|----------|--------|
| `staging/hooks/useBroadcasterYoloDriver.ts` | 방송폰 "추론 드라이버" 훅. 비디오 ref 받아 주기 샘플링 → worker 전송 → detection → logger 주입. | `useBroadcasterYoloDriver(args): DriverResult` | 220 | `staging/workers/yoloInference.worker.ts`, `staging/hooks/useBehaviorEventLogger.ts` (Phase A), `staging/hooks/useBehaviorInferenceScheduler.ts`, `@/hooks/useGlobalMotion` (읽기 전용) |
| `staging/hooks/useBehaviorInferenceScheduler.ts` | 주기 결정 로직 (낮/야간/motion 연동). driver 훅이 "다음 추론 시점" 을 위임. | `useBehaviorInferenceScheduler(args): { nextTickMs: number; shouldInferNow: () => boolean }` | 120 | `@/hooks/useGlobalMotion` (옵셔널) |
| `staging/lib/behavior/confirmFrames.ts` | "N프레임 연속 동일 클래스 확정" 순수 함수. 기존 `useBehaviorDetection` 로컬 로직을 테스트 가능 모듈로 분리. | `confirmDetection(history, incoming, windowSize): DetectionOrNull` | 80 | 없음 (순수) |
| `staging/lib/behavior/maxDurationGuard.ts` | 30분 초과 이벤트 강제 close 판정. | `shouldForceClose(openEvent, now, maxMs): boolean` | 40 | 없음 (순수) |
| `staging/lib/behavior/yoloV2Flag.ts` | `NEXT_PUBLIC_CAT_YOLO_V2` flag 해석. 단일 진입점. | `isYoloV2Enabled(): boolean` | 15 | 없음 |
| `staging/components/CameraBroadcastYoloMount.tsx` | `CameraBroadcastClient` 에 mount 되는 "invisible" 컴포넌트. flag ON 일 때만 driver 훅 실행. UI 없음. | `<CameraBroadcastYoloMount videoRef={} homeId={} cameraId={} />` | 70 | driver 훅, flag 유틸 |
| `staging/tests/broadcasterYoloDriver.test.ts` | driver 훅 통합 테스트 (jsdom, mock worker). | — | 200 | Jest / vitest |
| `staging/tests/confirmFrames.test.ts` | 확정 로직 단위 테스트. | — | 90 | Jest / vitest |
| `staging/tests/inferenceScheduler.parity.test.ts` | scheduler 가 TS/SQL 시간대 기준과 일치하는지 검증. | — | 110 | Jest |
| `staging/tests/maxDurationGuard.test.ts` | 30분 guard 단위 테스트. | — | 50 | Jest |

**재사용 (수정 없음):**
- `staging/workers/yoloInference.worker.ts` — 기존 초안 그대로.
- `staging/hooks/useBehaviorEventLogger.ts` — Phase A logger 그대로.
- `staging/lib/ai/yoloPostprocess.ts`, `staging/lib/ai/behaviorClasses.ts` — Phase A 파이프라인 그대로.

**수정 없음 (src/ 무손상):**
- `src/hooks/useBehaviorDetection.ts` — 뷰어폰 프리뷰 전용 유지.
- `src/app/camera/broadcast/CameraBroadcastClient.tsx` — flag OFF 시 mount 변화 0. flag ON 시 `<CameraBroadcastYoloMount />` 1줄만 **최종 승인 후 src/ 반영 단계에서** 추가 (staging 단계에서는 wrapper 컴포넌트 실험).

---

## 2. 데이터 흐름 다이어그램 (ASCII)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          방송폰 (Broadcaster)                               │
│                                                                            │
│  getUserMedia()                                                            │
│       │                                                                    │
│       ▼                                                                    │
│  <video ref={videoRef}>  ◀── useCameraStream (기존, 수정 없음)             │
│       │                                                                    │
│       │ (flag ON 시)                                                       │
│       ▼                                                                    │
│  <CameraBroadcastYoloMount>   ──  flag OFF 시 렌더 자체 skip               │
│       │                                                                    │
│       ├─ useBehaviorInferenceScheduler                                     │
│       │     (시간대 / motion / battery 기반 다음 tick 계산)                │
│       │                                                                    │
│       ├─ useBroadcasterYoloDriver                                          │
│       │     ① setInterval(tick = scheduler.nextTickMs)                     │
│       │     ② tick 때마다 createImageBitmap(video) → transferable          │
│       │     ③ worker.postMessage({ type: "infer", bitmap })                │
│       │     ④ onmessage → detections[] 수신                                │
│       │     ⑤ confirmDetection(history, detections[0]) → confirmed        │
│       │     ⑥ avgConfidence = 최근 N프레임 평균                            │
│       │     ⑦ setState(currentBehavior=confirmed)                          │
│       │     ⑧ maxDurationGuard 체크 → 초과시 강제 reset                    │
│       │                                                                    │
│       ▼                                                                    │
│  useBehaviorEventLogger (Phase A, 수정 없음)                               │
│     - currentBehavior 전환 감지                                            │
│     - ended_at UPDATE (이전 row)                                           │
│     - INSERT (새 row, metadata 포함)                                       │
│     - fire-and-forget + localStorage 큐                                    │
│       │                                                                    │
│       ▼                                                                    │
│  Supabase: cat_behavior_events (RLS: home owner/member)                    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                │
                                │ Realtime / 쿼리 (기존 경로)
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          뷰어폰 (Viewer)                                    │
│  - 방송 수신 (WebRTC) — 기존 경로                                          │
│  - useBehaviorDetection (src/, 수정 없음):                                 │
│      · flag OFF → 기존대로 뷰어 측 추론 (legacy)                           │
│      · flag ON → "프리뷰 전용" 오버레이만, DB INSERT 는 하지 않음          │
│        (logger 인자 currentBehavior 주입을 상위에서 null 처리)             │
│  - 다이어리 페이지: 방송폰이 적재한 이벤트를 읽어 집계                     │
└────────────────────────────────────────────────────────────────────────────┘
```

핵심: **DB INSERT 는 방송폰에서만**. 뷰어는 오버레이 프리뷰만.

---

## 3. 공개 API 시그니처 (타입만, 구현 X)

### 3.1 `useBroadcasterYoloDriver`

```
type DriverArgs = {
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;                // flag ON 이면서 방송 중일 때만 true
  homeId: string | null;
  cameraId: string | null;
  identifiedCatId?: string | null; // 없으면 logger 가 null 로 기록
  supabaseClient?: SupabaseClient; // 미주입 시 logger 가 자체 생성
};

type DriverResult = {
  currentBehavior: BehaviorDetection | null;
  backend: "webgpu" | "webgl" | "wasm" | null;
  isInferring: boolean;
  lastDetections: BehaviorDetection[];
  health: {
    ticksTotal: number;       // 누적 샘플링 횟수
    inferSuccesses: number;
    inferFailures: number;
    lastBackendError: string | null;
  };
};

부수효과:
- enabled true → worker 생성, ImageBitmap 생성, postMessage
- enabled false → worker.terminate, bitmap 소유권 해제, interval clear
- page visibility hidden → interval 중단 (복귀 시 재개, 히스토리 초기화)
- unmount → 모든 리소스 정리 + logger 에 null 전환 통지

에러 조건:
- video.readyState < 2 → 조용히 스킵 (busy=false 복원)
- worker 생성 실패 → health.lastBackendError 기록, DriverResult.backend=null
- createImageBitmap throw → 해당 tick 스킵, bitmap 수동 close
- postMessage throw → bitmap.close() 보장 (transferred 플래그 확인)
```

### 3.2 `useBehaviorInferenceScheduler`

```
type SchedulerArgs = {
  enabled: boolean;
  motionActive?: boolean;    // useGlobalMotion 결과 (옵셔널)
  now?: () => Date;          // 테스트용 주입
};

type SchedulerResult = {
  nextTickMs: number;        // 5000 / 30000 / 120000 중 하나
  shouldInferNow: () => boolean;  // 필요 시 수동 체크
  regime: "day-active" | "night" | "idle-throttled";
};

결정 규칙:
- 22:00 ~ 06:00 → "night", 30000ms
- 그 외, motionActive === false → "idle-throttled", 120000ms
- 그 외 → "day-active", 5000ms
- 배터리 저전력(navigator.getBattery) charging=false && level<0.2 → 항상 2× 느리게
```

### 3.3 `confirmDetection` (순수 함수)

```
confirmDetection(
  history: string[],     // 최근 N개의 classKey (가장 오래된 것이 0번)
  incomingKey: string,   // 방금 들어온 classKey ("__none__" 포함)
  windowSize: number,    // 3 (낮) / 2 (야간, 샘플링 느리므로 완화)
): { confirmedKey: string | null; newHistory: string[] }

규칙:
- newHistory = [...history, incomingKey].slice(-windowSize)
- newHistory.length === windowSize 이고 all equal → confirmedKey = (키가 "__none__" 이면 null, 아니면 키)
- 그 외 → confirmedKey = null (현재 상태 유지하라는 뜻)

부수효과: 없음 (순수)
에러 조건: windowSize < 1 → throw (테스트용 guard)
```

### 3.4 `shouldForceClose`

```
shouldForceClose(
  openEvent: { startedAt: Date; classKey: string } | null,
  now: Date,
  maxMs: number = 30 * 60 * 1000,  // 30분
): boolean

규칙:
- openEvent null → false
- (now - startedAt) >= maxMs → true
- 그 외 → false
```

### 3.5 `isYoloV2Enabled`

```
isYoloV2Enabled(): boolean

규칙:
- typeof process === "undefined" → false (worker 컨텍스트 보호)
- process.env.NEXT_PUBLIC_CAT_YOLO_V2 === "1" → true
- 그 외 → false
```

---

## 4. 엣지케이스 목록

| # | 케이스 | 처리 방향 |
|---|--------|-----------|
| 1 | **네트워크 단절** | logger 의 localStorage 큐 (Phase A, max 100) 에 보존. 복구 시 자동 flush. driver 는 추론 계속 (DB 실패와 분리). |
| 2 | **배터리 저전력 (level < 0.2, 충전 아님)** | scheduler 가 tick 주기 2× 증가. 그래도 level < 0.1 이면 driver.enabled → false 로 상위에서 판단 (R2 에서 UX 결정). |
| 3 | **ONNX 모델 로드 실패** | worker 가 "error" 메시지 송신. driver 가 `health.lastBackendError` 기록 후 재시도 스케줄 (60초 뒤). 3회 연속 실패 시 포기 → flag 자동 OFF 효과. src/ 기존 경로 무손상. |
| 4 | **모델 버전 mismatch** | `/models/cat_behavior_yolov8n.onnx` 해시를 빌드타임에 기록해 둘지 R2 에서 결정. Phase B 내에서는 단일 파일이므로 worker 가 inputNames/outputNames/dims 를 런타임 검증 (yoloPostprocess 의 `needsTranspose` 로직 참고). |
| 5 | **document.hidden (탭 숨김)** | driver 의 interval clear (기존 `useBehaviorDetection` 패턴 복제). 복귀 시 히스토리 초기화 + lastEmittedKey=__none__ 동기화 → logger 에 null 전환 1회 통지. |
| 6 | **카메라 장치 전환** (cameraId 변경) | driver 의 enabled effect deps 에 cameraId 포함. cleanup 에서 worker.terminate + logger 는 자체 cleanup (Phase A) 으로 open row 강제 close. |
| 7 | **백그라운드 탭 스로틀링** | setInterval 이 OS 레벨에서 최소 1000ms 보장 실패 가능 → `performance.now()` 기반 "경과 시간 체크" 로직 추가 (scheduler.shouldInferNow). R2 에서 구체화. |
| 8 | **Supabase pool 고갈** | 방송폰은 세션당 1 connection 만 유지 (logger 는 insert 시 단발 사용). 고갈 징후 감지 시 driver 가 자체 스로틀하지는 않음 — 상위 운영 정책 (CLAUDE.md #10/#12) 에 위임. |
| 9 | **ImageBitmap 생성 실패** (video.readyState < 2) | try/catch + busyRef=false 복원. tick 스킵. |
| 10 | **동일 행동이 30분 넘게 지속** | maxDurationGuard 가 true 반환 → driver 가 `setCurrentBehavior(null)` 로 logger 에 close 유도 후 다음 tick 에서 같은 행동 재감지 시 새 row INSERT. |
| 11 | **Worker crash (비정상 종료)** | onerror 핸들러 → worker.terminate + 재생성. 누적 health.inferFailures 증가. |
| 12 | **WebGPU 컨텍스트 lost** | onnxruntime-web 이 next run 에서 throw → 재생성 루프 (엣지 #3 과 동일). |
| 13 | **flag ON 인데 방송이 아직 시작 안 됨** | enabled = (flagON && broadcasting && homeId && cameraId). 4개 모두 true 여야 driver 실행. |
| 14 | **뷰어폰에서 중복 INSERT 위험** | 뷰어 측 `useBehaviorDetection` 의 `onBehaviorChange` 콜백 주입을 flag ON 시 상위 컴포넌트에서 **미주입** 처리. logger 는 기존과 달리 "뷰어에서는 절대 호출 안 됨" 을 정책으로 고정. |

---

## 5. Feature flag 정책

**이름:** `NEXT_PUBLIC_CAT_YOLO_V2`
**기본값:** `"0"` (OFF)
**읽는 곳:** `staging/lib/behavior/yoloV2Flag.ts` 단일 진입점 (다른 파일은 여기만 import)

### 5.1 분기

| 상태 | 방송폰 | 뷰어폰 |
|------|--------|--------|
| **OFF (기본)** | `<CameraBroadcastYoloMount>` 렌더 skip → worker 생성 0, 추론 0, DB INSERT 0 | 기존 `useBehaviorDetection` 가 DB INSERT 담당 (src/ 무변경, Phase A 경로) |
| **ON** | Mount 렌더 → driver 훅 실행 → DB INSERT 담당 | `useBehaviorDetection` 는 여전히 실행되지만 `onBehaviorChange` 미주입 → DB INSERT 안 함. 프리뷰 오버레이만 |

### 5.2 ON 전환 절차 (Vercel + Supabase)

1. 로컬 `pnpm build` 통과 확인 (CLAUDE.md #5).
2. Vercel env `NEXT_PUBLIC_CAT_YOLO_V2=1` 설정.
3. 빈 커밋 push → 강제 재빌드 (CLAUDE.md #6).
4. `getDeployments` MCP 로 READY + PROMOTED 확인 (CLAUDE.md #4).
5. Supabase MCP 로 `cat_behavior_events` row 수 baseline 측정 (CLAUDE.md #12).
6. 사장님 방송폰 1대부터 테스트 → 24시간 모니터링.
7. row 폭증 징후 없으면 전체 10명 확대.

### 5.3 롤백

- 이전 commit ID 메모 → Vercel Instant Rollback.
- 또는 env 를 `"0"` 으로 되돌리고 빈 커밋 push (60초 내 복구).
- DB 는 변경 없음 (스키마 동일) → 롤백 시 데이터 보존.

---

## 6. Phase A 와의 통합 포인트

### 6.1 logger 재사용 (수정 없음)

Phase B 는 `useBehaviorEventLogger` 를 그대로 사용. driver 훅 내부에서:

```
useBehaviorEventLogger({
  homeId,
  cameraId,
  currentBehavior,                 // driver 의 확정 state
  avgConfidence,                   // 최근 N프레임 평균 (driver 가 계산)
  identifiedCatId,
  supabaseClient,                 // 상위에서 주입 (중복 realtime 소켓 방지)
})
```

로거는 전환 시점 감지 / ended_at UPDATE / metadata 기록 / 큐 flush / 로그아웃 정리를 모두 담당. Phase B 는 **logger 에 한 줄도 손대지 않는다.**

### 6.2 metadata 필드 규칙

| 필드 | 채우는 위치 | 값 |
|------|-------------|-----|
| `model_version` | logger 내부 상수 | `"v1"` (Phase B R1 에서는 유지. R2 에서 `"yolov8n-2026-04-24"` 전환 여부 확정) |
| `top2_class` | yoloPostprocess.parseYoloOutput | 2위 클래스 key (이미 구현됨) |
| `top2_confidence` | yoloPostprocess.parseYoloOutput | 2위 score |
| `bbox_area_ratio` | yoloPostprocess.parseYoloOutput | bbox.w × bbox.h (정규화 면적) |
| `behavior_class` | logger | detection.classKey (12 화이트리스트) |
| `confidence` | logger | avgConfidence ?? detection.confidence |

driver 는 metadata 를 **조립하지 않는다.** detection 을 그대로 logger 에 주입하면 끝.

### 6.3 model_version 결정 논리

- R1 결정: `"v1"` 유지.
- 근거: (a) Phase E archive 분류 SQL 이 `"v1"` 기준으로 이미 설계됨. (b) 모델 파일 자체는 Phase A 와 동일 (`cat_behavior_yolov8n.onnx`). (c) 버전 문자열 교체는 DB 마이그레이션 없이 상수 한 줄 변경으로 가능 → R2 이후 언제든 전환 가능.
- R2 검토: 사장님 승인 후 `"yolov8n-v1.0-20260424"` 같은 명시적 문자열로 교체하되, Phase E SQL 도 동일하게 업데이트.

---

## 7. 테스트 전략 (staging/tests/)

| 테스트 | 유형 | 커버 범위 |
|--------|------|-----------|
| `confirmFrames.test.ts` | 단위 | windowSize=3 / 2 / 1, 전환 패턴 A→A→B→B→B, __none__ 혼입, history empty |
| `maxDurationGuard.test.ts` | 단위 | 29분→false, 30분 1ms→true, null openEvent→false, maxMs 파라미터 오버라이드 |
| `inferenceScheduler.parity.test.ts` | parity | 낮/야간 경계 (21:59 vs 22:00 vs 06:00), motion 연동, 배터리 저전력, 타임존 (KST) — Phase A effective_class TS/SQL parity 와 같은 패턴 |
| `broadcasterYoloDriver.test.ts` | 통합 | mock worker 로 detection 주입 → currentBehavior 확정 → logger 호출 시퀀스 검증. visibility hidden / enabled toggle / maxDuration 트리거 시나리오 |
| `behaviorClasses.invariants.test.ts` | 기존 | 그대로 유지 (12 클래스 불변식) |
| `effectiveClass.parity.test.ts` | 기존 | 그대로 유지 (Phase A) |

**QA 9라운드 체크리스트 대응:**
- R1 동작: worker mock 통합 테스트 green
- R2 설계 일치: 본 문서와 LOC/API 시그니처 일치
- R5 엣지케이스: §4 표의 14개 케이스 전부 테스트 또는 주석 justification
- R6 성능: 5초 tick × 방송 8시간 = 5760회. worker 누수 없음을 Playwright 메모리 프로파일로 확인 (Phase C 로 이월 가능)
- R7 보안: flag OFF 시 코드 실행 0 검증, 뷰어 측 중복 INSERT 없음 검증
- R8 영향 범위: src/ diff 0 lines (staging/ 만 변경)

---

## 8. Phase C/D 확장 포인트

| Phase | 확장 내용 | 본 설계의 연결점 |
|-------|-----------|------------------|
| **C (다이어리 집계)** | Phase A `behaviorPatternAnalyzer`, `weeklyBehaviorAvg` 가 방송폰 데이터 흡수 | 데이터 소스가 뷰어→방송 단일화되므로 집계 로직은 그대로. 단 "중복 제거" 필터 제거 가능 |
| **D (라벨링 UI)** | 오탐 이벤트를 사용자가 수정 | `top2_class` / `bbox_area_ratio` metadata 를 UI 가 활용. Phase B 에서 이미 채움 |
| **E (archive)** | 구버전 데이터 이관 | `model_version="v1"` 기준 archive 분류 SQL 이 Phase B 데이터에도 동일 적용 |
| **F (스냅샷 이미지)** | detection 시점 썸네일 저장 | driver 훅에 `onSnapshotReady` 옵션 훅 포인트 예약 (R2 에서 시그니처 확정). ImageBitmap → WebP blob → Storage upload 경로. |

---

## 9. 리스크 & 미해결 질문 (R2 에서 해결)

1. **방송폰 배터리 실측 데이터 없음** — WebGPU + 5초 tick 이 실제 8시간 운영에서 배터리 몇 % 소모하는지 사장님 실기기 테스트 필요. 결과에 따라 기본 주기 조정.
2. **model_version 문자열 교체 시점** — R1 은 `"v1"` 유지. 사장님 승인 후 전환.
3. **Phase B 단계에서 Phase F snapshot 훅 포인트 예약할지** — 예약만 하고 구현은 Phase F 로 미룰지, 아예 API 에 포함 안 시킬지 R2 결정.
4. **뷰어 측 `useBehaviorDetection` 의 향후 처우** — flag ON 시 "프리뷰 전용" 으로 유지하지만, 가족 4명 × WebGPU 로딩이 뷰어폰에 부담. Phase C 이후 뷰어 측 추론 제거하고 DB 이벤트 Realtime 구독으로 대체 검토.
5. **Worker 재시도 횟수/간격** — R1 은 "3회 연속 실패 시 포기" 로 지정했으나 구체 숫자 R2 에서 재검토.
6. **배터리 API 없는 브라우저** (iOS Safari) — `navigator.getBattery` 미지원 시 scheduler 가 조용히 기본값 사용. 실측 후 iOS 전용 상수 필요할 수도.
7. **`identifiedCatId` 주입 타이밍** — 현재 Phase A logger 는 ref 로 최신값 읽음. driver 는 상위 컴포넌트에서 `useCatIdentifier` 결과를 그대로 전달만. 다묘 가정 환경에서 전환이 잦으면 logger 경합 재검토.

---

**Arch R1 최종 권고:** Q1~Q6 결정은 베타 10명 규모 / Supabase Nano / flag OFF 무손상 3대 제약을 모두 만족. Dev R2 는 본 설계의 5개 신규 staging/ 파일을 생성하되, LOC 한도 (파일 400줄, 컴포넌트 100줄) 를 반드시 지킬 것. QA R3 는 §4 엣지케이스 14개 + §5 flag 전환 절차 6단계를 체크리스트로 활용.
