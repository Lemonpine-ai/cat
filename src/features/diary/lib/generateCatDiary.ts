/**
 * 고양이 시점 일기 자동 생성 — 성격별 어투 적용
 * catPersonalities.ts의 8종 성격 데이터 기반으로
 * 고양이마다 다른 어투의 일기를 생성한다.
 */

import type { CatHealthLog } from "@/types/diary";
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
} from "./catPersonalities";

type CareCount = {
  meal: number;
  water: number;
  litter: number;
  medicine: number;
  total: number;
};

/** 오늘 날짜를 "2026년 4월 12일" 형식으로 */
function formatKoreanDate(): string {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 멘트 안의 N을 실제 숫자로 치환 */
function fillCount(text: string, count: number): string {
  return text.replace(/N/g, String(count));
}

/**
 * 고양이 시점 일기 생성 — 성격별 어투
 * @param catName 고양이 이름 (이름으로 성격 자동 매핑)
 * @param health 오늘 건강 기록 (없으면 null)
 * @param care 오늘 돌봄 이벤트 횟수
 * @returns { title, date, body } 일기 내용
 */
export function generateCatDiary(
  catName: string,
  health: CatHealthLog | null,
  care: CareCount,
) {
  const personality = getPersonality(catName);

  const mealCount = health?.meal_count ?? care.meal;
  const poopCount = health?.poop_count ?? 0;
  const painLevel = health?.pain_level ?? null;

  /* 제목 — 성격별 */
  const titleKey = getTitleKey(mealCount, poopCount, painLevel, care.total);
  const title = TITLE[personality][titleKey];

  const date = formatKoreanDate();

  /* 본문 조합 — 성격별 어투 */
  const parts: string[] = [];

  /* 식사 멘트 */
  const mealTier = getMealTier(mealCount);
  parts.push(fillCount(MEAL[personality][mealTier], mealCount));

  /* 배변 멘트 */
  const poopTier = getPoopTier(poopCount, painLevel);
  parts.push(fillCount(POOP[personality][poopTier], poopCount));

  /* 음수 멘트 */
  const waterTier = getWaterTier(care.water);
  const waterText = fillCount(WATER[personality][waterTier], care.water);
  if (waterText) parts.push(waterText);

  /* 통증 멘트 */
  if (painLevel && PAIN[personality][painLevel]) {
    parts.push(PAIN[personality][painLevel]);
  }

  /* 마무리 멘트 */
  const activityTier = getActivityTier(care.total);
  parts.push(CLOSING[personality][activityTier]);

  const body = parts.filter(Boolean).join("\n");

  return { title, date, body };
}
