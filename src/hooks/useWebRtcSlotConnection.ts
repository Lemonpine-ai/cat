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

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  decodeSdpFromDatabaseColumn,
  encodePlainSdpForDatabaseColumn,
} from "@/lib/webrtc/sessionDescriptionPayload";
import { resolveWebRtcPeerConnectionConfiguration } from "@/lib/webrtc/getWebRtcIceServersForPeerConnection";
import type { RealtimeChannel } from "@supabase/supabase-js";

/* 연결 상태 */
export type SlotPhase = "connecting" | "connected" | "error";

/* 코드 버전 — 브라우저 캐시 진단용 */
const CODE_VERSION = "v3-rpc-hook";

type UseWebRtcSlotConnectionOptions = {
  sessionId: string;
  offerSdp: string;
  /** 외부에서 전달받은 ICE config — MultiCameraGrid에서 1번만 로드 */
  rtcConfiguration?: RTCConfiguration | null;
  /** 연결 지연 (ms) — 2대 동시 연결 시 stagger용 */
  delayMs?: number;
  onPhaseChange?: (phase: SlotPhase) => void;
};

export function useWebRtcSlotConnection({
  sessionId,
  offerSdp,
  rtcConfiguration: externalRtcConfig = null,
  delayMs = 0,
  onPhaseChange,
}: UseWebRtcSlotConnectionOptions) {
  const supabase = createSupabaseBrowserClient();

  const [phase, setPhase] = useState<SlotPhase>("connecting");
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const iceChannelRef = useRef<RealtimeChannel | null>(null);
  const relayRetried = useRef(false);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 상태 갱신 + 외부 콜백 */
  const updatePhase = useCallback(
    (next: SlotPhase) => { setPhase(next); onPhaseChange?.(next); },
    [onPhaseChange],
  );

  /* ── PeerConnection 정리 ── */
  const cleanup = useCallback(async () => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
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
  }, [supabase]);

  /* ── WebRTC 연결 ── */
  const connect = useCallback(
    async (forceRelay = false) => {
      console.log(`[CameraSlot] 코드 버전: ${CODE_VERSION}`);
      updatePhase("connecting");
      await cleanup();
      /* auth.getUser() 제거 — MultiCameraGrid에서 이미 호출했으므로
         여기서 다시 호출하면 Auth Lock 경합 발생 (2대+ 동시 연결 시) */

      try {
        /* ICE config: 외부에서 받았으면 재사용, 없으면 직접 fetch */
        let rtcConfiguration: RTCConfiguration;
        let turnRelayConfigured: boolean;
        if (externalRtcConfig && !forceRelay) {
          rtcConfiguration = externalRtcConfig;
          turnRelayConfigured = true;
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

        /* connection 상태 변화 */
        let graceTimer: ReturnType<typeof setTimeout> | null = null;
        pc.onconnectionstatechange = () => {
          const s = pc.connectionState;
          if (s === "connected") {
            clearConnectTimeout();
            if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
            updatePhase("connected");
          }
          if (s === "failed") {
            clearConnectTimeout();
            if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
            reportFailure();
          }
          if (s === "disconnected" && !reported) {
            if (!graceTimer) {
              graceTimer = setTimeout(() => {
                graceTimer = null;
                if (pc.connectionState === "disconnected") { reportFailure(); }
              }, 10000);
            }
          }
          if (s === "closed") {
            if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
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

        const { data: ansData, error: ansErr } = await supabase.rpc(
          "viewer_update_answer_sdp",
          { p_session_id: sessionId, p_answer_sdp: encodePlainSdpForDatabaseColumn(committed.sdp) },
        );
        if (ansErr) throw new Error(ansErr.message);
        const ansResult = ansData as { success?: boolean; error?: string } | null;
        if (ansResult?.error) throw new Error(ansResult.error);
        console.log("[CameraSlot] ② answer DB 저장 완료 (RPC)");

        /* broadcaster에게 answer 직접 전달 (push) */
        const answerSdpForBroadcast = encodePlainSdpForDatabaseColumn(committed.sdp);
        const answerNotifyCh = supabase.channel(`answer_ready_${sessionId}`);
        answerNotifyCh.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void answerNotifyCh.send({
              type: "broadcast",
              event: "answer_ready",
              payload: { session_id: sessionId, answer_sdp: answerSdpForBroadcast },
            });
            setTimeout(() => void supabase.removeChannel(answerNotifyCh), 10000);
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

        /* 15초 타임아웃 — stale 세션을 빨리 제거하여 다른 세션에 양보 */
        connectTimeoutRef.current = setTimeout(() => {
          if (pcRef.current && pcRef.current.connectionState !== "connected") {
            console.warn("[CameraSlot] 연결 타임아웃 (15초)", sessionId);
            updatePhase("error");
            void cleanup();
          }
        }, 15_000);
      } catch (err) {
        console.error("[CameraSlot] 연결 실패:", err);
        updatePhase("error");
        void cleanup();
      }
    },
    [sessionId, offerSdp, supabase, cleanup, updatePhase],
  );

  /* 마운트 시 연결 — delayMs로 stagger (2대 동시 연결 경합 방지) */
  useEffect(() => {
    const timer = setTimeout(() => { void connect(); }, delayMs);
    return () => { clearTimeout(timer); void cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, offerSdp]);

  /* 수동 재연결 함수 */
  const reconnect = useCallback(() => {
    relayRetried.current = false;
    void connect();
  }, [connect]);

  return { videoRef, phase, pcRef, reconnect };
}
