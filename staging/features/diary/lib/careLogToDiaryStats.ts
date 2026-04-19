/**
 * cat_care_logs → DiaryStats 변환 (폴백용)
 *
 * 집사가 직접 기록한 돌봄 로그를 하루 통계로 집계한다.
 * AI 커버리지가 낮을 때(카메라 꺼짐) 주 데이터 소스로 사용한다.
 *
 * care_kind 매핑:
 * - meal          → meal_count
 * - water_change  → water_count
 * - litter_clean  → poop_count (청소 = 배변 추정)
 * - medicine      → 별도 필드 없음 (health alert 용)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiaryStats } from "../types/diaryStats";
import { kstDateRangeToUtc } from "./kstRange";

type CareLogRow = {
  care_kind: string;
  created_at: string;
};

/**
 * 집사 돌봄 로그 → 부분 DiaryStats
 *
 * @param supabase Supabase 클라이언트
 * @param catId    대상 고양이 id
 * @param date     'YYYY-MM-DD' KST
 */
export async function careLogToDiaryStats(
  supabase: SupabaseClient,
  catId: string,
  date: string,
): Promise<Partial<DiaryStats>> {
  const { startUtc, endUtc } = kstDateRangeToUtc(date);

  const { data, error } = await supabase
    .from("cat_care_logs")
    .select("care_kind, created_at")
    .eq("cat_id", catId)
    .gte("created_at", startUtc)
    .lt("created_at", endUtc);

  /* 에러/빈 값 방어 — 0으로 채워 반환 */
  if (error || !data) {
    return { meal_count: 0, water_count: 0, poop_count: 0 };
  }

  const rows = data as CareLogRow[];

  /* care_kind 별 카운트 누적 */
  let meal = 0;
  let water = 0;
  let poop = 0;

  for (const r of rows) {
    switch (r.care_kind) {
      case "meal":
        meal += 1;
        break;
      case "water_change":
        water += 1;
        break;
      case "litter_clean":
        /* 화장실 청소 횟수를 배변 추정치로 사용 */
        poop += 1;
        break;
      default:
        /* medicine 등 기타 — 통계엔 미반영 */
        break;
    }
  }

  return {
    meal_count: meal,
    water_count: water,
    poop_count: poop,
  };
}
