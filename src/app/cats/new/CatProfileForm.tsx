/**
 * cat-identity Tier 1 — 등록 화면 "필수 4 필드 + 사진" 섹션.
 *
 * 필수:
 *  - 이름 (text, 30자)
 *  - 품종 (자동완성 datalist + 자유입력)
 *  - 생년월일 (<input type=date>)
 *  - 성별 (3 라디오: 남/여/모름)
 * 사진 (선택): <CatPhotoPicker/>
 *
 * Controlled component — draft/onChange/errors 는 상위 (CatRegistrationScreen) 가 소유.
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
import { CatPhotoPicker } from "./CatPhotoPicker";
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

  /* fix R3 R5-E3 — 함수형 setter 패턴.
   * 이전엔 deps 가 [draft, onChange] 라 draft 가 바뀔 때마다 update 가 재생성 → 자식 React.memo 깨짐.
   * 이제 prev 기반 onChange((p) => ...) 로 update 의 deps 에서 draft 제거 → 최초 1회 생성. */
  const update = useCallback(
    <K extends keyof CatDraft>(key: K, value: CatDraft[K]) => {
      onChange((prev) => ({ ...prev, [key]: value }));
    },
    [onChange],
  );

  /* fix R2 R6-1 — CatPhotoPicker (React.memo) 가 매 렌더 onChange ref 변동으로 깨지지 않도록
   * useCallback 으로 안정화. fix R3 R5-E3 효과로 update 도 안정 → handlePhotoChange 도 1회만 생성. */
  const handlePhotoChange = useCallback(
    (file: File | null) => {
      update("photoFile", file);
    },
    [update],
  );

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>기본 정보 (필수)</h2>

      {/* 이름 */}
      <div className={styles.field}>
        <label htmlFor="cat-name" className={styles.label}>
          이름 <span className={styles.required}>*</span>
        </label>
        <input
          id="cat-name"
          type="text"
          value={draft.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="예: 나비"
          className={styles.input}
          autoComplete="off"
          aria-required="true"
          aria-invalid={!!nameError}
          aria-describedby={nameError ? "error-cat-name" : undefined}
        />
        {/* fix R1 #6 — trim 길이 카운터 (HTML maxLength 제거, validation 책임). */}
        <div className={styles.charCounter} aria-hidden>
          {Math.max(0, NAME_MAX - draft.name.trim().length)}자 남음
        </div>
        {nameError && (
          <div id="error-cat-name" role="alert" className={styles.fieldError}>
            {nameError}
          </div>
        )}
      </div>

      {/* 품종 — datalist 자동완성 */}
      <div className={styles.field}>
        <label htmlFor="cat-breed" className={styles.label}>
          품종 <span className={styles.required}>*</span>
        </label>
        <input
          id="cat-breed"
          type="text"
          list="breed-list"
          value={draft.breed}
          onChange={(e) => update("breed", e.target.value)}
          placeholder="예: 코리안 숏헤어"
          className={styles.input}
          autoComplete="off"
          aria-required="true"
          aria-invalid={!!breedError}
          aria-describedby={breedError ? "error-cat-breed" : undefined}
        />
        <div className={styles.charCounter} aria-hidden>
          {Math.max(0, BREED_MAX - draft.breed.trim().length)}자 남음
        </div>
        <datalist id="breed-list">
          {CAT_BREEDS_KO.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        {breedError && (
          <div id="error-cat-breed" role="alert" className={styles.fieldError}>
            {breedError}
          </div>
        )}
      </div>

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

      {/* 성별 라디오 */}
      <div className={styles.field}>
        <div className={styles.label}>
          성별 <span className={styles.required}>*</span>
        </div>
        <div className={styles.radioGroup}>
          {SEX_OPTIONS.map((opt) => (
            <label key={opt.value} className={styles.radioLabel}>
              <input
                type="radio"
                name="cat-sex"
                value={opt.value}
                checked={draft.sex === opt.value}
                onChange={() => update("sex", opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 사진 (R6-1: 안정화된 handlePhotoChange 전달 — memo + useCallback 조합) */}
      <CatPhotoPicker
        file={draft.photoFile}
        onChange={handlePhotoChange}
      />
    </div>
  );
}

/* fix R1 #2 — React.memo 로 감싸 draft/errors 미변경 시 리렌더 회피. */
export const CatProfileForm = memo(CatProfileFormImpl);
