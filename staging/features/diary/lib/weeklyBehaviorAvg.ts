/**
 * cat_behavior_events 기반 7일 주간 평균 집계 (Phase A 신규 12 클래스 + user_label 보정).
 *
 * - WeeklyHighlightCards "오늘 vs 주간 평균" 비교용.
 * - behaviorEventsToDiaryStats 의 세션 병합 규칙과 동일.
 * - semantic-map 기반 (하드코딩 제거).
 *
 * 행동 매핑 (semantic):
 *   - meal     : eating          → 5초 이상 + 5분 병합 → meal 1회
 *   - water    : drinking         → 단순 카운트 → water
 *   - hygiene  : grooming/elimination
 *                · grooming      → duration 합산 → activity 에 포함하지 않음(별 카테고리)
 *                · elimination   → 단순 카운트 → poop
 *   - activity : playing/walking/running → duration 합산
 *
 * 날짜는 KST 기준 'YYYY-MM-DD' 로 그룹핑하여 하루 단위 집계 후 7 로 나눔
 * (기록 없는 날도 0 으로 계산).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
// staging 신규 모듈 — 상대 경로로 staging 내부 참조 (tsconfig paths 미적용 영역).
import {
  getBehaviorSemantic,
  type BehaviorSemantic,
} from "../../../lib/ai/behaviorClasses";
import { getEffectiveClass } from "../../../lib/behavior/effectiveClass";
import { NON_NOISE_FILTER } from "../../../lib/behavior/userLabelFilter";

/* ─── 임계값 상수 ─── */
const MIN_CONFIDENCE = 0.6;
const MERGE_WINDOW_MS = 5 * 60 * 1000; // 5 분
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
  user_label: string | null;
};

/** 하루 단위 집계 버킷 */
type DayStat = {
  meal: number;
  water: number;
  poop: number;
  activitySec: number;
  /** eating 세션 병합용 */
  eatingSessions: { startMs: number; endMs: number }[];
};

/** UTC ISO 문자열 → KST 'YYYY-MM-DD' 변환 (UTC+9 적용) */
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
 * @param supabase   Supabase 서버 클라이언트
 * @param homeId     대상 홈 id
 * @param weekAgoIso 7일 전 UTC ISO 시각 (호출부에서 사전 계산)
 * @param catIds     평균 계산 대상 고양이 id 목록 (기록 없어도 0 반환)
 */
export async function fetchWeeklyBehaviorAvgMap(
  supabase: SupabaseClient,
  homeId: string,
  weekAgoIso: string,
  catIds: readonly string[],
): Promise<Record<string, WeeklyAvgEntry>> {
  const result: Record<string, WeeklyAvgEntry> = {};
  // 기본값 0 으로 초기화 — 기록 없는 고양이도 맵에 포함
  for (const catId of catIds) {
    result[catId] = { meal: 0, water: 0, poop: 0, activity: 0 };
  }

  const { data: behaviorRows } = await supabase
    .from("cat_behavior_events")
    .select(
      "cat_id, behavior_class, detected_at, ended_at, confidence, user_label",
    )
    .eq("home_id", homeId)
    .gte("detected_at", weekAgoIso)
    .gte("confidence", MIN_CONFIDENCE)
    .or(NON_NOISE_FILTER)
    .order("detected_at", { ascending: true });

  if (!behaviorRows || behaviorRows.length === 0) return result;

  // 날짜별·고양이별 버킷
  const perDay: Record<string, Record<string, DayStat>> = {};

  for (const rawRow of behaviorRows as BehaviorRow[]) {
    // user_label 보정 — effective_class 가 NULL 이면 노이즈로 폴백 → skip
    const effective = getEffectiveClass(rawRow);
    if (!effective) continue;
    const row: BehaviorRow = { ...rawRow, behavior_class: effective };

    const dateKey = toKstDate(row.detected_at);
    if (!dateKey) continue;

    if (!perDay[row.cat_id]) perDay[row.cat_id] = {};
    if (!perDay[row.cat_id][dateKey]) {
      perDay[row.cat_id][dateKey] = emptyDayStat();
    }
    const bucket = perDay[row.cat_id][dateKey];

    const semantic: BehaviorSemantic | null = getBehaviorSemantic(
      row.behavior_class,
    );
    if (!semantic) continue;

    // ── meal: 5초 이상 + 5분 병합 ──
    if (semantic === "meal") {
      const start = new Date(row.detected_at).getTime();
      if (Number.isNaN(start)) continue;
      const rawEnd = row.ended_at ? new Date(row.ended_at).getTime() : start;
      const end = Number.isNaN(rawEnd) ? start : rawEnd;

      const last = bucket.eatingSessions[bucket.eatingSessions.length - 1];
      if (last && start - last.endMs <= MERGE_WINDOW_MS) {
        last.endMs = Math.max(last.endMs, end);
      } else {
        bucket.eatingSessions.push({ startMs: start, endMs: end });
      }
      continue;
    }

    // ── water: 단순 카운트 ──
    if (semantic === "water") {
      bucket.water += 1;
      continue;
    }

    // ── hygiene 분기 명시 (semantic=hygiene 안에 elimination + grooming 공존) ──
    // ⚠️ R2 변경 (REJECT-5b): semantic 동일하지만 의미가 달라 명시 분기.
    //   · elimination = 배설 횟수 (건강 지표) → poop 으로 카운트.
    //   · grooming    = 그루밍 시간 (자기관리 지표) → 본 weekly 4지표에서 제외
    //                   (별도 카드/뷰에서 시간 합산으로 노출 예정).
    if (semantic === "hygiene") {
      if (row.behavior_class === "elimination") {
        // 배설은 횟수 합산
        bucket.poop += 1;
      }
      // grooming 은 본 weekly 평균에서 제외 — 의도적 skip (시간 합산은 별도 모듈)
      continue;
    }

    // ── activity: duration 합산 ──
    if (semantic === "activity") {
      if (!row.ended_at) continue;
      const start = new Date(row.detected_at).getTime();
      const end = new Date(row.ended_at).getTime();
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      bucket.activitySec += Math.max(0, (end - start) / 1000);
    }

    // rest / alert 등 그 외 semantic 은 본 집계에서 제외
    // (WeeklyHighlightCards 4 지표 - meal/water/poop/activity 만 노출)
  }

  // eating 세션 → meal_count 환산 (5초 이상 필터)
  for (const catId of Object.keys(perDay)) {
    for (const dateKey of Object.keys(perDay[catId])) {
      const bucket = perDay[catId][dateKey];
      bucket.meal = bucket.eatingSessions.filter(
        (s) => (s.endMs - s.startMs) / 1000 >= MIN_EATING_SEC,
      ).length;
    }
  }

  // 고양이별 7일 평균 — 기록 없는 날도 0 으로 (/7 고정)
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
