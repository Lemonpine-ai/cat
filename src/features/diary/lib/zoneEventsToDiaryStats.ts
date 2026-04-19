/**
 * zone_events → DiaryStats (litter zone 배변 집계)
 *
 * 집계 규칙:
 * - zone_events where zone_type='litter' (camera_zones JOIN)
 * - duration_seconds >= 10 만 유효
 * - 5분 이내 재진입은 한 건으로 병합 → poop_count
 *
 * Zone 체류 중 동반 행동은 향후 B 전환에서 cat_behavior_events와
 * 시간 교차로 분석 예정 (현재는 단순 카운트).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiaryStats } from "../types/diaryStats";
import { kstDateRangeToUtc } from "./kstRange";

/* ─── 임계값 ─── */
const MIN_DWELL_SEC = 10;                  // 최소 체류 시간
const MERGE_WINDOW_MS = 5 * 60 * 1000;     // 5분 병합 윈도우

type ZoneEventRow = {
  started_at: string;
  duration_seconds: number | null;
  camera_zones: { zone_type: string | null } | null;
};

/**
 * zone_events 집계 → poop_count Partial 반환
 *
 * @param supabase Supabase 클라이언트
 * @param catId    대상 고양이 id
 * @param date     'YYYY-MM-DD' KST
 */
export async function zoneEventsToDiaryStats(
  supabase: SupabaseClient,
  catId: string,
  date: string,
): Promise<Partial<DiaryStats>> {
  const { startUtc, endUtc } = kstDateRangeToUtc(date);

  /* camera_zones JOIN 으로 zone_type='litter' 필터 */
  const { data, error } = await supabase
    .from("zone_events")
    .select("started_at, duration_seconds, camera_zones!inner(zone_type)")
    .eq("cat_id", catId)
    .eq("event_type", "dwell_complete")
    .eq("camera_zones.zone_type", "litter")
    .gte("started_at", startUtc)
    .lt("started_at", endUtc)
    .order("started_at", { ascending: true });

  if (error || !data || data.length === 0) {
    return { poop_count: 0 };
  }

  const rows = data as unknown as ZoneEventRow[];

  /* 10초 이상 + 5분 병합 */
  let count = 0;
  let lastEndMs = -Infinity;
  for (const r of rows) {
    const dur = r.duration_seconds ?? 0;
    if (dur < MIN_DWELL_SEC) continue;

    const start = new Date(r.started_at).getTime();
    if (Number.isNaN(start)) continue;
    const end = start + dur * 1000;

    /* 이전 방문과 5분 이내면 같은 배변 세션으로 병합 */
    if (start - lastEndMs > MERGE_WINDOW_MS) {
      count += 1;
    }
    lastEndMs = end;
  }

  return { poop_count: count };
}
