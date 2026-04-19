/**
 * 건강 알림 Supabase realtime 구독 훅
 *
 * - home_id 기준 최근 30건 fetch
 * - postgres_changes(INSERT/UPDATE) 구독으로 실시간 갱신
 * - markAsRead: 단건 read_at 업데이트
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { HealthAlert } from "@/features/diary/types/diaryStats";

type UseHealthAlertsReturn = {
  alerts: HealthAlert[];
  unreadCount: number;
  markAsRead: (alertId: string) => Promise<void>;
};

/**
 * 홈 단위 건강 알림 구독
 * @param homeId 현재 선택된 홈 id (없으면 구독 안 함)
 */
export function useHealthAlerts(homeId: string | null): UseHealthAlertsReturn {
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);

  /* 매 렌더마다 client 생성하지 않도록 memo */
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  /* 초기 fetch 중복 방지 가드 (QA R20 반영)
   * realtime 재연결(CHANNEL_ERROR → SUBSCRIBED 재진입) 시 .subscribe 콜백이
   * 다시 호출되어 초기 fetch 가 중복 실행되던 문제 차단. useEffect 재실행 시에는
   * cleanup 에서 false 로 복구. */
  const fetchedRef = useRef(false);

  /* 초기 fetch + realtime 구독
   *
   * race 완전 방지 순서 (QA R13 반영):
   * ① realtime 구독 시작 (INSERT 핸들러는 id 기준 dedupe)
   * ② .subscribe() 콜백에서 status === 'SUBSCRIBED' 확정된 뒤에야 초기 fetch 실행
   *    → 구독이 실제로 연결되기 전에 fetch 가 먼저 완료되어
   *      그 사이 INSERT 된 row 가 누락되는 race 를 원천 차단
   */
  useEffect(() => {
    if (!homeId) return;
    let cancelled = false;

    /* ① realtime 구독 — INSERT / UPDATE */
    const channel = supabase
      .channel(`health-alerts-${homeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "health_alerts", filter: `home_id=eq.${homeId}` },
        (payload) => {
          const row = payload.new as HealthAlert;
          /* id 기준 dedupe — 초기 fetch와 realtime이 같은 row를 잡아도 중복 안 생김 */
          setAlerts((prev) => {
            if (prev.some((a) => a.id === row.id)) return prev;
            return [row, ...prev]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 30);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "health_alerts", filter: `home_id=eq.${homeId}` },
        (payload) => {
          const row = payload.new as HealthAlert;
          setAlerts((prev) => prev.map((a) => (a.id === row.id ? row : a)));
        },
      )
      .subscribe((status) => {
        /* ② SUBSCRIBED 확정 후에만 초기 fetch 실행 — race 원천 차단
         *   fetchedRef 로 재연결 시 중복 fetch 방지 (QA R20) */
        if (status !== "SUBSCRIBED") return;
        if (fetchedRef.current) return;
        fetchedRef.current = true;
        void (async () => {
          if (cancelled) return;
          const { data } = await supabase
            .from("health_alerts")
            /* realtime payload.new 는 전체 row 라 select 컬럼과 shape 일치 필수
             *   (QA R15 REJECT #2 — home_id, alert_date 누락 시 타입 캐스팅이 거짓말) */
            .select("id, home_id, cat_id, severity, title, message, created_at, read_at, alert_date")
            .eq("home_id", homeId)
            .order("created_at", { ascending: false })
            .limit(30);
          if (cancelled || !data) return;
          setAlerts((prev) => {
            const existingIds = new Set(prev.map((a) => a.id));
            const merged = [
              ...prev,
              ...(data as HealthAlert[]).filter((a) => !existingIds.has(a.id)),
            ];
            return merged
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 30);
          });
        })();
      });

    return () => {
      cancelled = true;
      /* homeId 변경/언마운트 시 가드 복구 — 다음 effect 진입 시 초기 fetch 재실행 허용 */
      fetchedRef.current = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, homeId]);

  /* 미확인 개수 — read_at 이 null 인 것
   *   alerts 가 바뀔 때만 재계산 (QA R16 REJECT #4 — 매 렌더 filter 방지) */
  const unreadCount = useMemo(
    () => alerts.filter((a) => a.read_at === null).length,
    [alerts],
  );

  /* 단건 읽음 처리 — fire-and-forget */
  const markAsRead = useCallback(
    async (alertId: string) => {
      await supabase
        .from("health_alerts")
        .update({ read_at: new Date().toISOString() })
        .eq("id", alertId);
    },
    [supabase],
  );

  return { alerts, unreadCount, markAsRead };
}
