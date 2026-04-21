"use client";

/**
 * CameraSlotMulti — Multi-Viewer(R3) CameraSlot 변형.
 *
 * 기존 CameraSlot 의 JSX 를 복사했고, offerSdp prop 을 제거했으며
 * WebRTC 훅만 useWebRtcSlotConnectionMulti 로 교체했다.
 * too_many_viewers 상태용 작은 배지를 추가해 사용자에게 안내한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  Maximize2,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Users,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  useWebRtcSlotConnectionMulti,
  type MultiSlotPhase,
} from "@/../staging/hooks/useWebRtcSlotConnectionMulti";
import { useZoneDetection } from "@/hooks/useZoneDetection";
import { useGlobalMotion } from "@/hooks/useGlobalMotion";
import { useBehaviorDetection } from "@/hooks/useBehaviorDetection";
import { useBehaviorEventLogger } from "@/hooks/useBehaviorEventLogger";
import { ZoneDisplayOverlay } from "@/components/zone/ZoneDisplayOverlay";
import { BehaviorOverlay } from "@/components/catvisor/BehaviorOverlay";

/** 부모(MultiCameraGrid) 쪽 집계 로직이 기대하는 3단계 phase */
type LegacySlotPhase = "connecting" | "connected" | "error";

type CameraSlotMultiProps = {
  sessionId: string;
  deviceName: string;
  homeId?: string | null;
  cameraId?: string | null;
  rtcConfiguration?: RTCConfiguration | null;
  turnRelayConfigured?: boolean;
  delayMs?: number;
  onExpand?: () => void;
  /** 기존 3단계 phase 만 전달 — too_many_viewers 는 connecting 취급 */
  onPhaseChange?: (phase: LegacySlotPhase) => void;
  onMotionChange?: (hasMotion: boolean) => void;
  supabaseClient?: SupabaseClient;
};

/** Multi phase → 부모가 이해하는 3단계 매핑 */
function toLegacyPhase(multi: MultiSlotPhase): LegacySlotPhase {
  if (multi === "connected") return "connected";
  if (multi === "error") return "error";
  /* too_many_viewers 는 화면상 대기 상태지만 집계 상 connecting 으로 본다
   * (에러 리스트에 들어가면 재시도 로직에서 실패로 오인하기 때문) */
  return "connecting";
}

export function CameraSlotMulti({
  sessionId,
  deviceName,
  homeId = null,
  cameraId = null,
  rtcConfiguration = null,
  turnRelayConfigured,
  delayMs = 0,
  onExpand,
  onPhaseChange,
  onMotionChange,
  supabaseClient,
}: CameraSlotMultiProps) {
  const supabase = useMemo(
    () => supabaseClient ?? createSupabaseBrowserClient(),
    [supabaseClient],
  );

  /* 내부 phase 는 4단계 — 부모에게는 3단계로 매핑해서 전달 */
  const handlePhaseChange = useCallback(
    (multi: MultiSlotPhase) => {
      onPhaseChange?.(toLegacyPhase(multi));
    },
    [onPhaseChange],
  );

  const { videoRef, phase, pcRef, reconnect } = useWebRtcSlotConnectionMulti({
    sessionId,
    rtcConfiguration,
    turnRelayConfigured,
    delayMs,
    homeId,
    onPhaseChange: handlePhaseChange,
  });

  /* Zone / 모션 / 행동 — 기존 훅 그대로 재사용 */
  const { zones, activeZoneIds } = useZoneDetection({
    homeId,
    videoRef,
    isConnected: phase === "connected",
  });
  const hasMotion = useGlobalMotion({
    videoRef,
    isConnected: phase === "connected" && zones.length === 0,
  });
  const { currentBehavior, isInferring } = useBehaviorDetection({
    videoRef,
    enabled: phase === "connected",
  });
  useBehaviorEventLogger({
    homeId,
    cameraId,
    currentBehavior,
    supabaseClient: supabase,
  });

  /* onMotionChange 콜백 ref 동기화 — 인라인 화살표 함수로 인한 effect 재실행 방지 */
  const onMotionRef = useRef(onMotionChange);
  useEffect(() => {
    onMotionRef.current = onMotionChange;
  }, [onMotionChange]);
  useEffect(() => {
    if (phase === "connected") onMotionRef.current?.(hasMotion);
  }, [hasMotion, phase]);

  /* 오디오 상태 */
  const [isMuted, setIsMuted] = useState(true);
  const [isMicOn, setIsMicOn] = useState(false);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    return () => {
      micTrackRef.current?.stop();
      micTrackRef.current = null;
    };
  }, []);

  useEffect(() => {
    micTrackRef.current?.stop();
    micTrackRef.current = null;
    /* 세션 바뀌면 마이크 OFF 로 리셋 — 기존 CameraSlot 과 동일 패턴 */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMicOn(false);
  }, [sessionId]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const next = !videoRef.current.muted;
      videoRef.current.muted = next;
      setIsMuted(next);
    }
  }, [videoRef]);

  const toggleMic = useCallback(async () => {
    if (micTrackRef.current) {
      const next = !micTrackRef.current.enabled;
      micTrackRef.current.enabled = next;
      setIsMicOn(next);
      return;
    }
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const micTrack = micStream.getAudioTracks()[0];
      if (!micTrack) return;
      micTrack.enabled = true;
      micTrackRef.current = micTrack;
      setIsMicOn(true);
      pc.addTrack(micTrack, micStream);
    } catch {
      /* 권한 거부 등 무시 */
    }
  }, [pcRef]);

  const ctrlBtn =
    "pointer-events-auto flex size-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30";

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-[#0d1a18] shadow-lg ${
        onExpand ? "cursor-pointer" : ""
      }`}
      onClick={onExpand}
    >
      <video
        ref={videoRef}
        className="size-full object-contain"
        autoPlay
        playsInline
        muted
        controls={false}
      />

      {phase === "connected" && zones.length > 0 && (
        <ZoneDisplayOverlay zones={zones} activeZoneIds={activeZoneIds} />
      )}

      {phase === "connected" && (
        <BehaviorOverlay behavior={currentBehavior} isInferring={isInferring} />
      )}

      {/* 상태 오버레이 — connecting / error / too_many_viewers */}
      {phase !== "connected" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0d1a18]/85 backdrop-blur-[2px]">
          {phase === "connecting" ? (
            <>
              <Loader2 className="size-8 animate-spin text-[#4FD1C5]" strokeWidth={1.75} />
              <span className="text-xs text-slate-300">연결 중…</span>
            </>
          ) : phase === "too_many_viewers" ? (
            <>
              <Users className="size-8 text-amber-300" strokeWidth={1.75} />
              <span className="text-xs text-slate-200">4명 동시시청 중</span>
              <span className="text-[0.65rem] text-slate-400">30초 뒤 자동 재시도</span>
            </>
          ) : (
            <>
              <AlertTriangle className="size-8 text-[#FFAB91]" strokeWidth={1.75} />
              <span className="text-xs text-slate-300">연결 실패</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  reconnect();
                }}
                className="mt-1 rounded-full border border-[#4FD1C5]/50 bg-[#1e8f83]/40 px-3 py-1 text-xs font-semibold text-[#4FD1C5]"
              >
                다시 시도
              </button>
            </>
          )}
        </div>
      )}

      {/* 하단 오버레이 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex items-end justify-between bg-gradient-to-t from-black/65 via-black/20 to-transparent px-3 pb-2 pt-10">
        <div className="flex items-center gap-1.5">
          {phase === "connected" && (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />
          )}
          <span className="text-xs font-semibold text-white drop-shadow">{deviceName}</span>
          {phase === "connected" && (
            <span className="ml-1 rounded bg-red-600/80 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-white">
              LIVE
            </span>
          )}
          {phase === "too_many_viewers" && (
            <span className="ml-1 rounded bg-amber-500/80 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-white">
              대기
            </span>
          )}
        </div>

        {phase === "connected" && (
          <div className="pointer-events-auto flex gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
              className={ctrlBtn}
              aria-label={isMuted ? "소리 켜기" : "소리 끄기"}
            >
              {isMuted ? (
                <VolumeX size={15} strokeWidth={2} />
              ) : (
                <Volume2 size={15} strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void toggleMic();
              }}
              className={`${ctrlBtn} ${isMicOn ? "!bg-red-500/70" : ""}`}
              aria-label={isMicOn ? "마이크 끄기" : "마이크 켜기"}
            >
              {isMicOn ? (
                <Mic size={15} strokeWidth={2} />
              ) : (
                <MicOff size={15} strokeWidth={2} />
              )}
            </button>
          </div>
        )}
      </div>

      {onExpand && phase === "connected" && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          className="absolute right-2 top-2 z-[3] flex size-7 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30"
          aria-label="전체 화면"
        >
          <Maximize2 size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
