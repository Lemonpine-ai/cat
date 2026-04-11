"use client";

/**
 * MultiCameraGrid — 최대 4대 카메라 동시 표시 그리드.
 * live 세션을 Supabase Realtime 으로 감시하고, 각 세션을 CameraSlot 에 위임한다.
 * 기존 CameraLiveViewer 는 수정하지 않는다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CameraSlot } from "@/components/catvisor/CameraSlot";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Smartphone, ArrowRight, Video } from "lucide-react";

/* 최대 동시 표시 수 */
const MAX_SLOTS = 4;

type LiveSession = {
  id: string;
  offer_sdp: string;
  device_name: string;
};

type MultiCameraGridProps = {
  /** 사용자의 home_id — 없으면 렌더하지 않음 */
  homeId: string | null;
};

export function MultiCameraGrid({ homeId }: MultiCameraGridProps) {
  const supabase = createSupabaseBrowserClient();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const watcherRef = useRef<RealtimeChannel | null>(null);
  /* 확대 중인 슬롯 (null 이면 그리드 모드) */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /* 연결 실패(스테일)한 세션 id — 그리드에서 숨김 */
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  /* ── live 세션 초기 로드 + Realtime 감시 ── */
  useEffect(() => {
    if (!homeId) return;

    /* 초기 조회: 현재 live 인 세션 최대 4개 */
    async function loadSessions() {
      /* auth 세션 복원 보장 — 이걸 안 하면 JWT 없이 쿼리해서 RLS 가 전부 차단 */
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      /*
       * CameraLiveViewer 와 동일한 컬럼만 SELECT (id, offer_sdp)
       * device_id 는 PostgREST 에서 접근 불가 — SELECT 에 넣으면 쿼리 자체가 실패
       * status='live' 필터로 스테일 세션 제외되므로 updated_at 정렬 사용 가능
       */
      const { data, error } = await supabase
        .from("camera_sessions")
        .select("id, offer_sdp")
        .eq("home_id", homeId!)
        .eq("status", "live")
        .not("offer_sdp", "is", null)
        .order("updated_at", { ascending: false })
        .limit(MAX_SLOTS);

      if (error || !data) return;

      const next = data.map((row, idx) => ({
        id: row.id,
        offer_sdp: row.offer_sdp!,
        device_name: `카메라 ${idx + 1}`,
      }));
      setSessions(next);
      /* 새 세션 목록이면 이전 실패 기록 초기화 */
      setFailedIds(new Set());
      setExpandedId((prev) => (prev && !next.some((s) => s.id === prev) ? null : prev));
    }
    void loadSessions();

    /* Realtime: 세션 추가/종료 감지 */
    const watcher = supabase
      .channel(`multi-cam-${homeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "camera_sessions", filter: `home_id=eq.${homeId}` },
        () => {
          /* 세션 변경 감지 시 목록 전체 재조회 (device_name 포함) */
          void loadSessions();
        },
      )
      .subscribe();

    watcherRef.current = watcher;

    return () => {
      void supabase.removeChannel(watcher);
      watcherRef.current = null;
    };
  }, [homeId, supabase]);

  /* SECURITY DEFINER RPC 로 생성된 세션은 Realtime 이벤트가 안 올 수 있으므로 폴링 보완 */
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
        /* live 세션이 있는데 현재 표시 중인 게 없으면 전체 재조회 */
        if (data && data.length > 0 && sessions.length === 0) {
          const { data: fresh } = await supabase
            .from("camera_sessions")
            .select("id, offer_sdp")
            .eq("home_id", homeId)
            .eq("status", "live")
            .not("offer_sdp", "is", null)
            .order("updated_at", { ascending: false })
            .limit(MAX_SLOTS);
          if (fresh && fresh.length > 0) {
            setSessions(fresh.map((row, idx) => ({
              id: row.id,
              offer_sdp: row.offer_sdp!,
              device_name: `카메라 ${idx + 1}`,
            })));
            setFailedIds(new Set());
          }
        }
      })();
    }, 3000);
    return () => clearInterval(fallback);
  }, [homeId, supabase, sessions.length]);

  /* 스테일 세션이 에러 나면 그리드에서 제거하는 콜백 */
  const handleSlotPhase = useCallback((sessionId: string, phase: "connecting" | "connected" | "error") => {
    if (phase === "error") {
      setFailedIds((prev) => new Set(prev).add(sessionId));
    }
  }, []);

  /* 실제 표시할 세션 (에러 난 스테일 세션 제외) */
  const visibleSessions = sessions.filter((s) => !failedIds.has(s.id));

  /* homeId 없으면 미렌더 */
  if (!homeId) return null;

  /* ── 확대 모드 ── */
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
        />
      </section>
    );
  }

  /* ── 대기 화면: 표시할 세션 없음 ── */
  if (visibleSessions.length === 0) {
    return (
      <section
        className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl bg-[#0d1a18] p-10 text-center shadow-lg"
        aria-label="카메라 대기"
      >
        <Smartphone className="size-10 text-[#4FD1C5]" strokeWidth={1.5} />
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
          <ArrowRight className="size-4" strokeWidth={2} />
        </a>
      </section>
    );
  }

  /* ── 그리드 레이아웃 (1~4대) ── */
  const gridCols =
    visibleSessions.length === 1
      ? "grid-cols-1"
      : "grid-cols-1 sm:grid-cols-2";

  return (
    <section className="w-full" aria-label="멀티 카메라 그리드">
      {/* 헤더 */}
      <div className="mb-3 flex items-center justify-between px-0.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-[#1e8f83]">
          <Video className="size-4 text-[#4FD1C5]" strokeWidth={2} />
          LIVE CAM
          <span className="ml-1 rounded-full bg-red-500/12 px-2 py-0.5 text-[0.6rem] font-bold uppercase text-red-600">
            {visibleSessions.length}대
          </span>
        </h2>
      </div>

      {/* 그리드 */}
      <div className={`grid ${gridCols} gap-2`}>
        {visibleSessions.map((s) => (
          <CameraSlot
            key={s.id}
            sessionId={s.id}
            offerSdp={s.offer_sdp}
            deviceName={s.device_name}
            onExpand={() => setExpandedId(s.id)}
            onPhaseChange={(phase) => handleSlotPhase(s.id, phase)}
          />
        ))}
      </div>
    </section>
  );
}
