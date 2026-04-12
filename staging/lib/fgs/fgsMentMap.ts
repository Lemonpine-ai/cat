/* ──────────────────────────────────────
   FGS 점수 → 다이어리 귀여운 멘트 매핑
   점수별로 고양이 시점 말투로 상태를 표현한다
   ────────────────────────────────────── */

/** FGS 점수별 멘트 + 색상 설정 */
type FgsMent = {
  /** 다이어리에 표시할 멘트 */
  ment: string;
  /** 점수 표시 배경 색상 */
  color: string;
  /** 점수 의미 한글 라벨 */
  label: string;
};

/** FGS 0~4 점수별 매핑 */
export const fgsMentMap: Record<number, FgsMent> = {
  0: {
    ment: "오늘도 기분 좋다옹 😺",
    color: "#4CAF50",   /* 초록 — 정상 */
    label: "정상",
  },
  1: {
    ment: "살짝 불편할 수도 있다옹~ 😌",
    color: "#8BC34A",   /* 연초록 — 관심 */
    label: "관심",
  },
  2: {
    ment: "좀 불편하다옹... 지켜봐줘 😿",
    color: "#FF9800",   /* 주황 — 주의 */
    label: "주의",
  },
  3: {
    ment: "아프다옹... 병원 가자 집사야 🏥",
    color: "#F44336",   /* 빨강 — 경고 */
    label: "경고",
  },
  4: {
    ment: "많이 아프다옹... 지금 바로 병원! 🚨",
    color: "#B71C1C",   /* 진빨강 — 심각 */
    label: "심각",
  },
};

/**
 * FGS 점수로 멘트 가져오기
 * 범위 밖이면 기본 멘트 반환
 */
export function getFgsMent(score: number): FgsMent {
  return fgsMentMap[score] ?? fgsMentMap[0];
}
