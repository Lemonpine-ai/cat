"use client";

import type { CuteCapture } from "@/types/diary";
import styles from "./Diary.module.css";

type Props = {
  captures: CuteCapture[];
};

/** 시각을 "오후 3:24" 같은 한국어 형식으로 변환 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * 귀여운 영상 포착 카드
 * - cat_logs에서 가져온 최근 AI 감지 영상/사진을 카드형 리스트로 표시
 * - 없으면 빈 상태 메시지 표시
 */
export function CuteActivityCapture({ captures }: Props) {
  return (
    <div className={styles.captureSection}>
      <div className={styles.captureTitle}>귀여운 순간 포착 📸</div>

      {captures.length === 0 ? (
        <div className={styles.captureEmpty}>
          아직 포착된 순간이 없어요 🐾
        </div>
      ) : (
        <div className={styles.captureList}>
          {captures.map((item) => (
            <div key={item.id} className={styles.captureCard}>
              {/* storage_path를 이미지 src로 사용 */}
              <img
                src={item.storage_path ?? undefined}
                alt="AI 감지 포착"
                className={styles.captureImage}
              />
              <div className={styles.captureTime}>
                {formatTime(item.captured_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
