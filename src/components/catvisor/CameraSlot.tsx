"use client";

/**
 * CameraSlot — 단일 카메라 뷰어 UI.
 * WebRTC 연결은 useWebRtcSlotConnection 훅에 위임.
 * 이 컴포넌트는 UI(비디오, 오디오 버튼, 상태 표시)만 담당.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle, Maximize2, Volume2, VolumeX, Mic, MicOff } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useWebRtcSlotConnection } from "@/hooks/useWebRtcSlotConnection";
import { useZoneDetection } from "@/hooks/useZoneDetection";
import { useGlobalMotion } from "@/hooks/useGlobalMotion";
import { useBehaviorDetection } from "@/hooks/useBehaviorDetection";
import { useBehaviorEventLogger } from "@/hooks/useBehaviorEventLogger";
// Phase B (R12 commit 3): flag ON 시 뷰어 logger 경로 차단 (INSERT 중복 방지).
import { isYoloV2Enabled } from "@/lib/behavior/yoloV2Flag";
import { ZoneDisplayOverlay } from "@/components/zone/ZoneDisplayOverlay";
import { BehaviorOverlay } from "@/components/catvisor/BehaviorOverlay";
import type { SlotPhase } from "@/hooks/useWebRtcSlotConnection";

type CameraSlotProps = {
  sessionId: string;
  offerSdp: string;
  deviceName: string;
  homeId?: string | null;
  /** 카메라 디바이스 ID — 행동 이벤트 DB 기록용 (null 이면 로깅 비활성) */
  cameraId?: string | null;
  /** 외부 ICE config — MultiCameraGrid에서 1번만 로드해서 공유 */
  rtcConfiguration?: RTCConfiguration | null;
  /** TURN relay 설정 여부 — MultiCameraGrid에서 전달 */
  turnRelayConfigured?: boolean;
  /** 연결 지연 (ms) — 2대 동시 연결 시 stagger용 */
  delayMs?: number;
  onExpand?: () => void;
  onPhaseChange?: (phase: SlotPhase) => void;
  /** 모션 상태 변경 콜백 (대시보드 상태 보드용) */
  onMotionChange?: (hasMotion: boolean) => void;
  /**
   * 공용 Supabase 클라이언트 — 상위(MultiCameraGrid)에서 주입 권장.
   * 여러 슬롯이 각자 클라이언트를 만들면 realtime 소켓이 중복됨.
   * 미주입 시 슬롯 내부에서 useMemo로 1회만 생성.
   */
  supabaseClient?: SupabaseClient;
};

export function CameraSlot({
  sessionId,
  offerSdp,
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
}: CameraSlotProps) {
  /* 공용 Supabase 클라이언트 — 미주입 시 1회만 생성 (렌더마다 재생성 금지) */
  const supabase = useMemo(
    () => supabaseClient ?? createSupabaseBrowserClient(),
    [supabaseClient],
  );
  /* WebRTC 연결 훅 — ICE config 공유 + stagger 지연 */
  const { videoRef, phase, pcRef, reconnect } = useWebRtcSlotConnection({
    sessionId,
    offerSdp,
    rtcConfiguration,
    turnRelayConfigured,
    delayMs,
    onPhaseChange,
  });

  /* Zone 감지 훅 — zone 로드 + 움직임 감지 + care_logs 자동 기록 */
  const { zones, activeZoneIds } = useZoneDetection({
    homeId,
    videoRef,
    isConnected: phase === "connected",
  });

  /* 글로벌 모션 감지 — zone 없을 때만 활성화 (zone 있으면 zone 감지가 담당) */
  const hasMotion = useGlobalMotion({
    videoRef,
    isConnected: phase === "connected" && zones.length === 0,
  });

  /* YOLO 행동 인식 — Viewer 측 추론 (Broadcaster는 송출 전용) */
  const { currentBehavior, isInferring } = useBehaviorDetection({
    videoRef,
    enabled: phase === "connected",
  });

  /* 행동 이벤트 DB 로거 — 전환 시점만 INSERT/UPDATE (fire-and-forget).
   * Phase B (R12 commit 3): flag ON 시 homeId=null 로 강제 → logger 내부 early return → INSERT 0.
   * 방송폰 CameraBroadcastYoloMount 가 단독 INSERT 담당 (2026-04-22 장애 재발 방지). */
  useBehaviorEventLogger({
    homeId: isYoloV2Enabled() ? null : homeId,
    cameraId,
    currentBehavior,
    supabaseClient: supabase,
  });

  /* 모션 콜백을 ref로 보관 — 인라인 화살표 함수로 인한 불필요한 effect 재실행 방지 */
  const onMotionRef = useRef(onMotionChange);
  onMotionRef.current = onMotionChange;

  /* 모션 상태 변경 시 상위 컴포넌트에 알림 — connected 상태에서만 전달 */
  useEffect(() => {
    if (phase === "connected") {
      onMotionRef.current?.(hasMotion);
    }
  }, [hasMotion, phase]);

  /* 오디오 상태 */
  const [isMuted, setIsMuted] = useState(true);
  const [isMicOn, setIsMicOn] = useState(false);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);

  /* 마이크 트랙 정리 — 언마운트 시 미디어 리소스 해제 */
  useEffect(() => {
    return () => {
      micTrackRef.current?.stop();
      micTrackRef.current = null;
    };
  }, []);

  /* sessionId 변경 시 마이크 트랙 초기화 — 이전 세션의 트랙이 남지 않도록 */
  useEffect(() => {
    micTrackRef.current?.stop();
    micTrackRef.current = null;
    setIsMicOn(false);
  }, [sessionId]);

  /* 스피커 토글 */
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const next = !videoRef.current.muted;
      videoRef.current.muted = next;
      setIsMuted(next);
    }
  }, [videoRef]);

  /* 마이크 토글 (PTT 인터컴)
   * PTT(Push-to-Talk) — enabled 토글로 무음 처리, track.stop()은 하지 않음 (재획득 비용 방지) */
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
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const micTrack = micStream.getAudioTracks()[0];
      if (!micTrack) return;
      micTrack.enabled = true;
      micTrackRef.current = micTrack;
      setIsMicOn(true);
      pc.addTrack(micTrack, micStream);
    } catch { /* 마이크 권한 거부 */ }
  }, [pcRef]);

  const ctrlBtn = "pointer-events-auto flex size-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30";

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-[#0d1a18] shadow-lg ${onExpand ? "cursor-pointer" : ""}`}
      onClick={onExpand}
    >
      {/* 비디오 */}
      <video
        ref={videoRef}
        className="size-full object-contain" /* zone overlay 좌표 호환 — object-cover 사용 금지 */
        autoPlay
        playsInline
        muted
        controls={false}
      />

      {/* zone 영역 표시 (연결 중일 때만) */}
      {phase === "connected" && zones.length > 0 && (
        <ZoneDisplayOverlay zones={zones} activeZoneIds={activeZoneIds} />
      )}

      {/* 행동 인식 라벨 오버레이 (연결 중일 때만) */}
      {phase === "connected" && (
        <BehaviorOverlay behavior={currentBehavior} isInferring={isInferring} />
      )}

      {/* 상태 오버레이 */}
      {phase !== "connected" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0d1a18]/85 backdrop-blur-[2px]">
          {phase === "connecting" ? (
            <>
              <Loader2 className="size-8 animate-spin text-[#4FD1C5]" strokeWidth={1.75} />
              <span className="text-xs text-slate-300">연결 중…</span>
            </>
          ) : (
            <>
              <AlertTriangle className="size-8 text-[#FFAB91]" strokeWidth={1.75} />
              <span className="text-xs text-slate-300">연결 실패</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); reconnect(); }}
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
        </div>

        {phase === "connected" && (
          <div className="pointer-events-auto flex gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              className={ctrlBtn}
              aria-label={isMuted ? "소리 켜기" : "소리 끄기"}
            >
              {isMuted ? <VolumeX size={15} strokeWidth={2} /> : <Volume2 size={15} strokeWidth={2} />}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void toggleMic(); }}
              className={`${ctrlBtn} ${isMicOn ? "!bg-red-500/70" : ""}`}
              aria-label={isMicOn ? "마이크 끄기" : "마이크 켜기"}
            >
              {isMicOn ? <Mic size={15} strokeWidth={2} /> : <MicOff size={15} strokeWidth={2} />}
            </button>
          </div>
        )}
      </div>

      {/* 확대 버튼 */}
      {onExpand && phase === "connected" && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onExpand(); }}
          className="absolute right-2 top-2 z-[3] flex size-7 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30"
          aria-label="전체 화면"
        >
          <Maximize2 size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
