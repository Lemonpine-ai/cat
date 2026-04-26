/**
 * cat-identity Tier 1 fix R5-2 R3-3 — textarea 공용 컴포넌트.
 *
 * CatHealthFields 의 medicalNotes / medications / supplements 3 textarea 가 거의 복붙
 * (label/textarea/maxLength/placeholder 패턴) 이었음. 본 컴포넌트로 추출하여 단순화.
 *
 * CatTextField (input type=text) 와 동일한 a11y 구조 — 차이는 단일 <textarea>.
 *
 * Controlled — value/onChange 는 부모가 소유.
 */

"use client";

import { memo } from "react";
import styles from "./CatRegistrationScreen.module.css";

export type CatTextAreaProps = {
  /** textarea id (label 의 htmlFor 와 매칭, 예: "cat-medical"). */
  id: string;
  /** 화면에 보일 라벨 텍스트. */
  label: string;
  /** 현재 값. */
  value: string;
  /** 값 변경 콜백. */
  onChange: (next: string) => void;
  /** 표시 줄 수 (기본 3). */
  rows?: number;
  /** 최대 글자수 (기본 500). HTML maxLength 로 적용. */
  maxLength?: number;
  /** placeholder. */
  placeholder?: string;
  /** validation 에러 메시지 — 있으면 aria-invalid + role=alert. */
  error?: string | null;
  /** aria-describedby 외부 id 연결. */
  describedById?: string;
  /** 비활성화. */
  disabled?: boolean;
};

function CatTextAreaImpl({
  id,
  label,
  value,
  onChange,
  rows = 3,
  maxLength = 500,
  placeholder,
  error,
  describedById,
  disabled = false,
}: CatTextAreaProps) {
  const errorId = `error-${id}`;
  /* aria-describedby 결합 — error 우선 + 외부 describedById 가 있으면 join. */
  const describedBy =
    [error ? errorId : null, describedById ?? null]
      .filter((v): v is string => !!v)
      .join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        className={styles.textarea}
        aria-invalid={!!error}
        aria-describedby={describedBy}
      />
      {error && (
        <div id={errorId} role="alert" className={styles.fieldError}>
          {error}
        </div>
      )}
    </div>
  );
}

/* fix R1 #2 — React.memo 로 감싸 props 미변경 시 리렌더 회피. */
export const CatTextArea = memo(CatTextAreaImpl);
