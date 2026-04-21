/**
 * viewerPeerConnectionHelpers — useViewerPeerConnectionMulti 훅 보조 유틸.
 *
 * 훅 본체가 400줄을 넘지 않도록 다음 순수 함수들을 분리한다.
 *
 *  - subscribeWithTimeout: Realtime 채널 SUBSCRIBED 를 타임아웃과 함께 대기
 *  - createIceQueue:       answer 전 도착한 broadcaster ICE 후보 큐잉
 *  - subscribeToAnswerUpdate: camera_viewer_connections UPDATE 구독 (answer 도착 통보)
 *  - subscribeToBroadcasterIce: ice_candidates INSERT 구독 (broadcaster 후보 수신)
 *  - bootstrapBroadcasterIce: 구독 전에 이미 DB 에 쌓인 broadcaster ICE 1회 SELECT
 *  - startPingLoop: 10s 간격 `viewer_ping` + 3회 연속 실패 시 onFail 콜
 *
 * 모든 함수는 상위 훅의 ref/state 에 의존하지 않는다 — 독립적으로 테스트 가능.
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  ViewerReconnectEngine,
  type ReconnectAction,
} from "@/lib/webrtc/viewerReconnectEngine";

/* ─── 공통 타입 ─── */

/** 훅 외부 노출 phase — live/slot 어댑터가 이를 축약해서 매핑한다 */
export type ViewerConnectionPhase =
  | "idle"
  | "creating"
  | "awaiting_answer"
  | "connecting"
  | "connected"
  | "error"
  | "too_many_viewers";

/** 로그 분류용 role — webrtcConnectionLogger 의 viewer 축과 호환 */
export type ViewerRole = "viewer_live" | "viewer_slot";

/* ─── Realtime 채널 subscribe 래퍼 ─── */

type SubscribeWithTimeoutHandlers = {
  onSubscribed?: () => void;
  onTimeout?: () => void;
  onError?: (reason: string) => void;
};

/**
 * Supabase Realtime 채널 subscribe 를 타임아웃과 함께 감싼다.
 *
 * - `SUBSCRIBED` → onSubscribed 1회 호출 후 종료
 * - `CHANNEL_ERROR` / `CLOSED` → onError 호출 후 종료
 * - timeoutMs 경과 → onTimeout 호출 + 내부 타이머 정리
 *
 * 실제 `supabase.removeChannel` 은 호출자가 본인 lifecycle 에 맞춰 처리한다
 * (여기서 remove 를 하면 정상 path 의 채널을 조기 해제해 버리기 때문).
 */
export function subscribeWithTimeout(
  channel: RealtimeChannel,
  timeoutMs: number,
  handlers: SubscribeWithTimeoutHandlers,
): void {
  let settled = false;
  /* 타임아웃 타이머 — 제한 시간 내 SUBSCRIBED 가 오지 않으면 onTimeout */
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    handlers.onTimeout?.();
  }, timeoutMs);

  channel.subscribe((status) => {
    if (settled) return;
    if (status === "SUBSCRIBED") {
      settled = true;
      clearTimeout(timer);
      handlers.onSubscribed?.();
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      settled = true;
      clearTimeout(timer);
      handlers.onError?.(String(status));
    }
  });
}

/* ─── answer 전 ICE 큐잉 ─── */

export type IceQueue = {
  /** 후보를 큐에 담는다 */
  enqueue: (c: RTCIceCandidateInit) => void;
  /** 큐의 모든 후보를 flush — 각각 applyFn 에 전달 */
  flush: (applyFn: (c: RTCIceCandidateInit) => Promise<void>) => Promise<void>;
  /** 큐 비우기 (cleanup 시) */
  clear: () => void;
  /** 현재 큐 크기 (디버깅용) */
  size: () => number;
};

/**
 * answer(setRemoteDescription) 이전에 도착한 broadcaster ICE 를
 * 메모리에 쌓아두기 위한 단순 큐.
 *
 * 큐잉이 필요한 이유:
 *  - viewer-initiated 흐름에서는 offer 먼저 보내고 answer 를 기다리는 동안에도
 *    broadcaster ICE trickle 이 먼저 도착할 수 있다.
 *  - RTCPeerConnection.addIceCandidate 는 remoteDescription 적용 전에 호출하면
 *    InvalidStateError 가 나므로 (환경에 따라 동작은 하지만 공식적으로 금지)
 *    answer 적용 직후 flush 로 일괄 적용한다.
 */
export function createIceQueue(): IceQueue {
  const q: RTCIceCandidateInit[] = [];
  return {
    enqueue(c) {
      q.push(c);
    },
    async flush(applyFn) {
      /* 앞에서부터 순서대로 적용 — drain 패턴으로 중복 flush 방지 */
      while (q.length > 0) {
        const c = q.shift();
        if (!c) continue;
        await applyFn(c);
      }
    },
    clear() {
      q.length = 0;
    },
    size() {
      return q.length;
    },
  };
}

/* ─── answer UPDATE 구독 ─── */

type SubscribeAnswerHandlers = {
  /** answer_sdp 필드가 채워져 오면 호출 */
  onAnswer: (answerSdp: string) => void;
  /** status 가 closed 로 바뀌면 호출 */
  onClosed?: () => void;
};

/**
 * camera_viewer_connections 의 UPDATE 이벤트를 구독해 answer 도착을 감지한다.
 *
 * - filter 는 `id=eq.<viewer_connection_id>` 단일 조건만 사용 (Supabase realtime 은
 *   AND 복합 filter 를 지원하지 않음).
 * - 반환한 채널은 호출자가 cleanup 시 `supabase.removeChannel` 로 해제한다.
 */
export function subscribeToAnswerUpdate(
  supabase: SupabaseClient,
  viewerConnectionId: string,
  handlers: SubscribeAnswerHandlers,
): RealtimeChannel {
  const channel = supabase.channel(`viewer-answer-${viewerConnectionId}`);
  channel.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "camera_viewer_connections",
      filter: `id=eq.${viewerConnectionId}`,
    },
    (payload) => {
      const row = payload.new as { answer_sdp?: string | null; status?: string | null };
      if (row.status === "closed") {
        handlers.onClosed?.();
        return;
      }
      if (row.answer_sdp && typeof row.answer_sdp === "string") {
        handlers.onAnswer(row.answer_sdp);
      }
    },
  );
  return channel;
}

/* ─── broadcaster ICE INSERT 구독 ─── */

/**
 * ice_candidates INSERT 이벤트를 구독해 broadcaster 가 보낸 ICE 후보를 받는다.
 *
 * - filter 는 `viewer_connection_id=eq.<id>` 단일 조건.
 * - sender 컬럼으로 broadcaster/viewer 를 구분하는데, Supabase realtime 이
 *   AND filter 를 지원하지 않으므로 클라이언트 측에서 sender==="broadcaster"
 *   만 걸러 낸다.
 */
export function subscribeToBroadcasterIce(
  supabase: SupabaseClient,
  viewerConnectionId: string,
  onCandidate: (candidate: RTCIceCandidateInit, rowId: string | null) => void,
): RealtimeChannel {
  const channel = supabase.channel(`viewer-ice-${viewerConnectionId}`);
  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "ice_candidates",
      filter: `viewer_connection_id=eq.${viewerConnectionId}`,
    },
    (payload) => {
      const row = payload.new as {
        id?: string;
        sender?: string;
        candidate?: RTCIceCandidateInit;
      };
      /* 클라 측 sender 필터 — broadcaster 후보만 적용 */
      if (row.sender !== "broadcaster" || !row.candidate) return;
      onCandidate(row.candidate, row.id ?? null);
    },
  );
  return channel;
}

/* ─── bootstrap: 구독 전 DB 스캔 ─── */

/**
 * 구독 전 이미 DB 에 쌓인 broadcaster ICE 후보를 일괄 가져온다.
 *
 * Realtime 구독은 구독 순간 이후의 INSERT 만 받으므로,
 * bootstrap SELECT 로 스냅샷을 1회 적용해야 snapshot + live 를 합쳐
 * 누락 없이 수집할 수 있다.
 */
export async function bootstrapBroadcasterIce(
  supabase: SupabaseClient,
  viewerConnectionId: string,
): Promise<{ id: string | null; candidate: RTCIceCandidateInit }[]> {
  const { data, error } = await supabase
    .from("ice_candidates")
    .select("id, candidate")
    .eq("viewer_connection_id", viewerConnectionId)
    .eq("sender", "broadcaster")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: (row.id as string | undefined) ?? null,
    candidate: row.candidate as RTCIceCandidateInit,
  }));
}

/* ─── ReconnectEngine 바인딩 ─── */

export type EngineBindingHandlers = {
  onIceRestart: () => void;
  onReconnectNeeded: (action: ReconnectAction) => void;
  onRecovered: () => void;
};

/**
 * 새 PC 에 ViewerReconnectEngine 을 붙이고 onAction 을 분기한다.
 *
 * - ice_restart → onIceRestart (상위에서 pc.restartIce())
 * - full_reconnect / keepalive_dead / visibility_reconnect → onReconnectNeeded
 * - connection_recovered → onRecovered
 *
 * 반환된 엔진은 호출자가 dispose 책임을 진다.
 */
export function createAndAttachReconnectEngine(
  pc: RTCPeerConnection,
  handlers: EngineBindingHandlers,
): ViewerReconnectEngine {
  const engine = new ViewerReconnectEngine();
  engine.attachPeerConnection(pc);
  engine.onAction = (action) => {
    if (action.type === "ice_restart") {
      handlers.onIceRestart();
    } else if (
      action.type === "full_reconnect" ||
      action.type === "keepalive_dead" ||
      action.type === "visibility_reconnect"
    ) {
      handlers.onReconnectNeeded(action);
    } else if (action.type === "connection_recovered") {
      handlers.onRecovered();
    }
  };
  return engine;
}

/* ─── viewer_create_connection RPC (55P03 backoff 3회) ─── */

export type CreateConnectionResult =
  | { kind: "ok"; viewerConnectionId: string }
  | { kind: "too_many_viewers" }
  | { kind: "error"; message: string };

/**
 * `viewer_create_connection` RPC 호출 — 55P03 잠금 경쟁만 200/400/800ms
 * exponential backoff 로 3회까지 재시도. 다른 에러는 즉시 error 반환.
 *
 * - 방송폰 재시작과 뷰어 offer 도달이 겹치는 드문 race 에서 55P03 이 떨어지므로
 *   기존 viewer_update_answer_sdp 패턴을 그대로 답습했다.
 * - `too_many_viewers` 는 서버가 `{error:"too_many_viewers"}` 형태로 내려주므로
 *   별도 kind 로 분류 → 상위에서 30초 후 자동 재시도 처리.
 */
export async function callViewerCreateConnectionWithBackoff(
  supabase: SupabaseClient,
  sessionId: string,
  encodedOfferSdp: string,
  onRetry?: (attempt: number, delay: number) => void,
): Promise<CreateConnectionResult> {
  let lastErr: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase.rpc("viewer_create_connection", {
      p_session_id: sessionId,
      p_offer_sdp: encodedOfferSdp,
    });
    if (!error) {
      const result = data as
        | { viewer_connection_id?: string; error?: string }
        | null;
      if (result?.error === "too_many_viewers") return { kind: "too_many_viewers" };
      if (result?.error) return { kind: "error", message: result.error };
      if (!result?.viewer_connection_id) {
        return { kind: "error", message: "viewer_connection_id 누락" };
      }
      return { kind: "ok", viewerConnectionId: result.viewer_connection_id };
    }
    lastErr = error as { code?: string; message?: string };
    if (error.code !== "55P03") {
      return { kind: "error", message: error.message ?? "create_connection 실패" };
    }
    const delay = 200 * Math.pow(2, attempt);
    onRetry?.(attempt + 1, delay);
    await new Promise((r) => setTimeout(r, delay));
  }
  return {
    kind: "error",
    message: lastErr?.message ?? "create_connection 저장 실패 (잠금 경쟁)",
  };
}

/* ─── viewer_add_ice_candidate_v2 fire-and-forget 래퍼 ─── */

/**
 * viewer 측 local ICE 후보를 DB 에 업로드한다.
 * 실패는 콘솔에만 남기고 promise 는 reject 하지 않는다 (fire-and-forget).
 */
export function sendViewerIceCandidate(
  supabase: SupabaseClient,
  viewerConnectionId: string,
  candidate: RTCIceCandidateInit,
): void {
  void supabase
    .rpc("viewer_add_ice_candidate_v2", {
      p_viewer_connection_id: viewerConnectionId,
      p_candidate: candidate,
    })
    .then(({ error }) => {
      if (error) {
        console.warn("[viewer] add_ice_candidate_v2 실패:", error.message);
      }
    });
}

/* ─── ping keepalive 루프 ─── */

/**
 * 10초마다 `viewer_ping` RPC 를 호출해 viewer 생존을 알린다.
 *
 * - 방송폰 측은 30초 이상 ping 이 없으면 죽은 viewer 로 간주하므로
 *   간격 10s * 허용 3회 실패 = 30s 이내 즉시 정리 가능.
 * - 3회 연속 실패 시 onFail 호출 (상위에서 reconnect 유도).
 * - 반환값은 정지 함수 — cleanup 에서 반드시 호출할 것.
 */
export function startPingLoop(
  supabase: SupabaseClient,
  viewerConnectionId: string,
  onFail: () => void,
): () => void {
  let failCount = 0;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const { error } = await supabase.rpc("viewer_ping", {
      p_viewer_connection_id: viewerConnectionId,
    });
    if (stopped) return;
    if (error) {
      failCount += 1;
      if (failCount >= 3) {
        /* 3회 연속 실패 — 상위에 통보하고 루프 자체는 계속 돌지 않는다 */
        stopped = true;
        onFail();
      }
    } else {
      failCount = 0;
    }
  };

  /* 10초 주기 interval — 첫 호출도 interval 첫 tick 에 맡김 (RPC 부하 분산) */
  const intervalId = setInterval(() => {
    void tick();
  }, 10_000);

  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}
