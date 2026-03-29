/**
 * WebRTC SessionDescription 을 DB(TEXT)에 넣을 때 줄바꿈·이스케이프 깨짐을 막기 위한 유틸.
 *
 * - **rawv1 (권장)**: JSON 을 쓰지 않고 SDP 원문만 UTF-8 Base64 로 저장 → 이스케이프/따옴표로 인한 파손 방지
 * - **sdpv2**: 구버전 — Base64(JSON) 저장
 * - **레거시**: 순수 JSON 문자열
 */

const SDP_V2_PREFIX = "sdpv2:" as const;
const RAW_V1_PREFIX = "rawv1:" as const;

/** DB/네트워크에서 잘못 들어온 리터럴 "\\r\\n" 등을 실제 줄바꿈으로 복구합니다. */
function repairLiteralEscapesInSdpText(sdpText: string): string {
  return sdpText
    .replace(/\\r\\n/g, "\r\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r");
}

/**
 * v= 줄부터 잡고, 빈 줄을 제거한 뒤 CRLF 로 맞춥니다 (구버전 sdpv2/JSON 경로용).
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

/**
 * 브라우저가 준 SDP 원문을 WebRTC 가 읽기 좋게 CRLF 만 정리합니다 (줄 내용은 건드리지 않음).
 * rawv1 디코드 시 사용합니다.
 */
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
 * RTCSessionDescriptionInit 을 DB 컬럼(offer_sdp / answer_sdp)에 저장할 문자열로 직렬화합니다.
 * JSON 을 끼우지 않고 SDP 원문만 Base64 하여 파싱 깨짐을 방지합니다.
 */
export function encodeSessionDescriptionForDatabase(
  description: RTCSessionDescriptionInit,
): string {
  const sdp = description.sdp;
  if (sdp == null || !sdp.trim()) {
    throw new Error("SDP가 비어 있습니다.");
  }
  const t = description.type;
  if (t !== "offer" && t !== "answer" && t !== "pranswer") {
    throw new Error(`지원하지 않는 SDP 타입: ${String(t)}`);
  }
  return `${RAW_V1_PREFIX}${t}:${utf8StringToBase64(sdp)}`;
}

/**
 * DB에서 읽은 문자열을 RTCSessionDescriptionInit 으로 복원합니다.
 */
export function decodeSessionDescriptionPayload(
  stored: string | null | undefined,
): RTCSessionDescriptionInit {
  if (stored == null || !String(stored).trim()) {
    throw new Error("SessionDescription payload is empty.");
  }

  const trimmed = stored.trim();

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

  const legacyParsed = JSON.parse(trimmed) as RTCSessionDescriptionInit;
  return {
    type: legacyParsed.type,
    sdp: sanitizeSdpForWebRtc(legacyParsed.sdp ?? ""),
  };
}
