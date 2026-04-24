# R12 PR 체크포인트 — 2026-04-24

> **용도:** 이 Claude 세션을 중단하고 **다른 채팅창에서 이어받을** 때 새 Claude 가 이 문서 하나만 읽고 R12 commit 3 부터 정확히 이어가게 작성.
>
> **사장님 결정:** commit 3 + commit 4 는 한 세션에서 연결 진행 (R11 Arch §3.4~§3.5 그대로).

---

## 0. 현재 상태 TL;DR

- **날짜:** 2026-04-24 (계속)
- **현재 작업:** Phase B src/ 반영 PR (R12), atomic 7 commit 중 commit 0~2 완료
- **Branch:** `feat/phase-b-src-r12` (master 에서 분기, **로컬만, push 0**)
- **다음 작업:** commit 3 (staging → src/ 19 파일 이관 + R7-S + Mount + 뷰어 게이트) + commit 4 (ARCHITECTURE.md §10.2 통합)
- **9연속 PASS:** R11 PASS = 9/9 완료 (R1~R11 끝, 11 라운드 모두 PASS)

---

## 1. 완료된 commit 3개

| # | hash | 메시지 | diff |
|---|------|--------|------|
| 0 | `ba2e4a0` | chore(phase-b): R12 PR 베이스 — Phase B staging 산출물 + 라운드 문서 + 테스트 의존성 | 58 files +19,179/-100 |
| 1 | `db26cbe` | feat(phase-b): commit 1 — mirror 마커 r7-1 → r10-1 갱신 (3 파일 동시) | 3 files +5/-5 |
| 2 | `71f5d24` | feat(phase-b): commit 2 — src/ logger 본체 NaN/Infinity 가드 (mirror 1:1 동치) | 1 file +5/-3 |

**검증:** 각 commit 후 `npx vitest run` → 10 files / **109 passed** / `npx tsc --noEmit -p tsconfig.staging-check.json` → exit 0.

**현재 branch HEAD:** `71f5d24` (commit 2 끝)

---

## 2. commit 3 작업 명세 — staging → src/ 19 파일 이관

### 2.1 발견 사항 (commit 3 시작 전 분석)

- **`staging/` 가 광범위 mirror** (184 .ts 파일 / 26K LOC). multi-viewer / cat-identity 등 다른 작업 잔재 다수 포함.
- **R12 commit 3 의 실제 대상은 R11 명세된 Phase B 19 파일만.** 나머지 staging 파일들은 그대로 둠.
- `src/workers/yoloInference.worker.ts` 가 이미 `staging/workers/` 보다 자세함 (이관 불필요, 그대로 사용).
- `src/components` 의 patterns: 모두 폴더 구조 (Dashboard/, auth/, broadcast/, catvisor/, ...). **신규 2 파일은 `src/components/broadcast/` 에 두기 권고.**

### 2.2 이관 대상 19 파일 매핑 표

#### Hooks 6개 — staging/hooks/* → src/hooks/*

| 원본 | 대상 | LOC | import 경로 조정 |
|------|------|-----|----------------|
| `staging/hooks/useBroadcasterYoloDriver.ts` | `src/hooks/useBroadcasterYoloDriver.ts` | 313 | **변경 없음** (같은 깊이) |
| `staging/hooks/useYoloWorkerLifecycle.ts` | `src/hooks/useYoloWorkerLifecycle.ts` | 357 | 변경 없음 |
| `staging/hooks/useYoloSampling.ts` | `src/hooks/useYoloSampling.ts` | 235 | 변경 없음 |
| `staging/hooks/useYoloLatencyTracker.ts` | `src/hooks/useYoloLatencyTracker.ts` | 139 | 변경 없음 |
| `staging/hooks/useDriverHealth.ts` | `src/hooks/useDriverHealth.ts` | 112 | 변경 없음 |
| `staging/hooks/useBehaviorInferenceScheduler.ts` | `src/hooks/useBehaviorInferenceScheduler.ts` | 272 | 변경 없음 |

**근거:** staging/hooks 와 src/hooks 둘 다 깊이 같음 (`../types`, `../lib/behavior`, `./useBehaviorEventLogger` 등 그대로 유효). 단순 Read + Write 로 mechanical 이관.

#### Components 2개 — staging/components/* → src/components/broadcast/*

| 원본 | 대상 | LOC | import 경로 조정 |
|------|------|-----|----------------|
| `staging/components/CameraBroadcastYoloMount.tsx` | `src/components/broadcast/CameraBroadcastYoloMount.tsx` | 89 | **1단계 추가** (`../hooks/X` → `../../hooks/X`) |
| `staging/components/YoloDriverDiagBadge.tsx` | `src/components/broadcast/YoloDriverDiagBadge.tsx` | 98 | 1단계 추가 |

**조정해야 할 import:**
- `import type { DriverResult } from "../hooks/useBroadcasterYoloDriver"` → `"../../hooks/useBroadcasterYoloDriver"`
- `import { useBroadcasterYoloDriver } from "../hooks/useBroadcasterYoloDriver"` → `"../../hooks/useBroadcasterYoloDriver"`
- `import type { BehaviorDetection } from "../../types/behavior"` → `"../../types/behavior"` (변경 없음 — 이미 ../../)
- Mount 안의 `import YoloDriverDiagBadge from "./YoloDriverDiagBadge"` → 변경 없음 (같은 폴더)

#### Lib/behavior 6개 — staging/lib/behavior/* → src/lib/behavior/*

| 원본 | 대상 | LOC | import 경로 조정 |
|------|------|-----|----------------|
| `staging/lib/behavior/confirmFrames.ts` | `src/lib/behavior/confirmFrames.ts` | 97 | **변경 없음** |
| `staging/lib/behavior/yoloRetryPolicy.ts` | `src/lib/behavior/yoloRetryPolicy.ts` | 48 | 변경 없음 |
| `staging/lib/behavior/loggerArmGuard.ts` | `src/lib/behavior/loggerArmGuard.ts` | 90 | 변경 없음 |
| `staging/lib/behavior/yoloV2Flag.ts` | `src/lib/behavior/yoloV2Flag.ts` | 39 | 변경 없음 |
| `staging/lib/behavior/maxDurationGuard.ts` | `src/lib/behavior/maxDurationGuard.ts` | 54 | 변경 없음 |
| `staging/lib/behavior/buildBehaviorEventMetadata.ts` | `src/lib/behavior/buildBehaviorEventMetadata.ts` | 48 | 변경 없음 (마커 r10-1 유지) |

**기존 src/lib/behavior:** `effectiveClass.ts`, `userLabelFilter.ts` (Phase A 산출물, 무관). 충돌 없음.

#### Tests 11개 (10 + helper) — staging/tests/* → src/__tests__/* 또는 vitest config 갱신만

**옵션 A (권고):** staging/tests 그대로 두고 vitest.config.ts 의 include 만 새 위치로 갱신. tests 위치를 src/ 로 옮기지 않음. 테스트는 source 와 동일 위치에 있어야 한다는 강제 X (Next.js 권고는 `__tests__` 또는 `*.test.ts` 만).

**옵션 B:** staging/tests/* → src/__tests__/* 이전 + vitest.config 갱신. 테스트 안의 import 경로 `../hooks/X` → `../X` 등 다수 조정.

**R11 Arch §3.4 마지막 권고: 옵션 B (이관)** but 옵션 A 가 변경 부담 적고 안전. **commit 3 진행 시 옵션 결정.**

#### 수정 대상 src/ 핵심 파일 3개

| 파일 | 변경 내용 |
|------|----------|
| `src/hooks/useBehaviorEventLogger.ts` | metadata 조립 블록 (line 226-237) → `buildBehaviorEventMetadata(detection, BEHAVIOR_MODEL_VERSION)` 호출 1줄 치환. **R7-S 적용.** commit 2 의 NaN 가드 변경이 자연 흡수됨 (이게 R11 Arch §3.3 의 의도된 결과). import 1줄 추가: `import { buildBehaviorEventMetadata } from "../lib/behavior/buildBehaviorEventMetadata"`. |
| `src/app/camera/broadcast/CameraBroadcastClient.tsx` | `<CameraBroadcastYoloMount />` 추가 + `isYoloV2Enabled() && isBroadcasting` flag 분기. import 2줄: `CameraBroadcastYoloMount` + `isYoloV2Enabled`. JSX 위치는 broadcast 클라이언트의 메인 렌더 안. |
| `src/hooks/useBehaviorDetection.ts` | onBehaviorChange 호출부 게이트 추가: `onBehaviorChange: isYoloV2Enabled() ? undefined : existingHandler` (또는 `isViewer` 옵션 도입). 뷰어 측 중복 INSERT 차단 (CLAUDE.md WebRTC 교훈 핵심 — 2026-04-22 장애 재현 방지). |

### 2.3 staging shim 변환 (19 파일 모두) — CLAUDE.md "삭제 금지" 준수

CLAUDE.md "**파일 삭제 절대 금지.** rm, checkout, restore, clean up 사용 불가. 수정(Edit)만 허용." 원칙. staging 19 파일을 다음 형태로 Edit:

```ts
/**
 * R12 PR commit 3 적용 후 — 본 파일은 src/{경로}/{이름} 으로 이관됨.
 * staging/ 보존 정책 (CLAUDE.md "파일 삭제 절대 금지") 에 따라 re-export shim 유지.
 * 신규 import 는 src/ 경로 권장.
 */
export * from "../../src/{경로}/{이름}";
```

상대경로 예시:
- `staging/hooks/X.ts` → `export * from "../../src/hooks/X"`
- `staging/components/X.tsx` → `export * from "../../src/components/broadcast/X"`
- `staging/lib/behavior/X.ts` → `export * from "../../../src/lib/behavior/X"`

**주의:** `metadataFreezeMirror.test.ts` 는 fs.readFileSync 로 staging mirror 와 src/ logger 마커를 검증하는데, R7-S 적용 후 staging mirror 본체가 사라지면 검증 의미 변경. **R12 commit 3 안에서 mirror.test 도 갱신 또는 archive.**
- 옵션 a: mirror.test 의 STAGING_MIRROR_PATH 를 `src/lib/behavior/buildBehaviorEventMetadata.ts` 로 변경. 양쪽 모두 src 안에서 마커 검증.
- 옵션 b: mirror.test 자체를 archive (R7-S 후 mirror 함수가 src/ 로 통합되어 양쪽 검증 의미 소멸).
- **R12 권고: 옵션 a** — 마커 자체는 spec 선언 의미 유지, src 안에서 logger ↔ helper 동치 보존.

### 2.4 설정 파일 정리

| 파일 | 변경 |
|------|------|
| `tsconfig.staging-check.json` | staging 경로 그대로 두면 shim 의 re-export 만 타입체크. 또는 `"include": []` 로 비우고 `tsconfig.json` 만 사용. **R11 Arch 권고: include 비우기** (CLAUDE.md 삭제 금지 + staging shim 만 남김). |
| `vitest.config.ts` | tests 위치 옵션 A (staging 유지) 시 변경 없음. 옵션 B (src/__tests__) 시 include 재작성. |

### 2.5 commit 3 체크리스트

- [ ] hooks 6 → src/hooks/ Read + Write
- [ ] components 2 → src/components/broadcast/ Read + Write + import 경로 1단계 조정
- [ ] lib/behavior 6 → src/lib/behavior/ Read + Write
- [ ] tests 11 옵션 결정 (A: staging 유지 + vitest config 변경 없음, B: src/__tests__ 이관)
- [ ] src/hooks/useBehaviorEventLogger.ts metadata 블록 → buildBehaviorEventMetadata 호출 (R7-S)
- [ ] src/app/camera/broadcast/CameraBroadcastClient.tsx Mount + flag 분기
- [ ] src/hooks/useBehaviorDetection.ts 뷰어 게이트
- [ ] staging shim 변환 19 파일 (re-export)
- [ ] metadataFreezeMirror.test.ts STAGING_MIRROR_PATH → src/ 경로 갱신 (옵션 a)
- [ ] tsconfig.staging-check.json `"include": []` 또는 그대로
- [ ] vitest.config.ts (옵션 B 시)
- [ ] 검증: `npx tsc --noEmit -p tsconfig.staging-check.json` exit 0
- [ ] 검증: `npx vitest run` 10 files / 109 passed (회귀 0)
- [ ] 검증: `pnpm build` 통과 (Worker chunk emit + 타입 0)
- [ ] commit 3 생성

---

## 3. commit 4 작업 명세 — ARCHITECTURE.md §10.2 통합

### 3.1 현재 상태

`docs/ARCHITECTURE.md` 의 현 §10:
- §10. YOLO 행동 분류 파이프라인 (Phase A~F, 2026-04-24~) — line 798
- §10.2 DB 스키마 변경 (Phase A 적용 완료) — line 821

**중요:** R11 Arch §3.5 명세는 §10.2 를 "Phase B — 방송폰 온디바이스 추론" 으로 정의. **현재 §10.2 (DB 스키마) 와 충돌.** 해결책:
- 옵션 A: 현 §10.2 (DB 스키마) → §10.3 으로 이동, 신규 §10.2 = Phase B 방송폰 추론. 후속 절 번호 +1.
- 옵션 B: 현 §10.2 유지 + 신규 §10.X (예: §10.6) Phase B 추가. 번호 충돌 회피.
- **R12 commit 4 권고: 옵션 A** (R11 Arch §3.5 명세 그대로).

### 3.2 신규 §10.2 내용 (R11 Arch §3.5 명세 그대로 — 4 부속 절)

R11 Arch §3.5 의 §10.2.1 ~ §10.2.4 전체 복사 + 갱신.

#### §10.2.1 훅 합성 패턴
- driver = lifecycle + sampling + driverHealth + Phase A logger
- 5 훅 LOC 표 (driver 313 / lifecycle 357 / sampling 235 / driverHealth 112 / tracker 139)

#### §10.2.2 ref-forward callback wrapper 패턴
- staging/docs/phase_b_ref_forward_pattern.md (96 LOC) 본문 흡수 (~50 LOC 압축)
- bump 3 + markInferring 4 콜백, lifecycle 의 콜백 4 ref 동기화

#### §10.2.3 metadata freeze 약속 (Phase D 진입 전)
- 4 필드 (model_version / top2_class / top2_confidence / bbox_area_ratio)
- R10 §2 NaN/Infinity 가드 (Number.isFinite 미통과 시 key omit)
- mirror 검증: staging/tests/metadataFreezeMirror.test.ts (R7-S 후 위치 변경 시 갱신)

#### §10.2.4 환경변수
- `NEXT_PUBLIC_CAT_YOLO_V2`: flag, 기본 OFF
- `NEXT_PUBLIC_YOLO_MODEL_URL`: ONNX URL (현 값: `https://pub-e5e4c245235e430f84f088febf07a0c0.r2.dev/cat_behavior_yolov8n.onnx`)
- `NEXT_PUBLIC_YOLO_STABLE_READY_MS`: ready 안정 (default 60_000, iOS 저사양 90_000)

### 3.3 staging 문서 cross-reference 갱신

| 파일 | 변경 |
|------|------|
| `staging/docs/phase_b_ref_forward_pattern.md` | 헤더에 "본 문서는 ARCHITECTURE.md §10.2.2 로 통합됨 (R12 PR 시점, 2026-04-24)" 1줄 추가. 본문 그대로 유지. |
| `staging/docs/phase_b_src_migration_checklist.md` | 끝에 "R12 PR 완료 (commit hash + 머지 날짜)" 1줄 추가 (commit 4 시점에는 hash 미정 → "TBD" 또는 commit 4 안에서 자기 hash 메모 패턴) |
| `staging/docs/phase_b_field_test_plan.md` | 헤더에 "R12 PR 후 사장님 실기기 테스트 결과 commit 7 참조" 1줄 추가 |

### 3.4 commit 4 검증

- [ ] ARCHITECTURE.md §10.2.1~§10.2.4 추가 (4 부속 절)
- [ ] 기존 §10.2 (DB 스키마) → §10.3 이동 + 후속 번호 +1
- [ ] staging/docs/* 3 파일 cross-reference 1줄씩 추가
- [ ] `grep -n "10.2.1\|10.2.2\|10.2.3\|10.2.4" docs/ARCHITECTURE.md` → 4건
- [ ] `npx vitest run` → 109 passed (회귀 0, 문서만 변경이라 당연)
- [ ] commit 4 생성

---

## 4. push 정책 (사장님 명시 승인 후)

- commit 4 까지 완료 후 사장님께 **종합 보고** (각 commit hash + diff stat + 검증 결과 + commit 5~7 가이드)
- **사장님 명시 승인 후 `git push -u origin feat/phase-b-src-r12`**
- PR 생성 (gh pr create) — 사장님 승인 시점에. PR description 은 R11 Arch §11.1 템플릿 활용.

---

## 5. R11 Arch §3 참조 위치

새 세션에서 commit 3+4 진행 시 다음 파일 정독:

| 문서 | 핵심 영역 |
|------|----------|
| `docs/phase_b_arch_r11.md` | §3.4 (commit 3 명세, 파일 매핑 표 포함) + §3.5 (commit 4 명세, ARCHITECTURE.md §10.2 갱신 내용) |
| `docs/phase_b_qa_r11.md` | MINOR-R11-NEW-1 (이미 commit 2 에서 inline 처리 완료, 추가 작업 없음) |
| `staging/docs/phase_b_src_migration_checklist.md` | §1 (Mount + 뷰어 게이트), §9 (R12 atomic 7 commit 체크리스트) |
| `CLAUDE.md` | "파일 삭제 절대 금지" 원칙 + #13/#14 (src/ 수정 예외) |
| 본 문서 (`r12_pr_checkpoint_2026-04-24.md`) | commit 0~2 완료 상태 + commit 3+4 작업 명세 정리 |

---

## 6. 주요 결정사항 메모 (commit 3 진행 전 사장님 결정 필요할 수도)

1. **tests 위치 옵션 A vs B**: A (staging 유지) 권고. 변경 부담 적음.
2. **metadataFreezeMirror.test.ts 처리**: 옵션 a (STAGING_MIRROR_PATH → src/ 변경) 권고. 마커 검증 의미 유지.
3. **ARCHITECTURE.md §10.2 충돌 해결**: 옵션 A (DB 스키마 → §10.3 이동) 권고. R11 Arch §3.5 명세 정확 부합.
4. **commit 3 단일 vs 분할**: R11 Arch 는 단일 권고. 새 Claude 가 자율 판단 (안전성 우선이면 3a/3b/3c 분할 가능, 단 atomic 깨짐).

---

## 7. 새 세션 시작 절차 (이 문서 이후)

**Day 1 - 새 세션 직후:**
1. 본 문서 (`docs/r12_pr_checkpoint_2026-04-24.md`) 전체 정독
2. `git log --oneline -5` 로 현재 branch HEAD 확인 (`71f5d24` commit 2 끝)
3. `git status` 로 변경 없음 확인 (commit 2 후 변경 0)
4. `npx vitest run` 으로 109 passed 재확인 (베이스라인)
5. R11 Arch §3.4 + §3.5 정독
6. commit 3 시작 → 위 §2.5 체크리스트 따라

**예상 시간:**
- commit 3: 30~45분 (가장 큰 작업, 19 파일 + src/ 수정 3개 + shim + config)
- commit 4: 15~20분 (ARCHITECTURE.md §10.2 통합 + cross-reference)
- 사장님 승인 + push + PR: 5분

**총 약 60~70분** 예상.

---

**문서 끝. 새 세션 Claude: 본 문서 + R11 Arch §3.4/§3.5 만 정독하면 commit 3+4 정확히 이어받기 가능. 건투를!**
