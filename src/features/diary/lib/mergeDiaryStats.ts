/**
 * 여러 소스의 DiaryStats 병합 + 신뢰도 결정
 *
 * 결정 트리 (ai_coverage 기준):
 * - >= 0.5  : 'ai'       → AI 통계 우선 (care_log 는 비교용)
 * - 0.1~0.5: 'hybrid'    → AI + care_log 보완 (각 필드 max)
 * - < 0.1   : 'care_log' → 집사 기록 우선
 *
 * discrepancy 계산:
 *   care_log 와 AI 카운트의 차이 (양수 = 집사 기록이 더 많음)
 *   카메라가 놓친 이벤트 감지 용도로 사용
 */
import type { DiaryStats, HealthAlert } from "../types/diaryStats";
import { generateHealthAlerts } from "./generateHealthAlerts";

type MergeInput = {
  /** cat_behavior_events 집계 결과 */
  behavior: Partial<DiaryStats>;
  /** zone_events(litter) 집계 결과 */
  zone: Partial<DiaryStats>;
  /** cat_care_logs 집계 결과 */
  care: Partial<DiaryStats>;
  /** AI 커버리지 (0~1) */
  aiCoverage: number;
  /** 사용자 입력 통증 레벨 (CatHealthLog 기반) */
  painLevel: 0 | 1 | 2 | 3;
  /** cat_id (알림 생성용) */
  catId: string;
  /** 다이어리 대상 날짜("YYYY-MM-DD", KST) — 0회 경고 타이밍 판단용. 생략 시 오늘. */
  date?: string;
};

/**
 * 다수 소스 병합 → 최종 DiaryStats + 건강 알림 리스트
 */
export function mergeDiaryStats(input: MergeInput): {
  stats: DiaryStats;
  alerts: HealthAlert[];
} {
  const { behavior, zone, care, aiCoverage, painLevel, catId, date } = input;

  /* ① 데이터 소스 결정 */
  let source: DiaryStats["source"];
  if (aiCoverage >= 0.5) source = "ai";
  else if (aiCoverage >= 0.1) source = "hybrid";
  else source = "care_log";

  /* ② 각 소스의 AI 기반 카운트 (behavior + zone) */
  const aiMeal = behavior.meal_count ?? 0;
  const aiPoop = zone.poop_count ?? 0;
  /* AI 는 음수 감지 못 함 → water 는 항상 care 기반 */
  const aiWater = 0;

  /* ③ care_log 기반 카운트 */
  const careMeal = care.meal_count ?? 0;
  const careWater = care.water_count ?? 0;
  const carePoop = care.poop_count ?? 0;

  /* ④ 소스별 최종 카운트 선택 */
  let mealFinal: number;
  let waterFinal: number;
  let poopFinal: number;

  if (source === "ai") {
    /* AI 위주 — 단, AI 0 이면 care 보완 */
    mealFinal = aiMeal > 0 ? aiMeal : careMeal;
    waterFinal = careWater;
    poopFinal = aiPoop > 0 ? aiPoop : carePoop;
  } else if (source === "hybrid") {
    /* 각 필드 max — 누락 최소화 */
    mealFinal = Math.max(aiMeal, careMeal);
    waterFinal = careWater;
    poopFinal = Math.max(aiPoop, carePoop);
  } else {
    /* care_log 위주 */
    mealFinal = careMeal;
    waterFinal = careWater;
    poopFinal = carePoop;
  }

  /* ⑤ discrepancy — **보완 전 raw AI 카운트** 기준으로 계산
   *    (보완된 mealFinal 을 쓰면 AI=0, care=2 일 때 discrepancy=0 이 돼서 AI 누락을 놓침)
   *    양수 = 집사 기록 > AI 감지 → AI 가 놓쳤거나 실제 먹지 않음
   *    음수 = AI 감지 > 집사 기록 → 집사가 기록 안 함 (간식 등)
   */
  const discrepancy =
    aiCoverage >= 0.1
      ? {
          meal: careMeal - aiMeal,
          water: careWater - aiWater,
          poop: carePoop - aiPoop,
        }
      : null;

  /* ⑥ 최종 DiaryStats 조립 */
  const stats: DiaryStats = {
    meal_count: mealFinal,
    water_count: waterFinal,
    poop_count: poopFinal,
    groom_count: behavior.groom_count ?? 0,
    activity_seconds: behavior.activity_seconds ?? 0,
    rest_seconds: behavior.rest_seconds ?? 0,
    pain_level: painLevel,
    source,
    ai_coverage: aiCoverage,
    discrepancy,
    /* 보완 전 raw AI 카운트 — 경고 로직/디버깅용 */
    raw_ai: aiCoverage >= 0.1 ? { meal: aiMeal, poop: aiPoop } : null,
  };

  /* ⑦ 경고 생성 — date 전달 (과거일/늦은 저녁 판단에 사용) */
  const alerts = generateHealthAlerts(stats, catId, date);

  return { stats, alerts };
}
