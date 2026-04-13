"use client";

/**
 * CameraSlot — 단일 카메라 뷰어 UI.
 * WebRTC 연결은 useWebRtcSlotConnection 훅에 위임.
 * 이 컴포넌트는 UI(비디오, 오디오 버튼, 상태 표시)만 담당.
 */

import { useCallback, useRef, useState } from "react";
import { Loader2, AlertTriangle, Maximize2, Volume2, VolumeX, Mic, MicOff } from "lucide-react";
import { useWebRtcSlotConnection } from "@/hooks/useWebRtcSlotConnection";
import { useZoneDetection } from "@/hooks/useZoneDetection";
import { ZoneDisplayOverlay } from "@/components/zone/ZoneDisplayOverlay";
import type { SlotPhase } from "@/hooks/useWebRtcSlotConnection";

type CameraSlotProps = {
  sessionId: string;
  offerSdp: string;
  deviceName: string;
  /** home_id — zone 조회 + care_logs 자동 기록에 필요 */
  homeId?: string | null;
  onExpand?: () => void;
  onPhaseChange?: (phase: SlotPhase) => void;
};

export function CameraSlot({
  sessionId,
  offerSdp,
  deviceName,
  homeId = null,
  onExpand,
  onPhaseChange,
}: CameraSlotProps) {
  /* WebRTC 연결 훅 — 연결/정리/재시도 로직 전부 위임 */
  const { videoRef, phase, pcRef, reconnect } = useWebRtcSlotConnection({
    sessionId,
    offerSdp,
    onPhaseChange,
  });

  /* Zone 감지 훅 — zone 로드 + 움직임 감지 + care_logs 자동 기록 */
  const { zones, activeZoneIds } = useZoneDetection({
    homeId,
    videoRef,
    isConnected: phase === "connected",
  });

  /* 오디오 상태 */
  const [isMuted, setIsMuted] = useState(true);
  const [isMicOn, setIsMicOn] = useState(false);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);

  /* 스피커 토글 */
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const next = !videoRef.current.muted;
      videoRef.current.muted = next;
      setIsMuted(next);
    }
  }, [videoRef]);

  /* 마이크 토글 (PTT 인터컴) */
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
      className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[#0d1a18] shadow-lg cursor-pointer"
      onClick={onExpand}
    >
      {/* 비디오 — object-contain으로 좌표 정렬 보장 (zone overlay 호환) */}
      <video
        ref={videoRef}
        className="size-full object-contain"
        autoPlay
        playsInline
        muted
        controls={false}
      />

      {/* zone 영역 표시 (연결 중일 때만) */}
      {phase === "connected" && zones.length > 0 && (
        <ZoneDisplayOverlay zones={zones} activeZoneIds={activeZoneIds} />
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
