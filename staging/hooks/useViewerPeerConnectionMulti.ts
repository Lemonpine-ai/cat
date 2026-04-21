"use client";

/**
 * useViewerPeerConnectionMulti — Multi-Viewer(R3) 뷰어 측 공통 WebRTC 훅.
 *
 * 역할:
 *   뷰어가 offer 를 생성해 `viewer_create_connection` RPC 로 업로드 →
 *   Realtime 으로 `camera_viewer_connections.answer_sdp` UPDATE 수신 →
 *   `ice_candidates` 양방향 trickle → connected.
 *
 * 이 파일은 React 상태/ref/cleanup 만 담당한다.
 * 실제 시그널링 시퀀스는 viewerPeerConnectionFlow.ts 로 분리.
 * live / slot 어댑터가 role 별로 이 훅을 감싼다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ViewerReconnectEngine } from "@/lib/webrtc/viewerReconnectEngine";
import {
  logWebRtcEvent,
  type WebRtcLogEvent,
} from "@/lib/webrtc/webrtcConnectionLogger";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  createIceQueue,
  type ViewerConnectionPhase,
  type ViewerRole,
} from "@/../staging/hooks/viewerPeerConnectionHelpers";
import {
  applyAnswerAndFlushQueue,
  runViewerConnectionFlow,
} from "@/../staging/hooks/viewerPeerConnectionFlow";

/* ─── 타입 재노출 — 어댑터 훅이 이 훅에서 import 하도록 ─── */
export type { ViewerConnectionPhase, ViewerRole };

export interface UseViewerPeerConnectionMultiOptions {
  sessionId: string | null;
  rtcConfiguration?: RTCConfiguration | null;
  turnRelayConfigured?: boolean;
  homeId?: string | null;
  role: ViewerRole;
  delayMs?: number;
  onPhaseChange?: (phase: ViewerConnectionPhase) => void;
  onError?: (errorMessage: string | null) => void;
}

export interface UseViewerPeerConnectionMultiReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  phase: ViewerConnectionPhase;
  errorMessage: string | null;
  reconnect: () => void;
  viewerConnectionId: string | null;
  pcRef: React.RefObject<RTCPeerConnection | null>;
}

const CODE_VERSION = "r3-viewer-multi-v1";

export function useViewerPeerConnectionMulti(
  options: UseViewerPeerConnectionMultiOptions,
): UseViewerPeerConnectionMultiReturn {
  const {
    sessionId,
    rtcConfiguration: externalRtcConfig = null,
    turnRelayConfigured: externalTurnRelay,
    homeId = null,
    role,
    delayMs = 0,
    onPhaseChange,
    onError,
  } = options;

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [phase, setPhase] = useState<ViewerConnectionPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewerConnectionId, setViewerConnectionId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const viewerConnectionIdRef = useRef<string | null>(null);
  const engineRef = useRef<ViewerReconnectEngine | null>(null);
  const answerChannelRef = useRef<RealtimeChannel | null>(null);
  const iceChannelRef = useRef<RealtimeChannel | null>(null);
  const stopPingRef = useRef<(() => void) | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooManyRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relayRetriedRef = useRef(false);
  const cleanupInProgressRef = useRef(false);
  const iceQueueRef = useRef(createIceQueue());
  const appliedIceKeysRef = useRef<Set<string>>(new Set());
  const reconnectAttemptRef = useRef(0);
  const lastLoggedRef = useRef<WebRtcLogEvent | null>(null);

  const externalRtcConfigRef = useRef(externalRtcConfig);
  const externalTurnRelayRef = useRef(externalTurnRelay);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const onErrorRef = useRef(onError);
  /* props → ref 동기화는 effect 로 — render 중 ref 쓰기 금지 */
  useEffect(() => {
    externalRtcConfigRef.current = externalRtcConfig;
    externalTurnRelayRef.current = externalTurnRelay;
    onPhaseChangeRef.current = onPhaseChange;
    onErrorRef.current = onError;
  }, [externalRtcConfig, externalTurnRelay, onPhaseChange, onError]);

  /* startConnection 의 self-reference 를 위해 ref 로 보관 */
  const startConnectionRef = useRef<(opts?: { forceRelay?: boolean }) => Promise<void>>(
    async () => undefined,
  );

  const updatePhase = useCallback((next: ViewerConnectionPhase) => {
    setPhase(next);
    onPhaseChangeRef.current?.(next);
  }, []);
  const updateError = useCallback((msg: string | null) => {
    setErrorMessage(msg);
    onErrorRef.current?.(msg);
  }, []);

  /* ─── 로깅 ─── */
  const logCtx = useMemo(
    () => ({
      homeId,
      deviceId:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : "unknown",
      role,
    }),
    [homeId, role],
  );
  const logEvent = useCallback(
    (
      eventType: string,
      extra?: {
        pcState?: RTCPeerConnectionState | null;
        errorMessage?: string | null;
        metadata?: Record<string, unknown> | null;
      },
    ) => {
      if (!logCtx.homeId) return;
      const typed = eventType as WebRtcLogEvent;
      if (typed === "connected" && lastLoggedRef.current === "connected") return;
      lastLoggedRef.current = typed;
      void logWebRtcEvent(supabase, {
        homeId: logCtx.homeId,
        deviceId: logCtx.deviceId,
        cameraId: sessionId,
        role: logCtx.role,
        eventType: typed,
        pcState: extra?.pcState ?? null,
        errorMessage: extra?.errorMessage ?? null,
        reconnectAttempt: reconnectAttemptRef.current,
        metadata: extra?.metadata ?? null,
      });
    },
    [supabase, logCtx, sessionId],
  );

  /* ─── 타이머 일괄 해제 ─── */
  const clearAllTimers = useCallback(() => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    if (answerTimeoutRef.current) {
      clearTimeout(answerTimeoutRef.current);
      answerTimeoutRef.current = null;
    }
    if (tooManyRetryTimerRef.current) {
      clearTimeout(tooManyRetryTimerRef.current);
      tooManyRetryTimerRef.current = null;
    }
  }, []);

  /* ─── cleanup ─── */
  const cleanup = useCallback(async () => {
    cleanupInProgressRef.current = true;
    try {
      clearAllTimers();
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      if (stopPingRef.current) {
        stopPingRef.current();
        stopPingRef.current = null;
      }
      if (answerChannelRef.current) {
        await supabase.removeChannel(answerChannelRef.current);
        answerChannelRef.current = null;
      }
      if (iceChannelRef.current) {
        await supabase.removeChannel(iceChannelRef.current);
        iceChannelRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.onconnectionstatechange = null;
        try {
          pcRef.current.close();
        } catch {
          /* already closed */
        }
        pcRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      iceQueueRef.current.clear();
      appliedIceKeysRef.current.clear();
      viewerConnectionIdRef.current = null;
      setViewerConnectionId(null);
    } finally {
      cleanupInProgressRef.current = false;
    }
  }, [supabase, clearAllTimers]);

  /* ─── broadcaster ICE 적용 (큐잉 포함) ─── */
  const applyBroadcasterIce = useCallback(
    async (candidate: RTCIceCandidateInit, rowId: string | null) => {
      const key = rowId ?? JSON.stringify(candidate);
      if (appliedIceKeysRef.current.has(key)) return;
      const pc = pcRef.current;
      if (!pc) return;
      if (!pc.remoteDescription) {
        iceQueueRef.current.enqueue(candidate);
        return;
      }
      appliedIceKeysRef.current.add(key);
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* 중복/순서 무시 */
      }
    },
    [],
  );

  /* ─── answer 수신 처리 ─── */
  const handleAnswerReceived = useCallback(
    async (answerSdpStored: string) => {
      const pc = pcRef.current;
      if (!pc) return;
      await applyAnswerAndFlushQueue({
        pc,
        answerSdpStored,
        role,
        iceQueue: iceQueueRef.current,
        applyBroadcasterIce,
        clearAnswerTimeout: () => {
          if (answerTimeoutRef.current) {
            clearTimeout(answerTimeoutRef.current);
            answerTimeoutRef.current = null;
          }
        },
        onConnecting: () => updatePhase("connecting"),
        onError: async (err) => {
          updateError(err instanceof Error ? err.message : "answer 적용 실패");
          updatePhase("error");
          await cleanup();
        },
      });
    },
    [role, updatePhase, updateError, cleanup, applyBroadcasterIce],
  );

  /* ─── startConnection — 흐름 모듈로 위임 ─── */
  const startConnection = useCallback(
    async (opts?: { forceRelay?: boolean }) => {
      if (!sessionId) return;
      console.log(`[${role}] 코드 버전: ${CODE_VERSION}`);
      await cleanup();
      updatePhase("creating");
      updateError(null);
      try {
        await runViewerConnectionFlow(
          {
            supabase,
            sessionId,
            role,
            externalRtcConfigRef,
            externalTurnRelayRef,
            pcRef,
            videoRef,
            engineRef,
            viewerConnectionIdRef,
            answerChannelRef,
            iceChannelRef,
            stopPingRef,
            connectTimeoutRef,
            answerTimeoutRef,
            tooManyRetryTimerRef,
            relayRetriedRef,
            cleanupInProgressRef,
            reconnectAttemptRef,
            iceQueue: iceQueueRef.current,
            updatePhase,
            updateError,
            setViewerConnectionId,
            logEvent,
            cleanup,
            /* self-reference 는 ref 경유 — stale closure 방지 */
            startConnection: (o) => startConnectionRef.current(o),
            applyBroadcasterIce,
            handleAnswerReceived,
          },
          opts ?? {},
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "연결에 실패했어요.";
        console.error(`[${role}] startConnection 실패:`, err);
        logEvent("error", { errorMessage: msg });
        updateError(msg);
        updatePhase("error");
        await cleanup();
      }
    },
    [
      sessionId,
      role,
      supabase,
      cleanup,
      updatePhase,
      updateError,
      logEvent,
      applyBroadcasterIce,
      handleAnswerReceived,
    ],
  );

  /* startConnection 최신 참조를 ref 에 동기화 — effect 경유 */
  useEffect(() => {
    startConnectionRef.current = startConnection;
  }, [startConnection]);

  /* 자동 시작 (sessionId 변경 시) */
  useEffect(() => {
    if (!sessionId) return;
    const timer = setTimeout(() => void startConnection(), delayMs);
    return () => {
      clearTimeout(timer);
      void cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /* 수동 재연결 */
  const reconnect = useCallback(() => {
    relayRetriedRef.current = false;
    updateError(null);
    void cleanup().then(() => void startConnection());
  }, [cleanup, startConnection, updateError]);

  return {
    videoRef,
    phase,
    errorMessage,
    reconnect,
    viewerConnectionId,
    pcRef,
  };
}
