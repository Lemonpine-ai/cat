/**
 * 돌봄 유형(care_type) → 귀여운 고양이 시점 멘트 매핑
 * - cat_care_logs.care_kind 값과 매칭
 * - 설계서 섹션 3.3 기준
 */
export const cuteMentMap: Record<string, string> = {
  meal: "오늘도 배빵빵하게 식사했다옹 🍚",
  medicine: "약도 잘 먹는 착한 냥이다옹 💊",
  water_change: "신선한 물 마시는 중이다옹 💧",
  litter_clean: "화장실 깨끗해서 기분 좋다옹 ✨",
  꿀잠: "지금은 꿀잠 자는 중이다옹 😴",
  우다다: "우다다 타임이다옹!! 🏃",
  식사: "냠냠 맛있다옹 🐱",
  그루밍: "예쁘게 단장 중이다옹 ✨",
  배변: "화장실 다녀왔다옹 🚽",
};
