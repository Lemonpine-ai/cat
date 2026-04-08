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

  /* ── live 세션 초기 로드 + Realtime 감시 ── */
  useEffect(() => {
    if (!homeId) return;

    /* 초기 조회: 현재 live 인 세션 최대 4개 */
    async function loadSessions() {
      /* 원본 CameraLiveViewer 와 동일한 컬럼만 조회 (device_id 는 없을 수 있음) */
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

  /* ── 대기 화면: 세션 없음 ── */
  if (sessions.length === 0) {
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
    sessions.length === 1
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
            {sessions.length}대
          </span>
        </h2>
      </div>

      {/* 그리드 */}
      <div className={`grid ${gridCols} gap-2`}>
        {sessions.map((s) => (
          <CameraSlot
            key={s.id}
            sessionId={s.id}
            offerSdp={s.offer_sdp}
            deviceName={s.device_name}
            onExpand={() => setExpandedId(s.id)}
          />
        ))}
      </div>
    </section>
  );
}
