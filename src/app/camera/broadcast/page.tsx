import { CameraBroadcastClient } from "./CameraBroadcastClient";

/**
 * 카메라 방송 페이지 — UI 래퍼만 담당합니다.
 * camera_sessions 저장·시그널링은 CameraBroadcastClient 에서
 * Supabase RPC(start_device_broadcast, get_broadcaster_signaling_state 등)로 처리합니다.
 */
export default function CameraBroadcastPage() {
  return <CameraBroadcastClient />;
}
