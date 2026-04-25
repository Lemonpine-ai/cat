/**
 * cat-identity Tier 1 fix R5-2 R3-2 / R3-3 — 라디오 그룹 공용 컴포넌트.
 *
 * CatProfileForm 의 SEX_OPTIONS (3 옵션) 와 CatHealthFields 의 NEUTERED_OPTIONS (3 옵션) 가
 * 거의 동일한 패턴 (fieldset/legend + radio inputs + label) 으로 inline 작성되어 있었음.
 * 본 컴포넌트로 추출하여 두 호출처 단순화 + 단일 책임 + 100줄 한도 통과.
 *
 * 책임:
 *  - <fieldset><legend> 구조 + radio inputs 렌더 (legend 부재 시 visually-hidden 처리).
 *  - aria-invalid + aria-describedby 자동 매핑.
 *  - 키보드: 표준 <input type="radio"> 가 자동 처리 (방향키 / Space).
 *
 * Controlled — value/onChange 는 부모가 소유.
 */

"use client";

import { memo } from "react";
import styles from "./CatRegistrationScreen.module.css";

/** 라디오 옵션 단일 항목. */
export type CatRadioOption = {
  /** input value (string union — 호출자가 narrow). */
  value: string;
  /** 화면 라벨 (예: "남아 (수컷)" / "예 (중성화 완료)"). */
  label: string;
};

export type CatRadioGroupProps = {
  /** input name 속성 — 라디오 그룹 식별 (예: "cat-sex" / "cat-neutered"). */
  name: string;
  /** 라디오 옵션 배열. */
  options: ReadonlyArray<CatRadioOption>;
  /** 현재 선택된 value (없으면 null). */
  value: string | null;
  /** 값 변경 콜백. */
  onChange: (next: string) => void;
  /** fieldset legend 텍스트 (옵션 — 부재 시 visually-hidden 처리). */
  legend?: string;
  /** 비활성화. */
  disabled?: boolean;
  /** validation 에러 메시지 — 있으면 aria-invalid + 에러 표시. */
  error?: string | null;
  /**
   * aria-describedby 외부 id 연결 — 부모가 별도 도움말/안내 요소를 갖는 경우.
   * error 와 동시 존재 시 둘 다 join 되어 aria-describedby 에 들어감.
   */
  describedById?: string;
};

function CatRadioGroupImpl({
  name,
  options,
  value,
  onChange,
  legend,
  disabled = false,
  error,
  describedById,
}: CatRadioGroupProps) {
  const errorId = `error-${name}`;
  /* aria-describedby 결합 — error 우선 + 외부 describedById 가 있으면 join. */
  const describedBy =
    [error ? errorId : null, describedById ?? null]
      .filter((v): v is string => !!v)
      .join(" ") || undefined;

  return (
    <div className={styles.field}>
      {legend && <div className={styles.label}>{legend}</div>}
      <div
        className={styles.radioGroup}
        role="radiogroup"
        aria-invalid={!!error}
        aria-describedby={describedBy}
      >
        {options.map((opt) => (
          <label key={opt.value} className={styles.radioLabel}>
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              disabled={disabled}
              onChange={() => onChange(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      {error && (
        <div id={errorId} role="alert" className={styles.fieldError}>
          {error}
        </div>
      )}
    </div>
  );
}

/* fix R1 #2 — React.memo 로 감싸 props 미변경 시 리렌더 회피. */
export const CatRadioGroup = memo(CatRadioGroupImpl);
