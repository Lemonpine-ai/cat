"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CatDailySummaryItem } from "@/types/catDailySummary";
import styles from "./CatvisorHomeDashboard.module.css";

type TodaySummaryCardsProps = {
  initialSummary: CatDailySummaryItem[];
  homeId: string;
  initialTodayMedicineCount: number;
  initialTodayMealCount: number;
};

function addAiVisionLogToSummary(
  previous: CatDailySummaryItem[],
  catId: string,
  catName: string,
  status: string,
): CatDailySummaryItem[] {
  const isMeal = status === "식사";
  const isToilet = status === "배변";
  if (!isMeal && !isToilet) return previous;

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
 * 오늘 얼마나 행복했을까?
 * - 상단 고정 2카드: 맘마(cat_care_logs.meal) + 약(cat_care_logs.medicine)
 * - 하단 AI 비전 per-cat 카드 (cat_logs 기반)
 * 모두 Supabase Realtime 구독으로 즉시 갱신됩니다.
 */
export function TodaySummaryCards({
  initialSummary,
  homeId: homeIdProp,
  initialTodayMedicineCount,
  initialTodayMealCount,
}: TodaySummaryCardsProps) {
  const [aiVisionSummary, setAiVisionSummary] =
    useState<CatDailySummaryItem[]>(initialSummary);
  const [todayMealCount, setTodayMealCount] = useState(initialTodayMealCount);
  const [todayMedicineCount, setTodayMedicineCount] = useState(
    initialTodayMedicineCount,
  );
  // SSR homeId 가 빈 문자열인 경우(세션 만료 등) 클라이언트에서 직접 조회해 Realtime 구독에 사용
  const [homeId, setHomeId] = useState(homeIdProp);

  useEffect(() => {
    setAiVisionSummary(initialSummary);
  }, [initialSummary]);

  useEffect(() => {
    setTodayMealCount(initialTodayMealCount);
  }, [initialTodayMealCount]);

  useEffect(() => {
    setTodayMedicineCount(initialTodayMedicineCount);
  }, [initialTodayMedicineCount]);

  // homeId 가 비어 있으면 클라이언트 auth 로 직접 조회 (middleware 없는 환경 fallback)
  useEffect(() => {
    if (homeIdProp) {
      setHomeId(homeIdProp);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    async function fetchFallbackHomeId() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("home_id")
        .eq("id", user.id)
        .single();
      if (profile?.home_id) {
        setHomeId(profile.home_id);
      }
    }
    void fetchFallbackHomeId();
  }, [homeIdProp]);

  // cat_name 캐시 (AI 비전 카드 실시간 업데이트용)
  const catNameMapRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    initialSummary.forEach((item) => {
      catNameMapRef.current.set(item.catId, item.catName);
    });
  }, [initialSummary]);

  // cat_logs(AI 비전) 실시간 구독 — per-cat 카드 갱신
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("cat_logs_ai_vision_summary")
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
          const catName =
            catNameMapRef.current.get(row.cat_id) ?? row.cat_id;
          setAiVisionSummary((prev) =>
            addAiVisionLogToSummary(prev, row.cat_id, catName, row.status!),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // cat_care_logs(수동 버튼 클릭) 실시간 구독 — meal + medicine 상단 카드 즉시 +1
  useEffect(() => {
    if (!homeId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`care_logs_summary_${homeId}`)
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
          const insertedDate = row.created_at.slice(0, 10);
          const todayDate = new Date().toISOString().slice(0, 10);
          if (insertedDate !== todayDate) return;

          if (row.care_kind === "meal") {
            setTodayMealCount((prev) => prev + 1);
          } else if (row.care_kind === "medicine") {
            setTodayMedicineCount((prev) => prev + 1);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [homeId]);

  return (
    <section
      className={styles.summarySection}
      aria-label="오늘의 활동 요약"
    >
      <h2 className={styles.summarySectionTitle}>오늘 얼마나 행복했을까? ✨</h2>

      {/* ── 상단 고정 2카드: 맘마 + 약 ── */}
      <div className={styles.todayCareCardRow}>
        <TodayCareCountCard
          emoji="🍼"
          label="맘마 먹기"
          count={todayMealCount}
          accentColor="#4FD1C5"
          borderColor="rgba(79,209,197,0.35)"
          gradientFrom="#d6f5f1"
          gradientTo="#f1fbf9"
          countColor="#1e8f83"
          ariaLabel="오늘 맘마 먹기 횟수"
        />
        <TodayCareCountCard
          emoji="💊"
          label="약 먹기"
          count={todayMedicineCount}
          accentColor="#a78bfa"
          borderColor="rgba(167,139,250,0.35)"
          gradientFrom="#ede9fe"
          gradientTo="#f5f3ff"
          countColor="#7c3aed"
          ariaLabel="오늘 약 먹기 횟수"
        />
      </div>

      {/* ── AI 비전 per-cat 카드 (데이터 있을 때만) ── */}
      {aiVisionSummary.length > 0 ? (
        <div className={styles.summaryGrid}>
          {aiVisionSummary.map((item) => (
            <AiVisionCatCard key={item.catId} item={item} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* ── 오늘 케어 카운트 카드 (맘마/약 공용) ── */
type TodayCareCountCardProps = {
  emoji: string;
  label: string;
  count: number;
  accentColor: string;
  borderColor: string;
  gradientFrom: string;
  gradientTo: string;
  countColor: string;
  ariaLabel: string;
};

function TodayCareCountCard({
  emoji,
  label,
  count,
  accentColor,
  borderColor,
  gradientFrom,
  gradientTo,
  countColor,
  ariaLabel,
}: TodayCareCountCardProps) {
  return (
    <div
      className={styles.todayCareCard}
      style={{
        borderColor,
        background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
      }}
      aria-label={ariaLabel}
    >
      <span className={styles.todayCareEmoji} aria-hidden>
        {emoji}
      </span>
      <span className={styles.todayCareLabel}>{label}</span>
      <AnimatedCount
        value={count}
        countColor={countColor}
        accentColor={accentColor}
      />
      <span className={styles.todayCareUnit} style={{ color: accentColor }}>
        {count > 0 ? "오늘도 잘했어요! 🐾" : "아직 기록 없음"}
      </span>
    </div>
  );
}

function AnimatedCount({
  value,
  countColor,
  accentColor,
}: {
  value: number;
  countColor: string;
  accentColor: string;
}) {
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
      className={`${styles.todayCareCount} ${animKey > 0 ? styles.summaryStatCountBump : ""}`}
      style={{ color: countColor, textShadow: `0 0 16px ${accentColor}55` }}
    >
      {value}
      <span className={styles.todayCareCountUnit}>번</span>
    </span>
  );
}

/* ── AI 비전 per-cat 요약 카드 ── */
function AiVisionCatCard({ item }: { item: CatDailySummaryItem }) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryCardHeader}>
        <span className={styles.summaryCatPaw} aria-hidden>
          🐾
        </span>
        <span className={styles.summaryCatName}>{item.catName}</span>
      </div>
      <div className={styles.summaryStatRow}>
        <span className={styles.summaryStat} data-kind="meal">
          <span className={styles.summaryStatIcon} aria-hidden>
            🍚
          </span>
          <span className={styles.summaryStatLabel}>맘마</span>
          <LegacyCountDisplay value={item.mealCount} />
        </span>
        <span className={styles.summaryStat} data-kind="toilet">
          <span className={styles.summaryStatIcon} aria-hidden>
            🥔
          </span>
          <span className={styles.summaryStatLabel}>감자밭</span>
          <LegacyCountDisplay value={item.toiletCount} />
        </span>
      </div>
      <p className={styles.summaryCardComment}>
        {buildAiVisionComment(item)}
      </p>
    </div>
  );
}

function LegacyCountDisplay({ value }: { value: number }) {
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

function buildAiVisionComment(item: CatDailySummaryItem): string {
  const parts: string[] = [];
  if (item.mealCount > 0) parts.push(`맘마 ${item.mealCount}번 🍚`);
  if (item.toiletCount > 0) parts.push(`감자밭 ${item.toiletCount}번 🥔`);
  return parts.length > 0 ? parts.join(" / ") : "오늘은 아직 기록이 없어요.";
}
