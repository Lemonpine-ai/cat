/**
 * 런타임 feature flag — 빌드 타임 상수로 평가됨.
 *
 * - `NEXT_PUBLIC_MULTI_VIEWER=1` 일 때만 신 플로우(viewer-initiated offer +
 *   `broadcasterPeerMap` 기반 1:N PC) 를 사용한다.
 * - 기본값 (미설정/0) 은 기존 1:1 single-viewer 플로우 그대로.
 *
 * R2(broadcaster) / R3(viewer) 두 훅이 모두 같은 flag 를 참조해야
 * flag ON/OFF 가 방송폰↔뷰어 양쪽에서 일관되게 작동한다.
 */
export function isMultiViewerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MULTI_VIEWER === "1";
}
