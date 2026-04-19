"use client";

import type { WeeklyCareStats } from "@/types/diary";
import type { DiaryStats } from "../types/diaryStats";
import styles from "../styles/Diary.module.css";

/* ─── 허용 오차 — ±20% 이내는 "동일" 로 표시 ─── */
const TREND_TOLERANCE = 0.2;

/* ─── 주간 평균 타입 (4개 지표) ─── */
type WeeklyAvg = {
  /** 하루 평균 식사 횟수 */
  meal: number;
  /** 하루 평균 음수 횟수 */
  water: number;
  /** 하루 평균 배변 횟수 */
  poop: number;
  /** 하루 평균 활동 시간(초) */
  activity: number;
};

type WeeklyHighlightCardsProps = {
  /** 이번 주 돌봄 통계 — 기존 props (하위호환, 폴백 렌더링) */
  stats: WeeklyCareStats;
  /** 오늘 실제 수치 (있으면 신규 렌더링) */
  today?: DiaryStats | null;
  /** 주간 평균 (있으면 신규 렌더링) */
  weeklyAvg?: WeeklyAvg;
};

/* ─── 추세 화살표 결정 ─── */
type Trend = "up" | "down" | "flat";

/**
 * 오늘 값 vs 평균 비교.
 * 평균이 0 이면 오늘 값이 0 초과일 때 "up", 아니면 "flat".
 */
function computeTrend(today: number, avg: number): Trend {
  if (avg <= 0) return today > 0 ? "up" : "flat";
  const ratio = today / avg;
  if (ratio > 1 + TREND_TOLERANCE) return "up";
  if (ratio < 1 - TREND_TOLERANCE) return "down";
  return "flat";
}

/**
 * Trend → 이모지 기호
 * - up: ↑ (평균 초과)
 * - down: ↓ (평균 미만)
 * - flat: ─ (허용 오차 내)
 */
function trendArrow(t: Trend): string {
  return t === "up" ? "↑" : t === "down" ? "↓" : "─";
}

/** 추세 색상 — 초록/주황/회색 */
function trendColor(t: Trend): string {
  return t === "up" ? "#10b981" : t === "down" ? "#f59e0b" : "#9ca3af";
}

/**
 * 오늘 한눈에 — 오늘 수치 vs 주간 평균 4개 카드 표시.
 * today + weeklyAvg 가 모두 있으면 신규 렌더링,
 * 없으면 기존 주간 누적 렌더링으로 폴백 (하위호환).
 */
export function WeeklyHighlightCards({
  stats,
  today,
  weeklyAvg,
}: WeeklyHighlightCardsProps) {
  /* ─── 신규 렌더링: 오늘 vs 주간 평균 ─── */
  if (today && weeklyAvg) {
    /* 활동은 초 → 분 환산해서 표시 */
    const todayActivityMin = Math.round((today.activity_seconds ?? 0) / 60);
    const avgActivityMin = Math.round(weeklyAvg.activity / 60);

    /* 카드 4개 정의 — 비교 기반 */
    const cards = [
      {
        icon: "🍚",
        label: "식사",
        todayValue: today.meal_count,
        avgValue: weeklyAvg.meal,
        unit: "회",
        bgClass: styles.weeklyCardIconMeal,
      },
      {
        icon: "💧",
        label: "음수",
        todayValue: today.water_count,
        avgValue: weeklyAvg.water,
        unit: "회",
        bgClass: styles.weeklyCardIconWater,
      },
      {
        icon: "🚽",
        label: "배변",
        todayValue: today.poop_count,
        avgValue: weeklyAvg.poop,
        unit: "회",
        bgClass: styles.weeklyCardIconLitter,
      },
      {
        icon: "🏃",
        label: "활동",
        todayValue: todayActivityMin,
        avgValue: avgActivityMin,
        unit: "분",
        bgClass: styles.weeklyCardIconActivity,
      },
    ] as const;

    return (
      <section className={styles.weeklySection}>
        <h2 className={styles.sectionTitle}>📊 오늘 한눈에</h2>
        <div className={styles.weeklyGrid}>
          {cards.map((card) => {
            /* 활동은 분 단위 비교, 나머지는 횟수 비교 */
            const trend = computeTrend(card.todayValue, card.avgValue);
            return (
              <div key={card.label} className={styles.weeklyCard}>
                {/* 아이콘 */}
                <div className={`${styles.weeklyCardIcon} ${card.bgClass}`}>
                  {card.icon}
                </div>
                {/* 수치 + 비교 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.weeklyCardValue}>
                    {card.todayValue}
                    {card.unit}
                    {/* 추세 화살표 — 색상 인라인 (타입별 다름) */}
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: "0.85em",
                        color: trendColor(trend),
                        fontWeight: 700,
                      }}
                    >
                      {trendArrow(trend)}
                    </span>
                  </div>
                  <div className={styles.weeklyCardLabel}>
                    {card.label} · 평균 {card.avgValue}
                    {card.unit}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  /* ─── 폴백 렌더링: 기존 주간 누적 (하위호환) ─── */
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
