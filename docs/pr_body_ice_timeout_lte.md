<!--
  PR 본문 템플릿 — `gh pr create --body-file docs/pr_body_ice_timeout_lte.md` 용.
  feat/ice-timeout-lte-fix 브랜치 → master PR 생성 시 사용.
  PR 머지 후에도 파일 유지 (CLAUDE.md "파일 삭제 절대 금지" + 향후 유사 fix reference).
-->

# fix(webrtc): viewer ICE 타임아웃 ENV flag 적용 (G7 LTE 마진)

## 변경 요약
- 신규 helper `src/lib/webrtc/iceConnectionTimeoutMs.ts` (순수 함수, 0 의존성)
- 단위 테스트 8개 + QA 추가 엣지 19개 vitest 실측 PASS
- 기존 hook `src/hooks/useWebRtcSlotConnection.ts` 의 `15_000` hardcode → ENV-driven
- `docs/ARCHITECTURE.md` §10.9 신규 섹션 (`NEXT_PUBLIC_ICE_TIMEOUT_MS` 등록)
- `docs/handoff_2026-04-25.md` §머지 후 운영 절차 (4단계 + 롤백 경로)

## 배경
G7 카메라폰 LTE 환경에서 viewer 측 ICE 협상이 15초 안에 안 끝나면 `[CameraSlot] 연결 타임아웃` → 카메라 풀려서 홈 튕김. ENV 로 timeout 조정 가능하게 함.

## 검증
- [x] `tsc=0` (본 fix 도입 회귀 0건. 사전 존재 11 에러는 master HEAD 와 동일 hash → 별도 chore PR)
- [x] vitest 117/117 PASS
- [x] `next build` 17/17 static pages
- [x] QA 9 라운드 + 자동 fix 사이클 (라운드 2 REJECT → docs fix-r1 → 재검증 9 PASS)

## 머지 후 필수 절차 (CLAUDE.md #6)
1. Vercel ENV `NEXT_PUBLIC_ICE_TIMEOUT_MS=30000` (또는 `60000`) 설정
2. 빈 커밋 push 로 강제 재빌드
3. Vercel `READY+PROMOTED` 확인
4. G7 LTE 실기기 테스트

상세 절차: `docs/handoff_2026-04-25.md` §머지 후 운영 절차.

## 롤백
- ENV 삭제 + 빈 커밋 push → default 15s 복귀
- Vercel Instant Rollback `78b5f16` 이전
- recovery tag `recovery-feat-ice-timeout-lte-r1-pass`

## 부수 발견 (별도 PR 후보)
- `src/hooks/useWebRtcSlotConnection.ts` 503줄 (CLAUDE.md 400줄 한도 초과, master 사전 부채 +3 본 PR)
- `tests/webrtc-firewall-readiness.spec.ts` TS 에러 11건 (master HEAD 동일, 본 PR 무관)
