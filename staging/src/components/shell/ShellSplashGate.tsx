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
 *
 * `/logo.jpeg` 는 `next/image` 로만 로드 (직접 URL 접근시 auth 307).
 * — public/ 직하 자산은 matcher prefix 그룹(ort-wasm|fonts|models)에 미포함이므로
 *   `<img src="/logo.jpeg">` 같은 직접 참조를 쓰면 비로그인 사용자는 /login 으로 튕깁니다.
 *   정책 상세: `staging/docs/proxy-auth-rules.md` "public/ 직하 자산 정책" 절 참조.
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
