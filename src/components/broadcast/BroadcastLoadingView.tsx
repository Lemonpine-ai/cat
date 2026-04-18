"use client";

import styles from "@/app/camera/broadcast/CameraBroadcastClient.module.css";

/**
 * 로딩 스피너 뷰 — credentials / 시그널링 초기화 대기 중 표시.
 */
export function BroadcastLoadingView() {
  return (
    <div className={styles.page}>
      <div className={styles.loadingSpinner} aria-label="로딩 중" />
    </div>
  );
}
