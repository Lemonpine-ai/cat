"use client";

import { RotateCcw } from "lucide-react";
import styles from "./PortraitOverlay.module.css";

/**
 * 세로 모드 안내 오버레이.
 *
 * 방송 페이지에서 세로(portrait)로 진입한 경우 화면 전체를 덮어
 * "가로로 돌려주세요" 안내를 표시한다.
 * CSS @media (orientation: portrait) 와 JS matchMedia 이중 보호.
 *
 * @param visible  JS 로 감지한 portrait 여부 (useLandscapeLock 훅에서 전달)
 */
export function PortraitOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className={styles.overlay} role="alert" aria-live="assertive">
      {/* 회전 아이콘 애니메이션 */}
      <div className={styles.iconWrap} aria-hidden>
        <RotateCcw size={48} strokeWidth={1.5} />
      </div>

      <h2 className={styles.title}>가로로 돌려주세요</h2>
      <p className={styles.desc}>
        방송 화면은 가로 모드에서만
        <br />
        사용할 수 있어요.
      </p>
    </div>
  );
}
