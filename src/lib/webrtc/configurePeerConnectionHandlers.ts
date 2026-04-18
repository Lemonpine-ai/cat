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
   * 3회까지 3초 간격, 이후 30초 간격으로 무한 재시도 (항상 켜진 카메라).
   */
  function scheduleAutoReconnect() {
    autoReconnectCountRef.current += 1;
    const attempt = autoReconnectCountRef.current;
    /* ref 변경은 리렌더 트리거 안 하므로 state 도 동기화 — UI "재연결 중… (N회)" 라벨 갱신 */
    setAutoReconnectCount(attempt);
    /* 처음 3회는 빠르게(3초), 이후는 느리게(30초) — 배터리/네트워크 절약 */
    const delayMs = attempt <= 3 ? 3000 : 30_000;
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
      /* [로거] connected — 직전이 connected 아닐 때만 기록 */
      logConnectionEvent("connected", { pcState: pc.connectionState });
    }

    /* 모바일 네트워크 일시 끊김 — 10초 유예 후 자동 재연결 */
    if (pc.connectionState === "disconnected") {
      if (disconnectedGraceTimerRef.current) {
        clearTimeout(disconnectedGraceTimerRef.current);
      }
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

  /* ── 로컬 트랙 추가 ── */
  localStreamRef.current!.getTracks().forEach((track) => {
    pc.addTrack(track, localStreamRef.current!);
  });

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
