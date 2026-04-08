"use client";

import type { WeeklyCareStats } from "@/types/diary";
import styles from "./Diary.module.css";

type Props = {
  summary: WeeklyCareStats;
};

/** 하이라이트 카드 하나의 설정 */
const HIGHLIGHT_ITEMS = [
  { key: "totalMeals" as const, icon: "🍚", label: "식사", unit: "번" },
  { key: "totalMedicine" as const, icon: "💊", label: "약", unit: "번" },
  { key: "totalWater" as const, icon: "💧", label: "물갈이", unit: "번" },
  { key: "totalLitter" as const, icon: "✨", label: "모래갈이", unit: "번" },
] as const;

/**
 * 이번 주 하이라이트 카드 (2x2 그리드)
 * - 식사, 약, 물갈이, 모래갈이 횟수를 파스텔 카드로 표시
 */
export function WeeklyHighlightCards({ summary }: Props) {
  return (
    <>
      <h2 className={styles.sectionTitle}>이번 주 하이라이트 📋</h2>
      <div className={styles.highlightGrid}>
        {HIGHLIGHT_ITEMS.map((item) => (
          <div key={item.key} className={styles.highlightCard}>
            <div className={styles.highlightIcon}>{item.icon}</div>
            <div className={styles.highlightCount}>
              {summary[item.key]}
              <span className={styles.highlightUnit}>{item.unit}</span>
            </div>
            <div className={styles.highlightLabel}>
              이번 주 {item.label}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
