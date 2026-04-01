/**
 * 모바일 원격 디버깅 시 Safari/Chrome 개발자 도구에서 단계를 추적하기 위한 WebRTC 로그.
 * 접두사로 필터링: [CATvisor WebRTC]
 */
const LOG_PREFIX = "[CATvisor WebRTC]";

export type WebRtcDebugRole = "broadcaster" | "viewer";

export function logWebRtcDebug(
  role: WebRtcDebugRole,
  step: string,
  detail?: Record<string, unknown>,
): void {
  if (typeof console === "undefined" || typeof console.info !== "function") {
    return;
  }
  const payload = {
    role,
    step,
    at: new Date().toISOString(),
    ...detail,
  };
  console.info(LOG_PREFIX, step, payload);
}

export function summarizeIceServersForLog(servers: RTCIceServer[]): {
  count: number;
  stunHosts: string[];
  hasTurn: boolean;
} {
  const stunHosts: string[] = [];
  let hasTurn = false;
  for (const entry of servers) {
    const raw = entry.urls;
    const list = Array.isArray(raw) ? raw : [raw];
    for (const u of list) {
      const s = typeof u === "string" ? u : "";
      if (/^turns?:/i.test(s)) {
        hasTurn = true;
      }
      if (/^stun:/i.test(s)) {
        try {
          const hostPart = s.replace(/^stun:/i, "").split("?")[0];
          stunHosts.push(hostPart);
        } catch {
          stunHosts.push(s);
        }
      }
    }
  }
  return {
    count: servers.length,
    stunHosts: stunHosts.slice(0, 8),
    hasTurn,
  };
}
