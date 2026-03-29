import { CameraBroadcastClient } from "./CameraBroadcastClient";

/**
 * 카메라 방송 페이지 — UI 래퍼만 담당합니다.
 * camera_sessions 저장·시그널링은 CameraBroadcastClient 에서
 * Supabase RPC 로 처리하며, offer/answer SDP 는 rawv1(Base64 원문 SDP)로 저장합니다.
 */
export default function CameraBroadcastPage() {
  return <CameraBroadcastClient />;
}
