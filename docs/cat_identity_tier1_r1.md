# cat-identity Tier 1 — 등록 화면 (R1, 2026-04-25)

> 본 문서는 등록 화면 워크스트림의 **설계 결정 트래킹** 용. 본격 구조 설명은 `docs/ARCHITECTURE.md §11` 참조.
>
> Branch: `feat/cat-identity-registration`
> Atomic 5 commit (이관 → 마이그+타입 → 화면+훅 → 라우트+CTA+테스트 → 문서)

## 사장님 결정사항 (5 + 추가)

| # | 질문 | 결정 |
|---|------|------|
| Q1 | 색상 calibration 등록에 포함? | **B** — 사진 1장 자동 HSV (인지 X), Tier 2 정교화 |
| Q2 | 사진 소스 | **카메라 + 갤러리 둘 다** (`accept=image/* capture=environment`) |
| Q3 | 다묘 정책 | **여러 마리 허용** (UNIQUE(home_id, name) 기존) |
| Q4 | CatRegistrationGuide 3-step 텍스트 | **유지 + 하단 CTA 추가** |
| Q5 | "방금 추가됨" 애니메이션 | **Tier 4 연기** |
| 추가 | 필드 구성 | 필수 4 (이름/품종/생년월일/성별) + 사진 + 옵션 7 |
| 추가 | 품종 입력 | **자동완성** (15 + 자유입력) |
| 추가 | 모래 | **드롭다운** (6 옵션) |
| 추가 | 사료 | **자동완성** (16 + 자유입력) |

## DB 변경 (commit 2)

`sql/20260425_cats_tier1_fields.sql` — ALTER TABLE cats ADD COLUMN × 9, 모두 nullable.

| 컬럼 | 타입 | 비고 |
|------|------|------|
| is_neutered | BOOLEAN | 3상태 (true/false/null=모름) |
| weight_kg | NUMERIC(4,2) | CHECK 0..30 |
| medications | TEXT | |
| supplements | TEXT | |
| litter_type | TEXT | 드롭다운 6 |
| food_type | TEXT | 자동완성 16+ |
| color_profile | JSONB | HSV { dominant_hues[], sample_count, version } |
| color_sample_count | INTEGER | Tier 1=1, Tier 2=N |
| color_updated_at | TIMESTAMPTZ | |

CLAUDE.md #14 트리거 X. 적용은 사장님 승인 후 `apply_migration` 으로.

## Atomic commit 구조

| # | hash | 내용 | LOC |
|---|------|------|-----|
| 1 | `9a4472b` | staging→src/ 14 파일 이관 + shim | mechanical |
| 2 | `9c7b203` | DB 마이그 SQL + TypeScript 타입 (CatDraft / CatInsertPayload / CatColorProfileJson / CatPhotoUpdatePayload) | +168 |
| 3 | `971fd2b` | 등록 화면 12 파일 (자동완성/드롭다운/HSV 추출/Storage 업로드/통합 훅/CSS) | ~1100 |
| 4 | `4125289` | /cats/new 라우트 + 홈 CTA 2곳 + Playwright 스모크 | +143 |
| 5 | (본 문서) | ARCHITECTURE.md §11 + 본 설계 문서 | docs |

## 검증 게이트 (각 commit 후)

- `npx tsc --noEmit -p tsconfig.staging-check.json` = exit 0 ✅
- `npx vitest run` = 10 files / 109 passed ✅ (R12 baseline 회귀 0)
- `pnpm build` = 성공 ✅

## CLAUDE.md 준수

- **#13 호환** — 기존 src/ 파일 수정 최소 (Link import + CTA + CSS 클래스만)
- **#14 트리거 X** — nullable 컬럼 추가는 데이터 모델 변경 아님, atomic deploy 불필요
- **staging 무손상** — staging/{components,hooks,lib}/cat-identity 14 파일 모두 re-export shim 으로 보존
- **한글 주석** — 모든 신규 파일 docstring + 주요 분기점 한국어 설명
- **컴포넌트 한도** — Screen 98 / ProfileForm 95 / OptionalFields 130 / PhotoPicker 88 (모두 100 근처 또는 이하)

## 향후 Tier (별도 PR)

### Tier 2 — 식별 + 정교한 calibration
- `/cats/[id]/calibrate` 신규 화면
- useCatIdentifier (HSV 매칭) + useCatColorCalibration (20장 수집) 활성화
- cat_behavior_events.cat_id 자동 매칭 시작

### Tier 3 — 다묘 관리 + 편집
- `/cats/[id]/edit`
- photo_side_url, photo_back_url 활용
- soft delete

### Tier 4 — UX 폴리싱
- "방금 추가됨" 하이라이트 애니메이션 (`?newCatId=` 쿼리)
- onboarding 플로우 통합

## R12 PR (Phase B) 와의 관계

**Orthogonal — 서로 안 막음.**
- cat_behavior_events.cat_id 는 nullable → Phase B 가 Tier 1 없이도 작동
- Tier 1 머지가 Phase B Mount/뷰어 게이트 코드 안 건드림
- 같이 머지해도 충돌 없음 (서로 다른 파일군)

## RLS / 보안 정책

- cats 테이블 RLS 는 `homes.owner_id = auth.uid()` 기존 정책 그대로
- ~~INSERT 정책 별도 추가 불필요~~ → fix R1 #1 에서 4개 정책 명시 (`sql/20260425b_cats_rls_policies.sql`)
- Storage `cat-moments` 버킷 INSERT 정책: authenticated 이미 적용됨

## 진입점 (fix R1 #7 갱신)

| 위치 | 파일 | 동작 |
|---|---|---|
| 홈 cat 프로필 row | `src/components/home/HomeProfileRow.tsx` | cats=0 → "🐱 고양이 등록하기" / cats>0 → "＋ 추가" → `/cats/new` |
| 홈 카드 그리드 | `src/components/catvisor/HomeCatCards.tsx` | "＋ 고양이 추가하기" → `/cats/new` |
| 라우트 | `src/app/cats/new/page.tsx` | server component 가 home_id 해석 후 `<CatRegistrationScreen homeId>` 렌더 |
| 환영 토스트 | `HomeProfileRow` (sessionStorage `cat-welcome-name`) | 등록 직후 3.5초 자동 표시 |

## 다음 단계 (사장님 승인 대기)

1. **로컬 검증 완료** (tsc + vitest + pnpm build 모두 통과)
2. **사장님 승인 시** push + PR 생성 (gh auth 또는 웹)
3. **PR 머지 후** `apply_migration` 으로 sql/20260425 적용 (Supabase MCP)
4. **Vercel 자동 재빌드** → /cats/new 라우트 활성
5. **사장님 실기기 등록 테스트** (가족 계정으로 새 고양이 등록)
