"use client";

import { useCallback, useState } from "react";
import type {
  DiaryCatProfile,
  CatHealthLog,
  CuteCapture,
  DiaryMemo,
  DailyChartPoint,
} from "@/types/diary";
import { CatProfileSelector } from "./CatProfileSelector";
import { CatDiaryStory } from "./CatDiaryStory";
import { HealthTrendChart } from "./HealthTrendChart";
import { CuteActivityCapture } from "./CuteActivityCapture";
import { DiaryMemoInput } from "./DiaryMemoInput";
import { generateCatDiary } from "../lib/generateCatDiary";
import styles from "../styles/Diary.module.css";

/** 오늘 돌봄 이벤트 횟수 */
type CareCount = { meal: number; water: number; litter: number; medicine: number; total: number };

type DiaryPageClientProps = {
  cats: DiaryCatProfile[];
  homeId: string;
  userId: string;
  healthMap: Record<string, CatHealthLog>;
  captures: CuteCapture[];
  memoMap: Record<string, DiaryMemo>;
  /** 고양이별 7일치 차트 데이터 */
  chartMap: Record<string, DailyChartPoint[]>;
  /** 고양이별 오늘 돌봄 횟수 (일기 생성용) */
  todayCareMap: Record<string, CareCount>;
  /** 30일 평균 데이터 */
  monthlyAvg: { meal: number; water: number; poop: number; activity: number };
};

/** 다이어리 페이지 클라이언트 루트 — 고양이 선택 + 데이터 분배 */
export function DiaryPageClient({
  cats,
  homeId,
  userId,
  healthMap,
  captures,
  memoMap: serverMemoMap,
  chartMap,
  todayCareMap,
  monthlyAvg,
}: DiaryPageClientProps) {
  /* 첫 번째 고양이를 기본 선택 */
  const [selectedCatId, setSelectedCatId] = useState(cats[0]?.id ?? "");

  /* 로컬 메모 맵 — 저장 즉시 댓글에 반영하기 위해 서버 데이터를 복사 */
  const [localMemoMap, setLocalMemoMap] = useState<Record<string, DiaryMemo>>(serverMemoMap);

  /* 선택된 고양이 프로필 */
  const selectedCat = cats.find((c) => c.id === selectedCatId) ?? cats[0];

  /* 선택된 고양이의 오늘 돌봄 데이터로 일기 생성 */
  const care = todayCareMap[selectedCatId] ?? { meal: 0, water: 0, litter: 0, medicine: 0, total: 0 };
  const diary = generateCatDiary(
    cats.find((c) => c.id === selectedCatId)?.name ?? "냥이",
    healthMap[selectedCatId] ?? null,
    care,
  );

  /* 선택된 고양이의 최근 포착 이미지 1장 (일기 카드용) */
  const latestCapture = captures.find(
    (c) => c.cat_name === selectedCat?.name && c.storage_path,
  );

  /* 메모 저장 콜백 — 로컬 맵 갱신해서 댓글에 즉시 반영 */
  const handleMemoSaved = useCallback((memo: DiaryMemo) => {
    setLocalMemoMap((prev) => ({ ...prev, [memo.cat_id]: memo }));
  }, []);

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

        {/* ② 고양이 시점 일기 + 신호등 + 포착 사진 + 집사 댓글 */}
        <CatDiaryStory
          catName={selectedCat.name}
          title={diary.title}
          date={diary.date}
          body={diary.body}
          captureUrl={latestCapture?.storage_path ?? null}
          butlerMemo={localMemoMap[selectedCatId]?.content ?? null}
          painLevel={healthMap[selectedCatId]?.pain_level ?? null}
        />

        {/* ③ 건강 트렌드 차트 (7일 꺾은선 + 30일 평균) */}
        <HealthTrendChart data={chartMap[selectedCatId] ?? []} monthlyAvg={monthlyAvg} />

        {/* ④ 귀여운 영상/사진 포착 */}
        <CuteActivityCapture captures={captures} />

        {/* ⑤ 집사 일기장 — key로 고양이 전환 시 리마운트 */}
        <DiaryMemoInput
          key={selectedCatId}
          catId={selectedCatId}
          homeId={homeId}
          userId={userId}
          existingMemo={localMemoMap[selectedCatId] ?? null}
          onSaved={handleMemoSaved}
        />
      </div>
    </div>
  );
}
