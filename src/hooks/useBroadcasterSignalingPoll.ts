/**
 * Signaling 폴링 + Answer 수신 + 대시보드 알림 모듈
 *
 * startBroadcast 내부에서 수행하던 answer_ready 채널 구독, pollSignalingOnce,
 * 시그널링 타임아웃, 대시보드 알림(session_started / session_refreshed)을 독립 함수로 추출.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeSdpFromDatabaseColumn, encodePlainSdpForDatabaseColumn } from "@/lib/webrtc/sessionDescriptionPayload";
import { normalizeBroadcasterSignalingRpcPayload, parseViewerIceCandidatesFromRpcPayload } from "@/lib/webrtc/broadcasterSignalingRpcPayload";
import { getBroadcasterSignalingTimeoutMs } from "@/lib/webrtc/broadcasterSignalingTimeoutMs";
import type { BroadcastPhase } from "@/hooks/useBroadcasterSignaling";

/** setupSignalingAndNotify 에 필요한 파라미터 */
export interface SetupSignalingAndNotifyParams {
  supabase: SupabaseClient;
  pc: RTCPeerConnection;
  sessionId: string;
  deviceToken: string;
  effectiveHomeId: string | null;
  /** 확정된 로컬 SDP (offer) */
  committedSdp: string;
  /* ── Refs ── */
  peerConnectionRef: React.MutableRefObject<RTCPeerConnection | null>;
  sessionIdRef: React.MutableRefObject<string | null>;
  answerReadyChRef: React.MutableRefObject<ReturnType<SupabaseClient["channel"]> | null>;
  signalingPollIntervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  appliedViewerIceKeysRef: React.MutableRefObject<Set<string>>;
  signalingTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  /* ── 콜백 ── */
  setBroadcastPhase: React.Dispatch<React.SetStateAction<BroadcastPhase>>;
  cleanupPeerResourcesOnly: (keepCamera: boolean) => Promise<void>;
  /** 방송 재시작 함수 (signaling 타임아웃 시 호출) */
  restartBroadcast: () => void;
}

/**
 * Signaling 채널 구독 + 폴링 + 대시보드 알림을 설정한다.
 * 이 함수는 훅이 아닌 순수 async 함수 — refs 를 파라미터로 전달받아 사용.
 */
export async function setupSignalingAndNotify(params: SetupSignalingAndNotifyParams): Promise<void> {
  const {
    supabase,
    pc,
    sessionId,
    deviceToken,
    effectiveHomeId,
    committedSdp,
    peerConnectionRef,
    sessionIdRef,
    answerReadyChRef,
    signalingPollIntervalRef,
    appliedViewerIceKeysRef,
    signalingTimeoutRef,
    setBroadcastPhase,
    cleanupPeerResourcesOnly,
    restartBroadcast,
  } = params;

  /** 단일 signaling 폴링 실행 (push 알림 + interval 공용) */
  async function pollSignalingOnce() {
    const currentPc = peerConnectionRef.current;
    const currentSessionId = sessionIdRef.current;
    if (!currentPc || !currentSessionId || !deviceToken) return;

    const { data: signalingPayload, error: signalingError } =
      await supabase.rpc("get_broadcaster_signaling_state", {
        p_device_token: deviceToken,
        p_session_id: currentSessionId,
      });

    if (signalingError) return;

    const normalizedPayload =
      normalizeBroadcasterSignalingRpcPayload(signalingPayload);
    if (!normalizedPayload || normalizedPayload.error) return;

    /* ── answer SDP 처리 ── */
    const answerSdpRaw = normalizedPayload.answer_sdp;
    if (answerSdpRaw) {
      /* 이미 answer 적용됨 → 중복 무시 */
      if (currentPc.remoteDescription !== null) {
        const pcState = currentPc.connectionState;
        if (pcState === "connected" || pcState === "connecting") {
          return; /* 정상 동작 중 — 무시 */
        }
        if (pcState === "disconnected" || pcState === "failed" || pcState === "closed") {
          await cleanupPeerResourcesOnly(true);
          restartBroadcast();
        }
        return;
      }
      /* signalingState 확인 — have-local-offer 상태에서만 answer 적용 */
      if (currentPc.signalingState !== "have-local-offer") return;
      try {
        const answerInit = decodeSdpFromDatabaseColumn(answerSdpRaw, "answer");
        await currentPc.setRemoteDescription(new RTCSessionDescription(answerInit));
        setBroadcastPhase("live");
      } catch {
        /* 재시도 안 함 — 무한 루프 방지 */
      }
    }

    /* ── viewer ICE 후보 처리 ── */
    const viewerIceList = parseViewerIceCandidatesFromRpcPayload(normalizedPayload.viewer_ice);
    for (const rawCandidate of viewerIceList) {
      const dedupeKey = JSON.stringify(rawCandidate);
      if (appliedViewerIceKeysRef.current.has(dedupeKey)) continue;
      if (!currentPc.remoteDescription) continue;
      appliedViewerIceKeysRef.current.add(dedupeKey);
      try {
        await currentPc.addIceCandidate(new RTCIceCandidate(rawCandidate));
      } catch {
        /* 중복 후보 등은 무시 */
      }
    }
  }

  /* ── ① answer_ready broadcast 채널 구독 ── */
  if (answerReadyChRef.current) {
    void supabase.removeChannel(answerReadyChRef.current);
  }
  const answerReadyCh = supabase.channel(`answer_ready_${sessionId}`);
  answerReadyChRef.current = answerReadyCh;

  answerReadyCh.on("broadcast", { event: "answer_ready" }, (event) => {
    const payload = event.payload as { answer_sdp?: string } | undefined;
    const currentPc = peerConnectionRef.current;

    if (!payload?.answer_sdp || !currentPc) {
      void pollSignalingOnce();
      return;
    }

    /* 이미 answer가 적용된 상태 → 중복 무시 (stable 에러 방지) */
    if (currentPc.remoteDescription !== null) {
      const pcState = currentPc.connectionState;
      if (pcState === "connected" || pcState === "connecting") return;
      if (pcState === "disconnected" || pcState === "failed" || pcState === "closed") {
        void (async () => {
          await cleanupPeerResourcesOnly(true);
          restartBroadcast();
        })();
      }
      return;
    }

    /* signalingState가 stable이 아닌 경우에만 answer 적용 */
    if (currentPc.signalingState !== "have-local-offer") return;

    void (async () => {
      try {
        const answerInit = decodeSdpFromDatabaseColumn(payload.answer_sdp!, "answer");
        await currentPc.setRemoteDescription(new RTCSessionDescription(answerInit));
        setBroadcastPhase("live");
      } catch (err) {
        console.error("[broadcaster] answer 적용 실패:", err);
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

  /* ── ② 대시보드에 세션 생성 알림 (answer_ready 구독 후 전송 → push 유실 방지) ── */
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
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        /* 구독 실패 시 채널 정리 — 메모리 누수 방지 */
        void supabase.removeChannel(notifyCh);
      }
    });
  }

  /* ── ③ signaling 폴링 interval 시작 ── */
  signalingPollIntervalRef.current = setInterval(() => {
    void pollSignalingOnce();
  }, 400);

  /* ── ④ signaling 타임아웃 — answer 미수신 시 세션 재생성 ──
   * 목적: viewer 가 LTE 등 느린 망에서 ICE 협상 + answer 회신을 마치기 전에
   *       broadcaster 가 세션을 폐기/재생성하면 DB 폭증 + lock 경합이 발생.
   * ENV : NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS (단위: ms)
   * 단위: ms (Number 정수, 허용 범위 [1000, 300000])
   * fallback: 미설정/비정상 시 15000ms — CLAUDE.md #13 무손상 (기존 동작 유지). */
  const signalingTimeoutMs = getBroadcasterSignalingTimeoutMs();
  if (signalingTimeoutRef.current) clearTimeout(signalingTimeoutRef.current);
  signalingTimeoutRef.current = setTimeout(() => {
    signalingTimeoutRef.current = null;
    if (peerConnectionRef.current?.connectionState !== "connected") {
      console.warn(`[broadcaster] signaling 타임아웃 (${signalingTimeoutMs}ms) — 세션 재생성`);
      void (async () => {
        await cleanupPeerResourcesOnly(true);
        restartBroadcast();
      })();
    }
  }, signalingTimeoutMs);

  /* ── ⑤ 뷰어에게 새 세션 정보를 즉시 전달 (DB 폴링 대기 없이 바로 연결 가능) ── */
  if (effectiveHomeId) {
    const refreshCh = supabase.channel(`cam_session_refresh_${effectiveHomeId}`);
    refreshCh.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void refreshCh.send({
          type: "broadcast",
          event: "session_refreshed",
          payload: {
            session_id: sessionId,
            offer_sdp: encodePlainSdpForDatabaseColumn(committedSdp),
          },
        });
        setTimeout(() => void supabase.removeChannel(refreshCh), 3000);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        /* 구독 실패 시 채널 정리 — 메모리 누수 방지 */
        void supabase.removeChannel(refreshCh);
      }
    });
  }
}
