/**
 * AI 감지 커버리지 계산
 *
 * 하루를 1시간 단위 24개 버킷으로 나누고,
 * 해당 시간대에 1건이라도 AI 감지 이벤트가 있으면 "작동 중"으로 본다.
 *
 * 커버리지 = 감지된 시간 버킷 수 / 24
 *
 * 이 값으로 데이터 소스를 결정한다:
 * - >= 0.5 : AI 위주 ('ai')
 * - 0.1~0.5: 혼합 보완 ('hybrid')
 * - < 0.1  : 집사 기록 위주 ('care_log')
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { kstDateRangeToUtc } from "./kstRange";

/**
 * 하루 중 AI 감지가 돌아간 시간 비율(0~1) 계산
 *
 * @param supabase Supabase 클라이언트
 * @param catId    대상 고양이 id
 * @param date     'YYYY-MM-DD' KST
 */
export async function computeAiCoverage(
  supabase: SupabaseClient,
  catId: string,
  date: string,
): Promise<number> {
  const { startUtc, endUtc } = kstDateRangeToUtc(date);
  const startMs = new Date(startUtc).getTime();

  const { data, error } = await supabase
    .from("cat_behavior_events")
    .select("detected_at")
    .eq("cat_id", catId)
    .gte("detected_at", startUtc)
    .lt("detected_at", endUtc);

  if (error || !data || data.length === 0) return 0;

  /* 1시간 단위 24개 버킷 — 감지된 버킷만 표시 */
  const buckets = new Set<number>();
  for (const row of data as { detected_at: string }[]) {
    const t = new Date(row.detected_at).getTime();
    if (Number.isNaN(t)) continue;
    /* 경과 시간(ms) → 시간 단위 버킷 인덱스 (0~23) */
    const hour = Math.floor((t - startMs) / (60 * 60 * 1000));
    if (hour >= 0 && hour < 24) buckets.add(hour);
  }

  return buckets.size / 24;
}
