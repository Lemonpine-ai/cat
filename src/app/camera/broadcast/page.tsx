import { CameraBroadcastClient } from "./CameraBroadcastClient";

/**
 * 카메라 방송 페이지 — UI 래퍼만 담당합니다.
 * camera_sessions 저장·시그널링은 CameraBroadcastClient 에서
 * Supabase RPC 로 처리하며, offer/answer SDP 는 sessionDescriptionPayload 로
 * Base64(sdpv2:) 직렬화 후 저장해 파싱 깨짐을 방지합니다.
 */
export default function CameraBroadcastPage() {
  return <CameraBroadcastClient />;
}
