"use client";

/** useWebRtcLiveConnection — CameraLiveViewer 전용 WebRTC 연결/세션감시 훅 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  decodeSdpFromDatabaseColumn,
  encodePlainSdpForDatabaseColumn,
} from "@/lib/webrtc/sessionDescriptionPayload";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { resolveWebRtcPeerConnectionConfiguration } from "@/lib/webrtc/getWebRtcIceServersForPeerConnection";
import { buildWebRtcNetworkFailureUserMessage } from "@/lib/webrtc/buildWebRtcNetworkFailureUserMessage";
import {
  logWebRtcDebug,
  summarizeIceServersForLog,
} from "@/lib/webrtc/webrtcDebugLog";
import { ViewerReconnectEngine } from "@/lib/webrtc/viewerReconnectEngine";

export type ViewerConnectionPhase =
  | "idle" | "watching_for_broadcast" | "connecting" | "connected" | "error";

export type LiveSession = { id: string; cat_id: string | null; offer_sdp: string | null };

export function useWebRtcLiveConnection(homeId: string | null) {
  const [connectionPhase, setConnectionPhase] = useState<ViewerConnectionPhase>("watching_for_broadcast");
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingChannelRef = useRef<RealtimeChannel | null>(null);
  const sessionWatcherRef = useRef<RealtimeChannel | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relayRetryAttemptedRef = useRef(false); // ICE 실패 시 relay 1회 재시도 추적
  /** 재연결 엔진 — disconnected/keepalive/visibility 모두 위임 */
  const engineRef = useRef<ViewerReconnectEngine | null>(null);
  /** answerNotifyCh 타이머 — cleanup 시 정리 보장 */
  const answerNotifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** answerNotifyCh 채널 ref — cleanup 시 채널도 함께 제거 (누수 방지) */
  const answerNotifyChRef = useRef<RealtimeChannel | null>(null);

  /* supabase 클라이언트를 useMemo로 안정화 — 매 렌더마다 새 인스턴스 생성 방지 */
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  /** PeerConnection 및 관련 타이머/채널 정리 */
  const closePeerConnection = useCallback(async () => {
    if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
    /* 재연결 엔진 정리 — 언마운트 시 모든 타이머/리스너 해제 */
    if (engineRef.current) { engineRef.current.dispose(); engineRef.current = null; }
    /* answerNotify 타이머 + 채널 정리 — 언마운트 시 누수 방지 */
    if (answerNotifyTimerRef.current) { clearTimeout(answerNotifyTimerRef.current); answerNotifyTimerRef.current = null; }
    if (answerNotifyChRef.current) { void supabase.removeChannel(answerNotifyChRef.current); answerNotifyChRef.current = null; }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (signalingChannelRef.current) {
      await supabase.removeChannel(signalingChannelRef.current);
      signalingChannelRef.current = null;
    }
    if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = null; }
  }, [supabase]);

  /* ── 라이브 세션 연결 ── */
  const connectToLiveSession = useCallback(
    async (session: LiveSession, opts?: { forceRelay?: boolean }) => {
      if (!session.offer_sdp) return;
      setConnectionPhase("connecting");

      await closePeerConnection();

      /* 20초 내 연결 안 되면 타임아웃 — 죽은 세션 무한 대기 방지 */
      connectTimeoutRef.current = setTimeout(() => {
        connectTimeoutRef.current = null;
        if (peerConnectionRef.current?.connectionState !== "connected") {
          logWebRtcDebug("viewer", "connect.timeout", { sessionId: session.id });
          setErrorMessage("연결 시간이 초과됐어요. 다시 시도해 주세요.");
          setConnectionPhase("watching_for_broadcast");
          setLiveSession(null);
          void closePeerConnection();
        }
      }, 20_000);

      const forceRelay = opts?.forceRelay ?? false;

      try {
        const { rtcConfiguration: rtcConfig, turnRelayConfigured } =
          await resolveWebRtcPeerConnectionConfiguration({ forceRelay });
        logWebRtcDebug("viewer", "connect.enter", {
          sessionId: session.id,
          forceRelay,
          ice: summarizeIceServersForLog(rtcConfig.iceServers ?? []),
        });

        const pc = new RTCPeerConnection(rtcConfig);
        peerConnectionRef.current = pc;

        let hasReported = false;
        /** 연결 실패 알림 + relay 1회 재시도 */
        function reportFailure() {
          if (hasReported) return;
          hasReported = true;
          // TURN 설정 시 relay 강제 모드로 1회 재시도
          if (!forceRelay && turnRelayConfigured && !relayRetryAttemptedRef.current) {
            relayRetryAttemptedRef.current = true;
            logWebRtcDebug("viewer", "connect.retry_relay_only", { sessionId: session.id });
            void closePeerConnection().then(() => {
              void connectToLiveSession(session, { forceRelay: true });
            });
            return;
          }

          setConnectionPhase("error");
          setErrorMessage(
            buildWebRtcNetworkFailureUserMessage({ turnRelayConfigured }),
          );
          setLiveSession(null);
          void closePeerConnection();
        }

        /* ICE 후보 중복 방지 */
        const appliedBroadcasterIceKeys = new Set<string>();
        let viewerIceInsertCount = 0;

        /** broadcaster ICE 후보 적용 (중복 무시) */
        async function applyBroadcasterIceCandidate(
          rawCandidate: RTCIceCandidateInit,
        ) {
          const dedupeKey = JSON.stringify(rawCandidate);
          if (appliedBroadcasterIceKeys.has(dedupeKey)) return;
          if (!pc.remoteDescription) return;
          appliedBroadcasterIceKeys.add(dedupeKey);
          try {
            await pc.addIceCandidate(new RTCIceCandidate(rawCandidate));
          } catch {
            // 중복·순서 문제 등은 무시
          }
        }

        /* 미디어 트랙 수신 */
        pc.ontrack = ({ streams }) => {
          if (remoteVideoRef.current && streams[0]) {
            remoteVideoRef.current.srcObject = streams[0];
            logWebRtcDebug("viewer", "media.on_track", {
              trackCount: streams[0].getTracks().length,
            });
          }
        };

        /* ICE 연결 상태 변경 */
        pc.oniceconnectionstatechange = () => {
          const ice = pc.iceConnectionState;
          logWebRtcDebug("viewer", "ice.connection_state", { iceConnectionState: ice });
          if (ice === "connected" || ice === "completed") {
            relayRetryAttemptedRef.current = false;
            setConnectionPhase("connected");
          }
          if (ice === "failed") { reportFailure(); }
        };

        /* ★ 재연결 엔진 생성 + PC 등록 */
        const engine = new ViewerReconnectEngine();
        engineRef.current = engine;
        engine.attachPeerConnection(pc);
        engine.onAction = (action) => {
          if (action.type === "ice_restart") {
            logWebRtcDebug("viewer", "engine.ice_restart", {});
            try { pc.restartIce(); } catch { /* PC 이미 닫힘 */ }
          } else if (action.type === "full_reconnect") {
            logWebRtcDebug("viewer", "engine.full_reconnect", { attempt: action.attempt });
            void closePeerConnection().then(() => void connectToLiveSession(session));
          } else if (action.type === "keepalive_dead" || action.type === "visibility_reconnect") {
            logWebRtcDebug("viewer", `engine.${action.type}`, {});
            void closePeerConnection().then(() => void connectToLiveSession(session));
          } else if (action.type === "connection_recovered") {
            logWebRtcDebug("viewer", "engine.connection_recovered", {});
            setConnectionPhase("connected");
          }
        };

        /* Peer 연결 상태 변경 — 엔진에 위임 */
        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          logWebRtcDebug("viewer", "peer.connection_state", { connectionState: state });
          engine.handleConnectionStateChange(state);
          if (state === "connected") {
            if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
            setConnectionPhase("connected");
            engine.startKeepalive();
          } else if (state === "failed") {
            if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
            /* 엔진 정리 후 실패 보고 — stale 타이머/리스너 방지 */
            engine.dispose();
            engineRef.current = null;
            reportFailure();
          } else if (state === "closed") {
            engine.stopKeepalive();
          }
        };

        /* viewer ICE 후보 → RPC 삽입 */
        pc.onicecandidate = ({ candidate }) => {
          if (!candidate) { logWebRtcDebug("viewer", "ice.local_gathering_done", { viewerCandidatesSent: viewerIceInsertCount }); return; }
          viewerIceInsertCount += 1;
          void supabase.rpc("viewer_add_ice_candidate", { p_session_id: session.id, p_candidate: candidate.toJSON() })
            .then(({ error: e }) => { if (e) logWebRtcDebug("viewer", "ice.viewer_insert_failed", { message: e.message, code: e.code }); });
        };

        /* SDP offer 적용 */
        await pc.setRemoteDescription(new RTCSessionDescription(decodeSdpFromDatabaseColumn(session.offer_sdp, "offer")));
        logWebRtcDebug("viewer", "signaling.remote_offer_applied", {});

        /* ICE 후보 실시간 채널 구독 */
        const channel = supabase.channel(`viewer-ice-${session.id}`);
        channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "ice_candidates", filter: `session_id=eq.${session.id}` }, (payload) => {
          const row = payload.new as { sender: string; candidate: RTCIceCandidateInit };
          if (row.sender === "broadcaster") void applyBroadcasterIceCandidate(row.candidate);
        });

        /* 채널 ref를 먼저 할당 — 타임아웃/에러 시에도 closePeerConnection이 정리 가능 */
        signalingChannelRef.current = channel;
        /* 5초 타임아웃으로 무한 대기 방지 */
        try {
          await Promise.race([
            new Promise<void>((resolve, reject) => {
              channel.subscribe((s) => { if (s === "SUBSCRIBED") resolve(); if (s === "CHANNEL_ERROR") reject(new Error("ICE 채널 오류")); });
            }),
            new Promise<void>((_, rej) => setTimeout(() => rej(new Error("ICE 채널 5초 타임아웃")), 5000)),
          ]);
        } catch (subErr) {
          logWebRtcDebug("viewer", "signaling.ice_channel_subscribe_failed", { error: subErr });
          /* 채널 실패해도 기존 ICE 일괄 적용으로 연결 가능 — 계속 진행 */
        }
        logWebRtcDebug("viewer", "signaling.ice_channel_subscribed", { channel: `viewer-ice-${session.id}` });

        /* 기존 broadcaster ICE 후보 적용 */
        const { data: existingIce } = await supabase.from("ice_candidates").select("candidate")
          .eq("session_id", session.id).eq("sender", "broadcaster").order("created_at", { ascending: true });
        for (const row of existingIce ?? []) await applyBroadcasterIceCandidate(row.candidate as RTCIceCandidateInit);

        /* answer SDP 생성 */
        const answer = await pc.createAnswer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
        await pc.setLocalDescription(answer);
        logWebRtcDebug("viewer", "signaling.local_answer_set", { sdpLines: (pc.localDescription?.sdp ?? "").split("\n").length });
        const committedAnswer = pc.localDescription;
        if (!committedAnswer?.sdp) throw new Error("로컬 SDP(answer)를 확정할 수 없어요.");

        /* answer SDP → RPC 저장 */
        const encodedAnswer = encodePlainSdpForDatabaseColumn(committedAnswer.sdp);
        const { data: ansRpcData, error: ansErr } = await supabase.rpc("viewer_update_answer_sdp", { p_session_id: session.id, p_answer_sdp: encodedAnswer });
        if (ansErr) { logWebRtcDebug("viewer", "signaling.answer_db_update_failed", { message: ansErr.message }); throw new Error(ansErr.message); }
        if ((ansRpcData as { error?: string } | null)?.error) throw new Error((ansRpcData as { error: string }).error);
        logWebRtcDebug("viewer", "signaling.answer_persisted", { sessionId: session.id });

        /* broadcaster 에게 answer 직접 전달 (DB 폴링 실패 대비) */
        /* 이전 채널 + 타이머 정리 (재연결 시 누수 + race condition 방지) */
        if (answerNotifyTimerRef.current) { clearTimeout(answerNotifyTimerRef.current); answerNotifyTimerRef.current = null; }
        if (answerNotifyChRef.current) { void supabase.removeChannel(answerNotifyChRef.current); answerNotifyChRef.current = null; }
        const notifyCh = supabase.channel(`answer_ready_${session.id}`);
        answerNotifyChRef.current = notifyCh;
        notifyCh.subscribe((s) => {
          if (s === "SUBSCRIBED") {
            void notifyCh.send({ type: "broadcast", event: "answer_ready", payload: { session_id: session.id, answer_sdp: encodedAnswer } });
          }
          /* SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT 모두 즉시 ref 해제 + 10초 후 채널 정리 */
          if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
            if (s !== "SUBSCRIBED") logWebRtcDebug("viewer", "answerNotify.channel_error", { status: s });
            answerNotifyChRef.current = null; /* 즉시 ref 해제 — closePeerConnection 이중 정리 방지 */
            answerNotifyTimerRef.current = setTimeout(() => {
              answerNotifyTimerRef.current = null;
              void supabase.removeChannel(notifyCh);
            }, 10000);
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "연결에 실패했어요.";
        logWebRtcDebug("viewer", "connect.failed", { message: msg });
        setErrorMessage(msg);
        setConnectionPhase("error");
        void closePeerConnection();
      }
    },
    [supabase, closePeerConnection],
  );

  /* ── 세션 감시: homeId 확보 후 live 세션 자동 감지 ── */
  useEffect(() => {
    if (!homeId) return;
    setConnectionPhase("watching_for_broadcast");

    /* 기존 live 세션 조회 */
    void (async () => {
      const { data } = await supabase.from("camera_sessions").select("id, cat_id, offer_sdp")
        .eq("home_id", homeId).eq("status", "live").not("offer_sdp", "is", null)
        .order("updated_at", { ascending: false }).limit(1);
      if (data?.[0]) setLiveSession(data[0] as LiveSession);
    })();

    /* Realtime: camera_sessions 변경 감시 */
    const watcher = supabase.channel(`session-watcher-${homeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "camera_sessions", filter: `home_id=eq.${homeId}` }, (payload) => {
        const row = payload.new as { status?: string; offer_sdp?: string | null; id?: string; cat_id?: string | null };
        if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
          if (row.status === "live" && row.offer_sdp && row.id) {
            setLiveSession({ id: row.id, cat_id: row.cat_id ?? null, offer_sdp: row.offer_sdp });
          } else if (row.status === "idle") {
            setLiveSession(null); setConnectionPhase("watching_for_broadcast"); void closePeerConnection();
          }
        }
      }).subscribe();
    sessionWatcherRef.current = watcher;
    return () => { void supabase.removeChannel(watcher); void closePeerConnection(); };
  }, [homeId, supabase, closePeerConnection]);

  /* ── 수동 재연결 ── */
  const retryConnection = useCallback(() => {
    relayRetryAttemptedRef.current = false;
    setErrorMessage(null);
    setConnectionPhase("watching_for_broadcast");
  }, []);

  /* ── live 세션 감지 → 자동 WebRTC 연결 (watching 일 때만) ── */
  useEffect(() => {
    if (!liveSession?.offer_sdp) return;
    if (connectionPhase !== "watching_for_broadcast") return;

    void connectToLiveSession(liveSession);
  }, [liveSession, connectionPhase, connectToLiveSession]);

  return {
    videoRef: remoteVideoRef,
    connectionPhase,
    errorMessage,
    retryConnection,
    liveSession,
  };
}
