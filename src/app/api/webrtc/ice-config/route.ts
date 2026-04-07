import {
  buildWebRtcIceServers,
  isWebRtcTurnEnvComplete,
} from "@/lib/webrtc/buildWebRtcIceServers";

export const dynamic = "force-dynamic";

/**
 * Cloudflare Calls TURN API로 임시 credential을 발급받는다.
 * CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN 이 둘 다 있어야 시도한다.
 */
async function fetchCloudflareTurnCredentials(): Promise<RTCIceServer[] | null> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN?.trim();
  if (!keyId || !apiToken) return null;

  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: 86400 }),
    },
  );

  if (!res.ok) {
    console.error(`[ice-config] Cloudflare TURN API ${res.status}: ${await res.text()}`);
    return null;
  }

  const data = (await res.json()) as {
    iceServers?: { urls: string[]; username: string; credential: string };
  };

  if (!data.iceServers) return null;

  return [
    {
      urls: data.iceServers.urls,
      username: data.iceServers.username,
      credential: data.iceServers.credential,
    },
  ];
}

/**
 * 브라우저가 `RTCPeerConnection` 에 쓸 ICE 목록을 서버 `process.env` 기준으로 내려준다.
 *
 * 우선순위:
 * 1. Cloudflare TURN (CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN)
 * 2. Static TURN (WEBRTC_TURN_URLS + USERNAME + CREDENTIAL)
 * 3. STUN only
 */
export async function GET() {
  const env = process.env;
  const baseIceServers = buildWebRtcIceServers(env);
  let turnRelayConfigured = isWebRtcTurnEnvComplete(env);

  // Cloudflare TURN이 설정되어 있으면 동적 credential을 발급받아 추가
  const cfTurn = await fetchCloudflareTurnCredentials();
  if (cfTurn) {
    turnRelayConfigured = true;
    return Response.json(
      {
        iceServers: [...baseIceServers, ...cfTurn],
        turnRelayConfigured: true,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  return Response.json(
    { iceServers: baseIceServers, turnRelayConfigured },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
