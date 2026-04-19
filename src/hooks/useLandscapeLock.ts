"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Screen Orientation API lock/unlock 은 일부 브라우저에서만 지원 */
type OrientationWithLock = ScreenOrientation & {
  lock?: (type: string) => Promise<void>;
  unlock?: () => void;
};

/** iOS 판별 — iOS Safari 는 video 요소만 fullscreen 지원 */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * 가로모드 강제 고정 훅.
 *
 * 1) requestLandscapeLock() — 사용자 제스처에서 호출.
 *    fullscreen 진입 후 orientation.lock("landscape") 실행.
 *    iOS 는 fullscreen 미지원이므로 스킵.
 * 2) 미지원 브라우저: window.matchMedia 로 portrait 감지 → 안내 오버레이 표시
 * 3) 언마운트 시 exitFullscreen() + orientation.unlock() 으로 원복
 *
 * @param enabled  true 일 때만 잠금 시도 (방송 페이지 진입 시 true)
 * @returns isPortrait — 현재 세로 모드인지 여부 (오버레이 표시 판단용)
 * @returns requestLandscapeLock — 사용자 제스처에서 호출하는 가로모드 잠금 함수
 */
export function useLandscapeLock(enabled: boolean): {
  isPortrait: boolean;
  requestLandscapeLock: () => Promise<void>;
} {
  /* SSR-safe lazy init — 초기값 즉시 계산, effect 내 setState 회피 (React 19 set-state-in-effect 룰). */
  const [isPortrait, setIsPortrait] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(orientation: portrait)").matches
      : false
  );
  /** fullscreen 진입 여부 추적 — cleanup 시 exitFullscreen 호출 판단용 */
  const fullscreenEnteredRef = useRef(false);

  /**
   * 사용자 제스처에서 호출 — fullscreen 진입 후 orientation lock.
   * iOS 는 document.documentElement fullscreen 미지원이므로 fullscreen 스킵.
   */
  const requestLandscapeLock = useCallback(async () => {
    if (!enabled) return;

    try {
      /* iOS 가 아닌 경우에만 fullscreen 진입 (orientation.lock 필수 선행조건) */
      if (!isIOS() && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        fullscreenEnteredRef.current = true;
        console.log("[useLandscapeLock] fullscreen 진입 성공");
      }

      /* fullscreen 진입 후 orientation lock 시도 */
      const orientation = screen?.orientation as OrientationWithLock | undefined;
      if (orientation?.lock) {
        await orientation.lock("landscape");
        console.log("[useLandscapeLock] landscape 잠금 성공");
      }
    } catch (err) {
      /* fullscreen 거부 또는 orientation lock 실패 — fallback(matchMedia)이 처리 */
      console.warn("[useLandscapeLock] landscape 잠금 실패 (fallback 사용):", err);
    }
  }, [enabled]);

  /* ── cleanup: 언마운트 시 fullscreen 해제 + orientation unlock ── */
  useEffect(() => {
    if (!enabled) return;

    return () => {
      /* orientation unlock */
      try {
        (screen?.orientation as OrientationWithLock | undefined)?.unlock?.();
        console.log("[useLandscapeLock] orientation 잠금 해제");
      } catch {
        /* unlock 실패 무시 */
      }
      /* fullscreen 해제 */
      if (fullscreenEnteredRef.current && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {
          /* exitFullscreen 실패 무시 */
        });
        fullscreenEnteredRef.current = false;
        console.log("[useLandscapeLock] fullscreen 해제");
      }
    };
  }, [enabled]);

  /* ── matchMedia fallback — portrait 감지 ── */
  useEffect(() => {
    /* enabled=true 일 때만 리스너 등록. 초기값은 useState lazy init 에서 처리.
     * 한계: enabled false→true→false 전환 시 stale 값 유지되나, 방송 중에만 호출되므로 실사용 문제 없음. */
    if (!enabled) return;
    const mql = window.matchMedia("(orientation: portrait)");
    const handleChange = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [enabled]);

  return { isPortrait, requestLandscapeLock };
}
