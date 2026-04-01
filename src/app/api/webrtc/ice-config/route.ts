import {
  buildWebRtcIceServers,
  isWebRtcTurnEnvComplete,
} from "@/lib/webrtc/buildWebRtcIceServers";

export const dynamic = "force-dynamic";

/**
 * 브라우저가 `RTCPeerConnection` 에 쓸 ICE 목록을 서버 `process.env` 기준으로 내려준다.
 * `WEBRTC_TURN_*` 는 빌드 인라인 없이 Vercel 환경 변수만 갱신·재배포해도 반영되기 쉽다.
 */
export async function GET() {
  const env = process.env;
  const iceServers = buildWebRtcIceServers(env);
  const turnRelayConfigured = isWebRtcTurnEnvComplete(env);

  return Response.json(
    { iceServers, turnRelayConfigured },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
