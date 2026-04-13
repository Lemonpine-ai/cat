import { useCallback, useEffect, useRef, useState } from "react";

/** 화면 딤(어둡게) 복귀까지의 대기 시간 (밀리초) */
const DIM_TIMEOUT_MS = 30_000;

/**
 * 방송 중 화면을 어둡게 만들어 배터리·발열을 줄이는 훅.
 *
 * - `isActive`가 true이면 30초 후 자동으로 화면을 어둡게 전환
 * - `wakeUp()`을 호출하면 즉시 밝아지고, 30초 타이머가 재시작됨
 * - 카메라·WebRTC는 계속 동작 (시각적 오버레이만 제어)
 *
 * @param isActive 방송 중(live/connecting)이면 true
 * @returns isDimmed — 현재 딤 상태, wakeUp — 화면 깨우기 함수
 */
export function useScreenDimmer(isActive: boolean) {
  const [isDimmed, setIsDimmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 타이머 정리 헬퍼 */
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 30초 딤 타이머 시작 */
  const startDimTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => setIsDimmed(true), DIM_TIMEOUT_MS);
  }, [clearTimer]);

  /** 화면 깨우기 — 오버레이 터치 시 호출 */
  const wakeUp = useCallback(() => {
    setIsDimmed(false);
    startDimTimer();
  }, [startDimTimer]);

  /* isActive 변경 시 딤 상태·타이머 제어 */
  useEffect(() => {
    if (isActive) {
      // 방송 시작 → 30초 후 딤 예약
      startDimTimer();
    } else {
      // 방송 종료 → 딤 해제 + 타이머 정리
      clearTimer();
      setIsDimmed(false);
    }
    return clearTimer;
  }, [isActive, startDimTimer, clearTimer]);

  return { isDimmed, wakeUp } as const;
}
