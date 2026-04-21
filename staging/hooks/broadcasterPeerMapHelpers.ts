/**
 * useBroadcasterPeerMap 보조 유틸 — 파일 400줄 상한을 위해 분리.
 *
 * sendBroadcastEventOnce / parseViewerIceList / useWakeLockEffectBody / registerUnloadBeacon
 * 은 훅 내부 상태에 의존하지 않는 순수 함수이므로 훅 파일 밖으로 추출할 수 있다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BroadcastPhase } from "@/hooks/useBroadcasterSignaling";

/** 일회성 broadcast 이벤트 전송 — 구독 완료 후 send, 실패 시 채널 정리. */
export function sendBroadcastEventOnce(
  supabase: SupabaseClient,
  homeId: string,
  event: "session_started" | "session_stopped",
  payload: Record<string, unknown>,
) {
  const ch = supabase.channel(`cam_session_broadcast_${homeId}`);
  ch.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      void ch.send({ type: "broadcast", event, payload });
      setTimeout(() => void supabase.removeChannel(ch), 2000);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      void supabase.removeChannel(ch);
    }
  });
}

/**
 * viewer_ice 필드 → { id, candidate }[] 안전 파싱.
 *
 * R1 RPC `broadcaster_get_viewer_connections` 는 각 viewer 의 ICE 후보를
 * `[{ id: <ice_row_id>, candidate: <RTCIceCandidateInit> }, ...]` 형태로 반환한다.
 *
 * 중요: Dev 초안은 배열을 그대로 RTCIceCandidateInit[] 로 캐스팅했는데,
 * 실제로는 `{ id, candidate }` 래퍼라 `new RTCIceCandidate({id, candidate})` 가
 * 유효 init 이 아니어서 ICE 가 단 하나도 적용되지 않았다 (R2 QA J-0).
 * 여기서 `{ id, candidate }` 를 감지해 `candidate` 만 꺼내고, id 는 dedup key 로
 * 함께 반환한다.
 */
export type ParsedViewerIce = { id?: string; candidate: RTCIceCandidateInit };

export function parseViewerIceList(raw: unknown): ParsedViewerIce[] {
  const toArray = (v: unknown): unknown[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; }
      catch { return []; }
    }
    return [];
  };
  return toArray(raw).map((item): ParsedViewerIce => {
    /* R1 RPC 표준 형태: {id, candidate} */
    if (item && typeof item === "object" && "candidate" in item) {
      const w = item as { id?: string; candidate: RTCIceCandidateInit };
      return { id: w.id, candidate: w.candidate };
    }
    /* 혹시 일반 RTCIceCandidateInit 이 그대로 온 케이스 (호환) */
    return { candidate: item as RTCIceCandidateInit };
  });
}

/** WakeLock effect 본체 — live/connecting 동안 screen wake lock 유지. */
export function useWakeLockEffectBody(
  phase: BroadcastPhase,
  ref: React.MutableRefObject<WakeLockSentinel | null>,
) {
  if (phase !== "live" && phase !== "connecting") {
    if (ref.current) { void ref.current.release(); ref.current = null; }
    return undefined;
  }
  const req = async () => {
    try { if ("wakeLock" in navigator) ref.current = await navigator.wakeLock.request("screen"); }
    catch { /* 미지원/거부 — 무시 */ }
  };
  void req();
  const onVis = () => { if (document.visibilityState === "visible" && !ref.current) void req(); };
  document.addEventListener("visibilitychange", onVis);
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    if (ref.current) { void ref.current.release(); ref.current = null; }
  };
}

/** beforeunload/pagehide 에 beacon 으로 stop_device_broadcast 전송 등록. */
export function registerUnloadBeacon(
  deviceToken: string | null,
  sessionIdRef: React.MutableRefObject<string | null>,
) {
  function handleUnload(e: Event) {
    if (!deviceToken || !sessionIdRef.current) return;
    if (e.type === "pagehide" && (e as PageTransitionEvent).persisted) return;
    const url = `${window.location.origin}/api/webrtc/stop-broadcast`;
    navigator.sendBeacon(url, JSON.stringify({ device_token: deviceToken }));
  }
  window.addEventListener("beforeunload", handleUnload);
  window.addEventListener("pagehide", handleUnload);
  return () => {
    window.removeEventListener("beforeunload", handleUnload);
    window.removeEventListener("pagehide", handleUnload);
  };
}
