/**
 * cat-identity Tier 1 — 등록 화면 "옵션" 아코디언 컴포지션.
 *
 * fix R1 #4 단순화: 7 필드 직접 렌더 → CatHealthFields + CatLifestyleFields 두 자식으로 분리.
 *  - Health: 중성화, 체중, 기저질환, 복용약, 영양제
 *  - Lifestyle: 모래, 사료
 *
 * 본 파일은 헤더 + 도움말 + composition 만 담당 (~40 LOC).
 */

"use client";

import { memo } from "react";
import type { CatDraft } from "@/types/cat";
import type { ValidationError } from "@/lib/cat/validateCatDraft";
import { CatHealthFields } from "./CatHealthFields";
import { CatLifestyleFields } from "./CatLifestyleFields";
import styles from "./CatRegistrationScreen.module.css";

export type CatOptionalFieldsProps = {
  draft: CatDraft;
  onChange: (next: CatDraft) => void;
  errors: ValidationError[];
};

function CatOptionalFieldsImpl({
  draft,
  onChange,
  errors,
}: CatOptionalFieldsProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>추가 정보 (선택)</h2>
      <p className={styles.sectionHelp}>
        나중에 언제든 수정할 수 있어요. 지금은 아는 것만 입력해도 괜찮아요.
      </p>

      <CatHealthFields draft={draft} onChange={onChange} errors={errors} />
      <CatLifestyleFields draft={draft} onChange={onChange} errors={errors} />
    </div>
  );
}

/* fix R1 #2 — React.memo 로 감싸 옵션 토글 시 리렌더 절감. */
export const CatOptionalFields = memo(CatOptionalFieldsImpl);
