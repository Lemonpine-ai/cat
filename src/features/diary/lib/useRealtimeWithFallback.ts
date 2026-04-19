/**
 * Supabase realtime 구독 + 지수 백오프 재연결 + 폴링 폴백 훅
 * ① SUBSCRIBED → mode="realtime". ② 에러/타임아웃 → 1s/4s/16s 백오프 재시도.
 * ③ 3회 실패 → 30s 폴링 모드 (+ 매 tick 마다 realtime 복구 시도).
 * ④ 언마운트 시 채널 해제 + 타이머 cleanup. mode 는 호출 측 알림 표시용.
 */
import { useEffect, useRef, useState } from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesFilter,
  SupabaseClient,
} from "@supabase/supabase-js";

/* ─── 재연결 정책 상수 ─── */
const MAX_RETRY = 3; // 폴링 전환 기준 (이 횟수까지 실패하면 폴링)
const BACKOFF_MS: readonly number[] = [1_000, 4_000, 16_000]; // 지수 백오프 (상한 30s 내)
const POLLING_INTERVAL_MS = 30_000; // 폴링 주기

/* ─── 외부 공개 타입 ─── */
export type RealtimeMode = "connecting" | "realtime" | "polling";

/* postgres_changes 필터는 event/schema/table/filter 문자열 묶음 — "*" 허용 */
type AnyPostgresFilter = RealtimePostgresChangesFilter<"*">;

/**
 * realtime 구독 + 실패 시 재연결/폴링으로 전환.
 *
 * @param supabase    브라우저 Supabase 클라이언트
 * @param channelName 고유 채널 이름 (cat_id 등 포함 권장)
 * @param filter      postgres_changes 필터 (event="*" 고정)
 * @param onEvent     이벤트 수신 시 실행할 콜백 (폴링 모드에서도 동일 호출)
 */
export function useRealtimeWithFallback(
  supabase: SupabaseClient,
  channelName: string,
  filter: AnyPostgresFilter,
  onEvent: () => void,
): { mode: RealtimeMode } {
  const [mode, setMode] = useState<RealtimeMode>("connecting");

  /* 최신 onEvent 참조 보존 — parent 재렌더에도 재구독 없이 최신 콜백 호출.
   * React 19 렌더중 ref 쓰기 금지이므로 deps 없는 useEffect 로 커밋 후 갱신. */
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  /* 재시도 카운트 / 타이머 refs — effect 주기와 독립적으로 관리 */
  const retryCountRef = useRef(0);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    /* 언마운트 감지 플래그 — CLOSED 상태가 정상 종료인지 구분 */
    let unmounted = false;
    let channel: RealtimeChannel | null = null;

    /* 모든 타이머 정리 — 연결 성공/실패 모드 전환 시 재사용 */
    const clearTimers = () => {
      if (backoffTimerRef.current) {
        clearTimeout(backoffTimerRef.current);
        backoffTimerRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    /* 폴링 모드 진입 — 30초 주기로 onEvent 강제 호출 + realtime 복구 시도.
     * 매 tick 마다 재집계 호출 후 retryCount 를 0 으로 리셋하고 connect() 재시도.
     * SUBSCRIBED 성공 시 그 분기에서 pollTimerRef 를 clearInterval 하여 폴링 자연 종료. */
    const startPolling = () => {
      if (pollTimerRef.current) return; // 이미 켜져 있으면 중복 방지
      setMode("polling");
      pollTimerRef.current = setInterval(() => {
        /* 폴링 tick — 최신 데이터 재집계 */
        onEventRef.current();
        /* realtime 복구 재시도 — 기존 백오프 타이머 있으면 정리 후 카운터 리셋.
         * 이미 대기중인 backoff setTimeout 과 폴링 interval 이 동시 connect() 를
         * 호출하면 채널 누수가 생기므로 clearTimeout 먼저. */
        if (backoffTimerRef.current) {
          clearTimeout(backoffTimerRef.current);
          backoffTimerRef.current = null;
        }
        retryCountRef.current = 0;
        connect();
      }, POLLING_INTERVAL_MS);
    };

    /* 실제 채널 연결 시도 — 실패 시 지수 백오프 → 한도 초과 시 폴링 */
    const connect = () => {
      if (unmounted) return;

      channel = supabase
        .channel(channelName)
        .on<Record<string, unknown>>(
          "postgres_changes",
          filter,
          () => {
            // payload 미사용 (단순 재집계 트리거 용도)
            onEventRef.current();
          },
        )
        .subscribe((status) => {
          if (unmounted) return;

          if (status === "SUBSCRIBED") {
            /* 연결 성공 — 재시도 카운트 리셋 + 폴링 해제 */
            retryCountRef.current = 0;
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            setMode("realtime");
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            /* 실패 — 백오프로 재시도 또는 폴링 전환 */
            if (retryCountRef.current < MAX_RETRY) {
              const delay =
                BACKOFF_MS[retryCountRef.current] ??
                BACKOFF_MS[BACKOFF_MS.length - 1] ??
                POLLING_INTERVAL_MS;
              retryCountRef.current += 1;

              /* 기존 채널 정리 후 지연 재접속 */
              if (channel) {
                void supabase.removeChannel(channel);
                channel = null;
              }
              backoffTimerRef.current = setTimeout(() => {
                backoffTimerRef.current = null;
                connect();
              }, delay);
            } else {
              /* 한도 초과 → 폴링 모드 */
              if (channel) {
                void supabase.removeChannel(channel);
                channel = null;
              }
              startPolling();
            }
            return;
          }

          if (status === "CLOSED") {
            /* 언마운트 cleanup 이 아니면 에러로 간주 — 재연결 시도.
             * CHANNEL_ERROR/TIMED_OUT 분기와 동일 패턴:
             * 재접속/폴링 전에 기존 channel 을 removeChannel 로 해제해 누수 차단. */
            if (!unmounted && retryCountRef.current < MAX_RETRY) {
              /* 기존 채널 정리 후 지연 재접속 */
              if (channel) {
                void supabase.removeChannel(channel);
                channel = null;
              }
              const delay =
                BACKOFF_MS[retryCountRef.current] ??
                BACKOFF_MS[BACKOFF_MS.length - 1] ??
                POLLING_INTERVAL_MS;
              retryCountRef.current += 1;
              backoffTimerRef.current = setTimeout(() => {
                backoffTimerRef.current = null;
                connect();
              }, delay);
            } else if (!unmounted) {
              /* 폴링 전환 전에도 기존 채널 해제 */
              if (channel) {
                void supabase.removeChannel(channel);
                channel = null;
              }
              startPolling();
            }
          }
        });
    };

    /* 최초 연결 시도 */
    connect();

    return () => {
      /* 언마운트/재구독 — 플래그 + 모든 자원 정리 */
      unmounted = true;
      clearTimers();
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
      /* 다음 effect 사이클을 위해 상태 리셋 (참조 자체는 동일 ref) */
      retryCountRef.current = 0;
    };
    /* filter 는 object 이지만 호출 측에서 useMemo 로 안정화할 책임.
       channelName 이 cat 별로 달라지면 자연스럽게 재구독된다. */
  }, [supabase, channelName, filter]);

  return { mode };
}
