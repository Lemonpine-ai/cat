"use client";

import type { RefObject } from "react";
import { BroadcastVideoSection } from "@/components/broadcast/BroadcastVideoSection";
import { BroadcastControlSection } from "@/components/broadcast/BroadcastControlSection";
import { PortraitOverlay } from "@/components/broadcast/PortraitOverlay";
import type { BroadcastPhase } from "@/hooks/useBroadcasterSignaling";
import styles from "@/app/camera/broadcast/CameraBroadcastClient.module.css";

/* ── 케어바 props 객체 (props 12개 제한 준수용 그루핑) ── */
export interface CareBarState {
  careLogPending: boolean;
  careLogMessage: string | null;
  lastWaterChangeAt: string | null;
  lastLitterCleanAt: string | null;
  isSoundEnabled: boolean;
  onToggleSound: () => void;
  onRecordCare: (careKind: "meal" | "water_change" | "litter_clean" | "medicine") => void;
}

/* ── 방송 상태 그룹 ── */
export interface BroadcastStatusState {
  broadcastPhase: BroadcastPhase;
  peerConnectionState: RTCPeerConnectionState;
  activeSessionId: string | null;
  autoReconnectCount: number;
  errorMessage: string | null;
  cameraError: string | null;
}

/* ── 디바이스/미디어 그룹 ── */
export interface MediaRefsState {
  deviceName: string;
  facingMode: "user" | "environment";
  localVideoRef: RefObject<HTMLVideoElement | null>;
  remoteAudioRef: RefObject<HTMLAudioElement | null>;
}

/* ── 딤 오버레이 그룹 ── */
export interface DimState {
  isDimmed: boolean;
  onWakeUp: () => void;
}

/* ── 방송 콜백 그룹 ── */
export interface BroadcastActions {
  onAcquireCamera: () => void;
  onStartBroadcast: () => void;
  onStopBroadcast: () => void;
  onResetError: () => void;
  onSwitchCamera: () => void;
}

/* ── 메인 뷰 props (5개 객체 + 가로모드 스칼라) ── */
export interface BroadcastMainViewProps {
  broadcastStatus: BroadcastStatusState;
  mediaRefs: MediaRefsState;
  dim: DimState;
  careBar: CareBarState;
  broadcastActions: BroadcastActions;
  /** 세로 모드 여부 — true 이고 방송 페이즈가 idle 이 아닐 때 PortraitOverlay 노출 */
  isPortrait: boolean;
}

/**
 * 방송 메인 뷰 — 헤더 + 비디오 + 딤 오버레이 + 컨트롤 + 케어바.
 * CameraBroadcastClient에서 훅 로직 분리 후 순수 렌더링 담당.
 * props 12개 한도 준수를 위해 5개 객체로 그루핑.
 */
export function BroadcastMainView(props: BroadcastMainViewProps) {
  const { broadcastStatus, mediaRefs, dim, careBar, broadcastActions, isPortrait } = props;
  // 자주 쓰는 값은 구조분해로 가독성 확보
  const { broadcastPhase, peerConnectionState, activeSessionId } = broadcastStatus;
  const { deviceName, localVideoRef, remoteAudioRef, facingMode } = mediaRefs;

  return (
    <div className={styles.page}>
      {/* 세로 모드 안내 오버레이 — 방송이 시작된 뒤에만 표시
       *  (idle 에서는 카메라 켜기 버튼을 가리면 안 되므로 제외) */}
      {isPortrait && broadcastPhase !== "idle" && <PortraitOverlay visible />}

      {/* 화면 딤 오버레이 — 터치하면 30초간 UI 표시 */}
      {dim.isDimmed && <DimOverlay onWakeUp={dim.onWakeUp} />}

      {/* 헤더 */}
      <BroadcastHeader
        deviceName={deviceName}
        broadcastPhase={broadcastPhase}
        peerConnectionState={peerConnectionState}
      />

      {/* viewer 인터컴 오디오 재생 (화면에 보이지 않음) */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* 비디오 영역 */}
      <BroadcastVideoSection
        localVideoRef={localVideoRef}
        broadcastPhase={broadcastPhase}
        peerConnectionState={peerConnectionState}
        facingMode={facingMode}
        onSwitchCamera={broadcastActions.onSwitchCamera}
      />

      {/* 컨트롤 영역 — 그루핑 객체 그대로 전달 */}
      <BroadcastControlSection
        broadcastStatus={broadcastStatus}
        deviceName={deviceName}
        careBar={careBar}
        broadcastActions={broadcastActions}
      />

      {/* 세션 힌트 */}
      {activeSessionId ? (
        <p className={styles.sessionHint}>세션 {activeSessionId.slice(0, 8)}</p>
      ) : null}
    </div>
  );
}

/* ── 내부 서브컴포넌트 (20줄 이내 소형 컴포넌트는 파일 내 유지) ── */

/** 딤 오버레이 — 배터리 절약용 어두운 화면 */
function DimOverlay({ onWakeUp }: { onWakeUp: () => void }) {
  return (
    <div
      className={styles.dimOverlay}
      onClick={onWakeUp}
      onTouchStart={(e) => { e.preventDefault(); onWakeUp(); }}
      role="button"
      aria-label="화면 터치하여 깨우기"
    >
      <div className={styles.dimPulseIndicator} />
      <span className={styles.dimHintText}>터치하면 화면이 켜져요</span>
    </div>
  );
}

/** 헤더 — 앱 이름 + 방송자 이름 + LIVE 뱃지 */
function BroadcastHeader({
  deviceName,
  broadcastPhase,
  peerConnectionState,
}: {
  deviceName: string;
  broadcastPhase: BroadcastPhase;
  peerConnectionState: RTCPeerConnectionState;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <span className={styles.appName}>다보냥 · 방송국</span>
        <span className={styles.broadcasterLabel}>{deviceName}</span>
      </div>
      {(broadcastPhase === "live" || broadcastPhase === "connecting") && (
        <span className={styles.liveBadge} aria-live="polite">
          {broadcastPhase === "live" && peerConnectionState === "connected"
            ? "● LIVE"
            : "○ 대기"}
        </span>
      )}
    </header>
  );
}
