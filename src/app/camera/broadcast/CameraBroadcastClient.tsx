"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import styles from "./CameraBroadcastClient.module.css";

const WEBRTC_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

type BroadcastPhase =
  | "idle"
  | "acquiring"
  | "ready"
  | "connecting"
  | "live"
  | "error";

type CameraBroadcastClientProps = {
  userId: string;
  homeId: string;
  broadcasterDisplayName: string;
};

/**
 * 남는 폰에서 실행하는 WebRTC 방송 클라이언트.
 * getUserMedia → RTCPeerConnection(offerer) → Supabase Realtime 시그널링.
 */
export function CameraBroadcastClient({
  userId,
  homeId,
  broadcasterDisplayName,
}: CameraBroadcastClientProps) {
  const [broadcastPhase, setBroadcastPhase] = useState<BroadcastPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [peerConnectionState, setPeerConnectionState] =
    useState<RTCPeerConnectionState>("new");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingChannelRef = useRef<RealtimeChannel | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isCleaningUpRef = useRef(false);

  const supabase = createSupabaseBrowserClient();

  const cleanupSession = useCallback(
    async (keepCameraStream: boolean) => {
      if (isCleaningUpRef.current) return;
      isCleaningUpRef.current = true;

      try {
        if (peerConnectionRef.current) {
          peerConnectionRef.current.onconnectionstatechange = null;
          peerConnectionRef.current.onicecandidate = null;
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }

        if (signalingChannelRef.current) {
          await supabase.removeChannel(signalingChannelRef.current);
          signalingChannelRef.current = null;
        }

        if (sessionIdRef.current) {
          await supabase
            .from("camera_sessions")
            .update({ status: "idle" })
            .eq("id", sessionIdRef.current);
          sessionIdRef.current = null;
          setActiveSessionId(null);
        }

        if (!keepCameraStream && localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
          localStreamRef.current = null;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
          }
        }
      } finally {
        isCleaningUpRef.current = false;
      }
    },
    [supabase],
  );

  useEffect(() => {
    return () => {
      void cleanupSession(false);
    };
  }, [cleanupSession]);

  async function acquireCamera() {
    setBroadcastPhase("acquiring");
    setErrorMessage(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("이 브라우저는 카메라를 지원하지 않아요.");
      setBroadcastPhase("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setBroadcastPhase("ready");
    } catch (err) {
      const cameraError =
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "카메라 권한이 거부됐어요. 브라우저 주소창 옆 자물쇠 아이콘을 눌러 허용해 주세요."
            : err.name === "NotFoundError"
              ? "카메라 장치를 찾을 수 없어요."
              : err.message
          : "카메라를 시작할 수 없어요.";

      setErrorMessage(cameraError);
      setBroadcastPhase("error");
    }
  }

  async function startBroadcast() {
    if (!localStreamRef.current) return;
    setBroadcastPhase("connecting");
    setErrorMessage(null);

    try {
      const { data: session, error: sessionError } = await supabase
        .from("camera_sessions")
        .insert({
          home_id: homeId,
          broadcaster_user_id: userId,
          status: "live",
        })
        .select("id")
        .single();

      if (sessionError || !session) {
        throw new Error(sessionError?.message ?? "세션을 생성할 수 없어요.");
      }

      sessionIdRef.current = session.id;
      setActiveSessionId(session.id);

      const pc = new RTCPeerConnection({ iceServers: WEBRTC_ICE_SERVERS });
      peerConnectionRef.current = pc;

      pc.onconnectionstatechange = () => {
        setPeerConnectionState(pc.connectionState);
        if (pc.connectionState === "connected") {
          setBroadcastPhase("live");
        }
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          setErrorMessage("연결이 끊겼어요. 방송을 다시 시작해 주세요.");
          setBroadcastPhase("error");
        }
      };

      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      const channel = supabase.channel(`broadcast-${session.id}`);

      channel
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "camera_sessions",
            filter: `id=eq.${session.id}`,
          },
          async (payload) => {
            const updated = payload.new as {
              answer_sdp?: string | null;
            };
            if (updated.answer_sdp && pc.remoteDescription === null) {
              try {
                await pc.setRemoteDescription(
                  new RTCSessionDescription(JSON.parse(updated.answer_sdp)),
                );
                const { data: bufferedCandidates } = await supabase
                  .from("ice_candidates")
                  .select("candidate")
                  .eq("session_id", session.id)
                  .eq("sender", "viewer");

                for (const row of bufferedCandidates ?? []) {
                  try {
                    await pc.addIceCandidate(
                      new RTCIceCandidate(
                        row.candidate as RTCIceCandidateInit,
                      ),
                    );
                  } catch {
                    // 오래된 후보자는 무시
                  }
                }
              } catch (e) {
                console.error("[broadcaster] setRemoteDescription 오류", e);
              }
            }
          },
        )
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
            if (row.sender === "viewer" && pc.remoteDescription) {
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
        if (candidate && sessionIdRef.current) {
          await supabase.from("ice_candidates").insert({
            session_id: sessionIdRef.current,
            sender: "broadcaster",
            candidate: candidate.toJSON(),
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await supabase
        .from("camera_sessions")
        .update({ offer_sdp: JSON.stringify(offer) })
        .eq("id", session.id);

      setBroadcastPhase("live");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "방송 시작에 실패했어요.";
      setErrorMessage(message);
      setBroadcastPhase("error");
      await cleanupSession(true);
    }
  }

  async function stopBroadcast() {
    await cleanupSession(true);
    setBroadcastPhase("ready");
    setPeerConnectionState("new");
  }

  const peerStatusLabel = {
    new: "대기 중",
    connecting: "연결 중…",
    connected: "연결됨 ✅",
    disconnected: "연결 끊김",
    failed: "연결 실패",
    closed: "종료됨",
  }[peerConnectionState];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.appName}>다보냥 · 방송국</span>
          <span className={styles.broadcasterLabel}>{broadcasterDisplayName}</span>
        </div>
        {(broadcastPhase === "live" || broadcastPhase === "connecting") && (
          <span className={styles.liveBadge} aria-live="polite">
            {broadcastPhase === "live" && peerConnectionState === "connected"
              ? "● LIVE"
              : "○ 대기"}
          </span>
        )}
      </header>

      <div className={styles.videoWrap}>
        <video
          ref={localVideoRef}
          className={styles.localVideo}
          autoPlay
          muted
          playsInline
          aria-label="카메라 미리보기"
        />
        {broadcastPhase === "idle" || broadcastPhase === "acquiring" ? (
          <div className={styles.videoPlaceholder} aria-hidden>
            <span className={styles.placeholderIcon}>📷</span>
          </div>
        ) : null}
        {peerConnectionState === "connected" && (
          <div className={styles.viewerBadge} aria-live="polite">
            👀 시청 중
          </div>
        )}
      </div>

      <div className={styles.controls}>
        {errorMessage ? (
          <p className={styles.errorText} role="alert">
            {errorMessage}
          </p>
        ) : null}

        {broadcastPhase === "idle" ? (
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void acquireCamera()}
          >
            📷 카메라 켜기
          </button>
        ) : null}

        {broadcastPhase === "acquiring" ? (
          <p className={styles.statusText}>카메라 권한을 요청 중이에요…</p>
        ) : null}

        {broadcastPhase === "ready" ? (
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void startBroadcast()}
          >
            🔴 방송 시작
          </button>
        ) : null}

        {broadcastPhase === "connecting" || broadcastPhase === "live" ? (
          <div className={styles.liveControls}>
            <p className={styles.statusText}>
              {peerConnectionState === "connected"
                ? `🟢 ${broadcasterDisplayName} 방송 중`
                : `📡 시청자 기다리는 중… (${peerStatusLabel})`}
            </p>
            <button
              type="button"
              className={styles.btnStop}
              onClick={() => void stopBroadcast()}
            >
              ⏹ 방송 종료
            </button>
          </div>
        ) : null}

        {broadcastPhase === "error" ? (
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              setErrorMessage(null);
              setBroadcastPhase(localStreamRef.current ? "ready" : "idle");
            }}
          >
            🔄 다시 시작
          </button>
        ) : null}
      </div>

      {activeSessionId ? (
        <p className={styles.sessionHint}>
          세션 {activeSessionId.slice(0, 8)}
        </p>
      ) : null}
    </div>
  );
}
