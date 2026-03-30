import { CameraBroadcastClient } from "./CameraBroadcastClient";

/**
 * 카메라 방송 페이지 — UI 래퍼만 담당합니다.
 * `offer_sdp` 저장은 CameraBroadcastClient → RPC `start_device_broadcast` 에서
 * **v= 로 시작하는 SDP 본문만** 넣습니다 (JSON.stringify(offer) 금지).
 */
export default function CameraBroadcastPage() {
  return <CameraBroadcastClient />;
}
