/**
 * camera_sessions.offer_sdp / answer_sdp 컬럼용 SDP 직렬화.
 *
 * **저장(신규)**: `v=0` 으로 시작하는 SDP 본문만 TEXT 로 넣습니다 (JSON 객체 전체 문자열 금지).
 * **읽기**: 순수 SDP, `{"type","sdp"}`, `rawv1:`, `sdpv2:` 등 레거시 모두 지원.
 */

const SDP_V2_PREFIX = "sdpv2:" as const;
const RAW_V1_PREFIX = "rawv1:" as const;

function repairLiteralEscapesInSdpText(sdpText: string): string {
  return sdpText
    .replace(/\\r\\n/g, "\r\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r");
}

/**
 * v= 줄부터 잡고, 빈 줄을 제거한 뒤 CRLF 로 맞춥니다.
 */
export function sanitizeSdpForWebRtc(sdpText: string): string {
  let repaired = repairLiteralEscapesInSdpText(sdpText.trim());
  if (!repaired) {
    return "";
  }
  if (repaired.charCodeAt(0) === 0xfeff) {
    repaired = repaired.slice(1);
  }

  const singleLinefeed = repaired.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const versionLineMatch = /^v=/m.exec(singleLinefeed);
  if (!versionLineMatch || versionLineMatch.index === undefined) {
    throw new Error("SDP에 v= 줄이 없습니다.");
  }

  const fromVersionLine = singleLinefeed.slice(versionLineMatch.index);
  const lines = fromVersionLine
    .split("\n")
    .map((line) => line.replace(/\u0000/g, "").trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return "";
  }
  if (!lines[0].startsWith("v=")) {
    throw new Error("SDP 첫 줄은 v= 로 시작해야 합니다.");
  }

  return `${lines.join("\r\n")}\r\n`;
}

/** @deprecated 호환용 */
export function normalizeSdpLineEndings(sdpText: string): string {
  return sanitizeSdpForWebRtc(sdpText);
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

function normalizeSdpLineEndingsOnly(sdpRaw: string): string {
  let s = sdpRaw;
  if (s.charCodeAt(0) === 0xfeff) {
    s = s.slice(1);
  }
  const lines = s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\u0000/g, "").trimEnd());
  const nonEmptyFromVersion = (() => {
    const idx = lines.findIndex((line) => line.trimStart().startsWith("v="));
    if (idx === -1) {
      return lines.filter((l) => l.length > 0);
    }
    return lines.slice(idx).filter((l) => l.length > 0);
  })();
  if (nonEmptyFromVersion.length === 0) {
    throw new Error("SDP 본문이 비어 있습니다.");
  }
  return `${nonEmptyFromVersion.join("\r\n")}\r\n`;
}

/**
 * DB 에 넣을 값: 브라우저가 준 SDP 문자열만 정규화 (반드시 v= 로 시작하는 한 덩어리 텍스트).
 */
export function encodePlainSdpForDatabaseColumn(sdp: string): string {
  return sanitizeSdpForWebRtc(sdp);
}

/**
 * DB 에서 읽은 문자열 → RTCSessionDescriptionInit.
 * @param fallbackType 컬럼에 type 이 없을 때 (순수 SDP) 사용
 */
export function decodeSdpFromDatabaseColumn(
  stored: string | null | undefined,
  fallbackType: RTCSessionDescriptionInit["type"],
): RTCSessionDescriptionInit {
  if (stored == null || !String(stored).trim()) {
    throw new Error("SDP column is empty.");
  }

  const trimmed = stored.trim();

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as RTCSessionDescriptionInit;
    return {
      type: parsed.type ?? fallbackType,
      sdp: sanitizeSdpForWebRtc(parsed.sdp ?? ""),
    };
  }

  if (trimmed.startsWith(RAW_V1_PREFIX)) {
    const rest = trimmed.slice(RAW_V1_PREFIX.length);
    const colonIdx = rest.indexOf(":");
    if (colonIdx === -1) {
      throw new Error("rawv1 SDP 형식이 올바르지 않습니다.");
    }
    const type = rest.slice(0, colonIdx) as RTCSessionDescriptionInit["type"];
    const b64 = rest.slice(colonIdx + 1);
    const sdpRaw = base64ToUtf8String(b64);
    return {
      type,
      sdp: normalizeSdpLineEndingsOnly(sdpRaw),
    };
  }

  if (trimmed.startsWith(SDP_V2_PREFIX)) {
    const base64Part = trimmed.slice(SDP_V2_PREFIX.length);
    const jsonPayload = base64ToUtf8String(base64Part);
    const parsed = JSON.parse(jsonPayload) as RTCSessionDescriptionInit;
    return {
      type: parsed.type,
      sdp: sanitizeSdpForWebRtc(parsed.sdp ?? ""),
    };
  }

  if (/^v=/m.test(trimmed)) {
    return {
      type: fallbackType,
      sdp: sanitizeSdpForWebRtc(trimmed),
    };
  }

  try {
    const legacyParsed = JSON.parse(trimmed) as RTCSessionDescriptionInit;
    if (legacyParsed && typeof legacyParsed === "object" && "sdp" in legacyParsed) {
      return {
        type: legacyParsed.type ?? fallbackType,
        sdp: sanitizeSdpForWebRtc(String(legacyParsed.sdp ?? "")),
      };
    }
  } catch {
    // ignore
  }

  throw new Error("SDP 형식을 알 수 없습니다.");
}

/** @deprecated decodeSdpFromDatabaseColumn(..., 'offer') 사용 */
export function decodeSessionDescriptionPayload(
  stored: string | null | undefined,
): RTCSessionDescriptionInit {
  return decodeSdpFromDatabaseColumn(stored, "offer");
}

/** @deprecated encodePlainSdpForDatabaseColumn 사용 */
export function encodeSessionDescriptionForDatabase(
  description: RTCSessionDescriptionInit,
): string {
  return encodePlainSdpForDatabaseColumn(description.sdp ?? "");
}
