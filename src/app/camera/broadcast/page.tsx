import { CameraBroadcastClient } from "./CameraBroadcastClient";

/**
 * 카메라 방송 페이지 — device token 인증 또는 사용자 로그인 모두 지원.
 * 클라이언트에서 localStorage의 device_token 혹은 Supabase 세션을 확인합니다.
 */
export default function CameraBroadcastPage() {
  return <CameraBroadcastClient />;
}
