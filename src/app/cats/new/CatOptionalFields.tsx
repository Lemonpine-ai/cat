/**
 * cat-identity Tier 1 — 등록 화면 "옵션 7 필드" 아코디언 섹션.
 *
 * 옵션:
 *  - 중성화 (3 라디오: 예/아니오/모름)
 *  - 체중 (number, 0~30 kg)
 *  - 기저질환/주의사항 (textarea)
 *  - 복용중인 약 (textarea)
 *  - 영양제 (textarea)
 *  - 모래 (select 드롭다운)
 *  - 사료 (datalist 자동완성 + 자유입력)
 *
 * 전부 비어있어도 등록 가능. 상위 `CatRegistrationScreen` 의 아코디언 펼침 상태에 따라 표시.
 */

"use client";

import type { CatDraft, CatNeuteredStatus } from "@/types/cat";
import {
  getFieldError,
  type ValidationError,
} from "@/lib/cat/validateCatDraft";
import { LITTER_TYPES_KO } from "@/lib/cat/litterTypes";
import { CAT_FOODS_KO } from "@/lib/cat/foodList";
import styles from "./CatRegistrationScreen.module.css";

export type CatOptionalFieldsProps = {
  draft: CatDraft;
  onChange: (next: CatDraft) => void;
  errors: ValidationError[];
};

const NEUTERED_OPTIONS: ReadonlyArray<{ value: CatNeuteredStatus; label: string }> = [
  { value: "yes", label: "예 (중성화 완료)" },
  { value: "no", label: "아니오 (미완료)" },
  { value: "unknown", label: "모름" },
];

export function CatOptionalFields({
  draft,
  onChange,
  errors,
}: CatOptionalFieldsProps) {
  const weightError = getFieldError(errors, "weightKg");

  const update = <K extends keyof CatDraft>(key: K, value: CatDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>추가 정보 (선택)</h2>
      <p className={styles.sectionHelp}>
        나중에 언제든 수정할 수 있어요. 지금은 아는 것만 입력해도 괜찮아요.
      </p>

      {/* 중성화 여부 */}
      <div className={styles.field}>
        <div className={styles.label}>중성화 여부</div>
        <div className={styles.radioGroup}>
          {NEUTERED_OPTIONS.map((opt) => (
            <label key={opt.value} className={styles.radioLabel}>
              <input
                type="radio"
                name="cat-neutered"
                value={opt.value}
                checked={draft.isNeutered === opt.value}
                onChange={() => update("isNeutered", opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 체중 */}
      <div className={styles.field}>
        <label htmlFor="cat-weight" className={styles.label}>
          체중 (kg)
        </label>
        <input
          id="cat-weight"
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          max="30"
          value={draft.weightKg}
          onChange={(e) => update("weightKg", e.target.value)}
          placeholder="예: 4.5"
          className={styles.input}
        />
        {weightError && <div className={styles.fieldError}>{weightError}</div>}
      </div>

      {/* 기저질환 */}
      <div className={styles.field}>
        <label htmlFor="cat-medical" className={styles.label}>
          기저질환 / 주의사항
        </label>
        <textarea
          id="cat-medical"
          value={draft.medicalNotes}
          onChange={(e) => update("medicalNotes", e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="예: 신장 수치 주의, 알러지 있음..."
          className={styles.textarea}
        />
      </div>

      {/* 복용약 */}
      <div className={styles.field}>
        <label htmlFor="cat-meds" className={styles.label}>
          복용 중인 약
        </label>
        <textarea
          id="cat-meds"
          value={draft.medications}
          onChange={(e) => update("medications", e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="예: 아침 반알 / 저녁 반알"
          className={styles.textarea}
        />
      </div>

      {/* 영양제 */}
      <div className={styles.field}>
        <label htmlFor="cat-supplements" className={styles.label}>
          영양제
        </label>
        <textarea
          id="cat-supplements"
          value={draft.supplements}
          onChange={(e) => update("supplements", e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="예: 관절 영양제, 눈물 자국 완화"
          className={styles.textarea}
        />
      </div>

      {/* 모래 드롭다운 */}
      <div className={styles.field}>
        <label htmlFor="cat-litter" className={styles.label}>
          사용하는 모래
        </label>
        <select
          id="cat-litter"
          value={draft.litterType}
          onChange={(e) => update("litterType", e.target.value)}
          className={styles.input}
        >
          <option value="">선택 안 함</option>
          {LITTER_TYPES_KO.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* 사료 자동완성 */}
      <div className={styles.field}>
        <label htmlFor="cat-food" className={styles.label}>
          사료
        </label>
        <input
          id="cat-food"
          type="text"
          list="food-list"
          value={draft.foodType}
          onChange={(e) => update("foodType", e.target.value)}
          maxLength={50}
          placeholder="예: 로얄캐닌 인도어"
          className={styles.input}
          autoComplete="off"
        />
        <datalist id="food-list">
          {CAT_FOODS_KO.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
