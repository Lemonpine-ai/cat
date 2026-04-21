"use client";
/**
 * useBroadcasterPeerMap — Multi-Viewer 방송폰 시그널링 훅 (Phase R2).
 * viewer-per-PC Map 유지. 세션은 dummy offer SDP 로 start_device_broadcast RPC 생성.
 * 2s 폴링(broadcaster_get_viewer_connections) → 신규 viewer 마다 PC 생성.
 * lifecycle 훅 호환용 sentinel PC 를 peerConnectionRef 에 유지.
 * R1 RPC: add_device_ice_candidate_v2 / broadcaster_set_viewer_answer / broadcaster_close_viewer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { encodePlainSdpForDatabaseColumn } from "@/lib/webrtc/sessionDescriptionPayload";
import { resolveWebRtcPeerConnectionConfiguration } from "@/lib/webrtc/getWebRtcIceServersForPeerConnection";
import type { BroadcastPhase } from "@/hooks/useBroadcasterSignaling";
import {
  sendBroadcastEventOnce, parseViewerIceList,
  useWakeLockEffectBody, registerUnloadBeacon,
} from "@/../staging/hooks/broadcasterPeerMapHelpers";

interface UseBroadcasterPeerMapOptions {
  deviceToken: string | null;
  deviceName: string | null;
  localStreamRef: React.RefObject<MediaStream | null>;
  broadcastHomeId: string | null;
  isAcquiring: boolean;
  cameraError: string | null;
  onSessionCreated?: (sessionId: string, homeId: string | null) => void;
  onReacquireCamera?: () => Promise<void>;
  supabaseClient?: SupabaseClient;
}
interface UseBroadcasterPeerMapReturn {
  broadcastPhase: BroadcastPhase;
  peerConnectionState: RTCPeerConnectionState;
  activeSessionId: string | null;
  errorMessage: string | null;
  autoReconnectCount: number;
  startBroadcast: (opts?: { forceRelay?: boolean }) => Promise<void>;
  stopBroadcast: () => Promise<void>;
  resetError: () => Promise<void>;
  replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>;
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
  peerConnectionRef: React.RefObject<RTCPeerConnection | null>;
  viewerCount: number;
}
/** viewer 1명당 관리 정보 — pc=전용 PC, answerApplied=RPC 업로드 완료,
 *  appliedIceKeys=addIceCandidate 한 JSON dedup, createdAt=생성시각(ms), closing=재진입 방지 */
type ViewerEntry = {
  pc: RTCPeerConnection;
  answerApplied: boolean;
  appliedIceKeys: Set<string>;
  createdAt: number;
  closing: boolean;
};
type ServerViewerRow = {
  viewer_connection_id: string;
  offer_sdp: string;
  viewer_ice?: unknown;
  closed?: boolean;
};
/** state 우선순위: failed > disconnected > connecting > connected > new > closed */
const STATE_PRIORITY: Record<RTCPeerConnectionState, number> = {
  failed: 6, disconnected: 5, connecting: 4, connected: 3, new: 2, closed: 1,
};

export function useBroadcasterPeerMap(
  options: UseBroadcasterPeerMapOptions,
): UseBroadcasterPeerMapReturn {
  const {
    deviceToken, localStreamRef, broadcastHomeId, isAcquiring, cameraError,
    onSessionCreated, onReacquireCamera, supabaseClient,
  } = options;
  const supabase = useMemo(
    () => supabaseClient ?? createSupabaseBrowserClient(), [supabaseClient],
  );
  const [broadcastPhase, setBroadcastPhase] = useState<BroadcastPhase>("loading");
  const [peerConnectionState, setPeerConnectionState] = useState<RTCPeerConnectionState>("new");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);

  const viewersRef = useRef<Map<string, ViewerEntry>>(new Map());
  const seenViewerIdsRef = useRef<Set<string>>(new Set()); // close 후 재등장 방지
  const sessionIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInFlightRef = useRef(false); // 네트워크 지연 시 RPC 중복 방지
  const sentinelPcRef = useRef<RTCPeerConnection | null>(null); // lifecycle 훅 호환용 "new" 상태 더미
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const isCleaningUpRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  /* deviceToken 기반 초기 phase */
  useEffect(() => {
    if (broadcastPhase !== "loading") return;
    if (deviceToken) setBroadcastPhase("idle");
  }, [deviceToken, broadcastPhase]);

  /* 카메라 획득 상태 → phase 동기화 */
  useEffect(() => {
    if (isAcquiring && broadcastPhase === "idle") setBroadcastPhase("acquiring");
    if (!isAcquiring && broadcastPhase === "acquiring") {
      if (cameraError) setBroadcastPhase("error");
      else if (localStreamRef.current) setBroadcastPhase("ready");
    }
    if (!isAcquiring && cameraError && broadcastPhase === "connecting") {
      setBroadcastPhase("error");
      setErrorMessage(cameraError);
    }
  }, [isAcquiring, cameraError, broadcastPhase, localStreamRef]);

  /* Wake Lock — live/connecting 동안 */
  useEffect(() => useWakeLockEffectBody(broadcastPhase, wakeLockRef), [broadcastPhase]);

  /** Map 전체를 보고 대표 PC·state 재계산. 뷰어 0명이면 sentinel 노출. */
  const updateRepresentativeState = useCallback(() => {
    const entries = Array.from(viewersRef.current.values());
    setViewerCount(entries.length);
    if (entries.length === 0) {
      peerConnectionRef.current = sentinelPcRef.current;
      setPeerConnectionState("new");
      return;
    }
    peerConnectionRef.current = entries[0].pc;
    if (entries.every((e) => e.pc.connectionState === "connected")) {
      setPeerConnectionState("connected"); return;
    }
    let best: RTCPeerConnectionState = "new";
    let bestP = STATE_PRIORITY.new;
    for (const e of entries) {
      const p = STATE_PRIORITY[e.pc.connectionState];
      if (p > bestP) { bestP = p; best = e.pc.connectionState; }
    }
    setPeerConnectionState(best);
  }, []);

  /** viewer PC close + Map 제거 + (옵션) 서버 close RPC. */
  const closePeer = useCallback(
    (viewerId: string, opts?: { sendCloseRpc?: boolean }) => {
      const entry = viewersRef.current.get(viewerId);
      if (!entry || entry.closing) return;
      entry.closing = true;
      entry.pc.onicecandidate = null;
      entry.pc.onconnectionstatechange = null;
      entry.pc.ontrack = null;
      try { entry.pc.close(); } catch { /* 이미 close — 무시 */ }
      viewersRef.current.delete(viewerId);
      console.info(`[s9-cam] viewer closed viewerId=${viewerId}`);
      if (opts?.sendCloseRpc && deviceToken) {
        /* supabase-js v2 의 rpc 는 PostgrestFilterBuilder (thenable) — .catch() 불가.
         * .then(onFulfilled, onRejected) 로 fire-and-forget + 에러 무시. */
        void supabase.rpc("broadcaster_close_viewer", {
          input_device_token: deviceToken, input_viewer_connection_id: viewerId,
        }).then(() => undefined, () => undefined);
      }
      updateRepresentativeState();
    },
    [deviceToken, supabase, updateRepresentativeState],
  );

  /** 신규 viewer 처리 — PC 생성 → offer 적용 → answer 생성 → RPC 전송. */
  const handleNewViewer = useCallback(
    async (row: ServerViewerRow) => {
      const viewerId = row.viewer_connection_id;
      if (viewersRef.current.has(viewerId)) return;
      if (!deviceToken || !localStreamRef.current) return;
      seenViewerIdsRef.current.add(viewerId);
      try {
        const { rtcConfiguration } = await resolveWebRtcPeerConnectionConfiguration({ forceRelay: false });
        const pc = new RTCPeerConnection(rtcConfiguration);
        /* entry 선등록 — 비동기 중복 진입 방지 */
        const entry: ViewerEntry = {
          pc, answerApplied: false, appliedIceKeys: new Set<string>(),
          createdAt: Date.now(), closing: false,
        };
        viewersRef.current.set(viewerId, entry);
        console.info(`[s9-cam] viewer joined viewerId=${viewerId}`);
        /* 로컬 트랙 attach — 동일 MediaStream 공유 */
        const stream = localStreamRef.current;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        /* ICE candidate → DB */
        pc.onicecandidate = (ev) => {
          if (!ev.candidate) return;
          console.info(`[s9-cam] viewer ICE sent out viewerId=${viewerId}`);
          /* thenable(PostgrestFilterBuilder) — .catch() 불가, .then 으로 무시 */
          void supabase.rpc("add_device_ice_candidate_v2", {
            input_device_token: deviceToken,
            input_viewer_connection_id: viewerId,
            input_candidate: ev.candidate.toJSON(),
          }).then(() => undefined, () => undefined);
        };
        /* connectionstatechange — failed/closed 즉시 close, disconnected 는 10s 유예 */
        let disconnectedAt: number | null = null;
        pc.onconnectionstatechange = () => {
          const s = pc.connectionState;
          updateRepresentativeState();
          if (s === "failed" || s === "closed") {
            closePeer(viewerId, { sendCloseRpc: s === "failed" }); return;
          }
          if (s === "disconnected") {
            disconnectedAt = Date.now();
            setTimeout(() => {
              if (disconnectedAt && pc.connectionState === "disconnected" &&
                  Date.now() - disconnectedAt >= 10_000) {
                closePeer(viewerId, { sendCloseRpc: true });
              }
            }, 10_500);
          } else { disconnectedAt = null; }
        };
        /* remote offer → answer 생성 → 업로드 */
        await pc.setRemoteDescription({ type: "offer", sdp: row.offer_sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const committed = pc.localDescription;
        if (!committed?.sdp) throw new Error("answer SDP 확정 실패");
        /* 55P03 (lock_not_available) 1회 재시도 — R1 RPC 가 의도적으로 RAISE 하여
         * 클라이언트 retry 를 유도. 300ms 후 1회만 재시도, 실패 시 throw → closePeer. */
        const encodedAnswer = encodePlainSdpForDatabaseColumn(committed.sdp);
        const rpcPayload = {
          input_device_token: deviceToken,
          input_viewer_connection_id: viewerId,
          input_answer_sdp: encodedAnswer,
        };
        const first = await supabase.rpc("broadcaster_set_viewer_answer", rpcPayload);
        if (first.error) {
          const code = (first.error as { code?: string }).code;
          if (code === "55P03") {
            console.warn(`[s9-cam] viewer answer 잠금 경쟁 재시도 viewerId=${viewerId}`);
            await new Promise((r) => setTimeout(r, 300));
            const second = await supabase.rpc("broadcaster_set_viewer_answer", rpcPayload);
            if (second.error) throw second.error;
          } else {
            throw first.error;
          }
        }
        entry.answerApplied = true;
        console.info(`[s9-cam] viewer answered viewerId=${viewerId}`);
        /* 이 사이클의 viewer_ice 즉시 흡수 — R1 RPC payload 는 {id, candidate} 래퍼 */
        for (const item of parseViewerIceList(row.viewer_ice)) {
          const key = item.id ?? JSON.stringify(item.candidate);
          if (entry.appliedIceKeys.has(key)) continue;
          entry.appliedIceKeys.add(key);
          try {
            await pc.addIceCandidate(new RTCIceCandidate(item.candidate));
            console.info(`[s9-cam] viewer ICE sent in viewerId=${viewerId}`);
          } catch { /* 중복/무효 — 무시 */ }
        }
        updateRepresentativeState();
      } catch (err) {
        console.error(`[s9-cam] handleNewViewer 실패 viewerId=${viewerId}`, err);
        closePeer(viewerId, { sendCloseRpc: true });
      }
    },
    [deviceToken, localStreamRef, supabase, closePeer, updateRepresentativeState],
  );

  /** 2s 폴링 사이클 — 신규 viewer 추가 + 기존 viewer ICE 흡수 + 사라진 viewer close. */
  const pollViewers = useCallback(async () => {
    if (pollInFlightRef.current) return;
    if (!deviceToken || !sessionIdRef.current) return;
    pollInFlightRef.current = true;
    try {
      const { data, error } = await supabase.rpc("broadcaster_get_viewer_connections", {
        input_device_token: deviceToken, input_session_id: sessionIdRef.current,
      });
      if (error || !data) return;
      const viewers = (data.viewers ?? []) as ServerViewerRow[];
      const serverIds = new Set<string>();
      for (const row of viewers) {
        serverIds.add(row.viewer_connection_id);
        const existing = viewersRef.current.get(row.viewer_connection_id);
        if (!existing) {
          if (seenViewerIdsRef.current.has(row.viewer_connection_id)) continue;
          await handleNewViewer(row);
          continue;
        }
        if (existing.closing) continue;
        /* R1 RPC payload = [{id, candidate}, ...] — candidate 만 꺼내서 addIceCandidate */
        for (const item of parseViewerIceList(row.viewer_ice)) {
          const key = item.id ?? JSON.stringify(item.candidate);
          if (existing.appliedIceKeys.has(key)) continue;
          if (!existing.pc.remoteDescription) continue;
          existing.appliedIceKeys.add(key);
          try { await existing.pc.addIceCandidate(new RTCIceCandidate(item.candidate)); }
          catch { /* 무시 */ }
        }
      }
      /* snapshot 복사 — 순회 중 closePeer 가 Map.delete 해도 안전. 명시성 확보. */
      const localIds = Array.from(viewersRef.current.keys());
      for (const id of localIds) {
        if (!serverIds.has(id)) closePeer(id, { sendCloseRpc: false });
      }
    } catch (err) {
      console.error("[s9-cam] pollViewers 실패", err);
    } finally { pollInFlightRef.current = false; }
  }, [deviceToken, supabase, handleNewViewer, closePeer]);

  /** 방송 시작 — dummy offer 로 세션 생성 후 폴링 개시. */
  const startBroadcast = useCallback(
    async (_opts?: { forceRelay?: boolean }) => {
      if (!deviceToken) return;
      const hasLive = localStreamRef.current?.getTracks().some((t) => t.readyState === "live");
      if (!localStreamRef.current || !hasLive) {
        if (onReacquireCamera) await onReacquireCamera();
        if (!localStreamRef.current) return;
      }
      setBroadcastPhase("connecting");
      setErrorMessage(null);
      try {
        /* dummy PC → offer SDP 추출용 (start_device_broadcast 가 NOT NULL 요구).
         * 누수 방어: createOffer/setLocalDescription 중 throw 되어도 반드시 close.
         * "Cannot create so many PeerConnections" 브라우저 한도 방지. */
        const dummyPc = new RTCPeerConnection();
        let dummySdp: string | undefined;
        try {
          localStreamRef.current.getTracks().forEach((t) =>
            dummyPc.addTransceiver(t.kind, { direction: "sendonly" }));
          const dummyOffer = await dummyPc.createOffer();
          await dummyPc.setLocalDescription(dummyOffer);
          dummySdp = dummyPc.localDescription?.sdp;
        } finally {
          try { dummyPc.close(); } catch { /* 무시 */ }
        }
        if (!dummySdp) throw new Error("dummy offer SDP 추출 실패");
        const { data: r, error: e } = await supabase.rpc("start_device_broadcast", {
          input_device_token: deviceToken,
          input_offer_sdp: encodePlainSdpForDatabaseColumn(dummySdp),
        });
        if (e || !r || r.error) throw new Error(r?.error ?? e?.message ?? "방송 세션 생성 실패");
        const sessionId = r.session_id as string;
        sessionIdRef.current = sessionId;
        setActiveSessionId(sessionId);
        const effectiveHomeId = (r.home_id as string | undefined) ?? broadcastHomeId;
        onSessionCreated?.(sessionId, effectiveHomeId);
        /* 대시보드 session_started 알림 */
        if (effectiveHomeId) sendBroadcastEventOnce(supabase, effectiveHomeId, "session_started", { session_id: sessionId });
        /* sentinel PC — lifecycle 훅이 null 로 오판하지 않게 */
        if (!sentinelPcRef.current) sentinelPcRef.current = new RTCPeerConnection();
        peerConnectionRef.current = sentinelPcRef.current;
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = setInterval(() => void pollViewers(), 2000);
        void pollViewers(); // bootstrap
        setBroadcastPhase("live");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "방송 시작 실패";
        setErrorMessage(msg);
        setBroadcastPhase("error");
      }
    },
    [deviceToken, localStreamRef, onReacquireCamera, supabase, broadcastHomeId, onSessionCreated, pollViewers],
  );

  /** 폴링 중지 + 모든 viewer close + (옵션) 세션 종료 RPC. */
  const cleanupAll = useCallback(
    async (opts: { keepCamera: boolean; sendStopRpc: boolean }) => {
      if (isCleaningUpRef.current) return;
      isCleaningUpRef.current = true;
      try {
        if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
        /* snapshot 복사 — closePeer 가 Map.delete 수행하므로 안전 순회 */
        const cleanupIds = Array.from(viewersRef.current.keys());
        for (const id of cleanupIds) closePeer(id, { sendCloseRpc: false });
        viewersRef.current.clear();
        seenViewerIdsRef.current.clear();
        if (opts.sendStopRpc && deviceToken && sessionIdRef.current) {
          await supabase.rpc("stop_device_broadcast", { input_device_token: deviceToken });
          if (broadcastHomeId) sendBroadcastEventOnce(supabase, broadcastHomeId, "session_stopped", {});
        }
        sessionIdRef.current = null;
        setActiveSessionId(null);
        /* sentinel PC close — 누수 방어. startBroadcast 재호출 시 새로 생성됨. */
        if (sentinelPcRef.current) {
          try { sentinelPcRef.current.close(); } catch { /* 무시 */ }
          sentinelPcRef.current = null;
        }
        peerConnectionRef.current = null;
        if (!opts.keepCamera && localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
        }
        updateRepresentativeState();
      } finally { isCleaningUpRef.current = false; }
    },
    [broadcastHomeId, closePeer, deviceToken, localStreamRef, supabase, updateRepresentativeState],
  );

  const stopBroadcast = useCallback(async () => {
    await cleanupAll({ keepCamera: true, sendStopRpc: true });
    setBroadcastPhase("ready");
    setPeerConnectionState("new");
  }, [cleanupAll]);

  const resetError = useCallback(async () => {
    setErrorMessage(null);
    await cleanupAll({ keepCamera: true, sendStopRpc: false });
    setBroadcastPhase(localStreamRef.current ? "ready" : "idle");
  }, [cleanupAll, localStreamRef]);

  /** 모든 viewer PC 에 새 비디오 트랙 교체. */
  const replaceVideoTrack = useCallback(async (newTrack: MediaStreamTrack) => {
    for (const [, entry] of viewersRef.current) {
      const sender = entry.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        try { await sender.replaceTrack(newTrack); } catch { /* PC closed — 무시 */ }
      }
    }
  }, []);

  /* 언마운트 정리 (stop RPC 는 pagehide/beforeunload 에서 처리) */
  useEffect(() => () => {
    void cleanupAll({ keepCamera: false, sendStopRpc: false });
    if (sentinelPcRef.current) {
      try { sentinelPcRef.current.close(); } catch { /* ignore */ }
      sentinelPcRef.current = null;
    }
  }, [cleanupAll]);

  /* 탭 닫기 시 beacon 으로 stop */
  useEffect(() => registerUnloadBeacon(deviceToken, sessionIdRef), [deviceToken]);

  return {
    broadcastPhase, peerConnectionState, activeSessionId, errorMessage,
    autoReconnectCount: 0,
    startBroadcast, stopBroadcast, resetError, replaceVideoTrack,
    remoteAudioRef, peerConnectionRef, viewerCount,
  };
}

