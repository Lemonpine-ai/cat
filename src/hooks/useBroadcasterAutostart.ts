"use client";

import { useEffect, useRef } from "react";
import type { BroadcastPhase } from "@/hooks/useBroadcasterSignaling";

/**
 * autostart 훅 — URL 쿼리 `?autostart=1` 이 있으면 카메라 재획득 후 방송 자동 시작.
 * useBroadcasterSignaling 에서 분리 — 파일 400줄 경계 규칙 준수 목적.
 */
interface UseBroadcasterAutostartOptions {
  /** 디바이스 토큰 (null 이면 비활성) */
  deviceToken: string | null;
  /** 현재 방송 phase — idle 일 때만 자동 시작 */
  broadcastPhase: BroadcastPhase;
  /** 로컬 미디어 스트림 ref — 카메라 재획득 후 존재 여부 확인용 */
  localStreamRef: React.RefObject<MediaStream | null>;
  /** 카메라 재획득 콜백 */
  onReacquireCamera?: () => Promise<void>;
  /** 방송 시작 함수 */
  startBroadcast: () => Promise<void>;
}

export function useBroadcasterAutostart({
  deviceToken,
  broadcastPhase,
  localStreamRef,
  onReacquireCamera,
  startBroadcast,
}: UseBroadcasterAutostartOptions) {
  /** autostart 중복 실행 방지 플래그 */
  const autostartRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!deviceToken || broadcastPhase !== "idle") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("autostart") !== "1" || autostartRef.current) return;

    autostartRef.current = true;
    void (async () => {
      try {
        if (onReacquireCamera) await onReacquireCamera();
        if (!localStreamRef.current) {
          autostartRef.current = false;
          return;
        }
        await startBroadcast();
      } catch {
        autostartRef.current = false;
      } finally {
        /* 쿼리 제거 — 새로고침 시 중복 자동 시작 방지 */
        window.history.replaceState({}, "", "/camera/broadcast");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceToken, broadcastPhase]);
}
