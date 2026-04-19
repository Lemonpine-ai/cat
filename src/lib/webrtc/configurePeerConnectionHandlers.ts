/**
 * PeerConnection 이벤트 핸들러 설정 모듈
 *
 * startBroadcast 내부에서 사용하던 onconnectionstatechange, ontrack, onicecandidate 핸들러와
 * scheduleAutoReconnect 로직을 독립 함수로 추출.
 *
 * [로거 통합] pc.onconnectionstatechange 에서 connected/disconnected/failed/closed 상태 변화 시
 * logBroadcasterWebRtcEvent 를 fire-and-forget 으로 호출한다.
 * 직전에 기록한 이벤트와 동일하면 중복 기록을 억제 (특히 connected 반복 기록 방지).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BroadcastPhase } from "@/hooks/useBroadcasterSignaling";
import {
  logBroadcasterWebRtcEvent,
  type WebRtcLogEvent,
} from "@/lib/webrtc/webrtcConnectionLogger";
import { setupBroadcasterKeepalive } from "@/lib/webrtc/broadcasterKeepalive";

/** 자동 재연결 시도 상한 — 카메라 물리 실패 등으로 영원히 루프 돌지 않게 방어.
 * 백오프 합산: 3s×3 + 10s×7 + 30s×10 = 약 6.3분. 그 이후에는 사용자 수동 재시도 요구. */
const MAX_AUTO_RECONNECT_ATTEMPTS = 20;

/** PeerConnection 핸들러 설정에 필요한 파라미터 */
export interface ConfigurePeerConnectionHandlersParams {
  /** 설정 대상 PeerConnection */
  pc: RTCPeerConnection;
  /** supabase 클라이언트 */
  supabase: SupabaseClient;
  /** 현재 디바이스 토큰 */
  deviceToken: string;
  /** relay-only 강제 여부 */
  forceRelay: boolean;
  /** TURN relay 설정 존재 여부 */
  turnRelayConfigured: boolean;
  /** 원격 오디오 재생용 엘리먼트 ref */
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
  /** 로컬 미디어 스트림 ref */
  localStreamRef: React.RefObject<MediaStream | null>;
  /* ── Refs ── */
  peerConnectionRef: React.MutableRefObject<RTCPeerConnection | null>;
  sessionIdRef: React.MutableRefObject<string | null>;
  signalingPollIntervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  signalingTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  disconnectedGraceTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  autoReconnectTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  autoReconnectCountRef: React.MutableRefObject<number>;
  /** 자동 재연결 횟수 state setter — UI 라벨 갱신용 (ref 변경은 리렌더 트리거 안 됨) */
  setAutoReconnectCount: (n: number) => void;
  relayRetryRef: React.MutableRefObject<boolean>;
  isCleaningUpRef: React.MutableRefObject<boolean>;
  pendingIceCandidatesRef: React.MutableRefObject<RTCIceCandidateInit[]>;
  /* ── 콜백 ── */
  setPeerConnectionState: (state: RTCPeerConnectionState) => void;
  setErrorMessage: (msg: string | null) => void;
  setBroadcastPhase: React.Dispatch<React.SetStateAction<BroadcastPhase>>;
  cleanupPeerResourcesOnly: (keepCamera: boolean) => Promise<void>;
  /** 방송 재시작 함수 (자동 재연결용) */
  restartBroadcast: (opts?: { forceRelay?: boolean }) => void;
  /**
   * [로거] 중복 억제용 ref — 직전에 기록한 WebRtc 이벤트.
   * 동일 이벤트 연속 기록을 방지하기 위해 오케스트레이터에서 useRef 로 생성 후 전달.
   */
  lastLoggedEventRef?: React.MutableRefObject<WebRtcLogEvent | null>;
}

/**
 * PeerConnection 이벤트 핸들러 + 자동 재연결 스케줄러를 설정한다.
 * 로컬 트랙도 pc에 추가하고, ICE 큐를 초기화한다.
 */
export function configurePeerConnectionHandlers(params: ConfigurePeerConnectionHandlersParams): void {
  const {
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
    restartBroadcast,
    lastLoggedEventRef,
  } = params;

  /**
   * 로거 fire-and-forget 래퍼 — 중복 억제 후 호출.
   * connected 등 동일 이벤트가 연속으로 발생하면 기록하지 않는다.
   */
  function logConnectionEvent(
    eventType: WebRtcLogEvent,
    extra?: Parameters<typeof logBroadcasterWebRtcEvent>[4],
  ) {
    /* 직전 이벤트와 동일하면 스킵 — 스팸 방지 */
    if (lastLoggedEventRef && lastLoggedEventRef.current === eventType) return;
    if (lastLoggedEventRef) lastLoggedEventRef.current = eventType;
    void logBroadcasterWebRtcEvent(
      supabase,
      deviceToken,
      sessionIdRef.current,
      eventType,
      extra,
    );
  }

  /**
   * 자동 재연결 — 카메라를 끄지 않고 방송 재시작.
   * 백오프 단계: 1~3회 3초, 4~10회 10초, 11회~ 30초. 무한 재시도.
   * (뷰어의 viewerReconnectEngine 과 동일한 계단식 백오프로 네트워크 안정 대기.)
   */
  function scheduleAutoReconnect() {
    /* (변경 #4) 진입부 기존 타이머 방어 clear — disconnected grace 타이머와 경쟁 시
     * 이전 타이머가 살아있으면 중복 재연결 스케줄이 쌓일 수 있어 먼저 정리한다. */
    if (autoReconnectTimerRef.current) {
      clearTimeout(autoReconnectTimerRef.current);
      autoReconnectTimerRef.current = null;
    }
    /* (변경 #1) 상한 도달 시 error phase 전이 — 증가 전에 검사.
     * 20회 실패(약 6.3분)까지 자동 복구에 실패했다면 카메라 물리 문제 등
     * 자동으로 해결 불가능한 상황이므로 사용자 수동 재시도 요구. */
    if (autoReconnectCountRef.current >= MAX_AUTO_RECONNECT_ATTEMPTS) {
      /* 남은 타이머·keepalive 모두 정리 — error phase 에서는 유령 동작 금지 */
      if (disconnectedGraceTimerRef.current) {
        clearTimeout(disconnectedGraceTimerRef.current);
        disconnectedGraceTimerRef.current = null;
      }
      if (keepaliveStop) {
        keepaliveStop();
        keepaliveStop = null;
      }
      setErrorMessage(
        "카메라 또는 네트워크에 문제가 있어요. 카메라 연결 상태를 확인한 뒤 다시 시도해 주세요.",
      );
      setBroadcastPhase("error");
      /* [로거] 상한 도달 기록 — 동일 full_reconnect 이벤트에 reason metadata 로 구분 */
      void logBroadcasterWebRtcEvent(
        supabase,
        deviceToken,
        sessionIdRef.current,
        "full_reconnect",
        {
          reconnectAttempt: autoReconnectCountRef.current,
          metadata: {
            reason: "max_attempts_reached",
            limit: MAX_AUTO_RECONNECT_ATTEMPTS,
          },
        },
      );
      return; /* ← 증가/타이머 생성 스킵 */
    }
    autoReconnectCountRef.current += 1;
    const attempt = autoReconnectCountRef.current;
    /* ref 변경은 리렌더 트리거 안 하므로 state 도 동기화 — UI "재연결 중… (N회)" 라벨 갱신 */
    setAutoReconnectCount(attempt);
    /* 1~3회=3초(빠른 복구), 4~10회=10초(중간), 11회~=30초(네트워크 안정 대기) */
    const delayMs = attempt <= 3 ? 3_000 : attempt <= 10 ? 10_000 : 30_000;
    const delaySec = Math.round(delayMs / 1000);
    setErrorMessage(`연결 끊김 — 재연결 대기 중... (${delaySec}초)`);
    setBroadcastPhase("connecting");

    /* [로거] full_reconnect 이벤트 — delayMs, attempt metadata 포함 */
    void logBroadcasterWebRtcEvent(
      supabase,
      deviceToken,
      sessionIdRef.current,
      "full_reconnect",
      {
        reconnectAttempt: attempt,
        metadata: { delayMs, attempt },
      },
    );

    autoReconnectTimerRef.current = setTimeout(() => {
      autoReconnectTimerRef.current = null;
      void (async () => {
        /* PeerConnection 만 정리 — DB 세션은 RPC 가 원자적으로 교체 */
        await cleanupPeerResourcesOnly(true);
        restartBroadcast();
      })();
    }, delayMs);
  }

  /** keepalive 정리 함수 — connected 마다 새로 세팅하고 다른 상태로 전이 시 호출 */
  let keepaliveStop: (() => void) | null = null;

  /* ── onconnectionstatechange ── */
  pc.onconnectionstatechange = () => {
    setPeerConnectionState(pc.connectionState);

    if (pc.connectionState === "connected") {
      relayRetryRef.current = false;
      autoReconnectCountRef.current = 0;
      /* 연결 성공 → state 도 0 으로 리셋 (UI 라벨 사라짐) */
      setAutoReconnectCount(0);
      if (disconnectedGraceTimerRef.current) {
        clearTimeout(disconnectedGraceTimerRef.current);
        disconnectedGraceTimerRef.current = null;
      }
      setErrorMessage(null);
      setBroadcastPhase("live");
      /* 연결 완료 → signaling 폴링·타임아웃 종료 */
      if (signalingPollIntervalRef.current) {
        clearInterval(signalingPollIntervalRef.current);
        signalingPollIntervalRef.current = null;
      }
      if (signalingTimeoutRef.current) {
        clearTimeout(signalingTimeoutRef.current);
        signalingTimeoutRef.current = null;
      }
      /* 송신 keepalive 시작 — bytesSent 가 2회 연속 증가 없으면 재연결 트리거 */
      if (keepaliveStop) keepaliveStop();
      keepaliveStop = setupBroadcasterKeepalive(pc, () => {
        /* 의도적 종료 중이면 무시 */
        if (isCleaningUpRef.current) return;
        scheduleAutoReconnect();
      });
      /* [로거] connected — 직전이 connected 아닐 때만 기록 */
      logConnectionEvent("connected", { pcState: pc.connectionState });
    }

    /* 모바일 네트워크 일시 끊김 — 10초 유예 후 자동 재연결 */
    if (pc.connectionState === "disconnected") {
      if (disconnectedGraceTimerRef.current) {
        clearTimeout(disconnectedGraceTimerRef.current);
      }
      /* keepalive 일시 중지 — disconnected 에서는 bytesSent 가 당연히 고정 */
      if (keepaliveStop) { keepaliveStop(); keepaliveStop = null; }
      /* [로거] disconnected */
      logConnectionEvent("disconnected", { pcState: pc.connectionState });
      disconnectedGraceTimerRef.current = setTimeout(() => {
        disconnectedGraceTimerRef.current = null;
        if (pc.connectionState === "disconnected") {
          scheduleAutoReconnect();
        }
      }, 10_000);
    }

    if (pc.connectionState === "failed") {
      if (keepaliveStop) { keepaliveStop(); keepaliveStop = null; }
      /* [로거] failed */
      logConnectionEvent("failed", { pcState: pc.connectionState });
      /* relay-only 재시도: 첫 실패이고 TURN 설정 있으면 relay 강제로 1회 재시도 */
      if (!forceRelay && turnRelayConfigured && !relayRetryRef.current) {
        relayRetryRef.current = true;
        void (async () => {
          await cleanupPeerResourcesOnly(true);
          restartBroadcast({ forceRelay: true });
        })();
        return;
      }
      /* relay 재시도도 실패 → 자동 재연결 */
      scheduleAutoReconnect();
      return;
    }

    if (pc.connectionState === "closed") {
      if (keepaliveStop) { keepaliveStop(); keepaliveStop = null; }
      /* [로거] closed */
      logConnectionEvent("closed", { pcState: pc.connectionState });
      /* 의도적 종료(사용자가 멈춤 버튼 누름)가 아니면 자동 재연결 */
      if (!isCleaningUpRef.current) {
        scheduleAutoReconnect();
      }
    }
  };

  /* ── ontrack: viewer 에서 보낸 오디오(인터컴) 수신 → 스피커 재생 ── */
  pc.ontrack = ({ streams }) => {
    if (remoteAudioRef.current && streams[0]) {
      remoteAudioRef.current.srcObject = streams[0];
    }
  };

  /* ── 로컬 트랙 추가 ──
   *
   * S9 등에서 간헐적으로 readyState === "ended" 로 즉시 종료되는 트랙이
   * MediaStream 에 남아있는 경우가 있다. ended 트랙을 pc 에 addTrack 하면
   * 즉시 mute 된 transceiver 로 붙어 뷰어에게 검은 화면이 전달된다.
   * → live 트랙만 추가하고, 방송 중 트랙이 ended 로 바뀌면 자동 재시작.
   */
  /** track.onended 콜백 중복 호출 방지 — 오디오/비디오 양쪽에서 동시에 fire 될 수 있음 */
  let trackEndedHandled = false;
  /* [s9-cam 진단] addTrack 필터링 시 live/ended 각각 로그 */
  localStreamRef.current!.getTracks().forEach((track) => {
    if (track.readyState !== "live") {
      /* [s9-cam 진단] ended 트랙 addTrack 스킵 기록 */
      console.warn("[s9-cam] addTrack skipped (ended):", track.kind, track.label);
      return;
    }
    /* [s9-cam 진단] live 트랙 addTrack 기록 */
    console.info("[s9-cam] addTrack live", track.kind, track.label);
    pc.addTrack(track, localStreamRef.current!);
    /* 방송 중 카메라/마이크 권한 철회, USB 디바이스 분리 등으로 트랙이 끊기면
     *  pc 는 여전히 connected 상태를 유지할 수 있음 → 수동 재시작 필요. */
    track.onended = () => {
      if (trackEndedHandled) return;
      if (isCleaningUpRef.current) return;
      trackEndedHandled = true;
      console.warn("[broadcaster] 로컬 트랙 ended 감지 → 재연결 시도:", track.kind);
      scheduleAutoReconnect();
    };
  });

  /* ── 비디오 코덱 우선순위 설정 — H264 우선 ──
   *
   * S9 Exynos 하드웨어 디코더는 VP9 에 문제가 있고 H264 는 안정적으로 동작.
   * getCapabilities / setCodecPreferences 둘 다 구형 브라우저에서는 미지원이므로
   * try/catch 로 방어. 미지원 브라우저는 기본 codec 순서 그대로 사용.
   */
  try {
    const videoTransceiver = pc
      .getTransceivers()
      .find((t) => t.sender.track?.kind === "video");
    const capabilities =
      typeof RTCRtpSender !== "undefined" && "getCapabilities" in RTCRtpSender
        ? RTCRtpSender.getCapabilities("video")
        : null;
    /* [s9-cam 진단] H264 setCodecPreferences 적용 시도 기록 */
    console.info(
      "[s9-cam] H264 setCodecPreferences attempting, capabilities=",
      capabilities?.codecs?.length ?? 0,
      "codecs available",
    );
    if (videoTransceiver && capabilities && "setCodecPreferences" in videoTransceiver) {
      const codecs = capabilities.codecs ?? [];
      /* H264 를 앞쪽으로 모으되, 기존 codec 순서/필수 항목(rtx, red 등)은 뒤쪽에 유지 */
      const h264First = [
        ...codecs.filter((c) => c.mimeType.toLowerCase() === "video/h264"),
        ...codecs.filter((c) => c.mimeType.toLowerCase() !== "video/h264"),
      ];
      if (h264First.length > 0) {
        videoTransceiver.setCodecPreferences(h264First);
        /* [s9-cam 진단] H264 적용 성공 — 정렬된 mimeType 배열 기록 */
        console.info(
          "[s9-cam] H264 setCodecPreferences applied, ordering=",
          h264First.map((c) => c.mimeType),
        );
      } else {
        /* [s9-cam 진단] codecs 배열이 비어 H264 스킵 */
        console.warn("[s9-cam] H264 setCodecPreferences skipped:", "codecs api unsupported");
      }
    } else {
      /* [s9-cam 진단] transceiver/capabilities/setCodecPreferences 미지원 */
      console.warn("[s9-cam] H264 setCodecPreferences skipped:", "codecs api unsupported");
    }
  } catch (err) {
    /* [s9-cam 진단] 예외 발생 — 메시지 기록 */
    const e = err as { message?: string } | undefined;
    console.warn("[s9-cam] H264 setCodecPreferences skipped:", e?.message || "codecs api unsupported");
    console.warn("[broadcaster] H264 우선순위 설정 실패(무시):", err);
  }

  /* ── 세션 ID 도착 전 ICE 큐 초기화 ── */
  pendingIceCandidatesRef.current = [];

  /* ── onicecandidate ── */
  pc.onicecandidate = ({ candidate }) => {
    if (!candidate) return;
    const candidatePayload = candidate.toJSON();
    if (!sessionIdRef.current) {
      /* 세션 ID 미도착 → ref 큐에 보관 */
      pendingIceCandidatesRef.current.push(candidatePayload);
      return;
    }
    void supabase.rpc("add_device_ice_candidate", {
      input_device_token: deviceToken,
      input_session_id: sessionIdRef.current,
      input_candidate: candidatePayload,
    });
  };
}
