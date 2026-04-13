"use client";

/**
 * MultiCameraGrid — v2 카피 개선
 * C1(카피): 따뜻한 안내 문구, 기계적 톤 제거
 * P1(심리): 대기 화면에서 불안감 대신 안내감 전달
 * 로직/기능 변경 없음, 문구와 UI 텍스트만 업데이트
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CameraSlot } from "@/components/catvisor/CameraSlot";
import { resolveWebRtcPeerConnectionConfiguration } from "@/lib/webrtc/getWebRtcIceServersForPeerConnection";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Smartphone, ArrowRight, Video } from "lucide-react";

const MAX_SLOTS = 4;
/** 2대 동시 연결 시 stagger 간격 (ms) */
const STAGGER_DELAY_MS = 2000;

type LiveSession = {
  id: string;
  offer_sdp: string;
  device_name: string;
};

/** 카메라 전체 상태 — CatStatusBoard에 전달용 */
export type CameraAggregateStatus = {
  /** 연결된 카메라 수 */
  connectedCount: number;
  /** 하나라도 움직임 감지 중인지 */
  hasMotion: boolean;
};

type MultiCameraGridProps = {
  homeId: string | null;
  /** 카메라 상태 변경 시 호출 */
  onCameraStatusChange?: (status: CameraAggregateStatus) => void;
};

export function MultiCameraGrid({ homeId, onCameraStatusChange }: MultiCameraGridProps) {
  /* supabase 클라이언트를 useMemo로 안정화 — 매 렌더마다 새 인스턴스 생성 방지 */
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const watcherRef = useRef<RealtimeChannel | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  /* 카메라별 연결/모션 상태 추적 (CatStatusBoard용) */
  const connectedIdsRef = useRef<Set<string>>(new Set());
  const motionMapRef = useRef<Map<string, boolean>>(new Map());

  /* ICE config 캐시 — 전체 카메라가 공유 (중복 fetch 방지) */
  const [iceConfig, setIceConfig] = useState<{ rtcConfiguration: RTCConfiguration; turnRelayConfigured: boolean } | null>(null);
  useEffect(() => {
    resolveWebRtcPeerConnectionConfiguration()
      .then(({ rtcConfiguration, turnRelayConfigured }) =>
        setIceConfig({ rtcConfiguration, turnRelayConfigured }),
      )
      .catch(() => { /* 실패 시 각 슬롯이 직접 fetch */ });
  }, []);

  /* loadSessions 디바운스 — Realtime 이벤트 중복 호출 방지 */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function debouncedLoadSessions(loadFn: () => Promise<void>) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void loadFn(); }, 300);
  }
  /* debounceRef 언마운트 시 정리 — stale 타이머 방지 */
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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
        /*
         * ★ 기존 세션 객체 재사용 — offer_sdp 참조가 바뀌면
         * CameraSlot의 useEffect가 재실행되어 WebRTC 재연결 발생.
         * ID와 offer_sdp 내용이 같으면 기존 객체를 그대로 유지한다.
         */
        const prevMap = new Map(prev.map((s) => [s.id, s]));
        const merged = next.map((s) => {
          const existing = prevMap.get(s.id);
          if (existing && existing.offer_sdp === s.offer_sdp) {
            return existing; /* 기존 참조 유지 → useEffect 재실행 안 됨 */
          }
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
          /* 디바운스: 여러 채널이 동시에 트리거해도 300ms 내 1회만 실행 */
          debouncedLoadSessions(loadSessions);
        },
      )
      .subscribe();

    watcherRef.current = watcher;

    const broadcastCh = supabase
      .channel(`cam_session_broadcast_${homeId}`)
      .on("broadcast", { event: "session_started" }, () => {
        console.log("[MultiCameraGrid] session_started 수신 → 세션 재조회");
        debouncedLoadSessions(loadSessions);
      })
      .on("broadcast", { event: "session_stopped" }, () => {
        console.log("[MultiCameraGrid] session_stopped 수신 → 세션 재조회");
        debouncedLoadSessions(loadSessions);
      })
      .subscribe();

    /*
     * session_refreshed: 카메라 전환 시 offer가 바뀔 때 사용.
     * 기존 세션 목록을 1개로 덮어쓰지 않고, 해당 세션만 업데이트.
     * (이전에는 setSessions([1개])로 덮어써서 다른 카메라 연결이 끊어짐)
     *
     * ⚠ 알려진 제한: 같은 sessionId에서 offer_sdp만 교체되는 경우,
     * CameraSlot의 useWebRtcSlotConnection useEffect는 sessionId dep만
     * 감시하므로 자동 재연결이 일어나지 않음. 현재는 session_refreshed 시
     * 새 sessionId가 발급되므로 문제없으나, 추후 같은 ID 재사용 시 대응 필요.
     */
    const refreshCh = supabase
      .channel(`cam_session_refresh_${homeId}`)
      .on("broadcast", { event: "session_refreshed" }, (event) => {
        const payload = event.payload as { session_id?: string; offer_sdp?: string } | undefined;
        if (!payload?.session_id || !payload?.offer_sdp) return;
        console.log("[MultiCameraGrid] session_refreshed 수신 →", payload.session_id);
        /* 기존 세션 목록에서 해당 세션만 교체 (다른 세션은 유지) */
        setSessions((prev) => {
          const exists = prev.some((s) => s.id === payload.session_id);
          if (exists) {
            return prev.map((s) =>
              s.id === payload.session_id
                ? { ...s, offer_sdp: payload.offer_sdp! }
                : s
            );
          }
          /* 새 세션이면 추가 */
          return [...prev, {
            id: payload.session_id!,
            offer_sdp: payload.offer_sdp!,
            device_name: `카메라 ${prev.length + 1}`,
          }];
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
            /*
             * ★ prevMap 병합 패턴 — loadSessions와 동일.
             * 기존 세션 객체를 재사용하여 offer_sdp 참조 변경에 의한
             * CameraSlot useEffect 재실행(WebRTC 재연결)을 방지한다.
             */
            setSessions((prev) => {
              const prevMap = new Map(prev.map((s) => [s.id, s]));
              const merged = freshSessions.map((s) => {
                const existing = prevMap.get(s.id);
                if (existing && existing.offer_sdp === s.offer_sdp) {
                  return existing; /* 기존 참조 유지 → useEffect 재실행 안 됨 */
                }
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

  /** 카메라 상태 집계 → 상위 컴포넌트에 전달 */
  const reportAggregateStatus = useCallback(() => {
    const connectedCount = connectedIdsRef.current.size;
    let hasMotion = false;
    motionMapRef.current.forEach((v) => { if (v) hasMotion = true; });
    onCameraStatusChange?.({ connectedCount, hasMotion });
  }, [onCameraStatusChange]);

  const handleSlotPhase = useCallback((sessionId: string, phase: "connecting" | "connected" | "error") => {
    if (phase === "error") {
      /* 에러 — 실패 목록에 추가하고 연결/모션 상태 제거 */
      setFailedIds((prev) => new Set(prev).add(sessionId));
      connectedIdsRef.current.delete(sessionId);
      motionMapRef.current.delete(sessionId);
    } else if (phase === "connected") {
      /* 연결 완료 — 연결 목록에 추가 */
      connectedIdsRef.current.add(sessionId);
    } else {
      /* 연결 중 — 아직 미확정이므로 기존 상태 초기화 */
      connectedIdsRef.current.delete(sessionId);
      motionMapRef.current.delete(sessionId);
    }
    reportAggregateStatus();
  }, [reportAggregateStatus]);

  /** 카메라별 모션 변경 핸들러 */
  const handleSlotMotion = useCallback((sessionId: string, hasMotion: boolean) => {
    motionMapRef.current.set(sessionId, hasMotion);
    reportAggregateStatus();
  }, [reportAggregateStatus]);

  /* 세션 목록 변경 시 사라진 세션의 상태 정리 */
  useEffect(() => {
    const currentIds = new Set(sessions.map((s) => s.id));
    let changed = false;
    connectedIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) { connectedIdsRef.current.delete(id); changed = true; }
    });
    motionMapRef.current.forEach((_, id) => {
      if (!currentIds.has(id)) { motionMapRef.current.delete(id); changed = true; }
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
        <CameraSlot
          sessionId={target.id}
          offerSdp={target.offer_sdp}
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
        {visibleSessions.map((s, idx) => (
          <CameraSlot
            key={s.id}
            sessionId={s.id}
            offerSdp={s.offer_sdp}
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
