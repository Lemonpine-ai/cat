"use client";

import { useState } from "react";
import type {
  DiaryCatProfile,
  CatHealthLog,
  WeeklyCareStats,
  CuteCapture,
  DiaryMemo,
} from "../types/diary";
import { CatProfileSelector } from "./CatProfileSelector";
import { TodayCatCard } from "./TodayCatCard";
import { WeeklyHighlightCards } from "./WeeklyHighlightCards";
import { CuteActivityCapture } from "./CuteActivityCapture";
import { DiaryMemoInput } from "./DiaryMemoInput";
import styles from "../styles/Diary.module.css";

type DiaryPageClientProps = {
  /** 집에 등록된 고양이 목록 */
  cats: DiaryCatProfile[];
  /** 집 ID */
  homeId: string;
  /** 현재 사용자 ID */
  userId: string;
  /** 고양이별 오늘 건강 기록 맵 (catId → CatHealthLog) */
  healthMap: Record<string, CatHealthLog>;
  /** 이번 주 돌봄 통계 */
  weeklyStats: WeeklyCareStats;
  /** 최근 AI 감지 포착 목록 */
  captures: CuteCapture[];
  /** 고양이별 오늘 메모 맵 (catId → DiaryMemo) */
  memoMap: Record<string, DiaryMemo>;
};

/**
 * 다이어리 페이지 클라이언트 루트 — 고양이 선택 상태를 관리하고
 * 하위 컴포넌트들에 데이터를 분배한다.
 */
export function DiaryPageClient({
  cats,
  homeId,
  userId,
  healthMap,
  weeklyStats,
  captures,
  memoMap,
}: DiaryPageClientProps) {
  /* 첫 번째 고양이를 기본 선택 */
  const [selectedCatId, setSelectedCatId] = useState(cats[0]?.id ?? "");

  /* 선택된 고양이 프로필 */
  const selectedCat = cats.find((c) => c.id === selectedCatId) ?? cats[0];

  /* 고양이가 없으면 빈 화면 */
  if (!selectedCat) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <p style={{ textAlign: "center", color: "var(--color-text-muted)", padding: "3rem 0" }}>
            등록된 고양이가 없어요 🐾<br />
            홈 화면에서 고양이를 먼저 등록해주세요!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {/* ① 상단: 고양이 프로필 선택기 */}
        {cats.length > 1 ? (
          <CatProfileSelector
            cats={cats}
            selectedCatId={selectedCatId}
            onSelect={setSelectedCatId}
          />
        ) : null}

        {/* ② 오늘의 냥이 카드 (통증 슬라이더 + AI 정확도 배지) */}
        <TodayCatCard
          cat={selectedCat}
          todayHealth={healthMap[selectedCatId] ?? null}
          homeId={homeId}
        />

        {/* ③ 이번 주 하이라이트 */}
        <WeeklyHighlightCards stats={weeklyStats} />

        {/* ④ 귀여운 영상/사진 포착 */}
        <CuteActivityCapture captures={captures} />

        {/* ⑤ 집사 일기장 */}
        <DiaryMemoInput
          catId={selectedCatId}
          homeId={homeId}
          userId={userId}
          existingMemo={memoMap[selectedCatId] ?? null}
        />
      </div>
    </div>
  );
}
