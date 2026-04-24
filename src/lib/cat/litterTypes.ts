/**
 * cat-identity Tier 1 — 모래 타입 드롭다운 옵션.
 *
 * select 엘리먼트 용 고정 리스트. "기타" 선택 시 자유입력 보조 UI 는
 * 본 Tier 1 에서는 단순 저장만 (편집 UI 는 Tier 4).
 */

export type LitterTypeOption = {
  value: string;
  label: string;
};

export const LITTER_TYPES_KO: ReadonlyArray<LitterTypeOption> = [
  { value: "벤토나이트", label: "벤토나이트 (응고형)" },
  { value: "두부", label: "두부 (친환경)" },
  { value: "우드팰릿", label: "우드 팰릿" },
  { value: "크리스탈", label: "크리스탈 (실리카겔)" },
  { value: "종이", label: "종이 (재생지)" },
  { value: "기타", label: "기타 (직접 기록)" },
];
