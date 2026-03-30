"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CatDailySummaryItem } from "@/types/catDailySummary";
import styles from "./CatvisorHomeDashboard.module.css";

type TodaySummaryCardsProps = {
  initialSummary: CatDailySummaryItem[];
  homeId: string;
  initialTodayMedicineCount: number;
};

function addToSummary(
  previous: CatDailySummaryItem[],
  catId: string,
  catName: string,
  status: string,
): CatDailySummaryItem[] {
  const isMeal = status === "식사";
  const isToilet = status === "배변";
  if (!isMeal && !isToilet) {
    return previous;
  }
  const exists = previous.find((item) => item.catId === catId);
  if (exists) {
    return previous.map((item) =>
      item.catId === catId
        ? {
            ...item,
            mealCount: isMeal ? item.mealCount + 1 : item.mealCount,
            toiletCount: isToilet ? item.toiletCount + 1 : item.toiletCount,
          }
        : item,
    );
  }
  return [
    ...previous,
    {
      catId,
      catName,
      mealCount: isMeal ? 1 : 0,
      toiletCount: isToilet ? 1 : 0,
      medicineCount: 0,
    },
  ];
}

/**
 * 오늘 얼마나 행복했을까? — Realtime cat_logs + cat_care_logs 구독으로 즉시 갱신됩니다.
 */
export function TodaySummaryCards({
  initialSummary,
  homeId,
  initialTodayMedicineCount,
}: TodaySummaryCardsProps) {
  const [summary, setSummary] = useState<CatDailySummaryItem[]>(initialSummary);
  const [todayMedicineCount, setTodayMedicineCount] = useState(initialTodayMedicineCount);

  useEffect(() => {
    setSummary(initialSummary);
  }, [initialSummary]);

  useEffect(() => {
    setTodayMedicineCount(initialTodayMedicineCount);
  }, [initialTodayMedicineCount]);

  const catNameMapRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    initialSummary.forEach((item) => {
      catNameMapRef.current.set(item.catId, item.catName);
    });
  }, [initialSummary]);

  // cat_logs(AI 비전) 실시간 구독
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel("cat_logs_daily_summary")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cat_logs" },
        (payload) => {
          const row = payload.new as {
            cat_id: string;
            status: string | null;
            captured_at: string;
          };
          if (!row.status) return;
          const capturedDate = row.captured_at.slice(0, 10);
          const todayDate = new Date().toISOString().slice(0, 10);
          if (capturedDate !== todayDate) return;
          const catName = catNameMapRef.current.get(row.cat_id) ?? row.cat_id;
          setSummary((prev) => addToSummary(prev, row.cat_id, catName, row.status!));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // cat_care_logs(수동 케어) 실시간 구독 — medicine 카운트 갱신
  useEffect(() => {
    if (!homeId) return;
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`care_logs_medicine_${homeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "cat_care_logs",
          filter: `home_id=eq.${homeId}`,
        },
        (payload) => {
          const row = payload.new as {
            care_kind: string;
            created_at: string;
          };
          if (row.care_kind !== "medicine") return;
          const insertedDate = row.created_at.slice(0, 10);
          const todayDate = new Date().toISOString().slice(0, 10);
          if (insertedDate !== todayDate) return;
          setTodayMedicineCount((prev) => prev + 1);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [homeId]);

  const hasCatActivity = summary.length > 0;
  const hasMedicine = todayMedicineCount > 0;

  if (!hasCatActivity && !hasMedicine) {
    return (
      <section className={styles.summarySection} aria-label="오늘의 활동 요약">
        <h2 className={styles.summarySectionTitle}>오늘 얼마나 행복했을까? ✨</h2>
        <p className={styles.summaryEmpty}>
          🌟 아직 오늘 기록이 없어요.
          <br />
          맘마 먹기·감자 캐기 버튼을 눌러 시작해 보세요!
        </p>
      </section>
    );
  }

  return (
    <section className={styles.summarySection} aria-label="오늘의 활동 요약">
      <h2 className={styles.summarySectionTitle}>오늘 얼마나 행복했을까? ✨</h2>
      <div className={styles.summaryGrid}>
        {summary.map((item) => (
          <SummaryCatCard key={item.catId} item={item} />
        ))}
        <TodayMedicineCard count={todayMedicineCount} />
      </div>
    </section>
  );
}

function SummaryCatCard({ item }: { item: CatDailySummaryItem }) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryCardHeader}>
        <span className={styles.summaryCatPaw} aria-hidden>🐾</span>
        <span className={styles.summaryCatName}>{item.catName}</span>
      </div>
      <div className={styles.summaryStatRow}>
        <span className={styles.summaryStat} data-kind="meal">
          <span className={styles.summaryStatIcon} aria-hidden>🍚</span>
          <span className={styles.summaryStatLabel}>맘마</span>
          <CountDisplay value={item.mealCount} />
        </span>
        <span className={styles.summaryStat} data-kind="toilet">
          <span className={styles.summaryStatIcon} aria-hidden>🥔</span>
          <span className={styles.summaryStatLabel}>감자밭</span>
          <CountDisplay value={item.toiletCount} />
        </span>
      </div>
      <p className={styles.summaryCardComment}>
        {buildSummaryComment(item)}
      </p>
    </div>
  );
}

/**
 * 숫자가 바뀔 때 countBump 애니메이션을 트리거합니다.
 */
function CountDisplay({ value }: { value: number }) {
  const [animKey, setAnimKey] = useState(0);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      setAnimKey((k) => k + 1);
      prevValueRef.current = value;
    }
  }, [value]);

  return (
    <span
      key={animKey}
      className={`${styles.summaryStatCount} ${animKey > 0 ? styles.summaryStatCountBump : ""}`}
    >
      {value}번
    </span>
  );
}

function buildSummaryComment(item: CatDailySummaryItem): string {
  const parts: string[] = [];
  if (item.mealCount > 0) {
    parts.push(`맘마 ${item.mealCount}번 먹었어! 🍚`);
  }
  if (item.toiletCount > 0) {
    parts.push(`감자밭 ${item.toiletCount}번 다녀왔어! 🥔`);
  }
  if (parts.length === 0) {
    return "오늘은 아직 기록이 없어요.";
  }
  return parts.join(" / ");
}

/**
 * 오늘 집 전체 약 먹기 횟수를 보라색 카드로 보여줍니다.
 */
function TodayMedicineCard({ count }: { count: number }) {
  return (
    <div className={styles.summaryCard} style={{ borderColor: "rgba(167,139,250,0.35)" }}>
      <div className={styles.summaryCardHeader}>
        <span className={styles.summaryCatPaw} aria-hidden>💊</span>
        <span className={styles.summaryCatName}>오늘 약 기록</span>
      </div>
      <div className={styles.summaryStatRow}>
        <span className={styles.summaryStat} data-kind="medicine">
          <span className={styles.summaryStatIcon} aria-hidden>💜</span>
          <span className={styles.summaryStatLabel}>약 먹기</span>
          <MedicineCountDisplay value={count} />
        </span>
      </div>
      <p className={styles.summaryCardComment}>
        {count > 0
          ? `오늘 약을 ${count}번 챙겨 먹었어요! 💊`
          : "오늘 약 기록이 없어요."}
      </p>
    </div>
  );
}

function MedicineCountDisplay({ value }: { value: number }) {
  const [animKey, setAnimKey] = useState(0);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      setAnimKey((k) => k + 1);
      prevValueRef.current = value;
    }
  }, [value]);

  return (
    <span
      key={animKey}
      className={`${styles.summaryStatCount} ${animKey > 0 ? styles.summaryStatCountBump : ""}`}
      style={{ color: "#a78bfa" }}
    >
      {value}번
    </span>
  );
}
