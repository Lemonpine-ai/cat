"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { encodePlainSdpForDatabaseColumn } from "@/lib/webrtc/sessionDescriptionPayload";
import { resolveWebRtcPeerConnectionConfiguration } from "@/lib/webrtc/getWebRtcIceServersForPeerConnection";
import { configurePeerConnectionHandlers } from "@/lib/webrtc/configurePeerConnectionHandlers";
import { setupSignalingAndNotify } from "@/hooks/useBroadcasterSignalingPoll";
import { logBroadcasterWebRtcEvent, type WebRtcLogEvent } from "@/lib/webrtc/webrtcConnectionLogger";

const BROADCAST_CODE_VERSION = "v3-signaling-timeout";
/** 방송 상태 페이즈 */
export type BroadcastPhase = "loading" | "unpaired" | "idle" | "acquiring" | "ready" | "connecting" | "live" | "error";
/** 디바이스 인증 정보 */
export type DeviceIdentity = { deviceToken: string; deviceName: string };

interface UseBroadcasterSignalingOptions {
  deviceToken: string | null;
  deviceName: string | null;
  localStreamRef: React.RefObject<MediaStream | null>;
  broadcastHomeId: string | null;
  /** 카메라 획득 중 여부 — acquiring phase 전환에 사용 */
  isAcquiring: boolean;
  /** 카메라 에러 메시지 — error phase 전환에 사용 */
  cameraError: string | null;
  /** 세션 생성 시 콜백 — sessionId와 homeId를 전달 */
  onSessionCreated?: (sessionId: string, homeId: string | null) => void;
  onReacquireCamera?: () => Promise<void>;
  /** 오케스트레이터에서 주입하는 공용 supabase 클라이언트 (중복 realtime 소켓 방지). 미주입 시 자체 생성. */
  supabaseClient?: SupabaseClient;
}

export function useBroadcasterSignaling({
  deviceToken,
  deviceName,
  localStreamRef,
  broadcastHomeId,
  isAcquiring,
  cameraError,
  onSessionCreated,
  onReacquireCamera,
  supabaseClient,
}: UseBroadcasterSignalingOptions) {
  /** supabase 클라이언트 — 주입값 우선, 없으면 자체 생성 (매 렌더마다 재생성 방지) */
  const supabase = useMemo(
    () => supabaseClient ?? createSupabaseBrowserClient(),
    [supabaseClient],
  );

  /* 상태 */
  const [broadcastPhase, setBroadcastPhase] = useState<BroadcastPhase>("loading");
  const [peerConnectionState, setPeerConnectionState] = useState<RTCPeerConnectionState>("new");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** 자동 재연결 시도 횟수 — UI "재연결 중… (N회)" 라벨 갱신을 위해 state 로 보관 */
  const [autoReconnectCount, setAutoReconnectCount] = useState(0);

  /* 코드 버전 로깅 — 마운트 시 1회만 */
  useEffect(() => {
    console.log(`[broadcaster] 코드 버전: ${BROADCAST_CODE_VERSION}`);
  }, []);

  /* deviceToken 기반 초기 phase 자동 결정 — null 이면 loading 유지 (상위가 unpaired 판단) */
  useEffect(() => {
    if (broadcastPhase !== "loading") return;
    if (deviceToken) setBroadcastPhase("idle");
  }, [deviceToken, broadcastPhase]);

  /* 카메라 획득 상태 → broadcastPhase 동기화 */
  useEffect(() => {
    /* [s9-cam 진단] effect 진입 시 모든 변수 상태 기록 — 왜 ready 로 안 가는지 pin-point */
    console.info(
      "[s9-cam] phase-effect isAcquiring=",
      isAcquiring,
      "phase=",
      broadcastPhase,
      "cameraError=",
      cameraError,
      "localStream=",
      !!localStreamRef.current,
    );
    if (isAcquiring && broadcastPhase === "idle") {
      console.info("[s9-cam] phase-effect → acquiring");
      setBroadcastPhase("acquiring");
    }
    if (!isAcquiring && broadcastPhase === "acquiring") {
      if (cameraError) {
        console.info("[s9-cam] phase-effect → error (cameraError)");
        setBroadcastPhase("error");
      } else if (localStreamRef.current) {
        console.info("[s9-cam] phase-effect → ready (stream present)");
        setBroadcastPhase("ready");
      } else {
        console.warn(
          "[s9-cam] phase-effect stuck — !isAcquiring && phase=acquiring but no stream and no error",
        );
      }
    }
    /* connecting 상태에서 카메라 에러 발생 시 error 전환 (autostart/재연결 시) */
    if (!isAcquiring && cameraError && broadcastPhase === "connecting") {
      setBroadcastPhase("error");
      setErrorMessage(cameraError);
    }
  }, [isAcquiring, cameraError, broadcastPhase, localStreamRef]);

  /* Refs — WebRTC·타이머·시그널링 */
  const autoReconnectCountRef = useRef(0);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isCleaningUpRef = useRef(false);
  const signalingPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appliedViewerIceKeysRef = useRef<Set<string>>(new Set());
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const answerReadyChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const disconnectedGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const relayRetryRef = useRef(false);
  const signalingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** [로거] 직전 기록 이벤트 — connected 등 동일 이벤트 연속 기록 억제용 */
  const lastLoggedEventRef = useRef<WebRtcLogEvent | null>(null);

  /* Wake Lock — 방송 중 화면 꺼짐 방지 */
  useEffect(() => {
    if (broadcastPhase !== "live" && broadcastPhase !== "connecting") {
      if (wakeLockRef.current) { void wakeLockRef.current.release(); wakeLockRef.current = null; }
      return;
    }
    const reqWL = async () => { try { if ("wakeLock" in navigator) wakeLockRef.current = await navigator.wakeLock.request("screen"); } catch { /* 미지원/권한 거부 */ } };
    void reqWL();
    const onVis = () => { if (document.visibilityState === "visible" && !wakeLockRef.current) void reqWL(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (wakeLockRef.current) { void wakeLockRef.current.release(); wakeLockRef.current = null; }
    };
  }, [broadcastPhase]);

  /**
   * WebRTC·폴링만 정리합니다. DB 의 camera_sessions 는 건드리지 않습니다.
   * (언마운트·React Strict Mode 에서 stop_device_broadcast 를 호출하면
   * 세션이 즉시 idle 로 바뀌어 관리자 측에서 live 행이 사라진 것처럼 보입니다.)
   */
  const cleanupPeerResourcesOnly = useCallback(
    async (keepCamera: boolean) => {
      if (signalingPollIntervalRef.current) {
        clearInterval(signalingPollIntervalRef.current);
        signalingPollIntervalRef.current = null;
      }
      appliedViewerIceKeysRef.current = new Set();

      /* disconnected 유예 타이머 정리 */
      if (disconnectedGraceTimerRef.current) {
        clearTimeout(disconnectedGraceTimerRef.current);
        disconnectedGraceTimerRef.current = null;
      }
      /* 자동 재연결 타이머 정리 */
      if (autoReconnectTimerRef.current) {
        clearTimeout(autoReconnectTimerRef.current);
        autoReconnectTimerRef.current = null;
      }
      /* signaling 타임아웃 정리 */
      if (signalingTimeoutRef.current) {
        clearTimeout(signalingTimeoutRef.current);
        signalingTimeoutRef.current = null;
      }

      /* answer_ready 채널 정리 (구독 누수 방지) */
      if (answerReadyChRef.current) {
        void supabase.removeChannel(answerReadyChRef.current);
        answerReadyChRef.current = null;
      }

      /* track.onended 클로저 해제 — pc.close() 이전. 수일 재연결 시 heap 누수 방지 */
      localStreamRef.current?.getTracks().forEach((t) => { t.onended = null; });
      if (peerConnectionRef.current) {
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null;
      }

      if (!keepCamera && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    },
    [supabase, localStreamRef],
  );

  /** 방송 종료 버튼 — DB 세션을 idle 로 전환합니다. */
  const cleanupSessionAndStop = useCallback(
    async (keepCamera: boolean) => {
      if (isCleaningUpRef.current) return;
      isCleaningUpRef.current = true;

      try {
        await cleanupPeerResourcesOnly(keepCamera);

        if (deviceToken && sessionIdRef.current) {
          await supabase.rpc("stop_device_broadcast", {
            input_device_token: deviceToken,
          });
          /* 대시보드에 세션 종료 알림 */
          if (broadcastHomeId) {
            const stopCh = supabase.channel(`cam_session_broadcast_${broadcastHomeId}`);
            stopCh.subscribe((s) => {
              if (s === "SUBSCRIBED") {
                void stopCh.send({ type: "broadcast", event: "session_stopped", payload: {} });
                setTimeout(() => void supabase.removeChannel(stopCh), 2000);
              } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
                /* 구독 실패 시 채널 정리 — 메모리 누수 방지 */
                void supabase.removeChannel(stopCh);
              }
            });
          }
        }
        sessionIdRef.current = null;
        setActiveSessionId(null);
      } finally {
        isCleaningUpRef.current = false;
      }
    },
    [supabase, deviceToken, cleanupPeerResourcesOnly, broadcastHomeId],
  );

  /* 언마운트 시 리소스 정리 */
  useEffect(() => () => { void cleanupPeerResourcesOnly(false); }, [cleanupPeerResourcesOnly]);

  /* 탭 닫기/숨기기 시 세션 정리 — stale live 세션 방지.
   * bfcache: pagehide(persisted=true) 는 캐시로 들어가는 중이므로 beacon 스킵 (복귀 시 재연결). */
  useEffect(() => {
    function handleUnload(e: Event) {
      if (!deviceToken || !sessionIdRef.current) return;
      if (e.type === "pagehide" && (e as PageTransitionEvent).persisted) return;
      const url = `${window.location.origin}/api/webrtc/stop-broadcast`;
      navigator.sendBeacon(url, JSON.stringify({ device_token: deviceToken }));
    }
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
    };
  }, [deviceToken]);

  /* ── 방송 시작 ── */
  const startBroadcast = useCallback(async (opts?: { forceRelay?: boolean }) => {
    if (!deviceToken) return;
    /* 카메라 트랙 죽었으면 재획득 */
    const hasLive = localStreamRef.current?.getTracks().some((t) => t.readyState === "live");
    if (!localStreamRef.current || !hasLive) {
      if (onReacquireCamera) await onReacquireCamera();
      if (!localStreamRef.current) return;
    }
    setBroadcastPhase("connecting");
    setErrorMessage(null);
    const forceRelay = opts?.forceRelay ?? false;

    try {
      sessionIdRef.current = null;
      /* [로거] 새 PC — connected 재기록 허용을 위해 직전 이벤트 초기화 */
      lastLoggedEventRef.current = null;
      const { rtcConfiguration, turnRelayConfigured } = await resolveWebRtcPeerConnectionConfiguration({ forceRelay });
      const pc = new RTCPeerConnection(rtcConfiguration);
      peerConnectionRef.current = pc;

      /* PeerConnection 이벤트 핸들러 + 자동 재연결 + 로컬 트랙 + ICE 큐 설정 */
      configurePeerConnectionHandlers({
        pc,
        supabase,
        deviceToken,
        forceRelay,
        turnRelayConfigured,
        remoteAudioRef,
        localStreamRef,
        peerConnectionRef,
        sessionIdRef,
        signalingPollIntervalRef,
        signalingTimeoutRef,
        disconnectedGraceTimerRef,
        autoReconnectTimerRef,
        autoReconnectCountRef,
        setAutoReconnectCount,
        relayRetryRef,
        isCleaningUpRef,
        pendingIceCandidatesRef,
        setPeerConnectionState,
        setErrorMessage,
        setBroadcastPhase,
        cleanupPeerResourcesOnly,
        restartBroadcast: (o) => void startBroadcast(o),
        lastLoggedEventRef,
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const committedLocalDescription = pc.localDescription;
      if (!committedLocalDescription?.sdp) {
        throw new Error("로컬 SDP(offer)를 확정할 수 없어요.");
      }

      const { data: broadcastResult, error: broadcastError } =
        await supabase.rpc("start_device_broadcast", {
          input_device_token: deviceToken,
          input_offer_sdp: encodePlainSdpForDatabaseColumn(
            committedLocalDescription.sdp,
          ),
        });

      if (broadcastError || !broadcastResult || broadcastResult.error) {
        throw new Error(
          broadcastResult?.error ??
            broadcastError?.message ??
            "방송 세션 생성 실패",
        );
      }

      const sessionId = broadcastResult.session_id as string;
      sessionIdRef.current = sessionId;
      setActiveSessionId(sessionId);

      /* RPC 응답에서 home_id 확보 (session_stopped broadcast 전송에 필요) */
      const effectiveHomeId =
        (broadcastResult.home_id as string | undefined) ?? broadcastHomeId;
      onSessionCreated?.(sessionId, effectiveHomeId);

      /* ref 큐에 쌓인 ICE 캔디데이트 일괄 전송 */
      const queued = [...pendingIceCandidatesRef.current];
      pendingIceCandidatesRef.current = [];
      for (const queuedCandidate of queued) {
        await supabase.rpc("add_device_ice_candidate", {
          input_device_token: deviceToken,
          input_session_id: sessionId,
          input_candidate: queuedCandidate,
        });
      }

      /* signaling 폴링 + answer 수신 + 대시보드 알림 설정 */
      await setupSignalingAndNotify({
        supabase,
        pc,
        sessionId,
        deviceToken,
        effectiveHomeId,
        committedSdp: committedLocalDescription.sdp,
        peerConnectionRef,
        sessionIdRef,
        answerReadyChRef,
        signalingPollIntervalRef,
        appliedViewerIceKeysRef,
        signalingTimeoutRef,
        setBroadcastPhase,
        cleanupPeerResourcesOnly,
        restartBroadcast: () => void startBroadcast(),
      });

      setBroadcastPhase("live");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "방송 시작에 실패했어요.";
      setErrorMessage(errorMsg);
      setBroadcastPhase("error");
      /* [로거] startBroadcast 실패 — fire-and-forget */
      void logBroadcasterWebRtcEvent(supabase, deviceToken, sessionIdRef.current, "error", { errorMessage: errorMsg });
      await cleanupSessionAndStop(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceToken, broadcastHomeId, supabase, localStreamRef, onSessionCreated, onReacquireCamera, cleanupPeerResourcesOnly, cleanupSessionAndStop]);

  /** 방송 수동 종료 */
  const stopBroadcast = useCallback(async () => {
    await cleanupSessionAndStop(true);
    setBroadcastPhase("ready");
    setPeerConnectionState("new");
  }, [cleanupSessionAndStop]);

  /** 에러 초기화 — 카메라 스트림 유지하면서 재시작 가능 상태로 전환 */
  const resetError = useCallback(async () => {
    setErrorMessage(null);
    autoReconnectCountRef.current = 0;
    setAutoReconnectCount(0);
    await cleanupPeerResourcesOnly(true);
    setBroadcastPhase(localStreamRef.current ? "ready" : "idle");
  }, [cleanupPeerResourcesOnly, localStreamRef]);

  /** PeerConnection sender의 비디오 트랙 교체 (카메라 전환 시 사용) */
  const replaceVideoTrack = useCallback(async (newTrack: MediaStreamTrack) => {
    const sender = peerConnectionRef.current
      ?.getSenders()
      .find((s) => s.track?.kind === "video");
    if (sender) {
      await sender.replaceTrack(newTrack);
    }
  }, []);

  /* autostart 훅은 별도 분리 — useBroadcasterAutostart 에서 담당 */

  return {
    broadcastPhase,
    peerConnectionState,
    activeSessionId,
    errorMessage,
    autoReconnectCount,
    startBroadcast,
    stopBroadcast,
    resetError,
    replaceVideoTrack,
    remoteAudioRef,
    /** lifecycle 훅이 pc 상태를 보고 재시작 판단하도록 노출 */
    peerConnectionRef,
  };
}
