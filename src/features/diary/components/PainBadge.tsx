"use client";

import type { PainLevel } from "@/types/diary";
import { PAIN_LEVEL_LABEL } from "../lib/cuteMentMap";
import styles from "../styles/Diary.module.css";

type PainBadgeProps = {
  /** 오늘 기록된 통증 지수 */
  painLevel: PainLevel;
};

/**
 * 오늘 통증 기록 요약 배지 — 숫자 원형 + 라벨 + AI 정확도 표시
 */
export function PainBadge({ painLevel }: PainBadgeProps) {
  /* 단계별 스타일 클래스 결정 */
  const badgeCls = painLevel >= 4
    ? styles.painBadgeSevere
    : painLevel >= 3
      ? styles.painBadgeModerate
      : painLevel >= 2
        ? styles.painBadgeMild
        : "";

  const circleCls = painLevel >= 4
    ? styles.painCircleSevere
    : painLevel >= 3
      ? styles.painCircleModerate
      : painLevel >= 2
        ? styles.painCircleMild
        : "";

  return (
    <div className={`${styles.painBadge} ${badgeCls}`} style={{ marginTop: "0.75rem" }}>
      <div className={`${styles.painCircle} ${circleCls}`}>
        {painLevel}
      </div>
      <div className={styles.painInfo}>
        <div className={styles.painLabel}>
          오늘 통증 지수: {PAIN_LEVEL_LABEL[painLevel]}
        </div>
        <div className={styles.painAccuracy}>
          <span className={styles.painAccuracyDot} />
          AI 분석 정확도 95%
        </div>
      </div>
    </div>
  );
}
