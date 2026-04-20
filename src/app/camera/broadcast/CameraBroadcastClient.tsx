"use client";

import { useCallback, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useScreenDimmer } from "@/hooks/useScreenDimmer";
import { useCameraStream } from "@/hooks/useCameraStream";
import { useBroadcastCareLog } from "@/hooks/useBroadcastCareLog";
import { useBroadcasterSignaling } from "@/hooks/useBroadcasterSignaling";
import { useBroadcasterAutostart } from "@/hooks/useBroadcasterAutostart";
import { useBroadcasterLifecycle } from "@/hooks/useBroadcasterLifecycle";
import { useDeviceCredentials } from "@/hooks/useDeviceCredentials";
import { useSoundPreference } from "@/hooks/useSoundPreference";
import { useBroadcastMainViewProps } from "@/hooks/useBroadcastMainViewProps";
import { useLandscapeLock } from "@/hooks/useLandscapeLock";
import { BroadcastLoadingView } from "@/components/broadcast/BroadcastLoadingView";
import { BroadcastUnpairedView } from "@/components/broadcast/BroadcastUnpairedView";
import { BroadcastMainView } from "@/components/broadcast/BroadcastMainView";
import { DebugLogOverlay } from "@/components/broadcast/DebugLogOverlay";

/**
 * 남는 폰에서 실행하는 WebRTC 방송 클라이언트 (오케스트레이션 메인).
 * 7개 훅을 조합하고 phase에 따라 Loading/Unpaired/Main 뷰를 분기 렌더.
 */
export function CameraBroadcastClient() {
  // 공용 supabase 클라이언트 — 훅별 중복 생성 방지로 realtime 소켓 1개만 유지
  const supabaseClient = useMemo(() => createSupabaseBrowserClient(), []);

  const { deviceIdentity, credentialsLoaded } = useDeviceCredentials();
  const { isSoundEnabled, toggleSoundEnabled } = useSoundPreference();
  // 시그널링 훅이 세션 생성 시 건네주는 id — 케어로그 훅에 전달
  const [sessionIdForCareLog, setSessionIdForCareLog] = useState<string | null>(null);

  const { localStreamRef, facingMode, isAcquiring, cameraError, acquireCamera, switchCamera, localVideoRef } = useCameraStream();

  /* 가로모드 잠금 — 카메라 켜기(사용자 제스처) 직전에 requestLandscapeLock 을 래핑 호출 */
  const { isPortrait, requestLandscapeLock } = useLandscapeLock(true);
  const handleAcquireCameraWithLandscape = useCallback(async () => {
    await requestLandscapeLock();
    await acquireCamera();
  }, [requestLandscapeLock, acquireCamera]);

  const care = useBroadcastCareLog({
    deviceToken: deviceIdentity?.deviceToken ?? null,
    activeSessionId: sessionIdForCareLog,
    isSoundEnabled,
    supabaseClient,
  });

  /** 세션 생성 콜백 — sessionId + RPC 응답 home_id를 케어로그 훅에 전달 (유실 방지) */
  const handleSessionCreated = useCallback(
    (sessionId: string, homeId: string | null) => {
      setSessionIdForCareLog(sessionId);
      if (homeId) care.setExternalHomeId(homeId);
    },
    [care],
  );

  const signaling = useBroadcasterSignaling({
    deviceToken: deviceIdentity?.deviceToken ?? null,
    deviceName: deviceIdentity?.deviceName ?? null,
    localStreamRef,
    broadcastHomeId: care.broadcastHomeId,
    isAcquiring,
    cameraError,
    onSessionCreated: handleSessionCreated,
    /* 재연결 시 카메라 재획득 — 가로 잠금은 이미 걸려있어 재요청 불필요(제스처 밖이라 어차피 실패) */
    onReacquireCamera: acquireCamera,
    supabaseClient,
  });
  const { broadcastPhase, peerConnectionState } = signaling;

  // autostart — ?autostart=1 쿼리 시 카메라 재획득 + 방송 자동 시작
  useBroadcasterAutostart({
    deviceToken: deviceIdentity?.deviceToken ?? null,
    broadcastPhase,
    localStreamRef,
    onReacquireCamera: acquireCamera,
    startBroadcast: signaling.startBroadcast,
  });

  // 탭 복귀/bfcache 복귀 시 pc 가 죽어있으면 방송 재시작
  useBroadcasterLifecycle({
    broadcastPhase,
    peerConnectionRef: signaling.peerConnectionRef,
    startBroadcast: signaling.startBroadcast,
  });

  // 화면 딤 (방송 중일 때만 활성화)
  const isBroadcasting = broadcastPhase === "live" || broadcastPhase === "connecting";
  const { isDimmed, wakeUp } = useScreenDimmer(isBroadcasting);

  /** 카메라 전환 + PeerConnection 트랙 교체 */
  const handleSwitchCamera = useCallback(async () => {
    const newTrack = await switchCamera();
    if (newTrack) await signaling.replaceVideoTrack(newTrack);
  }, [switchCamera, signaling]);

  // BroadcastMainView 전달용 5개 그루핑 객체 — 별도 훅으로 추출해 본체 축소
  const mainViewProps = useBroadcastMainViewProps({
    broadcastPhase,
    peerConnectionState,
    activeSessionId: signaling.activeSessionId,
    autoReconnectCount: signaling.autoReconnectCount,
    errorMessage: signaling.errorMessage,
    cameraError,
    deviceName: deviceIdentity?.deviceName ?? "카메라",
    facingMode,
    localVideoRef,
    remoteAudioRef: signaling.remoteAudioRef,
    isDimmed,
    onWakeUp: wakeUp,
    isPortrait,
    careLogPending: care.careLogPending,
    careLogMessage: care.careLogMessage,
    lastWaterChangeAt: care.lastWaterChangeAt,
    lastLitterCleanAt: care.lastLitterCleanAt,
    isSoundEnabled,
    onToggleSound: toggleSoundEnabled,
    onRecordCare: care.recordCareLog,
    /* 사용자 제스처에서 가로 잠금 요청 후 카메라 획득 */
    onAcquireCamera: handleAcquireCameraWithLandscape,
    onStartBroadcast: signaling.startBroadcast,
    onStopBroadcast: signaling.stopBroadcast,
    onResetError: signaling.resetError,
    onSwitchCamera: handleSwitchCamera,
  });

  // ── 렌더 분기 ──
  // DebugLogOverlay: ?debug=1 쿼리 시 화면 하단에 [s9-cam] 로그 표시 (USB 디버깅 대체)
  if (!credentialsLoaded || (broadcastPhase === "loading" && deviceIdentity !== null)) {
    return (
      <>
        <BroadcastLoadingView />
        <DebugLogOverlay />
      </>
    );
  }
  if ((credentialsLoaded && !deviceIdentity) || broadcastPhase === "unpaired") {
    return (
      <>
        <BroadcastUnpairedView />
        <DebugLogOverlay />
      </>
    );
  }
  return (
    <>
      <BroadcastMainView {...mainViewProps} />
      <DebugLogOverlay />
    </>
  );
}
