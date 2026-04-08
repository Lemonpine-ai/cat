"use client";

import type { WeeklyCareStats } from "@/types/diary";
import styles from "../styles/Diary.module.css";

type WeeklyHighlightCardsProps = {
  /** 이번 주 돌봄 통계 */
  stats: WeeklyCareStats;
};

/**
 * 이번 주 하이라이트 — 식사·물·화장실·약 횟수를 2x2 그리드로 표시
 */
export function WeeklyHighlightCards({ stats }: WeeklyHighlightCardsProps) {
  /* 카드 4장 정의 */
  const cards = [
    { icon: "🍚", label: "식사", value: stats.totalMeals, bgClass: styles.weeklyCardIconMeal },
    { icon: "💧", label: "식수 교체", value: stats.totalWater, bgClass: styles.weeklyCardIconWater },
    { icon: "🚽", label: "화장실", value: stats.totalLitter, bgClass: styles.weeklyCardIconLitter },
    { icon: "💊", label: "투약", value: stats.totalMedicine, bgClass: styles.weeklyCardIconMedicine },
  ] as const;

  return (
    <section className={styles.weeklySection}>
      <h2 className={styles.sectionTitle}>📊 이번 주 하이라이트</h2>
      <div className={styles.weeklyGrid}>
        {cards.map((card) => (
          <div key={card.label} className={styles.weeklyCard}>
            {/* 아이콘 */}
            <div className={`${styles.weeklyCardIcon} ${card.bgClass}`}>
              {card.icon}
            </div>
            {/* 수치 */}
            <div>
              <div className={styles.weeklyCardValue}>{card.value}회</div>
              <div className={styles.weeklyCardLabel}>{card.label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
