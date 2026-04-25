/**
 * cat-identity Tier 1 fix R1 #4 — 옵션 섹션 "건강" 분할.
 *
 * 분리 대상 (CatOptionalFields 에서 추출):
 *  - 중성화 (3 라디오)
 *  - 체중 (number 0.1~30 kg)
 *  - 기저질환/주의사항 (textarea)
 *  - 복용약 (textarea)
 *  - 영양제 (textarea)
 *
 * Controlled — props (draft / onChange / errors) 동일.
 */

"use client";

import { memo, useCallback } from "react";
import type { CatDraft, CatNeuteredStatus } from "@/types/cat";
import {
  getFieldError,
  type ValidationError,
} from "@/lib/cat/validateCatDraft";
import styles from "./CatRegistrationScreen.module.css";

export type CatHealthFieldsProps = {
  draft: CatDraft;
  onChange: (next: CatDraft) => void;
  errors: ValidationError[];
};

const NEUTERED_OPTIONS: ReadonlyArray<{ value: CatNeuteredStatus; label: string }> = [
  { value: "yes", label: "예 (중성화 완료)" },
  { value: "no", label: "아니오 (미완료)" },
  { value: "unknown", label: "모름" },
];

function CatHealthFieldsImpl({ draft, onChange, errors }: CatHealthFieldsProps) {
  const weightError = getFieldError(errors, "weightKg");

  const update = useCallback(
    <K extends keyof CatDraft>(key: K, value: CatDraft[K]) => {
      onChange({ ...draft, [key]: value });
    },
    [draft, onChange],
  );

  return (
    <>
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
          min="0.1"
          max="30"
          value={draft.weightKg}
          onChange={(e) => update("weightKg", e.target.value)}
          placeholder="예: 4.5"
          className={styles.input}
          aria-invalid={!!weightError}
          aria-describedby={weightError ? "error-cat-weight" : undefined}
        />
        {weightError && (
          <div id="error-cat-weight" role="alert" className={styles.fieldError}>
            {weightError}
          </div>
        )}
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
    </>
  );
}

export const CatHealthFields = memo(CatHealthFieldsImpl);
