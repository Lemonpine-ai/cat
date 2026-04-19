/**
 * cat_behavior_events → DiaryStats 집계
 *
 * AI가 감지한 행동 이벤트(식사, 그루밍, 산책, 눕기 등)를
 * 하루 단위 통계로 변환한다.
 *
 * 세션 병합 규칙:
 * - eating:    5초 이상 + 5분 이내 재감지 시 병합 → meal_count
 * - grooming:  10초 이상 + 5분 이내 재감지 시 병합 → groom_count
 * - walk_run/roll: duration 단순 합산 → activity_seconds
 * - lying/sit_down: duration 단순 합산 → rest_seconds
 * - confidence >= 0.6 만 카운트 (오탐 방지)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiaryStats } from "../types/diaryStats";
import { kstDateRangeToUtc } from "./kstRange";

/* ─── 임계값 상수 ─── */
const MIN_CONFIDENCE = 0.6;               // 최소 신뢰도
const MIN_EATING_SEC = 5;                 // 식사 최소 지속 시간
const MIN_GROOMING_SEC = 10;              // 그루밍 최소 지속 시간
const MERGE_WINDOW_MS = 5 * 60 * 1000;    // 세션 병합 윈도우 (5분)

/* ─── Supabase row 타입 ─── */
type BehaviorRow = {
  behavior_class: string;
  confidence: number;
  detected_at: string;
  ended_at: string | null;
};

/* ─── 병합된 세션 하나 ─── */
type MergedSession = {
  startMs: number;
  endMs: number;
};

/**
 * 같은 카테고리 이벤트들을 시간순 + 5분 윈도우 기준으로 병합
 * @param events 시간 순 정렬된 이벤트 목록
 * @param minDurationSec 최소 지속 시간(초). 세션 병합 후 이 값 이상만 카운트
 */
function mergeSessions(events: BehaviorRow[], minDurationSec: number): MergedSession[] {
  const sessions: MergedSession[] = [];

  for (const ev of events) {
    const start = new Date(ev.detected_at).getTime();
    if (Number.isNaN(start)) continue;

    /* ended_at 없으면 detected_at 사용 (구간 길이 0) */
    const rawEnd = ev.ended_at ? new Date(ev.ended_at).getTime() : start;
    const end = Number.isNaN(rawEnd) ? start : rawEnd;

    const last = sessions[sessions.length - 1];
    /* 이전 세션 종료 + 5분 이내면 같은 세션으로 간주 */
    if (last && start - last.endMs <= MERGE_WINDOW_MS) {
      last.endMs = Math.max(last.endMs, end);
    } else {
      sessions.push({ startMs: start, endMs: end });
    }
  }

  /* 최소 지속 시간 이상인 세션만 반환 */
  return sessions.filter((s) => (s.endMs - s.startMs) / 1000 >= minDurationSec);
}

/**
 * 특정 행동 클래스의 duration 합산(초).
 * 세션 병합 없이 단순 누적 (활동/휴식용).
 */
function sumDurationSeconds(events: BehaviorRow[]): number {
  let total = 0;
  for (const ev of events) {
    const start = new Date(ev.detected_at).getTime();
    if (!ev.ended_at) continue;
    const end = new Date(ev.ended_at).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const dur = Math.max(0, (end - start) / 1000);
    total += dur;
  }
  return total;
}

/**
 * 행동 이벤트 → 부분 DiaryStats 변환
 *
 * @param supabase Supabase 클라이언트 (브라우저/서버 어느 쪽이든)
 * @param catId    대상 고양이 id (멀티묘 필터)
 * @param date     'YYYY-MM-DD' (KST 기준)
 * @returns meal_count / groom_count / activity_seconds / rest_seconds 채운 Partial
 */
export async function behaviorEventsToDiaryStats(
  supabase: SupabaseClient,
  catId: string,
  date: string,
): Promise<Partial<DiaryStats>> {
  const { startUtc, endUtc } = kstDateRangeToUtc(date);

  /* cat_id + 시간 범위 + confidence 필터 */
  const { data, error } = await supabase
    .from("cat_behavior_events")
    .select("behavior_class, confidence, detected_at, ended_at")
    .eq("cat_id", catId)
    .gte("detected_at", startUtc)
    .lt("detected_at", endUtc)
    .gte("confidence", MIN_CONFIDENCE)
    .order("detected_at", { ascending: true });

  /* 에러/빈 데이터 방어 */
  if (error || !data || data.length === 0) {
    return { meal_count: 0, groom_count: 0, activity_seconds: 0, rest_seconds: 0 };
  }

  const rows = data as BehaviorRow[];

  /* 클래스별로 분류 */
  const eating = rows.filter((r) => r.behavior_class === "eating");
  const grooming = rows.filter((r) => r.behavior_class === "grooming");
  const activity = rows.filter((r) => r.behavior_class === "walk_run" || r.behavior_class === "roll");
  const resting = rows.filter((r) => r.behavior_class === "lying" || r.behavior_class === "sit_down");

  /* 세션 병합 → 카운트 */
  const meal_count = mergeSessions(eating, MIN_EATING_SEC).length;
  const groom_count = mergeSessions(grooming, MIN_GROOMING_SEC).length;

  /* duration 합산 → 초 단위 */
  const activity_seconds = Math.round(sumDurationSeconds(activity));
  const rest_seconds = Math.round(sumDurationSeconds(resting));

  return { meal_count, groom_count, activity_seconds, rest_seconds };
}
