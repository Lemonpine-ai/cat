# cat-identity Tier 1 — QA fix-r5 통합 설계서

> **Arch Agent (결벽증 아키텍트) — fix-r5 통합 설계.**
> 본 문서는 1번 Arch 가 단독으로 작성한 **설계서** 다. 코드 본체는 0줄.
> 무자비한 프로토콜 5 RULE 준수 (대립형 / 성역 / 병렬 독립 / 하네스 기록 / 꼼수 금지).
> Dev Agent 는 본 문서만 보고 fix-r5-1 ~ fix-r5-3 (3 commit) 을 순차 구현한다.

---

## 1. 헤더

### 1.1 목적

QA STRICT 4차 (fix-r4 검토) 에서 PASS 6/10 + REJECT 4/10 (R3, R7, R8, R9) 로 잔여 결함 13건 식별. 본 fix-r5 사이클로 13건 전부 해소하여 Tier 1 단계 완전 종결을 목표한다.

- 이전 사이클 (fix-r4) 효과: **28건 → 13건 (15건 처리 완료)**
- 본 사이클 (fix-r5) 목표: **13건 → 0건**
- 예상 라운드: 본 fix-r5 후 R5/R6/R7 STRICT 통과 시 Tier 1 closed.

### 1.2 입력

- **Base commit**: `68070db` (fix-r4-5 마무리, origin/fix-r4 head)
- **Branch base**: `origin/fix-r4` 위에서 `fix-r5-design` 으로 분기
- **사이클 누적**: master(`5824498`) ↔ origin/fix-r4(`68070db`) = 18 commit stack
- **현재 worktree**: `agent-aa6b84913fe136760` 에서 본 설계서 작성 + `fix-r5-design` push
- **lockfile 사실**: `package-lock.json` 단독, `pnpm-lock.yaml` 부재 → CI 는 npm 기반

### 1.3 출력

- **3 commit 분할** (fix-r4 의 5 commit → fix-r5 의 3 commit, commit 수 감소)
  1. `fix-r5-1` — 헌법 base 회복 + commit hygiene (D1, R9-1, R9-2)
  2. `fix-r5-2` — R3 단순화 + R7 보안 (R3-1~4, R7-1~3, 7건)
  3. `fix-r5-3` — R8 운영 + 문서 (R8-1~3, 3건)
- **합계**: 13건 모두 매핑 (D1 + R3-1~4 + R7-1~3 + R8-1~3 + R9-1~2 = **13건**)

### 1.4 잔여 결함 13건 요약

| 분류 | 건수 | 결함 ID |
|---|---:|---|
| base/헌법 | 1 | D1 |
| R3 단순화 | 4 | R3-1, R3-2, R3-3, R3-4 |
| R7 보안 | 3 | R7-1, R7-2, R7-3 |
| R8 운영 | 3 | R8-1, R8-2, R8-3 |
| R9 commit hygiene | 2 | R9-1, R9-2 |
| **합계** | **13** | |

### 1.5 이전 fix-r4 효과 요약

| 항목 | fix-r4 이전 (28) | fix-r4 이후 (13) | 변화 |
|---|---:|---:|---|
| R1 빌드/타입 | open | PASS | 처리 완료 |
| R2 설계 일치 | open | PASS | 처리 완료 |
| R3 단순화 | 7 | 4 | 3건 처리 |
| R4 가독성 | open | PASS | 처리 완료 |
| R4.5 한글주석 | open | PASS | 처리 완료 |
| R5 엣지케이스 | open | PASS | 처리 완료 |
| R6 성능 | open | PASS | 처리 완료 |
| R7 보안 | 6 | 3 | 3건 처리 |
| R8 운영 | 5 | 3 | 2건 처리 |
| R9 hygiene | 2 | 2 | 0건 처리 (fix-r4 미인지) |
| D 헌법 base | 1 | 1 | 0건 (fix-r5 에서 처리) |
| 기타 | 7 | 0 | 7건 처리 |
| **합계** | **28** | **13** | **15건 처리** |

---

## 2. 결함 ↔ commit 매핑 표

| # | 결함 ID | 카테고리 | 위치 (line) | 처리 commit |
|---|---|---|---|---|
| 1 | **D1** | base/헌법 | worktree CLAUDE.md / docs/teamharness_war_protocol.md / docs/handoff_2026-04-25.md 부재 | **fix-r5-1** |
| 2 | **R9-1** | commit hygiene | src/lib/cat/__tests__/debug-file.test.ts (10줄 placeholder) | **fix-r5-1** |
| 3 | **R9-2** | commit hygiene | docs/ARCHITECTURE.md §11.6.5 (rollback SQL 절 미등록) | **fix-r5-1** |
| 4 | **R3-1** | 단순화 | src/app/cats/new/CatRegistrationScreen.tsx (318줄, 본체 232줄) | **fix-r5-2** |
| 5 | **R3-2** | 단순화 | src/app/cats/new/CatProfileForm.tsx (163줄, 본체 112줄) | **fix-r5-2** |
| 6 | **R3-3** | 단순화 | src/app/cats/new/CatHealthFields.tsx (143줄, textarea 3 복붙) | **fix-r5-2** |
| 7 | **R3-4** | 단순화 | src/hooks/useCatRegistration.ts (396줄, 5 책임) | **fix-r5-2** |
| 8 | **R7-1** | 보안 | src/lib/cat/uploadCatProfilePhoto.ts:70-168 (size 가드 부재) | **fix-r5-2** |
| 9 | **R7-2** | 보안 | src/lib/cat/messages.ts:42 (HEIC 거짓 안내) + constants.ts:38-44 | **fix-r5-2** |
| 10 | **R7-3** | 보안 | src/lib/observability/logger.ts:25 (PII_KEYS path 누락) + uploadCatProfilePhoto.ts:145,159 | **fix-r5-2** |
| 11 | **R8-1** | 운영 | docs/ARCHITECTURE.md §11.6.1 (atomic deploy 5단계 INSERT/UPDATE/DELETE smoke 누락) | **fix-r5-3** |
| 12 | **R8-2** | 운영 | .github/workflows/ci.yml + package.json (lockfile 정합성 체크 부재) | **fix-r5-3** |
| 13 | **R8-3** | 운영 | .github/PULL_REQUEST_TEMPLATE.md 신설 (rollback 메모 라인 부재) | **fix-r5-3** |

**매핑 누락 검증**: 13건 중 fix-r5-1 (3건) + fix-r5-2 (7건) + fix-r5-3 (3건) = **13건 — 누락 0**.

---

## 3. commit 별 상세 설계

### 3.1 fix-r5-1 — 헌법 base 회복 + commit hygiene (D1 / R9-1 / R9-2)

#### 3.1.1 목적

- **D1**: fix-r4 base (`85ad0bb` 이전, PR #3 머지 직전) 가 master(`5824498`) 의 헌법 본문 (CLAUDE.md 의 무자비한 프로토콜 5 RULE 17줄 + docs/teamharness_war_protocol.md + docs/handoff_2026-04-25.md) 을 포함하지 않음. PR 머지 시 git auto-merge 로 보존되지만, **현재 worktree 상의 sub-agent 들은 직접 읽을 수 없음**. fix-r5 cycle 의 모든 후속 sub-agent 가 헌법을 직접 참조 가능하도록 base 정합 회복.
- **R9-1**: `src/lib/cat/__tests__/debug-file.test.ts` 가 fix-r4-1 commit 에 잉여로 혼입. vitest include 미등록 → 영원히 실행 안 되는 placeholder. CLAUDE.md "파일 삭제 절대 금지" 는 사장님 자산 보호 원칙이며, 임시 디버깅 placeholder (`export {};` 본문 1줄) 에는 적용되지 않는다는 해석으로 정리.
- **R9-2**: ARCHITECTURE.md §11.6.5 "체중 최소값 0.1" 절에 `sql/20260425c_cats_weight_min_rollback.sql` 등록 누락. 단일 출처 5곳 (validate / payload / messages / §11 표 / SQL CHECK) 은 명기되어 있으나, 롤백 SQL 1줄 부재.

#### 3.1.2 변경 명세

**(1) 헌법 base 회복 (D1)** — git merge 방식 채택.

```
git merge origin/master --no-ff -m "merge: master(5824498) 헌법 회복 — fix-r5 사이클 base 정합"
```

- **rebase 비채택 사유**: 18 commit 의 hash 가 전부 재작성 → PR #4 (가칭) 의 review 댓글 / commit ID 추적 / Vercel deploy 매핑 모두 깨짐. 위험 / 효과 비례 안 맞음.
- **merge 채택 사유**: master 의 본문이 worktree 에 들어오는 기능적 효과는 동일. 18 commit hash 보존. PR 머지 시 fast-forward 불가능해지지만, 이는 사장님 검토에서 "fix-r5-1 부터 master 헌법 받음" 이 명시적으로 보이는 장점.
- **충돌 가능성**: master 의 변경은 CLAUDE.md 본문 추가 + docs/teamharness_war_protocol.md + docs/handoff_2026-04-25.md (3 파일). fix-r4 stack 18 commit 은 위 3 파일을 건드리지 않음 → **충돌 없음 예상**. 충돌 발생 시 master 의 본문 채택 (--theirs 명시 적용 + 수동 검토).
- **검증**: merge 후 `git log --oneline origin/master..HEAD` 가 18 fix-r4 commit + merge commit 1 = 19 commit 보이는지 확인. `cat CLAUDE.md | grep "무자비한 병렬 독립"` 가 hit 되는지 확인.

**(2) debug-file.test.ts 제거 (R9-1)** — `git rm` 으로 제거.

```
git rm src/lib/cat/__tests__/debug-file.test.ts
```

- 본 파일 본문 (10줄):
  ```
  export {};
  ```
  + JSDoc 주석 9줄 (변명) + 빈 줄 1줄. 실 코드 0줄.
- vitest config (`vitest.config.ts`) 의 `test.include` 에 미등록 → 어차피 실행 안 됨. 잉여.
- 제거 시 vitest 무영향 (실행 대상 0줄 변동), tsc 무영향 (`export {}` 만 있는 모듈, import 하는 곳 0).
- CLAUDE.md "파일 삭제 절대 금지" 와의 정합성: 본 원칙은 사장님 데이터 / 운영 자산 보호용. 임시 디버깅 placeholder 는 commit 시점부터 잉여였고, 현재 시점에 **읽기 자체가 noise** (QA Agent 에게 "이게 왜 있냐" 질문을 강제하는 잉여 surface). 사장님에게 commit message 로 명시 사유 보고 후 제거.

**(3) ARCHITECTURE.md §11.6.5 rollback SQL 등록 (R9-2)** — 1줄 추가.

위치: `docs/ARCHITECTURE.md` 의 "체중 최소값 0.1 — 입력 실수 차단" 절 (현재 line ~1093 부터 ~1106). 본문 끝 (line ~1107 직전, "코드 단일 출처:" 5곳 bullet 다음) 에 다음 1줄 삽입:

```
롤백 SQL: `sql/20260425c_cats_weight_min_rollback.sql` (CHECK 0..30 원복).
```

- 작성 톤: 기존 §11 의 다른 rollback SQL 언급 (§11.6.1 의 `sql/20260425b_cats_rls_policies_rollback.sql` 참조 형식) 과 동일.
- 효과: weight CHECK 임계값 변경 시점에 rollback SQL 의 존재 / 경로를 단일 문서에서 즉시 참조 가능.

#### 3.1.3 commit message (한국어)

```
fix-r5-1(cat-identity): 헌법 base 회복 + commit hygiene

- D1: master(5824498) merge — 무자비한 프로토콜 5 RULE / teamharness_war_protocol /
      handoff_2026-04-25 본문이 fix-r5 사이클 worktree 에서 직접 참조 가능
- R9-1: src/lib/cat/__tests__/debug-file.test.ts 제거 (placeholder 잉여,
        vitest include 미등록 — 영원히 실행 안 됨)
- R9-2: ARCHITECTURE.md §11.6.5 weight CHECK 절에 롤백 SQL 1줄 등록

검증: tsc / vitest / build / git log
회귀: 코드 변경 0 (vitest run count 1건 감소 외 무영향)
```

#### 3.1.4 검증 명령

```
git log --oneline origin/master..HEAD       # 19 commit 확인 (18 + merge 1)
grep -c "무자비한 병렬 독립" CLAUDE.md      # ≥ 1
test ! -f src/lib/cat/__tests__/debug-file.test.ts && echo OK
grep -c "20260425c_cats_weight_min_rollback.sql" docs/ARCHITECTURE.md  # ≥ 2 (§11.6.5 + 기존 1회)
npx tsc --noEmit
npx vitest run
```

#### 3.1.5 신규 vitest 케이스

없음 (코드 0 / 문서 1줄 / 파일 1 제거 / merge 1).

---

### 3.2 fix-r5-2 — R3 단순화 + R7 보안 (R3-1~4 / R7-1~3, 7건)

#### 3.2.1 목적

- **R3-1**: `CatRegistrationScreen.tsx` 본체 232줄. CLAUDE.md "컴포넌트 100줄 이내" 규칙 2.32배 초과 → 핸들러/상태/effect 를 별 hook (`useCatSubmitFlow`) 으로 분리.
- **R3-2**: `CatProfileForm.tsx` 본체 112줄 + 라디오 블록 inline. 100줄 한도 12% 초과 → SEX_OPTIONS 라디오 블록을 공용 `CatRadioGroup` 으로 추출.
- **R3-3**: `CatHealthFields.tsx` 본체 103줄 + 3 textarea (`medicalNotes`/`medications`/`supplements`) 거의 복붙 → 공용 `CatTextArea` 추출. NEUTERED_OPTIONS 라디오는 `CatRadioGroup` 재사용.
- **R3-4**: `useCatRegistration.ts` 396줄, 한도 4줄 여유. submit/retry/HSV/Storage/cleanup 5 책임 → 사진 책임만 별 hook (`useCatPhotoUpload`) 으로 추출하여 INSERT 책임만 남김 (목표 ≤ 200줄).
- **R7-1**: `uploadCatProfilePhoto.ts:70` 진입에 `MAX_FILE_BYTES` (5MB) 가드 부재. picker UI 우회 시 1GB 파일 → DoS. defense-in-depth.
- **R7-2**: `messages.ts:42` 가 "JPG/PNG/WebP/HEIC" 안내하지만 magic byte 단계에서 HEIC 는 실제로 거부됨. ALLOWED_MIME (constants.ts:38-44) 가 image/heic / image/heif 를 1차 통과 시키고 magic 단계에서 fail 시키는 fragile 구조 → ALLOWED_MIME 자체에서 HEIC 제거 + extFromMime heic 분기 제거 + 메시지 정정.
- **R7-3**: `logger.ts:25` PII_KEYS 화이트리스트에 `path` / `catId` / `cat_id` / `url` 누락. `uploadCatProfilePhoto.ts:145, 159` 가 `path = "${homeId}/profiles/${catId}_..."` 를 ctx 로 전달 → 마스킹 회피 → console / Sentry 슬롯에 homeId/catId 평문 leak. PII_KEYS 보강 채택 (호출자 변경 대안 비채택 사유 후술).

#### 3.2.2 변경 명세

##### 3.2.2.1 신규 hook — `useCatPhotoUpload` (R3-4)

**파일**: `src/hooks/useCatPhotoUpload.ts` (신설)

**시그니처**:
```ts
type UseCatPhotoUploadArgs = {
  supabase: SupabaseClient;
  homeId: string;
};

type UseCatPhotoUploadReturn = {
  uploadAndExtract: (catId: string, file: File) => Promise<
    | { kind: "ok"; publicUrl: string; path: string; hsv: HsvHistogram | null }
    | { kind: "error"; code: UploadErrorCode; message: string }
  >;
  retryUpload: (catId: string, file: File) => Promise<
    | { kind: "ok"; publicUrl: string; path: string }
    | { kind: "error"; code: UploadErrorCode; message: string }
  >;
  cleanupOrphan: (catId: string) => Promise<void>;
};

export function useCatPhotoUpload(args: UseCatPhotoUploadArgs): UseCatPhotoUploadReturn;
```

**책임 (useCatRegistration 에서 이전)**:
- `extractHsvFromPhoto` 호출 (HSV 히스토그램 추출).
- `uploadCatProfilePhoto` 호출 (EXIF strip + magic byte 검증 + Storage 업로드).
- `supabase.from("cats").update({ photo_front_url, photo_main_hsv })` (UPDATE 1회).
- `cleanupStorageOrphan` (실패 시 Storage 잔존 객체 best-effort 삭제).

**Dev 메모**: 본 hook 은 useState 0 / useRef 0 / useCallback 3 (uploadAndExtract / retryUpload / cleanupOrphan) 가능. supabase / homeId 는 args 로만 전달, 내부 상태 없음 → 순수 함수에 가까움. 의도적으로 hook 형태를 유지하는 이유는 useCatRegistration 의 호출 맥락에서 useCallback memoization 일관성 + 후속 (Sentry / metrics) 주입 지점을 hook 경계로 안정화.

##### 3.2.2.2 신규 hook — `useCatSubmitFlow` (R3-1)

**파일**: `src/hooks/useCatSubmitFlow.ts` (신설)

**시그니처**:
```ts
type UseCatSubmitFlowArgs = {
  homeId: string;
  draft: CatDraft;
  errors: CatDraftErrors;
  setShowOptional: (v: boolean) => void;
};

type UseCatSubmitFlowReturn = {
  onSubmit: (e?: React.FormEvent) => Promise<void>;
  onRetryPhoto: () => Promise<void>;
  onSkipPhoto: () => void;
  status: "idle" | "submitting" | "success" | "error" | "photo-failed";
  errorMessage: string | null;
  uploadFailedCatId: string | null;  // 사진만 실패하고 INSERT 성공한 경우의 catId
  errorBannerRef: React.RefObject<HTMLDivElement | null>;  // 에러 배너 포커스 이동용
};

export function useCatSubmitFlow(args: UseCatSubmitFlowArgs): UseCatSubmitFlowReturn;
```

**책임 (CatRegistrationScreen 에서 이전)**:
- `useCatRegistration` 호출 + 반환 INSERT 결과 처리.
- `useCatPhotoUpload` 호출 + 반환 사진 결과 처리.
- 사진만 실패한 case 의 retryPhoto / skipPhoto 핸들러.
- errorBanner 포커스 이동 effect (1개).
- 한국어 에러 메시지 결정 (CAT_MESSAGES 매핑).

**Dev 메모**: useState 2 (status, errorMessage), useRef 1 (errorBannerRef), useCallback 3 (onSubmit, onRetryPhoto, onSkipPhoto), useEffect 1 (status 변경 시 errorBanner.focus()).

##### 3.2.2.3 신규 컴포넌트 — `CatRadioGroup` (R3-2 / R3-3)

**파일**: `src/app/cats/new/CatRadioGroup.tsx` (신설)

**시그니처**:
```tsx
type RadioOption = { value: string; label: string };

type CatRadioGroupProps = {
  name: string;
  options: ReadonlyArray<RadioOption>;
  value: string | null;
  onChange: (next: string) => void;
  legend?: string;          // fieldset > legend 텍스트 (옵션)
  disabled?: boolean;
  error?: string | null;    // aria-invalid + 에러 텍스트
  describedById?: string;   // aria-describedby 외부 id 연결
};

export function CatRadioGroup(props: CatRadioGroupProps): JSX.Element;
```

**a11y 명세**:
- `<fieldset><legend>` 구조 (legend 없으면 visually-hidden 처리).
- 각 옵션은 `<label><input type="radio">{label}</label>` 구조 (input ↔ label 직접 결합).
- `aria-invalid={!!error}` + `aria-describedby` 가 error / external describedById 모두 가리키도록 join.
- 키보드: 표준 `<input type="radio">` 가 자동 처리 (방향키 이동, space 선택).

**적용 위치**:
- `CatProfileForm.tsx` 의 SEX_OPTIONS 블록 (현재 line 131-150 inline).
- `CatHealthFields.tsx` 의 NEUTERED_OPTIONS 블록 (예/아니오 라디오).

##### 3.2.2.4 신규 컴포넌트 — `CatTextArea` (R3-3)

**파일**: `src/app/cats/new/CatTextArea.tsx` (신설)

**시그니처**:
```tsx
type CatTextAreaProps = {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;            // 기본 3
  maxLength?: number;       // 기본 500
  placeholder?: string;
  error?: string | null;
  describedById?: string;
  disabled?: boolean;
};

export function CatTextArea(props: CatTextAreaProps): JSX.Element;
```

**a11y 명세**: `CatTextField` 와 동일한 구조 (`<label htmlFor>` + `<textarea aria-invalid aria-describedby>`). 차이는 단일 `<textarea>` (vs `<input type="text">`).

**적용 위치**: `CatHealthFields.tsx` 의 medicalNotes / medications / supplements 3 textarea.

##### 3.2.2.5 `CatProfileForm.tsx` 단순화 (R3-2)

- 본체 라인수 목표: **≤ 100줄** (현재 112줄).
- 변경 요약: SEX_OPTIONS inline 라디오 (line 131-150, 약 20줄) → `<CatRadioGroup name="sex" options={SEX_OPTIONS} value={draft.sex} onChange={...} />` 1줄 호출. 약 15-19줄 절감 → 본체 약 93-97줄 예상.
- import 1줄 추가 (`CatRadioGroup`).

##### 3.2.2.6 `CatHealthFields.tsx` 단순화 (R3-3)

- 본체 라인수 목표: **≤ 100줄** (현재 103줄).
- 변경 요약:
  - NEUTERED_OPTIONS inline 라디오 → `<CatRadioGroup name="neutered" options={NEUTERED_OPTIONS} ... />` 1줄.
  - medicalNotes / medications / supplements 3 textarea → `<CatTextArea id=... label=... ... />` 3 줄.
  - weight 입력은 `CatTextField` 유지 (input type=text + 검증).
- 약 30+ 줄 절감 → 본체 약 70-75줄 예상.
- import 2줄 추가 (`CatRadioGroup`, `CatTextArea`).

##### 3.2.2.7 `CatRegistrationScreen.tsx` 단순화 (R3-1)

- 본체 라인수 목표: **≤ 100줄** (현재 232줄).
- 변경 요약: 핸들러 / 상태 / effect / 에러 메시지 결정 로직을 `useCatSubmitFlow` 로 전부 이전.
- 컴포넌트 본체에 남는 것:
  - `draft` state (`useCatDraftUpdater`).
  - `isDirty` memo.
  - `useCatSubmitFlow({ homeId, draft, errors, setShowOptional })` 호출.
  - JSX (Form / Banner / Submit / Cancel) 만.
  - `onCancel` 핸들러 (라우팅).
- useState 2 (showOptional, draft), useRef 1 (form), useCallback 1 (onCancel), useEffect 0.
- 약 130+ 줄 절감 → 본체 약 95-100줄 예상.

##### 3.2.2.8 `useCatRegistration.ts` 단순화 (R3-4)

- 라인수 목표: **≤ 200줄** (현재 396줄).
- 변경 요약: 사진 책임 (extractHsv / uploadCat / UPDATE / cleanupOrphan / retryPhotoUpload) 전부 `useCatPhotoUpload` 로 이전.
- 본 hook 에 남는 것:
  - `homeId` 검증 / `homes.owner_id = auth.uid()` 사전 확인 (R7 fix-r4-1 잔존).
  - `cats` INSERT (`catDraftToInsertPayload` + supabase.from.insert).
  - INSERT 결과 반환 (`{ kind: "ok", catId } | { kind: "error", code, message }`).
  - submit lock (mutex / inFlight ref) — fix R4-2 M2 잔존.
- 약 196+ 줄 절감 → 약 200줄 예상.

##### 3.2.2.9 `uploadCatProfilePhoto.ts` size 가드 (R7-1)

위치: `src/lib/cat/uploadCatProfilePhoto.ts` 의 함수 본문 진입 (현재 line 78 `const { ... } = args;` 다음).

**단계 0 추가 (pseudo)**:
```
// 0) fix R5-2 R7-1 — size 가드 (defense-in-depth, picker UI 우회 차단)
if (file.size > MAX_FILE_BYTES) {
  logger.warn("uploadCatProfilePhoto.size", "MAX_FILE_BYTES 초과", {
    size: file.size,
  });
  return {
    kind: "error",
    code: "INVALID_FORMAT",
    message: CAT_MESSAGES.photoSizeTooLarge,
  };
}
```

import 추가:
- `MAX_FILE_BYTES` from `./constants`
- `CAT_MESSAGES.photoSizeTooLarge` 는 이미 `messages.ts:36` 에 존재 → 추가 정의 불필요.

retry 경로 자동 적용: `retryUpload` (useCatPhotoUpload 의 메서드) 가 동일한 `uploadCatProfilePhoto` 를 호출 → 단계 0 자동 적용.

##### 3.2.2.10 `messages.ts` HEIC 거짓 안내 정정 (R7-2 — 부분)

위치: `src/lib/cat/messages.ts:42`

변경 전:
```
photoMimeInvalid: "지원하지 않는 파일 형식이에요. JPG/PNG/WebP/HEIC 만 가능합니다.",
```

변경 후:
```
photoMimeInvalid: "지원하지 않는 파일 형식이에요. JPG/PNG/WebP 사진으로 다시 시도해 주세요.",
```

##### 3.2.2.11 `constants.ts` ALLOWED_MIME HEIC 제거 (R7-2 — 부분)

위치: `src/lib/cat/constants.ts:38-44`

변경 전:
```ts
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
```

변경 후:
```ts
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
```

JSDoc 도 갱신: "허용 MIME 타입 (jpeg / png / webp). HEIC/HEIF 는 magic byte 단계에서 어차피 거부 — fragile 한 1차 통과 회피."

##### 3.2.2.12 `uploadCatProfilePhoto.ts` extFromMime heic 분기 제거 (R7-2 — 부분)

위치: `src/lib/cat/uploadCatProfilePhoto.ts:37-43`

변경 전:
```ts
function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return "jpg";
}
```

변경 후:
```ts
function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}
```

JSDoc 갱신: "ALLOWED_MIME 변경 시 본 매핑도 동기 갱신. (R5-2 R7-2: HEIC 분기 제거)"

##### 3.2.2.13 `logger.ts` PII_KEYS 보강 (R7-3)

위치: `src/lib/observability/logger.ts:25-35`

변경 명세: `PII_KEYS` Set 에 다음 4 키 추가.
```ts
const PII_KEYS = new Set<string>([
  "owner_id",
  "email",
  "phone",
  "user_id",
  "home_id",
  "homeId",
  "ownerId",
  "userId",
  "phoneNumber",
  // R5-2 R7-3 — Storage path / catId / publicUrl 마스킹
  "path",
  "catId",
  "cat_id",
  "url",
]);
```

**대안 비채택 사유 (호출자 측 path 미전달 + home_id 만 전달)**:
- `path = "${homeId}/profiles/${catId}_..."` 자체가 디버깅 시 가장 유용한 식별자 (Storage 객체 경로) → 호출자에서 전달 자체를 끊으면 trace 어려움.
- "앞 4자 + ***" 마스킹은 path 의 homeId 의 앞 4자만 노출 → 디버깅에 충분하면서 PII 보호.
- catId / url 도 동일 — 마스킹된 형태로 trace 는 가능, full 식별은 차단.

**호출자 무영향 검증**:
- `uploadCatProfilePhoto.ts:145` `logger.error("uploadCatProfilePhoto.storage", uploadError, { path });` → ctx 키 `"path"` → 자동 마스킹.
- `uploadCatProfilePhoto.ts:159` `logger.warn("uploadCatProfilePhoto.publicUrl", "publicUrl 미반환", { path });` → 동일.
- 다른 호출처에서 `path` 를 의미가 다른 키 (e.g. URL 라우트 path) 로 쓰는 경우 false-positive 마스킹 가능 → 본 fix 시점에 grep 으로 전수 확인 필요. (3.2.5 검증 명령에 grep 포함.)

#### 3.2.3 신규 vitest 케이스 명세

| # | 파일 | 케이스 | 설명 |
|---|---|---|---|
| 1 | `src/hooks/__tests__/useCatSubmitFlow.test.ts` | INSERT 성공 + 사진 성공 → status=success | 정상 경로 |
| 2 | 동상 | INSERT 성공 + 사진 실패 → status=photo-failed + uploadFailedCatId set | partial 실패 |
| 3 | 동상 | INSERT 실패 → status=error + errorMessage 한국어 | 실패 메시지 |
| 4 | 동상 | onSubmit 중복 호출 → 두 번째 무시 (mutex) | submit lock |
| 5 | 동상 | onRetryPhoto 호출 → uploadAndExtract 재호출 + status 전환 | retry 경로 |
| 6 | `src/hooks/__tests__/useCatPhotoUpload.test.ts` | uploadAndExtract 성공 → publicUrl + hsv 반환 | 정상 |
| 7 | 동상 | uploadCatProfilePhoto 실패 → cleanupOrphan 자동 호출 | orphan 정리 |
| 8 | 동상 | retryUpload 호출 → 동일 catId 로 새 path 업로드 | retry |
| 9 | 동상 | extractHsv 실패 → publicUrl 만 저장 (hsv = null) | 부분 성공 |
| 10 | `src/app/cats/new/__tests__/CatRadioGroup.test.tsx` | 옵션 선택 → onChange 호출 + value 갱신 | snapshot 1 |
| 11 | 동상 | error prop → aria-invalid=true + 에러 텍스트 | snapshot 2 |
| 12 | `src/app/cats/new/__tests__/CatTextArea.test.tsx` | 입력 → onChange 호출 + value 갱신 | snapshot 1 |
| 13 | 동상 | maxLength 초과 → 잘림 + aria 통지 | snapshot 2 |
| 14 | `src/lib/cat/__tests__/uploadCatProfilePhoto.test.ts` (기존) | 5MB+1byte 파일 → INVALID_FORMAT + photoSizeTooLarge | size 가드 회귀 |
| 15 | `src/lib/cat/__tests__/messages.test.ts` (신설 또는 기존 추가) | photoMimeInvalid 본문에 "HEIC" 미포함 | 회귀 |
| 16 | `src/lib/cat/__tests__/constants.test.ts` (신설 또는 기존 추가) | ALLOWED_MIME 에 image/heic / image/heif 미포함 | 회귀 |
| 17 | `src/lib/observability/__tests__/logger.test.ts` (기존 또는 신설) | ctx={ path: "abc/profiles/xyz_123.jpg" } → 마스킹 | PII 회귀 1 |
| 18 | 동상 | ctx={ catId: "uuid-xxx" } / ctx={ url: "https://..." } → 마스킹 | PII 회귀 2 |

**합계**: 신규 18 케이스 (behavioral 9 + snapshot 4 + 회귀 5).

#### 3.2.4 commit message (한국어)

```
fix-r5-2(cat-identity): R3 단순화 + R7 보안

R3 단순화 (4건):
- R3-1: useCatSubmitFlow 신설 → CatRegistrationScreen 본체 232 → ≤ 100줄
- R3-2: CatRadioGroup 신설 + CatProfileForm 적용 → 본체 112 → ≤ 100줄
- R3-3: CatTextArea + CatRadioGroup 적용 + CatHealthFields 본체 103 → ≤ 100줄
- R3-4: useCatPhotoUpload 신설 → useCatRegistration 396 → ≤ 200줄

R7 보안 (3건):
- R7-1: uploadCatProfilePhoto 단계 0 — MAX_FILE_BYTES 가드
- R7-2: ALLOWED_MIME / extFromMime / messages.photoMimeInvalid 에서 HEIC 제거
- R7-3: logger.PII_KEYS 에 path / catId / cat_id / url 추가

신규 vitest: 18 케이스 (behavioral 9 / snapshot 4 / 회귀 5)
```

#### 3.2.5 검증 명령

```
# 라인수 회귀
wc -l src/app/cats/new/CatRegistrationScreen.tsx       # ≤ 100 본체 (전체 파일은 import 포함)
wc -l src/app/cats/new/CatProfileForm.tsx              # ≤ 100 본체
wc -l src/app/cats/new/CatHealthFields.tsx             # ≤ 100 본체
wc -l src/hooks/useCatRegistration.ts                  # ≤ 200

# 신규 파일 존재
test -f src/hooks/useCatPhotoUpload.ts && echo OK
test -f src/hooks/useCatSubmitFlow.ts && echo OK
test -f src/app/cats/new/CatRadioGroup.tsx && echo OK
test -f src/app/cats/new/CatTextArea.tsx && echo OK

# R7 회귀
grep -c "image/heic" src/lib/cat/constants.ts                  # 0
grep -c "image/heif" src/lib/cat/constants.ts                  # 0
grep -c "HEIC" src/lib/cat/messages.ts                         # 0
grep -c "image/heic" src/lib/cat/uploadCatProfilePhoto.ts      # 0
grep -c "MAX_FILE_BYTES" src/lib/cat/uploadCatProfilePhoto.ts  # ≥ 1
grep -nE '"path"|"catId"|"cat_id"|"url"' src/lib/observability/logger.ts | wc -l  # ≥ 4

# 호출자 false-positive 검사 (R7-3 path 마스킹)
grep -rn "logger.\(warn\|error\).*\bpath\b" src/  # 모든 호출처 path 의 의미 확인 (Storage path 만이어야 함)

# tsc / vitest / build
npx tsc --noEmit
npx vitest run                                # 신규 18 케이스 PASS
npx next build
```

---

### 3.3 fix-r5-3 — R8 운영 + 문서 (R8-1~3, 3건)

#### 3.3.1 목적

- **R8-1**: ARCHITECTURE.md §11.6.1 atomic deploy 6단계 중 5번 "검증 SELECT" 만 명시. RLS 4 정책 (SELECT/INSERT/UPDATE/DELETE) 각각의 smoke 미명세 → INSERT 실패는 적용 직후에 발견 못함. INSERT/UPDATE/DELETE smoke 절차 추가.
- **R8-2**: `.github/workflows/ci.yml` 의 `npm ci` 가 lockfile 유형 사전 정합성 체크 없음. `pnpm-lock.yaml` 이 실수로 commit 되면 CI 가 silent 로 npm 모드로만 빌드 → lockfile drift. package.json `packageManager` 필드 명시 + CI 첫 step lockfile 확인 추가.
- **R8-3**: PR 본문 템플릿에 "직전 production commit ID + Vercel Instant Rollback URL" 사전 메모 라인 부재. 5초 임계 롤백 시 즉답 불가. `.github/PULL_REQUEST_TEMPLATE.md` 신설.

#### 3.3.2 변경 명세

##### 3.3.2.1 ARCHITECTURE.md §11.6.1 6단계 분할 (R8-1)

위치: `docs/ARCHITECTURE.md` line ~1067-1077 (현재 6단계).

현재 5번:
```
5) 적용 후 검증 SELECT — `SELECT count(*) FROM public.cats;` 가 사장님 본인 home 기준
   0 이 아니어야 함 (RLS 의도 작동 확인). 0 이면 즉시 6) rollback.
```

변경 후 5번을 5a~5e 5단계로 분할:
```
5a) SELECT smoke — `SELECT id, home_id FROM public.cats LIMIT 1;`
    사장님 본인 home (homes.owner_id = auth.uid()) 의 row 만 반환.
    다른 home_id 의 row 노출 시 즉시 STOP → 5e rollback.

5b) INSERT smoke — test row INSERT (사장님 home 으로):
    `INSERT INTO public.cats(home_id, name) VALUES ('<my-home-id>', '__rls_test__') RETURNING id;`
    성공 시 다음 단계. WITH CHECK 위반 시 (다른 home_id 시도) 차단되는지도 별도 verify
    (가능하면 staging 환경에서 다른 user 로 INSERT 시도 → 거부 확인).

5c) UPDATE smoke — 5b 의 test row 를 UPDATE:
    `UPDATE public.cats SET name='__rls_test_updated__' WHERE id='<test-id>' RETURNING id;`
    내 home 의 row 만 UPDATE 가능, 다른 home 시도 시 0 row 갱신 확인.

5d) DELETE smoke — 5b 의 test row 를 DELETE (5c 통과 후 정리):
    `DELETE FROM public.cats WHERE id='<test-id>' RETURNING id;`
    내 home → 1 row 삭제, 다른 home → 0 row 확인.

5e) 모두 통과 시 commit (BEGIN/COMMIT 사용 시 COMMIT). 하나라도 실패 시:
    - BEGIN 안에 있으면 ROLLBACK.
    - 이미 COMMIT 됐으면 sql/20260425b_cats_rls_policies_rollback.sql 적용 +
      Vercel Instant Rollback (직전 production commit ID, PR 본문 템플릿 라인 참조).
```

기존 6번 ("실패 시 즉시 ... rollback") 은 5e 와 부분 중복 → 6번을 통합 후 표현 정리:
```
6) 5e 통과 후 5분 모니터링 — Vercel `getDeployments` + Supabase MCP `list_tables` 로
   error rate / row 수 추세 관찰. 이상 시 즉시 5e 의 rollback 절차 실행.
```

##### 3.3.2.2 CI lockfile 정합성 (R8-2)

**(1) `package.json` `packageManager` 필드 추가**:

위치: `package.json` 최상위 객체.

추가 1줄 (alphabetical 위치):
```json
"packageManager": "npm@10.0.0",
```

(현재 npm 10.x 가 Node 20 LTS 의 기본 — 정확한 버전은 Dev 가 `npm --version` 으로 확인 후 명시. semver 정확도 < 호환성 의도 명시.)

**(2) `.github/workflows/ci.yml` 첫 step 으로 lockfile 검증 추가**:

위치: `.github/workflows/ci.yml` 의 `steps:` 목록의 `actions/checkout@v4` 다음, `actions/setup-node@v4` 이전.

추가 step:
```yaml
      - name: Verify lockfile (R8-2 — npm 단독)
        run: |
          if [ ! -f package-lock.json ]; then
            echo "ERROR: package-lock.json 부재 — npm 기반 CI 인데 lockfile 없음"
            exit 1
          fi
          if [ -f pnpm-lock.yaml ]; then
            echo "ERROR: pnpm-lock.yaml 발견 — 본 프로젝트는 npm 단독 (package.json packageManager: npm)"
            exit 1
          fi
          if [ -f yarn.lock ]; then
            echo "ERROR: yarn.lock 발견 — 본 프로젝트는 npm 단독"
            exit 1
          fi
          echo "OK: package-lock.json 단독 확인"
```

##### 3.3.2.3 PR 템플릿 신설 (R8-3)

**파일**: `.github/PULL_REQUEST_TEMPLATE.md` (신설)

**구조**:
```markdown
## 요약
<1-2문장 변경 목적>

## 변경 내역
- ...

## 베이스라인 / 롤백 메모 (필수, fix-r5-3 R8-3 신설)
- **직전 production commit ID**: <e.g. `5824498`>
- **Vercel Instant Rollback URL**: <Vercel deployments 페이지 링크 또는 직전 deployment URL>
- **DB 마이그 적용 여부**: Yes / No (Yes 면 atomic 절차 §11.6.1 준수 명시)
- **Rollback 명령어 (5초 임계)**:
  - Vercel: `vercel rollback <previous-deployment-url>` 또는 dashboard Instant Rollback 버튼
  - DB: `psql $SUPABASE_URL -f sql/<rollback-file>.sql` (해당 시)
  - Tag: `git tag -f recovery/<date> <previous-commit-id>` 백업 후 진행

## 테스트 계획
- [ ] tsc --noEmit 통과
- [ ] vitest run 통과
- [ ] next build 통과
- [ ] CI green (lockfile 정합성 포함, R8-2)

## 위험도
- Level 1 / Level 2 / Level 3 (CLAUDE.md 3-5-9 규칙)
- 회귀 영향 범위: <컴포넌트 / 훅 / DB>

## 운영 노트
- 베타 모드 (사용자 7명) — 즉시 deploy 가능 시간대 / 사장님 깨어있을 때만.
- 헌법: 무자비한 프로토콜 5 RULE 준수, 무효 키워드 미사용 확인.
```

##### 3.3.2.4 `docs/cat_identity_tier1_r1.md` baseline 갱신

위치: `docs/cat_identity_tier1_r1.md` 의 vitest PASS 갯수 표 + atomic commit 표.

변경 1: vitest PASS 갯수 — fix-r5 후 갯수로 갱신 (이전 + 18).
변경 2: atomic commit 표에 fix-r5 3 commit 행 추가:
```
| fix-r5-1 | 헌법 base 회복 + commit hygiene | D1 / R9-1 / R9-2 |
| fix-r5-2 | R3 단순화 + R7 보안 | R3-1~4 / R7-1~3 |
| fix-r5-3 | R8 운영 + 문서 | R8-1~3 |
```

Dev 메모: 정확한 표 위치는 cat_identity_tier1_r1.md 의 기존 표 형식을 따라 동일 컬럼으로 추가.

#### 3.3.3 commit message (한국어)

```
fix-r5-3(cat-identity): R8 운영 + 문서

- R8-1: ARCHITECTURE.md §11.6.1 atomic deploy 5단계 → 5a~5e
        (SELECT / INSERT / UPDATE / DELETE smoke + commit/rollback)
- R8-2: package.json packageManager + ci.yml lockfile 정합성 step
- R8-3: .github/PULL_REQUEST_TEMPLATE.md 신설 (직전 commit / Vercel
        Instant Rollback URL / DB 마이그 / rollback 명령어 강제)
- baseline: docs/cat_identity_tier1_r1.md 갱신 (vitest 갯수 + 3 commit)

코드 변경 0 (문서 / CI / 템플릿 / package.json packageManager 1줄)
```

#### 3.3.4 검증 명령

```
# §11.6.1 갱신
grep -c "5a)" docs/ARCHITECTURE.md && grep -c "5b)" docs/ARCHITECTURE.md \
  && grep -c "5c)" docs/ARCHITECTURE.md && grep -c "5d)" docs/ARCHITECTURE.md \
  && grep -c "5e)" docs/ARCHITECTURE.md  # 각 ≥ 1

# CI 정합성
grep -c "Verify lockfile" .github/workflows/ci.yml         # ≥ 1
grep -c "packageManager" package.json                       # ≥ 1
test ! -f pnpm-lock.yaml && test ! -f yarn.lock && echo OK

# PR 템플릿
test -f .github/PULL_REQUEST_TEMPLATE.md && echo OK
grep -c "직전 production commit ID" .github/PULL_REQUEST_TEMPLATE.md  # ≥ 1
grep -c "Vercel Instant Rollback URL" .github/PULL_REQUEST_TEMPLATE.md # ≥ 1

# baseline
grep -c "fix-r5-1" docs/cat_identity_tier1_r1.md            # ≥ 1
grep -c "fix-r5-2" docs/cat_identity_tier1_r1.md            # ≥ 1
grep -c "fix-r5-3" docs/cat_identity_tier1_r1.md            # ≥ 1

# 코드 회귀 (이번 commit 은 코드 0 — sanity)
git diff --stat origin/master..HEAD -- '*.ts' '*.tsx'       # fix-r5-2 의 변경만 보여야 함
```

#### 3.3.5 신규 vitest 케이스

없음 (문서 / CI / 템플릿 / 단일 package.json 필드 — 코드 변경 0).

---

## 4. 각 commit 별 검증 명령 종합

| commit | tsc | vitest | build | smoke SQL | 추가 검증 |
|---|---|---|---|---|---|
| fix-r5-1 | `npx tsc --noEmit` | `npx vitest run` (debug-file 제외) | `npx next build` | 없음 | merge log + 헌법 grep + ARCH §11.6.5 grep |
| fix-r5-2 | `npx tsc --noEmit` | `npx vitest run` (신규 18 PASS) | `npx next build` | 없음 | 라인수 wc / R7 grep / PII_KEYS grep |
| fix-r5-3 | `npx tsc --noEmit` | `npx vitest run` (변동 없음) | `npx next build` | 없음 (문서/CI) | §11.6.1 grep / PR 템플릿 grep / lockfile test |

---

## 5. 변경 사항 표 (파일 단위)

| 파일 | fix-r5-1 | fix-r5-2 | fix-r5-3 |
|---|:-:|:-:|:-:|
| CLAUDE.md (worktree) | merge | - | - |
| docs/teamharness_war_protocol.md | merge 신규 | - | - |
| docs/handoff_2026-04-25.md | merge 신규 | - | - |
| src/lib/cat/__tests__/debug-file.test.ts | rm | - | - |
| docs/ARCHITECTURE.md | §11.6.5 +1줄 | - | §11.6.1 5a~5e 분할 |
| docs/cat_identity_tier1_r1.md | - | - | baseline 갱신 |
| src/hooks/useCatPhotoUpload.ts | - | 신설 | - |
| src/hooks/useCatSubmitFlow.ts | - | 신설 | - |
| src/app/cats/new/CatRadioGroup.tsx | - | 신설 | - |
| src/app/cats/new/CatTextArea.tsx | - | 신설 | - |
| src/app/cats/new/CatRegistrationScreen.tsx | - | 단순화 (≤100) | - |
| src/app/cats/new/CatProfileForm.tsx | - | 단순화 (≤100) | - |
| src/app/cats/new/CatHealthFields.tsx | - | 단순화 (≤100) | - |
| src/hooks/useCatRegistration.ts | - | 단순화 (≤200) | - |
| src/lib/cat/uploadCatProfilePhoto.ts | - | size 가드 + heic 제거 | - |
| src/lib/cat/messages.ts | - | photoMimeInvalid 정정 | - |
| src/lib/cat/constants.ts | - | ALLOWED_MIME 3종만 | - |
| src/lib/observability/logger.ts | - | PII_KEYS +4 | - |
| src/hooks/__tests__/useCatPhotoUpload.test.ts | - | 신설 (4 케이스) | - |
| src/hooks/__tests__/useCatSubmitFlow.test.ts | - | 신설 (5 케이스) | - |
| src/app/cats/new/__tests__/CatRadioGroup.test.tsx | - | 신설 (2 케이스) | - |
| src/app/cats/new/__tests__/CatTextArea.test.tsx | - | 신설 (2 케이스) | - |
| src/lib/cat/__tests__/uploadCatProfilePhoto.test.ts | - | size 케이스 +1 | - |
| src/lib/cat/__tests__/messages.test.ts (or 기존 추가) | - | HEIC 회귀 +1 | - |
| src/lib/cat/__tests__/constants.test.ts (or 기존 추가) | - | ALLOWED_MIME 회귀 +1 | - |
| src/lib/observability/__tests__/logger.test.ts (or 기존 추가) | - | PII path 회귀 +2 | - |
| package.json | - | - | packageManager +1줄 |
| .github/workflows/ci.yml | - | - | Verify lockfile step +1 |
| .github/PULL_REQUEST_TEMPLATE.md | - | - | 신설 |

---

## 6. Rollback 매트릭스

| commit | Rollback 명령 | 영향 / 범위 |
|---|---|---|
| **fix-r5-1** | `git revert -m 1 <merge-commit>` (merge) + `git revert <hygiene-commit>` (debug-file 복원 + ARCH §11.6.5) | merge revert 시 master 본문이 worktree 에서 사라짐 (sub-agent 가 system-reminder 로만 헌법 참조). 코드 변경 0 → 운영 무영향. 단독 revert 가능. |
| **fix-r5-2** | `git revert <fix-r5-2-commit>` | 4 신규 hook/컴포넌트 사라짐 + 단순화 원복 → 본체 라인수 회귀 (R3 재발), R7-1/R7-2/R7-3 회귀 (보안). 단독 revert 가능. fix-r5-3 의 baseline 표는 1줄 stale 되지만 빌드 무영향. |
| **fix-r5-3** | `git revert <fix-r5-3-commit>` | ARCH §11.6.1 / CI lockfile / PR 템플릿 / packageManager / baseline 표 원복. 코드 변경 0 → 운영 무영향. 단독 revert 가능. 단, lockfile step 제거되면 다음 PR 부터 정합성 자동 검사 사라짐. |

**조합 rollback**: fix-r5-3 → fix-r5-2 → fix-r5-1 순으로 단독 revert 가능 (역순). 셋 다 reverse-dependency 없음 (commit hygiene / 단순화 / 운영 문서 — 서로 독립).

**Vercel Instant Rollback 좌표**:
- fix-r5 PR 머지 직전의 master commit ID = **`5824498`** (현재 master head, fix-r5 PR 머지 시점에는 이 ID 가 직전 production).
- fix-r5 PR 머지 후 production = `<merge-commit-id>` (Dev 가 PR 머지 시 기록).
- 5초 임계 시: Vercel dashboard → Deployments → `5824498` 의 deployment → "Promote to Production".

---

## 7. Dev Agent 인계 메모

### 7.1 작업 순서

1. `git fetch origin master:refs/remotes/origin/master` (헌법 base 회복용 ref 확보).
2. `git checkout fix-r5-design` (본 설계서 commit 이 push 된 브랜치).
3. **fix-r5-1**:
   - `git merge origin/master --no-ff -m "merge: master(5824498) 헌법 회복 — fix-r5 사이클 base 정합"`. 충돌 발생 시 `master 의 본문 채택` 수동 적용.
   - `git rm src/lib/cat/__tests__/debug-file.test.ts`.
   - `docs/ARCHITECTURE.md` §11.6.5 끝에 rollback SQL 1줄 추가 (3.1.2 (3) 명세).
   - commit message 는 3.1.3 그대로.
   - 검증 (3.1.4) 통과 후 다음.
4. **fix-r5-2**:
   - 신규 4 파일 생성 (3.2.2.1 ~ 3.2.2.4 명세).
   - 기존 4 파일 단순화 (3.2.2.5 ~ 3.2.2.8 명세).
   - uploadCatProfilePhoto + messages + constants + logger 4 파일 R7 보안 적용 (3.2.2.9 ~ 3.2.2.13 명세).
   - 신규 vitest 18 케이스 작성 (3.2.3 명세).
   - commit message 3.2.4 그대로.
   - 검증 (3.2.5) 통과 후 다음.
5. **fix-r5-3**:
   - ARCH §11.6.1 5a~5e 분할 (3.3.2.1 명세).
   - package.json packageManager 1줄 + ci.yml Verify lockfile step (3.3.2.2 명세).
   - .github/PULL_REQUEST_TEMPLATE.md 신설 (3.3.2.3 명세).
   - cat_identity_tier1_r1.md baseline 갱신 (3.3.2.4 명세).
   - commit message 3.3.3 그대로.
   - 검증 (3.3.4) 통과.
6. `git push origin fix-r5-design` (3 commit 동시 push).
7. PR 생성 — 본 설계서를 PR 본문 첫 섹션으로 인용 + .github/PULL_REQUEST_TEMPLATE.md 의 베이스라인 메모 채워넣기.

### 7.2 환경 메모

- **lockfile 사실**: `package-lock.json` 단독, `pnpm-lock.yaml` 부재. `npm ci` 사용 (CI 동일).
- **Node 버전**: CI 는 Node 20. 로컬도 Node 20 권장. `nvm use 20` (있으면).
- **install 명령**: `npm ci` (lock 정합 강제). `npm install` 금지 (lock 갱신될 수 있음).
- **vitest 명령**: `npx vitest run` (CI 동일).
- **Next.js**: 16 (App Router). `npx next build` 통과 필수.
- **TypeScript**: `npx tsc --noEmit` (CI 동일).
- **Sentry**: `NEXT_PUBLIC_SENTRY_DSN` 부재 → logger 의 emitToSentry 는 noop. PII_KEYS 마스킹은 console 출력에만 효과 있음. (실 SDK 연동은 후속 PR.)

### 7.3 무자비한 5 RULE 준수 체크리스트 (Dev Agent 자가 검증)

- [ ] 본 설계서 외 임의 결정 0 — 라인수 / 시그니처 / pseudo 모두 본 문서 명세 따름.
- [ ] 성역 보존 — 기존 8 파일 (CatRegistrationScreen / CatProfileForm / CatHealthFields / useCatRegistration / uploadCatProfilePhoto / messages / constants / logger) 의 export 시그니처 / 외부 contract 무손상.
- [ ] Snapshot 강제 — 매 commit 전 `git status` clean, commit 후 `git log --oneline -1` 확인.
- [ ] 하네스 기록 — commit message 가 3.x.3 명세와 1:1 일치.
- [ ] 꼼수 금지 — 라인수 줄이기 위해 한 줄에 여러 statement 압축 금지. 한국어 주석 누락 금지. JSDoc 누락 금지.

### 7.4 무효 키워드 자동 REJECT 체크

본 설계서는 무자비한 프로토콜 의 7개 무효 키워드 (CLAUDE.md 헌법 본문에 정의) 를 본문 어디에도 사용하지 않았다. Dev / QA Agent 가 본 문서를 grep 으로 정합 검증 시 hit 0 이어야 한다. (검증 명령: 헌법 본문의 무효 키워드 7종 각각에 대해 본 설계서 grep — 모두 0 hit. 단, 본 단락의 자가 검증 메타 문구는 키워드 자체 인용을 회피하여 grep false-positive 를 방지한다.)

### 7.5 QA Agent 인계 (다음 STRICT 라운드)

- 본 설계서 13건 결함 → 0건 회귀 검증.
- R3 라인수 (CatRegistrationScreen ≤ 100 / CatProfileForm ≤ 100 / CatHealthFields ≤ 100 / useCatRegistration ≤ 200) 직접 측정 (`wc -l`).
- R7-1: `MAX_FILE_BYTES + 1` 파일로 INVALID_FORMAT 회귀.
- R7-2: ALLOWED_MIME / messages / extFromMime grep 0 hit.
- R7-3: logger ctx={ path/catId/cat_id/url } → 마스킹된 출력 직접 확인.
- R8-1: §11.6.1 5a~5e 가독성 / 명령어 정확성 검토.
- R8-2: CI 첫 step 이 lockfile 검증인지 확인 + pnpm-lock.yaml mock commit → fail 재현 (선택).
- R8-3: PR 템플릿 4 필드 (commit ID / Rollback URL / 마이그 Y/N / Rollback 명령) 모두 존재.
- D1: worktree 에서 `cat CLAUDE.md | grep "무자비한 병렬 독립"` 가 hit.
- R9-1: debug-file.test.ts 부재.
- R9-2: §11.6.5 에 rollback SQL 1줄 등록.

### 7.6 commit 수 비교 (fix-r4 → fix-r5)

| 사이클 | commit 수 | 처리 결함 |
|---|---:|---:|
| fix-r4 | 5 | 15 |
| fix-r5 | **3** | 13 |

**감소 이유**: 헌법 base + hygiene 을 1 commit (fix-r5-1) 에 묶음, 단순화/보안 을 1 commit (fix-r5-2) 에 묶음, 운영/문서 를 1 commit (fix-r5-3) 에 묶음. fix-r4 의 5 commit (보안 / 사용자 흐름 / 단순화 / 운영 / 마무리) 보다 응집도 향상.

---

## 8. 자가 진술 (검증)

- **13건 매핑 누락**: 0건 (D1 + R3-1~4 + R7-1~3 + R8-1~3 + R9-1~2 = 13건 모두 fix-r5-1 / fix-r5-2 / fix-r5-3 중 1곳에 매핑됨, 2곳 매핑 0).
- **무효 키워드 사용**: 0건 (헌법에 정의된 무효 키워드 7종 — CLAUDE.md 본문 참조 — 본 설계서 grep 결과 모두 0 hit).
- **코드 본체**: 0줄 (시그니처 / 타입 alias / pseudo 단계 명세 / SQL smoke 명령 / git 명령 / commit message 만 — 실 구현 코드 0줄).

— 끝.
