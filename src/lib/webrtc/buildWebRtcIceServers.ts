/**
 * WebRTC `RTCPeerConnection`용 ICE 서버 목록을 만든다.
 * - STUN: 기본 포함 (NAT 뒤 주소 탐색).
 * - TURN: 선택. 대칭 NAT·모바일 통신사·공용 Wi‑Fi 등에서는 STUN만으로는 P2P가 실패할 수 있어
 *   중계(TURN)가 필요하다. UDP가 막힌 환경은 `turns:`(TLS 443) URL을 함께 넣는 것이 좋다.
 *
 * TURN 환경 변수 (각 항목마다 아래 순으로 먼저 있는 값을 씀):
 * - `WEBRTC_TURN_URLS` / `WEBRTC_TURN_USERNAME` / `WEBRTC_TURN_CREDENTIAL` — 서버(API)에서만 읽히며
 *   Vercel에 넣은 뒤 재배포하면 **빌드 캐시 없이** 런타임에 반영되기 쉽다.
 * - `NEXT_PUBLIC_WEBRTC_TURN_*` — `next build` 시 클라이언트 번들에 인라인된다. 값을 바꾼 뒤에는 **재빌드·재배포**가 필요하다.
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

function stripSurroundingQuotes(value: string): string {
  const t = value.trim();
  if (t.length >= 2) {
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))
    ) {
      return t.slice(1, -1).trim();
    }
  }
  return t;
}

function readOptionalTrimmedEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name];
  if (value === undefined || value === "") return undefined;
  const trimmed = stripSurroundingQuotes(value);
  return trimmed === "" ? undefined : trimmed;
}

let partialTurnEnvWarningShown = false;

/**
 * 필드별로 `WEBRTC_TURN_*` 를 우선하고, 없으면 `NEXT_PUBLIC_WEBRTC_TURN_*` 를 쓴다.
 *
 * 별칭(다른 대시보드·문서에서 흔한 이름):
 * - URL: `*_TURN_URL` 단수 → `*_TURN_URLS` 와 동일 취급
 * - 비밀: `*_TURN_PASSWORD` → `*_TURN_CREDENTIAL` 과 동일 취급
 */
export function resolveWebRtcTurnTripleFromEnv(env: NodeJS.ProcessEnv): {
  urls: string | undefined;
  username: string | undefined;
  credential: string | undefined;
} {
  const urls =
    readOptionalTrimmedEnv(env, "WEBRTC_TURN_URLS") ??
    readOptionalTrimmedEnv(env, "NEXT_PUBLIC_WEBRTC_TURN_URLS") ??
    readOptionalTrimmedEnv(env, "WEBRTC_TURN_URL") ??
    readOptionalTrimmedEnv(env, "NEXT_PUBLIC_WEBRTC_TURN_URL");

  const username =
    readOptionalTrimmedEnv(env, "WEBRTC_TURN_USERNAME") ??
    readOptionalTrimmedEnv(env, "NEXT_PUBLIC_WEBRTC_TURN_USERNAME");

  const credential =
    readOptionalTrimmedEnv(env, "WEBRTC_TURN_CREDENTIAL") ??
    readOptionalTrimmedEnv(env, "NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL") ??
    readOptionalTrimmedEnv(env, "WEBRTC_TURN_PASSWORD") ??
    readOptionalTrimmedEnv(env, "NEXT_PUBLIC_WEBRTC_TURN_PASSWORD");

  return { urls, username, credential };
}

function warnIfPartialTurnEnv(
  env: NodeJS.ProcessEnv,
): void {
  if (typeof window === "undefined") return;
  if (partialTurnEnvWarningShown) return;
  const { urls, username, credential } = resolveWebRtcTurnTripleFromEnv(env);
  const setCount = [urls, username, credential].filter(Boolean).length;
  if (setCount > 0 && setCount < 3) {
    partialTurnEnvWarningShown = true;
    console.warn(
      "[CATvisor WebRTC] TURN 환경 변수가 일부만 설정되었습니다. " +
        "WEBRTC_TURN_URLS·WEBRTC_TURN_USERNAME·WEBRTC_TURN_CREDENTIAL 또는 " +
        "NEXT_PUBLIC_WEBRTC_TURN_* 세트를 모두 채워야 TURN(릴레이)이 추가됩니다. (.env.local.example 참고)",
    );
  }
}

/**
 * @param env 기본값 `process.env`. 테스트에서만 다른 객체를 넘겨 TURN 조합을 검증할 수 있다.
 */
/**
 * TURN 세트가 모두 채워졌는지 (UI·로그용).
 */
export function isWebRtcTurnEnvComplete(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const { urls, username, credential } = resolveWebRtcTurnTripleFromEnv(env);
  return Boolean(urls && username && credential);
}

export function buildWebRtcIceServers(
  env: NodeJS.ProcessEnv = process.env,
): RTCIceServer[] {
  warnIfPartialTurnEnv(env);

  const servers: RTCIceServer[] = [...DEFAULT_STUN_SERVERS];

  const { urls: turnUrlsRaw, username: turnUsername, credential: turnCredential } =
    resolveWebRtcTurnTripleFromEnv(env);

  if (turnUrlsRaw && turnUsername && turnCredential) {
    const turnUrlList = parseTurnUrlList(turnUrlsRaw);
    const expandedUrls = expandTurnTransportVariants(turnUrlList);
    if (expandedUrls.length > 0) {
      /** Metered 등은 동일 자격증명으로 여러 turn/turns URL 을 한 항목의 urls 배열로 쓰는 것을 권장한다. */
      servers.push({
        urls: expandedUrls,
        username: turnUsername,
        credential: turnCredential,
      });
    }
  }

  return servers;
}

/**
 * TURN URL 하나에서 TCP·TLS 변형을 자동 생성한다.
 * 예: `turn:host:443` → `turn:host:443`, `turn:host:443?transport=tcp`, `turns:host:443?transport=tcp`
 * 이미 transport= 파라미터가 있거나 turns: 로 시작하는 URL 은 건드리지 않는다.
 * 같은 Wi-Fi 안에서도 AP 격리·대칭 NAT 환경에서 UDP 가 차단되면 TCP/TLS 가 필요하다.
 */
function expandTurnTransportVariants(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  function add(url: string) {
    if (!seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }

  for (const url of urls) {
    add(url);

    // 이미 transport 지정이 있거나 turns: 이면 변형 생성 불필요
    if (url.includes("transport=") || url.startsWith("turns:")) continue;
    if (!url.startsWith("turn:")) continue;

    // turn:host:port → turn:host:port?transport=tcp
    const tcpUrl = url.includes("?")
      ? `${url}&transport=tcp`
      : `${url}?transport=tcp`;
    add(tcpUrl);

    // turn:host:port → turns:host:port?transport=tcp (TLS)
    const tlsUrl = `turns:${url.slice("turn:".length)}`;
    const tlsTcpUrl = tlsUrl.includes("?")
      ? `${tlsUrl}&transport=tcp`
      : `${tlsUrl}?transport=tcp`;
    add(tlsTcpUrl);
  }

  return result;
}

/** 쉼표·줄바꿈으로 구분된 TURN URL 목록 (Vercel 다줄 붙여넣기 대응) */
function parseTurnUrlList(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  return normalized
    .split(/[\n,]+/)
    .map((part) => stripSurroundingQuotes(part).trim())
    .filter(Boolean);
}
