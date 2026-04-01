import { buildWebRtcIceServers } from "@/lib/webrtc/buildWebRtcIceServers";

/**
 * `CameraLiveViewer`·`CameraBroadcastClient` 등 브라우저에서
 * `new RTCPeerConnection({ iceServers })` 에 전달할 ICE 서버 목록.
 *
 * - STUN: 항상 포함 (`buildWebRtcIceServers` 참고).
 * - TURN: `.env` / Vercel 의 `NEXT_PUBLIC_WEBRTC_TURN_URLS`·`USERNAME`·`CREDENTIAL` 이
 *   **셋 다** 있을 때만 추가된다. (`NEXT_PUBLIC_*` 는 빌드 시 번들에 박힌다.)
 */
export function getWebRtcIceServersForPeerConnection(): RTCIceServer[] {
  return buildWebRtcIceServers();
}

/**
 * `RTCPeerConnection` 생성자에 넘길 통합 설정 (ICE + 기본 정책).
 */
export function getWebRtcPeerConnectionConfiguration(): RTCConfiguration {
  return {
    iceServers: buildWebRtcIceServers(),
    bundlePolicy: "balanced",
    rtcpMuxPolicy: "require",
  };
}
