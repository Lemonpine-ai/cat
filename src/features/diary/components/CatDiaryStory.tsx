"use client";

import styles from "../styles/Diary.module.css";

/** 통증 5단계 → 신호등 색상 (초록 → 빨강) */
const PAIN_COLORS: Record<number, string> = {
  1: "#22c55e",  /* 정상 — 초록 */
  2: "#84cc16",  /* 약간 불편 — 연두 */
  3: "#eab308",  /* 중간 — 노랑 */
  4: "#f97316",  /* 심함 — 주황 */
  5: "#ef4444",  /* 매우 심함 — 빨강 */
};

/** 통증 단계 라벨 */
const PAIN_LABEL: Record<number, string> = {
  1: "좋음", 2: "약간 불편", 3: "보통", 4: "주의", 5: "위험",
};

type Props = {
  catName: string;
  /** 일기 제목 (예: "밥은 정의고, 간식은 사랑이다!") */
  title: string;
  /** 날짜 (예: "2026년 4월 8일") */
  date: string;
  /** 일기 본문 */
  body: string;
  /** 최근 AI 포착 이미지 URL (없으면 표시 안 함) */
  captureUrl?: string | null;
  /** 집사가 저장한 메모 (댓글로 표시) */
  butlerMemo?: string | null;
  /** 통증 지수 (1~5, 없으면 null) — 헤더 옆 신호등 표시용 */
  painLevel?: number | null;
};

/**
 * 고양이 시점 일기 카드
 * - 헤더에 통증 신호등 (색상 원 + 라벨) 표시
 * - 귀여운 말투로 오늘 하루를 기록한 일기 형식
 * - 건강 데이터 기반으로 자동 생성된 내용을 표시
 * - 최근 포착 이미지가 있으면 일기 안에 귀엽게 표시
 * - 집사 메모가 있으면 일기 아래에 댓글(말풍선) 형태로 표시
 */
export function CatDiaryStory({
  catName,
  title,
  date,
  body,
  captureUrl,
  butlerMemo,
  painLevel,
}: Props) {
  /* 통증 신호등 색상 & 라벨 */
  const dotColor = painLevel ? PAIN_COLORS[painLevel] : "#d1d5db";
  const painText = painLevel ? PAIN_LABEL[painLevel] : "미측정";

  return (
    <div className={styles.diaryStoryCard}>
      {/* 일기장 헤더 + 신호등 */}
      <div className={styles.diaryStoryHeader}>
        <span className={styles.diaryStoryIcon}>📖</span>
        <span className={styles.diaryStoryLabel}>{catName}의 일기</span>
        {/* 통증 신호등 — 헤더 오른쪽에 표시 */}
        <span className={styles.diaryPainDotWrap}>
          <span
            className={styles.painDot}
            style={{ background: dotColor }}
          />
          <span className={styles.painDotLabel} style={{ color: dotColor }}>
            {painText}
          </span>
        </span>
      </div>

      {/* 제목 */}
      <h3 className={styles.diaryStoryTitle}>{title}</h3>

      {/* 날짜 */}
      <div className={styles.diaryStoryDate}>{date}</div>

      {/* 포착 이미지 — 있을 때만 표시 */}
      {captureUrl && (
        <div className={styles.diaryStoryCapture}>
          <img
            className={styles.diaryCaptureImg}
            src={captureUrl}
            alt={`${catName} 오늘의 포착`}
            loading="lazy"
          />
          <span className={styles.diaryCaptureLabel}>오늘의 {catName} 📷</span>
        </div>
      )}

      {/* 본문 */}
      <div className={styles.diaryStoryBody}>{body}</div>

      {/* 집사 댓글 — 말풍선 스타일로 일기 아래에 표시 */}
      {butlerMemo && (
        <div className={styles.butlerComment}>
          <div className={styles.butlerCommentBubble}>
            <span className={styles.butlerCommentIcon}>🐾</span>
            <span className={styles.butlerCommentLabel}>집사의 한마디</span>
          </div>
          <div className={styles.butlerCommentText}>{butlerMemo}</div>
        </div>
      )}
    </div>
  );
}
