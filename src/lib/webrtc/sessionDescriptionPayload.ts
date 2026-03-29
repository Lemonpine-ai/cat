/**
 * WebRTC SessionDescription 을 DB(TEXT)에 넣을 때 줄바꿈·이스케이프 깨짐을 막기 위한 유틸.
 * - 신규 저장: sdpv2: 접두사 + UTF-8 JSON 의 Base64 (SDP 원문이 JSON 이스케이프로 손상되지 않음)
 * - 구버전: JSON 문자열 그대로 파싱 후 SDP 줄만 정규화
 */

const SDP_DATABASE_PREFIX = "sdpv2:" as const;

/** DB/네트워크에서 잘못 들어온 리터럴 "\\r\\n" 등을 실제 줄바꿈으로 복구합니다. */
function repairLiteralEscapesInSdpText(sdpText: string): string {
  return sdpText
    .replace(/\\r\\n/g, "\r\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r");
}

/**
 * SDP 본문을 RFC 4566 에 맞게 CRLF 줄바꿈으로 통일하고 앞뒤 공백을 제거합니다.
 */
export function normalizeSdpLineEndings(sdpText: string): string {
  const repaired = repairLiteralEscapesInSdpText(sdpText.trim());
  if (!repaired) {
    return "";
  }
  const lines = repaired
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  return `${lines.join("\r\n")}\r\n`;
}

function utf8StringToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToUtf8String(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * RTCSessionDescriptionInit 을 DB 컬럼(offer_sdp / answer_sdp)에 저장할 문자열로 직렬화합니다.
 */
export function encodeSessionDescriptionForDatabase(
  description: RTCSessionDescriptionInit,
): string {
  const normalizedSdp = normalizeSdpLineEndings(description.sdp ?? "");
  const jsonPayload = JSON.stringify({
    type: description.type,
    sdp: normalizedSdp,
  });
  return `${SDP_DATABASE_PREFIX}${utf8StringToBase64(jsonPayload)}`;
}

/**
 * DB에서 읽은 문자열을 RTCSessionDescriptionInit 으로 복원합니다 (신규·레거시 모두).
 */
export function decodeSessionDescriptionPayload(
  stored: string | null | undefined,
): RTCSessionDescriptionInit {
  if (stored == null || !String(stored).trim()) {
    throw new Error("SessionDescription payload is empty.");
  }

  const trimmed = stored.trim();

  if (trimmed.startsWith(SDP_DATABASE_PREFIX)) {
    const base64Part = trimmed.slice(SDP_DATABASE_PREFIX.length);
    const jsonPayload = base64ToUtf8String(base64Part);
    const parsed = JSON.parse(jsonPayload) as RTCSessionDescriptionInit;
    return {
      type: parsed.type,
      sdp: normalizeSdpLineEndings(parsed.sdp ?? ""),
    };
  }

  const legacyParsed = JSON.parse(trimmed) as RTCSessionDescriptionInit;
  return {
    type: legacyParsed.type,
    sdp: normalizeSdpLineEndings(legacyParsed.sdp ?? ""),
  };
}
