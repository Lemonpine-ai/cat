"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { playPopSound } from "@/lib/sound/playPopSound";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 케어로그 RPC 호출, 환경 타임스탬프 초기 조회, broadcast 채널 구독, 경과시간 틱을 담당하는 훅.
 */

interface UseBroadcastCareLogOptions {
  /** 디바이스 인증 토큰 (null 이면 비활성) */
  deviceToken: string | null;
  /** 현재 방송 세션 ID (케어로그에 연결) */
  activeSessionId: string | null;
  /** 효과음 재생 여부 */
  isSoundEnabled: boolean;
  /** 오케스트레이터에서 주입하는 공용 supabase 클라이언트 (중복 realtime 소켓 방지). 미주입 시 자체 생성. */
  supabaseClient?: SupabaseClient;
}

export function useBroadcastCareLog({
  deviceToken,
  activeSessionId,
  isSoundEnabled,
  supabaseClient,
}: UseBroadcastCareLogOptions) {
  /** supabase 클라이언트 — 주입값 우선, 없으면 자체 생성 (매 렌더마다 재생성 방지) */
  const supabase = useMemo(
    () => supabaseClient ?? createSupabaseBrowserClient(),
    [supabaseClient],
  );

  /* ── 상태 ── */
  const [careLogPending, setCareLogPending] = useState(false);
  const [careLogMessage, setCareLogMessage] = useState<string | null>(null);
  const [lastWaterChangeAt, setLastWaterChangeAt] = useState<string | null>(null);
  const [lastLitterCleanAt, setLastLitterCleanAt] = useState<string | null>(null);
  /** 경과 시간 레이블 갱신용 틱 (1분 주기) */
  const [, setElapsedTick] = useState(0);
  /** 홈 화면 Broadcast 채널 연동에 필요한 home_id */
  const [broadcastHomeId, setBroadcastHomeId] = useState<string | null>(null);

  /** 구독 완료된 Broadcast 채널 ref — send() 호출 시 재사용 */
  const envBroadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  /** 케어로그 메시지 자동 숨김 타이머 ref — 언마운트/중복 호출 시 누수 방지 */
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── 1분 주기 경과 시간 레이블 갱신 ── */
  useEffect(() => {
    const id = setInterval(() => setElapsedTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  /* ── 언마운트 시 feedback 타이머 정리 — 언마운트 후 setState 방지 ── */
  useEffect(() => () => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, []);

  /* ── 기기 identity 확보 후: 최신 식수교체/화장실청소 타임스탬프 + home_id 초기 조회 ── */
  useEffect(() => {
    if (!deviceToken) return;
    async function fetchInitialEnvTimestamps() {
      const { data } = await supabase.rpc("get_device_home_env_timestamps", {
        p_device_token: deviceToken!,
      });
      const payload = data as {
        home_id?: string | null;
        last_water_change_at?: string | null;
        last_litter_clean_at?: string | null;
        error?: string;
      } | null;
      if (!payload || payload.error) return;
      if (payload.home_id) setBroadcastHomeId(payload.home_id);
      if (payload.last_water_change_at) setLastWaterChangeAt(payload.last_water_change_at);
      if (payload.last_litter_clean_at) setLastLitterCleanAt(payload.last_litter_clean_at);
    }
    void fetchInitialEnvTimestamps();
  }, [deviceToken, supabase]);

  /* ── broadcastHomeId 확보 후 Broadcast 채널 구독 ── */
  useEffect(() => {
    if (!broadcastHomeId) return;
    const channel = supabase.channel(`env_care_broadcast_${broadcastHomeId}`);
    envBroadcastChannelRef.current = channel;
    channel.subscribe();
    return () => {
      envBroadcastChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [broadcastHomeId, supabase]);

  /* ── 케어로그 기록 RPC ── */
  const recordCareLog = useCallback(
    async (careKind: "meal" | "water_change" | "litter_clean" | "medicine") => {
      if (!deviceToken) return;
      if (isSoundEnabled) playPopSound();
      setCareLogMessage(null);
      setCareLogPending(true);
      try {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase.rpc(
          "record_device_cat_care_log",
          {
            p_device_token: deviceToken,
            p_care_kind: careKind,
            p_camera_session_id: activeSessionId,
          },
        );
        if (error) {
          setCareLogMessage(error.message);
          return;
        }
        const payload = data as { success?: boolean; error?: string } | null;
        if (payload?.error === "invalid_device") {
          setCareLogMessage("기기를 다시 연결해 주세요.");
          return;
        }
        if (payload?.error) {
          setCareLogMessage("기록을 저장하지 못했어요.");
          return;
        }

        /* 환경 관리 항목은 경과 시간 즉시 반영 */
        if (careKind === "water_change") setLastWaterChangeAt(nowIso);
        if (careKind === "litter_clean") setLastLitterCleanAt(nowIso);

        /* 홈 화면 실시간 업데이트: Broadcast 채널로 케어 이벤트 전파 */
        if (
          envBroadcastChannelRef.current &&
          (careKind === "water_change" || careKind === "litter_clean" || careKind === "medicine")
        ) {
          void envBroadcastChannelRef.current.send({
            type: "broadcast",
            event: "env_care_updated",
            payload: { care_kind: careKind, recorded_at: nowIso },
          });
        }

        const labelByKind: Record<typeof careKind, string> = {
          meal: "맘마 먹기",
          water_change: "식수 교체",
          litter_clean: "화장실 청소",
          medicine: "약 먹기",
        };
        setCareLogMessage(`「${labelByKind[careKind]}」 기록했어요! (0분 전)`);
        /* 기존 타이머가 있으면 먼저 정리 — 빠른 연속 호출 시 누수 방지 */
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => {
          setCareLogMessage(null);
          feedbackTimerRef.current = null;
        }, 2200);
      } finally {
        setCareLogPending(false);
      }
    },
    [activeSessionId, deviceToken, isSoundEnabled, supabase],
  );

  /**
   * 외부에서 homeId를 설정하는 함수.
   * startBroadcast RPC 응답에서 받은 home_id를 전달받아
   * 초기 RPC(fetchInitialEnvTimestamps) 완료 전에도 broadcastHomeId를 확보한다.
   */
  const setExternalHomeId = useCallback((homeId: string | null) => {
    if (!homeId) return;
    setBroadcastHomeId((prev) => prev ?? homeId);
  }, []);

  return {
    careLogPending,
    careLogMessage,
    lastWaterChangeAt,
    lastLitterCleanAt,
    broadcastHomeId,
    recordCareLog,
    /** RPC 응답 등 외부 경로로 homeId를 설정할 때 사용 */
    setExternalHomeId,
  };
}
