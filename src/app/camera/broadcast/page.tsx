import { CameraBroadcastClient } from "./CameraBroadcastClient";

/**
 * 카메라 방송 페이지 — UI 래퍼만 담당합니다.
 * - `offer_sdp`: CameraBroadcastClient → RPC `start_device_broadcast` 에 **SDP 본문만** (v=…).
 * - ICE: 브로드캐스터 후보는 `add_device_ice_candidate` RPC → `ice_candidates` 테이블,
 *   뷰어 후보는 `get_broadcaster_signaling_state` 폴링으로 수신 (대시보드 쪽은 CameraLiveViewer).
 */
export default function CameraBroadcastPage() {
  return <CameraBroadcastClient />;
}
