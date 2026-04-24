/**
 * cat-identity Tier 1 — 품종 자동완성 리스트.
 *
 * 한국에서 흔히 키우는 15종 + 믹스 포함. datalist 힌트 용도이며,
 * 사용자는 자유입력 가능 (리스트 외 품종도 저장됨).
 */

/** 품종 자동완성 힌트 리스트 (순서 = 예상 빈도 높은 순). */
export const CAT_BREEDS_KO: ReadonlyArray<string> = [
  "코리안 숏헤어",
  "페르시안",
  "러시안 블루",
  "터키시 앙고라",
  "벵갈",
  "스코티시 폴드",
  "노르웨이 숲",
  "샴",
  "먼치킨",
  "메인 쿤",
  "래그돌",
  "브리티시 숏헤어",
  "아메리칸 숏헤어",
  "스핑크스",
  "믹스(혼종)",
];

/**
 * 입력값에 매칭되는 품종 후보 반환.
 * - 공백 입력 → 전체 리스트 (초기 표시용)
 * - 대소문자 무관 substring 매칭
 */
export function filterBreeds(query: string): ReadonlyArray<string> {
  const q = query.trim().toLowerCase();
  if (!q) return CAT_BREEDS_KO;
  return CAT_BREEDS_KO.filter((b) => b.toLowerCase().includes(q));
}
