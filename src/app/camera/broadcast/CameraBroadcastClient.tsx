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
  SwitchCamera,
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
import {
  normalizeBroadcasterSignalingRpcPayload,
  parseViewerIceCandidatesFromRpcPayload,
} from "@/lib/webrtc/broadcasterSignalingRpcPayload";
import { resolveWebRtcPeerConnectionConfiguration } from "@/lib/webrtc/getWebRtcIceServersForPeerConnection";
import { buildWebRtcNetworkFailureUserMessage } from "@/lib/webrtc/buildWebRtcNetworkFailureUserMessage";
import styles from "./CameraBroadcastClient.module.css";

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
/* 코드 버전 — 브라우저 캐시 문제 진단용 */
const BROADCAST_CODE_VERSION = "v3-signaling-timeout";

export function CameraBroadcastClient() {
  console.log(`[broadcaster] 코드 버전: ${BROADCAST_CODE_VERSION}`);
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
  /* 전면/후면 카메라 전환 — 후면(environment)이 기본값 (화소·광각 우위) */
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // 환경 관리 경과 시간 추적 — 초기값은 RPC 조회 후 설정
  const [lastWaterChangeAt, setLastWaterChangeAt] = useState<string | null>(null);
  const [lastLitterCleanAt, setLastLitterCleanAt] = useState<string | null>(null);
  const [elapsedTick, setElapsedTick] = useState(0);
  // 홈 화면 Broadcast 채널 연동에 필요한 home_id (RPC 응답에서 추출)
  const [broadcastHomeId, setBroadcastHomeId] = useState<string | null>(null);
  // 구독 완료된 Broadcast 채널 ref — send() 호출 시 재사용
  const envBroadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  /** viewer 로부터 수신한 오디오를 재생하는 숨겨진 audio 엘리먼트 */
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isCleaningUpRef = useRef(false);
  const signalingPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appliedViewerIceKeysRef = useRef<Set<string>>(new Set());
  /** 세션 ID 도착 전 수집된 ICE 캔디데이트 큐 (함수 스코프 → ref 이동으로 소실 방지) */
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  /** viewer answer 알림 채널 ref — cleanup 시 정리 */
  const answerReadyChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const autostartBroadcastSequenceStartedRef = useRef(false);
  /** disconnected 상태 유예 타이머 — 모바일 네트워크 일시 끊김 대응 */
  const disconnectedGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 자동 재연결 횟수 카운터 — 5회 초과 시 에러 전환 */
  const autoReconnectCountRef = useRef(0);
  /** 자동 재연결 타이머 ref — cleanup 시 정리 */
  const autoReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 화면 꺼짐 방지 Wake Lock */
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  /** 카메라 켜기·autostart 가 동시에 getUserMedia 를 호출해 NotReadable 이 나는 것 방지 */
  const acquireCameraInFlightRef = useRef(false);
  /** answer 미수신 시 세션 재생성 타이머 — 폴링 실패 대비 안전망 */
  const signalingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /* 방송 중 화면 꺼짐 방지 (Wake Lock API) — 항상 켜진 카메라용 */
  useEffect(() => {
    if (broadcastPhase !== "live" && broadcastPhase !== "connecting") {
      /* 방송 중이 아니면 Wake Lock 해제 */
      if (wakeLockRef.current) {
        void wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      return;
    }
    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
          console.log("[broadcaster] Wake Lock 활성화 — 화면 꺼짐 방지");
        }
      } catch {
        /* Wake Lock 미지원 또는 권한 거부 — 무시 */
      }
    }
    void requestWakeLock();
    /* 탭 다시 활성화 시 Wake Lock 재요청 (브라우저가 자동 해제하므로) */
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        void requestWakeLock();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        void wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [broadcastPhase]);

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

        // 홈 화면 실시간 업데이트: 미리 구독된 Broadcast 채널로 케어 이벤트 전파
        if (
          envBroadcastChannelRef.current &&
          (careKind === "water_change" || careKind === "litter_clean")
        ) {
          void envBroadcastChannelRef.current.send({
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
      if (payload.home_id) setBroadcastHomeId(payload.home_id);
      if (payload.last_water_change_at) setLastWaterChangeAt(payload.last_water_change_at);
      if (payload.last_litter_clean_at) setLastLitterCleanAt(payload.last_litter_clean_at);
    }
    void fetchInitialEnvTimestamps();
  }, [deviceIdentity, supabase]);

  // broadcastHomeId 확보 후 Broadcast 채널 구독 — send() 전 반드시 SUBSCRIBED 상태여야 함
  useEffect(() => {
    if (!broadcastHomeId) return;
    const channel = supabase.channel(`env_care_broadcast_${broadcastHomeId}`);
    envBroadcastChannelRef.current = channel;
    channel.subscribe();
    return () => {
      envBroadcastChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [broadcastHomeId, supabase]);

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
          /* 대시보드에 세션 종료 알림 */
          if (broadcastHomeId) {
            const stopCh = supabase.channel(`cam_session_broadcast_${broadcastHomeId}`);
            stopCh.subscribe((status) => {
              if (status === "SUBSCRIBED") {
                void stopCh.send({
                  type: "broadcast",
                  event: "session_stopped",
                  payload: {},
                });
                setTimeout(() => void supabase.removeChannel(stopCh), 2000);
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
    [supabase, deviceIdentity, cleanupPeerResourcesOnly, broadcastHomeId],
  );

  useEffect(() => {
    return () => {
      void cleanupPeerResourcesOnly(false);
    };
  }, [cleanupPeerResourcesOnly]);

  /* 탭 닫기/숨기기 시 세션 정리 — stale live 세션 방지 */
  useEffect(() => {
    function handleUnload() {
      const token = deviceIdentity?.deviceToken;
      if (!token || !sessionIdRef.current) return;
      /* sendBeacon 으로 비동기 종료 — 탭 닫힘 후에도 전송 보장 */
      const url = `${window.location.origin}/api/webrtc/stop-broadcast`;
      navigator.sendBeacon(url, JSON.stringify({ device_token: token }));
    }
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
    };
  }, [deviceIdentity]);

  /**
   * 이전에 연 미리보기/방송 트랙을 모두 stop — 같은 탭에서 두 번째 getUserMedia 가
   * NotReadableError(다른 앱이 사용 중처럼 보임) 나는 경우를 줄입니다.
   */
  function stopLocalPreviewTracksAndClearVideo() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }

  function delayMs(ms: number) {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function mapGetUserMediaErrorToUserMessage(err: unknown): string {
    const name = err instanceof DOMException ? err.name : (err as Error)?.name;
    if (name === "NotAllowedError") {
      return "카메라 권한이 거부됐어요. 브라우저 주소창 옆 자물쇠 아이콘을 눌러 허용해 주세요.";
    }
    if (name === "NotFoundError") {
      return "카메라 장치를 찾을 수 없어요.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return (
        "카메라가 다른 앱·브라우저 탭에서 사용 중이에요. " +
        "다른 탭의 다보냥/카메라를 닫거나, 인스타·줌 등 카메라를 끈 뒤 잠시 후 다시 눌러 주세요."
      );
    }
    if (name === "OverconstrainedError") {
      return "요청한 카메라 설정을 만족할 수 없어요. 잠시 후 다시 시도해 주세요.";
    }
    if (err instanceof Error && err.message) {
      return err.message;
    }
    return "카메라를 시작할 수 없어요.";
  }

  async function acquireCamera() {
    if (acquireCameraInFlightRef.current) {
      return;
    }
    acquireCameraInFlightRef.current = true;

    setBroadcastPhase("acquiring");
    setErrorMessage(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("이 브라우저는 카메라를 지원하지 않아요.");
      setBroadcastPhase("error");
      acquireCameraInFlightRef.current = false;
      return;
    }

    stopLocalPreviewTracksAndClearVideo();
    await delayMs(120);

    /* 후면 카메라 우선 — 화소·광각이 더 좋음 */
    const preferredConstraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: true,
    };
    const minimalConstraints: MediaStreamConstraints = {
      video: true,
      audio: true,
    };

    function mediaErrorName(err: unknown): string {
      if (err instanceof DOMException) return err.name;
      if (err instanceof Error) return err.name;
      return "";
    }

    async function getUserMediaWithNotReadableRetry(
      constraints: MediaStreamConstraints,
    ): Promise<MediaStream> {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        const name = mediaErrorName(err);
        if (name === "NotReadableError" || name === "TrackStartError") {
          stopLocalPreviewTracksAndClearVideo();
          await delayMs(280);
          return navigator.mediaDevices.getUserMedia(constraints);
        }
        throw err;
      }
    }

    try {
      let stream: MediaStream | null = null;
      /* 후면 카메라(preferred)를 먼저 시도, 실패 시 최소 제약으로 fallback */
      try {
        stream = await getUserMediaWithNotReadableRetry(preferredConstraints);
      } catch (preferredErr) {
        stream = await getUserMediaWithNotReadableRetry(minimalConstraints);
      }

      if (!stream) {
        throw new Error("카메라 스트림을 받지 못했어요.");
      }

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setBroadcastPhase("ready");
    } catch (err) {
      stopLocalPreviewTracksAndClearVideo();
      setErrorMessage(mapGetUserMediaErrorToUserMessage(err));
      setBroadcastPhase("error");
    } finally {
      acquireCameraInFlightRef.current = false;
    }
  }

  /**
   * 전면/후면 카메라 전환.
   * 현재 스트림을 정리하고 반대쪽 카메라로 재획득.
   * 방송 중이면 PeerConnection 트랙도 교체 (재연결 없이 핫스왑).
   */
  async function switchCamera() {
    const nextFacing = facingMode === "environment" ? "user" : "environment";

    /* 새 카메라를 먼저 획득 — 실패 시 기존 영상 유지 */
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false, /* 비디오만 교체, 오디오는 기존 트랙 유지 */
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      /* 새 카메라 성공 → 기존 비디오 트랙 정리 */
      if (localStreamRef.current) {
        for (const oldTrack of localStreamRef.current.getVideoTracks()) {
          oldTrack.stop();
          localStreamRef.current.removeTrack(oldTrack);
        }
        localStreamRef.current.addTrack(newVideoTrack);
      }

      /* PeerConnection이 있으면 트랙 핫스왑 (재연결 불필요) */
      const pc = peerConnectionRef.current;
      if (pc) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        }
      }

      /* 미리보기 비디오 업데이트 */
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      setFacingMode(nextFacing);
      console.log(`[broadcaster] 카메라 전환: ${nextFacing}`);
    } catch (err) {
      console.warn("[broadcaster] 카메라 전환 실패, 기존 카메라 유지:", err);
      /* 실패해도 기존 영상은 그대로 유지됨 (아직 stop() 안 했으니까) */
    }
  }

  /** relay-only 재시도 추적 — ICE 실패 시 1회 자동 재시도 */
  const broadcasterRelayRetryRef = useRef(false);

  async function startBroadcast(opts?: { forceRelay?: boolean }) {
    if (!deviceIdentity) return;

    /* 카메라 트랙이 죽었으면 (OS 가 회수 등) 재획득 */
    const hasLiveTrack = localStreamRef.current
      ?.getTracks()
      .some((t) => t.readyState === "live");
    if (!localStreamRef.current || !hasLiveTrack) {
      console.log("[broadcaster] 카메라 트랙 없음/만료 → 재획득");
      await acquireCamera();
      if (!localStreamRef.current) return;
    }

    setBroadcastPhase("connecting");
    setErrorMessage(null);

    const forceRelay = opts?.forceRelay ?? false;

    try {
      sessionIdRef.current = null;

      const { rtcConfiguration: rtcConfig, turnRelayConfigured } =
        await resolveWebRtcPeerConnectionConfiguration({ forceRelay });
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;

      /**
       * 자동 재연결 — 카메라를 끄지 않고 방송 재시작.
       * PeerConnection 만 정리하고 DB 세션은 건드리지 않는다.
       * start_device_broadcast RPC 가 기존 live 세션을 자동으로 idle 전환하므로
       * 클라이언트에서 stop 을 먼저 호출하면 오히려 뷰어가 세션 0건을 보는 갭이 생긴다.
       * 3회까지 3초 간격, 이후 30초 간격으로 무한 재시도 (항상 켜진 카메라).
       */
      function scheduleAutoReconnect() {
        autoReconnectCountRef.current += 1;
        const attempt = autoReconnectCountRef.current;
        /* 처음 3회는 빠르게(3초), 이후는 느리게(30초) — 배터리/네트워크 절약 */
        const delayMs = attempt <= 3 ? 3000 : 30_000;
        const delaySec = Math.round(delayMs / 1000);
        console.log(`[broadcaster] 자동 재연결 ${attempt}회 — ${delaySec}초 후 재시도`);
        setErrorMessage(`연결 끊김 — 재연결 대기 중... (${delaySec}초)`);
        setBroadcastPhase("connecting");
        autoReconnectTimerRef.current = setTimeout(() => {
          autoReconnectTimerRef.current = null;
          void (async () => {
            /* PeerConnection 만 정리 — DB 세션은 RPC 가 원자적으로 교체 */
            await cleanupPeerResourcesOnly(true);
            void startBroadcast();
          })();
        }, delayMs);
      }

      pc.onconnectionstatechange = () => {
        setPeerConnectionState(pc.connectionState);
        if (pc.connectionState === "connected") {
          broadcasterRelayRetryRef.current = false;
          autoReconnectCountRef.current = 0;
          if (disconnectedGraceTimerRef.current) {
            clearTimeout(disconnectedGraceTimerRef.current);
            disconnectedGraceTimerRef.current = null;
          }
          setErrorMessage(null);
          /* ★ 연결 성공 → 방송 상태를 "live"로 전환 */
          setBroadcastPhase("live");
          console.log("[broadcaster] connectionState: connected → live 전환");
          /* 연결 완료 → signaling 폴링·타임아웃 종료 */
          if (signalingPollIntervalRef.current) {
            clearInterval(signalingPollIntervalRef.current);
            signalingPollIntervalRef.current = null;
          }
          if (signalingTimeoutRef.current) {
            clearTimeout(signalingTimeoutRef.current);
            signalingTimeoutRef.current = null;
          }
        }
        /* 모바일 네트워크 일시 끊김 — 10초 유예 후 자동 재연결 */
        if (pc.connectionState === "disconnected") {
          if (disconnectedGraceTimerRef.current) {
            clearTimeout(disconnectedGraceTimerRef.current);
          }
          disconnectedGraceTimerRef.current = setTimeout(() => {
            disconnectedGraceTimerRef.current = null;
            if (pc.connectionState === "disconnected") {
              scheduleAutoReconnect();
            }
          }, 10_000);
        }
        if (pc.connectionState === "failed") {
          /* relay-only 재시도: 첫 실패이고 TURN 설정 있으면 relay 강제로 1회 재시도 */
          if (!forceRelay && turnRelayConfigured && !broadcasterRelayRetryRef.current) {
            broadcasterRelayRetryRef.current = true;
            /* PeerConnection 만 정리하고 DB 세션은 유지 — 뷰어 끊김 방지 */
            void (async () => {
              await cleanupPeerResourcesOnly(true);
              void startBroadcast({ forceRelay: true });
            })();
            return;
          }
          /* relay 재시도도 실패 → 자동 재연결 */
          scheduleAutoReconnect();
          return;
        }
        if (pc.connectionState === "closed") {
          /* 의도적 종료(사용자가 멈춤 버튼 누름)가 아니면 자동 재연결 */
          if (!isCleaningUpRef.current) {
            scheduleAutoReconnect();
          }
        }
      };

      /* viewer 에서 보낸 오디오(인터컴) 수신 → 스피커 재생 */
      pc.ontrack = ({ streams }) => {
        if (remoteAudioRef.current && streams[0]) {
          remoteAudioRef.current.srcObject = streams[0];
        }
      };

      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      /* 세션 ID 도착 전 ICE 큐 초기화 (ref 사용으로 함수 스코프 소실 방지) */
      pendingIceCandidatesRef.current = [];

      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return;
        const candidatePayload = candidate.toJSON();
        if (!sessionIdRef.current) {
          /* 세션 ID 미도착 → ref 큐에 보관 (함수 종료 후에도 유지) */
          pendingIceCandidatesRef.current.push(candidatePayload);
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

      /* RPC 응답에서 home_id 확보 (session_stopped broadcast 전송에 필요) */
      const rpcHomeId = broadcastResult.home_id as string | undefined;
      if (rpcHomeId && !broadcastHomeId) {
        setBroadcastHomeId(rpcHomeId);
      }
      const effectiveHomeId = rpcHomeId ?? broadcastHomeId;

      /* ref 큐에 쌓인 ICE 캔디데이트 일괄 전송 */
      const queued = [...pendingIceCandidatesRef.current];
      pendingIceCandidatesRef.current = [];
      for (const queuedCandidate of queued) {
        await supabase.rpc("add_device_ice_candidate", {
          input_device_token: deviceIdentity.deviceToken,
          input_session_id: sessionId,
          input_candidate: queuedCandidate,
        });
      }

      /*
       * ★ 레이스 컨디션 수정 ★
       * answer_ready 채널을 먼저 구독 완료한 뒤 session_started 알림을 보낸다.
       * 이전에는 session_started → answer_ready 순서라서 뷰어가 answer 를
       * 보내는 시점에 broadcaster 가 아직 answer_ready 를 구독 안 한 경우
       * push 를 놓쳤다.
       */

      /* ① viewer 가 answer SDP 를 직접 보내는 broadcast 채널 먼저 구독 */
      if (answerReadyChRef.current) {
        void supabase.removeChannel(answerReadyChRef.current);
      }
      const answerReadyCh = supabase.channel(`answer_ready_${sessionId}`);
      answerReadyChRef.current = answerReadyCh;
      answerReadyCh.on("broadcast", { event: "answer_ready" }, (event) => {
        const payload = event.payload as { answer_sdp?: string } | undefined;
        const currentPc = peerConnectionRef.current;
        console.log("[broadcaster] answer_ready 수신, answer_sdp 포함:", !!payload?.answer_sdp);

        if (!payload?.answer_sdp || !currentPc) {
          void pollSignalingOnce();
          return;
        }

        /*
         * remoteDescription 이 이미 있고 연결이 끊긴 상태 = 이전 뷰어가 떠난 뒤 새 뷰어 접속.
         * PeerConnection 을 재생성해서 새 세션으로 깨끗하게 연결한다.
         * connected/connecting 상태면 정상 동작 중이므로 무시 (같은 answer 재수신).
         */
        /* 이미 answer가 적용된 상태 → 중복 무시 (stable 에러 방지) */
        if (currentPc.remoteDescription !== null) {
          const pcState = currentPc.connectionState;
          if (pcState === "connected" || pcState === "connecting") {
            console.log("[broadcaster] 이미 연결됨, 중복 answer 무시 (PC:", pcState, ")");
            return;
          }
          if (pcState === "disconnected" || pcState === "failed" || pcState === "closed") {
            console.log("[broadcaster] 새 뷰어 감지 (push, PC:", pcState, ") → 재연결");
            void (async () => {
              await cleanupPeerResourcesOnly(true);
              void startBroadcast();
            })();
          }
          return;
        }

        /* signalingState가 stable이 아닌 경우에만 answer 적용 */
        if (currentPc.signalingState !== "have-local-offer") {
          console.log("[broadcaster] signalingState:", currentPc.signalingState, "→ answer 적용 불가, 무시");
          return;
        }

        void (async () => {
          try {
            const answerInit = decodeSdpFromDatabaseColumn(payload.answer_sdp!, "answer");
            await currentPc.setRemoteDescription(new RTCSessionDescription(answerInit));
            console.log("[broadcaster] answer 직접 적용 완료 (push 경로)");
            setBroadcastPhase("live");
          } catch (err) {
            console.error("[broadcaster] answer 직접 적용 실패:", err);
            /* 폴링으로 재시도하지 않음 — 무한 루프 방지 */
          }
        })();
      });

      /* answer_ready 구독 완료를 기다린 뒤 session_started 전송 (최대 3초 대기) */
      await Promise.race([
        new Promise<void>((resolve) => {
          answerReadyCh.subscribe((status) => {
            if (status === "SUBSCRIBED") resolve();
          });
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
      console.log("[broadcaster] answer_ready 채널 구독 완료 → session_started 전송");

      /* ② 대시보드에 세션 생성 알림 — answer_ready 구독 후 전송하므로 push 유실 방지 */
      if (effectiveHomeId) {
        const notifyCh = supabase.channel(`cam_session_broadcast_${effectiveHomeId}`);
        notifyCh.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void notifyCh.send({
              type: "broadcast",
              event: "session_started",
              payload: { session_id: sessionId },
            });
            /* 알림 전송 후 채널 정리 (일회성) */
            setTimeout(() => void supabase.removeChannel(notifyCh), 2000);
          }
        });
      }

      /** 단일 signaling 폴링 실행 (push 알림 + interval 공용) */
      async function pollSignalingOnce() {
          const currentPc = peerConnectionRef.current;
          const currentSessionId = sessionIdRef.current;
          if (!currentPc || !currentSessionId || !deviceIdentity) return;

          const { data: signalingPayload, error: signalingError } = await supabase.rpc(
            "get_broadcaster_signaling_state",
            {
              p_device_token: deviceIdentity.deviceToken,
              p_session_id: currentSessionId,
            },
          );

          if (signalingError) {
            console.warn("[broadcaster] 폴링 RPC 오류:", signalingError.message);
            return;
          }

          const normalizedPayload =
            normalizeBroadcasterSignalingRpcPayload(signalingPayload);
          if (!normalizedPayload || normalizedPayload.error) {
            console.warn("[broadcaster] 폴링 payload 오류:", normalizedPayload?.error ?? "null payload");
            return;
          }

          const answerSdpRaw = normalizedPayload.answer_sdp;
          if (answerSdpRaw) {
            /* 이미 answer 적용됨 → 중복 무시 */
            if (currentPc.remoteDescription !== null) {
              const pcState = currentPc.connectionState;
              if (pcState === "connected" || pcState === "connecting") {
                return; /* 정상 동작 중 — 무시 */
              }
              if (pcState === "disconnected" || pcState === "failed" || pcState === "closed") {
                console.log("[broadcaster] 폴링: 새 뷰어 감지 (PC:", pcState, ") → 재연결");
                await cleanupPeerResourcesOnly(true);
                void startBroadcast();
              }
              return;
            }
            /* signalingState 확인 — have-local-offer 상태에서만 answer 적용 */
            if (currentPc.signalingState !== "have-local-offer") {
              return;
            }
            try {
              console.log("[broadcaster] 폴링에서 answer 발견 → 적용 시작");
              const answerInit = decodeSdpFromDatabaseColumn(answerSdpRaw, "answer");
              await currentPc.setRemoteDescription(new RTCSessionDescription(answerInit));
              setBroadcastPhase("live");
            } catch (answerErr) {
              console.error("[broadcaster] setRemoteDescription 오류", answerErr);
              /* 재시도 안 함 — 무한 루프 방지 */
            }
          }

          const viewerIceList = parseViewerIceCandidatesFromRpcPayload(
            normalizedPayload.viewer_ice,
          );

          for (const rawCandidate of viewerIceList) {
            const dedupeKey = JSON.stringify(rawCandidate);
            if (appliedViewerIceKeysRef.current.has(dedupeKey)) continue;
            if (!currentPc.remoteDescription) continue;
            appliedViewerIceKeysRef.current.add(dedupeKey);
            try {
              await currentPc.addIceCandidate(new RTCIceCandidate(rawCandidate));
            } catch {
              // 중복 후보 등은 무시
            }
          }
      }

      const pollIntervalMs = 400;
      signalingPollIntervalRef.current = setInterval(() => {
        void pollSignalingOnce();
      }, pollIntervalMs);

      /*
       * signaling 타임아웃 — 15초 이내에 answer 미수신 시 세션 재생성.
       * 뷰어↔방송기 사이 레이스 컨디션으로 answer 가 유실된 경우 안전망 역할.
       * 연결 성공 시 onconnectionstatechange 에서 해제된다.
       */
      if (signalingTimeoutRef.current) clearTimeout(signalingTimeoutRef.current);
      signalingTimeoutRef.current = setTimeout(() => {
        signalingTimeoutRef.current = null;
        const pc = peerConnectionRef.current;
        if (pc && pc.connectionState !== "connected") {
          console.log("[broadcaster] signaling 타임아웃 15초 — 세션 재생성");
          void (async () => {
            await cleanupPeerResourcesOnly(true);
            void startBroadcast();
          })();
        }
      }, 15_000);

      /*
       * 뷰어에게 새 세션 정보를 즉시 전달 — DB 폴링 대기 없이 바로 연결 가능.
       * session_started 와 별도로 offer_sdp 를 포함해 보낸다.
       */
      if (effectiveHomeId) {
        const refreshCh = supabase.channel(`cam_session_refresh_${effectiveHomeId}`);
        refreshCh.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void refreshCh.send({
              type: "broadcast",
              event: "session_refreshed",
              payload: {
                session_id: sessionId,
                offer_sdp: encodePlainSdpForDatabaseColumn(committedLocalDescription.sdp),
              },
            });
            setTimeout(() => void supabase.removeChannel(refreshCh), 3000);
          }
        });
      }

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

      {/* viewer 인터컴 오디오 재생 (화면에 보이지 않음) */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

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
        {/* 전면/후면 카메라 전환 버튼 — 카메라 켜져있을 때만 표시 */}
        {(broadcastPhase === "ready" || broadcastPhase === "connecting" || broadcastPhase === "live") && (
          <button
            type="button"
            className={styles.switchCameraBtn}
            onClick={() => void switchCamera()}
            aria-label={facingMode === "environment" ? "전면 카메라로 전환" : "후면 카메라로 전환"}
          >
            <SwitchCamera size={20} strokeWidth={2} aria-hidden />
          </button>
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
            카메라 켜기 📷
          </button>
        ) : null}

        {broadcastPhase === "acquiring" ? (
          <p className={styles.statusText}>카메라 권한을 요청 중이에요… 🐱</p>
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
                : autoReconnectCountRef.current > 0
                  ? `🔄 재연결 중… (${autoReconnectCountRef.current}회)`
                  : `○ 시청자 기다리는 중… (${peerStatusLabel[peerConnectionState]})`}
            </p>
            <div className={styles.broadcastCareBar}>
              <div className={styles.broadcastCareHeader}>
                <span className={styles.broadcastCareTitle}>🐾 빠른 케어 기록</span>
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
              autoReconnectCountRef.current = 0;
              void cleanupPeerResourcesOnly(true).then(() => {
                setBroadcastPhase(localStreamRef.current ? "ready" : "idle");
              });
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
