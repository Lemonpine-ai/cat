"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
import { useGlobalMotion } from "@/hooks/useGlobalMotion";
import { useThermalThrottle } from "@/hooks/useThermalThrottle";
import { BroadcastLoadingView } from "@/components/broadcast/BroadcastLoadingView";
import { BroadcastUnpairedView } from "@/components/broadcast/BroadcastUnpairedView";
import { BroadcastMainView } from "@/components/broadcast/BroadcastMainView";
import { DebugLogOverlay } from "@/components/broadcast/DebugLogOverlay";

/**
 * 남는 폰에서 실행하는 WebRTC 방송 클라이언트 (오케스트레이션 메인).
 * 7개 훅을 조합하고 phase에 따라 Loading/Unpaired/Main 뷰를 분기 렌더.
 *
 * 발열/배터리 보호 파이프라인:
 *   useGlobalMotion (localVideoRef 로 2초마다 모션 검사)
 *      → useThermalThrottle ({ isDimmed, hasMotion })
 *      → 트랙 applyConstraints (HIGH/LOW) + shouldInferYOLO 신호
 *
 * (참고) 방송측에는 현재 YOLO 진입점이 없다. viewer 측 useBehaviorDetection 이
 * 행동 추론을 담당하며, 방송측은 프로파일 전환만 수행한다. 향후 방송측에
 * YOLO 훅을 추가한다면 enabled 를 `isBroadcasting && thermal.shouldInferYOLO`
 * 로 바꿔 걸어야 한다.
 *
 * 용어: thermal = 발열/온도. 프로파일은 기기 발열 완화 목적.
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
  /* HIGH #4 — signaling 객체 전체가 매 렌더 새 참조라 deps 에 넣으면 캐스케이드.
   * replaceVideoTrack 은 useBroadcasterSignaling 내부에서 useCallback([], []) 로
   * 감싸진 완전 안정 참조이므로 개별 추출하여 deps 최적화. */
  const { replaceVideoTrack } = signaling;
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

  /* 글로벌 모션 — 로컬 미리보기 비디오에서 2s 간격으로 움직임 유무 판단.
   * isConnected=true 조건은 "방송 중" 이면 충분 (미리보기도 함께 쓰이므로). */
  const hasMotion = useGlobalMotion({
    videoRef: localVideoRef,
    isConnected: isBroadcasting,
  });

  /* 발열/배터리 thermal throttle — HIGH/LOW 프로파일 자동 전이 */
  const thermal = useThermalThrottle({
    localStreamRef,
    isBroadcasting,
    isDimmed,
    hasMotion,
  });

  /* MED #6 — 빠른 더블탭 race 방지 */
  const switchInFlightRef = useRef(false);

  /** 카메라 전환 + PeerConnection 트랙 교체 + 새 트랙에 현재 프로파일 재적용 */
  const handleSwitchCamera = useCallback(async () => {
    if (switchInFlightRef.current) return;
    switchInFlightRef.current = true;
    try {
      const newTrack = await switchCamera();
      if (newTrack) {
        await replaceVideoTrack(newTrack);
        /* 새 트랙에는 applyConstraints 가 초기 상태이므로 현재 프로파일 재적용 */
        await thermal.reapplyCurrent();
      }
    } finally {
      switchInFlightRef.current = false;
    }
  }, [switchCamera, replaceVideoTrack, thermal.reapplyCurrent]);

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
