"use client";

import { useEffect } from "react";
import type { BroadcastPhase } from "@/hooks/useBroadcasterSignaling";

/**
 * 방송 라이프사이클(가시성 복귀) 훅.
 *
 * 탭 전환·bfcache 복귀 시 PeerConnection 이 이미 죽어있는 경우가 많다.
 * useBroadcasterSignaling 의 disconnected grace → scheduleAutoReconnect 는
 * 이벤트가 발생해야 도는데, bfcache 복귀 시점에는 이미 pc 가 closed/failed 상태라
 * connectionstate 이벤트가 추가로 뜨지 않는다. 이 훅이 수동으로 재시작 트리거.
 *
 * useBroadcasterSignaling.ts 가 400 줄 한도에 걸릴 위험이 있어 분리.
 * (Wake Lock 훅은 signaling 내부에 남아있음 — 그쪽은 broadcastPhase 전용 로직이라 유지.)
 *
 * @param broadcastPhase      현재 방송 페이즈 — live/connecting 이었던 적이 있어야 재시작
 * @param peerConnectionRef   signaling 훅이 노출한 PC ref
 * @param startBroadcast      signaling 훅의 재시작 함수
 */
export function useBroadcasterLifecycle(params: {
  broadcastPhase: BroadcastPhase;
  peerConnectionRef: React.MutableRefObject<RTCPeerConnection | null>;
  startBroadcast: (opts?: { forceRelay?: boolean }) => Promise<void>;
}) {
  const { broadcastPhase, peerConnectionRef, startBroadcast } = params;

  useEffect(() => {
    /** 탭 복귀 시 pc 상태 확인 후 죽어있으면 재시작 */
    function handleVisibility() {
      if (document.visibilityState !== "visible") return;
      const pcState = peerConnectionRef.current?.connectionState;
      /* live 가 아닌 방송(idle/ready) 상태는 스킵 — 일부러 중단한 경우 재시작 방지 */
      if (broadcastPhase !== "live" && broadcastPhase !== "connecting") return;
      /* 정상 연결이면 건드릴 필요 없음 */
      if (pcState && pcState !== "disconnected" && pcState !== "failed" && pcState !== "closed") return;
      console.log(`[broadcaster] visibilitychange 복귀 → pcState=${pcState}, 재시작`);
      void startBroadcast();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [broadcastPhase, peerConnectionRef, startBroadcast]);
}
