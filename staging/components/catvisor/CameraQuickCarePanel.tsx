"use client";

/**
 * CameraQuickCarePanel — 라이브 카메라 하단 빠른 케어 기록 패널.
 *
 * CameraLiveViewer 에서 케어 기록(맘마, 식수 교체, 화장실 청소, 약) UI를 분리.
 * Props 로 supabase 클라이언트, homeId, 세션 정보를 받아 독립 동작.
 */

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Baby,
  Droplets,
  Pill,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { playPopSound } from "@/lib/sound/playPopSound";
import { CATVISOR_SOUND_ENABLED_STORAGE_KEY } from "@/lib/sound/soundPreferenceStorageKey";

/* ─── 유틸 ─── */

/** 마지막 관리 타임스탬프 → '0분 전' / 'n분 전' / 'n시간 전' / 'n일 전' 변환 */
function formatEnvElapsed(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "기록 없음";
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  if (diffMs < 0) return "0분 전";
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "0분 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${Math.floor(diffHours / 24)}일 전`;
}

/* ─── Props ─── */

type CameraQuickCarePanelProps = {
  supabase: SupabaseClient;
  homeId: string;
  /** 현재 라이브 세션의 cat_id (nullable) */
  catId: string | null;
  /** 현재 라이브 세션 ID (nullable) */
  sessionId: string | null;
  /** figma 스타일 변형 적용 여부 */
  isFigmaVariant?: boolean;
  /** 식수 교체 기록 시 홈 화면 상태를 즉시 동기화하는 콜백 */
  onWaterChangeRecorded?: (isoTimestamp: string) => void;
  /** 화장실 청소 기록 시 홈 화면 상태를 즉시 동기화하는 콜백 */
  onLitterCleanRecorded?: (isoTimestamp: string) => void;
};

export function CameraQuickCarePanel({
  supabase,
  homeId,
  catId,
  sessionId,
  isFigmaVariant = false,
  onWaterChangeRecorded,
  onLitterCleanRecorded,
}: CameraQuickCarePanelProps) {
  /* ── 상태 ── */
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [careLogPending, setCareLogPending] = useState(false);
  const [careLogMessage, setCareLogMessage] = useState<string | null>(null);
  const [lastWaterChangeAt, setLastWaterChangeAt] = useState<string | null>(null);
  const [lastLitterCleanAt, setLastLitterCleanAt] = useState<string | null>(null);

  /* ── 사운드 토글 초기화 ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CATVISOR_SOUND_ENABLED_STORAGE_KEY);
      if (raw === "0") setIsSoundEnabled(false);
      if (raw === "1") setIsSoundEnabled(true);
    } catch {
      // storage 사용 불가
    }
  }, []);

  /* 1분 주기로 경과 시간 레이블 강제 갱신 */
  const [, setElapsedTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsedTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  /* 최신 water_change / litter_clean 타임스탬프 초기 조회 */
  useEffect(() => {
    async function fetchInitialEnvTimestamps() {
      const { data: waterRow } = await supabase
        .from("cat_care_logs")
        .select("created_at")
        .eq("home_id", homeId)
        .eq("care_kind", "water_change")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (waterRow?.created_at) setLastWaterChangeAt(waterRow.created_at);

      const { data: litterRow } = await supabase
        .from("cat_care_logs")
        .select("created_at")
        .eq("home_id", homeId)
        .eq("care_kind", "litter_clean")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (litterRow?.created_at) setLastLitterCleanAt(litterRow.created_at);
    }
    void fetchInitialEnvTimestamps();
  }, [homeId, supabase]);

  /* Realtime: 다른 기기에서 water_change / litter_clean 저장 시 즉시 반영 */
  useEffect(() => {
    const channel = supabase
      .channel(`viewer_env_care_${homeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cat_care_logs", filter: `home_id=eq.${homeId}` },
        (payload) => {
          const row = payload.new as { care_kind: string; created_at: string };
          if (row.care_kind === "water_change") setLastWaterChangeAt(row.created_at);
          if (row.care_kind === "litter_clean") setLastLitterCleanAt(row.created_at);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [homeId, supabase]);

  /* ── 사운드 토글 ── */
  const toggleSoundEnabled = useCallback(() => {
    setIsSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CATVISOR_SOUND_ENABLED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  /* ── 케어 기록 ── */
  const recordCareLog = useCallback(
    async (careKind: "meal" | "water_change" | "litter_clean" | "medicine") => {
      if (isSoundEnabled) playPopSound();
      setCareLogMessage(null);
      setCareLogPending(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setCareLogMessage("로그인이 필요해요."); return; }

        const nowIso = new Date().toISOString();
        const { error } = await supabase.from("cat_care_logs").insert({
          home_id: homeId,
          recorded_by: user.id,
          cat_id: catId,
          care_kind: careKind,
          source: "live_camera_viewer",
          camera_session_id: sessionId,
        });
        if (error) { setCareLogMessage(error.message); return; }

        /* 환경 관리 항목은 경과 시간 즉시 반영 + 홈 화면 콜백 호출 */
        if (careKind === "water_change") {
          setLastWaterChangeAt(nowIso);
          onWaterChangeRecorded?.(nowIso);
        }
        if (careKind === "litter_clean") {
          setLastLitterCleanAt(nowIso);
          onLitterCleanRecorded?.(nowIso);
        }

        const labelByKind: Record<typeof careKind, string> = {
          meal: "맘마 먹기",
          water_change: "식수 교체",
          litter_clean: "화장실 청소",
          medicine: "약 먹기",
        };
        setCareLogMessage(`「${labelByKind[careKind]}」 기록했어요! (0분 전)`);
        window.setTimeout(() => setCareLogMessage(null), 2200);
      } finally {
        setCareLogPending(false);
      }
    },
    [homeId, isSoundEnabled, catId, sessionId, supabase, onWaterChangeRecorded, onLitterCleanRecorded],
  );

  /* ── 렌더 ── */
  return (
    <div
      className={`relative z-50 mt-4 flex flex-col gap-3 rounded-2xl border border-[#4FD1C5]/35 bg-white p-3 shadow-lg ${
        isFigmaVariant ? "border-[rgba(30,143,131,0.12)] bg-[rgba(255,255,255,0.92)]" : ""
      }`}
    >
      {/* 헤더: 라벨 + 사운드 토글 */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#1e8f83]">빠른 케어 기록</span>
        <button
          type="button"
          onClick={toggleSoundEnabled}
          className="inline-flex size-9 items-center justify-center rounded-full border border-[#4FD1C5]/35 bg-white text-[#1e8f83] shadow-md transition hover:bg-[#4FD1C5]/10"
          aria-pressed={isSoundEnabled}
          aria-label={isSoundEnabled ? "효과음 끄기" : "효과음 켜기"}
        >
          {isSoundEnabled ? (
            <Volume2 className="size-4" strokeWidth={2} aria-hidden />
          ) : (
            <VolumeX className="size-4" strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>

      {/* 케어 버튼 4개 */}
      <div className="flex flex-row flex-wrap gap-2">
        <button type="button" disabled={careLogPending} onClick={() => void recordCareLog("meal")} className="inline-flex min-w-[5.5rem] flex-1 items-center justify-center gap-2 rounded-3xl border border-[#4FD1C5]/30 bg-gradient-to-r from-[#4FD1C5] to-[#38BDB0] px-2 py-3 text-xs font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-50 sm:text-sm">
          <Baby className="size-4 shrink-0" strokeWidth={2} aria-hidden />
          맘마 먹기 🍼
        </button>
        <button type="button" disabled={careLogPending} onClick={() => void recordCareLog("water_change")} className="inline-flex min-w-[5.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-3xl border border-sky-200/80 bg-gradient-to-r from-sky-400 to-sky-500 px-2 py-2 text-xs font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-50 sm:text-sm">
          <span className="flex items-center gap-1">
            <Droplets className="size-4 shrink-0" strokeWidth={2} aria-hidden />
            식수 교체 💧
          </span>
          <span className="text-[0.6rem] font-semibold opacity-90">{formatEnvElapsed(lastWaterChangeAt)}</span>
        </button>
        <button type="button" disabled={careLogPending} onClick={() => void recordCareLog("litter_clean")} className="inline-flex min-w-[5.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-3xl border border-[#FFAB91]/50 bg-gradient-to-r from-[#FFAB91] to-[#FF8A65] px-2 py-2 text-xs font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-50 sm:text-sm">
          <span className="flex items-center gap-1">
            <Sparkles className="size-4 shrink-0" strokeWidth={2} aria-hidden />
            화장실 청소 🚽
          </span>
          <span className="text-[0.6rem] font-semibold opacity-90">{formatEnvElapsed(lastLitterCleanAt)}</span>
        </button>
        <button type="button" disabled={careLogPending} onClick={() => void recordCareLog("medicine")} className="inline-flex min-w-[5.5rem] flex-1 items-center justify-center gap-2 rounded-3xl border border-purple-300/50 bg-gradient-to-r from-purple-400 to-violet-500 px-2 py-3 text-xs font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-50 sm:text-sm">
          <Pill className="size-4 shrink-0" strokeWidth={2} aria-hidden />
          약 먹기 💊
        </button>
      </div>

      {/* 기록 완료 메시지 */}
      {careLogMessage ? (
        <p className="text-center text-xs font-medium text-[#1e8f83]" role="status" aria-live="polite">
          {careLogMessage}
        </p>
      ) : null}
    </div>
  );
}
