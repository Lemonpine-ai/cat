/* ──────────────────────────────────────
   care_type → 귀여운 고양이 시점 멘트 매핑
   다이어리 TodayCatCard에서 상태 표시에 사용
   ────────────────────────────────────── */

/** 돌봄 활동 종류별 귀여운 멘트 */
export const CUTE_MENT_MAP: Record<string, string> = {
  meal:     "오늘도 배빵빵하게 식사했다옹 🍚",
  medicine: "약도 잘 먹는 착한 냥이다옹 💊",
  water:    "신선한 물 마시는 중이다옹 💧",
  litter:   "화장실 깨끗해서 기분 좋다옹 ✨",
  sleep:    "지금은 꿀잠 자는 중이다옹 😴",
  zoomies:  "우다다 타임이다옹!! 🏃",
} as const;

/** 통증 지수(1~5)별 고양이 시점 멘트 */
export const PAIN_LEVEL_MENT: Record<number, string> = {
  1: "오늘 컨디션 최고다옹! 🌟",
  2: "살짝 찝찝하지만 괜찮다옹 😊",
  3: "오늘은 좀 불편하다옹… 🤔",
  4: "많이 아프다옹… 집사 도와줘 😿",
  5: "병원 가야 할 것 같다옹!! 🚨",
} as const;

/** 통증 지수(1~5)별 표시 라벨 */
export const PAIN_LEVEL_LABEL: Record<number, string> = {
  1: "정상",
  2: "약간 불편",
  3: "중간",
  4: "심함",
  5: "매우 심함",
} as const;

/** 통증 지수(1~5)별 색상 클래스 접미사 */
export const PAIN_LEVEL_COLOR: Record<number, string> = {
  1: "safe",       // 초록 계열
  2: "mild",       // 연한 노랑
  3: "moderate",   // 주황
  4: "severe",     // 빨강
  5: "critical",   // 진한 빨강
} as const;

/**
 * care_type 문자열로 귀여운 멘트를 가져온다.
 * 매핑에 없으면 기본 멘트를 반환한다.
 */
export function getCuteMent(careType: string): string {
  return CUTE_MENT_MAP[careType] ?? "오늘도 건강한 하루다옹 🐾";
}
