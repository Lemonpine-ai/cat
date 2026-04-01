import {
  buildWebRtcIceServers,
  isWebRtcTurnEnvComplete,
} from "@/lib/webrtc/buildWebRtcIceServers";

/**
 * `CameraLiveViewer`·`CameraBroadcastClient` 등 브라우저에서
 * `new RTCPeerConnection({ iceServers })` 에 전달할 ICE 서버 목록.
 *
 * - STUN: 항상 포함 (`buildWebRtcIceServers` 참고).
 * - TURN: `WEBRTC_TURN_*` 또는 `NEXT_PUBLIC_WEBRTC_TURN_*` 가 **셋 다** 있을 때만 추가.
 */
export function getWebRtcIceServersForPeerConnection(): RTCIceServer[] {
  return buildWebRtcIceServers();
}

function buildRtcConfigurationWithIceServers(
  iceServers: RTCIceServer[],
): RTCConfiguration {
  return {
    iceServers,
    /** 기본 0 — TURN 과 함께 큰 pool 은 일부 환경에서 ICE 수집이 길어지거나 실패하는 경우가 있어 두지 않는다. */
    bundlePolicy: "balanced",
    rtcpMuxPolicy: "require",
  };
}

/**
 * `RTCPeerConnection` 생성자에 넘길 통합 설정 (ICE + 기본 정책).
 * 로컬·폴백용. 배포에서는 `resolveWebRtcPeerConnectionConfiguration` 사용을 권장한다.
 */
export function getWebRtcPeerConnectionConfiguration(): RTCConfiguration {
  return buildRtcConfigurationWithIceServers(buildWebRtcIceServers());
}

export type ResolvedWebRtcPeerConnectionConfiguration = {
  rtcConfiguration: RTCConfiguration;
  /** TURN 릴레이 항목이 ICE 목록에 포함되었는지 (서버 env 또는 번들 기준). */
  turnRelayConfigured: boolean;
};

/**
 * 서버 `/api/webrtc/ice-config` 에서 최신 `WEBRTC_TURN_*` 를 반영한 ICE 목록을 가져온다.
 * 실패 시(오프라인 등) 클라이언트 번들의 `buildWebRtcIceServers()` 로 폴백한다.
 */
export async function resolveWebRtcPeerConnectionConfiguration(): Promise<ResolvedWebRtcPeerConnectionConfiguration> {
  if (typeof window === "undefined") {
    const env = process.env;
    return {
      rtcConfiguration: buildRtcConfigurationWithIceServers(
        buildWebRtcIceServers(env),
      ),
      turnRelayConfigured: isWebRtcTurnEnvComplete(env),
    };
  }

  try {
    const response = await fetch("/api/webrtc/ice-config", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error(`ice-config ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error("ice-config 응답이 JSON 이 아닙니다.");
    }
    const payload = (await response.json()) as {
      iceServers?: RTCIceServer[];
      turnRelayConfigured?: boolean;
    };
    const iceServers = payload.iceServers ?? buildWebRtcIceServers();
    return {
      rtcConfiguration: buildRtcConfigurationWithIceServers(iceServers),
      turnRelayConfigured: Boolean(payload.turnRelayConfigured),
    };
  } catch {
    return {
      rtcConfiguration: getWebRtcPeerConnectionConfiguration(),
      turnRelayConfigured: isWebRtcTurnEnvComplete(),
    };
  }
}
