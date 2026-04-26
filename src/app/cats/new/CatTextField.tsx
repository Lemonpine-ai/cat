/**
 * cat-identity Tier 1 fix R4-3 m14 — 이름/품종 등 텍스트 입력 필드 공통 컴포넌트.
 *
 * CatProfileForm 의 이름/품종 두 블록이 거의 동일한 패턴이었다 (label/input/counter/error 5블록).
 * 본 컴포넌트로 추출하여 단일 책임 + 100줄 한도 통과.
 *
 * 책임:
 *  - label / input / 글자수 카운터 / errorMessage 렌더
 *  - aria-required / aria-invalid / aria-describedby 자동 매핑
 *  - datalist (선택) 연결
 *
 * Controlled — value/onChange 는 부모 (CatProfileForm) 가 소유.
 */

"use client";

import { memo } from "react";
import styles from "./CatRegistrationScreen.module.css";

export type CatTextFieldProps = {
  /** input id (label 의 htmlFor 와 매칭, 예: "cat-name" / "cat-breed"). */
  id: string;
  /** 화면에 보일 라벨 텍스트 (예: "이름" / "품종"). */
  label: string;
  /** 필수 입력 표시 (asterisk + aria-required). */
  required?: boolean;
  /** 현재 값. */
  value: string;
  /** 값 변경 콜백 — 단순 string. */
  onChange: (value: string) => void;
  /** placeholder. */
  placeholder?: string;
  /**
   * 글자수 카운터 표시용 최대 글자수 (NAME_MAX / BREED_MAX).
   * HTML maxLength 는 사용하지 않음 (validation 책임 — fix R1 #6).
   */
  maxLength: number;
  /** datalist id (자동완성 — 품종 등). 부재 시 미연결. */
  list?: string;
  /** validation 에러 메시지 — 표시되면 aria-invalid + role=alert. */
  errorMessage?: string | null;
};

function CatTextFieldImpl({
  id,
  label,
  required = false,
  value,
  onChange,
  placeholder,
  maxLength,
  list,
  errorMessage,
}: CatTextFieldProps) {
  const errorId = `error-${id}`;
  const remaining = Math.max(0, maxLength - value.trim().length);

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      <input
        id={id}
        type="text"
        list={list}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={styles.input}
        autoComplete="off"
        aria-required={required || undefined}
        aria-invalid={!!errorMessage}
        aria-describedby={errorMessage ? errorId : undefined}
      />
      {/* fix R1 #6 — trim 길이 카운터 (HTML maxLength 제거, validation 책임). */}
      <div className={styles.charCounter} aria-hidden>
        {remaining}자 남음
      </div>
      {errorMessage && (
        <div id={errorId} role="alert" className={styles.fieldError}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}

export const CatTextField = memo(CatTextFieldImpl);
