/**
 * 고양이 시점 일기 자동 생성 — DiaryStats 기반
 *
 * 기존 generateCatDiary(catName, health, care) 대비 변경점:
 * - 입력을 DiaryStats 하나로 통일 (여러 소스 병합된 최종 결과)
 * - source='care_log' 일 때 "집사님이 N번 줬대요" 톤으로 미묘하게 변경
 * - 기존 catPersonalities.ts 그대로 재사용
 *
 * NOTE: 기존 파일 (staging/lib/generateCatDiary.ts) 은 수정하지 않고
 *       features/diary/lib/ 에 새 버전을 둔다.
 */

import type { DiaryStats } from "../types/diaryStats";
import {
  getPersonality,
  getMealTier,
  getPoopTier,
  getWaterTier,
  getActivityTier,
  getTitleKey,
  MEAL,
  POOP,
  WATER,
  PAIN,
  CLOSING,
  TITLE,
} from "@/lib/catPersonalities";

/** "N"을 실제 숫자로 치환 */
function fillCount(template: string, count: number): string {
  return template.replace(/N/g, String(count));
}

/** 오늘 날짜를 "2026년 4월 18일" 형식으로 */
function formatKoreanDate(date?: string): string {
  const d = date ? new Date(`${date}T00:00:00`) : new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * care_log 소스 전용 톤 변환
 * AI 가 못 봤으니 "집사가 챙겨줬다" 관점으로 문장을 감싼다.
 */
function wrapCareLogTone(sentence: string): string {
  /* 이미 '집사' 언급 있으면 그대로 */
  if (sentence.includes("집사")) return sentence;
  return `집사님이 챙겨줬대요 — ${sentence}`;
}

/**
 * DiaryStats → { title, date, body } 일기
 *
 * @param catName 고양이 이름 (성격 매핑용)
 * @param stats   통합된 하루 통계
 * @param date    YYYY-MM-DD (없으면 오늘)
 */
export function generateCatDiary(
  catName: string,
  stats: DiaryStats,
  date?: string,
) {
  /* 성격 결정 */
  const p = getPersonality(catName);

  /* DiaryStats 에서 카운트 추출 */
  const mealCount = stats.meal_count;
  const poopCount = stats.poop_count;
  const waterCount = stats.water_count;
  const painLevel = stats.pain_level === 0 ? null : stats.pain_level;
  /* 활동 점수 = meal + water + poop + groom 합 (기존 care.total 대체) */
  const totalEvents = mealCount + waterCount + poopCount + stats.groom_count;

  /* 제목 */
  const titleKey = getTitleKey(mealCount, poopCount, painLevel, totalEvents);
  const title = TITLE[p][titleKey];

  /* 본문 조합 */
  const parts: string[] = [];

  /* 식사 */
  parts.push(fillCount(MEAL[p][getMealTier(mealCount)], mealCount));
  /* 배변 */
  parts.push(fillCount(POOP[p][getPoopTier(poopCount, painLevel)], poopCount));
  /* 음수 */
  parts.push(fillCount(WATER[p][getWaterTier(waterCount)], waterCount));
  /* 통증 */
  if (painLevel && PAIN[p][painLevel]) {
    parts.push(PAIN[p][painLevel]);
  }
  /* 마무리 */
  parts.push(CLOSING[p][getActivityTier(totalEvents)]);

  /* care_log 소스면 톤 미묘하게 변경 */
  let body = parts.filter(Boolean).join("\n");
  if (stats.source === "care_log") {
    body = body
      .split("\n")
      .map((line, idx) => (idx === 0 ? wrapCareLogTone(line) : line))
      .join("\n");
  }

  return { title, date: formatKoreanDate(date), body };
}
