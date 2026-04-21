"use client";

/**
 * useWebRtcLiveConnectionMulti — Multi-Viewer(R3) live 뷰어 어댑터.
 *
 * 기존 useWebRtcLiveConnection 과 동일한 반환 시그니처를 유지하되,
 * WebRTC 연결 본체는 useViewerPeerConnectionMulti 에 위임한다.
 * 이 훅은 "home_id → live session id 감시" 부분만 맡는다.
 *
 * 주의: camera_sessions SELECT 시 offer_sdp 컬럼은 **제외**.
 * Multi 모드에서는 offer 를 뷰어가 직접 만들기 때문에 DB 에 저장된
 * broadcaster offer 는 사용하지 않는다 (불필요한 페이로드 트래픽).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  useViewerPeerConnectionMulti,
  type ViewerConnectionPhase,
} from "@/../staging/hooks/useViewerPeerConnectionMulti";

/* 기존 훅과 호환되는 외부용 phase 타입 */
export type LegacyViewerConnectionPhase =
  | "idle"
  | "watching_for_broadcast"
  | "connecting"
  | "connected"
  | "error";

export type LiveSessionLite = {
  id: string;
  cat_id: string | null;
};

/** Multi 확장: too_many_viewers 를 바깥으로도 노출 (오버레이에서 안내 메시지용) */
export type MultiConnectionPhase = LegacyViewerConnectionPhase | "too_many_viewers";

/**
 * Multi 내부 phase → 기존 시그니처와 호환되는 외부 phase 로 매핑.
 * too_many_viewers 만 별도 노출하고 그 외는 기존 4단계로 축약한다.
 */
function mapToExternalPhase(
  internal: ViewerConnectionPhase,
  hasSession: boolean,
): MultiConnectionPhase {
  if (internal === "too_many_viewers") return "too_many_viewers";
  if (internal === "connected") return "connected";
  if (internal === "error") return "error";
  if (internal === "idle") {
    return hasSession ? "connecting" : "watching_for_broadcast";
  }
  /* creating / awaiting_answer / connecting → connecting 으로 합침 */
  return "connecting";
}

export function useWebRtcLiveConnectionMulti(homeId: string | null) {
  /* supabase 클라이언트 안정화 */
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [liveSession, setLiveSession] = useState<LiveSessionLite | null>(null);
  const sessionWatcherRef = useRef<RealtimeChannel | null>(null);

  /* ── 세션 감시: homeId 확보 후 live 세션 자동 감지 ── */
  useEffect(() => {
    if (!homeId) return;

    /* 기존 live 세션 조회 — offer_sdp 제외, id/cat_id/status/created_at 만 */
    void (async () => {
      const { data } = await supabase
        .from("camera_sessions")
        .select("id, cat_id, status, created_at")
        .eq("home_id", homeId)
        .eq("status", "live")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data?.[0]) {
        setLiveSession({
          id: data[0].id as string,
          cat_id: (data[0].cat_id as string | null) ?? null,
        });
      }
    })();

    /* Realtime: camera_sessions 변경 감시 */
    const watcher = supabase
      .channel(`session-watcher-multi-${homeId}`)
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
            id?: string;
            cat_id?: string | null;
          };
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            if (row.status === "live" && row.id) {
              setLiveSession({
                id: row.id,
                cat_id: row.cat_id ?? null,
              });
            } else if (row.status === "idle") {
              setLiveSession(null);
            }
          }
        },
      )
      .subscribe();
    sessionWatcherRef.current = watcher;

    return () => {
      void supabase.removeChannel(watcher);
    };
  }, [homeId, supabase]);

  /* ── WebRTC 연결 위임 ── */
  const {
    videoRef,
    phase: internalPhase,
    errorMessage,
    reconnect,
  } = useViewerPeerConnectionMulti({
    sessionId: liveSession?.id ?? null,
    role: "viewer_live",
    homeId,
    onPhaseChange: undefined,
  });

  /* 외부 호환용 phase 매핑 */
  const connectionPhase = mapToExternalPhase(internalPhase, liveSession != null);

  /* 수동 재연결 — 기존 훅 호환: 에러 상태 해제 */
  const retryConnection = useCallback(() => {
    reconnect();
  }, [reconnect]);

  return {
    videoRef,
    connectionPhase,
    errorMessage,
    retryConnection,
    liveSession,
  };
}
