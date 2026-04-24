/**
 * cat-identity Tier 1 — 사료 자동완성 리스트.
 *
 * 한국 시장 주요 사료 브랜드. 자유입력 허용 — 리스트는 힌트만.
 */

export const CAT_FOODS_KO: ReadonlyArray<string> = [
  "로얄캐닌 인도어",
  "힐스 사이언스다이어트",
  "아카나",
  "오리젠",
  "네츄럴발란스",
  "웰니스 코어",
  "퓨리나 원",
  "아이엠스",
  "뉴트로",
  "솔리드골드",
  "나우 프레쉬",
  "카나간",
  "오쉬",
  "건식 사료 (기타)",
  "습식 사료 (기타)",
  "생식 (raw)",
];

/**
 * 입력값에 매칭되는 사료 후보 반환.
 * - 공백 입력 → 전체 리스트
 * - 대소문자 무관 substring 매칭
 */
export function filterFoods(query: string): ReadonlyArray<string> {
  const q = query.trim().toLowerCase();
  if (!q) return CAT_FOODS_KO;
  return CAT_FOODS_KO.filter((f) => f.toLowerCase().includes(q));
}
