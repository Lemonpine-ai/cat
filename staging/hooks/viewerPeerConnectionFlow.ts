/**
 * viewerPeerConnectionFlow — useViewerPeerConnectionMulti 훅의
 * 비-React 시그널링 흐름을 분리해 파일당 400줄 상한을 지키기 위한 모듈.
 *
 * 이 파일은 React 훅 규칙 바깥 — 훅에서 ref 와 콜백을 주입받아
 * PC 생성·오퍼·RPC·Realtime 구독까지 순차로 수행하고 정리 책임은 훅에 돌려준다.
 */

import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import {
  decodeSdpFromDatabaseColumn,
  encodePlainSdpForDatabaseColumn,
} from "@/lib/webrtc/sessionDescriptionPayload";
import { resolveWebRtcPeerConnectionConfiguration } from "@/lib/webrtc/getWebRtcIceServersForPeerConnection";
import { buildWebRtcNetworkFailureUserMessage } from "@/lib/webrtc/buildWebRtcNetworkFailureUserMessage";
import type { ViewerReconnectEngine } from "@/lib/webrtc/viewerReconnectEngine";
import {
  bootstrapBroadcasterIce,
  callViewerCreateConnectionWithBackoff,
  createAndAttachReconnectEngine,
  sendViewerIceCandidate,
  startPingLoop,
  subscribeToAnswerUpdate,
  subscribeToBroadcasterIce,
  subscribeWithTimeout,
  type IceQueue,
  type ViewerConnectionPhase,
  type ViewerRole,
} from "@/../staging/hooks/viewerPeerConnectionHelpers";

/** 훅 → 흐름 로 주입되는 컨텍스트 (훅의 ref/콜백 묶음) */
export type ViewerConnectionFlowContext = {
  supabase: SupabaseClient;
  sessionId: string;
  role: ViewerRole;
  /** props ref */
  externalRtcConfigRef: React.RefObject<RTCConfiguration | null>;
  externalTurnRelayRef: React.RefObject<boolean | undefined>;
  /** PC 및 부속 ref — 훅이 소유 */
  pcRef: React.RefObject<RTCPeerConnection | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  engineRef: React.RefObject<ViewerReconnectEngine | null>;
  viewerConnectionIdRef: React.RefObject<string | null>;
  answerChannelRef: React.RefObject<RealtimeChannel | null>;
  iceChannelRef: React.RefObject<RealtimeChannel | null>;
  stopPingRef: React.RefObject<(() => void) | null>;
  connectTimeoutRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  answerTimeoutRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  tooManyRetryTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  relayRetriedRef: React.RefObject<boolean>;
  cleanupInProgressRef: React.RefObject<boolean>;
  reconnectAttemptRef: React.RefObject<number>;
  iceQueue: IceQueue;
  /** 콜백 */
  updatePhase: (next: ViewerConnectionPhase) => void;
  updateError: (msg: string | null) => void;
  setViewerConnectionId: (id: string | null) => void;
  logEvent: (
    eventType: string,
    extra?: { pcState?: RTCPeerConnectionState | null; errorMessage?: string | null; metadata?: Record<string, unknown> | null },
  ) => void;
  cleanup: () => Promise<void>;
  startConnection: (opts?: { forceRelay?: boolean }) => Promise<void>;
  applyBroadcasterIce: (c: RTCIceCandidateInit, rowId: string | null) => Promise<void>;
  handleAnswerReceived: (answerSdp: string) => Promise<void>;
};

/**
 * 실제 시그널링 시퀀스:
 *   ICE config → PC 생성 → 엔진 attach → offer → RPC → 구독 → bootstrap → ping
 */
export async function runViewerConnectionFlow(
  ctx: ViewerConnectionFlowContext,
  opts: { forceRelay?: boolean },
): Promise<void> {
  const forceRelay = opts.forceRelay ?? false;
  const { role, sessionId, supabase } = ctx;

  /* 1. ICE config */
  let rtcConfig: RTCConfiguration;
  let turnRelayConfigured: boolean;
  const injected = ctx.externalRtcConfigRef.current;
  if (injected && !forceRelay) {
    rtcConfig = injected;
    turnRelayConfigured = ctx.externalTurnRelayRef.current ?? false;
  } else {
    const resolved = await resolveWebRtcPeerConnectionConfiguration({ forceRelay });
    rtcConfig = resolved.rtcConfiguration;
    turnRelayConfigured = resolved.turnRelayConfigured;
  }

  /* 2. PC 생성 + 트랜시버 */
  const pc = new RTCPeerConnection(rtcConfig);
  ctx.pcRef.current = pc;
  pc.addTransceiver("audio", { direction: "recvonly" });
  pc.addTransceiver("video", { direction: "recvonly" });

  pc.ontrack = ({ streams }) => {
    if (ctx.videoRef.current && streams[0]) {
      ctx.videoRef.current.srcObject = streams[0];
    }
  };

  /* 3. 실패 보고 + relay 1회 재시도 */
  let reported = false;
  const reportFailure = () => {
    if (reported) return;
    reported = true;
    if (!forceRelay && turnRelayConfigured && !ctx.relayRetriedRef.current) {
      ctx.relayRetriedRef.current = true;
      console.log(`[${role}] relay 강제 재시도`);
      void ctx.cleanup().then(() => void ctx.startConnection({ forceRelay: true }));
      return;
    }
    const msg = buildWebRtcNetworkFailureUserMessage({ turnRelayConfigured });
    ctx.updateError(msg);
    ctx.updatePhase("error");
    void ctx.cleanup();
  };

  /* 4. 재연결 엔진 */
  const engine = createAndAttachReconnectEngine(pc, {
    onIceRestart: () => {
      ctx.logEvent("ice_restart");
      try {
        pc.restartIce();
      } catch {
        /* PC 닫힘 */
      }
    },
    onReconnectNeeded: (action) => {
      if (action.type === "full_reconnect") {
        ctx.reconnectAttemptRef.current = action.attempt;
        ctx.logEvent("full_reconnect", { metadata: { delayMs: action.delayMs } });
      } else {
        ctx.logEvent(action.type);
      }
      if (ctx.cleanupInProgressRef.current) return;
      void ctx.cleanup().then(() => void ctx.startConnection());
    },
    onRecovered: () => {
      ctx.reconnectAttemptRef.current = 0;
      ctx.logEvent("connection_recovered");
      ctx.updatePhase("connected");
    },
  });
  ctx.engineRef.current = engine;

  /* 5. PC state handlers */
  pc.oniceconnectionstatechange = () => {
    const s = pc.iceConnectionState;
    if (s === "connected" || s === "completed") ctx.relayRetriedRef.current = false;
    if (s === "failed") reportFailure();
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    engine.handleConnectionStateChange(s);
    if (s === "connected" || s === "disconnected" || s === "failed" || s === "closed") {
      ctx.logEvent(s, { pcState: s });
    }
    if (s === "connected") {
      if (ctx.connectTimeoutRef.current) {
        clearTimeout(ctx.connectTimeoutRef.current);
        ctx.connectTimeoutRef.current = null;
      }
      ctx.updatePhase("connected");
      engine.startKeepalive();
    } else if (s === "failed") {
      if (ctx.connectTimeoutRef.current) {
        clearTimeout(ctx.connectTimeoutRef.current);
        ctx.connectTimeoutRef.current = null;
      }
      engine.dispose();
      ctx.engineRef.current = null;
      reportFailure();
    } else if (s === "closed") {
      if (ctx.cleanupInProgressRef.current) return;
      engine.stopKeepalive();
    }
  };

  /* 6. viewer ICE 후보 → RPC (fire-and-forget) */
  pc.onicecandidate = ({ candidate }) => {
    if (!candidate) return;
    const vid = ctx.viewerConnectionIdRef.current;
    if (!vid) return;
    sendViewerIceCandidate(supabase, vid, candidate.toJSON());
  };

  /* 7. offer 생성 + 로컬 디스크립션 확정 */
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const committed = pc.localDescription;
  if (!committed?.sdp) throw new Error("로컬 offer SDP 확정 실패");

  /* 8. timeouts (20s connect / 15s answer) */
  ctx.connectTimeoutRef.current = setTimeout(() => {
    ctx.connectTimeoutRef.current = null;
    if (ctx.pcRef.current && ctx.pcRef.current.connectionState !== "connected") {
      console.warn(`[${role}] 연결 타임아웃 (20s)`);
      reportFailure();
    }
  }, 20_000);
  ctx.answerTimeoutRef.current = setTimeout(() => {
    ctx.answerTimeoutRef.current = null;
    if (ctx.pcRef.current && !ctx.pcRef.current.remoteDescription) {
      console.warn(`[${role}] answer 수신 타임아웃 (15s)`);
      reportFailure();
    }
  }, 15_000);

  /* 9. viewer_create_connection RPC */
  const encodedOffer = encodePlainSdpForDatabaseColumn(committed.sdp);
  const rpcResult = await callViewerCreateConnectionWithBackoff(
    supabase,
    sessionId,
    encodedOffer,
    (attempt, delay) =>
      console.warn(`[${role}] create_connection 잠금 재시도 ${attempt}/3 (${delay}ms)`),
  );
  if (rpcResult.kind === "too_many_viewers") {
    /* 4명 초과 — 30초 후 재시도 */
    ctx.updatePhase("too_many_viewers");
    ctx.tooManyRetryTimerRef.current = setTimeout(() => {
      ctx.tooManyRetryTimerRef.current = null;
      void ctx.startConnection();
    }, 30_000);
    await ctx.cleanup();
    return;
  }
  if (rpcResult.kind === "error") throw new Error(rpcResult.message);

  const vid = rpcResult.viewerConnectionId;
  ctx.viewerConnectionIdRef.current = vid;
  ctx.setViewerConnectionId(vid);
  ctx.updatePhase("awaiting_answer");

  /* 10. answer UPDATE 구독 */
  const answerCh = subscribeToAnswerUpdate(supabase, vid, {
    onAnswer: (answerSdp) => void ctx.handleAnswerReceived(answerSdp),
    onClosed: () => {
      console.warn(`[${role}] 서버에서 연결 종료 — reconnect`);
      void ctx.cleanup().then(() => void ctx.startConnection());
    },
  });
  ctx.answerChannelRef.current = answerCh;
  subscribeWithTimeout(answerCh, 5_000, {
    onTimeout: () => console.warn(`[${role}] answer 채널 subscribe 5s 타임아웃`),
    onError: (s) => console.warn(`[${role}] answer 채널 구독 실패: ${s}`),
  });

  /* 11. ICE INSERT 구독 */
  const iceCh = subscribeToBroadcasterIce(supabase, vid, (candidate, rowId) => {
    void ctx.applyBroadcasterIce(candidate, rowId);
  });
  ctx.iceChannelRef.current = iceCh;
  subscribeWithTimeout(iceCh, 5_000, {
    onTimeout: () => console.warn(`[${role}] ICE 채널 subscribe 5s 타임아웃`),
    onError: (s) => console.warn(`[${role}] ICE 채널 구독 실패: ${s}`),
  });

  /* 12. bootstrap 스냅샷 */
  const snapshot = await bootstrapBroadcasterIce(supabase, vid);
  for (const row of snapshot) await ctx.applyBroadcasterIce(row.candidate, row.id);

  /* 13. ping keepalive */
  ctx.stopPingRef.current = startPingLoop(supabase, vid, () => {
    console.warn(`[${role}] ping 연속 실패 — reconnect`);
    void ctx.cleanup().then(() => void ctx.startConnection());
  });
}

/**
 * answer UPDATE 수신 시 setRemoteDescription + ICE 큐 flush.
 * 훅에서 useCallback 바깥으로 분리하기 위한 래퍼.
 */
export async function applyAnswerAndFlushQueue(args: {
  pc: RTCPeerConnection;
  answerSdpStored: string;
  role: ViewerRole;
  iceQueue: IceQueue;
  applyBroadcasterIce: (c: RTCIceCandidateInit, rowId: string | null) => Promise<void>;
  clearAnswerTimeout: () => void;
  onConnecting: () => void;
  onError: (err: unknown) => Promise<void>;
}): Promise<void> {
  const { pc, answerSdpStored, role, iceQueue } = args;
  if (pc.remoteDescription) return; /* 중복 UPDATE 방지 */
  args.clearAnswerTimeout();
  try {
    const init = decodeSdpFromDatabaseColumn(answerSdpStored, "answer");
    await pc.setRemoteDescription(new RTCSessionDescription(init));
    args.onConnecting();
    await iceQueue.flush((c) => args.applyBroadcasterIce(c, null));
  } catch (err) {
    console.error(`[${role}] setRemoteDescription(answer) 실패:`, err);
    await args.onError(err);
  }
}
