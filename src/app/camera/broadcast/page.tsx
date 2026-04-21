"use client";

import { CameraBroadcastClient } from "./CameraBroadcastClient";
import { CameraBroadcastClientMulti } from "@/../staging/components/broadcast/CameraBroadcastClientMulti";

/**
 * 카메라 방송 페이지 — Multi-Viewer feature flag 분기.
 *
 * - `NEXT_PUBLIC_MULTI_VIEWER=1` → CameraBroadcastClientMulti (peerConnectionMap)
 * - 그 외 → 기존 CameraBroadcastClient (1:1)
 *
 * 기존 1:1 경로:
 * - `offer_sdp`: CameraBroadcastClient → RPC `start_device_broadcast` 에 SDP 본문만.
 * - ICE: 브로드캐스터 후보는 `add_device_ice_candidate` RPC → `ice_candidates` 테이블.
 *
 * Multi 경로:
 * - dummy offer 로 session 생성, viewer 별 독립 PC 가 answer 처리.
 * - ICE: `add_device_ice_candidate_v2` RPC (viewer_connection_id 바인딩).
 */
const MULTI_VIEWER_ENABLED = process.env.NEXT_PUBLIC_MULTI_VIEWER === "1";

export default function CameraBroadcastPage() {
  return MULTI_VIEWER_ENABLED ? <CameraBroadcastClientMulti /> : <CameraBroadcastClient />;
}
