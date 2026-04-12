"use client";

import { getFgsMent } from "@/lib/fgs/fgsMentMap";
import styles from "./Fgs.module.css";

type Props = {
  /** FGS 통증 점수 (0-4) */
  score: number;
};

/**
 * FGS 점수 인디케이터 — 원형 배지로 점수 + 라벨 표시
 * 점수별 색상이 다르다 (초록 → 빨강)
 */
export function FgsScoreIndicator({ score }: Props) {
  const { color, label } = getFgsMent(score);

  return (
    <span
      className={styles.scoreIndicator}
      style={{ backgroundColor: color }}
    >
      {score}점
      <span className={styles.scoreLabel}>{label}</span>
    </span>
  );
}
