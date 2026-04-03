"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./ShellSplashGate.module.css";

const SPLASH_DURATION_MS = 2000;

type ShellSplashGateProps = {
  children: React.ReactNode;
};

/**
 * 셸(헤더·탭)이 있는 화면 최초 진입 시 `public/logo.jpeg` 스플래시를 2초 표시한 뒤
 * 뒤쪽 대시보드·탭 콘텐츠를 그대로 노출합니다.
 */
export function ShellSplashGate({ children }: ShellSplashGateProps) {
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const hasDismissedSplashRef = useRef(false);

  const dismissSplashOverlay = useCallback(() => {
    if (hasDismissedSplashRef.current) {
      return;
    }
    hasDismissedSplashRef.current = true;
    setIsSplashVisible(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dismissSplashOverlay();
      return;
    }

    const fallbackDismissTimeoutId = window.setTimeout(() => {
      dismissSplashOverlay();
    }, SPLASH_DURATION_MS);

    return () => window.clearTimeout(fallbackDismissTimeoutId);
  }, [dismissSplashOverlay]);

  function handleSplashAnimationEnd(event: React.AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    dismissSplashOverlay();
  }

  return (
    <>
      {children}
      {isSplashVisible ? (
        <div
          className={styles.overlay}
          onAnimationEnd={handleSplashAnimationEnd}
          role="presentation"
          aria-hidden
        >
          <div className={styles.logoWrap}>
            <Image
              src="/logo.jpeg"
              alt=""
              fill
              className={styles.logoImage}
              sizes="220px"
              priority
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
