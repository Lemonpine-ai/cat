"use client";

/**
 * CameraLiveViewer — 대시보드 카메라 섹션 WebRTC 수신 뷰어.
 *
 * WebRTC 연결 로직 → useWebRtcLiveConnection 훅
 * 케어 기록 UI → CameraQuickCarePanel 컴포넌트
 * 이 파일은 세션 감시 + UI 조합만 담당.
 */

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  Maximize2,
  Mic,
  Radio,
  Smartphone,
  Video,
} from "lucide-react";
import { useWebRtcLiveConnection } from "@/hooks/useWebRtcLiveConnection";
import { CameraQuickCarePanel } from "@/components/catvisor/CameraQuickCarePanel";

/* ─── Props ─── */

type CameraLiveViewerProps = {
  /** 식수 교체 기록 시 홈 화면 상태를 즉시 동기화하는 콜백 */
  onWaterChangeRecorded?: (isoTimestamp: string) => void;
  /** 화장실 청소 기록 시 홈 화면 상태를 즉시 동기화하는 콜백 */
  onLitterCleanRecorded?: (isoTimestamp: string) => void;
  /** 홈 피그마 스타일 라이브 카드 */
  variant?: "default" | "figma";
  /** variant figma 일 때 오버레이 위치 라벨 (예: 거실, 캣타워) */
  heroPlaceLabel?: string;
};

/* ─── 컴포넌트 ─── */

export function CameraLiveViewer({
  onWaterChangeRecorded,
  onLitterCleanRecorded,
  variant = "default",
  heroPlaceLabel = "거실",
}: CameraLiveViewerProps = {}) {
  const isFigmaVariant = variant === "figma";
  const [homeId, setHomeId] = useState<string | null>(null);
  /* supabase 클라이언트를 useMemo로 안정화 — 매 렌더마다 새 인스턴스 생성 방지 */
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  /* 1단계: 내 home_id 가져오기 */
  useEffect(() => {
    async function fetchHomeId() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("home_id")
        .eq("id", user.id)
        .single();
      if (profile?.home_id) setHomeId(profile.home_id);
    }
    void fetchHomeId();
  }, [supabase]);

  /* WebRTC 연결 훅 */
  const {
    videoRef,
    connectionPhase,
    errorMessage,
    retryConnection,
    liveSession,
  } = useWebRtcLiveConnection(homeId);

  /* home_id 없으면 렌더링 안 함 */
  if (!homeId) return null;

  /* 시각 레이블 (figma 오버레이용) */
  const liveClockLabel = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

  return (
    <section
      className={
        isFigmaVariant
          ? "w-full rounded-[2rem] border border-white/95 bg-white p-3 shadow-[var(--shadow-card)]"
          : "w-full rounded-3xl border border-[#4FD1C5]/20 bg-[#F1FBF9] p-4 shadow-lg"
      }
      aria-label="라이브 카메라"
    >
      {/* ── 헤더 ── */}
      {isFigmaVariant ? (
        <FigmaHeader />
      ) : (
        <DefaultHeader connectionPhase={connectionPhase} />
      )}

      {/* ── 비디오 영역 ── */}
      <div
        className={`relative aspect-video w-full overflow-hidden bg-[#0d1a18] shadow-lg ${
          isFigmaVariant ? "rounded-[1.75rem]" : "rounded-3xl"
        }`}
      >
        <video
          ref={videoRef}
          className="size-full object-cover"
          autoPlay
          playsInline
          muted
          controls={false}
          aria-label="라이브 카메라 화면"
        />

        {/* 연결 중 / 대기 / 에러 오버레이 */}
        {connectionPhase !== "connected" ? (
          <ConnectionOverlay
            connectionPhase={connectionPhase}
            errorMessage={errorMessage}
            onRetry={retryConnection}
            isFigmaVariant={isFigmaVariant}
          />
        ) : null}

        {/* figma: 연결 중 하단 오버레이 */}
        {isFigmaVariant && connectionPhase === "connected" ? (
          <FigmaBottomOverlay
            heroPlaceLabel={heroPlaceLabel}
            liveClockLabel={liveClockLabel}
          />
        ) : null}
      </div>

      {/* ── 빠른 케어 기록 패널 ── */}
      <CameraQuickCarePanel
        supabase={supabase}
        homeId={homeId}
        catId={liveSession?.cat_id ?? null}
        sessionId={liveSession?.id ?? null}
        isFigmaVariant={isFigmaVariant}
        onWaterChangeRecorded={onWaterChangeRecorded}
        onLitterCleanRecorded={onLitterCleanRecorded}
      />
    </section>
  );
}

/* ─── 서브 컴포넌트 (파일 내 분리) ─── */

/** figma 변형 헤더 */
function FigmaHeader() {
  return (
    <div className="mb-3 flex items-center justify-between px-0.5">
      <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide text-[var(--color-primary-dark)]">
        LIVE CAM
      </h2>
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/12 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-red-600">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        LIVE
      </span>
    </div>
  );
}

/** 기본 헤더 — 연결 상태에 따라 배지 표시 */
function DefaultHeader({ connectionPhase }: { connectionPhase: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium text-[#1e8f83]">
        <Video className="size-5 shrink-0 text-[#4FD1C5]" strokeWidth={1.75} aria-hidden />
        라이브 카메라
      </h2>
      {connectionPhase === "connected" ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#4FD1C5] to-[#38BDB0] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-white shadow-lg">
          <Radio className="size-3" strokeWidth={2.5} aria-hidden />
          LIVE
        </span>
      ) : connectionPhase === "connecting" ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#4FD1C5]/20 px-3 py-1 text-[0.7rem] font-semibold text-[#1e8f83]">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          연결 중…
        </span>
      ) : (
        <span className="rounded-full bg-slate-200/80 px-3 py-1 text-[0.7rem] font-medium text-slate-500">
          대기 중
        </span>
      )}
    </div>
  );
}

/** 연결 상태 오버레이 (대기 / 연결 중 / 에러) */
function ConnectionOverlay({
  connectionPhase,
  errorMessage,
  onRetry,
  isFigmaVariant,
}: {
  connectionPhase: string;
  errorMessage: string | null;
  onRetry: () => void;
  isFigmaVariant: boolean;
}) {
  const radius = isFigmaVariant ? "rounded-[1.75rem]" : "rounded-3xl";

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0d1a18]/88 p-6 text-center backdrop-blur-[2px] ${radius}`}
      role="region"
      aria-label="라이브 카메라 상태 안내"
    >
      {connectionPhase === "watching_for_broadcast" ? (
        <>
          <Smartphone className="size-10 text-[#4FD1C5]" strokeWidth={1.5} aria-hidden />
          <span className="max-w-[22ch] text-sm leading-relaxed text-slate-300">
            남는 폰에서 방송을 시작하면 자동으로 연결돼요
          </span>
          <a
            href="/camera/broadcast"
            className="inline-flex items-center gap-2 rounded-full border-2 border-[#4FD1C5]/50 bg-gradient-to-r from-[#4FD1C5] to-[#38BDB0] px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-105"
            target="_blank"
            rel="noreferrer"
          >
            방송 시작하러 가기
            <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
          </a>
        </>
      ) : connectionPhase === "connecting" ? (
        <>
          <Loader2 className="size-10 animate-spin text-[#4FD1C5]" strokeWidth={1.75} aria-hidden />
          <span className="text-sm text-slate-300">연결 중…</span>
        </>
      ) : connectionPhase === "error" ? (
        <>
          <AlertTriangle className="size-10 text-[#FFAB91]" strokeWidth={1.75} aria-hidden />
          <span className="max-w-[22ch] text-sm text-slate-300">
            {errorMessage ?? "연결에 실패했어요."}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 rounded-full border border-[#4FD1C5]/50 bg-[#1e8f83]/40 px-4 py-2 text-sm font-semibold text-[#4FD1C5] transition hover:bg-[#1e8f83]/60"
          >
            다시 시도
          </button>
        </>
      ) : null}
    </div>
  );
}

/** figma 변형 — 연결 시 하단 오버레이 (위치 라벨 + 버튼) */
function FigmaBottomOverlay({
  heroPlaceLabel,
  liveClockLabel,
}: {
  heroPlaceLabel: string;
  liveClockLabel: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[8] flex items-end justify-between bg-gradient-to-t from-black/70 via-black/25 to-transparent px-4 pb-3 pt-14">
      <div className="pointer-events-auto min-w-0">
        <p className="truncate font-[family-name:var(--font-display)] text-base font-bold text-white drop-shadow">
          {heroPlaceLabel} 라이브
        </p>
        <p className="text-xs font-medium text-white/90">
          {heroPlaceLabel} · {liveClockLabel}
        </p>
      </div>
      <div className="pointer-events-auto flex gap-2">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30"
          aria-label="마이크(준비 중)"
        >
          <Mic size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30"
          aria-label="전체 화면(준비 중)"
        >
          <Maximize2 size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
