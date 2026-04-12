"use client";

import { getFgsMent } from "@/lib/fgs/fgsMentMap";
import { FgsScoreIndicator } from "./FgsScoreIndicator";
import styles from "./Fgs.module.css";

type Props = {
  /** 오늘 평균 FGS 점수 (null이면 오늘 측정 없음) */
  avgScore: number | null;
  /** 오늘 측정 횟수 */
  frameCount: number;
  /** 가장 최근 표정 사진 URL (null이면 사진 없음) */
  latestFrameUrl: string | null;
};

/**
 * FGS 일일 요약 카드 — 오늘 평균 점수 + 최근 표정 사진
 */
export function FgsDailySummaryCard({
  avgScore,
  frameCount,
  latestFrameUrl,
}: Props) {
  /* 오늘 측정 데이터 없으면 안내 메시지 */
  if (avgScore == null || frameCount === 0) {
    return (
      <div className={styles.summaryCard}>
        <div className={styles.summaryTitle}>오늘의 표정 분석 🐱</div>
        <div className={styles.summaryStats}>
          아직 오늘 측정된 데이터가 없어요. 카메라를 연결해주세요.
        </div>
      </div>
    );
  }

  /* 평균 점수 반올림 */
  const roundedScore = Math.round(avgScore);
  const { ment } = getFgsMent(roundedScore);

  return (
    <div className={styles.summaryCard}>
      {/* 헤더: 제목 + 점수 배지 */}
      <div className={styles.summaryHeader}>
        <div className={styles.summaryTitle}>오늘의 표정 분석 🐱</div>
        <FgsScoreIndicator score={roundedScore} />
      </div>

      {/* 본문: 사진 + 멘트 */}
      <div className={styles.summaryBody}>
        {latestFrameUrl ? (
          <img
            src={latestFrameUrl}
            alt="최근 고양이 표정"
            className={styles.summaryPhoto}
          />
        ) : (
          <div className={styles.summaryPhotoEmpty}>😺</div>
        )}
        <div className={styles.summaryInfo}>
          <div className={styles.summaryMent}>{ment}</div>
          <div className={styles.summaryStats}>
            오늘 {frameCount}회 측정 · 평균 {avgScore.toFixed(1)}점
          </div>
        </div>
      </div>
    </div>
  );
}
