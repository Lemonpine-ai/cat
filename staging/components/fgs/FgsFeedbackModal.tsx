"use client";

import { useState } from "react";
import { getFgsMent } from "@/lib/fgs/fgsMentMap";
import styles from "./Fgs.module.css";

type Props = {
  /** fgs_frames.id */
  frameId: string;
  /** AI가 매긴 점수 */
  aiScore: number;
  /** 표정 사진 URL */
  frameUrl: string | null;
  /** 모달 닫기 */
  onClose: () => void;
  /** 피드백 완료 후 콜백 */
  onSubmit?: () => void;
};

/** 유저가 선택할 수 있는 FGS 점수 옵션 (0~4) */
const OPTS = ["괜찮아 보여요","살짝 피곤해 보여요","좀 불편해 보여요","아파 보여요","많이 아파 보여요"];

/**
 * FGS 피드백 모달 — "이 표정이 불편해 보이나요?"
 * AI 점수와 유저 판단을 비교하여 학습 데이터로 활용
 */
export function FgsFeedbackModal({
  frameId, aiScore, frameUrl, onClose, onSubmit,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { ment } = getFgsMent(aiScore);

  async function handleSubmit() {
    if (selected == null) return;
    setSubmitting(true);

    try {
      await fetch("/api/fgs/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frame_id: frameId,
          user_feedback: selected,
        }),
      });
      onSubmit?.();
      onClose();
    } catch (error) {
      console.error("[Feedback] 전송 실패:", error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.feedbackOverlay} onClick={onClose}>
      <div
        className={styles.feedbackModal}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.feedbackTitle}>표정 확인 🐱</div>
        {frameUrl && (
          <img
            src={frameUrl}
            alt="고양이 표정"
            className={styles.feedbackPhoto}
          />
        )}
        <div className={styles.feedbackQuestion}>
          AI 분석: &quot;{ment}&quot;
          <br />
          집사님이 보기에 어떤가요?
        </div>
        <div className={styles.feedbackButtons}>
          {OPTS.map((label, i) => (
            <button
              key={i}
              className={`${styles.feedbackBtn} ${selected === i ? styles.selected : ""}`}
              onClick={() => setSelected(i)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className={styles.feedbackSubmit}
          onClick={handleSubmit}
          disabled={selected == null || submitting}
        >
          {submitting ? "저장 중..." : "확인"}
        </button>
      </div>
    </div>
  );
}
