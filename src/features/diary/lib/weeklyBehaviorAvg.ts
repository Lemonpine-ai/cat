/**
 * cat_behavior_events 기반 7일 주간 평균 집계
 *
 * WeeklyHighlightCards 의 "오늘 vs 주간 평균" 비교용.
 * behaviorEventsToDiaryStats 의 세션 병합 로직과 동일한 규칙을 날짜별로 적용한다.
 *
 * 행동 매핑:
 *   - eating: 5초 이상 + 5분 병합 → meal 1회
 *   - drinking/water_drink: 단순 카운트 → water (향후 YOLO 클래스 추가 대비)
 *   - peeing/pooping: 단순 카운트 → poop (향후 추가 대비)
 *   - walk_run/roll/grooming: duration 초 합산 → activity
 *
 * 날짜는 KST 기준 'YYYY-MM-DD' 로 그룹핑하여 하루 단위 집계 후 7 로 나눔
 * (기록 없는 날도 0 으로 계산).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/* ─── behavior_class → 지표 매핑 ─── */
const MEAL_CLASSES = new Set(["eating"]);
const WATER_CLASSES = new Set(["drinking", "water_drink"]);
const POOP_CLASSES = new Set(["peeing", "pooping"]);
const ACTIVITY_CLASSES = new Set(["walk_run", "roll", "grooming"]);

/* ─── 이벤트 병합 윈도우 (5분) ─── */
const MERGE_WINDOW_MS = 5 * 60 * 1000;
/* ─── 식사 최소 지속 시간 (5초) ─── */
const MIN_EATING_SEC = 5;

/** 7일 주간 평균 — 하루 단위 값 (activity 는 초 단위) */
export type WeeklyAvgEntry = {
  meal: number;
  water: number;
  poop: number;
  activity: number;
};

/** cat_behavior_events row (집계에 필요한 필드만) */
type BehaviorRow = {
  cat_id: string;
  behavior_class: string;
  detected_at: string;
  ended_at: string | null;
  confidence: number;
};

/** 하루 단위 집계 버킷 */
type DayStat = {
  meal: number;
  water: number;
  poop: number;
  activitySec: number;
  /* eating 세션 병합용 (startMs, endMs) */
  eatingSessions: { startMs: number; endMs: number }[];
};

/**
 * UTC ISO 문자열 → KST 기준 'YYYY-MM-DD' 변환.
 * UTC+9 오프셋을 적용하여 날짜 경계(KST 자정)로 그룹핑한다.
 */
function toKstDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const kst = new Date(t + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 빈 DayStat 생성 */
function emptyDayStat(): DayStat {
  return { meal: 0, water: 0, poop: 0, activitySec: 0, eatingSessions: [] };
}

/**
 * 홈의 지난 7일 cat_behavior_events → 고양이별 주간 평균 계산.
 *
 * @param supabase  Supabase 서버 클라이언트
 * @param homeId    대상 홈 id
 * @param weekAgoIso 7일 전 UTC ISO 시각 (상위에서 이미 계산된 값 재사용)
 * @param catIds    평균을 계산할 고양이 id 목록 (기록 없는 고양이도 0 으로 반환)
 * @returns Record<catId, WeeklyAvgEntry>
 */
export async function fetchWeeklyBehaviorAvgMap(
  supabase: SupabaseClient,
  homeId: string,
  weekAgoIso: string,
  catIds: readonly string[],
): Promise<Record<string, WeeklyAvgEntry>> {
  const result: Record<string, WeeklyAvgEntry> = {};
  /* catIds 기본값 0 으로 초기화 — 기록 없는 고양이도 맵에 포함 */
  for (const catId of catIds) {
    result[catId] = { meal: 0, water: 0, poop: 0, activity: 0 };
  }

  const { data: behaviorRows } = await supabase
    .from("cat_behavior_events")
    .select("cat_id, behavior_class, detected_at, ended_at, confidence")
    .eq("home_id", homeId)
    .gte("detected_at", weekAgoIso)
    .gte("confidence", 0.6)
    .order("detected_at", { ascending: true });

  if (!behaviorRows || behaviorRows.length === 0) return result;

  /* 날짜별·고양이별 버킷 */
  const perDay: Record<string, Record<string, DayStat>> = {};

  for (const row of behaviorRows as BehaviorRow[]) {
    const dateKey = toKstDate(row.detected_at);
    if (!dateKey) continue;

    if (!perDay[row.cat_id]) perDay[row.cat_id] = {};
    if (!perDay[row.cat_id][dateKey]) {
      perDay[row.cat_id][dateKey] = emptyDayStat();
    }
    const bucket = perDay[row.cat_id][dateKey];

    /* ── eating: 5초 이상 + 5분 병합 세션으로 meal 카운트 ── */
    if (MEAL_CLASSES.has(row.behavior_class)) {
      const start = new Date(row.detected_at).getTime();
      if (Number.isNaN(start)) continue;
      const rawEnd = row.ended_at ? new Date(row.ended_at).getTime() : start;
      const end = Number.isNaN(rawEnd) ? start : rawEnd;

      const last = bucket.eatingSessions[bucket.eatingSessions.length - 1];
      if (last && start - last.endMs <= MERGE_WINDOW_MS) {
        /* 5분 이내 재감지 → 기존 세션에 병합 */
        last.endMs = Math.max(last.endMs, end);
      } else {
        bucket.eatingSessions.push({ startMs: start, endMs: end });
      }
      continue;
    }

    /* ── water / poop: 단순 카운트 (이벤트당 1회) ── */
    if (WATER_CLASSES.has(row.behavior_class)) {
      bucket.water += 1;
      continue;
    }
    if (POOP_CLASSES.has(row.behavior_class)) {
      bucket.poop += 1;
      continue;
    }

    /* ── activity: walk_run / roll / grooming duration 초 합산 ── */
    if (ACTIVITY_CLASSES.has(row.behavior_class)) {
      if (!row.ended_at) continue;
      const start = new Date(row.detected_at).getTime();
      const end = new Date(row.ended_at).getTime();
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      bucket.activitySec += Math.max(0, (end - start) / 1000);
    }
  }

  /* eating 세션 → meal_count 환산 (5초 이상 필터) */
  for (const catId of Object.keys(perDay)) {
    for (const dateKey of Object.keys(perDay[catId])) {
      const bucket = perDay[catId][dateKey];
      bucket.meal = bucket.eatingSessions.filter(
        (s) => (s.endMs - s.startMs) / 1000 >= MIN_EATING_SEC,
      ).length;
    }
  }

  /* 고양이별 7일 평균 산출 — 기록 없는 날도 0 으로 계산 (/7 고정) */
  const DIVISOR = 7;
  for (const catId of catIds) {
    const days = perDay[catId] ?? {};
    let totalMeal = 0;
    let totalWater = 0;
    let totalPoop = 0;
    let totalActivitySec = 0;
    for (const stat of Object.values(days)) {
      totalMeal += stat.meal;
      totalWater += stat.water;
      totalPoop += stat.poop;
      totalActivitySec += stat.activitySec;
    }
    result[catId] = {
      meal: Math.round((totalMeal / DIVISOR) * 10) / 10,
      water: Math.round((totalWater / DIVISOR) * 10) / 10,
      poop: Math.round((totalPoop / DIVISOR) * 10) / 10,
      activity: Math.round(totalActivitySec / DIVISOR),
    };
  }

  return result;
}
