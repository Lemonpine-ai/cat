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

import { memo, useCallback, type Dispatch, type SetStateAction } from "react";
import type { CatDraft, CatNeuteredStatus } from "@/types/cat";
import {
  getFieldError,
  type ValidationError,
} from "@/lib/cat/validateCatDraft";
import { useCatDraftUpdater } from "@/hooks/useCatDraftUpdater";
import { CatRadioGroup } from "./CatRadioGroup";
import { CatTextArea } from "./CatTextArea";
import styles from "./CatRegistrationScreen.module.css";

/* fix R3 R5-E3 — 부모 setDraft 와 호환되는 시그니처. */
export type CatHealthFieldsProps = {
  draft: CatDraft;
  onChange: Dispatch<SetStateAction<CatDraft>>;
  errors: ValidationError[];
};

const NEUTERED_OPTIONS: ReadonlyArray<{ value: CatNeuteredStatus; label: string }> = [
  { value: "yes", label: "예 (중성화 완료)" },
  { value: "no", label: "아니오 (미완료)" },
  { value: "unknown", label: "모름" },
];

function CatHealthFieldsImpl({ draft, onChange, errors }: CatHealthFieldsProps) {
  const weightError = getFieldError(errors, "weightKg");

  /* fix R4-3 M1 — 함수형 setter 통일 (자식 React.memo 효과 회복). */
  const update = useCatDraftUpdater(onChange);

  /* fix R5-2 R3-3 — 자식 (memo) 의 ref 변동 차단용 useCallback 어댑터들. */
  const handleNeuteredChange = useCallback(
    (next: string) => update("isNeutered", next as CatNeuteredStatus),
    [update],
  );
  const handleMedicalNotesChange = useCallback(
    (v: string) => update("medicalNotes", v),
    [update],
  );
  const handleMedicationsChange = useCallback(
    (v: string) => update("medications", v),
    [update],
  );
  const handleSupplementsChange = useCallback(
    (v: string) => update("supplements", v),
    [update],
  );

  return (
    <>
      {/* 중성화 여부 — fix R5-2 R3-3: CatRadioGroup 추출. */}
      <CatRadioGroup
        name="cat-neutered"
        options={NEUTERED_OPTIONS}
        value={draft.isNeutered}
        onChange={handleNeuteredChange}
        legend="중성화 여부"
      />

      {/* 체중 (input type=number — CatTextField/CatTextArea 미사용, native 위젯 유지). */}
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

      {/* 기저질환 / 주의사항 — fix R5-2 R3-3: CatTextArea 추출. */}
      <CatTextArea
        id="cat-medical"
        label="기저질환 / 주의사항"
        value={draft.medicalNotes}
        onChange={handleMedicalNotesChange}
        rows={3}
        maxLength={500}
        placeholder="예: 신장 수치 주의, 알러지 있음..."
      />

      {/* 복용 중인 약. */}
      <CatTextArea
        id="cat-meds"
        label="복용 중인 약"
        value={draft.medications}
        onChange={handleMedicationsChange}
        rows={2}
        maxLength={300}
        placeholder="예: 아침 반알 / 저녁 반알"
      />

      {/* 영양제. */}
      <CatTextArea
        id="cat-supplements"
        label="영양제"
        value={draft.supplements}
        onChange={handleSupplementsChange}
        rows={2}
        maxLength={300}
        placeholder="예: 관절 영양제, 눈물 자국 완화"
      />
    </>
  );
}

export const CatHealthFields = memo(CatHealthFieldsImpl);
