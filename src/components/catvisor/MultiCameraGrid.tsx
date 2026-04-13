"use client";

/**
 * MultiCameraGrid — v2 카피 개선
 * C1(카피): 따뜻한 안내 문구, 기계적 톤 제거
 * P1(심리): 대기 화면에서 불안감 대신 안내감 전달
 * 로직/기능 변경 없음, 문구와 UI 텍스트만 업데이트
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CameraSlot } from "@/components/catvisor/CameraSlot";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Smartphone, ArrowRight, Video } from "lucide-react";

const MAX_SLOTS = 4;

type LiveSession = {
  id: string;
  offer_sdp: string;
  device_name: string;
};

type MultiCameraGridProps = {
  homeId: string | null;
};

export function MultiCameraGrid({ homeId }: MultiCameraGridProps) {
  const supabase = createSupabaseBrowserClient();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const watcherRef = useRef<RealtimeChannel | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  /* ── live 세션 초기 로드 + Realtime 감시 ── */
  useEffect(() => {
    if (!homeId) return;

    async function loadSessions() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn("[MultiCameraGrid] auth 유저 없음 — 세션 조회 건너뜀");
        return;
      }

      const { data, error } = await supabase
        .from("camera_sessions")
        .select("id, offer_sdp")
        .eq("home_id", homeId!)
        .eq("status", "live")
        .not("offer_sdp", "is", null)
        .limit(MAX_SLOTS);

      if (error) {
        console.error("[MultiCameraGrid] 세션 조회 실패:", error.message, error.code);
        return;
      }
      if (!data) return;

      console.log("[MultiCameraGrid] 세션 조회 결과:", data.length, "건");

      const next = data.map((row, idx) => ({
        id: row.id,
        offer_sdp: row.offer_sdp!,
        device_name: `카메라 ${idx + 1}`,
      }));

      setSessions((prev) => {
        const prevIds = new Set(prev.map((s) => s.id));
        const nextIds = new Set(next.map((s) => s.id));
        const hasNewSession = next.some((s) => !prevIds.has(s.id));
        const hasRemovedSession = prev.some((s) => !nextIds.has(s.id));
        if (hasNewSession || hasRemovedSession) {
          setFailedIds(new Set());
        }
        return next;
      });
      setExpandedId((prev) => (prev && !next.some((s) => s.id === prev) ? null : prev));
    }
    void loadSessions();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_IN") {
          console.log("[MultiCameraGrid] SIGNED_IN 감지 → 세션 재조회");
          void loadSessions();
        }
      },
    );

    const watcher = supabase
      .channel(`multi-cam-${homeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "camera_sessions", filter: `home_id=eq.${homeId}` },
        () => {
          void loadSessions();
        },
      )
      .subscribe();

    watcherRef.current = watcher;

    const broadcastCh = supabase
      .channel(`cam_session_broadcast_${homeId}`)
      .on("broadcast", { event: "session_started" }, () => {
        console.log("[MultiCameraGrid] session_started 수신 → 세션 재조회");
        void loadSessions();
      })
      .on("broadcast", { event: "session_stopped" }, () => {
        console.log("[MultiCameraGrid] session_stopped 수신 → 세션 재조회");
        void loadSessions();
      })
      .subscribe();

    const refreshCh = supabase
      .channel(`cam_session_refresh_${homeId}`)
      .on("broadcast", { event: "session_refreshed" }, (event) => {
        const payload = event.payload as { session_id?: string; offer_sdp?: string } | undefined;
        if (!payload?.session_id || !payload?.offer_sdp) return;
        console.log("[MultiCameraGrid] session_refreshed 수신 →", payload.session_id);
        setSessions([{
          id: payload.session_id,
          offer_sdp: payload.offer_sdp,
          device_name: "카메라 1",
        }]);
        setFailedIds(new Set());
        setExpandedId(null);
      })
      .subscribe();

    return () => {
      authSub.unsubscribe();
      void supabase.removeChannel(watcher);
      void supabase.removeChannel(broadcastCh);
      void supabase.removeChannel(refreshCh);
      watcherRef.current = null;
    };
  }, [homeId, supabase]);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const failedIdsRef = useRef(failedIds);
  failedIdsRef.current = failedIds;

  /* 폴링 fallback */
  useEffect(() => {
    if (!homeId) return;
    const fallback = setInterval(() => {
      void (async () => {
        const { data } = await supabase
          .from("camera_sessions")
          .select("id")
          .eq("home_id", homeId)
          .eq("status", "live")
          .not("offer_sdp", "is", null)
          .limit(1);
        const curSessions = sessionsRef.current;
        const curFailedIds = failedIdsRef.current;
        const visibleCount = curSessions.filter((s) => !curFailedIds.has(s.id)).length;
        const hasNewLiveSession = data ? data.some((d: { id: string }) => !curSessions.some((s) => s.id === d.id)) : false;
        if (data && data.length > 0 && (visibleCount === 0 || hasNewLiveSession)) {
          const { data: fresh } = await supabase
            .from("camera_sessions")
            .select("id, offer_sdp")
            .eq("home_id", homeId)
            .eq("status", "live")
            .not("offer_sdp", "is", null)
            .limit(MAX_SLOTS);
          if (fresh && fresh.length > 0) {
            const freshSessions = fresh.map((row, idx) => ({
              id: row.id,
              offer_sdp: row.offer_sdp!,
              device_name: `카메라 ${idx + 1}`,
            }));
            setSessions(freshSessions);
            setFailedIds(new Set());
          }
        }
      })();
    }, 3000);
    return () => clearInterval(fallback);
  }, [homeId, supabase]);

  const handleSlotPhase = useCallback((sessionId: string, phase: "connecting" | "connected" | "error") => {
    if (phase === "error") {
      setFailedIds((prev) => new Set(prev).add(sessionId));
    }
  }, []);

  const visibleSessions = sessions.filter((s) => !failedIds.has(s.id));

  if (!homeId) return null;

  /* 확대 모드 */
  if (expandedId) {
    const target = sessions.find((s) => s.id === expandedId);
    if (!target) {
      setExpandedId(null);
      return null;
    }
    return (
      <section className="w-full" aria-label="카메라 확대 보기">
        <button
          type="button"
          onClick={() => setExpandedId(null)}
          className="mb-2 rounded-full border border-[#4FD1C5]/40 bg-white px-3 py-1 text-xs font-semibold text-[#1e8f83] shadow transition hover:bg-[#4FD1C5]/10"
        >
          ← 전체 보기
        </button>
        <CameraSlot
          sessionId={target.id}
          offerSdp={target.offer_sdp}
          deviceName={target.device_name}
          homeId={homeId}
        />
      </section>
    );
  }

  /* ── 대기 화면 — v2 따뜻한 문구 ── */
  if (visibleSessions.length === 0) {
    return (
      <section
        className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl bg-[#0d1a18] p-10 text-center shadow-lg"
        aria-label="카메라 대기"
      >
        <Smartphone className="size-10 text-[#4FD1C5]" strokeWidth={1.5} />
        {/* C1: 따뜻하고 쉬운 안내 문구 */}
        <span className="max-w-[24ch] text-sm leading-relaxed text-slate-300">
          다른 폰을 카메라로 쓸 수 있어요
        </span>
        <a
          href="/camera/broadcast"
          className="inline-flex items-center gap-2 rounded-full border-2 border-[#4FD1C5]/50 bg-gradient-to-r from-[#4FD1C5] to-[#38BDB0] px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-105"
          target="_blank"
          rel="noreferrer"
        >
          {/* C1: "방송 시작하러 가기" → "카메라 연결하기" */}
          카메라 연결하기
          <ArrowRight className="size-4" strokeWidth={2} />
        </a>
      </section>
    );
  }

  /* 그리드 */
  const gridCols =
    visibleSessions.length === 1
      ? "grid-cols-1"
      : "grid-cols-1 sm:grid-cols-2";

  return (
    <section className="w-full" aria-label="멀티 카메라 그리드">
      <div className="mb-3 flex items-center justify-between px-0.5">
        {/* C1: "LIVE CAM" → "우리집 카메라" */}
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-[#1e8f83]">
          <Video className="size-4 text-[#4FD1C5]" strokeWidth={2} />
          우리집 카메라
          <span className="ml-1 rounded-full bg-red-500/12 px-2 py-0.5 text-[0.6rem] font-bold uppercase text-red-600">
            {visibleSessions.length}대
          </span>
        </h2>
      </div>

      <div className={`grid ${gridCols} gap-2`}>
        {visibleSessions.map((s) => (
          <CameraSlot
            key={s.id}
            sessionId={s.id}
            offerSdp={s.offer_sdp}
            deviceName={s.device_name}
            homeId={homeId}
            onExpand={() => setExpandedId(s.id)}
            onPhaseChange={(phase) => handleSlotPhase(s.id, phase)}
          />
        ))}
      </div>
    </section>
  );
}
