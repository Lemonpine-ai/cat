# cat-identity Tier 1 — fix R4 통합 설계서 (28건 결함 5 commit 분할)

> **Arch Agent 산출물 (1번)** — 본 문서는 설계만 다룬다. 코드 본체는 0줄. Dev Agent (2번) 가 본 설계서만 보고 구현 가능해야 한다.
>
> **무자비한 프로토콜 5 RULE 준수** (CLAUDE.md 최우선 헌법):
> 1. 자비없는 대립형 — fix R3 까지의 자기 검토에 의존하지 않고, STRICT QA 3차 REJECT 8건 + 누적 28건 결함을 정면 반박 가능한 설계로 응답.
> 2. 성역 보존 — `staging/cat-identity` shim 무손상, 기존 `src/` 의 OFF 경로 (Phase B 행동 분류) 무손상.
> 3. 병렬 독립 — Dev Agent 가 본 설계서만 보고 5 commit 을 순차 실행 가능. 각 commit 은 단독 빌드/테스트 통과.
> 4. 하네스 기록 — 결함 ↔ commit 매핑 표 + commit 별 시그니처/SQL 명세 + 검증 명령 + Rollback 매트릭스 강제.
> 5. 꼼수 금지 — 무효 키워드 (minor 권고 / 강제 아님 / 이 정도면 됐지 / 프로덕션 영향 없음 / 추후 정리 권장 / 선택적 개선 / 스타일 차원) **본 문서 사용 0건**.

---

## 0. 헤더

### 0.1 목적

cat-identity Tier 1 등록 화면 fix R3 결과 (commit `61457f3`, master 위 12 commit stack) 에 대한 **STRICT QA 3차** 검토 결과:

- **PASS 2/10** — R1 (동작 / 빌드 통과), R4 (가독성 / 한국어 주석)
- **REJECT 8/10** — R2 (설계 일치), R3 (단순화), R5 (엣지케이스), R6 (성능), R7 (보안), R8 (영향 범위 / 마이그), R9 (최종 품질), R4.5 (사용자 흐름)

누적 결함 **28건** (Critical 6 / Major 8 / Minor 14) 을 fix R4 통합 PR (5 atomic commit) 으로 해소한다.

### 0.2 입력

- **Branch base**: `feat/cat-identity-tier1-fix-r1` @ commit `61457f3` (`docs(cat-identity): fix-r3-3 — RLS 마이그 atomic deploy 절차 명시 (R8)`)
- **Stack**: master `5824498` 위 12 commit (Tier 1 본체 5 + fix R1 4 + fix R2 2 + fix R3 3)
- **결함 명세**: STRICT QA 3차 REJECT 보고서의 28건 (본 문서 §1 참조)

### 0.3 출력

- **Branch**: `fix-r4-design` (Arch 산출물 — 본 문서만)
- **후속 Branch**: `fix-r4-work` (Dev 산출물 — 5 commit). 본 문서가 5 commit 의 설계 책임자.
- **5 atomic commit**:
  1. `fix-r4-1` — 보안 (C1 / C4 / C5 / C6) 4건 + ARCHITECTURE §11.6 확장
  2. `fix-r4-2` — 사용자 흐름 (C2 / C3 / M2 / M3 / M4 / M5) 6건
  3. `fix-r4-3` — 단순화 / 일관 (M1 / M6 / M7 / M8 / m14 / m15 / m16 / m18 / m19) 9건
  4. `fix-r4-4` — 운영 / CI (m9 / m10 / m11 + DOWN 마이그 정합) 4건
  5. `fix-r4-5` — 마무리 / 테스트 (m12 / m13 / m20 / m21 / m22) 5건

총 **28 건 = 4 + 6 + 9 + 4 + 5** (누락 0).

### 0.4 무효 키워드 차단

본 문서는 다음 키워드를 사용하지 않는다 (사용 시 자기 결과 자동 REJECT, 검증은 §6 자가 진술):

`minor 권고` / `강제 아님` / `이 정도면 됐지` / `프로덕션 영향 없음` / `추후 정리 권장` / `선택적 개선` / `스타일 차원`.

모든 결함은 **REJECT 사유 + 구체 수정 방안 + 검증 명령** 의 3종 세트로 다룬다.

---

## 1. 결함 ↔ commit 매핑 표 (28행)

| # | 결함 | 분류 | 위치 | commit |
|---|---|---|---|---|
| **C1** | HEIC EXIF 누출 (createImageBitmap 실패 시 원본 fallback) | Critical 보안 R7 | `src/lib/cat/stripExifFromImage.ts:84-87` | **fix-r4-1** |
| **C2** | supabase throw 시 submit 영구 lock + unhandled rejection | Critical 사용자 흐름 R5 | `src/hooks/useCatRegistration.ts:163,230,247` + `src/app/cats/new/CatRegistrationScreen.tsx:107-118` | **fix-r4-2** |
| **C3** | double-click race + Storage orphan | Critical 사용자 흐름 R5 | `CatRegistrationScreen.tsx:170-177` | **fix-r4-2** |
| **C4** | RLS SQL 비-idempotent (DROP/BEGIN/COMMIT/DOWN 부재) | Critical 보안 R8 | `sql/20260425b_cats_rls_policies.sql` | **fix-r4-1** |
| **C5** | cats RLS 의 homes RLS 의존 사전 검증 누락 | Critical 보안 R7 / R8 | `sql/20260425b_cats_rls_policies.sql:19-42` | **fix-r4-1** |
| **C6** | Magic byte 검증 부재 (MIME spoofing 우회) | Critical 보안 R7 | `src/lib/cat/uploadCatProfilePhoto.ts:23-30` | **fix-r4-1** |
| **M1** | 자식 컴포넌트 (`CatHealthFields` / `CatLifestyleFields`) 의 `update` 함수형 setter 미적용 → memo 무효 | Major 단순화 R3 / R6 / R9 | `src/app/cats/new/CatHealthFields.tsx:40-45` + `src/app/cats/new/CatLifestyleFields.tsx:27-32` | **fix-r4-3** |
| **M2** | UPLOAD_FAILED 시 `RegistrationResult.error.catId` 회수했는데 UI 가 활용 안 함 | Major 사용자 흐름 R4.5 | `useCatRegistration.ts` ↔ `CatRegistrationScreen.tsx` onSubmit | **fix-r4-2** |
| **M3** | recheck 매칭 시 `WELCOME_TOAST_KEY` 동일 → "🎉 환영해요" 거짓 토스트 | Major 사용자 흐름 R4.5 | `CatRegistrationScreen.tsx:108-115` + `messages.ts.alreadyRegistered` 미사용 | **fix-r4-2** |
| **M4** | PostgREST/Storage raw 영어 stack trace 사용자 노출 | Major 사용자 흐름 R4.5 | `useCatRegistration.ts:211,262` + `uploadCatProfilePhoto.ts:89` | **fix-r4-2** |
| **M5** | 옵션 접힌 상태 + 옵션 필드 검증 실패 시 시각 신호 부재 | Major 사용자 흐름 R4.5 | `CatRegistrationScreen.tsx:144-153` | **fix-r4-2** |
| **M6** | `CatPhotoPicker` 의 `MAX_FILE_BYTES` / `ALLOWED_MIME` 로컬 재정의 (단일 출처 위반) | Major 단순화 R3 / R6 / R9 | `src/app/cats/new/CatPhotoPicker.tsx:20-27` ↔ `src/lib/cat/constants.ts` | **fix-r4-3** |
| **M7** | `catDraftToInsertPayload` 의 weight 0/30 매직 넘버 (constants 미사용 + validate 와 임계값 모순) | Major 설계 일치 R2 | `src/types/cat.ts:106` | **fix-r4-3** |
| **M8** | ARCHITECTURE.md §11.1 표 weight `0~30` ↔ 실제 `0.1~30` 불일치 | Major 설계 일치 R2 | `docs/ARCHITECTURE.md` §11.1 line 983 + §11.1.3 line 1016 | **fix-r4-3** |
| **m9** | `sql/20260425c_cats_weight_min.sql` precheck 주석 `weight_kg = 0` ↔ 실제 CHECK `>= 0.1` | Minor 운영 R8 | `sql/20260425c_cats_weight_min.sql:5` | **fix-r4-4** |
| **m10** | CI verify:routes 미연결 (`.github/workflows/ci.yml` 부재) | Minor 운영 R8 | repo 루트 | **fix-r4-4** |
| **m11** | `logger.ts` Sentry 미연동 + production console 무필터 (PII 노출 가능) | Minor 운영 R8 | `src/lib/observability/logger.ts` | **fix-r4-4** |
| **m12** | `extractHsvFromPhoto.test.ts` canvas getContext stderr noise | Minor 마무리 R9 | `src/lib/cat/__tests__/extractHsvFromPhoto.test.ts` | **fix-r4-5** |
| **m13** | `docs/cat_identity_tier1_r1.md` baseline stale (vitest 109 → 127, atomic commit 표 12+5 commit 미반영) | Minor 마무리 R2 / R9 | `docs/cat_identity_tier1_r1.md` | **fix-r4-5** |
| **m14** | `CatProfileForm.tsx` 100줄 초과 (185줄), 이름/품종 inline 패턴 반복 | Minor 단순화 R3 | `src/app/cats/new/CatProfileForm.tsx` | **fix-r4-3** |
| **m15** | HSV 알고리즘 Worker / idle 본체 중복 (`computeDominantHues` / `computeOnMainThreadIdle`) | Minor 단순화 R3 / R6 | `src/workers/extractHsv.worker.ts:42-83` ↔ `src/lib/cat/extractHsvFromPhoto.ts:104-155` | **fix-r4-3** |
| **m16** | `extractHsvFromPhoto.ts:54-56 emptyProfile` / `:253-255 emptyHsvProfile` 잉여 wrapper | Minor 단순화 R3 | `src/lib/cat/extractHsvFromPhoto.ts` | **fix-r4-3** |
| **m17** | `createImageBitmap` 중복 디코드 (`extractHsvFromPhoto` + `stripExifFromImage` 각 1회) | Minor 성능 R6 | `src/lib/cat/extractHsvFromPhoto.ts` + `src/lib/cat/stripExifFromImage.ts` | **fix-r4-3** |
| **m18** | `CatPhotoPicker` `errorMessage` prop 정의됐으나 부모가 미전달 | Minor 사용자 흐름 R4.5 | `CatProfileForm.tsx:176-179` | **fix-r4-3** |
| **m19** | ARCHITECTURE §11.1 알고리즘 라인 `채도 0.2 이상` ↔ 실제 `+ 명도 0.15 이상` 불일치 | Minor 설계 일치 R2 | `docs/ARCHITECTURE.md` §11.1.1 line 993 | **fix-r4-3** |
| **m20** | `sample_count` empty 모순 (top3=[] 일 때 1 반환) | Minor 마무리 R5 | `extractHsv.worker.ts:96` + `extractHsvFromPhoto.ts:154` | **fix-r4-5** |
| **m21** | `CatRegistrationScreen.tsx` `isDirty` 매 렌더 trim ×10 (useMemo 부재) | Minor 마무리 R6 | `CatRegistrationScreen.tsx:78-88` | **fix-r4-5** |
| **m22** | `CatRegistrationScreen.tsx:13` docstring `useEffect 0개` 거짓 (실제 1개 — errorBanner scrollIntoView) | Minor 마무리 R2 | `CatRegistrationScreen.tsx:13` | **fix-r4-5** |

**매핑 누락 0건 확인** (Critical 6 + Major 8 + Minor 14 = 28).

---

## 2. commit 별 상세 설계

### 2.1 fix-r4-1 — 보안 (C1 / C4 / C5 / C6)

> **목표**: HEIC EXIF 누출 / RLS SQL 비-idempotent / homes RLS 의존 미검증 / MIME spoofing 4 보안 결함을 atomic deploy 가능한 형태로 봉쇄.

#### 2.1.1 stripExifFromImage union 반환 (C1)

**REJECT 사유**: `try { ... } catch { return file; }` 가 HEIC 디코드 실패 시 EXIF 가 살아있는 원본을 그대로 Storage 에 넘긴다. GPS 좌표 누출.

**수정 방안**: union 반환 타입으로 호출자가 명시적으로 분기하도록 강제.

**파일**: `src/lib/cat/stripExifFromImage.ts`

**시그니처 변경**:

```ts
// 이전
export async function stripExifFromImage(file: File): Promise<File>;

// 이후
export type StripExifResult =
  | { kind: "ok"; file: File }
  | { kind: "error"; code: "EXIF_STRIP_FAILED"; reason: string };

export async function stripExifFromImage(file: File): Promise<StripExifResult>;
```

**행동 명세**:

- `createImageBitmap` 실패 (HEIC 등) → `{ kind: "error", code: "EXIF_STRIP_FAILED", reason: "decode-failed" }`
- 0 사이즈 / `getContext` null / `toBlob` null → 같은 error union (`reason` 만 다름)
- 정상 → `{ kind: "ok", file: <jpeg 재인코딩 File> }`
- **금지**: 어떤 경로에서도 원본 `file` 을 그대로 반환하지 않는다.

#### 2.1.2 uploadCatProfilePhoto 의 strip 결과 처리 (C1 연계)

**파일**: `src/lib/cat/uploadCatProfilePhoto.ts`

**변경**:

- `const stripped = await stripExifFromImage(file);` →
- `const stripResult = await stripExifFromImage(file);`
- `if (stripResult.kind === "error") return { kind: "error", code: "INVALID_FORMAT", message: CAT_MESSAGES.photoFormatUnsupported };`
- `UploadResult.error.code` 에 `"INVALID_FORMAT"` 추가 (union 확장).
- 정상 경로: `const stripped = stripResult.file;`

**`messages.ts` 신설 키**: `photoFormatUnsupported: "이 사진은 처리할 수 없어요. JPG/PNG/WebP 사진으로 다시 시도해 주세요."` (HEIC 가 디코드 실패하는 안드로이드/구 iOS 케이스 안내).

#### 2.1.3 detectImageMagic 신설 (C6)

**REJECT 사유**: `file.type` 만 검증 → `image/jpeg` 라고 attacker 가 헤더 고치고 임의 binary 업로드 가능.

**파일 신설**: `src/lib/cat/detectImageMagic.ts`

**시그니처**:

```ts
export type ImageMagic = "jpeg" | "png" | "webp" | null;

/**
 * 파일 첫 12 byte 를 읽어 magic byte 비교.
 *  - JPEG: FF D8 FF
 *  - PNG: 89 50 4E 47 0D 0A 1A 0A
 *  - WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
 *  - HEIC/HEIF 는 본 검증 통과 못 함 → 호출자가 stripExifFromImage 의 union error 로 처리
 */
export async function detectImageMagic(file: File): Promise<ImageMagic>;
```

**호출 위치**: `uploadCatProfilePhoto.ts` 의 MIME 검증 직후 (단계 1 과 2 사이).

```
1) MIME ALLOWED_MIME 검증 (기존)
2) detectImageMagic(file) === null → return { kind:"error", code:"INVALID_FORMAT", message: photoFormatUnsupported }
3) stripExifFromImage union 처리 (C1)
4) Storage 업로드 (기존)
```

**HEIC 처리 정책 결정 (R7 #4 사장님 컨펌 대기)**:

- iOS 신모델 사파리는 HEIC 도 `createImageBitmap` 으로 디코드 가능 → `stripExifFromImage` 가 JPEG 재인코딩 → magic byte 는 사후 JPEG 가 되므로 OK.
- 안드로이드/구 iOS HEIC → `stripExifFromImage` 가 error union → `INVALID_FORMAT` 반환 (사용자 안내).
- 즉 magic byte 검증은 stripExifFromImage **입력** 이 아니라 **strip 후 결과** 에 적용. 본 설계에서는 strip 직후 한 번 더 magic 검증을 추가하는 대신, **strip 의 출력은 항상 jpeg** 임을 union 의 `kind:"ok"` 가 보장하므로 strip 입력 단에서만 magic 검증.

**예외**: HEIC 입력은 magic 검증 단계에서 `null` 이 나오는데, 사장님이 HEIC 를 거부하려는 경우 곧장 `INVALID_FORMAT`. HEIC 를 일부 허용하려면 magic 검증을 strip 결과에 옮긴다 — 본 설계는 **거부 정책** 으로 통일 (안드로이드 HEIC = 5MB 안 해도 보안 우회 표면이 됨).

#### 2.1.4 sql/20260425b_cats_rls_policies.sql 재작성 (C4)

**REJECT 사유**:

1. `DROP POLICY IF EXISTS` 부재 → 두 번 적용 시 `policy already exists` 에러로 마이그 실패.
2. `BEGIN; / COMMIT;` 부재 → 4개 정책 중 하나라도 실패하면 부분 적용 (RLS 활성화는 됐는데 정책 일부만 존재 → SELECT 폭증 차단).
3. DOWN 마이그 부재 → 롤백 시 `pause_project` → `restore_project` (CLAUDE.md WebRTC 교훈 #10) 외 방법 없음.

**수정 방안**: 단일 트랜잭션 + idempotent + DOWN 파일 신설.

**파일**: `sql/20260425b_cats_rls_policies.sql` (덮어쓰기)

**구조 (pseudo-SQL, 본체 작성 금지)**:

```sql
-- 헤더 (한국어 주석)
-- 1) 이 파일은 idempotent 함 (DROP IF EXISTS → CREATE) — 두 번 적용 가능
-- 2) BEGIN/COMMIT 으로 단일 트랜잭션 (부분 적용 방지)
-- 3) 사전 검증 절차 (homes RLS 검증, home_id NULL 0 확인) 는 §11.6.1 atomic deploy 6단계 참조
-- 4) DOWN: sql/20260425b_cats_rls_policies_rollback.sql

BEGIN;

ALTER TABLE public.cats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cats_select_by_home_owner ON public.cats;
DROP POLICY IF EXISTS cats_insert_by_home_owner ON public.cats;
DROP POLICY IF EXISTS cats_update_by_home_owner ON public.cats;
DROP POLICY IF EXISTS cats_delete_by_home_owner ON public.cats;

CREATE POLICY cats_select_by_home_owner ON public.cats
  FOR SELECT USING (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  );

-- (INSERT / UPDATE / DELETE 동일 — 본체는 Dev 가 fix-r3 의 동일 본문 그대로 복사 + DROP 만 추가)

COMMIT;
```

**파일 신설**: `sql/20260425b_cats_rls_policies_rollback.sql`

```sql
BEGIN;
DROP POLICY IF EXISTS cats_select_by_home_owner ON public.cats;
DROP POLICY IF EXISTS cats_insert_by_home_owner ON public.cats;
DROP POLICY IF EXISTS cats_update_by_home_owner ON public.cats;
DROP POLICY IF EXISTS cats_delete_by_home_owner ON public.cats;
ALTER TABLE public.cats DISABLE ROW LEVEL SECURITY;
COMMIT;
```

#### 2.1.5 homes RLS 사전 검증 (C5)

**REJECT 사유**: 4 정책이 모두 `home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())` 의존. **homes 의 RLS 가 비활성** 이거나 **owner_id 컬럼이 NULL 인 row** 가 있으면 cats RLS 자체가 작동 안 함 (SELECT 가 0 row 반환).

**수정 방안**: SQL 헤더 주석에 사전 검증 SELECT 4개 명시 + ARCHITECTURE §11.6.1 atomic deploy 절차 6단계로 확장.

**SQL 헤더 주석 (정확 텍스트, Dev 가 그대로 복사)**:

```
-- 사전 검증 (apply 전 Supabase SQL Editor 또는 MCP execute_sql 로 4건 모두 PASS 확인):
--   A) SELECT relrowsecurity FROM pg_class WHERE relname = 'homes';
--      → 결과 t (true). f 면 STOP — homes RLS 먼저 활성화 필요.
--   B) SELECT count(*) FROM public.homes WHERE owner_id IS NULL;
--      → 결과 0. > 0 면 STOP — owner_id NULL row 존재 → cats RLS 가 해당 home 차단.
--   C) SELECT count(*) FROM public.cats WHERE home_id IS NULL;
--      → 결과 0. > 0 면 STOP — home_id NULL cats row 가 RLS 적용 후 영구 차단됨.
--   D) SELECT count(*) FROM public.cats c
--      LEFT JOIN public.homes h ON c.home_id = h.id WHERE h.id IS NULL;
--      → 결과 0. > 0 면 STOP — orphan cats row (home 삭제됨) 가 RLS 후 영구 차단됨.
-- 4건 모두 PASS 후 본 마이그 적용. 실패 시 sql/20260425b_cats_rls_policies_rollback.sql 즉시 적용.
```

#### 2.1.6 sql/20260425c_cats_weight_min_rollback.sql 신설 (C4 연계)

**파일 신설**: `sql/20260425c_cats_weight_min_rollback.sql`

**내용 (pseudo)**:

```
BEGIN;
ALTER TABLE public.cats DROP CONSTRAINT IF EXISTS cats_weight_kg_valid;
ALTER TABLE public.cats ADD CONSTRAINT cats_weight_kg_valid
  CHECK (weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 30));
COMMIT;
```

> 원복 정책: `>= 0` (Tier 1 PR 머지 직전 상태 — fix R1 #6 이전).

#### 2.1.7 ARCHITECTURE §11.6.1 atomic deploy 6단계 확장 (C5 / C4)

**파일**: `docs/ARCHITECTURE.md` §11.6.1

**수정 (정확 텍스트, Dev 가 그대로 적용)**:

```
운영 절차 (CLAUDE.md #14 atomic deploy, fix R4 6단계):
  1) PR 머지 (단일 커밋, 단일 PR — sql/* 와 src/* 동시).
  2) Vercel `getDeployments` 로 production READY+PROMOTED 확인 (commit ID 메모).
  3) homes RLS 사전 검증 4건 (A/B/C/D — sql/20260425b_cats_rls_policies.sql 헤더 참조)
     모두 PASS 확인. 실패 시 STOP, PR revert 후 사장님 보고.
  4) Supabase MCP `apply_migration` 으로 sql/20260425b_cats_rls_policies.sql 적용
     (단일 트랜잭션 — 부분 적용 불가).
  5) 적용 후 검증 SELECT — `SELECT count(*) FROM public.cats;` 가 가족 사용자
     기준 0 이 아니어야 함 (RLS 의도 작동 확인). 0 이면 즉시 6) rollback.
  6) 실패 시 즉시 sql/20260425b_cats_rls_policies_rollback.sql 적용 +
     Vercel Instant Rollback (2단계 commit ID).
```

#### 2.1.8 fix-r4-1 검증 명령

```
pnpm tsc --noEmit
pnpm vitest run src/lib/cat/__tests__/detectImageMagic.test.ts   # 신설
pnpm vitest run src/lib/cat/__tests__/stripExifFromImage.test.ts # 갱신 (union 검증)
pnpm vitest run src/lib/cat/__tests__/uploadCatProfilePhoto.test.ts # 신설/갱신 (INVALID_FORMAT 분기)
pnpm next build
```

**신설 vitest 케이스**:

- `detectImageMagic.test.ts`:
  - JPEG magic (FF D8 FF) buffer → `"jpeg"`
  - PNG magic (89 50 4E 47) buffer → `"png"`
  - WebP magic (52 49 46 46 + WEBP at offset 8) buffer → `"webp"`
  - HEIC magic (00 00 00 24 66 74 79 70 68 65 69 63) buffer → `null`
  - 빈 buffer → `null`
  - 8 byte 미만 buffer → `null`
- `stripExifFromImage.test.ts`:
  - `createImageBitmap` mock throw → `{ kind:"error", code:"EXIF_STRIP_FAILED" }`
  - 정상 JPEG → `{ kind:"ok", file: File(type=image/jpeg) }`
- `uploadCatProfilePhoto.test.ts`:
  - MIME 위조 (file.type=image/jpeg + 본문 binary) → `INVALID_FORMAT`
  - HEIC 입력 + strip 실패 → `INVALID_FORMAT`

---

### 2.2 fix-r4-2 — 사용자 흐름 (C2 / C3 / M2 / M3 / M4 / M5)

> **목표**: submit lock / double-click race / UPLOAD_FAILED 후 사용자 갇힘 / 거짓 환영 토스트 / raw stack trace / 옵션 검증 침묵 6 결함 봉쇄.

#### 2.2.1 useCatRegistration.submit 전체 try/catch 감싸기 (C2)

**REJECT 사유**: `await supabase.from("cats").insert(...)` 가 throw 하면 (네트워크 끊김, supabase-js 내부 throw) try/catch 없으므로 status 가 `"submitting"` 영구 유지 → 버튼 영구 disabled.

**파일**: `src/hooks/useCatRegistration.ts`

**구조 변경 (pseudo)**:

```
const submit = useCallback(async (draft) => {
  try {
    /* 1) validation */
    /* 2) cats INSERT */
    /* ... 기존 본문 ... */
  } catch (err) {
    logger.error("useCatRegistration.submit.unexpected", err, { homeId });
    return failWith("UNKNOWN", CAT_MESSAGES.unknownError);
  }
}, [...]);
```

**failWith 동작 재확인**: 에러 status 로 전환 → 버튼 disabled 해제. UI 는 errorBanner 표시.

#### 2.2.2 CatRegistrationScreen onSubmit try/catch 보강 (C2 방어)

**파일**: `src/app/cats/new/CatRegistrationScreen.tsx`

**구조 변경 (pseudo)**:

```
const onSubmit = useCallback(async () => {
  try {
    const errs = validateCatDraft(draft);
    setErrors(errs);
    if (errs.length > 0) {
      // M5 — 옵션 필드 에러 포함 시 자동 펼침
      const hasOptionalFieldError = errs.some(e =>
        ["weightKg", "medicalNotes", "medications", "supplements", "litterType", "foodType", "isNeutered"].includes(e.field)
      );
      if (hasOptionalFieldError && !showOptional) setShowOptional(true);
      return;
    }
    const result = await submit(draft);
    if (result.kind === "ok") {
      // M3 — alreadyExisted 분기
      if (result.alreadyExisted) {
        window.sessionStorage.setItem(ALREADY_TOAST_KEY, draft.name.trim());
      } else {
        window.sessionStorage.setItem(WELCOME_TOAST_KEY, draft.name.trim());
      }
      router.refresh();
      router.replace("/");
      return;
    }
    // M2 — UPLOAD_FAILED 시 catId 보존 (아래 §2.2.4)
    if (result.code === "UPLOAD_FAILED" && result.catId) {
      setUploadFailedCatId(result.catId);
    }
  } catch (err) {
    logger.error("CatRegistrationScreen.onSubmit.unexpected", err);
    // submit 안에서 이미 try/catch — 도달 가능성 낮으나 방어적.
  } finally {
    submittingRef.current = false; // C3 동기 가드 해제
  }
}, [draft, submit, router, showOptional]);
```

#### 2.2.3 submittingRef 동기 가드 (C3)

**REJECT 사유**: `disabled={submitting}` 는 `useState` 비동기 → onClick 두 번이 같은 렌더 사이클에 통과 가능. 두 번째 클릭은 INSERT 한 번 더 → 23505 → recheck → success → Storage 2장 orphan.

**수정 방안**: `useRef<boolean>` 동기 가드.

**파일**: `src/app/cats/new/CatRegistrationScreen.tsx`

```
const submittingRef = useRef<boolean>(false);

const onSubmit = useCallback(async () => {
  if (submittingRef.current) return; // C3 — 두 번째 클릭 즉시 reject
  submittingRef.current = true;
  try {
    /* ... §2.2.2 본문 ... */
  } finally {
    submittingRef.current = false;
  }
}, [...]);
```

> 이유: `useCallback` 의 `setStatus({ kind:"submitting" })` 직후 React 가 렌더를 마치기 전에 두 번째 onClick 이 들어오면 첫 번째는 아직 disabled 가 적용 안 된 상태. ref 는 동기.

#### 2.2.4 UPLOAD_FAILED 시 retry 액션 2종 (M2)

**REJECT 사유**: `RegistrationResult.error.catId` 를 회수만 했지 UI 가 활용 안 함. 사용자는 errorBanner 만 보고 "재시도" 누르면 INSERT 가 한 번 더 → 23505 → recheck.

**수정 방안**:

1. `useCatRegistration` 에 `retryPhotoUpload(catId, file): Promise<RegistrationResult>` 메서드 추가.
2. CatRegistrationScreen 이 `uploadFailedCatId` state 보유 → ErrorBanner 에 액션 버튼 2개.

**파일**: `src/hooks/useCatRegistration.ts`

**시그니처 추가**:

```ts
export type UseCatRegistrationResult = {
  state: RegistrationState;
  errorMessage: string | null;
  submit: (draft: CatDraft) => Promise<RegistrationResult>;
  retryPhotoUpload: (catId: string, file: File) => Promise<RegistrationResult>; // 신설
  reset: () => void;
};
```

**`retryPhotoUpload` 행동**:

1. `transitionTo({ kind:"submitting" })`.
2. `extractHsvFromPhoto` + `uploadCatProfilePhoto` + UPDATE cats — submit 의 단계 4~6 재실행.
3. UPDATE 실패 → orphan 정리 (§2.2.7) + `failWith("UPLOAD_FAILED", ..., { catId })` (catId 보존).
4. 정상 → `{ kind:"ok", catId, photoUploaded: true, alreadyExisted: false }`.

**ErrorBanner UI**: `CatRegistrationScreen.tsx`

```
{errorMessage && (
  <div role="alert" ref={errorBannerRef} className={styles.errorBanner}>
    <p>{errorMessage}</p>
    {uploadFailedCatId && draft.photoFile && (
      <div className={styles.errorActions}>
        <button onClick={() => retryPhotoUpload(uploadFailedCatId, draft.photoFile!)}>사진 다시 시도하기</button>
        <button onClick={() => router.replace("/")}>사진 없이 완료하기</button>
      </div>
    )}
  </div>
)}
```

> CSS: `.errorActions` flex / gap 8 — fix-r4-3 의 CSS Modules 분리 commit 에 묶지 않고 본 commit 에 포함 (사용자 흐름 commit).

#### 2.2.5 alreadyExisted 분기 (M3)

**REJECT 사유**: recheck 매칭 시 `RegistrationResult.ok` 반환하고 화면이 `WELCOME_TOAST_KEY` 에 이름 저장 → 홈에서 "🎉 환영해요" 표시. 실제는 이미 등록된 고양이 (1주일 전).

**수정 방안**: `RegistrationResult.ok` 에 `alreadyExisted: boolean` 추가.

**파일**: `src/hooks/useCatRegistration.ts`

**시그니처 변경**:

```ts
export type RegistrationResult =
  | { kind: "ok"; catId: string; photoUploaded: boolean; alreadyExisted: boolean } // alreadyExisted 추가
  | { kind: "error"; ... };
```

**행동 명세**:

- 정상 INSERT → `alreadyExisted: false`.
- 23505 recheck 매칭 (existing.id 발견) → `alreadyExisted: true`.

**파일**: `src/app/cats/new/CatRegistrationScreen.tsx`

**상수 추가**:

```ts
const WELCOME_TOAST_KEY = "cat-welcome-name";       // 신규 등록
const ALREADY_TOAST_KEY = "cat-already-exists-name"; // 이미 등록
```

**파일**: `src/components/home/HomeProfileRow.tsx`

**행동 분기 (pseudo)**:

```
useEffect(() => {
  const welcomeName = sessionStorage.getItem(WELCOME_TOAST_KEY);
  const alreadyName = sessionStorage.getItem(ALREADY_TOAST_KEY);
  if (welcomeName) {
    setToast({ kind: "welcome", text: `🎉 ${welcomeName} 환영해요!` });
    sessionStorage.removeItem(WELCOME_TOAST_KEY);
  } else if (alreadyName) {
    setToast({ kind: "already", text: CAT_MESSAGES.alreadyRegistered });
    sessionStorage.removeItem(ALREADY_TOAST_KEY);
  }
  /* 3.5초 후 자동 해제 */
}, []);
```

#### 2.2.6 user-friendly 한국어 에러 메시지 (M4)

**REJECT 사유**: `${CAT_MESSAGES.insertFailedPrefix}${insertError.message}` 가 PostgREST 의 `duplicate key value violates unique constraint "cats_pkey"` 같은 영어 stack trace 를 사용자에 노출. 한국어 톤과 충돌.

**수정 방안**: `RegistrationResult.error.message` 는 항상 한국어 user-friendly. raw 는 logger 로만.

**파일**: `src/hooks/useCatRegistration.ts`

**`failWith` 호출 패턴 (pseudo)**:

```
// 이전 (NG)
const message = `${CAT_MESSAGES.insertFailedPrefix}${insertError?.message ?? ""}`.trim();
logger.error("...", insertError);
return failWith("INSERT_FAILED", message);

// 이후 (OK)
logger.error("useCatRegistration.insert", insertError, { homeId, code: insertError?.code });
return failWith("INSERT_FAILED", CAT_MESSAGES.insertFailedGeneric);
```

**`messages.ts` 신설/변경**:

```ts
// 변경 — Prefix 패턴 제거
insertFailedGeneric: "등록에 실패했어요. 잠시 후 다시 시도해 주세요.",
photoUpdateFailedGeneric: "사진은 올렸지만 프로필에 반영하지 못했어요. 잠시 후 다시 시도해 주세요.",
photoUploadFailedGeneric: "사진 업로드에 실패했어요. 다른 사진으로 다시 시도해 주세요.",
photoSizeTooLarge: "사진은 5MB 이하로 올려주세요.",
// 기존 photoMimeInvalid 그대로
```

> 정책: `${prefix}${error.message}` 패턴은 본 commit 으로 **0회** 가 되어야 한다. 검색 grep `\${.*\.message}` 로 확인.

**파일**: `src/lib/cat/uploadCatProfilePhoto.ts`

**변경**:

- `message: \`사진 업로드에 실패했어요. (${uploadError.message})\`` →
- `message: CAT_MESSAGES.photoUploadFailedGeneric;`
- raw 는 `logger.error("uploadCatProfilePhoto.storage", uploadError, { path })` (기존 유지).

#### 2.2.7 옵션 자동 펼침 + top-level 배너 + scrollIntoView (M5)

**§2.2.2 의 onSubmit 본문에 포함** — `errs.some(e => 옵션 필드)` → `setShowOptional(true)`.

**추가 UI**: `errors.length > 0` 일 때 `errorMessage` 와 동일 위치 (`<div role="alert" ref={errorBannerRef}>`) 에 `"입력값을 확인해 주세요"` (CAT_MESSAGES.validationGeneric) top-level 배너 표시. 기존 `errorMessage` (훅의 status.message) 는 submit 단계 에러용 — 둘은 동시에 나오지 않는다 (errors 가 있으면 submit 호출 자체 안 함).

```
const showValidationBanner = errors.length > 0;
{(errorMessage || showValidationBanner) && (
  <div role="alert" ref={errorBannerRef} className={styles.errorBanner}>
    {showValidationBanner ? CAT_MESSAGES.validationGeneric : errorMessage}
    {/* M2 액션 버튼 (uploadFailedCatId) */}
  </div>
)}
```

**scrollIntoView**: 기존 `useEffect` 의 deps 를 `[errorMessage, showValidationBanner]` 로 확장.

#### 2.2.8 UPDATE 실패 시 Storage orphan 정리 (C3 연계)

**REJECT 사유**: UPDATE 실패 시 Storage 에는 사진이 올라간 상태로 남음. 다음 retry 또는 다음 등록에서 같은 path 가 timestamp 차이로 또 올라감 → 누적.

**수정 방안**: UPDATE 실패 분기에서 Storage path 즉시 삭제 시도 (실패해도 무시 — best effort).

**파일**: `src/hooks/useCatRegistration.ts`

```
if (updateError) {
  /* fix R4-2 — Storage orphan 정리 (best effort) */
  try {
    await supabase.storage.from("cat-moments").remove([uploadResult.path]);
  } catch (cleanupErr) {
    logger.warn("useCatRegistration.update.cleanup", "orphan storage remove 실패", { path: uploadResult.path });
  }
  logger.error("useCatRegistration.update", updateError, { catId });
  return failWith("UPLOAD_FAILED", CAT_MESSAGES.photoUpdateFailedGeneric, { catId });
}
```

> `uploadResult.path` 는 `UploadResult.ok.path` 에 이미 있음 (기존 시그니처).

#### 2.2.9 fix-r4-2 검증 명령

```
pnpm tsc --noEmit
pnpm vitest run src/hooks/__tests__/useCatRegistration.test.ts
pnpm vitest run src/app/cats/new/__tests__/CatRegistrationScreen.test.tsx  # 신설
pnpm next build
```

**신설/갱신 vitest 케이스**:

- `useCatRegistration.test.ts`:
  - submit 내 supabase throw → `{ kind:"error", code:"UNKNOWN" }` (status 가 idle 또는 error 로 풀림 — submitting 영구 lock 아님)
  - 23505 recheck 매칭 → `{ kind:"ok", alreadyExisted: true }`
  - UPDATE 실패 → Storage `remove` 호출됨 (mock 검증)
  - `retryPhotoUpload(catId, file)` 정상 → `{ kind:"ok", photoUploaded: true }`
  - `RegistrationResult.error.message` 가 영어 stack trace 미포함 (모든 에러 분기에서 `CAT_MESSAGES.*` 만)
- `CatRegistrationScreen.test.tsx` (신설):
  - 빠른 클릭 2회 → submit mock 호출 1회만 (submittingRef 동기 가드)
  - validation 에러에 `weightKg` 포함 + `showOptional=false` → `setShowOptional(true)` 발동
  - `result.alreadyExisted=true` → `sessionStorage.cat-already-exists-name` 설정 (cat-welcome-name 미설정)
  - UPLOAD_FAILED 결과 → "사진 다시 시도하기" / "사진 없이 완료하기" 버튼 렌더

---

### 2.3 fix-r4-3 — 단순화 / 일관 (M1 / M6 / M7 / M8 / m14 / m15 / m16 / m18 / m19)

> **목표**: 함수형 setter 누락 / 상수 단일 출처 위반 / 매직 넘버 / docs ↔ code 불일치 / 본문 중복 / Picker errorMessage 미전달 9 결함 정리.

#### 2.3.1 useCatDraftUpdater 헬퍼 (M1)

**REJECT 사유**: `CatProfileForm` 만 fix R5-E3 적용 (`onChange((prev) => ...)`, deps `[onChange]`) — 자식 `CatHealthFields` / `CatLifestyleFields` 는 여전히 `onChange({ ...draft, [key]: value })`, deps `[draft, onChange]` → memo 효과 무효.

**수정 방안**: 헬퍼 훅으로 동일 패턴 강제.

**파일 신설**: `src/hooks/useCatDraftUpdater.ts`

**시그니처**:

```ts
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { CatDraft } from "@/types/cat";

/**
 * CatDraft 의 단일 필드 업데이트 setter 를 useCallback 으로 안정화 반환.
 * deps = [onChange] 만 — 함수형 setter 패턴 (prev => ...).
 *
 * @example
 *   const update = useCatDraftUpdater(onChange);
 *   update("name", "나비");
 */
export function useCatDraftUpdater(
  onChange: Dispatch<SetStateAction<CatDraft>>,
): <K extends keyof CatDraft>(key: K, value: CatDraft[K]) => void;
```

**호출 변경**:

- `src/app/cats/new/CatProfileForm.tsx` — 기존 inline `useCallback` 제거, `useCatDraftUpdater(onChange)` 사용.
- `src/app/cats/new/CatHealthFields.tsx` — 동일.
- `src/app/cats/new/CatLifestyleFields.tsx` — 동일.

> 결과: 3 컴포넌트 모두 deps `[onChange]` 만 → memo 효과 회복.

#### 2.3.2 CatPhotoPicker 상수 단일 출처 (M6)

**파일**: `src/app/cats/new/CatPhotoPicker.tsx`

**변경**:

```
// 제거
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = [...];

// 추가
import { MAX_FILE_BYTES, ALLOWED_MIME } from "@/lib/cat/constants";
import { CAT_MESSAGES } from "@/lib/cat/messages";
```

**에러 문자열**:

```
// 제거 — inline 한국어 문자열
"JPG / PNG / WebP / HEIC 형식만 가능해요"
"사진은 5MB 이하로 올려주세요"

// 추가 — messages.ts 사용
CAT_MESSAGES.photoMimeInvalid     // 기존
CAT_MESSAGES.photoSizeTooLarge    // §2.2.6 신설
```

#### 2.3.3 catDraftToInsertPayload 상수 사용 (M7)

**파일**: `src/types/cat.ts`

**변경**:

```
// 제거 (line 106)
const weightValid = Number.isFinite(weightParsed) && weightParsed > 0 && weightParsed <= 30;

// 추가
import { WEIGHT_MIN, WEIGHT_MAX } from "@/lib/cat/constants";
const weightValid =
  Number.isFinite(weightParsed) &&
  weightParsed >= WEIGHT_MIN &&
  weightParsed <= WEIGHT_MAX;
```

> 효과: `validateCatDraft` 와 `catDraftToInsertPayload` 가 동일 임계값 (0.1 / 30) 사용. 0.05 같은 입력이 validate 통과 ↔ payload null 변환되는 모순 제거.

#### 2.3.4 ARCHITECTURE §11.1 표 갱신 (M8 / m19)

**파일**: `docs/ARCHITECTURE.md` §11.1 line 983

**수정**:

```
| 옵션 | 체중 (kg) | `<input type=number>` (0.1~30 CHECK) |
```

**파일**: `docs/ARCHITECTURE.md` §11.1.3 line 1016

**수정**:

```
- 신규 옵션: `is_neutered`, `weight_kg` + CHECK(0.1..30) (fix R1 #6 강화), ...
```

**파일**: `docs/ARCHITECTURE.md` §11.1.1 line 993 (m19)

**수정**:

```
- 알고리즘: 중앙 50% 영역 샘플링 → RGB→HSV → 채도 0.2 이상 + 명도 0.15 이상 픽셀만 →
  Hue 18 bin 히스토그램 → 상위 3 hue 반환
```

#### 2.3.5 ARCHITECTURE §11.6.5 신설 — 체중 0.1 정책 (M8 연계)

**파일**: `docs/ARCHITECTURE.md` §11.6 끝에 추가

```
#### 11.6.5 체중 최소값 0.1 — 입력 실수 차단

`cats.weight_kg` 의 CHECK 가 `>= 0.1` (sql/20260425c_cats_weight_min.sql).
0kg 입력은 사용자 실수 (단위 혼동, 0 자릿수 누락) 가 대부분 — 의미 있는 데이터 없음.
0.1 미만은 신생아도 200g (= 0.2kg) 초과이므로 현실적 하한.

코드 단일 출처: `src/lib/cat/constants.ts` 의 `WEIGHT_MIN = 0.1`.
- `validateCatDraft` (fix R1)
- `catDraftToInsertPayload` (fix R4-3)
- `messages.ts.weightOutOfRange`
- ARCHITECTURE §11.1 표
- sql/20260425c_cats_weight_min.sql CHECK
모두 0.1 사용.
```

#### 2.3.6 CatProfileForm 100줄 분리 (m14)

**REJECT 사유**: 185줄 (코드 품질 기준 100줄 초과). 이름/품종 필드의 label/input/maxLength/aria/error 5블록 패턴이 거의 동일.

**파일 신설**: `src/app/cats/new/CatTextField.tsx`

**시그니처**:

```ts
export type CatTextFieldProps = {
  id: string;                    // "cat-name" / "cat-breed"
  label: string;                 // "이름" / "품종"
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength: number;             // NAME_MAX / BREED_MAX (counter 표시용)
  list?: string;                 // datalist id (품종)
  errorMessage?: string;
};

export const CatTextField: React.MemoExoticComponent<...>;
```

**행동**: label / input / counter (`{maxLength - value.trim().length}자 남음`) / errorMessage 블록 렌더. `aria-required` / `aria-invalid` / `aria-describedby` 세트 자동.

**파일 변경**: `src/app/cats/new/CatProfileForm.tsx`

**변경 후 라인 예측**: ~85줄 (CatTextField 2회 호출 + 생년월일 + 성별 + Picker).

> 예상 LOC: CatProfileForm 185 → 85, CatTextField 신설 ~70줄. 합계 비슷하지만 단일 책임 + 100줄 한도 통과.

#### 2.3.7 computeDominantHues 추출 (m15)

**REJECT 사유**: Worker 와 idle 폴백이 같은 hist 알고리즘 (BIN_COUNT / SAT / VAL / top3) 을 별도 본문으로 보유. 임계값 변경 시 두 곳 동시 수정 필요.

**파일 신설**: `src/lib/cat/computeDominantHues.ts`

**시그니처**:

```ts
import { HSV_BIN_COUNT, HSV_SAT_THRESHOLD, HSV_VAL_THRESHOLD } from "./constants";

/**
 * ImageData → 상위 3 hue (0~360). 비어있으면 빈 배열.
 *
 * 알고리즘:
 *  - RGB(0..255) → HSV(h:0..360, s:0..1, v:0..1)
 *  - 채도 < HSV_SAT_THRESHOLD || 명도 < HSV_VAL_THRESHOLD → skip
 *  - bin = floor(h / 20), max BIN-1
 *  - top 3 bin 의 (idx*20 + 10) 반환
 *
 * 본 함수는 pure (메인 / Worker 동일 동작) — DOM / globalThis 의존 0.
 *
 * @example
 *   const top3 = computeDominantHuesFromImageData(imageData); // [10, 30, 50]
 */
export function computeDominantHuesFromImageData(imageData: ImageData): number[];
```

**호출 변경**:

- `src/workers/extractHsv.worker.ts`:
  - 로컬 `rgbToHsv` / `computeDominantHues` 제거.
  - `import { computeDominantHuesFromImageData } from "../lib/cat/computeDominantHues";`
  - `const top3 = computeDominantHuesFromImageData(imageData);` 호출.
- `src/lib/cat/extractHsvFromPhoto.ts`:
  - `computeOnMainThreadIdle` 본문의 hist 루프를 `computeDominantHuesFromImageData(imageData)` 호출로 단순화.
  - **chunked yield (idle 양보)** 정책은 유지: `computeDominantHuesFromImageData` 자체는 sync 이지만, 호출 전 `await new Promise(resolve => requestIdleCallback ?? setTimeout(resolve, 0))` 한 번 yield. 메인 스레드 양보 효과는 chunk 단위 복잡 yield 보다 단순화.
  - 결과: idle 폴백은 "single yield + 단일 동기 계산" 으로 단순화. 65k 픽셀 모바일 ~80ms (Worker 보다 살짝 느리지만 메인 스레드 1회 점유).

**산정**: 약 -40줄 중복 제거 (computeDominantHues 본문 + rgbToHsv + 정렬/필터 5줄).

#### 2.3.8 emptyHsvProfile wrapper 제거 (m16)

**파일**: `src/lib/cat/extractHsvFromPhoto.ts`

**변경**:

```
// 제거 (line 54-56)
function emptyProfile(): HsvColorProfile {
  return { dominant_hues: [], sample_count: 0, version: "v1" };
}

// 변경 (line 253-255)
export function emptyHsvProfile(): HsvColorProfile {
  return { dominant_hues: [], sample_count: 0, version: "v1" };
}
```

> 효과: 한 함수만 남음. wrapper 의 wrapper 제거.

#### 2.3.9 createImageBitmap 중복 디코드 제거 (m17)

**REJECT 사유**: `extractHsvFromPhoto` 와 `stripExifFromImage` 가 각각 `createImageBitmap(file)` 호출 → 5MB JPEG 모바일 ~200~400ms × 2 = 400~800ms.

**수정 방안 (정책 결정)**:

- 옵션 A: 단일 디코드 후 ImageBitmap 공유 (두 함수 통합).
- 옵션 B: HSV 추출 함수가 `stripExifFromImage` 의 결과 (jpeg File) 를 받아 다시 디코드 (1회만).

**선택**: **옵션 B** — 함수 시그니처 변경 최소화 + EXIF strip 이 먼저 실행되어 단일 jpeg 만 다음 단계로 흘러감 (보안 이득).

**파일**: `src/hooks/useCatRegistration.ts` 호출 순서 변경 (pseudo)

```
// 이전
const hsvResult = await extractHsvFromPhoto(draft.photoFile); // 디코드 1회
const uploadResult = await uploadCatProfilePhoto({ ...; file: draft.photoFile }); // 디코드 1회 (strip)

// 이후
const stripResult = await stripExifFromImage(draft.photoFile); // 디코드 1회 (C1)
if (stripResult.kind === "error") {
  return failWith("UPLOAD_FAILED", CAT_MESSAGES.photoFormatUnsupported, { catId });
}
const strippedFile = stripResult.file;
const hsvResult = await extractHsvFromPhoto(strippedFile); // 디코드 1회 (jpeg 이므로 빠름)
const uploadResult = await uploadCatProfilePhoto({ ...; file: strippedFile, skipStrip: true });
```

**파일**: `src/lib/cat/uploadCatProfilePhoto.ts`

**시그니처 변경**:

```ts
export async function uploadCatProfilePhoto(args: {
  supabase: SupabaseClient;
  homeId: string;
  catId: string;
  file: File;
  skipStrip?: boolean; // 신설 — 호출자가 이미 strip 했으면 true
}): Promise<UploadResult>;
```

**행동**: `skipStrip === true` 면 strip 단계 skip. magic byte 검증은 여전히 수행.

> 결과: 디코드 2회 → 1회. 모바일 ~200ms 절감.

#### 2.3.10 CatProfileForm → CatPhotoPicker errorMessage 전달 (m18)

**파일**: `src/app/cats/new/CatProfileForm.tsx`

**변경**:

```
import { getFieldError } from "@/lib/cat/validateCatDraft";

const photoError = getFieldError(errors, "photoFile");
// ...
<CatPhotoPicker
  file={draft.photoFile}
  onChange={handlePhotoChange}
  errorMessage={photoError}
/>
```

> CatPhotoPicker 의 props 시그니처는 이미 `errorMessage?: string | null` 보유 (line 35) — 변경 불필요.

**파일**: `src/lib/cat/validateCatDraft.ts` (확인 필요)

**행동**: `photoFile` 필드의 검증 (예: 동영상 파일 거부, 5MB 초과) 결과를 `ValidationError[]` 에 포함하도록 확인. 부재 시 본 commit 에 추가:

```ts
// pseudo
if (draft.photoFile) {
  if (!ALLOWED_MIME.includes(draft.photoFile.type as AllowedMime)) {
    errors.push({ field: "photoFile", message: CAT_MESSAGES.photoMimeInvalid });
  }
  if (draft.photoFile.size > MAX_FILE_BYTES) {
    errors.push({ field: "photoFile", message: CAT_MESSAGES.photoSizeTooLarge });
  }
}
```

#### 2.3.11 fix-r4-3 검증 명령

```
pnpm tsc --noEmit
pnpm vitest run src/hooks/__tests__/useCatDraftUpdater.test.ts  # 신설
pnpm vitest run src/lib/cat/__tests__/computeDominantHues.test.ts  # 신설
pnpm vitest run src/lib/cat/__tests__/catDraftToInsertPayload.test.ts  # 갱신/신설
pnpm vitest run src/app/cats/new/__tests__/CatTextField.test.tsx  # 신설
pnpm next build
```

**신설/갱신 vitest 케이스**:

- `useCatDraftUpdater.test.ts`:
  - 동일 onChange → 동일 update 함수 ref (memo 검증 — `result.current === prev.current`)
  - update("name", "나비") → onChange((prev) => ({ ...prev, name: "나비" })) 호출됨
- `computeDominantHues.test.ts`:
  - 빨간 단색 ImageData → `[10]` 또는 `[10, ...]` (hue 0 bin idx 0)
  - 회색 (s < 0.2) ImageData → `[]`
  - 검은색 (v < 0.15) ImageData → `[]`
  - 빨강 50% + 파랑 50% ImageData → `[10, 230]` (top 2)
- `catDraftToInsertPayload.test.ts`:
  - weight=0 → `weight_kg: null` (validate 와 동일 임계값)
  - weight=0.1 → `weight_kg: 0.1`
  - weight=0.05 → `weight_kg: null`
  - weight=30 → `weight_kg: 30`
  - weight=30.01 → `weight_kg: null`
- `CatTextField.test.tsx`:
  - errorMessage 존재 → `aria-invalid="true"` + role="alert" 노드 렌더
  - maxLength=30 + value="나비" → counter "28자 남음" 표시
  - onChange 콜 → 부모 callback 호출

---

### 2.4 fix-r4-4 — 운영 / CI (m9 / m10 / m11 + DOWN 마이그 정합)

> **목표**: precheck 주석 정정 / CI workflow 신설 / logger Sentry 슬롯 + PII 마스킹 / atomic deploy 6단계 명시.

#### 2.4.1 sql/20260425c precheck 주석 정정 (m9)

**파일**: `sql/20260425c_cats_weight_min.sql` line 5

**변경**:

```
-- 이전 (NG — CHECK 가 >= 0.1 인데 precheck 가 = 0)
--   apply 전 SELECT count(*) FROM cats WHERE weight_kg = 0; 이 0 인지 사전 확인 필요.

-- 이후
--   apply 전 SELECT count(*) FROM cats WHERE weight_kg IS NOT NULL AND weight_kg < 0.1; 가 0 인지 사전 확인 필요.
--   ( weight_kg < 0.1 인 row 가 있으면 새 CHECK 위반 → 마이그 실패. 발견 시 row 검토 후 결정. )
```

#### 2.4.2 .github/workflows/ci.yml 신설 (m10)

**파일 신설**: `.github/workflows/ci.yml`

**구조 (pseudo, Dev 가 본문 작성)**:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [master]

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm tsc --noEmit
      - run: pnpm vitest run
      - run: pnpm verify:routes
      - run: pnpm next build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://dummy.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: dummy
          # Next.js 빌드타임 주입 — production env 와 무관, 빌드만 통과시키는 placeholder.
```

> 이유: cat-identity 화면 + 기존 기능 빌드 통과를 PR 머지 전 강제. `verify:routes` (이미 package.json scripts 존재) 가 라우트 manifest 무결성 검증.

#### 2.4.3 package.json scripts chain 정책 결정 (m10 연계)

**옵션 A**: `build` 스크립트에 verify 추가 (`build`: `node scripts/copy-onnx-wasm.js && pnpm verify:routes && next build`).

**옵션 B**: CI workflow 에서 step 분리 (현재 §2.4.2 가 옵션 B).

**선택**: **옵션 B** — 로컬 dev `pnpm build` 가 verify 실패로 막히지 않게. CI 에서 강제 (PR 머지 차단).

**package.json 변경 0** (현재 그대로 유지).

#### 2.4.4 logger.ts Sentry 슬롯 + PII 마스킹 (m11)

**REJECT 사유**: production 에서 `console.error` 가 그대로 노출 → Vercel Functions 로그에 owner_id / email 같은 PII 가 그대로. Sentry/Datadog 같은 외부 transport 없음.

**수정 방안**:

1. PII 마스킹 함수 추가 — context 객체의 특정 키 (`owner_id` / `email` / `home_id` 의 일부) 자동 마스크.
2. Sentry transport 슬롯 — `process.env.NEXT_PUBLIC_SENTRY_DSN` 존재 시 hook 호출 (실제 dependency 추가 안 함, if-block 만).

**파일**: `src/lib/observability/logger.ts`

**시그니처 (확장, pseudo)**:

```ts
type LogContext = Record<string, unknown>;

const PII_KEYS = new Set(["owner_id", "email", "phone", "user_id"]);

function maskValue(key: string, value: unknown): unknown {
  if (!PII_KEYS.has(key)) return value;
  if (typeof value !== "string") return "***";
  // 앞 4자 + ***
  return value.length <= 4 ? "***" : `${value.slice(0, 4)}***`;
}

function maskContext(ctx: LogContext): LogContext {
  const out: LogContext = {};
  for (const [k, v] of Object.entries(ctx)) out[k] = maskValue(k, v);
  return out;
}

function emitToSentry(scope: string, level: "warn" | "error", message: string, ctx?: LogContext): void {
  if (typeof window === "undefined") return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  // 실제 Sentry SDK 연동은 후속 PR (의존성 추가 시점). 본 commit 은 슬롯만.
  // window.__SENTRY_HUB__?.captureMessage(...);
}

export const logger = {
  warn(scope, message, ctx) {
    const masked = ctx ? maskContext(ctx) : undefined;
    if (masked) console.warn(format(scope, message), masked);
    else console.warn(format(scope, message));
    emitToSentry(scope, "warn", message, masked);
  },
  error(scope, error, ctx) {
    const message = error instanceof Error ? error.message : String(error);
    const masked = ctx ? maskContext(ctx) : undefined;
    if (masked) console.error(format(scope, message), { error, ...masked });
    else console.error(format(scope, message), { error });
    emitToSentry(scope, "error", message, masked);
  },
};
```

> 효과: `useCatRegistration` 의 `logger.error("...", err, { homeId })` 가 `homeId: "abcd***"` 로 마스킹.

#### 2.4.5 ARCHITECTURE §11.6.1 atomic deploy 6단계 (DOWN 마이그 정합 — fix-r4-1 §2.1.7 와 연계 갱신)

**§2.1.7 의 6단계** 가 본 commit 에서 한 번 더 검토:

- 5단계 검증 SELECT 의 정의: `SELECT count(*) FROM public.cats;` (가족 사용자 세션) 가 로컬 dev 환경에서는 0 일 수 있다. 정책: **사장님 본인 home 의 cats 가 RLS 통과하는지** 만 확인.
- 6단계 rollback 절차: `sql/20260425b_cats_rls_policies_rollback.sql` + Vercel Instant Rollback. 시간 임계값: 베타 모드 5초 (CLAUDE.md 운영 모드 표).

본 commit 은 §11.6.1 본문이 fix-r4-1 의 §2.1.7 변경과 동일함을 확인. 추가 변경 없음.

#### 2.4.6 fix-r4-4 검증 명령

```
pnpm tsc --noEmit
pnpm vitest run src/lib/observability/__tests__/logger.test.ts  # 신설
# CI workflow 자체는 push 후 GitHub Actions 에서 검증 (로컬 act 옵션 가능)
pnpm next build
```

**신설 vitest 케이스**:

- `logger.test.ts`:
  - `logger.error("test", err, { owner_id: "abc-def-ghi" })` → console.error 호출 시 인자에 `owner_id: "abc-***"` 포함 (raw 미포함)
  - `logger.warn("test", "msg", { home_id: "xyz", non_pii: "ok" })` → home_id 마스킹, non_pii 그대로
  - `process.env.NEXT_PUBLIC_SENTRY_DSN` 미설정 → emitToSentry 가 noop

---

### 2.5 fix-r4-5 — 마무리 / 테스트 (m12 / m13 / m20 / m21 / m22)

> **목표**: vitest stderr noise / 문서 baseline / sample_count 모순 / isDirty 매 렌더 trim / docstring 거짓 5 결함 정리.

#### 2.5.1 extractHsvFromPhoto.test.ts canvas getContext mock (m12)

**REJECT 사유**: jsdom 에 canvas 가 없음 → `HTMLCanvasElement.prototype.getContext` 가 `null` 또는 throw. 테스트 stderr 에 `Error: Not implemented: HTMLCanvasElement.prototype.getContext` 노이즈.

**수정 방안**: setupFiles 또는 beforeAll mock.

**파일**: `src/lib/cat/__tests__/extractHsvFromPhoto.test.ts`

**변경 (pseudo)**:

```ts
import { beforeAll, vi } from "vitest";

beforeAll(() => {
  if (typeof HTMLCanvasElement !== "undefined") {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  }
});
```

**대안 (vitest 전역 setup)**: `vitest.config.ts` 의 `setupFiles` 에 `src/test/canvas-mock.ts` 신설하여 모든 테스트에 적용. 결정: **로컬 beforeAll** (영향 범위 최소화).

#### 2.5.2 docs/cat_identity_tier1_r1.md baseline 갱신 (m13)

**파일**: `docs/cat_identity_tier1_r1.md`

**변경 사항**:

1. **vitest baseline**: line 53 `10 files / 109 passed` → `10+ files / 127 passed` (현재 fix R3 까지의 테스트 수). fix-r4 후 신설 테스트 (detectImageMagic / stripExif union / uploadCatProfilePhoto / useCatDraftUpdater / computeDominantHues / catDraftToInsertPayload / CatTextField / CatRegistrationScreen / logger / extractHsv 의 sample_count) 까지 더하면 ~145 예상 — 실제 count 는 Dev 가 실행 후 채움.
2. **Atomic commit 표 확장** (line 42-48 이후):

```
### fix R1 (4 commit)
| # | hash | 내용 |
|---|---|---|
| R1-1 | 70acc70 | 보안 (RLS / EXIF / timeout / XSS) |
| R1-2 | 50a9a49 | 성능 (HSV Worker / CLS / transition / memo) |
| R1-3 | 75a18cc | 사용자 마찰 (race / state / banner / cache / cancel / toast) |
| R1-4 | 36b26d9 | 단순화 (split / lengthError / status union) |
| R1-5 | 74399a5 | R9 정리 (tests / logger / a11y / messages / constants) |
| R1-6 | 0e5b479 | LOW (manifest CI / counter / weight 0.1 SQL) |
| R1-7 | d21cacd | Tier 1 문서 갱신 |

### fix R2 (2 commit)
| R2-1 | ead02e2 | validateCatDraft 헬퍼 + Status transitionTo |
| R2-2 | 78c9621 | Worker transferable + memo + CSS 폴백 |

### fix R3 (3 commit)
| R3-1 | 0e01620 | constants/messages/logger 한국어 + isWorkerSupported |
| R3-2 | a8c89e6 | UPLOAD catId / recheck error / useCallback 함수형 setter |
| R3-3 | 61457f3 | RLS 마이그 atomic deploy 절차 명시 |

### fix R4 (5 commit, 본 PR)
| R4-1 | (TBD) | 보안 — HEIC EXIF union / RLS idempotent / homes 사전 검증 / magic byte |
| R4-2 | (TBD) | 사용자 흐름 — try/catch / submittingRef / alreadyExisted / user-friendly msg / 옵션 자동 펼침 |
| R4-3 | (TBD) | 단순화 — useCatDraftUpdater / Picker 단일 출처 / weight WEIGHT_MIN / docs 일치 / CatTextField / computeDominantHues |
| R4-4 | (TBD) | 운영 — precheck 정정 / .github/ci.yml / logger Sentry 슬롯 + PII 마스킹 |
| R4-5 | (TBD) | 마무리 — canvas mock / baseline 갱신 / sample_count empty / isDirty useMemo / docstring 정정 |
```

#### 2.5.3 sample_count empty 정정 (m20)

**REJECT 사유**: top3 가 빈 배열 (HSV 추출 후 모든 픽셀이 회색/어두움) 일 때 `sample_count: 1` 반환. 의미상 "1 sample 분석했는데 dominant hue 가 없음" → DB 에 저장된 후 Tier 2 의 `sample_count > 0` 조건이 의도와 다르게 매칭.

**수정 방안**: `top3.length > 0 ? 1 : 0`.

**파일**: `src/workers/extractHsv.worker.ts` line 95-98 영역

**변경 (pseudo)**:

```
const top3 = computeDominantHuesFromImageData(imageData); // fix-r4-3 §2.3.7 적용 후
const profile: HsvColorProfile = {
  dominant_hues: top3,
  sample_count: top3.length > 0 ? 1 : 0,
  version: "v1",
};
```

**파일**: `src/lib/cat/extractHsvFromPhoto.ts` line 154 영역

**변경 (pseudo)**:

```
const top3 = computeDominantHuesFromImageData(imageData); // fix-r4-3 §2.3.7 적용 후
return { dominant_hues: top3, sample_count: top3.length > 0 ? 1 : 0, version: "v1" };
```

**파일**: `src/lib/cat/__tests__/computeDominantHues.test.ts` (fix-r4-3 §2.3.11 신설 파일에 case 추가)

**신설 case**:

- `computeDominantHuesFromImageData(회색 ImageData)` → `[]`
- 그리고 호출자 (extractHsvFromPhoto) 단위 테스트에서 `sample_count: 0` 검증.

#### 2.5.4 isDirty useMemo (m21)

**REJECT 사유**: `CatRegistrationScreen` 의 `isDirty` 가 매 렌더 trim ×10 호출. draft 변경 안 해도 errorBanner / showOptional 변경마다 재계산.

**수정 방안**: `useMemo`.

**파일**: `src/app/cats/new/CatRegistrationScreen.tsx`

**변경 (pseudo)**:

```ts
const isDirty = useMemo(
  () =>
    draft.name.trim() !== "" ||
    draft.breed.trim() !== "" ||
    draft.birthDate !== "" ||
    draft.photoFile !== null ||
    draft.weightKg.trim() !== "" ||
    draft.medicalNotes.trim() !== "" ||
    draft.medications.trim() !== "" ||
    draft.supplements.trim() !== "" ||
    draft.litterType !== "" ||
    draft.foodType.trim() !== "",
  [draft],
);
```

`useMemo` import 추가.

#### 2.5.5 CatRegistrationScreen.tsx:13 docstring 정정 (m22)

**REJECT 사유**: `useEffect 0개` 라고 적혀있으나 errorBanner scrollIntoView (line 71-75) 가 1개.

**수정 방안**:

**파일**: `src/app/cats/new/CatRegistrationScreen.tsx` line 11-14 영역

**변경**:

```
 *  - useState 3개 (draft / showOptional / errors) — 한도 8 내
 *  - useEffect 1개 (errorBanner scrollIntoView, fix R1 #3)
 *  - 본 파일 단독 LOC 100 라인 근처 유지 (필수/옵션 섹션은 각 서브 컴포넌트로 분리)
```

> 단, fix-r4-2 의 submittingRef + uploadFailedCatId state 추가로 useState 가 4개 (draft / showOptional / errors / uploadFailedCatId) + useRef 1개 가 됨. docstring 도 `useState 4개 + useRef 1개` 로 갱신.

#### 2.5.6 fix-r4-5 검증 명령

```
pnpm tsc --noEmit
pnpm vitest run src/lib/cat/__tests__/extractHsvFromPhoto.test.ts  # canvas mock + sample_count empty
pnpm vitest run src/lib/cat/__tests__/computeDominantHues.test.ts  # sample_count empty 회귀
pnpm vitest run src/app/cats/new/__tests__/CatRegistrationScreen.test.tsx  # isDirty useMemo (스냅샷)
pnpm next build
```

**신설/갱신 vitest 케이스**:

- `extractHsvFromPhoto.test.ts`:
  - beforeAll mock 후 stderr 에 "HTMLCanvasElement.prototype.getContext" 문자열 0회.
  - 회색 ImageData 입력 → `{ kind:"ok", profile: { dominant_hues: [], sample_count: 0 } }`.
- `CatRegistrationScreen.test.tsx`:
  - `draft` 미변경 + `showOptional` toggle → `isDirty` 계산 함수 호출 1회 (useMemo 효과, render-counter 활용).

---

## 3. ARCHITECTURE.md / docs/cat_identity_tier1_r1.md 변경 사항 표

### 3.1 docs/ARCHITECTURE.md

| 절 | line | 변경 | 결함 |
|---|---|---|---|
| §11.1 | 983 | `0~30 CHECK` → `0.1~30 CHECK` | M8 |
| §11.1.1 | 993 | 알고리즘 라인 `채도 0.2 이상` → `채도 0.2 이상 + 명도 0.15 이상` | m19 |
| §11.1.3 | 1016 | `weight_kg + CHECK(0..30)` → `weight_kg + CHECK(0.1..30) (fix R1 #6 강화)` | M8 |
| §11.6.1 | 1067 | atomic deploy 5단계 → 6단계 (homes RLS 사전 검증 4건 추가) | C5 |
| §11.6.5 | 신설 | "체중 최소값 0.1 — 입력 실수 차단" — code 단일 출처 5곳 명시 | M8 / m9 |

### 3.2 docs/cat_identity_tier1_r1.md

| 절 | line | 변경 | 결함 |
|---|---|---|---|
| 검증 게이트 | 53 | `109 passed` → 실제 fix-r4 후 count (~145 예상, Dev 측정) | m13 |
| Atomic commit | 42-48 이후 | fix R1 (7 commit) / fix R2 (2) / fix R3 (3) / fix R4 (5) 표 추가 | m13 |
| 검증 게이트 | 53 | `pnpm verify:routes` + `pnpm tsc` + `pnpm vitest run` + `pnpm next build` 4종 명시 | m10 |

---

## 4. 검증 명령 (commit 별 합산)

각 commit push 직후 Dev 가 실행하는 명령:

| commit | 명령 | 기대 결과 |
|---|---|---|
| **fix-r4-1** | `pnpm tsc --noEmit` | exit 0 (union 타입 변경 후 호출자 모두 분기 처리 확인) |
| | `pnpm vitest run src/lib/cat/__tests__/detectImageMagic.test.ts` | 신설 6 case PASS |
| | `pnpm vitest run src/lib/cat/__tests__/stripExifFromImage.test.ts` | union 분기 PASS |
| | `pnpm vitest run src/lib/cat/__tests__/uploadCatProfilePhoto.test.ts` | INVALID_FORMAT 분기 PASS |
| | `pnpm next build` | 성공 |
| **fix-r4-2** | `pnpm tsc --noEmit` | exit 0 |
| | `pnpm vitest run src/hooks/__tests__/useCatRegistration.test.ts` | UNKNOWN catch / alreadyExisted / retryPhotoUpload / orphan remove PASS |
| | `pnpm vitest run src/app/cats/new/__tests__/CatRegistrationScreen.test.tsx` | submittingRef / 옵션 자동 펼침 / 토스트 분기 PASS (신설) |
| | `pnpm next build` | 성공 |
| **fix-r4-3** | `pnpm tsc --noEmit` | exit 0 |
| | `pnpm vitest run src/hooks/__tests__/useCatDraftUpdater.test.ts` | memo ref 안정 PASS |
| | `pnpm vitest run src/lib/cat/__tests__/computeDominantHues.test.ts` | hist 4 case PASS |
| | `pnpm vitest run src/lib/cat/__tests__/catDraftToInsertPayload.test.ts` | weight 임계 5 case PASS |
| | `pnpm vitest run src/app/cats/new/__tests__/CatTextField.test.tsx` | aria / counter PASS (신설) |
| | `pnpm next build` | 성공 |
| **fix-r4-4** | `pnpm tsc --noEmit` | exit 0 |
| | `pnpm vitest run src/lib/observability/__tests__/logger.test.ts` | PII 마스킹 PASS (신설) |
| | `pnpm verify:routes` | manifest 무결성 PASS |
| | `pnpm next build` | 성공 |
| | (CI) `act -j build` 또는 push 후 GitHub Actions | green |
| **fix-r4-5** | `pnpm tsc --noEmit` | exit 0 |
| | `pnpm vitest run` (전체) | 신설 포함 ~145 case PASS, stderr noise 0 |
| | `pnpm next build` | 성공 |

---

## 5. Rollback 매트릭스

각 commit 의 단독 git revert 가능 여부 + DB 마이그 rollback 경로.

| commit | 단독 revert 가능 | DB 마이그 영향 | rollback 경로 |
|---|---|---|---|
| **fix-r4-1** | **불가** (단일 PR atomic deploy — RLS SQL + magic byte + EXIF union 한 묶음) | sql/20260425b 본문 변경 (idempotent 화) + sql/20260425b_rollback 신설 + sql/20260425c_rollback 신설 | 1) Vercel Instant Rollback (이전 commit ID) 2) sql/20260425b_cats_rls_policies_rollback.sql 적용 3) src 코드는 git revert |
| **fix-r4-2** | **가능** (사용자 흐름 — UI 상태 + 헬퍼만, DB 무관) | 없음 | git revert fix-r4-2 → 사용자 갇힘 / 거짓 토스트 재발 (수용 불가, 재 fix 필요) |
| **fix-r4-3** | **가능** (단순화 — types/cat.ts WEIGHT_MIN 변경 + 신설 헬퍼/유틸) | 없음 | git revert fix-r4-3 → CatPhotoPicker 로컬 상수 / CatProfileForm 185줄 / docs 불일치 재발 |
| **fix-r4-4** | **가능** (CI workflow 신설 + logger 확장 + sql precheck 주석) | 없음 (sql 본문 미변경, 주석만) | git revert fix-r4-4 → CI 부재 + logger PII 노출 재발 |
| **fix-r4-5** | **가능** (테스트 mock + docs 갱신 + sample_count 1줄) | 없음 | git revert fix-r4-5 → vitest stderr noise + sample_count 모순 재발 |

**복합 rollback (fix-r4-1 + 2 동시)**:

- 시나리오: 머지 후 RLS 적용 직후 사용자 SELECT 0 row 폭증.
- 절차:
  1. Vercel Instant Rollback (이전 commit, 베타 5초 임계 — CLAUDE.md 운영 모드 표).
  2. Supabase MCP `apply_migration sql/20260425b_cats_rls_policies_rollback.sql`.
  3. fix-r4-1 + fix-r4-2 atomic deploy 가 src 코드와 SQL 양쪽이라, src 는 git revert 후 redeploy. SQL 은 rollback.sql.
- 대상자: 사장님 + Claude (베타 모드, 7명 사용자).

**rollback 검증 SQL (fix-r4-1)**:

```sql
-- rollback 직후 확인
SELECT relrowsecurity FROM pg_class WHERE relname = 'cats';
-- 결과: f (RLS DISABLE 됨)
SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cats';
-- 결과: 0
```

---

## 6. 자가 진술 (검증)

- **28건 매핑 누락 0건** — §1 표 28행, §2 의 5 commit 섹션 합계 28건 (4 + 6 + 9 + 4 + 5).
- **무효 키워드 사용 0건** — 본 문서에서 다음 7 키워드 사용 0회 검색 (Dev 가 grep 으로 재검증):
  `minor 권고` / `강제 아님` / `이 정도면 됐지` / `프로덕션 영향 없음` / `추후 정리 권장` / `선택적 개선` / `스타일 차원`.
- **코드 본체 0줄** — 모든 코드 블록은 시그니처 / SQL pseudo / 주석 정확 텍스트 / 호출 패턴 변경만. 함수 본문 (loop / branch 본문) 작성 0건.
- **commit 별 단독 빌드 가능** — §4 검증 명령 표에서 각 commit 의 `pnpm next build` 가 성공 조건. fix-r4-1 의 sql 변경은 atomic deploy 절차 (§2.1.7) 로 별도 진행.
- **무자비한 프로토콜 5 RULE 위반 0건** — Arch (본 Agent) 는 코드 작성 안 함, Dev / QA 와 분리, fix-r4-design branch 단독 산출물.

---

## 7. Dev Agent 인계 메모

본 설계서를 Dev Agent (2번) 가 받아 다음 순서로 구현:

1. `git checkout -b fix-r4-work fix-r4-design` (또는 `61457f3`).
2. **fix-r4-1** 부터 순차 commit. 각 commit 후 §4 검증 명령 실행, 모두 PASS 후 다음 commit.
3. 각 commit message 양식:
   - `fix(cat-identity): fix-r4-1 — 보안 (HEIC EXIF union / RLS idempotent / homes 사전 검증 / magic byte)`
   - `fix(cat-identity): fix-r4-2 — 사용자 흐름 (try/catch / submittingRef / alreadyExisted / user-friendly msg / 옵션 자동 펼침)`
   - `fix(cat-identity): fix-r4-3 — 단순화 (useCatDraftUpdater / Picker 단일 출처 / WEIGHT_MIN / CatTextField / computeDominantHues / docs 일치)`
   - `chore(cat-identity): fix-r4-4 — 운영 (precheck / .github/ci.yml / logger Sentry 슬롯 + PII 마스킹)`
   - `test(cat-identity): fix-r4-5 — 마무리 (canvas mock / baseline / sample_count empty / isDirty useMemo / docstring 정정)`
4. 5 commit 모두 push 후 PR 생성 (베이스 master, 헤드 fix-r4-work). PR 본문에 본 설계서 링크 + Rollback 매트릭스 요약.
5. QA Agent (3번) 가 본 설계서 + Dev 산출물을 처음 보는 눈으로 검토. 9라운드 + Level 3 (사용자 데이터 영향 + RLS).

---

(끝.)
