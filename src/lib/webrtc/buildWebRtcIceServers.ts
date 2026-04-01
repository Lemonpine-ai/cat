/**
 * WebRTC `RTCPeerConnection`용 ICE 서버 목록을 만든다.
 * - STUN: 기본 포함 (NAT 뒤 주소 탐색).
 * - TURN: 선택. 대칭 NAT·모바일 통신사·공용 Wi‑Fi 등에서는 STUN만으로는 P2P가 실패할 수 있어
 *   중계(TURN)가 필요하다. UDP가 막힌 환경은 `turns:`(TLS 443) URL을 함께 넣는 것이 좋다.
 *
 * 클라이언트 번들에 포함되므로 `NEXT_PUBLIC_*` 만 사용한다.
 */

/**
 * Google 공개 STUN — 외부망·NAT 뒤에서 peer 후보 탐색에 사용.
 * `stun:stun.l.google.com:19302` 는 WebRTC 예제에서 가장 널리 쓰이는 기본값이다.
 */
const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

function readOptionalTrimmedEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name];
  if (value === undefined || value === "") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * @param env 기본값 `process.env`. 테스트에서만 다른 객체를 넘겨 TURN 조합을 검증할 수 있다.
 */
export function buildWebRtcIceServers(
  env: NodeJS.ProcessEnv = process.env,
): RTCIceServer[] {
  const servers: RTCIceServer[] = [...DEFAULT_STUN_SERVERS];

  const turnUrlsRaw = readOptionalTrimmedEnv(
    env,
    "NEXT_PUBLIC_WEBRTC_TURN_URLS",
  );
  const turnUsername = readOptionalTrimmedEnv(
    env,
    "NEXT_PUBLIC_WEBRTC_TURN_USERNAME",
  );
  const turnCredential = readOptionalTrimmedEnv(
    env,
    "NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL",
  );

  if (turnUrlsRaw && turnUsername && turnCredential) {
    const turnUrlList = turnUrlsRaw
      .split(",")
      .map((urlPart) => urlPart.trim())
      .filter(Boolean);

    for (const turnUrl of turnUrlList) {
      servers.push({
        urls: turnUrl,
        username: turnUsername,
        credential: turnCredential,
      });
    }
  }

  return servers;
}
