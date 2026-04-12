"use client";

import styles from "./Fgs.module.css";

type Props = {
  /** 연속 경고 일수 */
  consecutiveDays: number;
};

/**
 * FGS 경고 배너 — 2일 연속 FGS 2+ 일 때만 표시
 * 사장님한테 "고양이가 불편해 보인다"고 알려주는 배너
 */
export function FgsAlertBanner({ consecutiveDays }: Props) {
  /* 2일 미만이면 표시 안 함 */
  if (consecutiveDays < 2) return null;

  return (
    <div className={styles.alertBanner}>
      <span className={styles.alertIcon}>🚨</span>
      <span className={styles.alertText}>
        통증 징후가 {consecutiveDays}일째 감지되고 있어요.
        수의사 상담을 권장합니다.
      </span>
    </div>
  );
}
