/**
 * fetchWebRtcLogs — WebRTC 연결 로그 조회 유틸.
 * 설정 > WebRTC 로그 대시보드에서 사용한다.
 *
 * 설계 포인트:
 *  - RLS 가 own_home SELECT 만 허용하므로 client 에서 home_id 필터링 불필요.
 *  - 기본 50건, 시간 내림차순.
 *  - role/eventType 필터는 optional — 넘기지 않으면 전체 조회.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WebRtcLogEvent,
  WebRtcLogRole,
} from "@/lib/webrtc/webrtcConnectionLogger";

/** 조회 결과 한 행 — DB 컬럼과 1:1 매핑 */
export type WebRtcLogRow = {
  id: number;
  home_id: string;
  device_id: string | null;
  camera_id: string | null;
  role: WebRtcLogRole;
  event_type: WebRtcLogEvent;
  pc_state: string | null;
  error_message: string | null;
  reconnect_attempt: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/** 필터 옵션 — UI 에서 '전체' 는 undefined 로 전달 */
export type WebRtcLogFilter = {
  role?: WebRtcLogRole;
  /** 'errors' = 에러성 이벤트만, 'reconnects' = 재연결성 이벤트만 */
  eventGroup?: "errors" | "reconnects";
  limit?: number;
};

/** 에러성 이벤트 — 빨강 배지 그룹 */
const ERROR_EVENTS: WebRtcLogEvent[] = [
  "failed",
  "error",
  "keepalive_dead",
];

/** 재연결성 이벤트 — 파랑 배지 그룹 */
const RECONNECT_EVENTS: WebRtcLogEvent[] = [
  "ice_restart",
  "full_reconnect",
  "visibility_reconnect",
];

/**
 * WebRTC 연결 로그 조회 — 최근순 정렬.
 * 실패 시 빈 배열 + 경고 로그 (UI 블록 방지).
 */
export async function fetchWebRtcLogs(
  supabase: SupabaseClient,
  filter: WebRtcLogFilter = {},
): Promise<WebRtcLogRow[]> {
  const limit = filter.limit ?? 50;

  try {
    let query = supabase
      .from("webrtc_connection_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    /* role 필터 — 단일 값 매칭 */
    if (filter.role) {
      query = query.eq("role", filter.role);
    }

    /* 이벤트 그룹 필터 — IN 절로 묶기 */
    if (filter.eventGroup === "errors") {
      query = query.in("event_type", ERROR_EVENTS);
    } else if (filter.eventGroup === "reconnects") {
      query = query.in("event_type", RECONNECT_EVENTS);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("[webrtc-logs] 조회 실패:", error.message);
      return [];
    }
    return (data ?? []) as WebRtcLogRow[];
  } catch (err) {
    console.warn("[webrtc-logs] 조회 예외:", err);
    return [];
  }
}
