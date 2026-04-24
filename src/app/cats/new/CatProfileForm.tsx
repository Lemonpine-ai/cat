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

import type { CatDraft, CatSex } from "@/types/cat";
import {
  getFieldError,
  type ValidationError,
} from "@/lib/cat/validateCatDraft";
import { CAT_BREEDS_KO } from "@/lib/cat/breedList";
import { CatPhotoPicker } from "./CatPhotoPicker";
import styles from "./CatRegistrationScreen.module.css";

export type CatProfileFormProps = {
  draft: CatDraft;
  onChange: (next: CatDraft) => void;
  errors: ValidationError[];
};

/** 성별 라디오 3개 */
const SEX_OPTIONS: ReadonlyArray<{ value: CatSex; label: string }> = [
  { value: "male", label: "남아 (수컷)" },
  { value: "female", label: "여아 (암컷)" },
  { value: "unknown", label: "모름" },
];

export function CatProfileForm({ draft, onChange, errors }: CatProfileFormProps) {
  const nameError = getFieldError(errors, "name");
  const breedError = getFieldError(errors, "breed");
  const birthError = getFieldError(errors, "birthDate");

  const update = <K extends keyof CatDraft>(key: K, value: CatDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };

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
          maxLength={30}
          placeholder="예: 나비"
          className={styles.input}
          autoComplete="off"
        />
        {nameError && <div className={styles.fieldError}>{nameError}</div>}
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
          maxLength={30}
          placeholder="예: 코리안 숏헤어"
          className={styles.input}
          autoComplete="off"
        />
        <datalist id="breed-list">
          {CAT_BREEDS_KO.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        {breedError && <div className={styles.fieldError}>{breedError}</div>}
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
        />
        {birthError && <div className={styles.fieldError}>{birthError}</div>}
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

      {/* 사진 */}
      <CatPhotoPicker
        file={draft.photoFile}
        onChange={(file) => update("photoFile", file)}
      />
    </div>
  );
}
