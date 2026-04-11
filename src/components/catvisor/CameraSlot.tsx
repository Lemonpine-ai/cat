"use client";

/**
 * CameraSlot — 단일 WebRTC 수신 슬롯 + 양방향 오디오.
 * 기존 CameraLiveViewer 의 connectToLiveSession 로직을 독립 추출.
 *
 * 오디오 기능:
 * - 듣기: 스피커 버튼으로 broadcaster 오디오 음소거/해제
 * - 말하기: 마이크 버튼(PTT)으로 viewer → broadcaster 인터컴
 *   answer 생성 전에 mic track 을 추가하여 재협상 없이 양방향 확보.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  decodeSdpFromDatabaseColumn,
  encodePlainSdpForDatabaseColumn,
} from "@/lib/webrtc/sessionDescriptionPayload";
import { resolveWebRtcPeerConnectionConfiguration } from "@/lib/webrtc/getWebRtcIceServersForPeerConnection";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Loader2, AlertTriangle, Maximize2, Volume2, VolumeX, Mic, MicOff } from "lucide-react";

/* ── 연결 상태 ── */
type SlotPhase = "connecting" | "connected" | "error";

type CameraSlotProps = {
  sessionId: string;
  offerSdp: string;
  deviceName: string;
  onExpand?: () => void;
  onPhaseChange?: (phase: SlotPhase) => void;
};

export function CameraSlot({
  sessionId,
  offerSdp,
  deviceName,
  onExpand,
  onPhaseChange,
}: CameraSlotProps) {
  const supabase = createSupabaseBrowserClient();

  const [phase, setPhase] = useState<SlotPhase>("connecting");
  /* 오디오 상태 */
  const [isMuted, setIsMuted] = useState(true);
  const [isMicOn, setIsMicOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const iceChannelRef = useRef<RealtimeChannel | null>(null);
  /** viewer 마이크 트랙 — enabled 토글로 PTT 구현 */
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const relayRetried = useRef(false);
  /** 연결 타임아웃 — stale 세션에서 무한 대기 방지 (20초) */
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePhase = useCallback(
    (next: SlotPhase) => { setPhase(next); onPhaseChange?.(next); },
    [onPhaseChange],
  );

  /* ── PeerConnection 정리 ── */
  const cleanup = useCallback(async () => {
    /* 연결 타임아웃 해제 */
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    /* 마이크 트랙 해제 */
    if (micTrackRef.current) {
      micTrackRef.current.stop();
      micTrackRef.current = null;
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
      updatePhase("connecting");
      await cleanup();

      /* auth 세션 복원 보장 — RLS 로 보호된 테이블 접근 전 필수 */
      await supabase.auth.getUser();

      try {
        const { rtcConfiguration, turnRelayConfigured } =
          await resolveWebRtcPeerConnectionConfiguration({ forceRelay });
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

        pc.oniceconnectionstatechange = () => {
          const s = pc.iceConnectionState;
          console.log("[CameraSlot] ICE 상태:", s);
          if (s === "connected" || s === "completed") { relayRetried.current = false; updatePhase("connected"); }
          if (s === "failed") reportFailure();
        };

        let graceTimer: ReturnType<typeof setTimeout> | null = null;
        pc.onconnectionstatechange = () => {
          const s = pc.connectionState;
          if (s === "connected") { if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; } updatePhase("connected"); }
          if (s === "failed") { if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; } reportFailure(); }
          if (s === "disconnected" && !reported) {
            if (!graceTimer) {
              graceTimer = setTimeout(() => {
                graceTimer = null;
                if (pc.connectionState === "disconnected") { updatePhase("error"); void cleanup(); }
              }, 5000);
            }
          }
          if (s === "closed") { if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; } if (!reported) { updatePhase("error"); void cleanup(); } }
        };

        /* viewer ICE 후보 → RPC 로 삽입 (직접 INSERT 는 RLS 차단됨) */
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

        /* ② answer 먼저 생성 → DB 저장 (폰이 빨리 받을 수 있도록) */
        console.log("[CameraSlot] ② answer 생성 시작");
        const answer = await pc.createAnswer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
        await pc.setLocalDescription(answer);

        const committed = pc.localDescription;
        if (!committed?.sdp) throw new Error("answer SDP 확정 실패");

        /* answer SDP → RPC 로 저장 (직접 UPDATE 는 RLS 차단될 수 있음) */
        const { data: ansData, error: ansErr } = await supabase.rpc(
          "viewer_update_answer_sdp",
          {
            p_session_id: sessionId,
            p_answer_sdp: encodePlainSdpForDatabaseColumn(committed.sdp),
          },
        );
        if (ansErr) throw new Error(ansErr.message);
        const ansResult = ansData as { success?: boolean; error?: string } | null;
        if (ansResult?.error) throw new Error(ansResult.error);
        console.log("[CameraSlot] ② answer DB 저장 완료 (RPC)");

        /* ③ broadcaster ICE 실시간 구독 (타임아웃 5초 — 실패해도 계속 진행) */
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

        /* ④ 기존 broadcaster ICE 일괄 적용 (정렬 제거 — PostgREST 캐시 문제 방지) */
        const { data: existingIce } = await supabase
          .from("ice_candidates")
          .select("candidate")
          .eq("session_id", sessionId)
          .eq("sender", "broadcaster");
        console.log("[CameraSlot] ④ 기존 broadcaster ICE:", existingIce?.length ?? 0, "건");
        for (const row of existingIce ?? []) {
          await applyIce(row.candidate as RTCIceCandidateInit);
        }
        /* 20초 내 connected 안 되면 타임아웃 → 에러 처리 (stale 세션 대비) */
        connectTimeoutRef.current = setTimeout(() => {
          if (pcRef.current && pcRef.current.connectionState !== "connected") {
            console.warn("[CameraSlot] 연결 타임아웃 (20초)", sessionId);
            updatePhase("error");
            void cleanup();
          }
        }, 20_000);
      } catch (err) {
        console.error("[CameraSlot] 연결 실패:", err);
        updatePhase("error");
        void cleanup();
      }
    },
    [sessionId, offerSdp, supabase, cleanup, updatePhase],
  );

  useEffect(() => {
    void connect();
    return () => { void cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, offerSdp]);

  /* ── 스피커 토글 (broadcaster 오디오 듣기) ── */
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const next = !videoRef.current.muted;
      videoRef.current.muted = next;
      setIsMuted(next);
    }
  }, []);

  /* ── 마이크 토글 (viewer → broadcaster 인터컴) ── */
  const toggleMic = useCallback(async () => {
    /* 이미 마이크 있으면 enabled 토글 */
    if (micTrackRef.current) {
      const next = !micTrackRef.current.enabled;
      micTrackRef.current.enabled = next;
      setIsMicOn(next);
      return;
    }
    /* 최초: 마이크 권한 획득 → addTrack */
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const micTrack = micStream.getAudioTracks()[0];
      if (!micTrack) return;
      micTrack.enabled = true;
      micTrackRef.current = micTrack;
      setIsMicOn(true);
      pc.addTrack(micTrack, micStream);
    } catch {
      /* 마이크 권한 거부 — 무시 */
    }
  }, []);

  /* 버튼 공통 스타일 */
  const ctrlBtn = "pointer-events-auto flex size-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30";

  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[#0d1a18] shadow-lg cursor-pointer"
      onClick={onExpand}
    >
      <video
        ref={videoRef}
        className="size-full object-cover"
        autoPlay
        playsInline
        muted
        controls={false}
      />

      {/* 상태 오버레이 */}
      {phase !== "connected" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0d1a18]/85 backdrop-blur-[2px]">
          {phase === "connecting" ? (
            <>
              <Loader2 className="size-8 animate-spin text-[#4FD1C5]" strokeWidth={1.75} />
              <span className="text-xs text-slate-300">연결 중…</span>
            </>
          ) : (
            <>
              <AlertTriangle className="size-8 text-[#FFAB91]" strokeWidth={1.75} />
              <span className="text-xs text-slate-300">연결 실패</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); relayRetried.current = false; void connect(); }}
                className="mt-1 rounded-full border border-[#4FD1C5]/50 bg-[#1e8f83]/40 px-3 py-1 text-xs font-semibold text-[#4FD1C5]"
              >
                다시 시도
              </button>
            </>
          )}
        </div>
      )}

      {/* 하단 오버레이: 카메라 이름 + 오디오 컨트롤 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex items-end justify-between bg-gradient-to-t from-black/65 via-black/20 to-transparent px-3 pb-2 pt-10">
        <div className="flex items-center gap-1.5">
          {phase === "connected" && (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />
          )}
          <span className="text-xs font-semibold text-white drop-shadow">{deviceName}</span>
          {phase === "connected" && (
            <span className="ml-1 rounded bg-red-600/80 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-white">
              LIVE
            </span>
          )}
        </div>

        {/* 오디오 컨트롤 버튼 */}
        {phase === "connected" && (
          <div className="pointer-events-auto flex gap-1.5">
            {/* 스피커 (듣기) */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              className={ctrlBtn}
              aria-label={isMuted ? "소리 켜기" : "소리 끄기"}
            >
              {isMuted ? <VolumeX size={15} strokeWidth={2} /> : <Volume2 size={15} strokeWidth={2} />}
            </button>
            {/* 마이크 (말하기 — 최초 클릭 시 권한 요청) */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void toggleMic(); }}
              className={`${ctrlBtn} ${isMicOn ? "!bg-red-500/70" : ""}`}
              aria-label={isMicOn ? "마이크 끄기" : "마이크 켜기"}
            >
              {isMicOn ? <Mic size={15} strokeWidth={2} /> : <MicOff size={15} strokeWidth={2} />}
            </button>
          </div>
        )}
      </div>

      {/* 확대 버튼 */}
      {onExpand && phase === "connected" && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onExpand(); }}
          className="absolute right-2 top-2 z-[3] flex size-7 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30"
          aria-label="전체 화면"
        >
          <Maximize2 size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
