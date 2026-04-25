"use client";

/**
 * useWebRtcSlotConnection — CameraSlot용 WebRTC 연결 훅.
 *
 * CameraSlot에서 WebRTC 연결/정리/재시도 로직을 분리하여
 * CameraSlot은 UI만 담당하도록 함.
 *
 * 반환값:
 * - videoRef: video 엘리먼트에 바인딩
 * - phase: connecting / connected / error
 * - reconnect: 수동 재연결 함수
 * - pcRef: PeerConnection 참조 (마이크 addTrack용)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  decodeSdpFromDatabaseColumn,
  encodePlainSdpForDatabaseColumn,
} from "@/lib/webrtc/sessionDescriptionPayload";
import { resolveWebRtcPeerConnectionConfiguration } from "@/lib/webrtc/getWebRtcIceServersForPeerConnection";
import { getIceConnectionTimeoutMs } from "@/lib/webrtc/iceConnectionTimeoutMs";
import { ViewerReconnectEngine } from "@/lib/webrtc/viewerReconnectEngine";
import {
  logWebRtcEvent,
  type WebRtcLogEvent,
} from "@/lib/webrtc/webrtcConnectionLogger";
import type { RealtimeChannel } from "@supabase/supabase-js";

/* 연결 상태 */
export type SlotPhase = "connecting" | "connected" | "error";

/* 코드 버전 — 브라우저 캐시 진단용 */
const CODE_VERSION = "v4-reconnect-engine";

type UseWebRtcSlotConnectionOptions = {
  sessionId: string;
  offerSdp: string;
  /** 외부에서 전달받은 ICE config — MultiCameraGrid에서 1번만 로드 */
  rtcConfiguration?: RTCConfiguration | null;
  /** TURN relay 설정 여부 — 외부에서 전달 (하드코딩 true 제거) */
  turnRelayConfigured?: boolean;
  /** 연결 지연 (ms) — 2대 동시 연결 시 stagger용 */
  delayMs?: number;
  /** 로깅용 home_id — 없으면 로깅 생략 */
  homeId?: string | null;
  onPhaseChange?: (phase: SlotPhase) => void;
};

export function useWebRtcSlotConnection({
  sessionId,
  offerSdp,
  rtcConfiguration: externalRtcConfig = null,
  turnRelayConfigured: externalTurnRelay,
  delayMs = 0,
  homeId = null,
  onPhaseChange,
}: UseWebRtcSlotConnectionOptions) {
  /* supabase 클라이언트를 useMemo로 안정화 — 매 렌더마다 새 인스턴스 생성 방지 */
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  /* 로깅 컨텍스트 — 훅 입력 + 런타임 재연결 카운터로 구성 */
  const reconnectAttemptRef = useRef(0);
  const lastLoggedEventRef = useRef<WebRtcLogEvent | null>(null);
  const logCtx = useMemo(
    () => ({
      homeId,
      deviceId:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : "unknown",
      cameraId: sessionId,
      role: "viewer_slot" as const,
    }),
    [homeId, sessionId],
  );
  /** 로그 기록 — fire-and-forget, connected 중복 억제 */
  const logEvent = useCallback(
    (
      eventType: WebRtcLogEvent,
      extra?: {
        pcState?: RTCPeerConnectionState | null;
        errorMessage?: string | null;
        metadata?: Record<string, unknown> | null;
      },
    ) => {
      if (!logCtx.homeId) return; /* homeId 없으면 RLS 실패 — 스킵 */
      /* connected 중복 억제 — 직전이 connected 면 건너뜀 */
      if (eventType === "connected" && lastLoggedEventRef.current === "connected") return;
      lastLoggedEventRef.current = eventType;
      const nav = typeof navigator !== "undefined" ? navigator : null;
      const connType = (nav as unknown as {
        connection?: { effectiveType?: string };
      } | null)?.connection?.effectiveType;
      void logWebRtcEvent(supabase, {
        homeId: logCtx.homeId,
        deviceId: logCtx.deviceId,
        cameraId: logCtx.cameraId,
        role: logCtx.role,
        eventType,
        pcState: extra?.pcState ?? null,
        errorMessage: extra?.errorMessage ?? null,
        reconnectAttempt: reconnectAttemptRef.current,
        metadata: {
          ua: nav?.userAgent,
          ...(connType ? { connection: connType } : {}),
          ...(extra?.metadata ?? {}),
        },
      });
    },
    [supabase, logCtx],
  );

  /* externalRtcConfig를 ref로 보관 — connect 클로저 안에서 항상 최신값 참조 */
  const externalRtcConfigRef = useRef(externalRtcConfig);
  externalRtcConfigRef.current = externalRtcConfig;

  /* externalTurnRelay를 ref로 보관 — connect 클로저 안에서 stale 값 참조 방지 */
  const externalTurnRelayRef = useRef(externalTurnRelay);
  externalTurnRelayRef.current = externalTurnRelay;

  const [phase, setPhase] = useState<SlotPhase>("connecting");
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const iceChannelRef = useRef<RealtimeChannel | null>(null);
  const relayRetried = useRef(false);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 재연결 엔진 — disconnected/keepalive/visibility 모두 위임 */
  const engineRef = useRef<ViewerReconnectEngine | null>(null);
  /** answerNotifyCh 타이머 — cleanup 시 정리 보장 */
  const answerNotifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** answerNotifyCh 채널 ref — cleanup 시 채널도 함께 제거 (누수 방지) */
  const answerNotifyChRef = useRef<RealtimeChannel | null>(null);
  /**
   * cleanup 진행 중 플래그 — 엔진의 full_reconnect 는 cleanup → connect 순으로 동작한다.
   * 이전 PC 의 connectionState="closed" 이벤트가 새 PC 생성 후 늦게 도착하면
   * 정상 재연결 중인 UI 를 error 로 덮어쓰는 race 가 발생한다. 이 플래그로 가드한다.
   */
  const cleanupInProgressRef = useRef(false);

  /* 상태 갱신 + 외부 콜백 */
  const updatePhase = useCallback(
    (next: SlotPhase) => { setPhase(next); onPhaseChange?.(next); },
    [onPhaseChange],
  );

  /* ── PeerConnection 정리 ── */
  const cleanup = useCallback(async () => {
    /* cleanup 진행 중 플래그 ON — closed 이벤트 race 가드 */
    cleanupInProgressRef.current = true;
    try {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    /* 재연결 엔진 정리 — 언마운트 시 모든 타이머/리스너 해제 */
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    /* answerNotify 타이머 + 채널 정리 — 언마운트 시 누수 방지 */
    if (answerNotifyTimerRef.current) {
      clearTimeout(answerNotifyTimerRef.current);
      answerNotifyTimerRef.current = null;
    }
    if (answerNotifyChRef.current) {
      void supabase.removeChannel(answerNotifyChRef.current);
      answerNotifyChRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (iceChannelRef.current) {
      await supabase.removeChannel(iceChannelRef.current);
      iceChannelRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    } finally {
      /* cleanup 종료 — 이후 도착하는 closed 이벤트는 정상 처리 */
      cleanupInProgressRef.current = false;
    }
  }, [supabase]);

  /* ── WebRTC 연결 ── */
  const connect = useCallback(
    async (forceRelay = false) => {
      console.log(`[CameraSlot] 코드 버전: ${CODE_VERSION}`);

      /* ★ 이미 연결된 상태면 재연결 안 함 (세션 재조회 시 불필요한 재연결 방지) */
      if (pcRef.current && (
        pcRef.current.connectionState === "connected" ||
        pcRef.current.connectionState === "connecting"
      )) {
        console.log("[CameraSlot] 이미 연결 중/완료 — 재연결 스킵");
        return;
      }

      updatePhase("connecting");
      await cleanup();
      /* auth.getUser() 제거 — MultiCameraGrid에서 이미 호출했으므로
         여기서 다시 호출하면 Auth Lock 경합 발생 (2대+ 동시 연결 시) */

      try {
        /* ICE config: 외부에서 받았으면 재사용, 없으면 직접 fetch */
        let rtcConfiguration: RTCConfiguration;
        let turnRelayConfigured: boolean;
        const currentRtcConfig = externalRtcConfigRef.current;
        if (currentRtcConfig && !forceRelay) {
          rtcConfiguration = currentRtcConfig;
          /* 외부에서 전달된 turnRelayConfigured 사용 (ref로 최신값 참조) */
          turnRelayConfigured = externalTurnRelayRef.current ?? false;
        } else {
          const resolved = await resolveWebRtcPeerConnectionConfiguration({ forceRelay });
          rtcConfiguration = resolved.rtcConfiguration;
          turnRelayConfigured = resolved.turnRelayConfigured;
        }
        const pc = new RTCPeerConnection(rtcConfiguration);
        pcRef.current = pc;

        let reported = false;
        function reportFailure() {
          if (reported) return;
          reported = true;
          if (!forceRelay && turnRelayConfigured && !relayRetried.current) {
            relayRetried.current = true;
            void cleanup().then(() => void connect(true));
            return;
          }
          updatePhase("error");
          void cleanup();
        }

        /* ICE 중복 방지 */
        const appliedIceKeys = new Set<string>();
        async function applyIce(raw: RTCIceCandidateInit) {
          const key = JSON.stringify(raw);
          if (appliedIceKeys.has(key)) return;
          if (!pc.remoteDescription) return;
          appliedIceKeys.add(key);
          try { await pc.addIceCandidate(new RTCIceCandidate(raw)); } catch { /* 무시 */ }
        }

        /* 미디어 수신 → video 바인드 */
        pc.ontrack = ({ streams }) => {
          if (videoRef.current && streams[0]) {
            videoRef.current.srcObject = streams[0];
          }
        };

        /* 타임아웃 해제 헬퍼 */
        function clearConnectTimeout() {
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }
        }

        /* ICE 상태 변화 */
        pc.oniceconnectionstatechange = () => {
          const s = pc.iceConnectionState;
          console.log("[CameraSlot] ICE 상태:", s);
          if (s === "connected" || s === "completed") {
            clearConnectTimeout();
            relayRetried.current = false;
            updatePhase("connected");
          }
          /* failed에서만 relay 재시도 (disconnected는 일시적 — grace timer에 맡김) */
          if (s === "failed") {
            if (!forceRelay && turnRelayConfigured && !relayRetried.current) {
              clearConnectTimeout();
              relayRetried.current = true;
              console.log("[CameraSlot] ICE failed → relay 재시도");
              void cleanup().then(() => void connect(true));
              return;
            }
            clearConnectTimeout();
            reportFailure();
          }
        };

        /* ★ 재연결 엔진 생성 + PC 등록 */
        const engine = new ViewerReconnectEngine();
        engineRef.current = engine;
        engine.attachPeerConnection(pc);
        engine.onAction = (action) => {
          if (action.type === "ice_restart") {
            console.log("[CameraSlot] 엔진 → ice_restart");
            logEvent("ice_restart");
            try { pc.restartIce(); } catch { /* PC 이미 닫힘 */ }
          } else if (action.type === "full_reconnect") {
            console.log(`[CameraSlot] 엔진 → full_reconnect #${action.attempt} (${action.delayMs}ms 후)`);
            reconnectAttemptRef.current = action.attempt;
            logEvent("full_reconnect", { metadata: { delayMs: action.delayMs } });
            void cleanup().then(() => void connect());
          } else if (action.type === "keepalive_dead" || action.type === "visibility_reconnect") {
            console.log(`[CameraSlot] 엔진 → ${action.type}`);
            logEvent(action.type);
            void cleanup().then(() => void connect());
          } else if (action.type === "connection_recovered") {
            console.log("[CameraSlot] 엔진 → 연결 복구");
            reconnectAttemptRef.current = 0;
            logEvent("connection_recovered");
            updatePhase("connected");
          }
        };

        /* connection 상태 변화 — 엔진에 위임 + 로그 기록 */
        pc.onconnectionstatechange = () => {
          const s = pc.connectionState;
          engine.handleConnectionStateChange(s);
          /* PC 상태 자체를 로그 (connected/disconnected/failed/closed) */
          if (s === "connected" || s === "disconnected" || s === "failed" || s === "closed") {
            logEvent(s, { pcState: s });
          }
          if (s === "connected") {
            clearConnectTimeout();
            updatePhase("connected");
            engine.startKeepalive();
          }
          if (s === "failed") {
            clearConnectTimeout();
            /* 엔진 먼저 정리 후 실패 보고 — stale 타이머/리스너 방지 */
            engine.dispose();
            engineRef.current = null;
            reportFailure();
          }
          if (s === "closed") {
            /*
             * cleanup 진행 중이면 무시 — 엔진의 full_reconnect(cleanup→connect) 중
             * 이전 PC 의 closed 이벤트가 새 PC 생성 직전에 늦게 도착해
             * 정상 재연결을 error 로 덮어쓰는 race 를 방지.
             */
            if (cleanupInProgressRef.current) return;
            engine.stopKeepalive();
            if (!reported) { updatePhase("error"); void cleanup(); }
          }
        };

        /* viewer ICE → RPC */
        pc.onicecandidate = ({ candidate }) => {
          if (!candidate) return;
          void supabase.rpc("viewer_add_ice_candidate", {
            p_session_id: sessionId,
            p_candidate: candidate.toJSON(),
          }).then(({ error }) => {
            if (error) console.error("[CameraSlot] viewer ICE RPC 실패:", error.message);
          });
        };

        /* ① offer 적용 */
        console.log("[CameraSlot] ① offer 적용 시작", sessionId);
        const offerInit = decodeSdpFromDatabaseColumn(offerSdp, "offer");
        await pc.setRemoteDescription(new RTCSessionDescription(offerInit));
        console.log("[CameraSlot] ① offer 적용 완료");

        /* ② answer 생성 → DB 저장 */
        console.log("[CameraSlot] ② answer 생성 시작");
        const answer = await pc.createAnswer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
        await pc.setLocalDescription(answer);

        const committed = pc.localDescription;
        if (!committed?.sdp) throw new Error("answer SDP 확정 실패");

        /* 55P03 (lock_not_available) exponential backoff retry — 마이그 [5/7] 의 FOR UPDATE NOWAIT 대응.
         * - 방송폰 재시작 + 뷰어 answer 도달 race 에서 드물게 55P03 이 떨어짐 → 일시적이므로 200/400/800ms 최대 3회 재시도.
         * - 다른 SQLSTATE 는 즉시 throw (retry 해도 같은 결과).
         * - 정상 경로 (첫 시도 성공) 에는 오버헤드 0ms.
         * - 최악 지연 200+400+800=1400ms, 15s 타임아웃의 10% 이내 → LTE 환경에서 '연결 실패 고착' 자동 복구. */
        const encodedAnswer = encodePlainSdpForDatabaseColumn(committed.sdp);
        let ansData: unknown = null;
        let lastErr: { code?: string; message?: string } | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data, error } = await supabase.rpc("viewer_update_answer_sdp", {
            p_session_id: sessionId,
            p_answer_sdp: encodedAnswer,
          });
          if (!error) { ansData = data; lastErr = null; break; }
          lastErr = error as { code?: string; message?: string };
          if (error.code !== "55P03") throw new Error(error.message);
          const delay = 200 * Math.pow(2, attempt);
          console.warn(`[CameraSlot] answer SDP 잠금 경쟁 재시도 ${attempt + 1}/3 (${delay}ms)`);
          await new Promise((r) => setTimeout(r, delay));
        }
        if (lastErr) throw new Error(lastErr.message ?? "answer SDP 저장 실패 (잠금 경쟁)");
        const ansResult = ansData as { success?: boolean; error?: string } | null;
        if (ansResult?.error) throw new Error(ansResult.error);
        console.log("[CameraSlot] ② answer DB 저장 완료 (RPC)");

        /* broadcaster에게 answer 직접 전달 (push) */
        const answerSdpForBroadcast = encodePlainSdpForDatabaseColumn(committed.sdp);
        /* 이전 채널 + 타이머 정리 (재연결 시 누수 + race condition 방지) */
        if (answerNotifyTimerRef.current) {
          clearTimeout(answerNotifyTimerRef.current);
          answerNotifyTimerRef.current = null;
        }
        if (answerNotifyChRef.current) {
          void supabase.removeChannel(answerNotifyChRef.current);
          answerNotifyChRef.current = null;
        }
        const answerNotifyCh = supabase.channel(`answer_ready_${sessionId}`);
        answerNotifyChRef.current = answerNotifyCh;
        answerNotifyCh.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void answerNotifyCh.send({
              type: "broadcast",
              event: "answer_ready",
              payload: { session_id: sessionId, answer_sdp: answerSdpForBroadcast },
            });
            answerNotifyTimerRef.current = setTimeout(() => {
              answerNotifyTimerRef.current = null;
              answerNotifyChRef.current = null;
              void supabase.removeChannel(answerNotifyCh);
            }, 10000);
          }
        });

        /* ③ ICE 채널 구독 */
        const ch = supabase.channel(`slot-ice-${sessionId}`);
        ch.on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "ice_candidates", filter: `session_id=eq.${sessionId}` },
          (payload) => {
            const row = payload.new as { sender: string; candidate: RTCIceCandidateInit };
            if (row.sender !== "broadcaster") return;
            void applyIce(row.candidate);
          },
        );
        try {
          await Promise.race([
            new Promise<void>((resolve, reject) => {
              ch.subscribe((status) => {
                if (status === "SUBSCRIBED") resolve();
                if (status === "CHANNEL_ERROR") reject(new Error("ICE 채널 구독 실패"));
              });
            }),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error("ICE 채널 구독 5초 타임아웃")), 5000),
            ),
          ]);
          console.log("[CameraSlot] ③ ICE 채널 구독 성공");
        } catch (subErr) {
          console.warn("[CameraSlot] ③ ICE 채널 구독 실패 (무시하고 진행):", subErr);
        }
        iceChannelRef.current = ch;

        /* ④ 기존 broadcaster ICE 일괄 적용 */
        const { data: existingIce } = await supabase
          .from("ice_candidates")
          .select("candidate")
          .eq("session_id", sessionId)
          .eq("sender", "broadcaster");
        console.log("[CameraSlot] ④ 기존 broadcaster ICE:", existingIce?.length ?? 0, "건");
        for (const row of existingIce ?? []) {
          await applyIce(row.candidate as RTCIceCandidateInit);
        }

        /* ICE 협상 타임아웃 — stale 세션을 빨리 제거하여 다른 세션에 양보.
         * ENV NEXT_PUBLIC_ICE_TIMEOUT_MS 로 조정 (기본 15000ms, 미설정 시 100% 동일 동작) */
        const iceTimeoutMs = getIceConnectionTimeoutMs();
        connectTimeoutRef.current = setTimeout(() => {
          if (pcRef.current && pcRef.current.connectionState !== "connected") {
            console.warn(`[CameraSlot] 연결 타임아웃 (${iceTimeoutMs}ms)`, sessionId);
            updatePhase("error");
            void cleanup();
          }
        }, iceTimeoutMs);
      } catch (err) {
        console.error("[CameraSlot] 연결 실패:", err);
        const msg = err instanceof Error ? err.message : String(err);
        logEvent("error", { errorMessage: msg });
        updatePhase("error");
        void cleanup();
      }
    },
    [sessionId, offerSdp, supabase, cleanup, updatePhase, logEvent],
  );

  /*
   * 마운트 시 연결 — sessionId가 바뀔 때만 (offerSdp 제거: 참조 변경으로 재연결 방지)
   *
   * ⚠ 알려진 제한: session_refreshed로 offerSdp만 바뀌는 경우
   * sessionId dep만 있으므로 이 useEffect가 재실행되지 않음.
   * 현재는 session_refreshed 시 sessionId도 함께 바뀌므로 문제없으나,
   * 같은 sessionId에서 offer만 갱신하는 시나리오가 생기면 별도 처리 필요.
   */
  useEffect(() => {
    const timer = setTimeout(() => { void connect(); }, delayMs);
    return () => { clearTimeout(timer); void cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /* 수동 재연결 함수 */
  const reconnect = useCallback(() => {
    relayRetried.current = false;
    void connect();
  }, [connect]);

  return { videoRef, phase, pcRef, reconnect };
}
