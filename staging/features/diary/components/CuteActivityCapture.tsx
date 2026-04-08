"use client";

import type { CuteCapture } from "../types/diary";
import styles from "../styles/Diary.module.css";

type CuteActivityCaptureProps = {
  /** AI 감지된 최근 활동 목록 */
  captures: CuteCapture[];
};

/**
 * 귀여운 영상/사진 포착 — 가로 스크롤 카드 목록
 * cat_logs에서 가져온 최근 AI 감지 데이터를 표시한다.
 */
export function CuteActivityCapture({ captures }: CuteActivityCaptureProps) {
  return (
    <section className={styles.captureSection}>
      <h2 className={styles.sectionTitle}>📸 귀여운 순간 포착</h2>

      {captures.length === 0 ? (
        /* 포착 없을 때 */
        <div className={styles.captureEmpty}>
          아직 포착된 순간이 없다옹 🐾
        </div>
      ) : (
        /* 가로 스크롤 카드 */
        <div className={styles.captureScroll}>
          {captures.map((cap) => (
            <div key={cap.id} className={styles.captureCard}>
              {/* 썸네일 */}
              {cap.storage_path ? (
                <img
                  className={styles.captureThumb}
                  src={cap.storage_path}
                  alt={`${cap.cat_name} 포착`}
                  loading="lazy"
                />
              ) : (
                <div className={styles.captureThumbPlaceholder}>🐱</div>
              )}
              {/* 정보 */}
              <div className={styles.captureInfo}>
                <div className={styles.captureName}>{cap.cat_name}</div>
                <div className={styles.captureTime}>
                  {formatCaptureTime(cap.captured_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * ISO 타임스탬프 → "오늘 14:30" 또는 "4/7 09:15" 형태로 변환
 */
function formatCaptureTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (isToday) return `오늘 ${time}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}
