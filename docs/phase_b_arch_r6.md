# Phase B Arch R6 — 관측성 + 실기기 준비 + 응집도

> 작성: 1번 Arch Agent (R6, 독립 실행, 이전 대화 맥락 없음)
> 작성일: 2026-04-24
> 대상: Phase B R6 Dev (staging 반영) + R6 QA (9관점 독립 검증)
> 기준: `docs/phase_b_qa_r5.md` (PASS 3/9, MINOR 2) + `CLAUDE.md` + 현 staging 전체
> 관계: R1 (온디바이스 파이프라인) → R2 (M-R2-A 분리) → R3 (compose 545→345) → R4 (STABLE_READY_MS) → R5 (§7 가이드 통합) → **R6 (관측성 + 실기기 + 응집도)**

---

## 0. R6 요약

R5 PASS 3/9 진입. 새 REJECT 0, MINOR 2건 (프로세스 1 + 문서 정확도 1). R6 는 산출물 자체에는
손을 최소한 대고, **새로 열린 5축 (F 관측성 · G Phase D 호환 · H 실기기 테스트 · I Realtime · J 응집도)**
에서 설계를 확정한다. R6 Dev TODO 는 14건 (필수 10 + 권고 4). R5 Arch §8 행 #5 의
"lifecycle.ts 임시 console.log 4줄 삽입" 은 **"§7.3 가이드만 + 실기기 테스트 직전 수동 paste"**
로 명시 재작성 (MINOR-R5-NEW-1 해소). 체크리스트 §3.1 line 113-115 "302/304/308" 은
**실측 "304/306/310"** 으로 교체 (MINOR-R5-NEW-2 해소).

**본 R6 발견 (새 5축):**

| 축 | 발견 | 심각도 | §본문 |
|---|------|-------|-------|
| F 관측성 | DriverResult 가 이미 initStatus/retryAttempt/health 노출 — 그러나 UI 표시 경로 0, dev-only 진단 컴포넌트 없음 | MINOR | §3 |
| F 관측성 | tick latency / 추론 latency 미측정 — 사장님이 "렉이 얼마나 심한가" 판단 근거 없음 | MINOR | §3.1 |
| F 관측성 | Supabase health row INSERT 는 **현 단계 반대** — 베타 DB 부하 대비 이득 없음 | MINOR (기각) | §3.3 |
| G Phase D | metadata 4필드 freeze 가능 — driver 는 조립하지 않고 logger 가 detection 에서 읽음 (기존 설계 그대로) | MINOR (안정) | §4.1 |
| G Phase D | `cleared` (고양이 사라짐) 경로는 logger 가 UPDATE ended_at 만 호출 → metadata 덧붙일 row 없음. 의도대로 OK | MINOR (확인) | §4.2 |
| G Phase D | `reclassified:<cls>` 의 12 클래스 whitelist 는 `src/lib/behavior/effectiveClass.ts` 가 이미 가드 (driver 와 독립) | MINOR (안정) | §4.3 |
| H 실기기 | 사장님 실기기 테스트 플랜 문서 없음 → 새 파일 `staging/docs/phase_b_field_test_plan.md` 신설 필요 | **MAJOR** | §5 |
| H 실기기 | Screen Wake Lock API — 방송폰 30분 테스트 시 화면 꺼짐 방지 로직 미설계 | MINOR | §5.4 |
| I Realtime | 뷰어 앱이 `cat_behavior_events` 를 `useRealtimeWithFallback` 으로 구독 중 — driver 가 분당 12 INSERT (5s tick × 최대 12건) 시 채널 부하 낮음 | MINOR (안전) | §6.1 |
| I Realtime | 뷰어 4명 × Realtime subscribe 동시 = Supabase Nano 기본 제한 100 채널 내 여유 | MINOR (안전) | §6.2 |
| J 응집도 | driver 347 LOC + lifecycle 330 + sampling 216 = 893 — compose 경계 OK. `isInferring` 이 driver 소유인데 lifecycle/sampling 에 `setIsInferring` 중복 주입 → R7+ 에서 단일 소유 검토 | MINOR | §7.2 |
| J 응집도 | driver 의 `useCallback` 11개 중 `handleResult` + `onBeforeInfer` + `onHidden` 3개가 lifecycle/sampling prop 으로 전달 — React 19 안정적 deps 로 재마운트 0 확인 | MINOR (안전) | §7.1 |

**R6 판정 권고:** PASS 유지 가능한 수준. 실기기 테스트 플랜 (§5) 만 **필수 신설**,
나머지는 문서/가이드 보강 위주.

---

## 1. MINOR-R5-NEW-1 — 프로세스 정책 ("Dev 판단 보류" 패턴)

### 1.1 R5 에서 일어난 일 (사실관계)

- R5 Arch §8 TODO #5: "lifecycle.ts 에 임시 `console.log` 4줄 추가 (R6 이후 제거)". 분류 **필수**.
- R5 Dev: 체크리스트 §7.3 에 code-block 형태로 정확히 4줄 기록 완료. 단 **lifecycle.ts 실제 코드에는 삽입 보류**. 사유:
  1. vitest fake timer 테스트 오염 (ready/error emit 마다 콘솔 출력).
  2. "R6 이후 제거" 전제가 불안정 (까먹고 prod 에 딸려갈 리스크).
  3. §7.3 code-block 이 self-sufficient — 사장님이 실기기 테스트 직전 1분 paste 가능.
- R5 QA: 품질 측면에서 "Dev 보류 판단이 더 안전" 으로 PASS. 단 프로세스상 Dev 가 Arch 에
  먼저 질문해야 했다는 흠은 인정 → **MINOR-R5-NEW-1** 으로 카운트.

### 1.2 R6 의 결정 — "2단계 가이드 (영구 코드 미삽입)" 패턴으로 명시 재정의

| 항목 | 기존 R5 Arch §8 #5 | R6 재정의 |
|------|--------------------|-----------|
| lifecycle.ts 실제 코드 | 임시 console.log 4줄 삽입 (R6 이후 제거) | **삽입 안 함** |
| 체크리스트 §7.3 | code-block 에 동일 4줄 기록 | **유지** (이미 반영됨) |
| 실기기 테스트 절차 | Arch 가 삽입한 코드로 자동 로깅 | **사장님/Dev 가 실기기 테스트 직전 수동 paste → 테스트 종료 후 git checkout 으로 원복** |
| R6 Dev TODO | (없음) | `§7.3` 문단 상단에 "⚠️ 실기기 테스트 전용 — 커밋 금지" 1줄 주석 추가 |
| R6 QA 검증 | (없음) | lifecycle.ts grep `console.log` = 0건 확인 (주석 제외) |

### 1.3 "Dev 판단 보류" 패턴의 일반 규칙 (R7+ 참조용)

아래 3가지 조건 **전부** 만족 시 Dev 는 Arch 질문 없이 단독 보류 가능 (R6 신설 규칙):

1. **테스트 회귀 증거가 명확** — Dev 가 "이 코드 삽입 시 vitest 테스트 N건이 깨짐"
   같은 구체 증거를 로컬 실행으로 확보.
2. **대체 산출물이 self-sufficient** — 가이드/문서/code-block 만으로 사장님이 필요 시
   수동 적용 가능 (실기기 paste, config 변경 등).
3. **Dev 가 R+1 QA 리포트에 "보류 판단 사유 3줄" 기록** — QA 가 판단 근거를 볼 수 있게.

위 3조건 중 하나라도 부족하면 **반드시** Arch 에 질문 (R5 Arch §8.2 원칙 유지).
R5 Dev 는 3조건 모두 충족 → 사후적으로 OK. 단 **R6 에서 Arch 가 재정의해준다는
명시적 피드백** 은 필요. 본 §1.2 가 그 피드백.

### 1.4 R6 Dev TODO (이 §에서 파생)

| # | 항목 | 분류 | 완료기준 |
|---|------|------|----------|
| **T1** | `staging/docs/phase_b_src_migration_checklist.md` §7.3 code-block 바로 위에 "⚠️ 실기기 테스트 직전 사장님/Dev 수동 paste 후 테스트 종료 시 git checkout 으로 원복. 영구 커밋 금지." 1줄 주석 추가. | 필수 | diff 1줄 + QA grep `"⚠️.*실기기 테스트 직전"` 매치 |
| **T2** | `lifecycle.ts` 에는 console.log 삽입 **금지** 재확인 (현 상태 유지). | 필수 | lifecycle grep `console.log` = 0건 (주석 포함 0 — 기존 `console.error` 는 `handleWorkerError` 에서 전혀 쓰지 않으니 noop) |

---

## 2. MINOR-R5-NEW-2 — 체크리스트 line offset 정정 명세

### 2.1 실측 (R6 Arch grep 직접 확인)

```
staging/hooks/useBroadcasterYoloDriver.ts:
  304:    // eslint-disable-next-line react-hooks/set-state-in-effect
  306:    // eslint-disable-next-line react-hooks/set-state-in-effect
  310:      // eslint-disable-next-line react-hooks/set-state-in-effect

staging/hooks/useYoloWorkerLifecycle.ts:
  263:      // eslint-disable-next-line react-hooks/set-state-in-effect
  265:      // eslint-disable-next-line react-hooks/set-state-in-effect
  268:      // eslint-disable-next-line react-hooks/set-state-in-effect
```

### 2.2 체크리스트 현 기록 vs 실측 대조

| 파일 | 체크리스트 현 표기 (line 113-115) | R6 실측 | 편차 |
|------|----------------------------------|---------|------|
| `useBroadcasterYoloDriver.ts` | 302/304/308 | **304/306/310** | **+2** (line 기준) |
| `useYoloWorkerLifecycle.ts` | 263/265/268 | **263/265/268** | 0 (정확) |

### 2.3 R6 Dev TODO (수정 명세)

| # | 항목 | 분류 | 완료기준 |
|---|------|------|----------|
| **T3** | `staging/docs/phase_b_src_migration_checklist.md` line 114 의 `line 302/304/308 기준` → `line 304/306/310 기준` 으로 정정. | 필수 | diff 1줄 + QA grep `302/304/308` = 0건 + `304/306/310` = 1건 |
| **T4** | 같은 줄의 `기준` 이라는 완충어 제거 (R5 QA "느슨한 표기" 지적) → "line 304/306/310" 으로 확정. | 필수 | 최종 문구: `useBroadcasterYoloDriver.ts` 의 disabled reset effect 3곳 (line 304/306/310) |

### 2.4 재발 방지 규칙 (R7+ 적용)

- **Arch 가 체크리스트에 line 번호 기록 시 반드시 grep 실측 직후 작성.**
- Dev/QA 는 Arch 문서 원문 그대로 copy 하지 말고 **staging 코드 grep 으로 재확인** 후 반영.
- "기준" / "인접 라인" / "대략" 등 완충어 금지 — 숫자는 정확해야 한다.

---

## 3. F 관측성 재설계

### 3.1 내부 메트릭 노출 API — 현 상태 분석

`DriverResult` 는 이미 다음 필드 노출:

```ts
interface DriverResult {
  currentBehavior: BehaviorDetection | null;
  backend: "webgpu" | "webgl" | "wasm" | null;
  isInferring: boolean;
  lastDetections: BehaviorDetection[];
  regime: "day-active" | "night" | "idle-throttled";
  health: {
    ticksTotal: number;
    inferSuccesses: number;
    inferFailures: number;
    lastBackendError: string | null;
  };
  initStatus: "idle" | "loading" | "ready" | "retrying" | "failed";
  retryAttempt: number;
}
```

**부족한 것 (R6 발견):**

| 지표 | 현 상태 | 필요성 | R6 판정 |
|------|---------|--------|---------|
| tick latency (tick 간격 실측 ms) | 미측정 | 중 — 백그라운드 throttle 감지 | **deferred (Phase C)** |
| inference latency (postMessage → result 왕복 ms) | 미측정 | 고 — iOS 실기기 2초 초과 시 regime=night 검토 근거 | **R6 Dev 추가** |
| postMessage 실패 횟수 | `health.inferFailures` 에 통합 | 중 — 원인 구분 불가 (worker crash vs postMessage throw) | **R7+ 확장** |
| Supabase INSERT 성공률 | logger 내부에만 있음 (driver 가 못 봄) | 고 — pool 고갈 감지 | **R7+ 확장** (logger 수정 필요, R6 범위 밖) |

### 3.2 R6 추가 — `inference latency` 측정 (최소 변경)

`useYoloSampling.ts` 또는 `useYoloWorkerLifecycle.ts` 의 postMessage 직전 `performance.now()`
stamp → onmessage 시 delta 계산. 평균은 최근 N회 (N=10) 링버퍼.

**API 확장 (호환 유지):**

```ts
interface DriverHealth {
  ticksTotal: number;
  inferSuccesses: number;
  inferFailures: number;
  lastBackendError: string | null;
  // R6 추가
  inferLatencyP50Ms: number | null;   // 최근 10회 중앙값
  inferLatencyP95Ms: number | null;   // 최근 10회 95 분위
}
```

**구현 제약:**
- 링버퍼는 `healthRef` 와 같은 내부 ref 에 보관.
- 2초 health flush 에 묶어 state 반영 (추가 re-render 없음).
- iOS Safari `performance.now()` 지원 OK — 호환 체크 불필요.

**왜 P50/P95 둘 다인가:** P50 만 보면 outlier (가끔 2초 넘는 프레임) 을 놓침.
P95 는 "꼬리" 를 감지 — Phase C/D 에서 iOS 실기기 튜닝 근거.

### 3.3 dev-only 진단 UI — 신설 컴포넌트

**새 파일:** `staging/components/YoloDriverDiagBadge.tsx` (~60 LOC)

```
목적: 방송폰 화면 우상단에 30×30px 배지. dev 환경 (`process.env.NODE_ENV === 'development'`) 에서만 렌더.
Props: { driver: DriverResult }
표시:
  · 색상: initStatus="ready" → 녹색, "loading/retrying" → 노랑, "failed" → 빨강
  · 숫자: health.ticksTotal (0-9999)
  · hover: 툴팁으로 backend / regime / inferLatencyP50Ms / retryAttempt 표시
prod 빌드:
  · `if (process.env.NODE_ENV !== 'development') return null;` — tree shake 되지 않아도 0 렌더.
  · webpack/Turbopack 은 `NODE_ENV` 를 빌드타임 치환 → dead code elimination 가능.
```

**Mount 위치:** `CameraBroadcastYoloMount` 에서 조건부 렌더.

```tsx
{process.env.NODE_ENV === 'development' && (
  <YoloDriverDiagBadge driver={driver} />
)}
```

**의도:** 사장님이 dev preview 로 방송폰 띄울 때 1초 안에 "돌고 있는가" 확인.
프로덕션 베타 사용자 6명 (사장님 제외) 에게는 안 보임.

### 3.4 Supabase health row INSERT — **R6 기각**

**검토:** 매 tick (또는 N tick) 마다 `driver_health` 테이블 INSERT 로 health 영속화.

**기각 사유:**
1. **DB 부하 증가** — 베타 7명 × 5s tick × 24h = 120,960 row/일. `cat_behavior_events` 대비
   120배. Supabase Nano pool 15 한계에 맞지 않음 (CLAUDE.md #7).
2. **현재 필요성 낮음** — 베타 단계는 사장님 dev 배지 (§3.3) + Vercel MCP + Supabase MCP 로
   충분히 관찰 가능.
3. **프로덕션 전환 시 재검토** — 100명 이상 운영 모드에서는 Supabase Edge Function +
   샘플링 (1/100 rows) + 전용 테이블 설계. R6 범위 밖.

**R6 결정:** Supabase health row INSERT **도입 안 함**. CLAUDE.md 운영 정책 (§🟣 전환
가이드) 의 "프로덕션 100+" 도달 후 재검토 항목으로 체크리스트 §8 (신설) 에 기록.

### 3.5 R6 Dev TODO (F 축)

| # | 항목 | 분류 | 완료기준 |
|---|------|------|----------|
| **T5** | `DriverHealth` 에 `inferLatencyP50Ms` / `inferLatencyP95Ms` 필드 추가. `useYoloWorkerLifecycle.ts` 의 handleWorkerMessage 에 `performance.now()` delta 링버퍼 (N=10) 구현. 2초 flush 에 묶어 state 반영. | 필수 | tsc green + health.inferLatencyP50Ms 타입 노출 + 테스트 1건 신규 (mock worker 가 postMessage 시뮬 → 링버퍼 확인) |
| **T6** | `staging/components/YoloDriverDiagBadge.tsx` 신설 (~60 LOC). dev-only 가드 + props DriverResult + 색상/숫자/툴팁. | 필수 | 파일 생성 + LOC ≤70 + tsc green + 한국어 주석 |
| **T7** | `CameraBroadcastYoloMount.tsx` 에 `{NODE_ENV==='development' && <YoloDriverDiagBadge />}` 조건부 렌더 1줄 추가. Mount LOC 83 → 85 이내 유지. | 필수 | Mount diff + LOC ≤100 |
| **T8** | `staging/docs/phase_b_src_migration_checklist.md` §8 (신설 섹션) — "프로덕션 100+ 전환 시 driver_health 테이블 + Edge Function 샘플링 설계 검토". | 권고 | §8 신설 (<20 LOC) |

---

## 4. G Phase D 호환성

### 4.1 metadata 스키마 freeze 결정

**현 상태 (staging/src 공통):** `cat_behavior_events.metadata` (JSONB) 에 logger 가 INSERT 시 기록하는 4 필드:

| 필드 | 타입 | 소스 | 언제 채워지는가 |
|------|------|-------|----------------|
| `model_version` | string | 상수 `BEHAVIOR_MODEL_VERSION = "v1"` | **항상** |
| `top2_class` | string? | `detection.top2Class` (yoloPostprocess 출력) | detection 존재 시만 (confirmed 전환) |
| `top2_confidence` | number? | `detection.top2Confidence` | 상동 |
| `bbox_area_ratio` | number? | `detection.bboxAreaRatio` (bbox.w × bbox.h 정규화) | 상동 |

### 4.2 NONE/cleared 경로의 metadata 처리 (R6 확인)

logger 의 핵심 분기:

```
전환 감지:
  case A (null → detection)     → INSERT (metadata 4필드 전부)
  case B (detection → null)     → UPDATE ended_at (metadata 건드리지 않음)
  case C (detection → 다른 detection) → UPDATE 이전 ended_at + INSERT 새 row (metadata 새로 기록)
  case D (같은 detection 유지)   → UPDATE ended_at (metadata 건드리지 않음)
```

**driver 가 NONE_KEY → `cleared` 확정 시:**
- driver: `setCurrentBehavior(null)`
- logger: 위 case B → **UPDATE 만, metadata 미수정** (정확)
- Phase D UI: `cleared` 이벤트를 표시하지 않음 (null row 자체가 없음 — `ended_at` 만 채워진
  기존 row) — OK.

**"NONE row 를 만들자" 논의 (R4 MINOR-R4-f):** 현재 Phase C/D 요구 없음 → **R6 도 유지**.
Phase C Arch 착수 시 합의 필요.

### 4.3 12 클래스 ↔ `reclassified:<cls>` 화이트리스트 검증

**`src/lib/behavior/effectiveClass.ts` 가드:**

```
line 10: "reclassified:<cls>" → cls (12 클래스 화이트리스트일 때만)
line 12: 잘못된 값(reclassified:비12클래스 등)은 null 로 폴백 → 안전 기본값.
```

**R6 확인 — driver 가 인식하는 클래스:**
- driver 는 `detection.classKey` 를 logger 에 넘김.
- logger 가 DB `behavior_class` 컬럼에 저장 — Phase A CHECK 제약으로 12 클래스 강제.
- Phase D UI 가 `user_label` 에 `reclassified:<cls>` 기록 시 동일 12 클래스 whitelist 적용.
- **driver 와 effectiveClass 는 독립적으로 같은 whitelist 를 사용** → 동기화 깨질 위험 0
  (양쪽 다 `src/lib/ai/behaviorClasses.ts` 의 BEHAVIOR_CLASS_KEYS 참조).

**R6 판정:** **freeze OK**. driver 는 metadata 조립하지 않음 (logger 가 detection 에서 읽음).
Phase D 는 이 4 필드 + behavior_class + user_label 조합으로 충분.

### 4.4 R6 Dev TODO (G 축)

| # | 항목 | 분류 | 완료기준 |
|---|------|------|----------|
| **T9** | `staging/docs/phase_b_src_migration_checklist.md` §7.1 표 하단에 "R6 freeze 선언: metadata 4 필드는 Phase D 착수 시점까지 스키마 고정. 변경 시 Phase D Arch 와 합의 필수." 1문장 추가. | 필수 | 1줄 diff |
| **T10** | 같은 §7.1 에 "cleared 경로는 logger UPDATE ended_at 만 호출 — metadata 건드리지 않음 (case B 유지)" 1줄 명시. | 권고 | 1줄 diff |

---

## 5. H 실기기 테스트 플랜 — 신규 문서

### 5.1 새 파일 `staging/docs/phase_b_field_test_plan.md`

**분류: MAJOR (신설 필수)** — 현재 사장님이 실기기 테스트 시 따라갈 가이드가 분산되어
있음 (§7.3 / §7.4 / §7.5 체크리스트 + CLAUDE.md #4/#5/#6 교훈). 한 파일에 **체크박스 10개 +
기기 분포 + 실패 시 로그 수집 절차** 형태로 통합.

### 5.2 체크박스 리스트 (사장님 실행 순서)

```
# Phase B 실기기 테스트 플랜

> 사장님 전용 — 방송폰 3대 + 가족 4명 뷰어 조건에서 따라갈 순서.
> 소요: 약 45분 (준비 5 + 방송 30 + 검증 10).

## 준비 (5분)
- [ ] 1. Vercel env `NEXT_PUBLIC_CAT_YOLO_V2=1` 설정 완료 확인 (env 탭).
- [ ] 2. 빈 커밋 푸시 → `getDeployments` MCP 로 READY + PROMOTED 확인.
- [ ] 3. `curl -I https://<vercel-url>/models/cat_behavior_yolov8n.onnx` → HTTP 200 확인.
- [ ] 4. Supabase MCP: `SELECT count(*) FROM cat_behavior_events;` 실행 → baseline 기록.
- [ ] 5. Vercel Instant Rollback 대상 commit ID 메모.

## 방송폰 A (Android, 주방송폰)
- [ ] 6. 방송 시작 → dev 배지 녹색 확인 (5초 내).
- [ ] 7. 배지 hover → backend 값 확인 (webgpu / webgl / wasm 중).
- [ ] 8. 30분 연속 방송 유지 (화면 ON 상태).

## 방송폰 B (iOS iPhone, 보조)
- [ ] 9. 방송 시작 → 배지 녹색 확인. iOS backend 는 webgl 또는 wasm 수렴 확인.
- [ ] 10. PWA 모드 (홈 화면 추가) 로 동일 테스트 30분.

## 뷰어 (가족 4명, 각자 기기)
- [ ] 11. 다이어리 페이지에서 "실시간 업데이트" 수신 확인 — 방송폰이 confirmed 감지
         → 5~10초 내 뷰어 UI 에 row 추가되는지 확인 (Realtime).
- [ ] 12. 가족 4명 동시 접속 시 DB pool 사용률 60% 이하 유지 (Supabase Dashboard).

## 검증 (10분 후)
- [ ] 13. 방송폰 A 배지: `health.ticksTotal > 300` (30분 × 12 tick = 360 기대치).
- [ ] 14. `health.inferSuccesses / ticksTotal > 0.8` (배지 hover).
- [ ] 15. `retryAttempt == 0` 유지 (crash 0회).
- [ ] 16. Supabase MCP: `SELECT count(*) - <baseline>` = 방송폰 A + B 가 삽입한 row 수 일치.
- [ ] 17. 뷰어 4명 측 DB INSERT 가 0건 확인: `SELECT camera_id, count(*) FROM cat_behavior_events
         WHERE detected_at >= now() - interval '30 minutes' GROUP BY camera_id;`
         → camera_id 가 방송폰 A/B 의 device_id 2개만 나와야 함.

## 실패 시 로그 수집
- [ ] 18. Vercel MCP `getDeploymentEvents` → 최근 30분 에러 로그.
- [ ] 19. Supabase MCP `SELECT * FROM postgres_logs ORDER BY created_at DESC LIMIT 50;`
- [ ] 20. 사장님 방송폰 Chrome DevTools (usb 연결) → Console 탭 스크린샷.
```

### 5.3 기기별 분포 + WebGPU 가능 / 불가능 표

| 기기 | OS 버전 | WebGPU | WebGL | WASM SIMD | 예상 regime |
|------|---------|--------|-------|-----------|-------------|
| Samsung Galaxy S23 (방송폰 A) | Android 14 | OK (Chrome 113+) | OK | OK | day-active 5s tick |
| iPhone 13/14 (방송폰 B) | iOS 17 | 불가 | OK | OK (SIMD 16.4+) | day-active 5s tick, backend=webgl 예상 |
| iPhone SE (뷰어) | iOS 16 | 불가 | OK | 제한적 | 뷰어 전용 — 추론 안 함 |
| iPad (뷰어) | iOS 17 | preview | OK | OK | 뷰어 전용 |

### 5.4 Screen Wake Lock 필요성

**발견:** 방송폰 30분 테스트 시 OS 기본 화면 꺼짐 (Android: 1-5분, iOS: 1분-never).
화면 꺼지면 WebRTC 방송 + YOLO driver 둘 다 throttle / 중지.

**R6 결정:** Screen Wake Lock API 도입 — **단 staging 단계에서는 문서화만, 코드는 src/ 반영 시점**.

**사유:**
- `navigator.wakeLock.request("screen")` 은 방송폰 생활 경험에 큰 영향. src/ CameraBroadcastClient 에서 방송 시작 시 함께 호출하는 것이 자연스럽다 (Phase B staging/ 범위 밖).
- 사장님 테스트 시점에는 **수동으로 방송폰 화면 설정 → 꺼짐 없음 (개발자 옵션)** 으로 회피.

**체크리스트 §7.5 에 이미 기록됨** — R6 추가 없음.

### 5.5 30분 연속 검증 (메모리 증가 / tick 정확도)

| 지표 | 기대값 | 실패 시 조치 |
|------|--------|-------------|
| `retryAttempt` | 0 | crash 발생 — STABLE_READY_MS 60s → 90s 상향 검토 (§7.3) |
| `ticksTotal` | 360 ± 10% | tick 느림 — regime 확인, motion API 동작 확인 |
| `inferSuccesses / ticksTotal` | > 0.85 | iOS inference 시간 측정 → regime=night 고정 검토 |
| `inferLatencyP95Ms` (R6 신규) | < 1000ms | 1초 초과 — backend fallback 강제 wasm |
| 방송폰 메모리 (DevTools) | 증가율 < 10MB/30분 | bitmap close 누락 — useYoloSampling `finally` 블록 재확인 |

### 5.6 R6 Dev TODO (H 축)

| # | 항목 | 분류 | 완료기준 |
|---|------|------|----------|
| **T11** | `staging/docs/phase_b_field_test_plan.md` 신설 (~150 LOC). §5.2 체크박스 20개 + §5.3 기기 표 + §5.5 30분 지표 표. 한국어 주석 + 사장님 관점 서술. | **필수 (MAJOR)** | 파일 생성 + LOC ≤180 + 체크박스 20개 이상 + QA grep 검증 |
| **T12** | `staging/docs/phase_b_src_migration_checklist.md` 맨 위에 "실기기 테스트는 `phase_b_field_test_plan.md` 를 따를 것" 1줄 링크 추가. | 권고 | 1줄 diff |

---

## 6. I Realtime subscription 영향

### 6.1 INSERT 주기 vs Realtime 채널 방송

**현 경로 (src/):**
- logger 가 `cat_behavior_events` 에 INSERT.
- `src/features/diary/lib/useRealtimeWithFallback.ts` 가 `.channel(channelName).on("postgres_changes", ...).subscribe(...)` 로 구독.
- `src/features/diary/components/DiaryPageClient.tsx` (line 283) 가 `table: "cat_behavior_events"` 로 설정.

**driver INSERT 빈도 추정:**
- 5s tick × confirmed 전환 비율 (실측 추정 10~20%) = 평균 1분에 1-2회 INSERT.
- 최악의 경우 (고양이가 자주 이동) 5s 마다 confirmed 전환 → 분당 12 INSERT.
- **뷰어 구독 채널 부하:** Supabase Realtime 은 행 단위 WS 프레임 1개 / INSERT → 분당 12 프레임 × 뷰어 4명 = 48 프레임/분. 베타 범위 무시 가능.

### 6.2 뷰어 부하 (Realtime 채널 수 한도)

- Supabase Nano 기본 Realtime 채널 한도: 100 concurrent channels / project.
- 뷰어 4명 × 1 channel (다이어리 페이지) = 4 channel.
- 방송폰 측 추가 subscribe 없음 (driver 는 INSERT 만, SELECT 구독 0).
- **여유도 96/100 — 베타 10명 확장 시에도 여유.**

### 6.3 R6 판정

**새 설계 필요 없음.** 체크리스트 §7.5 에 "Realtime 채널 수 모니터링" 1항목 추가 권고.

### 6.4 R6 Dev TODO (I 축)

| # | 항목 | 분류 | 완료기준 |
|---|------|------|----------|
| **T13** | `staging/docs/phase_b_src_migration_checklist.md` §7.5 모니터링 체크리스트에 "- [ ] Supabase Dashboard → Realtime 채널 수 < 50 유지 (뷰어 동시접속 × 1ch, 100 한도의 50%)" 1줄 추가. | 권고 | 1줄 diff |

---

## 7. J 코드 응집도 재점검

### 7.1 compose 재생성 / 재마운트 위험

**driver 의 useCallback 11개:**
- `clearAvgConfidence` (deps: []) — 안정
- `bumpTick / bumpSuccess / bumpFailure` (deps: []) — 안정
- `handleResult` (deps: [clearAvgConfidence]) — 안정 (1 deps)
- `onBeforeInfer` (deps: [clearAvgConfidence]) — 안정
- `onHidden` (deps: [clearAvgConfidence]) — 안정

**lifecycle / sampling 훅이 prop 으로 받는 콜백:**
- `lifecycle.onDetections = handleResult` — `handleResult` 가 재생성되면 lifecycle effect 재실행 위험.
- `sampling.onBeforeInfer / onHidden / onTick / onPostMessageError` — 동일.

**현 검증:** `handleResult` deps 는 `[clearAvgConfidence]` 하나뿐 + `clearAvgConfidence` deps 가 `[]` → `handleResult` 는 컴포넌트 lifetime 동안 1회 생성 → lifecycle effect 재실행 0.

**React 19 호환:** `useCallback` 의존성 안정성은 기존 baseline 대비 변화 없음 — renderHook 테스트 case 2/3 (OFF→ON 반복) 에서 재마운트 징후 없음 실측 증명.

### 7.2 `isInferring` 소유권

**현 상태 (R6 발견):** `isInferring` state 는 **driver 에서 `useState` 선언** 하지만
`setIsInferring` 을 **lifecycle 과 sampling 둘 다에 prop 으로 전달**하여 쓰기.

```ts
// driver:
const [isInferring, setIsInferring] = useState(false);

// lifecycle 에 setIsInferring 주입 (handleWorkerMessage 내부에서 false 로 세팅)
// sampling 에 setIsInferring 주입 (postMessage 직전 true 로 세팅)
```

**문제:**
- 쓰기 주체가 3곳 (driver 의 disabled reset + lifecycle 의 result 수신 시 false + sampling 의 tick 시 true).
- 동시 세팅 race 는 React 18+ batching 으로 안전하지만, **코드 리뷰어 관점에서 "누가 쓰는가" 추적 어려움**.

**R6 판정:** **MINOR (deferred)** — 동작 회귀 없고, R7+ 에서 lifecycle 또는 sampling 중 한 곳으로 단일 소유 이관 검토.

**옵션 분석 (R7+ 참조용):**
- 옵션 A: sampling 이 `isInferring` 소유 (tick 시점이 진입점). lifecycle 은 onResult 콜백으로 완료 알림.
- 옵션 B: driver 가 소유 유지, lifecycle/sampling 은 ref (`isInferringRef`) 로 읽기만, 쓰기는 driver 의 callback 1곳.

R7 Arch 가 옵션 선택 + R7 Dev 반영. **R6 는 변경 없음.**

### 7.3 LOC / 한도 재확인

| 파일 | 현 LOC | R6 예상 delta | R6 예상 LOC | 한도 | 여유 |
|------|--------|---------------|-------------|------|------|
| `useBroadcasterYoloDriver.ts` | 347 | 0 (T5 는 lifecycle 에) | 347 | 400 | 53 |
| `useYoloWorkerLifecycle.ts` | 330 | +20 (T5 링버퍼 + P50/P95) | 350 | 400 | 50 |
| `useYoloSampling.ts` | 216 | 0 | 216 | 400 | 184 |
| `CameraBroadcastYoloMount.tsx` | 83 | +2 (T7 조건부 렌더) | 85 | 100 | 15 |
| `YoloDriverDiagBadge.tsx` | 신규 | +60~70 | 60~70 | 100 | 30~40 |
| `phase_b_field_test_plan.md` | 신규 | +150~180 | 150~180 | (docs 무한) | — |

**응집도 전반: 합격선 내.** 컴포넌트 한도 100 / 파일 한도 400 / useState 8 / useEffect 7 / props 12 모두 위반 없음.

### 7.4 R6 Dev TODO (J 축)

| # | 항목 | 분류 | 완료기준 |
|---|------|------|----------|
| **T14** | `useBroadcasterYoloDriver.ts` header 주석에 "R7+ 이관 항목: `isInferring` 단일 소유 (옵션 A sampling / 옵션 B driver callback) — 현재 3곳 쓰기 유지" 1줄 추가. | 권고 | 1줄 diff |

---

## 8. R6 Dev TODO 리스트 (종합) + 완료기준

| # | 출처 | 항목 | 분류 | 완료기준 |
|---|------|------|------|----------|
| T1 | §1.4 | 체크리스트 §7.3 code-block 위 "⚠️ 실기기 테스트 전용" 1줄 주석 | 필수 | diff + grep 검증 |
| T2 | §1.4 | lifecycle.ts 에 console.log 삽입 **금지** 재확인 | 필수 | grep `console.log` = 0 |
| T3 | §2.3 | 체크리스트 line 114 "302/304/308" → "304/306/310" | 필수 | grep diff |
| T4 | §2.3 | 같은 줄의 "기준" 완충어 제거 | 필수 | 문구 확정 |
| T5 | §3.5 | `DriverHealth` 에 `inferLatencyP50Ms`/`P95Ms` + 링버퍼 구현 | 필수 | tsc green + 신규 테스트 1건 |
| T6 | §3.5 | `staging/components/YoloDriverDiagBadge.tsx` 신설 | 필수 | LOC ≤70 + tsc green |
| T7 | §3.5 | `CameraBroadcastYoloMount.tsx` 조건부 렌더 | 필수 | Mount LOC ≤100 |
| T8 | §3.5 | 체크리스트 §8 (신설) — 프로덕션 100+ 시 driver_health 설계 | 권고 | §8 신설 <20 LOC |
| T9 | §4.4 | 체크리스트 §7.1 에 "metadata freeze 선언" 1문장 | 필수 | 1줄 diff |
| T10 | §4.4 | §7.1 에 "cleared 경로 = logger UPDATE only" 1줄 | 권고 | 1줄 diff |
| T11 | §5.6 | `staging/docs/phase_b_field_test_plan.md` 신설 | **필수 (MAJOR)** | LOC ≤180 + 체크박스 20개 |
| T12 | §5.6 | 체크리스트 상단에 field test plan 링크 | 권고 | 1줄 diff |
| T13 | §6.4 | 체크리스트 §7.5 에 Realtime 채널 수 모니터링 1줄 | 권고 | 1줄 diff |
| T14 | §7.4 | driver header 주석 "R7+ 이관: isInferring 단일 소유" | 권고 | 1줄 diff |

**필수 10건 + 권고 4건 = 총 14건.**

### 8.1 금지 사항 (재확인)

- **파일 삭제 금지** (CLAUDE.md). 문서 분할도 기존 파일 보존.
- **src/ 수정 금지** (Phase B 는 #13 원칙 대상, #14 예외 아님).
- **console.log 를 영구 커밋 금지** (§1.2 재정의).
- **lifecycle.ts / driver.ts LOC 한도 400 초과 금지** — T5 후 예상 350 (lifecycle) / 347 (driver) 유지.

### 8.2 Dev 가 Arch 에 질문해야 하는 경우 (R6 재확인)

§1.3 에서 정의한 "Dev 판단 보류 3조건" 중 하나라도 부족하면 **반드시 Arch 질문**.
특히 다음 3가지는 **자동 질문 대상**:

1. T5 의 `performance.now()` 지원 안 되는 브라우저 발견 시.
2. T6 의 배지 렌더링이 방송폰 UI 레이아웃 깨뜨릴 때.
3. T11 의 체크박스 개수가 20 초과/미만일 때 (15~25 허용 범위).

---

## 9. R7 에 남길 질문

1. **`isInferring` 단일 소유 이관** — 옵션 A (sampling) vs 옵션 B (driver callback). R7 Arch 가 결정 + R7 Dev 반영.
2. **Supabase INSERT 실패율 driver 노출** — logger 수정 필요 (src/ 영역). #14 예외 적용 여부 검토.
3. **driver_health 테이블 설계** (프로덕션 100+ 전환 시) — R6 §3.4 기각 근거 유지 중. R7+ 에서 ETA 평가.
4. **WebGPU 컨텍스트 lost 재현 테스트** — R1 §4 엣지 #12. staging 단계 mock 불가 → Playwright 통합 테스트 (Phase C 이월 후보).
5. **STABLE_READY_MS 실측 조정** — 사장님 실기기 테스트 후 30/60/90/120 중 결정. §7.3 가이드대로 진행.
6. **Phase C 착수 시점** — 9연속 PASS 달성 후. R6 PASS (4/9) 통과 가정 시 R12 에서 시점 재검토.
7. **ONNX 옵션 A/B 결정** (CRITICAL-R5-C) — 사장님 의사결정 대기. R6 범위 밖 유지.
8. **Screen Wake Lock API 도입 PR** — src/ 반영 단계 별도 PR. Phase B 최종 승인 후 팀장 판단.
9. **inference latency P95 임계값** — 1000ms 기각선 (§5.5 표) 의 현실 적합성 — 사장님 iPhone 실측 후 조정.
10. **뷰어 측 `useBehaviorDetection` 처우** — flag ON 시 프리뷰 전용. 가족 4명 × WebGPU 로딩 부담 측정 후 Phase C/D 에서 "뷰어 추론 제거 + Realtime 구독 대체" 검토 (R1 §9 미해결 #4 재확인).

---

**R6 Arch 최종 권고:** R5 MINOR 2건을 T1~T4 로 명시 해소. F/G/I/J 축에서 발견된 6건은
MINOR 로 최소 변경 (T5~T10, T13, T14). **H 축의 `phase_b_field_test_plan.md` 신설 (T11) 만
MAJOR** — 사장님 실기기 30분 테스트 준비의 핵심 산출물. R6 Dev 는 14 TODO 전부 이행,
R6 QA 는 9관점 독립 검증 + renderHook 5 case case 4 깊이 강화 (R5 남긴 힌트 #4) 검토.
9연속 PASS 카운트 4/9 진입 목표.
