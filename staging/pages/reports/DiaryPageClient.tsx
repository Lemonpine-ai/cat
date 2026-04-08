"use client";

import { useState } from "react";
import { CatProfileSelector } from "@/components/diary/CatProfileSelector";
import { TodayCatCard } from "@/components/diary/TodayCatCard";
import { HealthTrendChart } from "@/components/diary/HealthTrendChart";
import { WeeklyHighlightCards } from "@/components/diary/WeeklyHighlightCards";
import { CuteActivityCapture } from "@/components/diary/CuteActivityCapture";
import { DiaryMemoInput } from "@/components/diary/DiaryMemoInput";
import type {
  DiaryCatProfile,
  CatHealthLog,
  WeeklyCareStats,
  CuteCapture,
  DiaryMemo,
  DailyChartPoint,
} from "@/types/diary";
import { cuteMentMap } from "@/components/diary/cuteMentMap";
import styles from "@/components/diary/Diary.module.css";

type Props = {
  cats: DiaryCatProfile[];
  homeId: string;
  /** 고양이 id → 오늘 건강 기록 맵 */
  healthMap: Record<string, CatHealthLog>;
  weeklyStats: WeeklyCareStats;
  captures: CuteCapture[];
  /** 고양이 id → 오늘 메모 맵 */
  memoMap: Record<string, DiaryMemo>;
  /** 고양이 id → 7일치 차트 데이터 */
  chartMap: Record<string, DailyChartPoint[]>;
};

/**
 * 다이어리 페이지 클라이언트 래퍼
 * - 고양이 선택 상태를 관리하고 각 섹션 컴포넌트에 데이터 전달
 * - 고양이를 전환하면 해당 고양이의 차트/메모를 표시
 */
export function DiaryPageClient({
  cats,
  homeId,
  healthMap,
  weeklyStats,
  captures,
  memoMap,
  chartMap,
}: Props) {
  const [selectedCatId, setSelectedCatId] = useState(cats[0]?.id ?? "");
  const selectedCat = cats.find((c) => c.id === selectedCatId) ?? cats[0];

  /* 선택된 고양이의 오늘 건강 기록에서 멘트 생성 */
  const health = selectedCatId ? healthMap[selectedCatId] : undefined;
  const todayMents: string[] = [];
  if (health) {
    if (health.meal_count > 0) todayMents.push(cuteMentMap.meal ?? "식사했다옹 🍚");
    if (health.poop_count > 0) todayMents.push(cuteMentMap.배변 ?? "화장실 다녀왔다옹 🚽");
  }

  /* 선택된 고양이의 차트 데이터 */
  const chartData = selectedCatId ? (chartMap[selectedCatId] ?? []) : [];

  /* 선택된 고양이의 오늘 메모 */
  const memo = selectedCatId ? memoMap[selectedCatId] : undefined;

  return (
    <div className={styles.diaryPage}>
      {/* 1. 고양이 프로필 셀렉터 */}
      <CatProfileSelector
        cats={cats}
        selectedCatId={selectedCatId}
        onSelect={setSelectedCatId}
      />

      {/* 2. 오늘의 냥이 카드 */}
      {selectedCat && (
        <TodayCatCard
          cat={selectedCat}
          todayMents={todayMents}
          status={selectedCat.status}
        />
      )}

      {/* 3. 건강 트렌드 차트 (7일 꺾은선) */}
      <HealthTrendChart data={chartData} />

      {/* 4. 이번 주 하이라이트 */}
      <WeeklyHighlightCards summary={weeklyStats} />

      {/* 5. 귀여운 영상 포착 */}
      <CuteActivityCapture captures={captures} />

      {/* 6. 집사 일기장 */}
      {selectedCat && (
        <DiaryMemoInput
          catId={selectedCat.id}
          homeId={homeId}
          existingMemo={memo?.content ?? null}
        />
      )}
    </div>
  );
}
