/**
 * webrtcConnectionLogger — WebRTC 연결 이벤트를 Supabase 에 기록하는 유틸.
 * Fire-and-forget 패턴 — UI 렌더/연결 흐름을 절대 블록하지 않는다.
 * 호출부에서 await 하지 말고 void 로 처리할 것.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** 로그를 발생시킨 주체 — 슬롯 뷰어/단일 뷰어/방송기 */
export type WebRtcLogRole = "viewer_slot" | "viewer_live" | "broadcaster";

/** 로그 이벤트 종류 — 엔진 액션과 PC state, 에러 모두 포함 */
export type WebRtcLogEvent =
  | "connected"
  | "disconnected"
  | "failed"
  | "closed"
  | "ice_restart"
  | "full_reconnect"
  | "connection_recovered"
  | "keepalive_dead"
  | "visibility_reconnect"
  | "error";

/** 로거 입력 — 호출부에서 직접 채워 넘긴다 */
export type WebRtcLogInput = {
  homeId: string;
  deviceId: string;
  cameraId: string | null;
  role: WebRtcLogRole;
  eventType: WebRtcLogEvent;
  pcState?: RTCPeerConnectionState | null;
  errorMessage?: string | null;
  reconnectAttempt?: number;
  metadata?: Record<string, unknown> | null;
};

/**
 * WebRTC 이벤트 기록 — fire-and-forget.
 * 실패해도 UI 에 영향을 주지 않도록 내부에서 예외를 삼킨다.
 */
export async function logWebRtcEvent(
  supabase: SupabaseClient,
  input: WebRtcLogInput,
): Promise<void> {
  try {
    await supabase.from("webrtc_connection_logs").insert({
      home_id: input.homeId,
      device_id: input.deviceId,
      camera_id: input.cameraId,
      role: input.role,
      event_type: input.eventType,
      pc_state: input.pcState ?? null,
      error_message: input.errorMessage ?? null,
      reconnect_attempt: input.reconnectAttempt ?? 0,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    /* 로깅 실패는 UI 에 영향 없음 — 경고만 */
    console.warn("[webrtc-log] 기록 실패:", err);
  }
}

/**
 * broadcaster 전용 로그 기록 — device_token 기반 SECURITY DEFINER RPC 호출.
 *
 * 배경:
 *  - broadcaster(카메라 폰)는 로그인하지 않은 anon 세션에서 device_token 으로만 동작.
 *  - webrtc_connection_logs 의 INSERT RLS 는 auth.uid() 기반이라 broadcaster 는 무조건 막힘.
 *  - 이 함수는 `log_device_webrtc_event` RPC (SECURITY DEFINER) 를 호출해 RLS 를 우회한다.
 *  - RPC 내부에서 camera_devices.device_token 유효성을 검증하므로 남용 위험 없음.
 *
 * fire-and-forget — UI 블록 금지, 실패 시 경고만 출력.
 */
export async function logBroadcasterWebRtcEvent(
  supabase: SupabaseClient,
  deviceToken: string,
  cameraId: string | null,
  eventType: WebRtcLogEvent,
  extra?: {
    pcState?: RTCPeerConnectionState | null;
    errorMessage?: string | null;
    reconnectAttempt?: number;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    /* device_token 은 slice 금지 — RPC 내부 UUID 캐스팅에 원본이 필요함 */
    await supabase.rpc("log_device_webrtc_event", {
      p_device_token: deviceToken,
      p_camera_id: cameraId,
      p_event_type: eventType,
      p_pc_state: extra?.pcState ?? null,
      p_error_message: extra?.errorMessage ?? null,
      p_reconnect_attempt: extra?.reconnectAttempt ?? 0,
      p_metadata: extra?.metadata ?? null,
    });
  } catch (err) {
    /* 로깅 실패는 UI 에 영향 없음 — 경고만 */
    console.warn("[webrtc-log] broadcaster 기록 실패:", err);
  }
}
