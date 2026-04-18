"use client";

import { useMemo } from "react";
import type { RefObject } from "react";
import type { BroadcastPhase } from "@/hooks/useBroadcasterSignaling";

/**
 * BroadcastMainView에 전달할 5개 props 그루핑 객체를 생성하는 훅.
 * CameraBroadcastClient 오케스트레이터 본체가 100줄을 넘지 않도록 분리함.
 * 각 그룹은 useMemo로 참조 안정성을 보장 — 하위 리렌더 방지.
 */
interface Options {
  /* broadcastStatus */
  broadcastPhase: BroadcastPhase;
  peerConnectionState: RTCPeerConnectionState;
  activeSessionId: string | null;
  autoReconnectCount: number;
  errorMessage: string | null;
  cameraError: string | null;
  /* mediaRefs */
  deviceName: string;
  facingMode: "user" | "environment";
  localVideoRef: RefObject<HTMLVideoElement | null>;
  remoteAudioRef: RefObject<HTMLAudioElement | null>;
  /* dim */
  isDimmed: boolean;
  onWakeUp: () => void;
  /* careBar */
  careLogPending: boolean;
  careLogMessage: string | null;
  lastWaterChangeAt: string | null;
  lastLitterCleanAt: string | null;
  isSoundEnabled: boolean;
  onToggleSound: () => void;
  onRecordCare: (careKind: "meal" | "water_change" | "litter_clean" | "medicine") => void;
  /* broadcastActions */
  onAcquireCamera: () => Promise<void>;
  onStartBroadcast: (opts?: { forceRelay?: boolean }) => Promise<void>;
  onStopBroadcast: () => Promise<void>;
  onResetError: () => Promise<void>;
  onSwitchCamera: () => Promise<void>;
}

export function useBroadcastMainViewProps(o: Options) {
  const broadcastStatus = useMemo(
    () => ({
      broadcastPhase: o.broadcastPhase,
      peerConnectionState: o.peerConnectionState,
      activeSessionId: o.activeSessionId,
      autoReconnectCount: o.autoReconnectCount,
      errorMessage: o.errorMessage,
      cameraError: o.cameraError,
    }),
    [o.broadcastPhase, o.peerConnectionState, o.activeSessionId, o.autoReconnectCount, o.errorMessage, o.cameraError],
  );

  const mediaRefs = useMemo(
    () => ({
      deviceName: o.deviceName,
      facingMode: o.facingMode,
      localVideoRef: o.localVideoRef,
      remoteAudioRef: o.remoteAudioRef,
    }),
    [o.deviceName, o.facingMode, o.localVideoRef, o.remoteAudioRef],
  );

  const dim = useMemo(() => ({ isDimmed: o.isDimmed, onWakeUp: o.onWakeUp }), [o.isDimmed, o.onWakeUp]);

  const careBar = useMemo(
    () => ({
      careLogPending: o.careLogPending,
      careLogMessage: o.careLogMessage,
      lastWaterChangeAt: o.lastWaterChangeAt,
      lastLitterCleanAt: o.lastLitterCleanAt,
      isSoundEnabled: o.isSoundEnabled,
      onToggleSound: o.onToggleSound,
      onRecordCare: o.onRecordCare,
    }),
    [o.careLogPending, o.careLogMessage, o.lastWaterChangeAt, o.lastLitterCleanAt, o.isSoundEnabled, o.onToggleSound, o.onRecordCare],
  );

  const broadcastActions = useMemo(
    () => ({
      onAcquireCamera: o.onAcquireCamera,
      onStartBroadcast: o.onStartBroadcast,
      onStopBroadcast: o.onStopBroadcast,
      onResetError: o.onResetError,
      onSwitchCamera: o.onSwitchCamera,
    }),
    [o.onAcquireCamera, o.onStartBroadcast, o.onStopBroadcast, o.onResetError, o.onSwitchCamera],
  );

  return { broadcastStatus, mediaRefs, dim, careBar, broadcastActions };
}
