/**
 * RPC `get_broadcaster_signaling_state` 응답 정규화 — 배열 래핑·JSON 문자열·viewer_ice 객체 형태 대응.
 */

export type BroadcasterSignalingRpcPayload = {
  answer_sdp: string | null;
  viewer_ice: unknown;
  error?: string;
};

function unwrapSingleElementArray(raw: unknown): unknown {
  if (Array.isArray(raw) && raw.length === 1) {
    return raw[0];
  }
  return raw;
}

export function normalizeBroadcasterSignalingRpcPayload(
  raw: unknown,
): BroadcasterSignalingRpcPayload | null {
  if (raw == null) {
    return null;
  }
  let payload: unknown = unwrapSingleElementArray(raw);
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
    payload = unwrapSingleElementArray(payload);
  }
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (record.error != null && record.error !== "") {
    return {
      answer_sdp: null,
      viewer_ice: null,
      error: String(record.error),
    };
  }
  const answerRaw = record.answer_sdp;
  return {
    answer_sdp:
      answerRaw != null && String(answerRaw).trim() !== ""
        ? String(answerRaw)
        : null,
    viewer_ice: record.viewer_ice,
  };
}

function isIceCandidateLike(value: unknown): value is RTCIceCandidateInit {
  if (value == null || typeof value !== "object") {
    return false;
  }
  return "candidate" in (value as Record<string, unknown>);
}

export function parseViewerIceCandidatesFromRpcPayload(
  raw: unknown,
): RTCIceCandidateInit[] {
  if (raw == null) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw as RTCIceCandidateInit[];
  }
  if (typeof raw === "string") {
    try {
      return parseViewerIceCandidatesFromRpcPayload(JSON.parse(raw) as unknown);
    } catch {
      return [];
    }
  }
  if (typeof raw === "object") {
    const values = Object.values(raw as Record<string, unknown>);
    const candidates = values.filter(isIceCandidateLike);
    if (candidates.length > 0) {
      return candidates;
    }
  }
  return [];
}
