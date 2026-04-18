"use client";

import { Camera, Radio, Square } from "lucide-react";
import { BroadcastCareBar } from "@/components/broadcast/BroadcastCareBar";
import type {
  BroadcastStatusState,
  BroadcastActions,
  CareBarState,
} from "@/components/broadcast/BroadcastMainView";
import styles from "@/app/camera/broadcast/CameraBroadcastClient.module.css";

/** PeerConnection 상태 → 사용자 표시 레이블 */
const peerStatusLabel: Record<RTCPeerConnectionState, string> = {
  new: "대기 중",
  connecting: "연결 중…",
  connected: "연결됨 ✅",
  disconnected: "연결 끊김",
  failed: "연결 실패",
  closed: "종료됨",
};

/* ── 컨트롤 섹션 props (4개로 축소) ── */
export interface BroadcastControlSectionProps {
  broadcastStatus: BroadcastStatusState;
  deviceName: string;
  careBar: CareBarState;
  broadcastActions: BroadcastActions;
}

/**
 * 컨트롤 섹션 — 에러, 단계별 버튼, 케어바, 종료 버튼.
 * BroadcastMainView 본체에서 분리하여 가독성 확보.
 * props 12개 한도 준수를 위해 그루핑 객체를 받아 내부에서 구조분해.
 */
export function BroadcastControlSection({
  broadcastStatus,
  deviceName,
  careBar,
  broadcastActions,
}: BroadcastControlSectionProps) {
  // 방송 상태 구조분해 — 내부 로직 가독성 확보
  const {
    broadcastPhase,
    peerConnectionState,
    autoReconnectCount,
    errorMessage,
    cameraError,
  } = broadcastStatus;
  // 콜백 구조분해
  const {
    onAcquireCamera,
    onStartBroadcast,
    onStopBroadcast,
    onResetError,
  } = broadcastActions;

  return (
    <div className={styles.controls}>
      {/* 에러 메시지 */}
      {(errorMessage || cameraError) ? (
        <p className={styles.errorText} role="alert">{errorMessage ?? cameraError}</p>
      ) : null}

      {/* idle: 카메라 켜기 */}
      {broadcastPhase === "idle" ? (
        <button type="button" className={styles.btnPrimary} onClick={() => void onAcquireCamera()}>
          <Camera size={18} strokeWidth={2} aria-hidden />
          카메라 켜기 📷
        </button>
      ) : null}

      {/* acquiring: 권한 요청 중 */}
      {broadcastPhase === "acquiring" ? (
        <p className={styles.statusText}>카메라 권한을 요청 중이에요… 🐱</p>
      ) : null}

      {/* ready: 방송 시작 */}
      {broadcastPhase === "ready" ? (
        <button type="button" className={styles.btnPrimary} onClick={() => void onStartBroadcast()}>
          <Radio size={18} strokeWidth={2} aria-hidden />
          방송 시작
        </button>
      ) : null}

      {/* connecting / live: 방송 중 컨트롤 */}
      {broadcastPhase === "connecting" || broadcastPhase === "live" ? (
        <div className={styles.liveControls}>
          <p className={styles.statusText}>
            {peerConnectionState === "connected"
              ? `● ${deviceName} 방송 중`
              : autoReconnectCount > 0
                ? `🔄 재연결 중… (${autoReconnectCount}회)`
                : `○ 시청자 기다리는 중… (${peerStatusLabel[peerConnectionState]})`}
          </p>
          <BroadcastCareBar
            careLogPending={careBar.careLogPending}
            careLogMessage={careBar.careLogMessage}
            lastWaterChangeAt={careBar.lastWaterChangeAt}
            lastLitterCleanAt={careBar.lastLitterCleanAt}
            isSoundEnabled={careBar.isSoundEnabled}
            onToggleSound={careBar.onToggleSound}
            onRecordCare={careBar.onRecordCare}
          />
          <button type="button" className={styles.btnStop} onClick={() => void onStopBroadcast()}>
            <Square size={16} strokeWidth={2} aria-hidden />
            방송 종료
          </button>
        </div>
      ) : null}

      {/* error: 다시 시작 */}
      {broadcastPhase === "error" ? (
        <button type="button" className={styles.btnPrimary} onClick={() => void onResetError()}>
          🔄 다시 시작
        </button>
      ) : null}
    </div>
  );
}
