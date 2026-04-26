<!--
cat-identity Tier 1 fix R5-3 R8-3 — PR 본문 표준 템플릿.

5초 임계 롤백 시 즉답 가능하도록 직전 production commit ID + Vercel Instant Rollback URL +
DB 마이그 적용 여부 + Rollback 명령어 4 필드 사전 메모 강제.
-->

## 요약
<1-2문장 변경 목적>

## 변경 내역
- ...

## 베이스라인 / 롤백 메모 (필수, fix-r5-3 R8-3 신설)
- **직전 production commit ID**: <e.g. `5824498`>
- **Vercel Instant Rollback URL**: <Vercel deployments 페이지 링크 또는 직전 deployment URL>
- **DB 마이그 적용 여부**: Yes / No (Yes 면 atomic 절차 §11.6.1 5a~5e 준수 명시)
- **Rollback 명령어 (5초 임계)**:
  - Vercel: `vercel rollback <previous-deployment-url>` 또는 dashboard Instant Rollback 버튼
  - DB: `psql $SUPABASE_URL -f sql/<rollback-file>.sql` (해당 시)
  - Tag: `git tag -f recovery/<date> <previous-commit-id>` 백업 후 진행

## 테스트 계획
- [ ] `npx tsc --noEmit` 통과 (cat-identity 영역 신규 에러 0)
- [ ] `npx vitest run` 통과 (회귀 0)
- [ ] `npx next build` 통과 (cat-identity 영역 회귀 0)
- [ ] CI green (lockfile 정합성 포함, R5-3 R8-2)

## 위험도
- Level 1 / Level 2 / Level 3 (CLAUDE.md 3-5-9 규칙)
- 회귀 영향 범위: <컴포넌트 / 훅 / DB>

## 운영 노트
- 베타 모드 (사용자 7명) — 즉시 deploy 가능 시간대 / 사장님 깨어있을 때만.
- 헌법: 무자비한 프로토콜 5 RULE 준수, 무효 키워드 미사용 확인.
