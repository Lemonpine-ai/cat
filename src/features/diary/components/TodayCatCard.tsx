"use client";

import type { DiaryCatProfile, CatHealthLog } from "@/types/diary";
import { getCuteMent } from "../lib/cuteMentMap";
import { PAIN_LEVEL_LABEL } from "../lib/cuteMentMap";
import styles from "../styles/Diary.module.css";

/** 통증 5단계 → 신호등 색상 (초록 → 빨강) */
const PAIN_COLORS: Record<number, string> = {
  1: "#22c55e",  /* 정상 — 초록 */
  2: "#84cc16",  /* 약간 불편 — 연두 */
  3: "#eab308",  /* 중간 — 노랑 */
  4: "#f97316",  /* 심함 — 주황 */
  5: "#ef4444",  /* 매우 심함 — 빨강 */
};

type Props = {
  cat: DiaryCatProfile;
  todayHealth: CatHealthLog | null;
  homeId: string;
};

/**
 * 오늘의 냥이 카드
 * - 큰 사진 + 이름 옆 신호등(통증 색상 원) + 귀여운 멘트
 */
export function TodayCatCard({ cat, todayHealth }: Props) {
  const statusMent = cat.status
    ? getCuteMent(cat.status)
    : "오늘도 건강한 하루다옹 🐾";

  /* 통증 지수가 있으면 해당 색상, 없으면 회색 */
  const painLevel = todayHealth?.pain_level ?? null;
  const dotColor = painLevel ? PAIN_COLORS[painLevel] : "#d1d5db";
  const painText = painLevel ? PAIN_LEVEL_LABEL[painLevel] : "미측정";

  return (
    <div className={styles.todayCard}>
      {/* 큰 사진 */}
      {cat.photo_front_url ? (
        <img className={styles.todayCardPhoto} src={cat.photo_front_url} alt={`${cat.name} 사진`} />
      ) : (
        <div className={styles.todayCardPhotoPlaceholder}>🐱</div>
      )}

      {/* 카드 본문 */}
      <div className={styles.todayCardBody}>
        {/* 이름 + 신호등 색상 원 */}
        <div className={styles.todayCardHeader}>
          <h2 className={styles.todayCardName}>{cat.name}의 오늘</h2>
          <span
            className={styles.painDot}
            style={{ background: dotColor }}
            title={`통증: ${painText}`}
          />
          <span className={styles.painDotLabel} style={{ color: dotColor }}>
            {painText}
          </span>
        </div>

        {/* 귀여운 멘트 */}
        <p className={styles.todayCardMent}>{statusMent}</p>
      </div>
    </div>
  );
}
