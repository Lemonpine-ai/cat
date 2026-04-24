# Phase B 포크 체크포인트 — 2026-04-24

> **용도:** 이 Claude 세션을 중단하고 **다른 채팅창에서 이어받을** 때 새 Claude 가 이 문서 하나만 읽고 맥락 100% 파악 가능하게 작성.

---

## 0. 세션 TL;DR

- **날짜:** 2026-04-24 (계속)
- **현재 작업:** Phase B (YOLOv8n ONNX 온디바이스 추론 파이프라인) 9연속 PASS 검증 루프
- **진행 단계:** **R6 PASS 완료 ✅ → R7 대기** (포크 시점)
- **9연속 카운트:** R3/R4/R5/R6 PASS = **4/9** (남은 R7~R11 5 라운드)
- **팀 구조:** 팀장 (이 Claude) + 매 라운드 Arch/Dev/QA 독립 Agent 3개 (CLAUDE.md 팀 하네스)

---

## 1. Phase A 완료 상태 (2026-04-24 오전)

**완전 종료:**
- src/ 반영 (commit `354f6dd` pushed, Vercel READY + PROMOTED)
- DB 마이그 2건 적용:
  - `20260423_phase_a_behavior_full.sql` — 12 클래스 CHECK / metadata/user_label/snapshot_url 컬럼 / Phase E 뼈대 (archive/history 테이블 + behavior-snapshots bucket) / update_behavior_user_label RPC / export_behavior_dataset RPC
  - `20260423_phase_a_validate_after_cleanup.sql` — CHECK convalidated=true
- RPC 스모크 테스트 PASS
- 사이트 HTTP 200 (warm 0.4s)
- ARCHITECTURE.md §10 "YOLO 행동 분류 파이프라인 (Phase A~F)" 섹션 추가

**12 클래스 단일 진실 원천 4곳:**
- `src/lib/ai/behaviorClasses.ts` (TS whitelist)
- `public.is_valid_behavior_class(TEXT)` IMMUTABLE SQL 함수
- `cat_behavior_events_behavior_class_check` CONSTRAINT
- `BEHAVIOR_SEMANTIC_MAP` (meal/water/hygiene/rest/activity/alert)

---

## 2. Phase B 진행 현황

### 2.1 9연속 PASS 트래커

| R | Arch | Dev | QA | 판정 | 카운트 |
|---|------|-----|-----|------|--------|
| R1 | Q1~Q6 결정 ✅ | 10 파일 1,420 LOC ✅ | ❌ REJECT (CRITICAL 1 + MAJOR 2 + MINOR 7) | ❌ | - |
| R2 | 3상태 union + retryGen + 3중 방어 ✅ | 14 TODO (Driver 545 LOC) ✅ | ❌ REJECT (MAJOR 2: Driver 545 / vitest include) | ❌ | - |
| R3 | Driver 3분할 (lifecycle/sampling/core) ✅ | tsc 0 / 74 tests ✅ | ✅ PASS | ✅ | **1/9** |
| R4 | retry 침묵 실패 + openEventRef 주석 ✅ | 76 tests (60s timer + helpers 추출) ✅ | ✅ PASS (조건부, 팀장 실측 보강) | ✅ | **2/9** |
| R5 | 관측성/호환/실기기/Realtime/응집도 재검토 (CRITICAL-R5-C 발견) ✅ | 83 tests (renderHook + Supabase stub) ✅ | ✅ PASS | ✅ | **3/9** |
| R6 | MINOR 2 + 관측성 배지 + field test plan ✅ | 92 tests (latency 링버퍼 + DiagBadge + metadataFreeze) ✅ | ✅ PASS (팀장 실측 보강: 92/92 green, tsc 0, src/ 0 diff) | ✅ | **4/9** |
| R7~R11 | ⏳ | | | | |

**R6 QA 가 R7 에 남긴 경고 3건:**
1. **lifecycle 397 / driver 390 → R7 분할 필수.** latency 확장 시 400 초과 확정. `useYoloLatencyTracker.ts` 별도 훅 2분할 권고.
2. **health flush deps 에 latency 포함 → interval 재생성 stale 2-4s.** 실제 회귀 아니지만 dev 배지 stale 가능. R7 에서 healthRef 직접 동기화로 deps 제거.
3. **R6 QA Agent 샌드박스로 Bash 차단** → 팀장 실측으로 보강 완료 (tsc 0 / vitest 92/92 / src/ 0 diff). R7 이후 QA Agent 에 `pnpm exec tsc/vitest` 허용 권고.

**R6 QA 가 발견한 MINOR 4건 (R7 이월):**
- MINOR-R6-NEW-1: checklist §8 (프로덕션 100+ driver_health) 누락 (T8 권고 미이행)
- MINOR-R6-NEW-2: `metadataFreeze.test.ts` 가 logger 실 코드 import X → `buildBehaviorEventMetadata` export 개선 권고
- MINOR-R6-NEW-3: `field_test_plan.md` §0 준비에 "이전 PROMOTED commit ID 메모" 체크박스 누락
- MINOR-R6-NEW-4: `YoloDriverDiagBadge.tsx` statusColorClass 주석 dead code ("retrying" 언급, 타입에 없음)

### 2.2 R1~R6 주요 결정 / 발견

**R1 결정 (unchanged across rounds):**
- Q1 추론 위치 = **방송폰 단독** (뷰어 중복 추론 제거)
- Q2 주기 = 낮 5000ms / 야간 30000ms / idle 120000ms / batteryLow ×2
- Q3 이벤트 모델 = Phase A logger "전환 시점 INSERT + ended_at UPDATE" 재사용
- Q4 flag = **`NEXT_PUBLIC_CAT_YOLO_V2`**, 기본 OFF
- Q5 staging worker 재사용 (`staging/workers/yoloInference.worker.ts`)
- Q6 metadata 4 필드 = `model_version="v1"` / `top2_class` / `top2_confidence` / `bbox_area_ratio`

**R2 개선:**
- `ConfirmResult` **3상태 discriminated union**: `{status:'confirmed',key} | {status:'pending'} | {status:'cleared'}`
- `retryGen` useState + 지수 백오프 (30/60/120/240/480s, MAX=5) + `initStatus`
- 3중 방어선 (L1 체크리스트 / L2 JSDoc 경고 / L3 `loggerArmGuard` dev-only sentinel)

**R3 분할:**
- `useYoloWorkerLifecycle` (Worker 생성/dispose/retry)
- `useYoloSampling` (tick/visibility/postMessage)
- `useBroadcasterYoloDriver` (core — handleResult 3상태 switch + onBeforeInfer/onHidden + health flush + Phase A logger compose)

**R4 관측성 초기:**
- `STABLE_READY_MS = 60_000` — ready 수신 후 60초 동안 재 crash 없어야 retryAttempt 리셋 (침묵 실패 방지)
- `openEventRef` race 주석 명시 (driver UI ref vs DB created_at 차이)
- eslint-disable 6건 (Phase A baseline 일관성)
- `staging/tests/helpers/workerStubs.ts` 공용 추출 (7 API)

**R5 발견:**
- **CRITICAL-R5-C (staging 영향 0, src/ PR 시점 필수):** `.gitignore` 의 `/public/models/*.onnx` 제외 → Vercel 에 ONNX 미포함 → flag ON 시 Worker fetch 404. **팀장 결정: C-1 Cloudflare R2 확정 (무료 tier, egress 영구 무료)**
- MAJOR-R5-A: metadata 4 필드는 Phase D/E 전용, diary stats 미참조 — 역할 분리 체크리스트
- MAJOR-R5-B: 탭 throttle — Screen Wake Lock API 권고
- metadata freeze 선언 (Phase D 착수 시점까지)

**R6 관측성 완성:**
- `DriverHealth` 에 `inferLatencyP50Ms/P95Ms` 링버퍼 (N=10)
- `YoloDriverDiagBadge.tsx` (93 LOC, dev-only NODE_ENV 가드)
- `phase_b_field_test_plan.md` (170 LOC) — 사장님 45분 실기기 테스트 체크박스 20+ 개
- `metadataFreeze.test.ts` (146 LOC, 8 tests) — Phase D 진입 전 스키마 freeze 검증
- Dev 판단 보류 3조건 문서화 (테스트 회귀 없음 / self-sufficient / QA 사유 기록)

### 2.3 각 라운드 문서 경로

```
docs/phase_b_arch_r1.md ~ r6.md       (6 파일, 각 25~46KB)
docs/phase_b_qa_r1.md  ~ r6.md        (6 파일)
staging/docs/phase_b_src_migration_checklist.md  (379 LOC)
staging/docs/phase_b_field_test_plan.md           (170 LOC, R6 신규)
```

---

## 3. 현재 staging 파일 맵 (R6 Dev 반영 후)

### 3.1 Phase B 전용 (2026-04-24 신규)

| 파일 | LOC | 역할 |
|------|-----|------|
| `staging/hooks/useYoloWorkerLifecycle.ts` | **397**/400 | Worker 생성/dispose/retryGen/지수백오프/STABLE_READY_MS 60s/latency 링버퍼 |
| `staging/hooks/useYoloSampling.ts` | 230 | tick/visibilitychange/shouldInferNow/createImageBitmap/postMessage/inferStartRef |
| `staging/hooks/useBroadcasterYoloDriver.ts` | **390**/400 | compose (lifecycle+sampling) + handleResult 3상태 switch + onBeforeInfer/onHidden + health debounce + Phase A logger |
| `staging/hooks/useBehaviorInferenceScheduler.ts` | 272 | decideTick / shouldInferNow 순수 함수 + 시간대/모션/배터리 기반 |
| `staging/components/CameraBroadcastYoloMount.tsx` | 89/100 | UI 없는 mount (flag ON 시 driver 훅 실행 + dev-only DiagBadge 렌더) |
| `staging/components/YoloDriverDiagBadge.tsx` | 93/100 | **dev-only** 진단 배지 (prod NODE_ENV 가드, null 반환) |
| `staging/lib/behavior/confirmFrames.ts` | 97 | N프레임 확정 순수 함수 — 3상태 discriminated union |
| `staging/lib/behavior/yoloRetryPolicy.ts` | 48 | `computeBackoffMs` / `canRetry` / `MAX_RETRIES=5` |
| `staging/lib/behavior/loggerArmGuard.ts` | 90 | dev-only sentinel (broadcaster/viewer 이중 활성 탐지) |
| `staging/lib/behavior/yoloV2Flag.ts` | 39 | `NEXT_PUBLIC_CAT_YOLO_V2` 단일 진입점 |
| `staging/lib/behavior/maxDurationGuard.ts` | 54 | 30분 초과 강제 close 판정 |

### 3.2 Phase A 산물 (이전 세션)

| 파일 | LOC | 역할 |
|------|-----|------|
| `staging/lib/behavior/effectiveClass.ts` | 67 | TS↔SQL 3분기 CASE 동치 |
| `staging/lib/behavior/userLabelFilter.ts` | 29 | NON_NOISE_FILTER + PostgREST AND 주의 |

### 3.3 테스트 (8 파일, 92 tests)

| 파일 | LOC | tests |
|------|-----|-------|
| `staging/tests/yoloWorkerLifecycle.test.ts` | 465 | 10 (60s ±1ms / retry / latency) |
| `staging/tests/broadcasterYoloDriver.test.ts` | 333 | 20 |
| `staging/tests/yoloSampling.test.ts` | 230 | 5 |
| `staging/tests/inferenceScheduler.parity.test.ts` | 231 | 23 |
| `staging/tests/confirmFrames.test.ts` | 223 | 13 |
| `staging/tests/broadcasterYoloDriver.renderHook.test.ts` | 186 | 5 (OFF→ON transient flush) |
| `staging/tests/metadataFreeze.test.ts` | 146 | 8 (Phase D 스키마 freeze) |
| `staging/tests/maxDurationGuard.test.ts` | 104 | 7 |
| `staging/tests/helpers/workerStubs.ts` | 228 | (helper, 7 API) |

**실측 검증 (R6 Dev):** `npx vitest run` → **8 files / 92 passed / 1.74s** / `tsc --noEmit -p tsconfig.staging-check.json` exit 0 / `git diff src/` 0 lines.

---

## 4. 미해결 사안 (사장님 / 차기 세션 할 일)

### 4.1 CRITICAL-R5-C → C-1 Cloudflare R2 확정

**사장님이 실제로 해야 할 일 (브라우저):**
1. Cloudflare 계정 생성 (무료)
2. R2 bucket 생성: `cat-models` (public access 활성)
3. ONNX 파일 업로드: `public/models/cat_behavior_yolov8n.onnx` → `https://<account>.r2.cloudflarestorage.com/cat-models/cat_behavior_yolov8n.onnx`
4. CORS 설정: `Access-Control-Allow-Origin: https://cat-lac-eight.vercel.app`
5. API 토큰 발급 (필요 시, 업로드용만 — 공개 fetch 는 토큰 불필요)
6. Vercel 환경변수 추가: `NEXT_PUBLIC_YOLO_MODEL_URL=https://<account>.r2.cloudflarestorage.com/cat-models/cat_behavior_yolov8n.onnx`

**코드 작업 (src/ PR 에서):**
- `.gitignore` 의 `/public/models/*.onnx` **유지** (로컬에만, Vercel 에 동봉 안 함)
- Worker fetch URL 을 하드코딩 `/models/...` → 환경변수 `process.env.NEXT_PUBLIC_YOLO_MODEL_URL` 로 치환
- 체크리스트 §1.2 의 `curl -I $NEXT_PUBLIC_YOLO_MODEL_URL` 200 확인

**비용:** 베타~프로덕션 1000명까지 **월 $0** (egress 영구 무료, 10GB/month reads/writes 무료 quota).

### 4.2 Phase B 9연속 PASS 남은 라운드

- R6 QA 결과 대기 → 4/9 진입 시 R7~R11 (5 라운드)
- R6 가 REJECT 이면 카운트 0 리셋 + R7 Arch 재설계

**R7 QA 에 R6 Dev 가 남긴 힌트 (이어받는 Arch/Dev 가 고려):**
1. lifecycle 397 LOC — 한도 3줄 마진. R7 추가 작업 시 분할 위험
2. driver health flush effect deps 에 latency P50/P95 — interval 재생성 엣지 가능
3. DiagBadge 가 DriverResult 전체 prop — React.memo 검토
4. metadataFreeze.test 가 logger 로직 복제 — buildMetadata export 개선 후보
5. iOS Safari performance.now() 1ms 해상도 — Number.isFinite 가드 충분?
6. isInferring 3곳 쓰기 (R6 에서 주석만, R7+ 리팩터 대상)

### 4.3 Phase B → src/ 반영 PR (9연속 PASS 달성 후)

**절차 (CLAUDE.md §WebRTC/Supabase 교훈 준수):**
1. CRITICAL-R5-C: 사장님 Cloudflare R2 세팅 완료 + `NEXT_PUBLIC_YOLO_MODEL_URL` 환경변수 Vercel 에 추가
2. `pnpm build` 로컬 통과 (staging 경로 import 되면 빌드 대상 포함)
3. staging → src/ 경로 일괄 이관 (import 경로 재작성)
4. `NEXT_PUBLIC_CAT_YOLO_V2` 환경변수 Vercel 에 추가 **(기본 OFF)** — 빈 커밋 push 로 빌드 강제
5. Vercel READY + PROMOTED 확인 (CLAUDE.md #4 교훈)
6. Instant Rollback 경로 사전 메모 (현재 prod commit `354f6dd`)
7. `NEXT_PUBLIC_CAT_YOLO_V2=1` 토글 → 사장님 실기기 테스트 (`staging/docs/phase_b_field_test_plan.md` 체크박스 20+ 따라)
8. 문제 시 즉시 flag OFF (환경변수만 수정 + 빈 커밋 재빌드, 5초 이내)

### 4.4 Phase C 시작 (향후)

Phase C = 다이어리 UI (12 클래스 집계, 일/주/월 리포트, scratching 빈도 기반 패턴). Phase A 에서 이미 `behaviorEventsToDiaryStats.ts` / `weeklyBehaviorAvg.ts` / `behaviorPatternAnalyzer.ts` 초안 작성됨 — Phase C 에서 UI 통합.

### 4.5 Phase D/E/F 로드맵

- **D** 라벨링 UI (집사가 잘못된 추론 수정 → `update_behavior_user_label` RPC)
- **E** 노이즈 archive 이관 + snapshot 저장 (`behavior-snapshots` bucket owner-only policy)
- **F** SD카드 학습 영상 batch retraining (`export_behavior_dataset` RPC 사용)

---

## 5. 운영 환경 (2026-04-24 갖춰진 상태)

### 5.1 WSL + claude-auto-retry ✅

- **Ubuntu 24.04.4 LTS** (Noble Numbat)
- **Node 22.22.2** + npm 10.9.7
- **tmux 3.4**
- **Claude Code 2.1.118**
- **claude-auto-retry 0.2.2** — 사용한도 감지 시 자동 "continue" 주입
- 유저: **bloodycroix** (passwordless sudo, default user)
- `/etc/wsl.conf` → `[user] default=bloodycroix`
- `.bashrc` 에 wrapper 함수 등록됨

**다음 세션 사용법:**
```
Windows Terminal / PowerShell / cmd 에서
> wsl
[자동으로 bloodycroix 유저로 Ubuntu 진입]
$ cd /mnt/c/Users/User/Desktop/projects/cat
$ claude
[tmux 세션 안에서 자동 래핑, rate limit 걸리면 자동 재개]
```

### 5.2 MCP 서버

- **Supabase MCP**: 활성 (execute_sql, apply_migration, list_projects 등)
- **Vercel MCP**: 설정됨 but 현 세션에서 disconnected (tool 중 일부 unavailable)
- `.claude/mcp.json` + `.mcp.json` 둘 다 gitignore 됨

### 5.3 Claude 사용량 (Max 요금제)

- 주간 41시간 리셋
- 이번 세션: Phase A 완료 + WSL 세팅 + Phase B R1~R6 진행 (실제 사용량 측정 X, 대략 15~20 시간 추정)
- 남은 예상 작업 (R7~R11 + src/ PR + 사장님 실기기 테스트 보조): ~15 시간

---

## 6. 새 세션 이어받기 (이 문서 이후)

**Day 1 - 이 문서 읽은 직후:**
1. `docs/phase_b_fork_checkpoint_2026-04-24.md` (이 문서) 전체 정독
2. `docs/phase_b_qa_r6.md` 존재 여부 확인 → 있으면 내용 읽고 R6 판정 (PASS / REJECT) 파악
3. `CLAUDE.md` §팀 하네스 수칙 + §WebRTC/Supabase 교훈 정독
4. `docs/ARCHITECTURE.md` §10 (Phase A~F 로드맵) 정독
5. `staging/docs/phase_b_src_migration_checklist.md` (379 LOC) + `staging/docs/phase_b_field_test_plan.md` (170 LOC) 정독

**Day 1 - 작업 재개 (R6 PASS 4/9 확정 상태):**
- **R7 Arch 띄우기 (→ 5/9 목표)**. 필수 반영 항목:
  - R6 QA 경고 3건: lifecycle/driver 분할 (`useYoloLatencyTracker.ts` 추출) + health flush deps 수정 + QA Agent Bash 권한 확인
  - MINOR-R6-NEW-1~4 소화
- R7 Dev 는 Bash 권한 확보된 QA Agent 로 실측 PASS/REJECT 결정받기

**새 세션에서 Agent 띄우는 룰 (CLAUDE.md):**
- 매 라운드 **Arch → Dev → QA 독립 3 Agent**
- Arch: 설계만, 코드 X
- Dev: staging/ 만 수정, src/ 0 diff 강제
- QA: 처음 보는 눈, REJECT 권한, 실측 (`tsc` + `vitest` + `git diff src/` + `wc -l`)

**실측 기준선 (R6 Dev 시점):**
- `npx tsc --noEmit -p tsconfig.staging-check.json` → **exit 0**
- `npx vitest run` → **8 files / 92 passed**
- `git diff --stat src/` → **0 lines**
- 모든 staging 파일 400/100 한도 내 (최대: lifecycle 397, driver 390)

---

## 7. 핵심 파일 경로 레퍼런스

```
프로젝트 루트: C:\Users\User\Desktop\projects\cat

[필수 정독]
CLAUDE.md                                                     (팀 수칙)
docs/ARCHITECTURE.md                                          (§10 Phase A~F)
docs/phase_b_fork_checkpoint_2026-04-24.md                    (이 문서)
staging/docs/phase_b_src_migration_checklist.md               (src/ 반영 PR 체크)
staging/docs/phase_b_field_test_plan.md                       (사장님 실기기 테스트)

[라운드 히스토리]
docs/phase_b_arch_r1.md ~ r6.md                               (설계 누적)
docs/phase_b_qa_r1.md  ~ r5.md (r6 백그라운드)                (검증 누적)

[staging 핵심]
staging/hooks/useBroadcasterYoloDriver.ts  (390)              (driver core)
staging/hooks/useYoloWorkerLifecycle.ts    (397)              (worker 관리)
staging/hooks/useYoloSampling.ts           (230)              (tick/sampling)
staging/components/CameraBroadcastYoloMount.tsx (89)          (진입점 컴포넌트)
staging/components/YoloDriverDiagBadge.tsx (93)               (dev-only 배지)

[Phase A 완료 — 수정 금지, 참고만]
src/hooks/useBehaviorEventLogger.ts                           (이벤트 INSERT)
src/lib/ai/behaviorClasses.ts                                 (12 클래스)
src/lib/ai/yoloPostprocess.ts                                 (letterbox/NMS)
src/types/behavior.ts                                         (Detection type)
```

---

**문서 끝. 다음 Claude: 이 문서 하나만 읽으면 Phase B 9연속 PASS 루프 이어받기 가능. 건투를!**
