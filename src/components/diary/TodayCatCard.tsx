"use client";

import type { DiaryCatProfile } from "@/types/diary";
import styles from "./Diary.module.css";

type Props = {
  cat: DiaryCatProfile;
  /** 오늘 활동 기반으로 자동 생성된 멘트 목록 */
  todayMents: string[];
  status: string | null;
};

/**
 * 오늘의 냥이 카드
 * - 큰 프로필 사진 + 현재 상태 + 귀여운 말풍선 멘트
 */
export function TodayCatCard({ cat, todayMents, status }: Props) {
  // 멘트가 없으면 기본 멘트 표시
  const displayMent =
    todayMents.length > 0
      ? todayMents[0]
      : "오늘도 건강하다옹 😺";

  return (
    <div className={styles.todayCard}>
      {/* 큰 프로필 사진 */}
      {cat.photo_front_url ? (
        <img
          src={cat.photo_front_url}
          alt={`${cat.name} 사진`}
          className={styles.todayPhoto}
        />
      ) : (
        <div className={styles.todayPlaceholder}>🐱</div>
      )}

      {/* 고양이 이름 */}
      <div className={styles.todayName}>{cat.name}</div>

      {/* 현재 상태 */}
      {status && (
        <div className={styles.todayStatus}>{status}</div>
      )}

      {/* 말풍선 멘트 */}
      <div className={styles.speechBubble}>{displayMent}</div>
    </div>
  );
}
