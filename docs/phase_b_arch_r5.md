# Phase B Arch R5 — MINOR 반영 + 깊이 재검토 (A~E 5축)

> 작성: 1번 Arch Agent (R5, 독립 실행, 이전 대화 맥락 없음)
> 작성일: 2026-04-24
> 선행 문서: `docs/phase_b_arch_r1.md` · `r2.md` · `r3.md` · `r4.md` · `docs/phase_b_qa_r4.md`
> 상태: R4 QA **PASS (조건부 — 실측 차단 상태, 9연속 PASS 2/9 진입)**.
>   - 신규 MINOR 1건 보유: `MINOR-R5-NEW-1` (체크리스트 문구 실측 정정)
>   - 권고 4건 보유: 60s 경계 ±1ms / OFF→ON transient / STABLE_READY_MS 실기기 / driver header 주석
> 본 R5 는 (a) MINOR + 권고 해소 설계 + (b) **새 관점 5축 (Phase C 호환 / iOS / 장시간 / 네트워크 / src PR 함정)** 재검토.
> 원칙: R1 §1 파일 구조 · R2 §1–§3 · R3 §1–§3 · R4 §1–§9 **그대로 유지**. 파일 삭제 금지 (CLAUDE.md). src/ 0 diff 유지.

---

## 0. R5 요약

| 구분 | 개수 | 비고 |
|------|------|------|
| **MINOR-R5-NEW-1 대응** (체크리스트 §3.1 문구 정정) | 1건 해소 | 실측: Phase A disable = **2건** + 주석 = **1건** = 총 **3건**. Phase B = **6건**. |
| **권고 1 (60s ±1ms 경계 테스트)** | 해소 — 2 케이스 신규 설계 (59_999ms / 60_001ms) | lifecycle 테스트 +26 LOC 예상. fake timer 정확도 확인. |
| **권고 2 (OFF→ON transient flush 테스트)** | 해소 — driver 훅 `renderHook` 신규 테스트 파일 **또는** 기존 `broadcasterYoloDriver.test.ts` 확장 선택지 제시. |
| **권고 3 (STABLE_READY_MS 60s 합리성)** | **실기기 검증 가이드 설계** — 30/60/90/120s 후보 판단 기준 + 로그 수집 절차. R6 이후 조정. |
| **권고 4 (driver header 주석 545→345 정정)** | 해소 — 단순 문구 교체. |
| **A. Phase C 호환성 (깊이)** | **CRITICAL 0 · MAJOR 1 · MINOR 2** — MAJOR-R5-A: `behaviorEventsToDiaryStats` 가 metadata 컬럼 **미참조** → driver 가 저장하는 top2/bbox_area_ratio/model_version 이 Phase C 집계에 **전혀 쓰이지 않음**. 설계 의도 차이 (archive 전용) 문서화 필요. |
| **B. iOS Safari (깊이)** | **CRITICAL 0 · MAJOR 0 · MINOR 3** — backend fallback (webgpu→webgl→wasm) 이미 방어됨. getBattery typeof 체크 OK. 단 onnxruntime-web WASM SIMD/threaded 제약 + PWA visibilitychange 차이 + first-paint 지연 확인 필요. |
| **C. 장시간 방송 (깊이)** | **CRITICAL 0 · MAJOR 1 · MINOR 2** — MAJOR-R5-B: 브라우저 탭 inactive throttle 로 setInterval 이 60s+ 로 느려지면 driver health flush + retry backoff 타이밍 전부 틀어짐. 단 사용자가 방송 중이면 탭이 active 유지되는 게 정상 → MAJOR 판정이되 베타 범위 밖. |
| **D. 네트워크 단절 (깊이)** | **CRITICAL 0 · MAJOR 0 · MINOR 3** — 이미 Phase A logger 가 localStorage 큐 + 100건 cap + SIGNED_OUT 제거로 대부분 방어. 새 우려는 "flush 폭증 시 Supabase pool 부담" 과 "WebRTC 끊김 시 driver 계속 돌기". |
| **E. src/ 반영 PR 함정 (깊이)** | **CRITICAL 1 · MAJOR 2 · MINOR 2** — **CRITICAL-R5-C: `.gitignore` 가 `public/models/*.onnx` 를 제외 → Vercel 배포에 ONNX 모델 파일이 포함 안 됨. flag ON 시 404 → Worker init 실패 → retry 지옥**. Worker URL 경로 재작성 / Vercel env 적용 타이밍 / 빈 커밋 push 교훈 재확인. |
| **R5 신규 발견 합계** | **CRITICAL 1 · MAJOR 2 · MINOR 10 + 체크리스트 정정 1 + 권고 4 해소** | |
| **방향** | CRITICAL-R5-C 는 src/ 이관 PR 전 필수 해소. MAJOR-R5-A/B 는 체크리스트 누적. MINOR 는 문서화만. R5 Dev 는 권고 4건 + MINOR-R5-NEW-1 + CRITICAL-R5-C 대응 (체크리스트 §7 신설) 소화. |

---

## 1. MINOR-R5-NEW-1 대응 — 체크리스트 문구 실측 정정

### 1.1 R4 QA 가 지적한 부정확 표현

`staging/docs/phase_b_src_migration_checklist.md` §3.1 line 71:

> Phase A 5곳 + Phase B 2곳 (`useBroadcasterYoloDriver.ts`, `useYoloWorkerLifecycle.ts`) 의
> `eslint-disable-next-line` 주석 일괄 제거.

### 1.2 R5 실측 (Grep 결과)

| 카테고리 | 파일 | 라인 | 분류 |
|---------|------|------|------|
| **Phase A src/ disable (실제 `eslint-disable-next-line react-hooks/set-state-in-effect`)** | `src/components/catvisor/RecentCatActivityLog.tsx` | 223 | 활성 disable |
| Phase A src/ disable | `src/features/diary/components/DiaryPageClient.tsx` | 245 | 활성 disable (line 243 주석은 "microtask 에서 실행되므로 false positive" 설명) |
| **Phase A src/ 주석만 (실제 disable 없음)** | `src/hooks/useLandscapeLock.ts` | 35 | SSR-safe lazy init 으로 회피 — disable 필요 없음 |
| **Phase B staging disable** (R5 문서 기준) | `staging/hooks/useBroadcasterYoloDriver.ts` | 302, 304, 308 | 3건 (disabled reset effect) |
| Phase B staging disable | `staging/hooks/useYoloWorkerLifecycle.ts` | 263, 265, 268 | 3건 (`!enabled` 분기 공용 state 리셋) |

**정확 수치:**
- Phase A 활성 disable: **2건** (파일 2개, 각 1곳)
- Phase A 주석 언급만 (disable 없음): **1건** (`useLandscapeLock.ts` — lazy init 으로 해결)
- Phase B 활성 disable: **6건** (파일 2개, 각 3곳)
- **src/ 반영 PR 일괄 제거 대상 = 2 (Phase A) + 6 (Phase B) = 8건**.

### 1.3 체크리스트 §3.1 line 70-72 수정 명세

**기존:**
```
- [ ] 루트 `.eslintrc` 에 `"react-hooks/set-state-in-effect": "warn"` (또는 `"off"`) 추가.
- [ ] Phase A 5곳 + Phase B 2곳 (`useBroadcasterYoloDriver.ts`, `useYoloWorkerLifecycle.ts`) 의
      `eslint-disable-next-line` 주석 일괄 제거.
- [ ] 규칙 off 시 대체 안전 장치: production 빌드에서만 `StrictMode` 이중 렌더 감시로 무한 루프 감지.
```

**교체 후 (R5 Dev 가 정확히 복사):**
```
- [ ] 루트 `.eslintrc` 에 `"react-hooks/set-state-in-effect": "warn"` (또는 `"off"`) 추가.
- [ ] `eslint-disable-next-line react-hooks/set-state-in-effect` 주석 일괄 제거 (총 8건):
      - Phase A 활성 disable (2건):
        · `src/components/catvisor/RecentCatActivityLog.tsx` line 223
        · `src/features/diary/components/DiaryPageClient.tsx` line 245
      - Phase B 활성 disable (6건, staging → src 이관 후 경로 조정):
        · `useBroadcasterYoloDriver.ts` 의 disabled reset effect 3곳 (line 302/304/308 기준)
        · `useYoloWorkerLifecycle.ts` 의 `!enabled` 분기 3곳 (line 263/265/268 기준)
      - Phase A 주석만 (disable 없음, 그대로 유지):
        · `src/hooks/useLandscapeLock.ts` line 35 — lazy init 회피 주석
- [ ] 규칙 off 시 대체 안전 장치: production 빌드에서만 `StrictMode` 이중 렌더 감시로 무한 루프 감지.
```

### 1.4 Arch R4 §1.4 line 70 동일 표현 정정

`docs/phase_b_arch_r4.md` 는 이미 발행된 설계서라 **수정 금지 (CLAUDE.md 원칙)**. 대신 본 R5 §1.2 의 실측 수치가 후속 라운드의 기준. R6 QA 가 혼동 시 본 문서 §1.2 를 참조.

---

## 2. 권고 1~4 대응

### 2.1 권고 1 — 60s 경계 ±1ms 테스트 추가 설계

**현 테스트 커버리지 (staging/tests/yoloWorkerLifecycle.test.ts):**
- `ready 후 1초 내 재 crash → retryAttempt 누적` (line 221-265) — 1_000ms advance.
- `ready 후 60초 유지 → retryAttempt 0 리셋` (line 268-300) — 60_000ms 정확 advance.

**R4 QA 지적 (R4 QA §6.2):**
- 59_999ms (리셋 안 됨) / 60_001ms (리셋 됨) 경계 미커버. fake timer 가 정확히 `>= STABLE_READY_MS` 에서 발사되므로 회귀 위험 낮지만 regression guard 로 가치 있음.

**R5 신규 테스트 명세 (R5 Dev 필수 구현):**

**위치:** `staging/tests/yoloWorkerLifecycle.test.ts` 내 `describe("useYoloWorkerLifecycle", ...)` 안. line 300 이후 line 302 (`"unmount 시 ..."`) 직전.

**테스트 1: "ready 후 정확히 59_999ms 에는 리셋 안 됨"**
```
it("ready 후 59_999ms → retryAttempt 유지 (리셋 안 됨)", () => {
  // 1. crash → retry=1 → 2nd worker ready
  // 2. vi.advanceTimersByTime(59_999)
  // 3. expect(result.current.retryAttempt).toBe(1)  -- 아직 리셋 안 됨
});
```

**테스트 2: "ready 후 정확히 60_001ms 에는 리셋 완료"**
```
it("ready 후 60_001ms → retryAttempt 0 리셋 완료", () => {
  // 1. crash → retry=1 → 2nd worker ready
  // 2. vi.advanceTimersByTime(60_001)
  // 3. expect(result.current.retryAttempt).toBe(0)
});
```

**구현 시 주의:**
- `vi.advanceTimersByTime(59_999)` 와 `vi.advanceTimersByTime(60_000)` 는 vitest fake timer 에서 엄밀히 다르게 동작. `setTimeout(fn, 60_000)` 는 내부적으로 `now + 60_000 === scheduled_time` 에서 발사 → `advanceTimersByTime(59_999)` 시 미발사, `advanceTimersByTime(60_000)` 시 발사.
- 테스트 2 의 60_001 은 "60_000 도 발사 + 여유 1ms" 검증 → 리셋이 반드시 완료됨을 확정.
- 중간에 `act()` 으로 wrap 필수 (setState 발생).

**예상 LOC:** 테스트 2건 추가 = 약 +50 LOC (각 25 LOC).

### 2.2 권고 2 — OFF→ON transient flush 테스트 추가 설계

**현 상태 (R4 까지):**
- `broadcasterYoloDriver.test.ts` 는 **순수 시뮬레이터** 기반 — confirmFrames 의 3상태 스위치 로직만 검증. driver 훅 자체를 `renderHook` 으로 띄우지 않음.
- R4 에서 추가된 `useBroadcasterYoloDriver.ts` 의 disabled reset effect 에 `healthRef` 리셋 3줄 (line 292-297) + `healthDirtyRef=true` (line 298) 가 **동작상 검증 안 됨**.
- OFF→ON 전환 시 2초 내 flush 에서 `setHealth` 가 새 초기값 `{ ticksTotal:0, inferSuccesses:0, inferFailures:0, lastBackendError:null }` 를 반영하는지 확인하는 테스트 **없음**.

**R5 신규 테스트 선택지:**

#### 선택지 A (권장) — 신규 테스트 파일 `staging/tests/broadcasterYoloDriver.renderHook.test.ts`

**장점:**
- driver 훅 전체 (lifecycle + sampling + logger 주입) 를 `renderHook` 으로 띄울 수 있음.
- 기존 `broadcasterYoloDriver.test.ts` (시뮬레이터 기반 60+ 단위 테스트) 와 **역할 분리**.
- 추가 테스트 시나리오 (cameraId 변경, health flush debounce, maxDuration guard 등) 확장 용이.

**단점:**
- logger 주입 (`useBehaviorEventLogger`) 이 Supabase client mock 을 요구 → `makeSupabaseStub()` 신규 헬퍼 필요 (workerStubs.ts 에 추가 or 별도 helpers).
- Worker 도 `installWorkerStub()` 으로 대체 — lifecycle 테스트와 동일 패턴.
- vitest.config.ts include 에 **추가 필요** (설계서 §2.4 예외: 본 파일은 test. helper 아님).

**LOC 예상:** +150 LOC.

**테스트 명세 (최소 3건):**
```ts
describe("useBroadcasterYoloDriver — renderHook (R5)", () => {
  it("OFF→ON 토글 시 healthRef 초기화 + 2초 내 flush 에서 health 반영", async () => {
    // 1. renderHook({ enabled: false, ...props }) → health = 초기값.
    // 2. tick 몇 번 돈 것처럼 가정 (직접 bumpTick 호출 불가 → sampling stub 으로 시뮬)
    //    → 대안: driver 가 export 안 한 내부 ref 는 건드리지 않고 enabled 토글만 검증.
    // 3. rerender({ enabled: false → true })
    // 4. vi.advanceTimersByTime(2_000)
    // 5. expect(result.current.health).toEqual({ ticksTotal:0, inferSuccesses:0, ... })
  });

  it("OFF 전환 시 currentBehavior null 로 리셋", () => {
    // 1. confirmed 상태에서 enabled=true
    // 2. rerender({ enabled: false })
    // 3. expect(result.current.currentBehavior).toBe(null)
  });

  it("OFF 상태에서는 flush interval 돌지 않음", () => {
    // 1. enabled=false 유지. 2초 advance.
    // 2. health 값이 초기값에서 변하지 않음 확인.
  });
});
```

#### 선택지 B — 기존 `broadcasterYoloDriver.test.ts` 확장

**장점:**
- 신규 파일 불필요. vitest.config 수정 불필요.

**단점:**
- 기존 simulator 기반 코드와 renderHook 기반 테스트가 한 파일에 섞임 → 가독성 ↓.
- 기존 400 LOC 파일이 550+ LOC 로 커지며 R4 helpers 의도 역행.

**R5 Arch 권고: 선택지 A 채택**. 단 R5 Dev 가 mock 구성 비용이 크다 판단 시 R6 Arch 에 협의 후 선택지 B 로 전환 가능.

### 2.3 권고 3 — STABLE_READY_MS 60s 합리성 실기기 검증 가이드

**배경:**
- R4 §3.1 MAJOR-R4-A 에서 도입된 `STABLE_READY_MS = 60_000`. 60초 유지 후에야 retry 카운터 리셋.
- R4 QA 가 "사장님 실기기 검증 후 30/90/120s 조정 가능성" 을 R5+ 이관.

**판단 기준 (R5 Arch 제시):**

| 임계값 | 근거 | 리스크 | 적합 시나리오 |
|--------|------|--------|--------------|
| **30s** | backoff 1회분과 동일. retry 직후 바로 리셋. | **보호 효과 제로** (ready 직후 crash 해도 retry 카운터 곧바로 0 → 다시 1 → 영원히 30s 주기 crash loop). | 기각 — 설계 의도 깨뜨림. |
| **60s (현재)** | backoff 30s × 2 = 누적 시간 이상. crash 가 "첫 번째 성공한 척 worker" 를 한 사이클 더 지켜봄. | 실제 느린 모바일에서 WebGPU 초기화가 60s+ 걸리면 "정상 로딩 중" 을 "불안정" 으로 오판. | **기본 — 베타 기본값**. |
| **90s** | WebGPU 초기화 + 실제 추론 첫 사이클까지 여유. | 진짜 crash 시 사용자가 90s 동안 증상 감지 못할 수 있음. 그러나 retry 카운터는 결국 MAX_RETRIES 로 수렴. | iPhone 구형 (iOS 17 이하) + WebGL fallback 시. |
| **120s** | 2분 — 확실히 "정상 로딩" 구간 포함. | 모든 retry 대응이 2분 지연 → UX 답답함 ↑. | 베타 종료 후 프로덕션. |

**실기기 검증 절차 (사장님 대응 가이드 — R5 Dev 가 체크리스트 §7.3 에 추가):**

1. **준비:**
   - Vercel env `NEXT_PUBLIC_CAT_YOLO_V2=1` ON 후 READY + PROMOTED 확인.
   - 방송폰 (iPhone) 1대 + 뷰어폰 1대. 30분 방송 연속.
   - 브라우저 콘솔에서 `console.log` 로그 수집 (방송폰 쪽):
     ```
     [Lifecycle] ready backend=webgpu retryAttempt=0
     [Lifecycle] error crash#1 → retryAttempt=1
     [Lifecycle] ready backend=webgl retryAttempt=1
     [Lifecycle] stableReady timer fired → retryAttempt=0
     ```
   - 로그 수집용 임시 `console.log` 는 R5 Dev 가 lifecycle.ts 에 추가 (후에 제거).

2. **판정 기준:**
   - **60s 적정 (현 설정 유지):** 30분 내 `stableReady timer fired` 발생 횟수 = 정상 ready 횟수. 즉 crash 가 60초 내 재발하지 않음.
   - **60s 부족 (90s+ 로 상향):** 30분 내 `stableReady timer fired` 이후 30-60초 안에 `error crash` 가 반복되는 패턴 발견 시. WebGPU 초기화 직후 불안정 증거.
   - **60s 과도 (30s 하향):** 30분 내 `crash → retry → ready → crash` loop 자체가 한 번도 발생 안 함. 실제 운영 시 60s 타이머는 무의미. 단 보수적으로 유지 권장.

3. **조정 방법 (R6 Dev 가 수행):**
   - `staging/hooks/useYoloWorkerLifecycle.ts` line 55 `STABLE_READY_MS = 60_000` → 30_000 / 90_000 / 120_000 교체.
   - 테스트 값도 동시 조정 (line 268-300 의 60_000 → 해당 값).
   - `docs/phase_b_arch_r6.md` 에 조정 사유 + 실측 로그 스니펫 기록.

### 2.4 권고 4 — driver header 주석 "545 → ~200" 실측 345 정정

**현 위치:** `staging/hooks/useBroadcasterYoloDriver.ts` line 4.

**현재 주석:**
```
 * R3 변경점 (R2 QA M-R2-A REJECT 대응 — 545 LOC → ~200):
```

**정정 후 (R5 Dev 가 정확히 교체):**
```
 * R3 변경점 (R2 QA M-R2-A REJECT 대응 — 545 LOC → 345 LOC):
```

- 실측: 현재 파일 LOC = 345 (R4 QA §2 표 기준).
- "~200" 은 R3 시점 설계서 예상 수치. R4 에서 MAJOR-R4-B 주석 + MINOR-R4-d healthRef 리셋 추가로 +45 LOC 누적되어 현재 345.
- 동작 변경 0, 주석 문구만.

---

## 3. Phase C 진입 전 호환성 (A축)

### 3.1 Event model vs diary stats 갭 분석

**Phase C 가 이미 src/ 에 갖춘 집계 코드:**
- `src/features/diary/lib/behaviorEventsToDiaryStats.ts` (12 클래스 집계)
- `src/features/diary/lib/weeklyBehaviorAvg.ts`
- `src/features/diary/lib/behaviorPatternAnalyzer.ts`

**driver → logger → DB 가 INSERT 하는 payload (실측 `src/hooks/useBehaviorEventLogger.ts` line 239-252):**
```ts
{
  user_id, home_id, camera_id, cat_id,
  behavior_class,      // NECESSARY — diary 집계 기본 키
  behavior_label,
  confidence,          // NECESSARY — diary MIN_CONFIDENCE=0.6 필터
  bbox,
  detected_at,         // NECESSARY — diary 시간 정렬
  metadata: {          // ⚠️ MAJOR-R5-A 발견 — diary 가 전혀 참조 안 함
    model_version,     // Phase E archive 전용
    top2_class?,       // Phase D 라벨링 전용
    top2_confidence?,  // Phase D 라벨링 전용
    bbox_area_ratio?   // Phase D 라벨링 전용
  }
}
```

**Phase C 집계 파일이 SELECT 하는 컬럼 (실측 `behaviorEventsToDiaryStats.ts` line 41-47):**
```ts
type BehaviorRow = {
  behavior_class: string;
  confidence: number;
  detected_at: string;
  ended_at: string | null;
  user_label: string | null;
};
```

- **5개 컬럼만 SELECT. metadata 컬럼 미참조.**

### 3.2 MAJOR-R5-A — metadata 컬럼 활용 경로 명확화 필요

**문제:**
- driver 가 수집하는 `metadata.top2_class` / `top2_confidence` / `bbox_area_ratio` 는 Phase C 다이어리 집계에 **한 번도 사용되지 않는다**. 현재 설계는 "Phase D 라벨링 + Phase E archive" 전용.
- Phase C 사용자가 "어떤 행동이 오탐률이 높았는지" 같은 metadata 기반 인사이트를 보고 싶어도 코드가 준비 안 됨.
- 반대로 **driver 가 metadata 를 저장하는 비용 (JSONB serialization + DB row 크기 증가)** 은 매 INSERT 마다 지불되고 있음. row 크기 ~100 bytes → 100 bytes per row.

**영향 (베타 기준):**
- 베타 7명 × 하루 1,000 행동 row × 100 bytes = 700 KB/일 = **25 MB/월** metadata 만. Supabase Free tier 500MB 제한 기준 5% 수준 — 문제 아님.
- 프로덕션 100명 시 수십 GB/월 → 스토리지 비용 증가. Phase E archive 가 30일 후 이관하면 완화.

**권고 (R5 Arch):**

**옵션 1 (기본 — 현 설계 유지):**
- metadata 는 "raw auto-label 근거" 로서 Phase D 수정 UX 및 Phase E archive 에 필수. 베타 기간 동안 저장 유지. 단 **의도 문서화**.
- R5 Dev 가 `staging/docs/phase_b_src_migration_checklist.md` §7 신규 추가: "metadata 컬럼은 Phase D/E 전용 — Phase C 집계는 읽지 않음".

**옵션 2 (Phase C 에 metadata 인사이트 추가):**
- Phase C Arch (별도 팀) 가 결정. 본 R5 범위 밖.
- 잠재 필드: `metadata.top2_confidence < 0.3` 인 row 는 "안정적 감지" 로 UI 에 체크 표시.

**R5 결정: 옵션 1 채택**. 체크리스트 §7 에 "metadata 역할 분리" 섹션 신설.

### 3.3 갭 발견 시 조치 (체크리스트 §7 신설 명세)

`staging/docs/phase_b_src_migration_checklist.md` 마지막에 **§7 Phase C 호환성 (R5 Arch)** 신설:

```markdown
## §7 Phase C 호환성 (R5 Arch §3 발견)

### §7.1 metadata 컬럼 역할 분리

- driver → logger INSERT 시 채우는 `metadata.top2_class` / `top2_confidence` /
  `bbox_area_ratio` 는 **Phase D 라벨링 + Phase E archive 전용**.
- `src/features/diary/lib/behaviorEventsToDiaryStats.ts` 는 현재 이 컬럼을 **읽지 않음**.
  Phase C 가 metadata 기반 인사이트를 요구하게 되면 Phase C Arch 에서 별도 설계.
- INSERT 성능/스토리지 영향: row 당 ~100 bytes (베타 7명 시 25MB/월 수준, 문제 아님).

### §7.2 NONE row 저장 여부 (R4 MINOR-R4-f 유지)

- 현 driver 는 `cleared` 상태 시 `setCurrentBehavior(null)` 만 호출 → logger 가 이전 row close,
  새 row 안 만듦. Phase C 가 "고양이 없음" 구간을 UI 에 표시하려면 **클라이언트 gap 계산** 또는
  SQL 집계 필요.
- Phase C Arch 와 합의 필요. 현재 기본값 "NONE row 안 만듦" (전환 시점 INSERT 원칙 준수).

### §7.3 STABLE_READY_MS 실기기 검증 (R5 Arch §2.3)

- driver ON 상태에서 30분 방송 후 lifecycle 콘솔 로그 분석 (`[Lifecycle] stableReady timer fired`).
- 60s 부족 증상 (ready → 30-60s 내 crash 반복) 발견 시 90_000 으로 상향.
- 60s 과도 증상 (crash 자체가 한 번도 없음) 발견 시에도 보수적으로 60s 유지 권장.
```

---

## 4. iOS Safari 제약 (B축)

### 4.1 Backend fallback 경로 (실측 확인)

**현 설계 실측 (`staging/workers/yoloInference.worker.ts`):**
```
const BACKENDS = [
  { name: "webgpu", providers: ["webgpu"] },
  { name: "webgl", providers: ["webgl"] },
  { name: "wasm", providers: ["wasm"] },
];
```

- 순서대로 시도 → 실패 시 다음 backend. 정상.
- iOS Safari (15+): webgpu **미지원** (iOS 18+ 일부 preview). webgl **지원**. wasm **지원**.
- 실 경로: iPhone 에서 webgpu 실패 → webgl 시도 → 성공.
- **검증 상태: 코드 방어 OK, 실기기 확인 필요 (MINOR-R5-d)**.

### 4.2 createImageBitmap / getBattery / visibilitychange iOS 호환

| API | iOS 지원 | 현 설계 방어 | 발견 |
|------|----------|--------------|------|
| `createImageBitmap` | iOS 15+ OK | `staging/hooks/useYoloSampling.ts` line 153 `await createImageBitmap(video)` + try/catch 내부 `bitmap.close()` | ✅ 안전. iOS 14 이하는 베타 지원 대상 아님. |
| `navigator.getBattery()` | **iOS 미지원** | `staging/hooks/useBehaviorInferenceScheduler.ts` line 155 `typeof nav.getBattery !== "function"` 가드 → Promise.resolve(null). scheduler 는 배터리 정보 없이 default regime 으로 동작. | ✅ 안전. |
| `document.visibilitychange` | iOS Safari 15+ OK (탭/앱 전환 둘 다) | `staging/hooks/useYoloSampling.ts` line 204-209 addEventListener + cleanup. `staging/components/broadcast/CameraBroadcastClient.tsx` line 227-229 동일 | ✅ 안전. |
| **iOS PWA 홈 화면 앱**: visibilitychange | 홈 화면 추가 후 전체화면 모드에서 백그라운드 전환 시 document 는 hidden 되지만 JavaScript 실행이 **즉시 멈출 수 있음** (브라우저 탭과 다른 정책) | 현 설계는 `onHidden` 핸들러만 반응 → JS 자체가 멈추면 cleanup 미실행. 다음 foreground 복귀 시 stale 한 interval 재시작 시도. | **MINOR-R5-e**. Phase C 또는 Playwright 통합 테스트 권고. |

### 4.3 onnxruntime-web WASM 제약

**실측 불가 (빌드/실행 권한 없음 + onnxruntime-web 공식 문서 확인 필요).**

**R5 Arch 정리 (공개 문서 기준):**
- onnxruntime-web v1.17+ 의 WASM backend 는 **SIMD** 지원 (크로스 컴파일). iOS Safari 16.4+ 가 WASM SIMD 지원.
- **Threaded WASM** (multi-threading) 은 SharedArrayBuffer 필요 → **COOP/COEP 헤더** 설정 필수. Vercel 기본 배포는 **제공 안 함**. 따라서 threaded WASM 은 fallback 시 single-thread 로 수렴.
- 성능 영향: iOS 에서 webgl fallback 시 inference 1회당 200-500ms 예상. 5초 tick 간격이므로 여유. 단 iOS 14 이하 (SIMD 미지원 Safari 15) 에서는 800ms+ 가능 → regime="night" 때 10초 tick 으로 우회.

**발견 (MINOR-R5-f):**
- `next.config.ts` / `vercel.json` 에 COOP/COEP 헤더 설정 여부 실측 필요. 없다면 threaded WASM 은 자연스럽게 single-thread 로 수렴. 문제 없음.
- 체크리스트 §7.4 에 "iOS 실기기 inference 시간 측정" 항목 추가.

**R5 신규 체크리스트 §7.4 (명세 — R5 Dev 가 추가):**

```markdown
### §7.4 iOS 실기기 inference 성능 측정 (R5 Arch §4.3)

- 사장님 iPhone 으로 방송 5분 후 `health.inferSuccesses` / `ticksTotal` 비율 확인.
- webgl backend 로 수렴하는지 `DriverResult.backend` 확인.
- inference 1회 평균 시간이 2초 초과 시 regime="night" 고정 검토.
- WASM threaded 가 동작하지 않아도 정상 (COOP/COEP 헤더 미설정 때문).
```

---

## 5. 장시간 방송 시나리오 (C축)

### 5.1 탭 throttle 분석

**문제 가설 (R5 Arch 제기):**
- 브라우저 탭이 "inactive" (포커스 잃음) 상태로 전환되면 `setInterval` 이 **1Hz 로 throttle** (Chrome/Safari 공통). driver 의 5초 tick 은 영향 없지만 **health flush 2초 간격** 이 2초 → 최대 1초 지연.
- **더 중요한 문제**: 방송폰은 대부분 foreground 유지 (WebRTC 세션 keeping). 하지만 사용자가 일시적으로 홈 화면 → 다시 앱 으로 돌아오는 flow 에서 **몇 초간 inactive** 발생 가능.

**실측 (R5 Arch 코드 리뷰):**
- `staging/hooks/useYoloSampling.ts` line 204-209: `visibilitychange` 리스너가 document.hidden 시 → `stopInterval()` → `onHidden()` 호출.
- `onHidden` (driver line 234-242): history/avgConfidence/currentBehavior 전부 리셋.
- 다시 visible 복귀 시: 리스너가 `startInterval()` 호출 → 새 interval 시작.

**발견 (MAJOR-R5-B):**
- document.hidden 이 아닌 "포커스 없음" 상태 (예: 같은 화면에 다른 창이 위에 떠있음) 에서는 visibilitychange 이벤트 **발생 안 함**. setInterval throttle 만 발생.
- 이 경우 `stopInterval` / `onHidden` 이 실행 안 되므로 driver 는 계속 tick 시도 → throttled setInterval 이 간헐적으로 fire → bitmap 캡처 / postMessage 가 몇 초 지연.
- worker 는 여전히 돌고 있음 → 문제 없음. 단 `healthRef.ticksTotal` 이 throttle 중 누적 안 됨 → 복귀 시 다시 정상 속도.
- **사용자 혼란 위험**: `initStatus="ready"` 에 `ticksTotal` 이 매우 적게 보이면 "추론이 안 돌고 있다" 로 오해 가능.
- **베타 범위에서는 사장님 1대가 실제로 foreground 유지 → 영향 낮음**. 프로덕션 시 재검토.

**R5 결정:** MAJOR-R5-B 는 **체크리스트 §7.5 에 기록** (Phase C 운영 모니터링에서 발견 여부 검증). R5 Dev 수정 불필요.

### 5.2 GPU 메모리 / bitmap.close()

**실측 (`staging/hooks/useYoloSampling.ts` line 153-166):**
```ts
bitmap = await createImageBitmap(video);
try {
  worker.postMessage(msg, [bitmap]);
} catch (err) {
  if (bitmap) {
    try {
      bitmap.close();  // ✅ 실패 경로에서 명시 close
    } catch { /* 무시 */ }
  }
  ...
}
```

- 성공 경로: postMessage 의 `[bitmap]` transferable 이 ownership 이관 → 메인 스레드에서 bitmap 접근 불가 → GC 대상 → 메모리 정리.
- Worker 쪽 (`staging/workers/yoloInference.worker.ts` line 122): `bitmap.close()` 호출 → GPU 자원 해제.

**발견 (MINOR-R5-g):**
- **메인 스레드 성공 경로에서 bitmap.close() 를 명시 호출하지 않음**. transferable 이관 후에는 close() 필요 없지만 (ownership 없음), 혹시 postMessage 가 sync throw 없이 false-success 인 경우 (브라우저 버그) bitmap leak 가능.
- 현실성 매우 낮음. 단 defensive 측면에서 주석 1줄 권고.

**R5 권고 (R5 Dev 선택적):**
- `staging/hooks/useYoloSampling.ts` line 156 (`worker.postMessage(msg, [bitmap])`) 직후에 주석:
  ```
  // transferable 이관 성공 → bitmap 은 이제 Worker 소유. 여기서 close() 불필요.
  //   실패 시만 catch 에서 close() — worker 쪽이 결국 close() 호출.
  ```

### 5.3 localStorage quota (5MB)

**실측 (`src/hooks/useBehaviorEventLogger.ts` line 267-295):**
- `localStorage.getItem("pending_behavior_events")` → JSON.parse → push → JSON.stringify → setItem.
- 100건 cap: queue.length >= 100 시 shift() (oldest drop).
- 1 row ~500 bytes (metadata 포함) → 100건 = 50KB. **5MB quota 의 1%**. 안전.
- `SIGNED_OUT` 이벤트 시 removeItem.

**발견 (MINOR-R5-h):**
- 다른 기능 (Phase A logger 외 WebRTC 세션 캐시, supabase auth token 등) 이 localStorage 를 많이 쓰면 실제 가용량은 5MB 보다 작음. iOS Safari 는 특히 더 공격적인 제한.
- 현재 방어: `catch (_) { /* localStorage 실패 무시 — private mode / quota 초과 등 */ }` (line 293-295). 실패해도 앱 죽지 않음.
- **개선 여지**: quota 초과 시 console.warn 로 한 번만 (이미 100건 warn 패턴과 동일). R5 범위 밖, Phase D 이관.

**R5 결정:** 체크리스트 §7.5 항목 (장시간 방송 모니터링) 에 포함.

---

## 6. 네트워크 단절 / 복구 (D축)

### 6.1 오프라인 큐 / flush 폭증

**시나리오:**
1. 방송폰이 지하철 → 10분간 오프라인 (Supabase 접근 불가).
2. 10분 × 1 전환/분 = 10 row 가 localStorage 큐에 쌓임.
3. 복구 → 다음 INSERT 성공 직후 `flushPromise` 발동 (logger line 316-318) → 10개 row 일괄 INSERT.

**실측:**
- `supabase.from("cat_behavior_events").insert(sanitized)` 는 배열 INSERT (bulk). Supabase 는 단일 request 로 처리 → pool 1 connection.
- Supabase Free tier Nano pool=15 (CLAUDE.md #7). 10개 bulk INSERT 는 connection 1개만 소모.
- **발견 (MINOR-R5-i):** 큐가 99건까지 채워진 상태에서 복구되면 1 request 에 99 row bulk INSERT. statement timeout (기본 60s) 내 완료 가능하나 ❶ 네트워크 RTT 가 5초 이상이면 실패 시 큐에 그대로 남음 → 다음 시도 또 실패 → 루프. ❷ 동시에 UPDATE ended_at 요청이 오면 두 request 가 나란히 pool 소모.

**R5 결정:**
- 현 설계로 베타 수준 방어 충분. MINOR-R5-i 는 프로덕션 전환 시 "Pro/Compute upgrade" 로 자연 해소.
- 체크리스트 §7.5 에 "복구 후 flush 폭증 관찰" 항목 추가.

### 6.2 Realtime vs INSERT 경로 분리

**구조 명확화 (R5 Arch):**
- **INSERT (방송폰 → DB)**: HTTP POST `/rest/v1/cat_behavior_events`. Realtime 과 **별개 경로**.
- **Realtime subscribe (뷰어폰/다이어리 → DB)**: WebSocket `/realtime/v1/websocket`.
- Supabase Realtime 연결이 끊어져도 INSERT 는 HTTP 로 성공 가능. 반대도 성립.

**driver 에 미치는 영향:**
- driver 는 **INSERT 만** 수행 (Phase A logger 경유). Realtime 구독 안 함.
- 뷰어/다이어리에서 Realtime 끊김 → 즉시 반영 안 됨. 하지만 방송폰 쪽 driver 는 계속 정상 작동.
- **분리 정확**. 문제 없음.

### 6.3 WebRTC 끊김 시 driver 동작

**시나리오:**
- 사장님이 방송폰 foreground 유지. WebRTC 연결은 네트워크 문제로 일시 끊김 (ICE disconnected).
- driver 의 `enabled` 는 `motionActive` + `hasMotion` 등 상위 props 로 결정. WebRTC 상태와 **무관**.
- 따라서 driver 는 계속 tick 시도 → video element 는 getUserMedia 스트림 그대로 → inference 계속.

**발견 (MINOR-R5-j):**
- WebRTC 가 끊겼다고 driver 를 멈출 이유 없음 (오히려 그 동안도 행동 감지 + 오프라인 큐로 기록 유지). **정상 설계**.
- 단 `CameraBroadcastYoloMount.tsx` 호출 측에서 `isBroadcasting` 조건을 Mount 에 넣은 설계 (체크리스트 line 36 `{isYoloV2Enabled() && isBroadcasting && ...}`) 를 고려하면, WebRTC 끊김 → `isBroadcasting=false` 전환 → Mount unmount → driver 중지 가능성. 현 구조상 "isBroadcasting 판정 기준" 이 WebRTC connection state 에 묶이는지 여부가 핵심.
- Phase B 범위: Mount 외부 조건은 src/ 반영 PR 에서 결정. 본 R5 에서는 **Mount 내부 driver 는 enabled=true 인 동안 WebRTC 상태와 무관**을 보장.

**R5 결정:** 현 설계 유지. `isBroadcasting` 판정 기준은 src/ 반영 PR 에서 Phase A WebRTC 코드 기준으로 결정.

---

## 7. src/ 반영 PR 함정 목록 (E축)

### 7.1 CRITICAL-R5-C — ONNX 모델 파일 Vercel 배포 누락

**실측 (Grep 결과):**
- `.gitignore` line 63: `/public/models/*.onnx`
- `.gitignore` line 70: `public/models/*.onnx`
- 로컬에 `public/models/cat_behavior_yolov8n.onnx` 존재 (Glob 확인). 하지만 **git tracked 아님** → Vercel 배포에 미포함.
- `staging/hooks/useYoloWorkerLifecycle.ts` line 44: `MODEL_URL = "/models/cat_behavior_yolov8n.onnx"` — Worker 가 이 경로로 fetch.
- **flag ON 후 배포된 상태:** Worker 가 `/models/cat_behavior_yolov8n.onnx` fetch → Vercel 정적 파일 없음 → **404 응답** → onnxruntime init 실패 → Worker `error` 이벤트 → retry → 계속 404 → MAX_RETRIES 소진 → `initStatus="failed"`.

**심각도: CRITICAL** (flag ON 하는 순간 전원 failed. 롤백 필요).

**R5 대응 명세 (R5 Dev 가 체크리스트 §7.6 에 추가):**

```markdown
### §7.6 ONNX 모델 파일 Vercel 배포 포함 (R5 Arch §7.1 CRITICAL-R5-C)

src/ 반영 PR 에 다음 단계 **필수** 포함:

**옵션 A — Git LFS 추적 (권장):**
- [ ] `git lfs track "public/models/*.onnx"` 실행.
- [ ] `.gitattributes` 업데이트 commit.
- [ ] `.gitignore` 에서 `public/models/*.onnx` 제외 룰 제거 (또는 `!public/models/cat_behavior_yolov8n.onnx` 예외 추가).
- [ ] `cat_behavior_yolov8n.onnx` 를 git add → commit → push.
- [ ] Vercel 빌드가 LFS 인식하는지 `getDeployments` 로 확인 (Vercel 은 LFS 기본 지원).
- [ ] 빌드 후 배포 URL 에서 `/models/cat_behavior_yolov8n.onnx` 직접 접속 → 200 응답 확인.

**옵션 B — Supabase Storage 이관:**
- [ ] `cat_behavior_yolov8n.onnx` 를 Supabase Storage public bucket 에 업로드.
- [ ] `useYoloWorkerLifecycle.ts` MODEL_URL 을 Storage public URL 로 교체.
- [ ] CORS 정책 확인 (onnxruntime-web 은 동일 origin 아니어도 fetch 가능하나 CSP 제약 확인).

**옵션 C — 외부 CDN (Cloudflare R2 등):**
- [ ] 현재 범위 밖. 프로덕션 100+ 사용자 시 검토.

**R5 Arch 권고: 옵션 A (Git LFS)**. 베타 ~프로덕션 초기까지 단순하고 안정적.
```

**플래그 ON 전 필수 체크 (체크리스트 §1 에 추가):**
```markdown
- [ ] `curl https://<vercel-url>/models/cat_behavior_yolov8n.onnx -I` → `HTTP/2 200` 확인.
      **이 확인 없이 flag ON 하지 말 것 — Worker init 실패로 전원 failed.**
```

### 7.2 MAJOR-R5-D — Worker URL import.meta.url 경로 재작성

**실측 (`staging/hooks/useYoloWorkerLifecycle.ts` line 282-285):**
```ts
const worker = new Worker(
  new URL("../workers/yoloInference.worker.ts", import.meta.url),
  { type: "module" },
);
```

- 상대 경로 `../workers/yoloInference.worker.ts` — staging 구조에서 `staging/hooks/` → `staging/workers/` 이동.
- src/ 이관 후 경로 변경 필요:
  - `src/hooks/useYoloWorkerLifecycle.ts` → `src/workers/yoloInference.worker.ts` (src/ 하위 디렉터리 생성 필요)
  - 또는 `src/lib/workers/yoloInference.worker.ts` 로 이관

**R5 대응 (체크리스트 §1 추가):**
```markdown
- [ ] Phase B hooks → src/hooks 이관 시 `staging/workers/yoloInference.worker.ts` 를
      `src/workers/yoloInference.worker.ts` 로 이동 + `new URL(...)` 경로를
      `"../workers/yoloInference.worker.ts"` 그대로 유지 가능 확인.
- [ ] Next.js App Router + Turbopack 에서 `new Worker(new URL(...), { type: "module" })` 패턴이
      빌드타임에 별도 chunk 로 emit 되는지 `pnpm build` → `.next/static/chunks/` 디렉터리 확인.
      (Webpack 과 Turbopack 모두 공식 지원 — 확인 목적은 회귀 방지)
```

### 7.3 MAJOR-R5-E — Vercel env 변수 적용 타이밍 (CLAUDE.md #6 재확인)

**위험 재확인 (CLAUDE.md 교훈 #6):**
- Next.js `NEXT_PUBLIC_*` 는 **빌드타임 주입** — env 만 바꾸고 redeploy 안 하면 적용 안 됨.
- 2026-04-22 사고 원인 중 하나: flag ON 했는데 실제 프로덕션은 이전 에러 빌드 상태.

**R5 대응 (체크리스트 §1 기존 항목 강화):**
기존:
```markdown
- [ ] Vercel env `NEXT_PUBLIC_CAT_YOLO_V2=1` 설정 + 빈 커밋 push + `getDeployments` READY 확인.
```

**강화 후:**
```markdown
- [ ] Vercel env `NEXT_PUBLIC_CAT_YOLO_V2=1` 설정.
- [ ] env 변경 후 **빈 커밋** (`git commit --allow-empty -m "chore: redeploy for NEXT_PUBLIC_CAT_YOLO_V2"`) push.
- [ ] Vercel MCP `getDeployments` 로 `readyState: "READY" + readySubstate: "PROMOTED"` 확인.
- [ ] 배포 완료 후 사장님 실기기에서 `console.log(process.env.NEXT_PUBLIC_CAT_YOLO_V2)` 가 `"1"` 인지 브라우저 DevTools 에서 직접 확인 (빌드타임 치환 검증).
- [ ] Vercel Instant Rollback 대상 commit ID 메모 (`<이전 PROMOTED commit 40자>`).
```

### 7.4 MINOR-R5-k — staging → src import 경로 재작성

- staging 파일들이 상대경로로 서로 참조 중: 예를 들어 `useBroadcasterYoloDriver.ts` line 26 `../lib/behavior/confirmFrames`.
- src/ 이관 후 경로:
  - `staging/hooks/*.ts` → `src/hooks/*.ts`
  - `staging/lib/behavior/*.ts` → `src/lib/behavior/*.ts`
  - `staging/types/behavior.ts` → 이미 `src/types/behavior.ts` 존재 (Phase A 에서 이관 완료)
  - `staging/components/CameraBroadcastYoloMount.tsx` → `src/components/catvisor/CameraBroadcastYoloMount.tsx`
  - `staging/workers/yoloInference.worker.ts` → `src/workers/yoloInference.worker.ts`
  - `staging/tests/*.test.ts` → `src/tests/*.test.ts` (또는 `__tests__/`)
  - `staging/tests/helpers/workerStubs.ts` → `src/tests/helpers/workerStubs.ts`

**상대경로 규칙:**
- 이동 전후 경로 깊이 동일하면 `../lib/behavior/...` 그대로 유효.
- 단 tsconfig paths (`@/lib/*` 등) 가 있으면 상대경로 대신 paths 로 교체 가능 (선호 시).

**R5 체크리스트 §1 추가:**
```markdown
- [ ] 모든 staging/ 파일을 src/ 로 이동 후 `pnpm build` + `pnpm test` 통과 확인.
- [ ] import 경로 재작성 목록 문서화 (이관 PR description 에 첨부).
```

### 7.5 MINOR-R5-l — 체크리스트 §7 통합 세션 모니터링 항목

앞서 §3~§6 에서 발견한 MINOR 들을 **Phase C 진입 전 30분 실기기 모니터링 체크리스트 1개** 로 통합.

```markdown
### §7.5 src/ 반영 30분 모니터링 (R5 Arch 통합)

사장님 실기기 (iPhone) 방송 30분 중 확인:

- [ ] `health.inferSuccesses / ticksTotal` 비율 > 0.8 (R5 §4.3 iOS 성능).
- [ ] `initStatus="ready"` 유지, `retryAttempt=0` 유지 (R5 §2.3 STABLE_READY_MS 검증).
- [ ] backend 값이 iPhone 에서 `webgl` 또는 `wasm` 으로 수렴 (R5 §4.1).
- [ ] localStorage `pending_behavior_events` 값이 0 또는 20 이하 유지 (R5 §5.3 quota).
- [ ] Supabase MCP `cat_behavior_events` row 증가율이 분당 10 이하 (R5 §6.1 flush 폭증).
- [ ] iOS PWA 모드 시 visibilitychange 동작 확인 — 백그라운드 1분 후 복귀 시 정상 재개 (R5 §4.2 MINOR-R5-e).
- [ ] 콘솔 `[Lifecycle] stableReady timer fired` 메시지 확인 (R5 §2.3).
```

---

## 8. R5 Dev TODO 리스트 + 완료기준

| # | 작업 | 필수도 | 완료 기준 |
|---|------|--------|-----------|
| **1** | **권고 4** — `staging/hooks/useBroadcasterYoloDriver.ts` line 4 주석 "545 → ~200" → "545 → 345" 교체. | 필수 | diff 1줄. 동작 변경 0. |
| **2** | **MINOR-R5-NEW-1** — `staging/docs/phase_b_src_migration_checklist.md` §3.1 line 70-72 를 본 R5 §1.3 명세로 교체 (8건 세부 경로 명시). | 필수 | markdown diff. 체크박스 수/경로 정확. |
| **3** | **권고 1** — `staging/tests/yoloWorkerLifecycle.test.ts` 에 60s ±1ms 경계 테스트 2건 추가 (본 R5 §2.1 명세). | 필수 | 테스트 파일 +50 LOC 예상. `vitest run` 76 → 78 테스트 green. |
| **4** | **권고 2** — OFF→ON transient flush 테스트. 선택지 A (신규 `broadcasterYoloDriver.renderHook.test.ts` + vitest.config include 추가) 채택. | 필수 (A) 또는 B 협의 | 최소 3 case. vitest.config.ts include 1줄 추가. |
| **5** | **권고 3** — 체크리스트 §7.3 신설 (STABLE_READY_MS 실기기 검증 가이드 — 본 R5 §2.3 명세). lifecycle.ts 에 임시 `console.log` 4줄 추가 (R6 이후 제거). | 필수 | 체크리스트 diff + lifecycle 임시 로그 라인. |
| **6** | **MAJOR-R5-A** 대응 — 체크리스트 §7.1 신설 (metadata 역할 분리 문서 — 본 R5 §3.3 명세). | 필수 | markdown 신규 섹션. |
| **7** | **MINOR-R5-d/e/f** — 체크리스트 §7.4 신설 (iOS 실기기 성능/PWA visibility — 본 R5 §4.3 명세). | 필수 | markdown 신규 섹션. |
| **8** | **MAJOR-R5-B / MINOR-R5-g/h/i/j** — 체크리스트 §7.5 신설 (장시간 + 네트워크 통합 모니터링 — 본 R5 §7.5 명세). | 필수 | markdown 신규 섹션. |
| **9** | **CRITICAL-R5-C** — 체크리스트 §7.6 신설 (ONNX 파일 Vercel 배포 옵션 A/B/C — 본 R5 §7.1 명세). 체크리스트 §1 에 `curl /models/...` 확인 항목 추가. | 필수 | markdown 신규 섹션 + §1 보강. |
| **10** | **MAJOR-R5-D** — 체크리스트 §1 에 Worker URL 경로 재작성 항목 추가 (본 R5 §7.2). | 필수 | 체크박스 2개 추가. |
| **11** | **MAJOR-R5-E** — 체크리스트 §1 Vercel env 항목 강화 (본 R5 §7.3). | 필수 | 기존 1줄 → 5줄 확장. |
| **12** | **MINOR-R5-k** — 체크리스트 §1 에 import 경로 재작성 + `pnpm build` 통과 항목 추가 (본 R5 §7.4). | 필수 | 체크박스 1~2개. |
| **13** | **MINOR-R5-g** (선택적) — `staging/hooks/useYoloSampling.ts` line 156 postMessage 직후 주석 2줄 추가 (transferable 이관 명시). | 권고 | Dev 판단. 동작 변경 0. |
| **14** | 검증 — `pnpm exec vitest run` 76+2+3=81 테스트 green. `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.staging-check.json` exit=0. | 필수 | vitest 출력 "X passed / X total" (X >= 81). |
| **15** | 최종 확인 — `src/` 0 diff 유지 (`git diff --stat src/` 출력 공백). | 필수 | gitStatus 검증. |

### 8.1 금지 사항 (재확인)

- `src/` 수정 **금지** (이 라운드에서 할 일은 체크리스트 기록 + staging 문서/테스트만).
- 파일 삭제 **금지**. 이동도 금지.
- `supabase.rpc(...).catch()` 금지 (CLAUDE.md #1).
- 기존 테스트 green 상태 깨면 즉시 REJECT.
- CRITICAL-R5-C 의 **실제 ONNX 이관 (Git LFS 등) 은 src/ 반영 PR 에서만 수행**. 본 R5 는 체크리스트 기록만.

### 8.2 Dev 가 Arch 에 되물어야 하는 경우

- 권고 2 선택지 A 채택 후 mock 구성이 150 LOC 을 크게 넘으면 R6 Arch 에 선택지 B 전환 협의.
- `broadcasterYoloDriver.renderHook.test.ts` 를 vitest.config.ts include 에 추가하는 방식 (현 6개 + 1 = 7개) 이 R4 Arch §2.4 의 "helpers 는 include 에 추가 X" 와 충돌 없는지 확인 — **본 파일은 test. helper 아님 → 추가 맞음**.
- CRITICAL-R5-C 의 옵션 선택 (A Git LFS vs B Supabase Storage) 은 사장님 의사결정 → 본 라운드에서는 둘 다 기록만 하고 실행은 src/ PR.

---

## 9. R6 에 남길 질문

1. **CRITICAL-R5-C (ONNX 배포)** — src/ 반영 PR 에서 Git LFS 선택 시 실제 배포 파일 다운로드 크기가 10 MB 이하인지 확인. LFS 대역폭 제한 (Vercel free tier) 체크.
2. **MAJOR-R5-A (metadata 활용)** — Phase C Arch 가 metadata 기반 인사이트 (예: top2 혼동도 낮은 행동만 주간 집계) 를 요구하는지 확인. 요구 시 driver/logger 수정 없이 집계 SQL 만 추가.
3. **MAJOR-R5-B (탭 throttle)** — 프로덕션 전환 시 `document.hasFocus()` 폴링으로 focus loss 감지 후 driver 일시 중지하는 설계 검토.
4. **권고 3 (STABLE_READY_MS 실기기)** — 사장님 30분 테스트 로그 분석 후 R6 Arch 가 최종 값 확정 (60/90/120s).
5. **R5 §2.2 선택지 A vs B** — `broadcasterYoloDriver.renderHook.test.ts` 분리 후 기존 `broadcasterYoloDriver.test.ts` (simulator 기반) 를 `broadcasterYoloDriver.simulator.test.ts` 로 rename 권고 여부 — R6 에서 결정.
6. **MINOR-R5-e (iOS PWA)** — 사장님 실기기 iPhone 을 홈 화면 추가 모드로 시험 — 백그라운드 1분 후 복귀 시 driver 정상 재개 여부 Playwright 테스트 작성 가능한지.
7. **권고 2 테스트 Supabase client mock** — logger 주입 경로 mock 구성을 R5 Dev 가 실제로 얼마나 단순화할 수 있는지 — 복잡할 시 R6 에서 `useBehaviorEventLogger` 를 driver 로부터 분리 (driver 가 logger 호출을 상위 prop 으로 올림) 구조 변경 검토.
8. **9연속 PASS 카운트 — R5 PASS 시 3/9 진입**. R6~R13 팀이 계속 독립 검증.
9. **체크리스트 §7 5개 섹션 (§7.1~§7.6) 이 한 문서에 너무 많이 쌓임** — R6 또는 src/ 반영 PR 에서 파일 분할 (예: `phase_b_pre_flip_checklist.md` / `phase_b_post_flip_monitoring.md`) 검토.
10. **Phase C 착수 시점** — 본 R5 가 Phase C 호환성 검토 완료. Phase B 9연속 PASS 달성 후 Phase C Arch 를 동시 착수할지, 아니면 Phase B src/ 반영까지 끝낸 후 착수할지 사장님 의사결정.

---

## 10. 변경 없음 항목 (R1~R4 결정 유지)

- §1 confirmFrames 3상태 union (R2 §1).
- §2 ONNX retry state machine (R2 §2).
- §3 뷰어 게이트 3중 방어선 (R2 §3).
- §5 flag 정책 — `NEXT_PUBLIC_CAT_YOLO_V2` (R1 §5).
- §6 Phase A logger 통합 (R1 §6).
- R3 의 driver 3분할 (lifecycle / sampling / driver compose).
- R3 의 vitest include 6 파일 — 본 R5 에서 +1 (renderHook 테스트).
- R4 의 M1 옵션 A-변형 (eslint-disable-next-line + 근거 주석).
- R4 의 M2 helpers 모듈 (`staging/tests/helpers/workerStubs.ts`).
- R4 의 MAJOR-R4-A `STABLE_READY_MS=60_000` + 4곳 정리 경로.
- R4 의 MAJOR-R4-B driver line 123-126 주석.

---

## 11. R5 최종 판정 요약

**신규 발견:** **CRITICAL 1 · MAJOR 2 · MINOR 10 + 체크리스트 문구 정정 1**
**권고 4건:** 전부 해소 (구현 명세 완비).
**R4 QA PASS 유지 가능성:** **예** — CRITICAL-R5-C 는 **src/ 반영 PR 전** 필수 해소 항목으로, **staging 단계 (본 라운드) 에서는 체크리스트 기록만 필요**. 즉 현 staging/ 산출물의 동작/설계 정합성에는 영향 없음. MAJOR-R5-A/B 도 설계 해석 명확화 + 실기기 검증 가이드 제시로 해소.

**R5 Dev 가 §8 TODO 15개를 소화하면 R6 QA 가 PASS 판정 가능. 9연속 PASS 카운트 3/9 진입.**

**가장 중요 3건:**
1. **CRITICAL-R5-C (ONNX 파일 배포 누락)** — `.gitignore` 가 ONNX 를 제외. flag ON 시 404 → 전원 failed. src/ 이관 PR 필수 해소 (Git LFS or Supabase Storage).
2. **MAJOR-R5-A (metadata 역할 분리)** — driver 가 저장하는 top2_class / bbox_area_ratio 를 Phase C 집계가 읽지 않음. 설계 의도 차이 (D/E 전용) 를 체크리스트 §7.1 에 문서화.
3. **MAJOR-R5-D/E (Worker URL 경로 + Vercel env 타이밍)** — staging → src 이관 시 Worker URL import.meta.url 경로 + Vercel env 빌드타임 주입 + 빈 커밋 push + getDeployments READY 확인 (CLAUDE.md #6 재발 방지).

**R5 Arch 는 R4 PASS 상태를 존중하며 9연속 PASS 카운트 유지 전제로 작성.** R6 Arch 가 본 문서의 TODO 소화 결과 (R5 Dev 산출물) 를 검토 후 4/9 진입 또는 추가 발견 보고.
