"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Baby,
  Camera,
  Droplets,
  Eye,
  Link2,
  Pill,
  Radio,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { playPopSound } from "@/lib/sound/playPopSound";
import { CATVISOR_SOUND_ENABLED_STORAGE_KEY } from "@/lib/sound/soundPreferenceStorageKey";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  decodeSdpFromDatabaseColumn,
  encodePlainSdpForDatabaseColumn,
} from "@/lib/webrtc/sessionDescriptionPayload";
import styles from "./CameraBroadcastClient.module.css";

/** STUN만 사용 (무료 공개 서버). 첫 항목은 Google 기본 STUN. */
const WEBRTC_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

/**
 * 마지막 관리 타임스탬프 → '0분 전' / 'n분 전' / 'n시간 전' / 'n일 전' 변환.
 * CameraLiveViewer / CatvisorHomeDashboard 와 동일한 규칙을 사용합니다.
 */
function formatEnvElapsed(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "기록 없음";
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  if (diffMs < 0) return "0분 전";
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "0분 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${Math.floor(diffHours / 24)}일 전`;
}

const DEVICE_TOKEN_STORAGE_KEY = "catvisor_device_token";
const DEVICE_ID_STORAGE_KEY = "catvisor_device_id";
const DEVICE_NAME_STORAGE_KEY = "catvisor_device_name";
const DEVICE_HOME_ID_STORAGE_KEY = "catvisor_home_id";

function readDeviceCredentialsFromBrowserStorage(): {
  token: string | null;
  name: string | null;
} {
  let token =
    typeof window !== "undefined"
      ? window.localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY)
      : null;
  let name =
    typeof window !== "undefined"
      ? window.localStorage.getItem(DEVICE_NAME_STORAGE_KEY)
      : null;

  if (!token && typeof window !== "undefined") {
    token = window.sessionStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
    name = window.sessionStorage.getItem(DEVICE_NAME_STORAGE_KEY);
    if (token) {
      try {
        window.localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, token);
        if (name) {
          window.localStorage.setItem(DEVICE_NAME_STORAGE_KEY, name);
        }
        const id = window.sessionStorage.getItem(DEVICE_ID_STORAGE_KEY);
        const home = window.sessionStorage.getItem(DEVICE_HOME_ID_STORAGE_KEY);
        if (id) window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
        if (home) window.localStorage.setItem(DEVICE_HOME_ID_STORAGE_KEY, home);
      } catch {
        // 인앱 브라우저 storage 동기화 실패
      }
    }
  }

  return { token, name };
}

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
 * localStorage의 device_token으로 인증 → SECURITY DEFINER RPC 로 세션 생성 →
 * anon 은 SELECT RLS 로 행을 직접 읽지 못하므로 get_broadcaster_signaling_state 폴링으로 answer/ICE 수신.
 */
export function CameraBroadcastClient() {
  const supabase = createSupabaseBrowserClient();

  const [broadcastPhase, setBroadcastPhase] = useState<BroadcastPhase>("loading");
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [peerConnectionState, setPeerConnectionState] =
    useState<RTCPeerConnectionState>("new");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [careLogPending, setCareLogPending] = useState(false);
  const [careLogMessage, setCareLogMessage] = useState<string | null>(null);

  // 환경 관리 경과 시간 추적 — 초기값은 RPC 조회 후 설정
  const [lastWaterChangeAt, setLastWaterChangeAt] = useState<string | null>(null);
  const [lastLitterCleanAt, setLastLitterCleanAt] = useState<string | null>(null);
  const [elapsedTick, setElapsedTick] = useState(0);
  // 홈 화면 Broadcast 채널 연동에 필요한 home_id (RPC 응답에서 추출)
  const broadcastHomeIdRef = useRef<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isCleaningUpRef = useRef(false);
  const signalingPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appliedViewerIceKeysRef = useRef<Set<string>>(new Set());
  const autostartBroadcastSequenceStartedRef = useRef(false);

  useEffect(() => {
    const { token: storedToken, name: storedName } =
      readDeviceCredentialsFromBrowserStorage();

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CATVISOR_SOUND_ENABLED_STORAGE_KEY);
      if (raw === "0") setIsSoundEnabled(false);
      if (raw === "1") setIsSoundEnabled(true);
    } catch {
      // storage 사용 불가
    }
  }, []);

  const toggleSoundEnabled = useCallback(() => {
    setIsSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(
          CATVISOR_SOUND_ENABLED_STORAGE_KEY,
          next ? "1" : "0",
        );
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const recordCareLogFromBroadcastDevice = useCallback(
    async ({
      careKind,
    }: {
      careKind: "meal" | "water_change" | "litter_clean" | "medicine";
    }) => {
      if (!deviceIdentity) return;
      if (isSoundEnabled) playPopSound();
      setCareLogMessage(null);
      setCareLogPending(true);
      try {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase.rpc(
          "record_device_cat_care_log",
          {
            p_device_token: deviceIdentity.deviceToken,
            p_care_kind: careKind,
            p_camera_session_id: activeSessionId,
          },
        );
        if (error) {
          setCareLogMessage(error.message);
          return;
        }
        const payload = data as { success?: boolean; error?: string } | null;
        if (payload?.error === "invalid_device") {
          setCareLogMessage("기기를 다시 연결해 주세요.");
          return;
        }
        if (payload?.error) {
          setCareLogMessage("기록을 저장하지 못했어요.");
          return;
        }

        // 환경 관리 항목은 경과 시간 즉시 반영
        if (careKind === "water_change") setLastWaterChangeAt(nowIso);
        if (careKind === "litter_clean") setLastLitterCleanAt(nowIso);

        // 홈 화면 실시간 업데이트: Broadcast 채널로 케어 이벤트 전파
        const homeIdForBroadcast = broadcastHomeIdRef.current;
        if (homeIdForBroadcast && (careKind === "water_change" || careKind === "litter_clean")) {
          void supabase
            .channel(`env_care_broadcast_${homeIdForBroadcast}`)
            .send({
              type: "broadcast",
              event: "env_care_updated",
              payload: { care_kind: careKind, recorded_at: nowIso },
            });
        }

        const labelByKind: Record<typeof careKind, string> = {
          meal: "맘마 먹기",
          water_change: "식수 교체",
          litter_clean: "화장실 청소",
          medicine: "약 먹기",
        };
        setCareLogMessage(`「${labelByKind[careKind]}」 기록했어요! (0분 전)`);
        window.setTimeout(() => setCareLogMessage(null), 2200);
      } finally {
        setCareLogPending(false);
      }
    },
    [activeSessionId, deviceIdentity, isSoundEnabled, supabase],
  );

  // 1분 주기로 경과 시간 레이블 강제 갱신
  useEffect(() => {
    const id = setInterval(() => setElapsedTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // 기기 identity 확보 후: 홈의 최신 식수교체/화장실청소 타임스탬프 + home_id 초기 조회
  useEffect(() => {
    if (!deviceIdentity) return;
    async function fetchInitialEnvTimestamps() {
      const { data } = await supabase.rpc("get_device_home_env_timestamps", {
        p_device_token: deviceIdentity!.deviceToken,
      });
      const payload = data as {
        home_id?: string | null;
        last_water_change_at?: string | null;
        last_litter_clean_at?: string | null;
        error?: string;
      } | null;
      if (!payload || payload.error) return;
      if (payload.home_id) broadcastHomeIdRef.current = payload.home_id;
      if (payload.last_water_change_at) setLastWaterChangeAt(payload.last_water_change_at);
      if (payload.last_litter_clean_at) setLastLitterCleanAt(payload.last_litter_clean_at);
    }
    void fetchInitialEnvTimestamps();
  }, [deviceIdentity, supabase]);

  /**
   * 페어링 직후 `?autostart=1` 로 들어온 경우: 카메라 권한 → offer 생성 → `start_device_broadcast` 까지 한 번에 이어 줍니다.
   * (Strict Mode 등에서 중복 실행을 막기 위해 ref 로 1회만 시도)
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!deviceIdentity || broadcastPhase !== "idle") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("autostart") !== "1") return;
    if (autostartBroadcastSequenceStartedRef.current) return;
    autostartBroadcastSequenceStartedRef.current = true;

    void (async () => {
      try {
        await acquireCamera();
        if (!localStreamRef.current) {
          autostartBroadcastSequenceStartedRef.current = false;
          return;
        }
        await startBroadcast();
      } catch (autostartErr) {
        console.error("[broadcast] autostart 시퀀스 오류", autostartErr);
        autostartBroadcastSequenceStartedRef.current = false;
      } finally {
        window.history.replaceState({}, "", "/camera/broadcast");
      }
    })();
    // acquireCamera / startBroadcast 는 동일 컴포넌트 내 선언이며, 의도적으로 초기 idle 진입 시점에만 실행합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autostart 는 deviceIdentity + idle 진입 1회만
  }, [deviceIdentity, broadcastPhase]);

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
      sessionIdRef.current = null;

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

      /** setLocalDescription 직후 ICE가 뜨는데 session_id 는 RPC 이후에만 생기므로, 그 전 후보는 메모리에 쌓았다가 일괄 전송합니다. */
      const iceCandidatesWaitingForSessionId: RTCIceCandidateInit[] = [];

      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return;
        const candidatePayload = candidate.toJSON();
        if (!sessionIdRef.current) {
          iceCandidatesWaitingForSessionId.push(candidatePayload);
          return;
        }
        void supabase.rpc("add_device_ice_candidate", {
          input_device_token: deviceIdentity.deviceToken,
          input_session_id: sessionIdRef.current,
          input_candidate: candidatePayload,
        });
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const committedLocalDescription = pc.localDescription;
      if (!committedLocalDescription?.sdp) {
        throw new Error("로컬 SDP(offer)를 확정할 수 없어요.");
      }

      const { data: broadcastResult, error: broadcastError } = await supabase.rpc(
        "start_device_broadcast",
        {
          input_device_token: deviceIdentity.deviceToken,
          /** DB offer_sdp 컬럼에는 v= 로 시작하는 SDP 텍스트만 저장 (JSON 객체 문자열 금지) */
          input_offer_sdp: encodePlainSdpForDatabaseColumn(
            committedLocalDescription.sdp,
          ),
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

      for (const queuedCandidate of iceCandidatesWaitingForSessionId) {
        await supabase.rpc("add_device_ice_candidate", {
          input_device_token: deviceIdentity.deviceToken,
          input_session_id: sessionId,
          input_candidate: queuedCandidate,
        });
      }
      iceCandidatesWaitingForSessionId.length = 0;

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
              const answerInit = decodeSdpFromDatabaseColumn(answerSdpRaw, "answer");
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
          <div className={styles.unpairedIcon} aria-hidden>
            <Link2 size={28} color="#1e8f83" strokeWidth={1.75} />
          </div>
          <h2 className={styles.unpairedTitle}>먼저 페어링이 필요해요</h2>
          <p className={styles.unpairedDesc}>
            대시보드에서 <strong>카메라 추가</strong>를 눌러<br />
            4자리 코드를 받은 뒤 연결해 주세요.
          </p>
          <a href="/camera/pair" className={styles.btnPairLink}>
            <Camera size={18} strokeWidth={2} aria-hidden />
            4자리 코드 입력하러 가기
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
            <span className={styles.placeholderIcon}>
              <Camera size={64} color="rgba(79,209,197,0.35)" strokeWidth={1.25} />
            </span>
          </div>
        ) : null}
        {peerConnectionState === "connected" && (
          <div className={styles.viewerBadge} aria-live="polite">
            <Eye size={14} strokeWidth={2} aria-hidden /> 시청 중
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
            <Camera size={18} strokeWidth={2} aria-hidden />
            카메라 켜기
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
            <Radio size={18} strokeWidth={2} aria-hidden />
            방송 시작
          </button>
        ) : null}

        {broadcastPhase === "connecting" || broadcastPhase === "live" ? (
          <div className={styles.liveControls}>
            <p className={styles.statusText}>
              {peerConnectionState === "connected"
                ? `● ${deviceIdentity?.deviceName ?? "카메라"} 방송 중`
                : `○ 시청자 기다리는 중… (${peerStatusLabel[peerConnectionState]})`}
            </p>
            <div className={styles.broadcastCareBar}>
              <div className={styles.broadcastCareHeader}>
                <span className={styles.broadcastCareTitle}>빠른 케어 기록</span>
                <button
                  type="button"
                  onClick={toggleSoundEnabled}
                  className={styles.broadcastSoundBtn}
                  aria-pressed={isSoundEnabled}
                  aria-label={isSoundEnabled ? "효과음 끄기" : "효과음 켜기"}
                >
                  {isSoundEnabled ? (
                    <Volume2 size={16} strokeWidth={2} aria-hidden />
                  ) : (
                    <VolumeX size={16} strokeWidth={2} aria-hidden />
                  )}
                </button>
              </div>
              <div className={styles.broadcastCareRow}>
                <button
                  type="button"
                  disabled={careLogPending}
                  className={`${styles.broadcastCareBtn} ${styles.broadcastCareBtnMint}`}
                  onClick={() =>
                    void recordCareLogFromBroadcastDevice({ careKind: "meal" })
                  }
                >
                  <Baby size={14} strokeWidth={2} aria-hidden />
                  맘마 🍼
                </button>
                <button
                  type="button"
                  disabled={careLogPending}
                  className={`${styles.broadcastCareBtn} ${styles.broadcastCareBtnSky} ${styles.broadcastCareBtnEnv}`}
                  onClick={() =>
                    void recordCareLogFromBroadcastDevice({ careKind: "water_change" })
                  }
                >
                  <Droplets size={14} strokeWidth={2} aria-hidden />
                  <span className={styles.broadcastCareBtnLabel}>식수 교체 💧</span>
                  <span className={styles.broadcastCareBtnEta}>
                    {formatEnvElapsed(lastWaterChangeAt)}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={careLogPending}
                  className={`${styles.broadcastCareBtn} ${styles.broadcastCareBtnPeach} ${styles.broadcastCareBtnEnv}`}
                  onClick={() =>
                    void recordCareLogFromBroadcastDevice({
                      careKind: "litter_clean",
                    })
                  }
                >
                  <Trash2 size={14} strokeWidth={2} aria-hidden />
                  <span className={styles.broadcastCareBtnLabel}>화장실 청소 🚽</span>
                  <span className={styles.broadcastCareBtnEta}>
                    {formatEnvElapsed(lastLitterCleanAt)}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={careLogPending}
                  className={`${styles.broadcastCareBtn} ${styles.broadcastCareBtnPurple}`}
                  onClick={() =>
                    void recordCareLogFromBroadcastDevice({
                      careKind: "medicine",
                    })
                  }
                >
                  <Pill size={14} strokeWidth={2} aria-hidden />
                  약 💊
                </button>
              </div>
              {careLogMessage ? (
                <p
                  className={styles.broadcastCareFeedback}
                  role="status"
                  aria-live="polite"
                >
                  {careLogMessage}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.btnStop}
              onClick={() => void stopBroadcast()}
            >
              <Square size={16} strokeWidth={2} aria-hidden />
              방송 종료
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
