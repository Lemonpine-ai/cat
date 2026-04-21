"use client";

/**
 * MultiCameraGridMulti — Multi-Viewer(R3) 용 카메라 그리드.
 *
 * 기존 MultiCameraGrid 를 그대로 복사했고 Multi 모드에 맞춰 아래를 조정했다:
 *   - camera_sessions SELECT 에서 offer_sdp 제거 (id 만 가져옴)
 *   - session_refreshed broadcast payload 는 session_id 만 읽음 (offer_sdp 무시)
 *   - CameraSlot → CameraSlotMulti 로 교체, offerSdp prop 제거
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CameraSlotMulti } from "@/../staging/components/catvisor/CameraSlotMulti";
import { resolveWebRtcPeerConnectionConfiguration } from "@/lib/webrtc/getWebRtcIceServersForPeerConnection";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Smartphone, ArrowRight, Video } from "lucide-react";

const MAX_SLOTS = 4;
/** 2대 동시 연결 시 stagger 간격 (ms) */
const STAGGER_DELAY_MS = 2000;

type LiveSessionLite = {
  id: string;
  device_name: string;
};

export type CameraAggregateStatus = {
  connectedCount: number;
  hasMotion: boolean;
};

type MultiCameraGridMultiProps = {
  homeId: string | null;
  onCameraStatusChange?: (status: CameraAggregateStatus) => void;
};

export function MultiCameraGridMulti({
  homeId,
  onCameraStatusChange,
}: MultiCameraGridMultiProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [sessions, setSessions] = useState<LiveSessionLite[]>([]);
  const watcherRef = useRef<RealtimeChannel | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  /* 카메라별 연결/모션 상태 추적 */
  const connectedIdsRef = useRef<Set<string>>(new Set());
  const motionMapRef = useRef<Map<string, boolean>>(new Map());

  /* ICE config 공유 캐시 */
  const [iceConfig, setIceConfig] = useState<{
    rtcConfiguration: RTCConfiguration;
    turnRelayConfigured: boolean;
  } | null>(null);
  useEffect(() => {
    resolveWebRtcPeerConnectionConfiguration()
      .then(({ rtcConfiguration, turnRelayConfigured }) =>
        setIceConfig({ rtcConfiguration, turnRelayConfigured }),
      )
      .catch(() => { /* 실패 시 각 슬롯이 직접 fetch */ });
  }, []);

  /* loadSessions 디바운스 + 언마운트 정리 */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function debouncedLoadSessions(loadFn: () => Promise<void>) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void loadFn(); }, 300);
  }
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  /* ── live 세션 초기 로드 + Realtime 감시 ── */
  useEffect(() => {
    if (!homeId) return;

    async function loadSessions() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn("[MultiCameraGridMulti] auth 유저 없음 — 세션 조회 건너뜀");
        return;
      }

      /* Multi 모드: offer_sdp 제거, id 만 */
      const { data, error } = await supabase
        .from("camera_sessions")
        .select("id")
        .eq("home_id", homeId!)
        .eq("status", "live")
        .limit(MAX_SLOTS);

      if (error) {
        console.error("[MultiCameraGridMulti] 세션 조회 실패:", error.message, error.code);
        return;
      }
      if (!data) return;

      const next = data.map((row, idx) => ({
        id: row.id as string,
        device_name: `카메라 ${idx + 1}`,
      }));

      setSessions((prev) => {
        /* 기존 세션 객체 재사용 — id 가 같으면 참조 유지, 새 객체는 추가 */
        const prevMap = new Map(prev.map((s) => [s.id, s]));
        const merged = next.map((s) => {
          const existing = prevMap.get(s.id);
          if (existing) return existing;
          return s;
        });
        const nextIds = new Set(next.map((s) => s.id));
        const hasNewSession = next.some((s) => !prevMap.has(s.id));
        const hasRemovedSession = prev.some((s) => !nextIds.has(s.id));
        if (hasNewSession || hasRemovedSession) {
          setFailedIds(new Set());
        }
        return merged;
      });
      setExpandedId((prev) =>
        prev && !next.some((s) => s.id === prev) ? null : prev,
      );
    }
    void loadSessions();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_IN") {
          console.log("[MultiCameraGridMulti] SIGNED_IN → 세션 재조회");
          void loadSessions();
        }
      },
    );

    const watcher = supabase
      .channel(`multi-cam-multi-${homeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "camera_sessions",
          filter: `home_id=eq.${homeId}`,
        },
        () => {
          debouncedLoadSessions(loadSessions);
        },
      )
      .subscribe();

    watcherRef.current = watcher;

    const broadcastCh = supabase
      .channel(`cam_session_broadcast_multi_${homeId}`)
      .on("broadcast", { event: "session_started" }, () => {
        console.log("[MultiCameraGridMulti] session_started → 세션 재조회");
        debouncedLoadSessions(loadSessions);
      })
      .on("broadcast", { event: "session_stopped" }, () => {
        console.log("[MultiCameraGridMulti] session_stopped → 세션 재조회");
        debouncedLoadSessions(loadSessions);
      })
      .subscribe();

    /*
     * Multi 모드: session_refreshed 이벤트에서는 session_id 만 읽는다.
     * offer_sdp 는 뷰어가 직접 생성하므로 payload 에 실려 와도 무시.
     * 세션 목록에 없는 id 면 "새 세션 진입" 으로 처리, 있으면 그대로 둔다.
     */
    const refreshCh = supabase
      .channel(`cam_session_refresh_multi_${homeId}`)
      .on("broadcast", { event: "session_refreshed" }, (event) => {
        const payload = event.payload as { session_id?: string } | undefined;
        if (!payload?.session_id) return;
        const sid = payload.session_id;
        console.log("[MultiCameraGridMulti] session_refreshed →", sid);
        setSessions((prev) => {
          if (prev.some((s) => s.id === sid)) return prev;
          return [
            ...prev,
            { id: sid, device_name: `카메라 ${prev.length + 1}` },
          ];
        });
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

  /* 폴링 콜백 안에서 최신값을 쓰기 위한 ref — effect 로 동기화 */
  const sessionsRef = useRef(sessions);
  const failedIdsRef = useRef(failedIds);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  useEffect(() => {
    failedIdsRef.current = failedIds;
  }, [failedIds]);

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
          .limit(1);
        const curSessions = sessionsRef.current;
        const curFailedIds = failedIdsRef.current;
        const visibleCount = curSessions.filter((s) => !curFailedIds.has(s.id)).length;
        const hasNewLiveSession = data
          ? data.some((d: { id: string }) => !curSessions.some((s) => s.id === d.id))
          : false;
        if (data && data.length > 0 && (visibleCount === 0 || hasNewLiveSession)) {
          const { data: fresh } = await supabase
            .from("camera_sessions")
            .select("id")
            .eq("home_id", homeId)
            .eq("status", "live")
            .limit(MAX_SLOTS);
          if (fresh && fresh.length > 0) {
            const freshSessions = fresh.map((row, idx) => ({
              id: row.id as string,
              device_name: `카메라 ${idx + 1}`,
            }));
            setSessions((prev) => {
              const prevMap = new Map(prev.map((s) => [s.id, s]));
              const merged = freshSessions.map((s) => {
                const existing = prevMap.get(s.id);
                if (existing) return existing;
                return s;
              });
              return merged;
            });
            setFailedIds(new Set());
          }
        }
      })();
    }, 3000);
    return () => clearInterval(fallback);
  }, [homeId, supabase]);

  /** 집계 상태 → 상위 전달 */
  const reportAggregateStatus = useCallback(() => {
    const connectedCount = connectedIdsRef.current.size;
    let hasMotion = false;
    motionMapRef.current.forEach((v) => {
      if (v) hasMotion = true;
    });
    onCameraStatusChange?.({ connectedCount, hasMotion });
  }, [onCameraStatusChange]);

  const handleSlotPhase = useCallback(
    (sessionId: string, phase: "connecting" | "connected" | "error") => {
      if (phase === "error") {
        setFailedIds((prev) => new Set(prev).add(sessionId));
        connectedIdsRef.current.delete(sessionId);
        motionMapRef.current.delete(sessionId);
      } else if (phase === "connected") {
        connectedIdsRef.current.add(sessionId);
      } else {
        connectedIdsRef.current.delete(sessionId);
        motionMapRef.current.delete(sessionId);
      }
      reportAggregateStatus();
    },
    [reportAggregateStatus],
  );

  const handleSlotMotion = useCallback(
    (sessionId: string, hasMotion: boolean) => {
      motionMapRef.current.set(sessionId, hasMotion);
      reportAggregateStatus();
    },
    [reportAggregateStatus],
  );

  /* 사라진 세션의 상태 정리 */
  useEffect(() => {
    const currentIds = new Set(sessions.map((s) => s.id));
    let changed = false;
    connectedIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) {
        connectedIdsRef.current.delete(id);
        changed = true;
      }
    });
    motionMapRef.current.forEach((_, id) => {
      if (!currentIds.has(id)) {
        motionMapRef.current.delete(id);
        changed = true;
      }
    });
    if (changed) reportAggregateStatus();
  }, [sessions, reportAggregateStatus]);

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
        <CameraSlotMulti
          sessionId={target.id}
          deviceName={target.device_name}
          homeId={homeId}
          rtcConfiguration={iceConfig?.rtcConfiguration ?? null}
          turnRelayConfigured={iceConfig?.turnRelayConfigured}
          onPhaseChange={(phase) => handleSlotPhase(target.id, phase)}
          onMotionChange={(m) => handleSlotMotion(target.id, m)}
        />
      </section>
    );
  }

  /* 대기 화면 */
  if (visibleSessions.length === 0) {
    return (
      <section
        className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl bg-[#0d1a18] p-10 text-center shadow-lg"
        aria-label="카메라 대기"
      >
        <Smartphone className="size-10 text-[#4FD1C5]" strokeWidth={1.5} />
        <span className="max-w-[24ch] text-sm leading-relaxed text-slate-300">
          다른 폰을 카메라로 쓸 수 있어요
        </span>
        <a
          href="/camera/broadcast"
          className="inline-flex items-center gap-2 rounded-full border-2 border-[#4FD1C5]/50 bg-gradient-to-r from-[#4FD1C5] to-[#38BDB0] px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-105"
          target="_blank"
          rel="noreferrer"
        >
          카메라 연결하기
          <ArrowRight className="size-4" strokeWidth={2} />
        </a>
      </section>
    );
  }

  const gridCols =
    visibleSessions.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";

  return (
    <section className="w-full" aria-label="멀티 카메라 그리드">
      <div className="mb-3 flex items-center justify-between px-0.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-[#1e8f83]">
          <Video className="size-4 text-[#4FD1C5]" strokeWidth={2} />
          우리집 카메라
          <span className="ml-1 rounded-full bg-red-500/12 px-2 py-0.5 text-[0.6rem] font-bold uppercase text-red-600">
            {visibleSessions.length}대
          </span>
        </h2>
      </div>

      <div className={`grid ${gridCols} gap-2`}>
        {visibleSessions.map((s, idx) => (
          <CameraSlotMulti
            key={s.id}
            sessionId={s.id}
            deviceName={s.device_name}
            homeId={homeId}
            rtcConfiguration={iceConfig?.rtcConfiguration ?? null}
            turnRelayConfigured={iceConfig?.turnRelayConfigured}
            delayMs={idx * STAGGER_DELAY_MS}
            onExpand={() => setExpandedId(s.id)}
            onPhaseChange={(phase) => handleSlotPhase(s.id, phase)}
            onMotionChange={(m) => handleSlotMotion(s.id, m)}
          />
        ))}
      </div>
    </section>
  );
}
