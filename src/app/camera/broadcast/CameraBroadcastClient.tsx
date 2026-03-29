"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  decodeSessionDescriptionPayload,
  encodeSessionDescriptionForDatabase,
} from "@/lib/webrtc/sessionDescriptionPayload";
import styles from "./CameraBroadcastClient.module.css";

const WEBRTC_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

const DEVICE_TOKEN_STORAGE_KEY = "catvisor_device_token";
const DEVICE_NAME_STORAGE_KEY = "catvisor_device_name";

type BroadcastPhase =
  | "loading"
  | "unpaired"
  | "idle"
  | "acquiring"
  | "ready"
  | "connecting"
  | "live"
  | "error";

type DeviceIdentity = {
  deviceToken: string;
  deviceName: string;
};

/**
 * 남는 폰에서 실행하는 WebRTC 방송 클라이언트.
 * localStorage의 device_token으로 인증 → SECURITY DEFINER 로 세션 생성 →
 * (anon 은 RLS 로 DB 행을 볼 수 없으므로) get_broadcaster_signaling_state 폴링으로 answer/ICE 수신.
 */
export function CameraBroadcastClient() {
  const supabase = createSupabaseBrowserClient();

  const [broadcastPhase, setBroadcastPhase] = useState<BroadcastPhase>("loading");
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [peerConnectionState, setPeerConnectionState] =
    useState<RTCPeerConnectionState>("new");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isCleaningUpRef = useRef(false);
  const signalingPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appliedViewerIceKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const storedToken = localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
    const storedName = localStorage.getItem(DEVICE_NAME_STORAGE_KEY);

    if (storedToken) {
      setDeviceIdentity({
        deviceToken: storedToken,
        deviceName: storedName ?? "카메라",
      });
      setBroadcastPhase("idle");
    } else {
      setBroadcastPhase("unpaired");
    }
  }, []);

  /**
   * WebRTC·폴링만 정리합니다. DB 의 camera_sessions 는 건드리지 않습니다.
   * (언마운트·React Strict Mode 에서 stop_device_broadcast 를 호출하면
   * 세션이 즉시 idle 로 바뀌어 관리자 측에서 live 행이 사라진 것처럼 보입니다.)
   */
  const cleanupPeerResourcesOnly = useCallback(
    async (keepCameraStream: boolean) => {
      if (signalingPollIntervalRef.current) {
        clearInterval(signalingPollIntervalRef.current);
        signalingPollIntervalRef.current = null;
      }
      appliedViewerIceKeysRef.current = new Set();

      if (peerConnectionRef.current) {
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      if (!keepCameraStream && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = null;
        }
      }
    },
    [supabase],
  );

  /** 방송 종료 버튼 — DB 세션을 idle 로 전환합니다. */
  const cleanupSessionAndStopOnServer = useCallback(
    async (keepCameraStream: boolean) => {
      if (isCleaningUpRef.current) return;
      isCleaningUpRef.current = true;

      try {
        await cleanupPeerResourcesOnly(keepCameraStream);

        if (deviceIdentity && sessionIdRef.current) {
          await supabase.rpc("stop_device_broadcast", {
            input_device_token: deviceIdentity.deviceToken,
          });
        }
        sessionIdRef.current = null;
        setActiveSessionId(null);
      } finally {
        isCleaningUpRef.current = false;
      }
    },
    [supabase, deviceIdentity, cleanupPeerResourcesOnly],
  );

  useEffect(() => {
    return () => {
      void cleanupPeerResourcesOnly(false);
    };
  }, [cleanupPeerResourcesOnly]);

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
    if (!localStreamRef.current || !deviceIdentity) return;
    setBroadcastPhase("connecting");
    setErrorMessage(null);

    try {
      const pc = new RTCPeerConnection({ iceServers: WEBRTC_ICE_SERVERS });
      peerConnectionRef.current = pc;

      pc.onconnectionstatechange = () => {
        setPeerConnectionState(pc.connectionState);
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

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const { data: broadcastResult, error: broadcastError } = await supabase.rpc(
        "start_device_broadcast",
        {
          input_device_token: deviceIdentity.deviceToken,
          input_offer_sdp: encodeSessionDescriptionForDatabase(offer),
        },
      );

      if (broadcastError || !broadcastResult || broadcastResult.error) {
        throw new Error(
          broadcastResult?.error ?? broadcastError?.message ?? "방송 세션 생성 실패",
        );
      }

      const sessionId = broadcastResult.session_id as string;
      sessionIdRef.current = sessionId;
      setActiveSessionId(sessionId);

      pc.onicecandidate = async ({ candidate }) => {
        if (candidate && sessionIdRef.current) {
          await supabase.rpc("add_device_ice_candidate", {
            input_device_token: deviceIdentity.deviceToken,
            input_session_id: sessionIdRef.current,
            input_candidate: candidate.toJSON(),
          });
        }
      };

      const pollIntervalMs = 400;
      signalingPollIntervalRef.current = setInterval(() => {
        void (async () => {
          const currentPc = peerConnectionRef.current;
          const currentSessionId = sessionIdRef.current;
          if (!currentPc || !currentSessionId) return;

          const { data: signalingPayload, error: signalingError } = await supabase.rpc(
            "get_broadcaster_signaling_state",
            {
              p_device_token: deviceIdentity.deviceToken,
              p_session_id: currentSessionId,
            },
          );

          if (signalingError || !signalingPayload || signalingPayload.error) {
            return;
          }

          const answerSdpRaw = signalingPayload.answer_sdp as string | null | undefined;
          if (answerSdpRaw && currentPc.remoteDescription === null) {
            try {
              const answerInit = decodeSessionDescriptionPayload(answerSdpRaw);
              await currentPc.setRemoteDescription(new RTCSessionDescription(answerInit));
              setBroadcastPhase("live");
            } catch (answerErr) {
              console.error("[broadcaster] setRemoteDescription 오류", answerErr);
            }
          }

          const viewerIceList = signalingPayload.viewer_ice as
            | RTCIceCandidateInit[]
            | null
            | undefined;
          if (!viewerIceList || !Array.isArray(viewerIceList)) return;

          for (const rawCandidate of viewerIceList) {
            const dedupeKey = JSON.stringify(rawCandidate);
            if (appliedViewerIceKeysRef.current.has(dedupeKey)) continue;
            appliedViewerIceKeysRef.current.add(dedupeKey);
            if (!currentPc.remoteDescription) continue;
            try {
              await currentPc.addIceCandidate(new RTCIceCandidate(rawCandidate));
            } catch {
              // 중복 후보 등은 무시
            }
          }
        })();
      }, pollIntervalMs);

      setBroadcastPhase("live");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "방송 시작에 실패했어요.";
      setErrorMessage(message);
      setBroadcastPhase("error");
      await cleanupSessionAndStopOnServer(true);
    }
  }

  async function stopBroadcast() {
    await cleanupSessionAndStopOnServer(true);
    setBroadcastPhase("ready");
    setPeerConnectionState("new");
  }

  const peerStatusLabel: Record<RTCPeerConnectionState, string> = {
    new: "대기 중",
    connecting: "연결 중…",
    connected: "연결됨 ✅",
    disconnected: "연결 끊김",
    failed: "연결 실패",
    closed: "종료됨",
  };

  if (broadcastPhase === "loading") {
    return (
      <div className={styles.page}>
        <div className={styles.loadingSpinner} aria-label="로딩 중" />
      </div>
    );
  }

  if (broadcastPhase === "unpaired") {
    return (
      <div className={styles.page}>
        <div className={styles.unpairedCard}>
          <span className={styles.unpairedIcon} aria-hidden>🔗</span>
          <h2 className={styles.unpairedTitle}>먼저 페어링이 필요해요</h2>
          <p className={styles.unpairedDesc}>
            대시보드에서 <strong>카메라 추가</strong>를 눌러<br />
            4자리 코드를 받은 뒤 연결해 주세요.
          </p>
          <a href="/camera/pair" className={styles.btnPairLink}>
            📷 4자리 코드 입력하러 가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.appName}>다보냥 · 방송국</span>
          <span className={styles.broadcasterLabel}>
            {deviceIdentity?.deviceName ?? "카메라"}
          </span>
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
          <p className={styles.errorText} role="alert">{errorMessage}</p>
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
                ? `🟢 ${deviceIdentity?.deviceName ?? "카메라"} 방송 중`
                : `📡 시청자 기다리는 중… (${peerStatusLabel[peerConnectionState]})`}
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
        <p className={styles.sessionHint}>세션 {activeSessionId.slice(0, 8)}</p>
      ) : null}
    </div>
  );
}
