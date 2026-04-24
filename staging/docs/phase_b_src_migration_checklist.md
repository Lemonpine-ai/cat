# Phase B → src/ 반영 체크리스트 (R2)

> 작성: Phase B Arch R2 §3.2 요구사항 · R3 §3.1 (Mount JSDoc 이전) · R6 §8 TODO 반영 (T1/T2/T3/T8/T9/T12/T13)
> R7 갱신: §3.1 disable line 번호 (lifecycle 분할 후 8건 위치) · §8 신설 (driver_health 100+ 설계 / R7-S mirror 합치기)
> 대상: staging/ 에서 검증 완료 후 src/ 로 이관하는 PR 리뷰어
> 목적: **뷰어 측 중복 INSERT 차단** (2026-04-22 Supabase pool 고갈 장애 재현 방지)
> 실기기 테스트 가이드: 본 체크리스트의 §1~§6 머지 전 확인 / §7 운영 참조 / **실기기 30분 테스트는 별도 `phase_b_field_test_plan.md` 를 따를 것** (R6 T12).

---

## §0 Dev 판단 보류 정책 (R6 T1, MINOR-R5-NEW-1 해소)

R5 에서 Dev 가 Arch 지시를 "일부 보류" 한 사례 (lifecycle.ts 임시 console.log 4줄 삽입 미실시)
를 계기로 정책을 명문화. R7+ Dev 가 같은 상황에 부딪힐 때 이 §0 를 참조.

**Dev 가 Arch 지시를 단독으로 보류하려면 아래 3조건을 모두 만족해야 한다:**

1. **테스트 회귀 증거가 명확** — Dev 가 로컬 `vitest run` 으로 "지시대로 삽입 시 N건 테스트 실패"
   같은 구체 증거를 확보한다. "왠지 깨질 것 같다" 수준은 해당 없음.
2. **대체 산출물이 self-sufficient** — 삽입을 보류하는 대신 가이드 / code-block / 문서만으로도
   목적을 달성 가능 (예: 실기기 paste 가이드, config 템플릿). Arch 의 원래 의도가 "어떤 형태로든"
   유지되면 OK.
3. **QA 리포트에 사유 3줄 기록** — "무엇을 보류했는지 / 왜 보류했는지 / 대체 산출물이 무엇인지"
   를 QA 가 볼 수 있는 곳 (QA 리포트 또는 체크리스트) 에 남긴다.

**3조건 중 하나라도 부족하면 반드시 Arch 에 질문 후 진행.** 단독 결정 금지.

---

## §1 플래그 ON 전 필수 작업

- [ ] `src/hooks/useBehaviorDetection.ts` 의 `onBehaviorChange` 호출부를 다음과 같이 게이트:
      ```ts
      onBehaviorChange: isYoloV2Enabled() ? undefined : existingHandler
      ```
      (또는 `isViewer` 옵션을 훅에 추가하고 상위에서 true 로 주입)
- [ ] `src/app/camera/view/*` 에서 `useBehaviorDetection` 을 import 하는 곳을 모두 찾아
      동일 게이트 적용 (`grep -r "useBehaviorDetection(" src/app/camera/view/`).
- [ ] 방송폰 경로 (`src/app/camera/broadcast/CameraBroadcastClient.tsx`) 에
      `<CameraBroadcastYoloMount />` 한 줄 추가. flag 분기는 Mount 컴포넌트 내부에서 수행.
- [ ] `src/hooks/useBehaviorDetection.ts` 에 `armBehaviorLogger("viewer")` 호출 추가 —
      onBehaviorChange 가 실제로 주입된 경로에서만 arm (dev 전용 sentinel).
- [ ] `NONE_KEY` 공통 상수화 (R3 이관 항목) — `src/hooks/useBehaviorDetection.ts` line 48,
      `src/hooks/useBehaviorEventLogger.ts` line 82 에 하드코딩된 `"__none__"` 을
      `staging/lib/behavior/confirmFrames.ts` 의 `NONE_KEY` import 로 통일.

### §1.1 Vercel 배포 체크 (R5 Arch §7.3 MAJOR-R5-E 강화)

CLAUDE.md 교훈 #6 재발 방지 — `NEXT_PUBLIC_*` 은 빌드타임 주입이라 env 만 바꾸고 redeploy
안 하면 적용 안 됨. 2026-04-22 사고 (flag ON 후 실제 프로덕션은 이전 에러 빌드) 재발 차단.

- [ ] Vercel env `NEXT_PUBLIC_CAT_YOLO_V2=1` 설정.
- [ ] env 변경 후 **빈 커밋** 강제 재빌드:
      `git commit --allow-empty -m "chore: redeploy for NEXT_PUBLIC_CAT_YOLO_V2"` → push.
- [ ] Vercel MCP `getDeployments` 로 `readyState: "READY"` + `readySubstate: "PROMOTED"` 확인.
- [ ] 배포 완료 후 사장님 실기기에서 `console.log(process.env.NEXT_PUBLIC_CAT_YOLO_V2)` 가
      `"1"` 인지 브라우저 DevTools 에서 직접 확인 (빌드타임 치환 검증).
- [ ] Vercel Instant Rollback 대상 commit ID 메모: `<이전 PROMOTED commit 40자>`.
- [ ] **(R11 D2 / R12 PR 사전 검증)** Vercel MCP `getDeployments` → 최신 deployment 가
      `readyState: "READY"` + `readySubstate: "PROMOTED"` + buildError 0건 인지 PR 머지 **직전**
      최종 확인. CLAUDE.md 교훈 #4 (빌드 READY 미확인 상태에서 테스트 시작 금지) 재발 방지.
- [ ] **(R11 D2 / R12 PR 사전 검증)** `curl -I -H "Origin: https://whatnyan.com" $NEXT_PUBLIC_YOLO_MODEL_URL`
      → `HTTP/2 200` 응답 + CORS 헤더 (`Access-Control-Allow-Origin` + `Vary: Origin`) 동시 확인.
      R2 CORS 정책이 사이 변경됐을 가능성 차단 (R12 PR 머지 시점 마지막 재확인).
- [ ] **(R11 D2 / R12 PR 사전 검증)** R12 PR 머지 commit ID(40자) 별도 메모 —
      "이전 PROMOTED commit" 과 **두 줄 분리 기록**. 본 PR 문제 발생 시 즉시 Instant Rollback
      타겟. 예: `R12 PR commit = <40자>` / `이전 PROMOTED (Phase A 완료) = 354f6dd...`.

### §1.2 ONNX 모델 파일 사전 검증 (R5 Arch §7.1 CRITICAL-R5-C)

`.gitignore` 가 `public/models/*.onnx` 를 제외 → flag ON 후 Worker 가 fetch 시 404 → 전원 failed
시나리오 차단. 자세한 배포 옵션은 §7.6 참조. 본 항목은 **사전 200 응답 확인**.

- [ ] `curl https://<vercel-url>/models/cat_behavior_yolov8n.onnx -I` → `HTTP/2 200` 확인.
      **이 확인 없이 flag ON 하지 말 것 — Worker init 실패로 전원 failed 됨 (CRITICAL).**

### §1.3 Worker URL / import 경로 재작성 (R5 Arch §7.2/§7.4)

staging → src 이관 시 상대경로/Worker URL 패턴 회귀 방지.

- [ ] `staging/workers/yoloInference.worker.ts` → `src/workers/yoloInference.worker.ts` 이동
      (또는 `src/lib/workers/`). `useYoloWorkerLifecycle.ts` 의
      `new URL("../workers/yoloInference.worker.ts", import.meta.url)` 경로가 새 위치에서
      동일 깊이로 유효한지 확인.
- [ ] Next.js App Router + Turbopack 에서 `new Worker(new URL(...), { type: "module" })`
      패턴이 빌드타임에 별도 chunk 로 emit 되는지 `pnpm build` →
      `.next/static/chunks/` 디렉터리 확인 (회귀 방지).
- [ ] **(R8 §4 / R7 QA #4)** `pnpm build` 후 dev 배지가 prod chunk 에 누출 안 됐는지 확인:
      ```bash
      pnpm build && grep -r "YoloDriverDiagBadge" .next/static/chunks/ | wc -l
      ```
      결과 = `0` 이어야 한다. > 0 이면 NODE_ENV 가드가 tree-shake 안 됨 → src/ 반영 PR 머지 금지.
      `staging/components/YoloDriverDiagBadge.tsx` 의 prod 가드 (`process.env.NODE_ENV === "production"` return null)
      가 빌드타임에 dead code elimination 되어야 정상.
- [ ] 모든 staging/ → src/ 이동 후 `pnpm build` + `pnpm test` 통과 확인.
      import 경로 재작성 목록을 이관 PR description 에 첨부.

### §1.4 baseline 기록 + 모니터링

- [ ] Supabase MCP 로 `cat_behavior_events` row 수 baseline 기록
      (`SELECT count(*) FROM cat_behavior_events;`).
- [ ] 방송폰 1대 24시간 모니터링 (row 증가율 / Realtime pool 소진 여부).
- [ ] **(R11 D5 / MINOR-R10-NEW-1 / R12 PR 후 재검토)** T7 (yoloLatencyTracker prev-equal skip)
      case 5 expectation 완화 ("= 0" → "≤ 1") 의 React 19 prod 빌드 환경 동작 확정.
      R12 PR 머지 + commit 7 사장님 실기기 테스트 후 React 19 prod commit 동작 실측 시점에 재검토.
      옵션:
      · "정확히 1회 발생" 확인 시 → `expect(renderCount - rendersAfterFirstFlush).toBe(1)` 정확값 검증
      · "0~1회 변동" 확인 시 → 현 ≤1 명세 유지 + 코드 주석에 React 19 환경 명시 (line 138-142)
      참조: `docs/phase_b_qa_r10.md` MINOR-R10-NEW-1 / `docs/phase_b_arch_r11.md` §5.

## §2 사용 예시 (방송폰 mount JSX)

`CameraBroadcastYoloMount` 를 `src/app/camera/broadcast/CameraBroadcastClient.tsx` 에서 사용하는 최소 스니펫
(Mount JSDoc 에서 R3 단축 이전 — m-R2-C):

```tsx
{isYoloV2Enabled() && isBroadcasting && (
  <CameraBroadcastYoloMount
    videoRef={localVideoRef}
    homeId={homeId}
    cameraId={cameraId}
    identifiedCatId={catId}
    supabaseClient={supabase}
    motionActive={hasMotion}
  />
)}
```

사용처: `src/app/camera/broadcast/CameraBroadcastClient.tsx` (방송폰 Live 페이지).
`isYoloV2Enabled()` 는 `staging/lib/behavior/yoloV2Flag.ts` 에서 import.
`isBroadcasting` 은 상위에서 WebRTC 방송 진행 여부를 판단한 boolean.

## §3 플래그 ON 직후 30분 관찰

- [ ] 뷰어 탭에서 DB INSERT 가 0건임을 SQL 로 확인 (중복 기록 없음):
      ```sql
      SELECT camera_id, count(*)
        FROM cat_behavior_events
       WHERE detected_at >= now() - interval '30 minutes'
       GROUP BY camera_id;
      ```
- [ ] 방송폰에서만 INSERT 발생하는지 `camera_id` 분포 확인.
- [ ] Supabase DB pool 사용률 60% 이하 유지 (Supabase Dashboard → Reports).
- [ ] 브라우저 콘솔에서 `[CATvisor][loggerArmGuard]` 경고 0건 확인 (dev 환경).
- [ ] **(R9 §6)** Phase B src/ 반영 PR 머지 후 Vercel env 에 `NEXT_PUBLIC_YOLO_STABLE_READY_MS` 등록 검토:
      ```bash
      vercel env add NEXT_PUBLIC_YOLO_STABLE_READY_MS  # default 60000, iOS 저사양 시 90000 등
      ```
      미등록 시 lifecycle.ts 의 default 60_000 ms 가 사용됨. R10 사장님 실기기 후 임계값 조정.
- [ ] **(R10 §2 / R11 PR)** Phase B src/ 반영 PR 안에서 `src/hooks/useBehaviorEventLogger.ts` metadata 블록을
      mirror 와 동일 가드로 갱신: `top2_confidence` / `bbox_area_ratio` 의 `typeof === "number"` →
      `Number.isFinite(v)` 변경 (NaN/Infinity 시 key omit). mirror 와 1:1 동치 유지
      (metadataFreezeMirror.test.ts 가 양쪽 마커 검증).
- [ ] **(R10 §2 / R11 PR)** mirror 본체 가드 변경에 맞춰 마커 `r7-1` → `r10-1` 갱신 3 곳 동시:
      · `staging/lib/behavior/buildBehaviorEventMetadata.ts` line 22
      · `staging/tests/metadataFreezeMirror.test.ts` MARKER 상수 (line 21)
      · `src/hooks/useBehaviorEventLogger.ts` 의 mirror 마커 line
      (R10 시점 staging 본체 가드만 추가, 마커는 R11 src/ PR 안에서 atomic 갱신.)
- [ ] **(R11 D2 / R12 PR 진행 안내)** 위 3건 (R10 §2 logger 동기화 + 마커 r10-1 + ARCHITECTURE.md §10.2)
      은 R12 PR 의 atomic 7 commit 으로 분리 진행 — 본 체크리스트 §9 의 commit 1+2+4 참조.
      §9 가 각 commit 의 PRE/POST/롤백 트리거 + 머지 절차 + 운영 모니터링 모두 명세.
- [ ] **(R10 §4 / R11 PR)** `docs/ARCHITECTURE.md` §10.2 갱신 (현 "Phase B 계획" 1 단락 → "구현 완료" + 4 부속 절):
      · 10.2.1 훅 합성 패턴 (driver = lifecycle + sampling + driverHealth + Phase A logger 주입)
      · 10.2.2 ref-forward callback wrapper 패턴 (staging/docs/phase_b_ref_forward_pattern.md §1~§4 흡수)
      · 10.2.3 metadata freeze 약속 (4 필드 + R10 §2 NaN/Infinity 가드)
      · 10.2.4 환경변수 (NEXT_PUBLIC_CAT_YOLO_V2 / NEXT_PUBLIC_YOLO_MODEL_URL / NEXT_PUBLIC_YOLO_STABLE_READY_MS)
      흡수 후 staging 문서는 cross-reference 유지 (`> 본 문서는 ARCHITECTURE.md §10.2.2 로 통합됨`) 또는 archive.

### §3.1 R4 이관 — `.eslintrc` 일괄 off (M1 옵션 C)

staging 단계는 `eslint-disable-next-line react-hooks/set-state-in-effect` 주석으로 처리 (Arch R4 §1.3 옵션 A).
src/ 반영 PR 에서 다음을 일괄 처리:

- [ ] 루트 `.eslintrc` 에 `"react-hooks/set-state-in-effect": "warn"` (또는 `"off"`) 추가.
- [ ] `eslint-disable-next-line react-hooks/set-state-in-effect` 주석 일괄 제거 (총 8건).
      R5 §1.2 실측 정정 (R4 까지 "Phase A 5곳 + Phase B 2곳" 으로 부정확 표기되었던 항목):
      - Phase A 활성 disable (2건) — staging → src 이관과 무관, src/ 직접 수정:
        · `src/components/catvisor/RecentCatActivityLog.tsx` line 223
        · `src/features/diary/components/DiaryPageClient.tsx` line 245
      - Phase B 활성 disable (8건, staging → src 이관 후 경로 조정. R7 분할 후 위치 갱신):
        · `useBroadcasterYoloDriver.ts` 의 disabled reset effect 3곳 (line 349/351/355)
        · `useYoloWorkerLifecycle.ts` 의 disabled reset 3곳 (line 288/290/293)
        · `useYoloLatencyTracker.ts` 의 disabled 경로 2곳 (line 140/142) — R7 §1 분할로 lifecycle 의
          R6 T4 latency flush 가 tracker 로 이전된 결과
      - **line 번호 기록 규칙 (R6 T2, MINOR-R5-NEW-2 해소):** Arch 는 체크리스트에 line 번호를 쓸 때
        반드시 `grep -n "eslint-disable-next-line react-hooks/set-state-in-effect" staging/hooks/*.ts`
        실측 직후 기록할 것. "기준" / "인접 라인" / "대략" 같은 완충어 금지. 숫자는 정확해야 한다.
        Dev/QA 는 Arch 원문을 복사하지 말고 staging 코드 grep 으로 재확인 후 반영한다.
      - Phase A 주석만 (disable 없음, 그대로 유지):
        · `src/hooks/useLandscapeLock.ts` line 35 — lazy init 회피 주석
- [ ] 규칙 off 시 대체 안전 장치: production 빌드에서만 `StrictMode` 이중 렌더 감시로 무한 루프 감지.

## §4 롤백 경로

- [ ] Vercel Instant Rollback 대상 commit ID 메모.
- [ ] env 를 `"0"` 으로 되돌리고 빈 커밋 push (DB 변경 없음 → 데이터 보존).
- [ ] 롤백 후 `cat_behavior_events` 의 최근 30분 row 가 "방송폰만" 쓰인 상태인지 재검증.

## §5 R3 이관 항목 (이 체크리스트에서 다루지 않음)

- [ ] `NONE_KEY` 공통 상수 모듈 분리 PR (위의 "공통 상수화" 와 중복 추적용).
- [ ] `initStatus === "failed"` 시 UX 결정 (토스트 / flag 자동 OFF / 아무것도 안 함).
- [ ] vitest 의 onnxruntime-web worker mock 설정 — 현재 테스트는 순수 함수 단위.
- [ ] `model_version` "v1" → `"yolov8n-v1.0-20260424"` 교체 시점 (사장님 승인).

## §6 R5+ 이관 항목 (Arch R4 발견 MINOR 6건)

Arch R4 §3~§6 에서 발견되었으나 R4 범위 밖으로 남긴 항목. src/ 반영 PR 에서 확인:

- [ ] **R4-a** (sampling cleanup race): `useYoloSampling.ts` `startInterval` 위에 주석
      "strict mode 이중 mount 시에도 `intervalRef` single guard 로 안전" 1줄 추가.
- [ ] **R4-b** (frameId overflow): `frameIdRef` 는 2백만/년, JS Number 안전범위 (2^53) 도달 28만년 — 실용상 안전.
      문서화만 (Arch R4 §3.3 MINOR 하향).
- [ ] **R4-e** (첫 tick 즉시 발사): `useYoloSampling.ts` `startInterval` 에 interval 시작 직후
      `void tickFn()` 선반영 호출 검토 — UX 미세 개선 (Arch R4 §4.1).
- [ ] **R4-f** (NONE row 저장): Phase C 다이어리가 NONE 구간 UI 를 요구하는지 Phase C Arch 와 합의.
      요구 시 driver 의 cleared 시 "NONE row" INSERT 추가 (Arch R4 §5.1).
- [ ] **R4-g** (cameraId 변화 reset): `useBroadcasterYoloDriver.ts` 에 `useEffect(() => { ... }, [cameraId])`
      reset effect 추가. 실사용 우선순위 낮음 (Arch R4 §6.1).
- [ ] **R4-h** (Worker terminate vs dispose 순서): onnxruntime-web 공식 문서 확인 또는 Playwright 통합
      테스트로 GPU 자원 해제 검증 (Arch R4 §6.2).
- [ ] **R4-i** (prod 환경 loggerArmGuard no-op): Supabase 트리거로 서버측 동시 로거 감지 검토
      (Arch R4 §6.3).

---

## §7 Phase C 호환성 + 운영 가이드 (R5 Arch 신설)

R5 Arch §3~§7 에서 발견된 항목을 한 곳에 모은다. 본 §7 은 **체크리스트** 라기보다는
"src/ 반영 PR 리뷰어 + 사장님 실기기 테스트 시 참조용 가이드". §1~§6 는 PR 머지 전 확인,
§7 은 PR 머지 후 운영/검증 시 참조.

### §7.1 metadata 컬럼 역할 분리 (R5 Arch §3.3 MAJOR-R5-A)

driver → logger INSERT 시 채우는 다음 metadata 필드의 사용 경로 명확화:

| 필드 | 채우는 곳 | 사용 경로 | Phase C diary 가 읽음? |
|------|-----------|----------|----------------------|
| `metadata.model_version` | logger 항상 채움 ("v1") | Phase E archive vs active 분류 키 | ❌ |
| `metadata.top2_class` | driver detection 에 있을 때만 | Phase D 라벨링 UX (오탐 후보 표시) | ❌ |
| `metadata.top2_confidence` | driver detection 에 있을 때만 | Phase D 라벨링 UX | ❌ |
| `metadata.bbox_area_ratio` | driver detection 에 있을 때만 | Phase D 라벨링 UX (멀리 있는 고양이 필터) | ❌ |

**핵심:** `src/features/diary/lib/behaviorEventsToDiaryStats.ts` 는 5개 컬럼만 SELECT
(`behavior_class`, `confidence`, `detected_at`, `ended_at`, `user_label`). metadata 는
**현재 전혀 참조하지 않음**. Phase D 라벨링 UI + Phase E 30일 후 archive 분류에서만 사용.

**INSERT 비용:** row 당 ~100 bytes (JSONB serialization). 베타 7명 × 1,000 row/일 ×
100 bytes = 25 MB/월 — Supabase Free tier 500MB 제한 기준 5%. 문제 아님.

**Phase C 가 metadata 인사이트를 요구하게 되면 Phase C Arch 에서 별도 설계** (driver/logger
변경 없이 집계 SQL 만 추가). 본 라운드는 옵션 1 (현 설계 유지) 채택.

**R6 freeze 선언 (T8):** 위 metadata 4 필드 (`model_version` / `top2_class` / `top2_confidence` /
`bbox_area_ratio`) 는 **Phase D 착수 시점까지 스키마 고정**. 변경 필요 시 Phase D Arch 와
사전 합의 필수. driver 는 metadata 를 조립하지 않는다 — logger 가 detection 에서 직접 읽는다
(현 구조 유지). `cleared` 경로 (R6 T10) 는 logger 가 `UPDATE ended_at` 만 호출하고 **metadata 는
건드리지 않는다** (case B 유지, 새 row INSERT 없음).

### §7.2 NONE row 저장 여부 (R4 MINOR-R4-f 유지)

현 driver 는 `cleared` 상태 시 `setCurrentBehavior(null)` 만 호출 → logger 가 이전 row close,
새 row 안 만듦. Phase C 가 "고양이 없음" 구간을 UI 에 표시하려면 **클라이언트 gap 계산**
또는 SQL 집계 필요. Phase C Arch 와 합의 필요. 현재 기본값 "NONE row 안 만듦"
(전환 시점 INSERT 원칙 준수).

### §7.3 STABLE_READY_MS 60s 실기기 검증 가이드 (R5 Arch §2.3 권고 3)

R4 §3.1 MAJOR-R4-A 에서 도입된 `STABLE_READY_MS = 60_000` (lifecycle.ts line 55).
60초 유지 후에야 retry 카운터 리셋. 사장님 실기기 30분 테스트 후 30/60/90/120s 중
최종 값 결정.

**임계값 후보 판단표:**

| 임계값 | 근거 | 리스크 | 적합 시나리오 |
|--------|------|--------|--------------|
| **30s** | backoff 1회분과 동일 | **보호 효과 제로** (ready 직후 crash 시 카운터 즉시 0 → 다시 1 → 영원히 30s 주기 crash loop) | 기각 — 설계 의도 깨짐 |
| **60s** (현재) | backoff 30s × 2 누적 시간 이상 | 모바일 WebGPU init 60s+ 시 "정상 로딩 중" 을 "불안정" 으로 오판 가능 | **베타 기본값** |
| **90s** | WebGPU init + 첫 추론 사이클까지 여유 | 진짜 crash 시 사용자가 90s 동안 증상 감지 못함 | iPhone 구형 (iOS 17 이하) + WebGL fallback |
| **120s** | 2분 — 확실히 "정상 로딩" 구간 포함 | 모든 retry 대응 2분 지연 → UX 답답함 ↑ | 베타 종료 후 프로덕션 |

**실기기 30분 로그 수집 절차:**

1. 준비:
   - Vercel env `NEXT_PUBLIC_CAT_YOLO_V2=1` ON 후 READY + PROMOTED 확인.
   - 방송폰 (iPhone) 1대 + 뷰어폰 1대. 30분 방송 연속.
   - lifecycle.ts 에 임시 `console.log` 4줄 (R6 이후 제거):
     ```ts
     // ready 핸들러 직후
     console.log("[Lifecycle] ready backend=" + msg.backend +
                 " retryAttempt=" + retryAttemptRef.current);
     // handleWorkerError 핸들러 시작
     console.log("[Lifecycle] error crash#" + (retryAttemptRef.current + 1));
     // stableReady 타이머 콜백 내부 (retryAttemptRef.current=0 직전)
     console.log("[Lifecycle] stableReady timer fired → retryAttempt=0");
     // worker effect 내부 new Worker 직후
     console.log("[Lifecycle] new worker spawn (retryGen=" + retryGen + ")");
     ```

2. 판정 기준:
   - **60s 적정 (현 설정 유지):** 30분 내 `stableReady timer fired` 발생 횟수 = 정상 ready 횟수.
     즉 crash 가 60초 내 재발하지 않음.
   - **60s 부족 (90s+ 로 상향):** 30분 내 `stableReady timer fired` 이후 30-60초 안에
     `error crash` 가 반복되는 패턴 발견 시. WebGPU 초기화 직후 불안정 증거.
   - **60s 과도 (30s 하향):** 30분 내 `crash → retry → ready → crash` loop 자체가 한 번도
     발생 안 함. 실제 운영 시 60s 타이머는 무의미. 단 보수적으로 유지 권장.

3. 조정 방법 (R6 Dev 가 수행):
   - `staging/hooks/useYoloWorkerLifecycle.ts` line 55 `STABLE_READY_MS = 60_000` →
     30_000 / 90_000 / 120_000 교체.
   - 테스트 값도 동시 조정 — `staging/tests/yoloWorkerLifecycle.test.ts` 의
     "ready 후 60초 유지" 테스트 + "59_999ms / 60_001ms 경계" 테스트 (R5 신규 2건) 의
     숫자 일괄 교체.
   - `docs/phase_b_arch_r6.md` 에 조정 사유 + 실측 로그 스니펫 기록.

### §7.4 iOS Safari 실기기 호환 (R5 Arch §4 MINOR-R5-d/e/f)

- **Backend fallback**: webgpu (iOS 18+ preview만) → webgl (iOS 15+ OK) → wasm (iOS 16.4+ SIMD).
  실기기 iOS 테스트 시 `DriverResult.backend` 가 `webgl` 또는 `wasm` 으로 수렴하는지 확인.
- **createImageBitmap**: iOS 15+ OK. iOS 14 이하는 베타 지원 대상 아님.
- **navigator.getBattery**: iOS 미지원. scheduler 가 typeof 가드로 default regime 동작 (현 코드 OK).
- **iOS PWA 모드 visibilitychange**: 홈 화면 추가 후 백그라운드 전환 시 JavaScript 실행이
  즉시 멈출 수 있음 (탭과 다른 정책). foreground 복귀 시 stale interval 재시작 우려 →
  Phase C/Playwright 통합 테스트로 검증 권고.
- **inference 시간 측정**: 사장님 iPhone 으로 방송 5분 후 `health.inferSuccesses / ticksTotal`
  비율 > 0.8 확인. 1회 inference 가 2초 초과 시 regime="night" 고정 검토.
- **WASM threaded**: COOP/COEP 헤더 미설정 시 single-thread fallback. Vercel 기본 배포에는
  COOP/COEP 없음 → 자연스럽게 single-thread. 문제 없음.

### §7.5 장시간 + 네트워크 통합 모니터링 (R5 Arch §5/§6 MAJOR-R5-B / MINOR-R5-g/h/i/j)

사장님 실기기 30분 방송 중 다음 항목 동시 확인:

- [ ] `health.inferSuccesses / ticksTotal` 비율 > 0.8 (iOS 성능, §7.4).
- [ ] `initStatus="ready"` 유지, `retryAttempt=0` 유지 (STABLE_READY_MS 검증, §7.3).
- [ ] backend 값이 iPhone 에서 `webgl` 또는 `wasm` 으로 수렴 (§7.4).
- [ ] localStorage `pending_behavior_events` 값이 0 또는 20 이하 유지 (quota 5MB 의 1% 이내).
- [ ] Supabase MCP `cat_behavior_events` row 증가율이 분당 10 이하 (flush 폭증 감지).
- [ ] iOS PWA 모드 시 visibilitychange 동작 — 백그라운드 1분 후 복귀 시 정상 재개 (MINOR-R5-e).
- [ ] 콘솔 `[Lifecycle] stableReady timer fired` 메시지 확인 (§7.3).
- [ ] Supabase Dashboard → Realtime 채널 수 < 50 유지 (뷰어 동시접속 × 1ch, 100 한도의 50%) (R6 T13).
- [ ] dev 배지 `inferLatencyP95Ms < 1000ms` 확인 (R6 T4 — hover 툴팁 수치).

**탭 throttle (MAJOR-R5-B):** 방송폰이 일시적으로 inactive 상태가 되면 setInterval 이 1Hz 로
throttle. health flush 2초 → 최대 1초 지연. driver 는 계속 tick 시도하지만 throttled.
**베타 범위 (사장님 1대 foreground 유지)에서는 영향 낮음**. 프로덕션 100명 시 재검토 —
`document.hasFocus()` 폴링으로 focus loss 감지 후 driver 일시 중지 설계 후보.

**Screen Wake Lock API (R6 T9, H MINOR):**

방송폰이 30분+ 장시간 방송 시 OS 기본 화면 꺼짐 (Android 1~5분 / iOS 1분~never) 으로
WebRTC 방송과 YOLO driver 가 throttle/중단되는 문제를 방지한다.

- **브라우저 호환성:**
  - Android Chrome 84+ : 지원 (WebRTC / YOLO 둘 다 백그라운드에서도 영향 최소)
  - iOS Safari 16.4+ : 지원 (그 이하 버전은 홈 화면 추가 PWA 모드에서도 미지원)
  - 미지원 기기는 `navigator.wakeLock` undefined → try-catch 로 graceful degrade.
- **권고 호출 위치 (src/ 반영 시):**
  - `src/app/camera/broadcast/CameraBroadcastClient.tsx` 의 방송 시작 시점에
    `navigator.wakeLock?.request("screen")` 호출 → 반환 `WakeLockSentinel` 을 ref 에 보관.
  - 방송 중지 시 `sentinel.release()` 호출.
  - visibilitychange `visible` 복귀 시 재요청 (iOS 는 hidden 전환 시 자동 해제됨).
- **staging 단계는 코드 미반영 — 문서화만.** src/ 반영 PR 에서 `CameraBroadcastYoloMount` 가
  아닌 `CameraBroadcastClient` 레벨에서 반영하는 것이 적절 (#13 원칙의 staging/ 경계를
  벗어나므로 Phase B 범위 밖).
- **베타 우회책:** 사장님이 Android 개발자 옵션 "화면 꺼짐 안 함" ON 으로 수동 회피. 실기기
  테스트 플랜 (`phase_b_field_test_plan.md`) 의 준비 체크리스트에 포함.

**WebRTC 끊김 시 driver 동작:** `enabled` 는 motionActive + homeId/cameraId 로 결정,
WebRTC connection state 와 무관. WebRTC 끊겨도 driver 는 계속 inference + 오프라인 큐로
보존. `isBroadcasting` 판정 기준 (Mount 외부 조건) 은 src/ 반영 PR 에서 Phase A WebRTC
코드 기준으로 결정.

### §7.6 ONNX 모델 파일 외부 CDN 배포 — 옵션 C-1 Cloudflare R2 **확정** (R6 T3)

`.gitignore` line 63/70 가 `public/models/*.onnx` 를 git tracked 에서 제외.
로컬에 `cat_behavior_yolov8n.onnx` 가 있어도 **Vercel 배포에 미포함** → flag ON 시
`/models/cat_behavior_yolov8n.onnx` fetch → 404 → onnxruntime init 실패 → retry 지옥
→ MAX_RETRIES 소진 → `initStatus="failed"`.

**팀장 결정 (R6): 옵션 C-1 Cloudflare R2 채택.** 기존 R5 §7.6 의 옵션 A (Git LFS) / B
(Supabase Storage) 는 아래 비교 끝에 기각:

| 항목 | A Git LFS | B Supabase Storage | **C-1 Cloudflare R2** |
|------|-----------|--------------------|----------------------|
| 월 0.3MB × 10-100명 대역폭 | GitHub Free 1GB/월 (Team 필요) | Free 5GB/월 | Free 10GB/월 (egress 무료) |
| 저장소 리포 크기 영향 | LFS 트래킹 메타 추가 | 영향 없음 | 영향 없음 |
| Vercel 빌드 영향 | LFS 체크아웃 | 없음 | 없음 |
| 베타→프로덕션 확장 | Team 업그레이드 필요 | Nano 15 pool 영향 | **무관 (egress 무료)** |
| 팀장 결정 사유 | - | - | 베타~프로덕션 공통 최저 비용, 운영 단순 |

**src/ 반영 PR 체크리스트 (사장님 수동 세팅 필요):**

- [x] **(사장님)** Cloudflare 계정 생성 (Free plan 충분) 및 로그인. **완료 2026-04-24** (Account ID: `0c3fab29df06625771988413d64b7658`)
- [x] **(사장님)** R2 bucket 생성 (`cat-models`, 위치 아시아 태평양 APAC). **완료 2026-04-24**
- [x] **(사장님)** bucket 에 `cat_behavior_yolov8n.onnx` 업로드 (실측 12.27 MB = 12,273,986 bytes, Phase 2A 산출물). **완료 2026-04-24**
- [x] **(사장님)** bucket Settings → **Public Access 활성화** 후 public URL 확보. **완료 2026-04-24**
      → **확정 URL**: `https://pub-e5e4c245235e430f84f088febf07a0c0.r2.dev/cat_behavior_yolov8n.onnx`
- [x] **(사장님)** bucket Settings → CORS 정책 추가. **완료 2026-04-24**:
      ```json
      [{
        "AllowedOrigins": ["https://whatnyan.com", "https://www.whatnyan.com", "https://cat-lac-eight.vercel.app", "http://localhost:3000"],
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedHeaders": ["*"],
        "MaxAgeSeconds": 3600
      }]
      ```
      팀장 실측 (2026-04-24): `curl -I -H "Origin: https://cat-lac-eight.vercel.app"` → HTTP/1.1 200 OK + `Access-Control-Allow-Origin: https://cat-lac-eight.vercel.app` + `Vary: Origin` + Content-Length 12273986 일치 + ETag `239c7ef039a482e611c26d96e527bc9a` + Edge KIX/NRT (한국 빠름).
      추가 실측 (2026-04-24, whatnyan.com 도메인 구매 후): `curl -I -H "Origin: https://whatnyan.com"` → HTTP/1.1 200 OK + `Access-Control-Allow-Origin: https://whatnyan.com` + `Vary: Origin` 확인.
- [ ] **(사장님)** (선택) Cloudflare API Token 발급 → 향후 `wrangler r2 object put` 로 자동
      업로드 시 사용. staging 단계는 대시보드 업로드로 충분. **공개 fetch 에는 토큰 불필요.**
- [ ] **(Dev PR 작업)** Vercel env 에 `NEXT_PUBLIC_YOLO_MODEL_URL` 추가 = 사장님이 확보한
      R2 public URL.
- [ ] **(Dev PR 작업)** `staging/hooks/useYoloWorkerLifecycle.ts` 의 `MODEL_URL` 하드코딩을
      `process.env.NEXT_PUBLIC_YOLO_MODEL_URL ?? "/models/cat_behavior_yolov8n.onnx"` 치환.
      env 미설정 시 local dev fallback 유지 (개발 시 `public/models/` 로컬 파일 사용).
- [ ] **(Dev PR 작업)** `.gitignore` 의 `public/models/*.onnx` 제외 룰은 **유지** — 모델 파일은
      R2 에 올리고 Vercel 배포에는 동봉하지 않는다 (build artifact 축소).
- [ ] **(사장님)** Vercel env 설정 후 빈 커밋 push → READY + PROMOTED 확인 (§1.1 절차).
- [ ] **(사장님)** 배포 완료 후 `curl -I $NEXT_PUBLIC_YOLO_MODEL_URL` → **HTTP/2 200** + CORS 헤더
      확인. 이 확인 전에는 flag ON 금지 (§1.2 와 동일 원칙).
- [ ] **(Dev PR 작업)** Vercel Instant Rollback 대상 commit ID 를 §4 롤백 경로 메모란에 기록.

**R2 장애 / URL 변경 시 롤백:**
- `NEXT_PUBLIC_YOLO_MODEL_URL` env 를 비우거나 이전 값으로 되돌리고 빈 커밋 push.
- 로컬 dev 는 `public/models/cat_behavior_yolov8n.onnx` 로 자동 fallback.

**src/ 반영 PR 전 필수 선행:** 위 "(사장님)" 체크박스 6개 모두 완료 확인 후 Dev 가 PR 작성.
순서가 뒤집히면 배포 후 R2 bucket 없음 → 전원 `initStatus="failed"` (2026-04-22 스타일 장애 재현).

---

## §8 프로덕션 100+ 전환 시 driver_health 테이블 + Edge Function 샘플링 (R7 D1 / R6 §3.4 후속)

R6 §3.4 에서 베타 단계 driver_health row INSERT 는 DB 부하 (베타 7명 × 5s tick × 24h
= 120,960 row/일 × Nano pool 15 한계) 로 **기각**. 프로덕션 100+ 사용자 도달 시점에 이 항목을 재검토.

### §8.1 채택 트리거
- CLAUDE.md §🟣 운영 모드 표 기준으로 사용자 100+ 도달 시점.
- 또는 사장님이 "iOS 실기기 latency 추세를 7일 단위 차트로 보고 싶다" 같은 운영 needs 발생 시.

### §8.2 테이블 설계 (안)

```sql
CREATE TABLE driver_health_samples (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  home_id UUID NOT NULL,
  camera_id UUID NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  backend TEXT,                 -- "webgpu" | "webgl" | "wasm" | NULL
  regime TEXT,                  -- "day-active" | "night" | "idle-throttled"
  init_status TEXT,             -- "idle" | "loading" | "ready" | "failed"
  retry_attempt INT,
  ticks_total BIGINT,
  infer_successes BIGINT,
  infer_failures BIGINT,
  infer_latency_p50_ms NUMERIC,
  infer_latency_p95_ms NUMERIC
);

ALTER TABLE driver_health_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select" ON driver_health_samples FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "owner insert" ON driver_health_samples FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_driver_health_camera_time
  ON driver_health_samples (camera_id, recorded_at DESC);
```

### §8.3 샘플링 주기 / 채널
- **Edge Function**: `POST /api/driver-health` — 클라이언트가 5분에 1회 본인 health snapshot 전송.
- 주기 = 5분 (tick 1초당 X 가 아닌, 사용자당 12 row/시간 → 100명 × 12 × 24 = 28,800 row/일, Nano 한도 내).
- **Realtime 구독 X** — 사장님 차트는 fetch 또는 cron 으로 일별 집계.

### §8.4 driver 측 변경
- `useBroadcasterYoloDriver` 의 health flush effect 에 5분 주기 health snapshot POST 추가.
- 베타 단계는 NEXT_PUBLIC_DRIVER_HEALTH_REPORT=0 (default OFF) 로 비활성.

### §8.5 R7-S — logger metadata 조립 블록 mirror 합치기 (R7 §4 옵션 R 후속)

- [ ] **R7-S** (R7 §4 옵션 R 후속): src/ 반영 PR 시 `staging/lib/behavior/buildBehaviorEventMetadata.ts`
      를 `src/lib/behavior/` 로 이전 + `src/hooks/useBehaviorEventLogger.ts` line 225-236 을
      `buildBehaviorEventMetadata(detection, BEHAVIOR_MODEL_VERSION)` 호출 1줄로 치환.
      #14 예외 적용: atomic deploy (단일 PR), Vercel READY+PROMOTED 확인, Rollback 경로 메모.
      양 파일에 `// metadata-freeze-spec: r7-1` 마커 보존 (정합성 grep 검증).

---

## §9 R12 PR atomic 7 commit 체크리스트 (R11 D4 신설 — Arch §3.1~§3.10)

R11 PASS 후 R12 src/ PR 진행 시 본 §9 의 7 commit 순서 + 각 commit 의 PRE/POST/롤백 트리거를
순차 실행. 단일 PR 안에 commit 1~4 atomic 머지, commit 5~7 은 머지 후 별도 작업.
참조: `docs/phase_b_arch_r11.md` §3 (R12 Arch 가이드 1,348 LOC 본체).

### §9.1 commit 1 — 마커 r7-1 → r10-1 갱신 (3곳 동시)

- [ ] **PRE**: R11 PASS 9/9 + `git diff src/` = R8 마커 1줄만 + 새 branch (`feat/phase-b-src-r12`)
- [ ] **DO**: 3 파일 동시 단일 commit:
      · `staging/lib/behavior/buildBehaviorEventMetadata.ts` line 22 → `r10-1`
      · `staging/tests/metadataFreezeMirror.test.ts` line 21 (MARKER 상수) → `r10-1`
      · `src/hooks/useBehaviorEventLogger.ts` line 225 → `r10-1`
- [ ] **POST**: `grep -n "r10-1" src/ staging/` 3건 / `grep -n "r7-1" src/ staging/` 0건 /
      `npx vitest run staging/tests/metadataFreezeMirror.test.ts` PASS
- [ ] **롤백 트리거**: 3 파일 중 1건 r7-1 잔존 → mirror.test it 2 strict fail → CI 차단 →
      즉시 `git revert HEAD` (commit 1 단독)

### §9.2 commit 2 — src/ logger 본체 NaN 가드 (Number.isFinite + key omit)

- [ ] **PRE**: commit 1 완료 + `git diff src/hooks/useBehaviorEventLogger.ts` = 마커 1줄만
- [ ] **DO**: `src/hooks/useBehaviorEventLogger.ts` line 225-236 metadata 조립 블록의
      `typeof === "number"` → `Number.isFinite` 변경 (top2_confidence + bbox_area_ratio 2건).
      mirror (`buildBehaviorEventMetadata.ts`) 와 1:1 동치 유지.
- [ ] **POST**: `grep -n 'typeof.*=== "number"' src/hooks/useBehaviorEventLogger.ts` 0건 /
      `grep -n "Number.isFinite" src/hooks/useBehaviorEventLogger.ts` 2건 /
      `npx vitest run` 109 passed / `pnpm build` 통과
- [ ] **롤백 트리거**: vitest fail (mirror 동치 깨짐) 또는 pnpm build TS 에러 → `git revert HEAD`

### §9.3 commit 3 — staging → src/ 이관 (모든 staging 코드 일괄 + R7-S 합치기)

- [ ] **PRE**: commit 1+2 완료 + 모든 staging 파일 R10 PASS 상태 (LOC 한도 + tsc + vitest 109)
- [ ] **DO**: staging/hooks/* (6) + components/* (2) + lib/behavior/* (5) + workers/* (1) +
      tests/* (10) → src/ 또는 src/__tests__/ 일괄 이전. import 경로 재작성. R7-S mirror 합치기
      (src/ logger 가 buildBehaviorEventMetadata 호출). tsconfig.staging-check.json + vitest.config.ts
      정리 (include 비우기 또는 src/ 경로로 갱신). `<CameraBroadcastYoloMount />` 추가 +
      `useBehaviorDetection` 뷰어 게이트 추가.
- [ ] **POST**: `pnpm build` 통과 + `pnpm test` 109 passed + `find staging/ -name "*.ts" -o -name "*.tsx"` 0건 +
      `grep -r "from \"./staging/" src/` 0건
- [ ] **롤백 트리거**: pnpm build/test fail → 해당 파일만 fix-up commit (commit revert 가 아님).
      회복 불능 시 commit 3 통째 revert + 단계 분할 (hooks 먼저 / components 나중에).

### §9.4 commit 4 — ARCHITECTURE.md §10.2 통합 + ref_forward cross-reference

- [ ] **PRE**: commit 1~3 완료 + 현 ARCHITECTURE.md §10.2 가 "Phase B (계획)" 1 단락만
- [ ] **DO**: ARCHITECTURE.md §10.2 → "구현 완료" + 4 부속 절 추가
      (10.2.1 훅 합성 / 10.2.2 ref-forward / 10.2.3 metadata freeze / 10.2.4 환경변수).
      `staging/docs/phase_b_ref_forward_pattern.md` 헤더에 cross-reference 1줄
      (`> 본 문서는 ARCHITECTURE.md §10.2.2 로 통합됨, R12 PR 시점`).
      staging/docs/phase_b_*.md 헤더에 R12 PR 완료 표시.
- [ ] **POST**: `grep -n "10.2.1\|10.2.2\|10.2.3\|10.2.4" docs/ARCHITECTURE.md` 4건 /
      staging/docs/ 3개 .md 모두 보존 (cross-reference 추가만, 삭제 0)
- [ ] **롤백 트리거**: ARCHITECTURE.md Markdown 깨짐 → `git revert HEAD` 후 재작성.
      staging 문서 삭제 시도 발견 → 즉시 중단 (CLAUDE.md "파일 삭제 절대 금지" 위반).

### §9.5 commit 5 — Vercel ENV 3개 등록 + 빈 커밋 (사장님 작업, 머지 후)

- [ ] **PRE**: commit 1~4 PR 머지 완료 (master 적용) + Cloudflare R2 §7.6 사장님 6 체크박스 모두 [x]
- [ ] **DO**: Vercel ENV 3개 등록 (`NEXT_PUBLIC_CAT_YOLO_V2=0` 안전 default /
      `NEXT_PUBLIC_YOLO_MODEL_URL=https://pub-e5e4c245235e430f84f088febf07a0c0.r2.dev/cat_behavior_yolov8n.onnx` /
      `NEXT_PUBLIC_YOLO_STABLE_READY_MS=60000`). 빈 커밋 push 강제 재빌드 (CLAUDE.md 교훈 #6).
- [ ] **POST**: Vercel MCP `getEnvVar` 3건 Production scope 등록 / `getDeployments` READY+PROMOTED /
      브라우저 console `process.env.NEXT_PUBLIC_CAT_YOLO_V2 === "0"` 확인
- [ ] **롤백 트리거**: ENV 등록 누락 → flag 분기 동작 안 함 → 빈 커밋 재시도.
      배포 fail → 이전 PROMOTED commit 으로 Instant Rollback (5초 이내).

### §9.6 commit 6 — 머지 후 baseline 검증 결과 기록

- [ ] **PRE**: commit 5 완료 (Vercel READY) + 머지 직후 30분 이내
- [ ] **DO**: `docs/phase_b_post_merge_baseline_<날짜>.md` 신규 작성 — 머지 commit ID +
      Instant Rollback 대상 + Supabase row 4건 (cat_behavior_events / camera_sessions /
      ice_candidates / camera_viewer_connections) + Pool 사용률 + 콘솔 경고 0건 + Vercel 상태.
- [ ] **POST**: baseline 문서 1개 생성 + 4 row 합계 < 1000 (CLAUDE.md 교훈 #12) +
      Pool 사용률 < 60%
- [ ] **롤백 트리거**: row 합계 > 1000 → 누수 의심 → flag OFF 유지 + 원인 조사.
      Pool > 60% → flag OFF + Pro 업그레이드 검토 (CLAUDE.md 교훈 #7).

### §9.7 commit 7 — 사장님 실기기 테스트 결과 기록 (24시간 baseline 무이상 후)

- [ ] **PRE**: commit 6 의 24시간 baseline 무이상 + 사장님 실기기 + 가족 뷰어폰 준비 +
      `phase_b_field_test_plan.md` §0 사전 체크 7 체크박스 통과 (R11 D3 0-7 포함)
- [ ] **DO**: flag ON 토글 (Vercel ENV `NEXT_PUBLIC_CAT_YOLO_V2=1` + 빈 커밋) →
      field_test_plan §1~§3 의 15 체크박스 진행 → §5 검증 기준 7 지표 실측 →
      iOS latency 임계값 결정 (R11-A 해소) → flag OFF 복귀.
      `docs/phase_b_field_test_result_<날짜>.md` 신규 작성.
- [ ] **POST**: 7 지표 모두 PASS + Phase D 착수 가능 결론 기록
- [ ] **롤백 트리거**: 임계값 1건이라도 미달 → field_test_plan §6 로그 수집 7 체크박스 진행 →
      Vercel ENV `NEXT_PUBLIC_CAT_YOLO_V2=0` + 빈 커밋 (5초 이내). DB 변경 0 → 데이터 손실 0.

### §9.8 R12 PR 머지 절차 (commit 1~4 단일 PR)

- [ ] PR 생성 (branch: `feat/phase-b-src-r12`, base: `master`)
- [ ] PR description 에 다음 명시: "Phase B 9연속 PASS R3~R11 완료" / "flag OFF default 안전 머지" /
      "체크리스트 §9 commit 1~4 진행" / "Instant Rollback commit: 354f6dd (Phase A)" /
      "Cloudflare R2 사전 세팅 §7.6 모두 [x]" / "pnpm test 109 passed / pnpm build 통과"
- [ ] CI 통과 확인 (GitHub Actions / Vercel preview)
- [ ] 사장님 review + approve
- [ ] master 머지 — **권고: merge (squash 금지, 4 commit 보존)** — atomic 단위 손실 차단
- [ ] 머지 직후 30분 내 commit 5 + 6 진행 / 24시간 무이상 후 commit 7

### §9.9 R12 PR 머지 후 24시간 운영 모니터링

- [ ] Supabase row 합계 6시간마다 < 1000 (Supabase MCP execute_sql)
- [ ] Pool 사용률 12시간마다 < 60% (Supabase Dashboard → Reports)
- [ ] Vercel 에러 로그 12시간마다 0건 (Vercel MCP getDeploymentEvents)
- [ ] 사용자 보고 수시 0건
- [ ] 24시간 무이상 → commit 7 진행 / 이상 발견 → flag OFF 유지 + 원인 조사 + 추가 라운드
