/**
 * 고양이 시점 일기 자동 생성 — 데이터 기반 (catPersonalities.ts 참조)
 *
 * 모든 성격별 멘트는 catPersonalities.ts에 정의되어 있고,
 * 이 파일은 건강 데이터 → 등급 변환 → 멘트 조합만 담당한다.
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

/* ─── 돌봄 이벤트 횟수 타입 ─── */
type CareCount = {
  meal: number;
  water: number;
  litter: number;
  medicine: number;
  total: number;
};

/** "N"을 실제 숫자로 치환하는 헬퍼 */
function fillCount(template: string, count: number): string {
  return template.replace(/N/g, String(count));
}

/** 오늘 날짜를 "2026년 4월 11일" 형식으로 */
function formatKoreanDate(): string {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/* ─── 일기 생성 메인 함수 ─── */
/**
 * 고양이 시점 일기 생성
 * @param catName 고양이 이름 (성격 자동 매핑)
 * @param health 오늘 건강 기록 (없으면 null)
 * @param care 오늘 돌봄 이벤트 횟수
 * @returns { title, date, body } 일기 내용
 */
export function generateCatDiary(
  catName: string,
  health: CatHealthLog | null,
  care: CareCount,
) {
  /* 성격 결정 */
  const p = getPersonality(catName);

  /* 건강 데이터 추출 */
  const mealCount = health?.meal_count ?? care.meal;
  const poopCount = health?.poop_count ?? 0;
  const painLevel = health?.pain_level ?? null;

  /* 제목 */
  const titleKey = getTitleKey(mealCount, poopCount, painLevel, care.total);
  const title = TITLE[p][titleKey];

  /* 날짜 */
  const date = formatKoreanDate();

  /* 본문 조합 — 각 멘트를 등급으로 조회 후 "N" 치환 */
  const parts: string[] = [];

  // 식사
  const mealTier = getMealTier(mealCount);
  parts.push(fillCount(MEAL[p][mealTier], mealCount));

  // 배변
  const poopTier = getPoopTier(poopCount, painLevel);
  parts.push(fillCount(POOP[p][poopTier], poopCount));

  // 음수 (빈 문자열이면 자동 제외)
  const waterTier = getWaterTier(care.water);
  parts.push(fillCount(WATER[p][waterTier], care.water));

  // 통증 (없으면 빈 문자열)
  if (painLevel && PAIN[p][painLevel]) {
    parts.push(PAIN[p][painLevel]);
  }

  // 마무리
  const activityTier = getActivityTier(care.total);
  parts.push(CLOSING[p][activityTier]);

  /* 빈 문자열 제거 후 합치기 */
  const body = parts.filter(Boolean).join("\n");

  return { title, date, body };
}
