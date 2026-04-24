# Phase B R12 PR 머지 후 Baseline (commit 6)

> R11 Arch §3.7 명세 이행. R12 PR 머지 + Vercel ENV 등록 + 프로덕션 재빌드 완료 시점의 운영 baseline 스냅샷.
>
> **작성 시각:** 2026-04-25 00:23 KST (Vercel 빌드 READY 직후)
> **flag 상태:** `NEXT_PUBLIC_CAT_YOLO_V2=0` (OFF — Phase A 경로 유지)

---

## 1. Git / 배포 상태

### Master 최근 commit
```
bc9b15c chore(phase-b): commit 5 — Vercel ENV 3개 적용 강제 재빌드
7e1e127 Merge pull request #1 from Lemonpine-ai/feat/phase-b-src-r12
8731d02 docs(phase-b): commit 4 — ARCHITECTURE.md §10.2 Phase B 통합 + staging cross-reference
67e0275 feat(phase-b): commit 3 — staging → src/ 14 파일 이관 + Mount + 뷰어 게이트 + R7-S
71f5d24 feat(phase-b): commit 2 — src/ logger 본체 NaN/Infinity 가드 (mirror 1:1 동치)
db26cbe feat(phase-b): commit 1 — mirror 마커 r7-1 → r10-1 갱신 (3 파일 동시)
ba2e4a0 chore(phase-b): R12 PR 베이스
354f6dd feat(behavior): Phase A YOLO 통합 (이전 master 베이스라인)
```

### Vercel production 배포 (bc9b15c 기반, ENV 3개 포함)
| 항목 | 값 |
|------|----|
| Deployment ID | `dpl_5jm5Pf3LRFz2ELNK8xNsgbNnWBck` |
| readyState | **READY** ✅ |
| readySubstate | **PROMOTED** ✅ |
| target | production |
| ready 시각 | 1777046300552 (ms) |
| 직전 배포 (머지 직후) | `dpl_4Roc8DAxyaHzAAFxDGzzytpm8tVA` (commit `7e1e127`, READY+PROMOTED) |

### Vercel ENV (Phase B 신규 3개)
| ENV | 값 | 대상 |
|-----|----|-----|
| `NEXT_PUBLIC_CAT_YOLO_V2` | `0` (default OFF) | production + preview + development |
| `NEXT_PUBLIC_YOLO_MODEL_URL` | `https://pub-e5e4c245235e430f84f088febf07a0c0.r2.dev/cat_behavior_yolov8n.onnx` | production + preview + development |
| `NEXT_PUBLIC_YOLO_STABLE_READY_MS` | `60000` | production + preview + development |

Instant Rollback 후보 commit: `7e1e127` (직전 READY+PROMOTED). 문제 발생 시 Vercel UI 에서 즉시 롤백.

---

## 2. Supabase DB baseline (머지 직후)

| 테이블 | row 수 | 의미 |
|-------|-------|------|
| `cat_behavior_events` | **0** | flag OFF 라 INSERT 아직 없음. 정상. |
| `cat_behavior_events_archive` | 0 | Phase E 뼈대, 비어있음 정상 |
| `cat_behavior_label_history` | 0 | Phase D audit, 비어있음 정상 |
| `camera_sessions` | 153 | WebRTC 누적 세션 (cleanup 대상 일부 포함 추정) |
| `ice_candidates` | **1008** ⚠️ | CLAUDE.md #12 경고 임계 (1000) 초과 — 별도 cleanup 이슈 |
| `cats` | 4 | 현재 등록된 고양이 마릿수 |
| `homes` | 6 | 집 계정 |

### ⚠️ ice_candidates 1008 경고
CLAUDE.md WebRTC 운영 교훈 #12 기준 1000 초과 = 누수 징후.
**본 R12 PR 과 무관** (Phase B flag OFF + 머지 전부터 쌓인 누적). 별도 cleanup 작업 필요:
- 권고: 오래된 `completed`/`ended` 세션의 ice_candidates 를 orphan 삭제
- 시점: 사장님 실기기 테스트 전에 처리하면 pool 여유 확보

---

## 3. R12 PR commit 5 까지 완료 현황

| # | hash | 내용 | 상태 |
|---|------|------|------|
| 0 | `ba2e4a0` | R12 PR 베이스 (staging 산출물 보존) | ✅ |
| 1 | `db26cbe` | mirror 마커 r7-1 → r10-1 (3 파일) | ✅ |
| 2 | `71f5d24` | src/ logger NaN/Infinity 가드 | ✅ |
| 3 | `67e0275` | staging → src/ 14 파일 이관 + Mount + 뷰어 게이트 + R7-S | ✅ |
| 4 | `8731d02` | ARCHITECTURE.md §10.2 Phase B 통합 + cross-reference | ✅ |
| 5 | `bc9b15c` | Vercel ENV 3개 적용 강제 재빌드 (빈 커밋) | ✅ |
| 6 | (본 문서) | 머지 후 baseline 기록 | ✅ (이 파일) |
| 7 | (대기) | 사장님 실기기 테스트 결과 기록 | ⏳ |

---

## 4. 다음 단계 (commit 7 자리까지)

### 4.1 사장님 실기기 테스트 전 권고
- [ ] ice_candidates 1008 cleanup (WebRTC 누적 ICE 오래된 row 삭제) — 별도 작업
- [ ] flag OFF 상태에서 기존 Phase A 경로 무회귀 확인 (뷰어 측 행동 라벨 정상 표시, 로그인/카메라 연결 이상 없음)
- [ ] 방송폰 + 뷰어 각 1대로 5분 smoke test

### 4.2 flag ON 전환 시나리오
`staging/docs/phase_b_field_test_plan.md` §1~§7 수행.
- 방송폰 2~3대 + 가족 4명 뷰어 조건
- 소요: 약 50분 (준비 5 + 방송 30 + 검증 10 + 종료 5)
- 완료 후 결과를 commit 7 자리 (본 문서와 별도 또는 append) 에 기록

### 4.3 iOS latency 임계값 결정
실기기 테스트 데이터 기반 `NEXT_PUBLIC_YOLO_STABLE_READY_MS` 유지/90000 조정 결정.

### 4.4 Phase D 착수 가능 조건
- 사장님 실기기 테스트 PASS
- 24시간 운영 모니터링 이상 0건
- Supabase pool 사용률 < 60% 유지

---

## 5. 참고 링크

- PR #1: https://github.com/Lemonpine-ai/cat/pull/1
- Vercel inspector (최신 배포): https://vercel.com/lemonpine-ais-projects/cat/5jm5Pf3LRFz2ELNK8xNsgbNnWBck
- 실기기 테스트 플랜: `staging/docs/phase_b_field_test_plan.md`
- R12 PR 체크포인트: `docs/r12_pr_checkpoint_2026-04-24.md`
- ARCHITECTURE Phase B: `docs/ARCHITECTURE.md` §10.2
