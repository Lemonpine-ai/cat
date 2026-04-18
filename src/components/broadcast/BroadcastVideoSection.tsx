"use client";

import type { RefObject } from "react";
import { Camera, Eye, SwitchCamera } from "lucide-react";
import type { BroadcastPhase } from "@/hooks/useBroadcasterSignaling";
import styles from "@/app/camera/broadcast/CameraBroadcastClient.module.css";

/* ── 비디오 섹션 props ── */
export interface BroadcastVideoSectionProps {
  localVideoRef: RefObject<HTMLVideoElement | null>;
  broadcastPhase: BroadcastPhase;
  peerConnectionState: RTCPeerConnectionState;
  facingMode: "user" | "environment";
  onSwitchCamera: () => void;
}

/**
 * 비디오 섹션 — 로컬 비디오 + 플레이스홀더 + 시청 뱃지 + 카메라 전환.
 * BroadcastMainView 본체에서 분리하여 가독성 확보.
 */
export function BroadcastVideoSection({
  localVideoRef,
  broadcastPhase,
  peerConnectionState,
  facingMode,
  onSwitchCamera,
}: BroadcastVideoSectionProps) {
  return (
    <div className={styles.videoWrap}>
      <video
        ref={localVideoRef}
        className={styles.localVideo}
        autoPlay
        muted
        playsInline
        aria-label="카메라 미리보기"
      />
      {/* 카메라 미작동 시 플레이스홀더 */}
      {broadcastPhase === "idle" || broadcastPhase === "acquiring" ? (
        <div className={styles.videoPlaceholder} aria-hidden>
          <span className={styles.placeholderIcon}>
            <Camera size={64} color="rgba(79,209,197,0.35)" strokeWidth={1.25} />
          </span>
        </div>
      ) : null}
      {/* 시청자 연결 뱃지 */}
      {peerConnectionState === "connected" && (
        <div className={styles.viewerBadge} aria-live="polite">
          <Eye size={14} strokeWidth={2} aria-hidden /> 시청 중
        </div>
      )}
      {/* 전면/후면 카메라 전환 버튼 */}
      {(broadcastPhase === "ready" || broadcastPhase === "connecting" || broadcastPhase === "live") && (
        <button
          type="button"
          className={styles.switchCameraBtn}
          onClick={() => void onSwitchCamera()}
          aria-label={facingMode === "environment" ? "전면 카메라로 전환" : "후면 카메라로 전환"}
        >
          <SwitchCamera size={20} strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}
