/**
 * 영상 클립 관련 타입 정의.
 * 이벤트 발생 시 20초 영상을 폰에 저장하고,
 * 메타데이터 + 썸네일만 서버에 올립니다.
 */

/** 클립 이벤트 종류 */
export type ClipEventType =
  | "meal"         // 식사 감지
  | "water"        // 음수 감지
  | "litter"       // 배변 감지
  | "cat_tower"    // 캣타워 체류
  | "fgs_alert"    // FGS 통증 경고
  | "cute_random"  // 일상 랜덤 캡처
  | "cute_manual"; // 사용자 수동 캡처

/** 클립 메타데이터 (Supabase + IndexedDB 공용) */
export type ClipMetadata = {
  id: string;
  home_id: string;
  device_id: string;
  event_type: ClipEventType;
  captured_at: string;       // ISO 타임스탬프
  duration: number;          // 초 (기본 20)
  file_size: number;         // 바이트
  thumbnail_path: string;    // Supabase Storage 경로
  message: string;           // 귀여운 메시지 ("냠냠 맛있게 먹었다옹 🍚")
  expires_at: string;        // 자동 삭제 시각
};

/** IndexedDB에 저장되는 전체 클립 (영상 Blob 포함) */
export type ClipRecord = ClipMetadata & {
  video_blob: Blob;
  thumbnail_base64: string;
};

/** 클립 녹화 시간 (초) */
export const CLIP_DURATION_SECONDS = 20;

/** 최대 클립 보관 개수 */
export const MAX_CLIPS = 100;

/** 무료 tier 보관 기간 (일) */
export const CLIP_RETENTION_DAYS = 7;

/** 이벤트 쿨다운 (같은 타입 이벤트 재발 방지, 초) */
export const CLIP_EVENT_COOLDOWN_SECONDS = 60;

/** 귀여운 순간 랜덤 캡처 간격 (시간) */
export const CUTE_RANDOM_INTERVAL_HOURS = 3;

/** 이벤트별 귀여운 메시지 */
export const CLIP_CUTE_MESSAGES: Record<ClipEventType, string[]> = {
  meal: [
    "냠냠 맛있게 먹었다옹 🍚",
    "오늘도 밥은 맛있다냥 😋",
    "먹방 타임! 🐱🍽️",
  ],
  water: [
    "꿀꺽꿀꺽 수분 충전 완료! 💧",
    "물 마시는 건 건강의 기본이다냥 💦",
    "시원한 물 한 모금~ 🥤",
  ],
  litter: [
    "화장실 다녀왔다냥 🚽✨",
    "깔끔하게 볼일 완료! 🧻",
    "화장실은 역시 깨끗해야 해 ✨",
  ],
  cat_tower: [
    "캣타워에서 세상 편한 낮잠 중... 😴",
    "높은 곳이 제일 좋다냥 🏰",
    "캣타워 위에서 세상 구경 중 👀",
  ],
  fgs_alert: [
    "표정이 좀 불편해 보여요 😿",
    "컨디션이 안 좋은 것 같아요 🩺",
  ],
  cute_random: [
    "그냥 존재만으로도 귀엽다옹 🐱",
    "오늘도 열심히 새 감시 중 👀🐦",
    "오늘도 털 관리는 완벽하다냥 ✨",
    "하품~ 나른한 오후다냥 🥱",
    "꼬리 흔드는 중... 기분 좋다옹 🐾",
  ],
  cute_manual: [
    "집사가 찍어준 특별한 순간 📸",
    "이 순간을 기억해 달라냥 💕",
  ],
};

/** 랜덤 메시지 선택 */
export function pickCuteMessage(eventType: ClipEventType): string {
  const messages = CLIP_CUTE_MESSAGES[eventType];
  return messages[Math.floor(Math.random() * messages.length)];
}
