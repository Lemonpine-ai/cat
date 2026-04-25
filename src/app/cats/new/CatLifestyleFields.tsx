/**
 * cat-identity Tier 1 fix R1 #4 — 옵션 섹션 "생활" 분할.
 *
 * 분리 대상 (CatOptionalFields 에서 추출):
 *  - 모래 (select 드롭다운)
 *  - 사료 (datalist 자동완성)
 */

"use client";

import { memo, useCallback, type Dispatch, type SetStateAction } from "react";
import type { CatDraft } from "@/types/cat";
import type { ValidationError } from "@/lib/cat/validateCatDraft";
import { LITTER_TYPES_KO } from "@/lib/cat/litterTypes";
import { CAT_FOODS_KO } from "@/lib/cat/foodList";
import styles from "./CatRegistrationScreen.module.css";

/* fix R3 R5-E3 — 부모 setDraft 와 호환되는 시그니처. */
export type CatLifestyleFieldsProps = {
  draft: CatDraft;
  onChange: Dispatch<SetStateAction<CatDraft>>;
  /** 향후 lifestyle 관련 validation 추가 시 사용 (현재는 미사용 — props 시그니처 통일). */
  errors: ValidationError[];
};

function CatLifestyleFieldsImpl({ draft, onChange }: CatLifestyleFieldsProps) {
  const update = useCallback(
    <K extends keyof CatDraft>(key: K, value: CatDraft[K]) => {
      onChange({ ...draft, [key]: value });
    },
    [draft, onChange],
  );

  return (
    <>
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
    </>
  );
}

export const CatLifestyleFields = memo(CatLifestyleFieldsImpl);
