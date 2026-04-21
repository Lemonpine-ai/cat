"use client";

/**
 * 카메라 방송 페이지 — UI 래퍼. Multi-Viewer feature flag 분기 포함.
 *
 * - `NEXT_PUBLIC_MULTI_VIEWER=1` 이면 CameraBroadcastClientMulti 렌더.
 * - 그 외(미설정/0)면 기존 CameraBroadcastClient 렌더.
 *
 * 분기 위치를 page.tsx 로 올린 이유:
 *  - CameraBroadcastClient 자체의 내부 구조를 건드리지 않고 훅 교체만으로 실험 가능.
 *  - 배포 시 ENV 토글만으로 롤백 가능.
 *
 * SDP/ICE 주석 (원본 유지):
 *  - offer_sdp: Multi 모드에서는 dummy offer 를 RPC 에 전달하고,
 *    실제 offer 는 viewer → `viewer_connections.offer_sdp` 경로로 흐른다.
 *  - ICE: 브로드캐스터 후보는 `add_device_ice_candidate_v2` RPC
 *    → `viewer_ice_candidates` 테이블 (R1 마이그레이션).
 */

import { CameraBroadcastClient } from "@/app/camera/broadcast/CameraBroadcastClient";
import { CameraBroadcastClientMulti } from "@/../staging/components/broadcast/CameraBroadcastClientMulti";

/** "1" 로 켜면 Multi-Viewer, 그 외엔 기존 1:1 */
const MULTI_VIEWER_ENABLED = process.env.NEXT_PUBLIC_MULTI_VIEWER === "1";

export default function CameraBroadcastPage() {
  return MULTI_VIEWER_ENABLED ? (
    <CameraBroadcastClientMulti />
  ) : (
    <CameraBroadcastClient />
  );
}
