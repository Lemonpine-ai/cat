/**
 * cat_behavior_events → DiaryStats 집계 (Phase A 신규 12 클래스 + user_label 보정).
 *
 * - 12 클래스 → semantic 매핑 기반 (하드코딩 제거).
 * - user_label "human/shadow/other_animal" 노이즈는 SELECT 단계에서 제외.
 *   reclassified:<cls> 는 effective_class 로 치환 후 집계.
 * - confidence >= 0.6 만 카운트 (오탐 방지).
 *
 * 세션 병합 규칙:
 *   - eating(meal):    5초 이상 + 5분 이내 재감지 시 병합 → meal_count
 *   - grooming:        10초 이상 + 5분 이내 재감지 시 병합 → groom_count
 *   - activity(semantic): duration 단순 합산 → activity_seconds
 *   - rest(semantic):     duration 단순 합산 → rest_seconds
 *   - drinking(water):    이벤트 카운트 → water_count
 *   - elimination:        이벤트 카운트 → elimination_count
 *   - scratching:         이벤트 카운트 → scratching_count
 *
 * 호환 유지:
 *   - 기존 출력 키(meal_count / groom_count / activity_seconds / rest_seconds) 유지
 *   - 신규 키(meal_total_seconds / groom_total_seconds / water_count / elimination_count / scratching_count) 추가
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiaryStats } from "../types/diaryStats";
import { kstDateRangeToUtc } from "./kstRange";
// staging 신규 모듈 — 상대 경로로 staging 내부 참조 (tsconfig paths 미적용 영역).
// (staging/features/diary/lib → staging/lib/ai 또는 staging/lib/behavior)
import {
  getBehaviorSemantic,
  type BehaviorSemantic,
} from "../../../lib/ai/behaviorClasses";
import { getEffectiveClass } from "../../../lib/behavior/effectiveClass";
import { NON_NOISE_FILTER } from "../../../lib/behavior/userLabelFilter";

/* ─── 임계값 상수 ─── */
const MIN_CONFIDENCE = 0.6; // 최소 신뢰도
const MIN_EATING_SEC = 5; // 식사 최소 지속 시간(초)
const MIN_GROOMING_SEC = 10; // 그루밍 최소 지속 시간(초)
const MERGE_WINDOW_MS = 5 * 60 * 1000; // 세션 병합 윈도우 (5분)

/* ─── Supabase row 타입 — user_label 포함 ─── */
type BehaviorRow = {
  behavior_class: string;
  confidence: number;
  detected_at: string;
  ended_at: string | null;
  user_label: string | null;
};

/** 병합된 세션 1건 — startMs/endMs (밀리초 epoch) */
type MergedSession = { startMs: number; endMs: number };

/**
 * 같은 카테고리 이벤트들을 시간순 + 5분 윈도우 기준으로 병합.
 * @param events 시간 순 정렬 이벤트
 * @param minDurationSec 병합 후 이 값 이상 세션만 카운트
 */
function mergeSessions(
  events: BehaviorRow[],
  minDurationSec: number,
): MergedSession[] {
  const sessions: MergedSession[] = [];

  for (const ev of events) {
    const start = new Date(ev.detected_at).getTime();
    if (Number.isNaN(start)) continue;

    // ended_at 없으면 detected_at 사용 (구간 길이 0 → minDuration 필터에서 탈락)
    const rawEnd = ev.ended_at ? new Date(ev.ended_at).getTime() : start;
    const end = Number.isNaN(rawEnd) ? start : rawEnd;

    const last = sessions[sessions.length - 1];
    if (last && start - last.endMs <= MERGE_WINDOW_MS) {
      last.endMs = Math.max(last.endMs, end);
    } else {
      sessions.push({ startMs: start, endMs: end });
    }
  }

  return sessions.filter(
    (s) => (s.endMs - s.startMs) / 1000 >= minDurationSec,
  );
}

/** 세션 묶음 → 총 지속 초 합산 */
function sumSessionSeconds(sessions: MergedSession[]): number {
  let total = 0;
  for (const s of sessions) total += Math.max(0, (s.endMs - s.startMs) / 1000);
  return total;
}

/** raw 이벤트 단순 duration 합산 (병합 없이) — semantic 단위 활동/휴식 시간 계산용 */
function sumRawDurationSeconds(events: BehaviorRow[]): number {
  let total = 0;
  for (const ev of events) {
    if (!ev.ended_at) continue;
    const start = new Date(ev.detected_at).getTime();
    const end = new Date(ev.ended_at).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    total += Math.max(0, (end - start) / 1000);
  }
  return total;
}

/**
 * cat_behavior_events → DiaryStats 부분 변환 (12 클래스 + user_label 보정).
 *
 * @param supabase Supabase 클라이언트
 * @param catId    대상 고양이 id
 * @param date     'YYYY-MM-DD' (KST 기준)
 */
export async function behaviorEventsToDiaryStats(
  supabase: SupabaseClient,
  catId: string,
  date: string,
): Promise<Partial<DiaryStats>> {
  const { startUtc, endUtc } = kstDateRangeToUtc(date);

  // SELECT — confidence + 노이즈 라벨 제외 필터 (PostgREST or 절)
  const { data, error } = await supabase
    .from("cat_behavior_events")
    .select("behavior_class, confidence, detected_at, ended_at, user_label")
    .eq("cat_id", catId)
    .gte("detected_at", startUtc)
    .lt("detected_at", endUtc)
    .gte("confidence", MIN_CONFIDENCE)
    .or(NON_NOISE_FILTER)
    .order("detected_at", { ascending: true });

  // 에러/빈 데이터 방어 → 0 으로 초기화
  if (error || !data || data.length === 0) {
    return emptyPartial();
  }

  // user_label 보정: effective_class 로 behavior_class 치환 (NULL 이면 skip)
  const rawRows = data as BehaviorRow[];
  const rows: BehaviorRow[] = [];
  for (const r of rawRows) {
    const effective = getEffectiveClass(r);
    if (!effective) continue; // 노이즈로 폴백
    rows.push({ ...r, behavior_class: effective });
  }

  // semantic 별 분류 (집계 효율을 위해 한 번 순회)
  const bySemantic: Record<BehaviorSemantic, BehaviorRow[]> = {
    meal: [],
    water: [],
    hygiene: [],
    rest: [],
    activity: [],
    alert: [],
  };
  for (const r of rows) {
    const sem = getBehaviorSemantic(r.behavior_class);
    if (!sem) continue;
    bySemantic[sem].push(r);
  }

  // 추가로 클래스별 직접 분류 (grooming / elimination / scratching / drinking)
  const grooming = rows.filter((r) => r.behavior_class === "grooming");
  const elimination = rows.filter((r) => r.behavior_class === "elimination");
  const scratching = rows.filter((r) => r.behavior_class === "scratching");
  const drinking = rows.filter((r) => r.behavior_class === "drinking");

  // 세션 병합 → 카운트/지속시간
  const mealSessions = mergeSessions(bySemantic.meal, MIN_EATING_SEC);
  const groomSessions = mergeSessions(grooming, MIN_GROOMING_SEC);

  const meal_count = mealSessions.length;
  const meal_total_seconds = Math.round(sumSessionSeconds(mealSessions));

  const groom_count = groomSessions.length;
  const groom_total_seconds = Math.round(sumSessionSeconds(groomSessions));

  // 단순 카운트 — 1 이벤트 = 1 회
  const water_count = drinking.length;
  const elimination_count = elimination.length;
  const scratching_count = scratching.length;

  // semantic 단위 누적 시간
  const activity_seconds = Math.round(sumRawDurationSeconds(bySemantic.activity));
  const rest_seconds = Math.round(sumRawDurationSeconds(bySemantic.rest));

  return {
    meal_count,
    meal_total_seconds,
    groom_count,
    groom_total_seconds,
    water_count,
    elimination_count,
    scratching_count,
    activity_seconds,
    rest_seconds,
  };
}

/** 빈/에러 케이스 — 모든 필드 0 으로 초기화 */
function emptyPartial(): Partial<DiaryStats> {
  return {
    meal_count: 0,
    meal_total_seconds: 0,
    groom_count: 0,
    groom_total_seconds: 0,
    water_count: 0,
    elimination_count: 0,
    scratching_count: 0,
    activity_seconds: 0,
    rest_seconds: 0,
  };
}
