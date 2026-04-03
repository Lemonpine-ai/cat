/**
 * Supabase에 저장되는 DB 내부 값 → 화면에 보이는 귀여운 집사 용어 매핑.
 *
 * DB 값은 기존 데이터와의 호환을 위해 변경하지 않습니다.
 * 화면에만 친근한 라벨을 표시합니다.
 */
export const CAT_STATUS_DB_VALUES = [
  "꿀잠",
  "배변",
  "그루밍",
  "식사",
  "우다다",
] as const;

export type CatStatusDbValue = (typeof CAT_STATUS_DB_VALUES)[number];

export const STATUS_DISPLAY_LABEL: Record<CatStatusDbValue, string> = {
  꿀잠: "꿈나라 여행 🌙",
  배변: "감자 캐기 🥔",
  그루밍: "그루밍 ✨",
  식사: "맘마 먹기 🍚",
  우다다: "우다다 🏃",
};

/**
 * DB 값을 화면 라벨로 변환합니다. 알 수 없는 값은 그대로 반환합니다.
 */
export function toDisplayLabel(dbValue: string | null | undefined): string {
  if (!dbValue) {
    return "";
  }
  return STATUS_DISPLAY_LABEL[dbValue as CatStatusDbValue] ?? dbValue;
}
