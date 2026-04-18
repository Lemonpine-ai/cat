/**
 * webRtcLogLabels — WebRTC 로그 대시보드용 라벨·색상 유틸.
 * 컴포넌트 100줄 제약 때문에 표시 로직은 여기로 분리.
 */

import type {
  WebRtcLogEvent,
  WebRtcLogRole,
} from "@/lib/webrtc/webrtcConnectionLogger";

/** 이벤트 타입 → 한글 라벨 (비전공자용) */
export const EVENT_LABEL: Record<WebRtcLogEvent, string> = {
  connected: "연결됨",
  disconnected: "끊김",
  failed: "실패",
  closed: "닫힘",
  ice_restart: "ICE 재시작",
  full_reconnect: "전체 재연결",
  connection_recovered: "복구됨",
  keepalive_dead: "응답 없음",
  visibility_reconnect: "화면복귀 재연결",
  error: "에러",
};

/** role → 한글 라벨 */
export const ROLE_LABEL: Record<WebRtcLogRole, string> = {
  broadcaster: "카메라(송신)",
  viewer_slot: "슬롯 뷰어",
  viewer_live: "라이브 뷰어",
};

/** 이벤트 → 배지 배경/글자 색 */
export function eventColor(event: WebRtcLogEvent): { bg: string; fg: string } {
  if (event === "connected" || event === "connection_recovered") {
    return { bg: "#4fd1c5", fg: "#0c2825" }; /* 민트 */
  }
  if (event === "disconnected") {
    return { bg: "#ffab91", fg: "#3b1d12" }; /* 코랄 */
  }
  if (event === "failed" || event === "error" || event === "keepalive_dead") {
    return { bg: "#ef4444", fg: "#ffffff" }; /* 빨강 */
  }
  if (
    event === "ice_restart" ||
    event === "full_reconnect" ||
    event === "visibility_reconnect"
  ) {
    return { bg: "#3b82f6", fg: "#ffffff" }; /* 파랑 */
  }
  return { bg: "#9ca3af", fg: "#ffffff" }; /* closed — 회색 */
}

/** 상대 시간 포맷 — '3분 전' */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

/** 카메라 ID 축약 — 앞 6자 + '…' */
export function shortId(id: string | null): string {
  if (!id) return "-";
  return id.length <= 8 ? id : `${id.slice(0, 6)}…`;
}
