"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  decodeSdpFromDatabaseColumn,
  encodePlainSdpForDatabaseColumn,
} from "@/lib/webrtc/sessionDescriptionPayload";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  AlertTriangle,
  ArrowRight,
  Baby,
  Droplets,
  Loader2,
  Radio,
  Smartphone,
  Sparkles,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import { playPopSound } from "@/lib/sound/playPopSound";
import { CATVISOR_SOUND_ENABLED_STORAGE_KEY } from "@/lib/sound/soundPreferenceStorageKey";

/** STUN만 사용. 첫 URL은 Google 무료 STUN (요구사항과 동일). */
const WEBRTC_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

type ViewerConnectionPhase =
  | "idle"
  | "watching_for_broadcast"
  | "connecting"
  | "connected"
  | "error";

type LiveSession = {
  id: string;
  cat_id: string | null;
  offer_sdp: string | null;
};

/**
 * 대시보드 카메라 섹션 안에 삽입되는 WebRTC 수신 뷰어.
 * Supabase Realtime 을 통해 live 세션을 자동 감지하고 WebRTC 연결을 맺습니다.
 * homeId 가 없으면 아무것도 렌더링하지 않습니다.
 */
export function CameraLiveViewer() {
  const [connectionPhase, setConnectionPhase] =
    useState<ViewerConnectionPhase>("idle");
  const [homeId, setHomeId] = useState<string | null>(null);
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [careLogPending, setCareLogPending] = useState(false);
  const [careLogMessage, setCareLogMessage] = useState<string | null>(null);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingChannelRef = useRef<RealtimeChannel | null>(null);
  const sessionWatcherRef = useRef<RealtimeChannel | null>(null);

  const supabase = createSupabaseBrowserClient();

  const closePeerConnection = useCallback(async () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (signalingChannelRef.current) {
      await supabase.removeChannel(signalingChannelRef.current);
      signalingChannelRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, [supabase]);

  const connectToLiveSession = useCallback(
    async (session: LiveSession) => {
      if (!session.offer_sdp) return;
      setConnectionPhase("connecting");

      await closePeerConnection();

      try {
        const pc = new RTCPeerConnection({ iceServers: WEBRTC_ICE_SERVERS });
        peerConnectionRef.current = pc;

        const appliedBroadcasterIceKeys = new Set<string>();

        async function applyBroadcasterIceCandidate(
          rawCandidate: RTCIceCandidateInit,
        ) {
          const dedupeKey = JSON.stringify(rawCandidate);
          if (appliedBroadcasterIceKeys.has(dedupeKey)) return;
          appliedBroadcasterIceKeys.add(dedupeKey);
          if (!pc.remoteDescription) return;
          try {
            await pc.addIceCandidate(new RTCIceCandidate(rawCandidate));
          } catch {
            // 중복·순서 문제 등은 무시
          }
        }

        pc.ontrack = ({ streams }) => {
          if (remoteVideoRef.current && streams[0]) {
            remoteVideoRef.current.srcObject = streams[0];
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") {
            setConnectionPhase("connected");
          }
          if (
            pc.connectionState === "failed" ||
            pc.connectionState === "closed" ||
            pc.connectionState === "disconnected"
          ) {
            setConnectionPhase("watching_for_broadcast");
            setLiveSession(null);
            void closePeerConnection();
          }
        };

        const offerInit = decodeSdpFromDatabaseColumn(session.offer_sdp, "offer");
        await pc.setRemoteDescription(new RTCSessionDescription(offerInit));

        const channel = supabase.channel(`viewer-ice-${session.id}`);
        channel.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "ice_candidates",
            filter: `session_id=eq.${session.id}`,
          },
          (payload) => {
            const row = payload.new as {
              sender: string;
              candidate: RTCIceCandidateInit;
            };
            if (row.sender !== "broadcaster") return;
            void applyBroadcasterIceCandidate(row.candidate);
          },
        );

        await new Promise<void>((resolve, reject) => {
          channel.subscribe((status) => {
            if (status === "SUBSCRIBED") resolve();
            if (status === "CHANNEL_ERROR") {
              reject(new Error("ICE 실시간 채널을 열 수 없어요."));
            }
          });
        });

        signalingChannelRef.current = channel;

        const { data: existingBroadcasterIceRows } = await supabase
          .from("ice_candidates")
          .select("candidate")
          .eq("session_id", session.id)
          .eq("sender", "broadcaster")
          .order("created_at", { ascending: true });

        for (const row of existingBroadcasterIceRows ?? []) {
          await applyBroadcasterIceCandidate(
            row.candidate as RTCIceCandidateInit,
          );
        }

        pc.onicecandidate = ({ candidate }) => {
          if (!candidate) return;
          void supabase.from("ice_candidates").insert({
            session_id: session.id,
            sender: "viewer",
            candidate: candidate.toJSON(),
          });
        };

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        const committedAnswer = pc.localDescription;
        if (!committedAnswer?.sdp) {
          throw new Error("로컬 SDP(answer)를 확정할 수 없어요.");
        }

        await supabase
          .from("camera_sessions")
          .update({
            /** answer_sdp 도 순수 SDP 텍스트만 저장 */
            answer_sdp: encodePlainSdpForDatabaseColumn(committedAnswer.sdp),
          })
          .eq("id", session.id);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "연결에 실패했어요.";
        setErrorMessage(message);
        setConnectionPhase("error");
        void closePeerConnection();
      }
    },
    [supabase, closePeerConnection],
  );

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

  const recordCareLog = useCallback(
    async (careKind: "meal" | "water" | "toilet") => {
      if (!homeId) return;
      if (isSoundEnabled) playPopSound();
      setCareLogMessage(null);
      setCareLogPending(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setCareLogMessage("로그인이 필요해요.");
          return;
        }
        const { error } = await supabase.from("cat_care_logs").insert({
          home_id: homeId,
          recorded_by: user.id,
          cat_id: liveSession?.cat_id ?? null,
          care_kind: careKind,
          source: "live_camera_viewer",
          camera_session_id: liveSession?.id ?? null,
        });
        if (error) {
          setCareLogMessage(error.message);
          return;
        }
        const labelByKind: Record<typeof careKind, string> = {
          meal: "맘마 먹기",
          water: "물 마시기",
          toilet: "감자 캐기",
        };
        setCareLogMessage(`「${labelByKind[careKind]}」 기록했어요!`);
        window.setTimeout(() => setCareLogMessage(null), 2200);
      } finally {
        setCareLogPending(false);
      }
    },
    [homeId, isSoundEnabled, liveSession, supabase],
  );

  // 1단계: 내 home_id 가져오기
  useEffect(() => {
    async function fetchHomeId() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("home_id")
        .eq("id", user.id)
        .single();

      if (profile?.home_id) {
        setHomeId(profile.home_id);
      }
    }
    void fetchHomeId();
  }, [supabase]);

  // 2단계: home_id 확보 후 live 세션 감시 시작
  useEffect(() => {
    if (!homeId) return;

    setConnectionPhase("watching_for_broadcast");

    async function loadExistingSession() {
      const { data: sessions } = await supabase
        .from("camera_sessions")
        .select("id, cat_id, offer_sdp")
        .eq("home_id", homeId!)
        .eq("status", "live")
        .not("offer_sdp", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (sessions && sessions.length > 0) {
        const session = sessions[0] as LiveSession;
        setLiveSession(session);
      }
    }

    void loadExistingSession();

    const watcher = supabase
      .channel(`session-watcher-${homeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "camera_sessions",
          filter: `home_id=eq.${homeId}`,
        },
        (payload) => {
          const row = payload.new as {
            status?: string;
            offer_sdp?: string | null;
            id?: string;
            cat_id?: string | null;
          };

          if (
            payload.eventType === "UPDATE" ||
            payload.eventType === "INSERT"
          ) {
            if (row.status === "live" && row.offer_sdp && row.id) {
              setLiveSession({
                id: row.id,
                cat_id: row.cat_id ?? null,
                offer_sdp: row.offer_sdp,
              });
            } else if (row.status === "idle") {
              setLiveSession(null);
              setConnectionPhase("watching_for_broadcast");
              void closePeerConnection();
            }
          }
        },
      )
      .subscribe();

    sessionWatcherRef.current = watcher;

    return () => {
      void supabase.removeChannel(watcher);
      void closePeerConnection();
    };
  }, [homeId, supabase, closePeerConnection]);

  // 3단계: live 세션 감지 → 자동 WebRTC 연결
  useEffect(() => {
    if (!liveSession?.offer_sdp) return;
    if (connectionPhase === "connecting" || connectionPhase === "connected")
      return;

    void connectToLiveSession(liveSession);
  }, [liveSession, connectionPhase, connectToLiveSession]);

  // home_id 없으면 렌더링 안 함 (connectionPhase 는 homeId 확보 직후 useEffect 에서 곧바로 watching_for_broadcast 로 바뀜)
  if (!homeId) return null;

  return (
    <section
      className="w-full rounded-3xl border border-[#4FD1C5]/20 bg-[#F1FBF9] p-4 shadow-lg"
      aria-label="라이브 카메라"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium text-[#1e8f83]">
          <Video
            className="size-5 shrink-0 text-[#4FD1C5]"
            strokeWidth={1.75}
            aria-hidden
          />
          라이브 카메라
        </h2>
        {connectionPhase === "connected" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#4FD1C5] to-[#38BDB0] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-white shadow-lg">
            <Radio className="size-3" strokeWidth={2.5} aria-hidden />
            LIVE
          </span>
        ) : connectionPhase === "connecting" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#4FD1C5]/20 px-3 py-1 text-[0.7rem] font-semibold text-[#1e8f83]">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            연결 중…
          </span>
        ) : (
          <span className="rounded-full bg-slate-200/80 px-3 py-1 text-[0.7rem] font-medium text-slate-500">
            대기 중
          </span>
        )}
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-[#0d1a18] shadow-lg">
        <video
          ref={remoteVideoRef}
          className="size-full object-cover"
          autoPlay
          playsInline
          muted
          aria-label="라이브 카메라 화면"
        />
        {connectionPhase !== "connected" ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl bg-[#0d1a18]/88 p-6 text-center backdrop-blur-[2px]"
            aria-hidden
          >
            {connectionPhase === "watching_for_broadcast" ? (
              <>
                <Smartphone
                  className="size-10 text-[#4FD1C5]"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span className="max-w-[22ch] text-sm leading-relaxed text-slate-300">
                  남는 폰에서 방송을 시작하면 자동으로 연결돼요
                </span>
                <a
                  href="/camera/broadcast"
                  className="inline-flex items-center gap-2 rounded-full border-2 border-[#4FD1C5]/50 bg-gradient-to-r from-[#4FD1C5] to-[#38BDB0] px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-105"
                  target="_blank"
                  rel="noreferrer"
                >
                  방송 시작하러 가기
                  <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
                </a>
              </>
            ) : connectionPhase === "connecting" ? (
              <>
                <Loader2
                  className="size-10 animate-spin text-[#4FD1C5]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="text-sm text-slate-300">연결 중…</span>
              </>
            ) : connectionPhase === "error" ? (
              <>
                <AlertTriangle
                  className="size-10 text-[#FFAB91]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="max-w-[22ch] text-sm text-slate-300">
                  {errorMessage ?? "연결에 실패했어요."}
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative z-50 mt-4 flex flex-col gap-3 rounded-2xl border border-[#4FD1C5]/35 bg-white p-3 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#1e8f83]">
            빠른 케어 기록
          </span>
          <button
            type="button"
            onClick={toggleSoundEnabled}
            className="inline-flex size-9 items-center justify-center rounded-full border border-[#4FD1C5]/35 bg-white text-[#1e8f83] shadow-md transition hover:bg-[#4FD1C5]/10"
            aria-pressed={isSoundEnabled}
            aria-label={isSoundEnabled ? "효과음 끄기" : "효과음 켜기"}
          >
            {isSoundEnabled ? (
              <Volume2 className="size-4" strokeWidth={2} aria-hidden />
            ) : (
              <VolumeX className="size-4" strokeWidth={2} aria-hidden />
            )}
          </button>
        </div>

        <div className="flex flex-row flex-wrap gap-2">
          <button
            type="button"
            disabled={careLogPending}
            onClick={() => void recordCareLog("meal")}
            className="inline-flex min-w-[5.5rem] flex-1 items-center justify-center gap-2 rounded-3xl border border-[#4FD1C5]/30 bg-gradient-to-r from-[#4FD1C5] to-[#38BDB0] px-2 py-3 text-xs font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-50 sm:text-sm"
          >
            <Baby className="size-4 shrink-0" strokeWidth={2} aria-hidden />
            맘마 먹기 🍼
          </button>
          <button
            type="button"
            disabled={careLogPending}
            onClick={() => void recordCareLog("water")}
            className="inline-flex min-w-[5.5rem] flex-1 items-center justify-center gap-2 rounded-3xl border border-sky-200/80 bg-gradient-to-r from-sky-400 to-sky-500 px-2 py-3 text-xs font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-50 sm:text-sm"
          >
            <Droplets className="size-4 shrink-0" strokeWidth={2} aria-hidden />
            물 마시기 💧
          </button>
          <button
            type="button"
            disabled={careLogPending}
            onClick={() => void recordCareLog("toilet")}
            className="inline-flex min-w-[5.5rem] flex-1 items-center justify-center gap-2 rounded-3xl border border-[#FFAB91]/50 bg-gradient-to-r from-[#FFAB91] to-[#FF8A65] px-2 py-3 text-xs font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-50 sm:text-sm"
          >
            <Sparkles className="size-4 shrink-0" strokeWidth={2} aria-hidden />
            감자 캐기 💩
          </button>
        </div>

        {careLogMessage ? (
          <p
            className="text-center text-xs font-medium text-[#1e8f83]"
            role="status"
            aria-live="polite"
          >
            {careLogMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
