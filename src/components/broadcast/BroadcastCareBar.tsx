"use client";

import {
  Baby,
  Droplets,
  Pill,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import styles from "@/app/camera/broadcast/CameraBroadcastClient.module.css";

/**
 * 마지막 관리 타임스탬프 → '0분 전' / 'n분 전' / 'n시간 전' / 'n일 전' 변환.
 * CameraLiveViewer / CatvisorHomeDashboard 와 동일한 규칙.
 */
export function formatEnvElapsed(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "기록 없음";
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  if (diffMs < 0) return "0분 전";
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "0분 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${Math.floor(diffHours / 24)}일 전`;
}

/* ── Props ── */

interface BroadcastCareBarProps {
  /** 케어로그 요청 진행 중 여부 (버튼 비활성화) */
  careLogPending: boolean;
  /** 피드백 메시지 (기록 성공/실패) */
  careLogMessage: string | null;
  /** 마지막 식수 교체 ISO 타임스탬프 */
  lastWaterChangeAt: string | null;
  /** 마지막 화장실 청소 ISO 타임스탬프 */
  lastLitterCleanAt: string | null;
  /** 효과음 활성화 여부 */
  isSoundEnabled: boolean;
  /** 효과음 토글 콜백 */
  onToggleSound: () => void;
  /** 케어 종류별 기록 콜백 */
  onRecordCare: (careKind: "meal" | "water_change" | "litter_clean" | "medicine") => void;
}

/**
 * 순수 프레젠테이션 컴포넌트 — 케어 버튼 4개 + 효과음 토글 + 피드백.
 */
export function BroadcastCareBar({
  careLogPending,
  careLogMessage,
  lastWaterChangeAt,
  lastLitterCleanAt,
  isSoundEnabled,
  onToggleSound,
  onRecordCare,
}: BroadcastCareBarProps) {
  return (
    <div className={styles.broadcastCareBar}>
      {/* 헤더: 제목 + 효과음 토글 */}
      <div className={styles.broadcastCareHeader}>
        <span className={styles.broadcastCareTitle}>🐾 빠른 케어 기록</span>
        <button
          type="button"
          onClick={onToggleSound}
          className={styles.broadcastSoundBtn}
          aria-pressed={isSoundEnabled}
          aria-label={isSoundEnabled ? "효과음 끄기" : "효과음 켜기"}
        >
          {isSoundEnabled ? (
            <Volume2 size={16} strokeWidth={2} aria-hidden />
          ) : (
            <VolumeX size={16} strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>

      {/* 케어 버튼 4개 */}
      <div className={styles.broadcastCareRow}>
        {/* 맘마 */}
        <button
          type="button"
          disabled={careLogPending}
          className={`${styles.broadcastCareBtn} ${styles.broadcastCareBtnMint}`}
          onClick={() => onRecordCare("meal")}
        >
          <Baby size={14} strokeWidth={2} aria-hidden />
          맘마 🍼
        </button>

        {/* 식수 교체 */}
        <button
          type="button"
          disabled={careLogPending}
          className={`${styles.broadcastCareBtn} ${styles.broadcastCareBtnSky} ${styles.broadcastCareBtnEnv}`}
          onClick={() => onRecordCare("water_change")}
        >
          <Droplets size={14} strokeWidth={2} aria-hidden />
          <span className={styles.broadcastCareBtnLabel}>식수 교체 💧</span>
          <span className={styles.broadcastCareBtnEta}>
            {formatEnvElapsed(lastWaterChangeAt)}
          </span>
        </button>

        {/* 화장실 청소 */}
        <button
          type="button"
          disabled={careLogPending}
          className={`${styles.broadcastCareBtn} ${styles.broadcastCareBtnPeach} ${styles.broadcastCareBtnEnv}`}
          onClick={() => onRecordCare("litter_clean")}
        >
          <Trash2 size={14} strokeWidth={2} aria-hidden />
          <span className={styles.broadcastCareBtnLabel}>화장실 청소 🚽</span>
          <span className={styles.broadcastCareBtnEta}>
            {formatEnvElapsed(lastLitterCleanAt)}
          </span>
        </button>

        {/* 약 */}
        <button
          type="button"
          disabled={careLogPending}
          className={`${styles.broadcastCareBtn} ${styles.broadcastCareBtnPurple}`}
          onClick={() => onRecordCare("medicine")}
        >
          <Pill size={14} strokeWidth={2} aria-hidden />
          약 💊
        </button>
      </div>

      {/* 피드백 메시지 */}
      {careLogMessage ? (
        <p
          className={styles.broadcastCareFeedback}
          role="status"
          aria-live="polite"
        >
          {careLogMessage}
        </p>
      ) : null}
    </div>
  );
}
