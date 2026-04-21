"use client";

/**
 * useWebRtcSlotConnectionMulti — Multi-Viewer(R3) CameraSlot 어댑터.
 *
 * 기존 useWebRtcSlotConnection 과 반환 시그니처 유사
 * ({videoRef, phase, pcRef, reconnect}).
 *
 * 변경점:
 *   - offerSdp prop 제거 — Multi 모드에서는 뷰어가 직접 offer 를 만든다.
 *   - phase 는 내부 Multi phase 중 대표 4단계로 축약해 기존 UI 와 호환.
 *     (too_many_viewers 는 별도로 노출해 오버레이에서 안내 가능)
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useViewerPeerConnectionMulti,
  type ViewerConnectionPhase,
} from "@/../staging/hooks/useViewerPeerConnectionMulti";

/* 기존 SlotPhase 와 호환 + too_many_viewers 확장 */
export type MultiSlotPhase = "connecting" | "connected" | "error" | "too_many_viewers";

type UseWebRtcSlotConnectionMultiOptions = {
  sessionId: string;
  rtcConfiguration?: RTCConfiguration | null;
  turnRelayConfigured?: boolean;
  delayMs?: number;
  homeId?: string | null;
  onPhaseChange?: (phase: MultiSlotPhase) => void;
};

/** 내부 phase → slot 용 4단계 축약 */
function toSlotPhase(internal: ViewerConnectionPhase): MultiSlotPhase {
  if (internal === "connected") return "connected";
  if (internal === "error") return "error";
  if (internal === "too_many_viewers") return "too_many_viewers";
  /* idle / creating / awaiting_answer / connecting → 기본 connecting */
  return "connecting";
}

export function useWebRtcSlotConnectionMulti(options: UseWebRtcSlotConnectionMultiOptions) {
  const {
    sessionId,
    rtcConfiguration = null,
    turnRelayConfigured,
    delayMs = 0,
    homeId = null,
    onPhaseChange,
  } = options;

  /* 최신 onPhaseChange 참조 — effect 로 동기화 (render 중 ref 쓰기 금지) */
  const onPhaseChangeRef = useRef(onPhaseChange);
  useEffect(() => {
    onPhaseChangeRef.current = onPhaseChange;
  }, [onPhaseChange]);

  /* 내부 phase → 외부 phase 매핑 콜백 */
  const handleInternalPhaseChange = useCallback((internal: ViewerConnectionPhase) => {
    onPhaseChangeRef.current?.(toSlotPhase(internal));
  }, []);

  const {
    videoRef,
    phase: internalPhase,
    errorMessage,
    reconnect,
    pcRef,
    viewerConnectionId,
  } = useViewerPeerConnectionMulti({
    sessionId,
    rtcConfiguration,
    turnRelayConfigured,
    homeId,
    delayMs,
    role: "viewer_slot",
    onPhaseChange: handleInternalPhaseChange,
  });

  /* 외부용 slot phase — useMemo 로 매 렌더 동일성 보장 */
  const phase = useMemo(() => toSlotPhase(internalPhase), [internalPhase]);

  return {
    videoRef,
    phase,
    pcRef,
    reconnect,
    errorMessage,
    viewerConnectionId,
  };
}
