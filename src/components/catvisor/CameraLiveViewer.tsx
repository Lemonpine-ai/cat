"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  decodeSessionDescriptionPayload,
  encodeSessionDescriptionForDatabase,
} from "@/lib/webrtc/sessionDescriptionPayload";
import type { RealtimeChannel } from "@supabase/supabase-js";
import styles from "./CameraLiveViewer.module.css";

const WEBRTC_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

type ViewerConnectionPhase =
  | "idle"
  | "watching_for_broadcast"
  | "connecting"
  | "connected"
  | "error";

type LiveSession = {
  id: string;
  cat_id: string | null;
  offer_sdp: string | null;
};

/**
 * 대시보드 카메라 섹션 안에 삽입되는 WebRTC 수신 뷰어.
 * Supabase Realtime 을 통해 live 세션을 자동 감지하고 WebRTC 연결을 맺습니다.
 * homeId 가 없으면 아무것도 렌더링하지 않습니다.
 */
export function CameraLiveViewer() {
  const [connectionPhase, setConnectionPhase] =
    useState<ViewerConnectionPhase>("idle");
  const [homeId, setHomeId] = useState<string | null>(null);
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingChannelRef = useRef<RealtimeChannel | null>(null);
  const sessionWatcherRef = useRef<RealtimeChannel | null>(null);

  const supabase = createSupabaseBrowserClient();

  const closePeerConnection = useCallback(async () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (signalingChannelRef.current) {
      await supabase.removeChannel(signalingChannelRef.current);
      signalingChannelRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, [supabase]);

  const connectToLiveSession = useCallback(
    async (session: LiveSession) => {
      if (!session.offer_sdp) return;
      setConnectionPhase("connecting");

      await closePeerConnection();

      try {
        const pc = new RTCPeerConnection({ iceServers: WEBRTC_ICE_SERVERS });
        peerConnectionRef.current = pc;

        pc.ontrack = ({ streams }) => {
          if (remoteVideoRef.current && streams[0]) {
            remoteVideoRef.current.srcObject = streams[0];
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") {
            setConnectionPhase("connected");
          }
          if (
            pc.connectionState === "failed" ||
            pc.connectionState === "closed" ||
            pc.connectionState === "disconnected"
          ) {
            setConnectionPhase("watching_for_broadcast");
            setLiveSession(null);
            void closePeerConnection();
          }
        };

        const channel = supabase.channel(`viewer-${session.id}`);
        channel
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "ice_candidates",
              filter: `session_id=eq.${session.id}`,
            },
            async (payload) => {
              const row = payload.new as {
                sender: string;
                candidate: RTCIceCandidateInit;
              };
              if (row.sender === "broadcaster" && pc.remoteDescription) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(row.candidate));
                } catch {
                  // 무시
                }
              }
            },
          )
          .subscribe();

        signalingChannelRef.current = channel;

        pc.onicecandidate = async ({ candidate }) => {
          if (candidate) {
            await supabase.from("ice_candidates").insert({
              session_id: session.id,
              sender: "viewer",
              candidate: candidate.toJSON(),
            });
          }
        };

        const offerInit = decodeSessionDescriptionPayload(session.offer_sdp);
        await pc.setRemoteDescription(new RTCSessionDescription(offerInit));

        const { data: existingCandidates } = await supabase
          .from("ice_candidates")
          .select("candidate")
          .eq("session_id", session.id)
          .eq("sender", "broadcaster");

        for (const row of existingCandidates ?? []) {
          try {
            await pc.addIceCandidate(
              new RTCIceCandidate(row.candidate as RTCIceCandidateInit),
            );
          } catch {
            // 무시
          }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        const committedAnswer = pc.localDescription;
        if (!committedAnswer?.sdp) {
          throw new Error("로컬 SDP(answer)를 확정할 수 없어요.");
        }

        await supabase
          .from("camera_sessions")
          .update({
            answer_sdp: encodeSessionDescriptionForDatabase({
              type: committedAnswer.type,
              sdp: committedAnswer.sdp,
            }),
          })
          .eq("id", session.id);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "연결에 실패했어요.";
        setErrorMessage(message);
        setConnectionPhase("error");
        void closePeerConnection();
      }
    },
    [supabase, closePeerConnection],
  );

  // 1단계: 내 home_id 가져오기
  useEffect(() => {
    async function fetchHomeId() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("home_id")
        .eq("id", user.id)
        .single();

      if (profile?.home_id) {
        setHomeId(profile.home_id);
      }
    }
    void fetchHomeId();
  }, [supabase]);

  // 2단계: home_id 확보 후 live 세션 감시 시작
  useEffect(() => {
    if (!homeId) return;

    setConnectionPhase("watching_for_broadcast");

    async function loadExistingSession() {
      const { data: sessions } = await supabase
        .from("camera_sessions")
        .select("id, cat_id, offer_sdp")
        .eq("home_id", homeId!)
        .eq("status", "live")
        .not("offer_sdp", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (sessions && sessions.length > 0) {
        const session = sessions[0] as LiveSession;
        setLiveSession(session);
      }
    }

    void loadExistingSession();

    const watcher = supabase
      .channel(`session-watcher-${homeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "camera_sessions",
          filter: `home_id=eq.${homeId}`,
        },
        (payload) => {
          const row = payload.new as {
            status?: string;
            offer_sdp?: string | null;
            id?: string;
            cat_id?: string | null;
          };

          if (
            payload.eventType === "UPDATE" ||
            payload.eventType === "INSERT"
          ) {
            if (row.status === "live" && row.offer_sdp && row.id) {
              setLiveSession({
                id: row.id,
                cat_id: row.cat_id ?? null,
                offer_sdp: row.offer_sdp,
              });
            } else if (row.status === "idle") {
              setLiveSession(null);
              setConnectionPhase("watching_for_broadcast");
              void closePeerConnection();
            }
          }
        },
      )
      .subscribe();

    sessionWatcherRef.current = watcher;

    return () => {
      void supabase.removeChannel(watcher);
      void closePeerConnection();
    };
  }, [homeId, supabase, closePeerConnection]);

  // 3단계: live 세션 감지 → 자동 WebRTC 연결
  useEffect(() => {
    if (!liveSession?.offer_sdp) return;
    if (connectionPhase === "connecting" || connectionPhase === "connected")
      return;

    void connectToLiveSession(liveSession);
  }, [liveSession, connectionPhase, connectToLiveSession]);

  // home_id 없거나 아직 감시 전이면 렌더링 안함
  if (!homeId || connectionPhase === "idle") return null;

  return (
    <section className={styles.section} aria-label="라이브 카메라">
      <div className={styles.titleRow}>
        <h2 className={styles.title}>📡 라이브 카메라</h2>
        {connectionPhase === "connected" ? (
          <span className={styles.livePill}>● LIVE</span>
        ) : connectionPhase === "connecting" ? (
          <span className={styles.connectingPill}>연결 중…</span>
        ) : (
          <span className={styles.offlinePill}>대기 중</span>
        )}
      </div>

      <div className={styles.videoContainer}>
        <video
          ref={remoteVideoRef}
          className={styles.remoteVideo}
          autoPlay
          playsInline
          muted
          aria-label="라이브 카메라 화면"
        />
        {connectionPhase !== "connected" ? (
          <div className={styles.videoOverlay} aria-hidden>
            {connectionPhase === "watching_for_broadcast" ? (
              <>
                <span className={styles.overlayIcon}>📱</span>
                <span className={styles.overlayText}>
                  남는 폰에서 방송을 시작하면 자동으로 연결돼요
                </span>
                <a
                  href="/camera/broadcast"
                  className={styles.broadcastLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  방송 시작하러 가기 →
                </a>
              </>
            ) : connectionPhase === "connecting" ? (
              <>
                <span className={styles.overlayIcon}>⏳</span>
                <span className={styles.overlayText}>연결 중…</span>
              </>
            ) : connectionPhase === "error" ? (
              <>
                <span className={styles.overlayIcon}>⚠️</span>
                <span className={styles.overlayText}>
                  {errorMessage ?? "연결에 실패했어요."}
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
