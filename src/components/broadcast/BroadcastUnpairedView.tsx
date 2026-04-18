"use client";

import { Camera, Link2 } from "lucide-react";
import styles from "@/app/camera/broadcast/CameraBroadcastClient.module.css";

/**
 * 페어링 안내 카드 — deviceToken이 없을 때 4자리 코드 입력 유도.
 */
export function BroadcastUnpairedView() {
  return (
    <div className={styles.page}>
      <div className={styles.unpairedCard}>
        {/* 페어링 아이콘 */}
        <div className={styles.unpairedIcon} aria-hidden>
          <Link2 size={28} color="#1e8f83" strokeWidth={1.75} />
        </div>
        <h2 className={styles.unpairedTitle}>먼저 페어링이 필요해요</h2>
        <p className={styles.unpairedDesc}>
          대시보드에서 <strong>카메라 추가</strong>를 눌러<br />
          4자리 코드를 받은 뒤 연결해 주세요.
        </p>
        {/* 페어링 페이지 이동 링크 */}
        <a href="/camera/pair" className={styles.btnPairLink}>
          <Camera size={18} strokeWidth={2} aria-hidden />
          4자리 코드 입력하러 가기
        </a>
      </div>
    </div>
  );
}
