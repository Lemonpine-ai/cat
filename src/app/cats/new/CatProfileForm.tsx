/**
 * cat-identity Tier 1 — 등록 화면 "필수 4 필드 + 사진" 섹션.
 *
 * 필수:
 *  - 이름 (text, 30자) — CatTextField
 *  - 품종 (자동완성 datalist + 자유입력) — CatTextField + datalist
 *  - 생년월일 (<input type=date>)
 *  - 성별 (3 라디오: 남/여/모름)
 * 사진 (선택): <CatPhotoPicker/>
 *
 * Controlled component — draft/onChange/errors 는 상위 (CatRegistrationScreen) 가 소유.
 *
 * fix R4-3 단순화:
 *  - M1: useCatDraftUpdater 헬퍼 사용 (자식 컴포넌트도 동일 패턴 강제).
 *  - m14: 이름/품종 inline 패턴을 CatTextField 로 추출 (185 → ~95 줄).
 *  - m18: CatPhotoPicker 에 errorMessage 전달 (validateCatDraft 의 photoFile 에러 노출).
 */

"use client";

import { memo, useCallback, type Dispatch, type SetStateAction } from "react";
import type { CatDraft, CatSex } from "@/types/cat";
import {
  getFieldError,
  type ValidationError,
} from "@/lib/cat/validateCatDraft";
import { CAT_BREEDS_KO } from "@/lib/cat/breedList";
import { NAME_MAX, BREED_MAX } from "@/lib/cat/constants";
import { useCatDraftUpdater } from "@/hooks/useCatDraftUpdater";
import { CatPhotoPicker } from "./CatPhotoPicker";
import { CatTextField } from "./CatTextField";
import { CatRadioGroup } from "./CatRadioGroup";
import styles from "./CatRegistrationScreen.module.css";

/* fix R3 R5-E3 — onChange 시그니처를 React.Dispatch<SetStateAction<CatDraft>> 로 확장.
 * 함수형 updater 를 받아 update 의 deps 에서 draft 를 제거 → React.memo 효과 회복. */
export type CatProfileFormProps = {
  draft: CatDraft;
  onChange: Dispatch<SetStateAction<CatDraft>>;
  errors: ValidationError[];
};

/** 성별 라디오 3개 */
const SEX_OPTIONS: ReadonlyArray<{ value: CatSex; label: string }> = [
  { value: "male", label: "남아 (수컷)" },
  { value: "female", label: "여아 (암컷)" },
  { value: "unknown", label: "모름" },
];

function CatProfileFormImpl({ draft, onChange, errors }: CatProfileFormProps) {
  const nameError = getFieldError(errors, "name");
  const breedError = getFieldError(errors, "breed");
  const birthError = getFieldError(errors, "birthDate");
  /* fix R4-3 m18 — Picker 의 photoFile validation 에러 표시. */
  const photoError = getFieldError(errors, "photoFile");

  /* fix R4-3 M1 — 함수형 setter 통일 (자식 React.memo 효과 회복). */
  const update = useCatDraftUpdater(onChange);

  /* useCallback 어댑터 — 자식 (memo) 의 ref 변동 차단. */
  const handlePhotoChange = useCallback(
    (file: File | null) => update("photoFile", file),
    [update],
  );
  const handleNameChange = useCallback((v: string) => update("name", v), [update]);
  const handleBreedChange = useCallback((v: string) => update("breed", v), [update]);
  /* fix R5-2 R3-2 — CatRadioGroup onChange (string → CatSex narrow). */
  const handleSexChange = useCallback(
    (next: string) => update("sex", next as CatSex),
    [update],
  );

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>기본 정보 (필수)</h2>

      {/* 이름 — CatTextField (fix R4-3 m14). */}
      <CatTextField
        id="cat-name"
        label="이름"
        required
        value={draft.name}
        onChange={handleNameChange}
        placeholder="예: 나비"
        maxLength={NAME_MAX}
        errorMessage={nameError}
      />

      {/* 품종 — datalist 자동완성 + CatTextField. */}
      <CatTextField
        id="cat-breed"
        label="품종"
        required
        value={draft.breed}
        onChange={handleBreedChange}
        placeholder="예: 코리안 숏헤어"
        maxLength={BREED_MAX}
        list="breed-list"
        errorMessage={breedError}
      />
      <datalist id="breed-list">
        {CAT_BREEDS_KO.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>

      {/* 생년월일 */}
      <div className={styles.field}>
        <label htmlFor="cat-birth" className={styles.label}>
          생년월일 <span className={styles.required}>*</span>
        </label>
        <input
          id="cat-birth"
          type="date"
          value={draft.birthDate}
          onChange={(e) => update("birthDate", e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className={styles.input}
          aria-required="true"
          aria-invalid={!!birthError}
          aria-describedby={birthError ? "error-cat-birth" : undefined}
        />
        {birthError && (
          <div id="error-cat-birth" role="alert" className={styles.fieldError}>
            {birthError}
          </div>
        )}
      </div>

      {/* 성별 라디오 — fix R5-2 R3-2: CatRadioGroup 추출. */}
      <CatRadioGroup
        name="cat-sex"
        options={SEX_OPTIONS}
        value={draft.sex}
        onChange={handleSexChange}
        legend="성별 *"
      />

      {/* 사진 (R6-1: 안정화된 handlePhotoChange + R4-3 m18 errorMessage 전달). */}
      <CatPhotoPicker
        file={draft.photoFile}
        onChange={handlePhotoChange}
        errorMessage={photoError}
      />
    </div>
  );
}

/* fix R1 #2 — React.memo 로 감싸 draft/errors 미변경 시 리렌더 회피. */
export const CatProfileForm = memo(CatProfileFormImpl);
