/**
 * 고양이 시점 일기 자동 생성 — 건강 데이터 기반
 * cat_health_logs + cat_care_logs 데이터를 읽어서
 * 고양이 1인칭 시점의 귀여운 일기 문장을 만든다.
 */

import type { CatHealthLog } from "@/types/diary";

type CareCount = {
  meal: number;
  water: number;
  litter: number;
  medicine: number;
  total: number;
};

/** 오늘 날짜를 "2026년 4월 8일" 형식으로 */
function formatKoreanDate(): string {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 식사 관련 멘트 */
function mealStory(name: string, count: number): string {
  if (count >= 4) return `오늘 무려 ${count}번이나 밥을 먹었다! 집사가 자꾸 주길래 어쩔 수 없이(?) 다 비워줬다. 배가 빵빵해서 행복하다옹~`;
  if (count >= 3) return `밥을 ${count}번 먹었다. 아침에 습식, 점심에 건식, 저녁에 또 습식! 이 정도면 ${name} 장군의 품격에 맞는 식단이다.`;
  if (count >= 2) return `오늘 밥은 ${count}번 먹었다. 적당히 배부르고, 적당히 더 먹고 싶고... 집사한테 눈빛 공격을 좀 더 해볼까 고민 중이다.`;
  if (count === 1) return `밥을 딱 1번 먹었다. 집사가 바빴나 보다. 다음엔 접시를 일부러 떨어뜨려서 알려줘야지.`;
  return `오늘은 아직 밥을 못 먹었다... 집사 어디 간 거야? 배에서 꼬르륵 소리가 난다옹.`;
}

/** 배변 관련 멘트 (식사 후 빠른 배변 = 배 아픔 힌트) */
function poopStory(count: number, mealCount: number, painLevel: number | null): string {
  if (count >= 3 && mealCount > 0) return `화장실을 ${count}번이나 갔다. 먹은 만큼 나오는 건 자연의 법칙이다옹! 근데 좀 자주 간 것 같기도...`;
  if (count >= 2 && (painLevel ?? 0) >= 3) return `화장실을 ${count}번 갔는데, 밥 먹자마자 후다닥 뛰어갔다. 배가 좀 불편했나 보다... 집사가 걱정하는 눈빛을 보냈다.`;
  if (count >= 2) return `화장실은 ${count}번 다녀왔다. 깨끗하게 모래도 덮어줬으니 집사가 칭찬해주겠지? 나는 깔끔쟁이 고양이니까!`;
  if (count === 1) return `화장실은 딱 1번. 모든 게 순조롭다옹. 이게 바로 건강한 고양이의 하루지!`;
  return `화장실은 안 갔다. 내일 가면 되지 뭐~ 느긋한 게 내 스타일이다.`;
}

/** 통증 관련 멘트 */
function painStory(painLevel: number | null): string {
  if (!painLevel) return "";
  if (painLevel === 1) return `\n컨디션은 최상이다! 캣타워 꼭대기까지 한 번에 점프했다. 이 정도면 올림픽 나가도 되는 거 아니냥?`;
  if (painLevel === 2) return `\n몸이 살짝 뻐근한 느낌인데, 뭐 대단한 건 아니다. 스트레칭 한 번 하고 나면 괜찮을 거다.`;
  if (painLevel === 3) return `\n오늘은 몸이 좀 무겁다... 캣타워 3층까지만 올라가고 더는 귀찮았다. 집사 무릎 위가 더 편한 하루다.`;
  if (painLevel === 4) return `\n솔직히 좀 아프다옹... 평소 좋아하는 장난감한테도 별로 관심이 없다. 집사가 걱정하면서 간식을 줬는데 그것만 좀 맛있었다.`;
  return `\n많이 아프다옹... 오늘은 하루 종일 이불 밑에 숨어 있었다. 집사가 나를 안아주면서 "괜찮아"라고 했는데, 그 말이 좀 위로가 됐다.`;
}

/** 음수 관련 멘트 */
function waterStory(count: number): string {
  if (count >= 3) return ` 물도 ${count}번이나 마셨다. 오늘따라 목이 많이 마른 하루!`;
  if (count >= 1) return ` 물도 잘 챙겨 마셨다옹.`;
  return "";
}

/** 활동 관련 마무리 멘트 */
function closingStory(name: string, total: number): string {
  if (total >= 8) return `\n\n오늘은 정말 바쁜 하루였다! 이 정도 활동량이면 ${name}도 꽤 열심히 산 거다. 이제 명당 자리에서 꿀잠 자야지... 😴`;
  if (total >= 4) return `\n\n적당히 활동적인 하루! 낮잠도 자고, 집사랑 놀기도 하고... 이게 바로 완벽한 고양이 라이프다옹 🐾`;
  return `\n\n오늘은 조용한 하루였다. 창문 밖 새 구경하면서 하루가 슥~ 지나갔다. 내일은 뭐 하고 놀까? 🐱`;
}

/**
 * 고양이 시점 일기 생성
 * @param catName 고양이 이름
 * @param health 오늘 건강 기록 (없으면 null)
 * @param care 오늘 돌봄 이벤트 횟수
 * @returns { title, date, body } 일기 내용
 */
export function generateCatDiary(
  catName: string,
  health: CatHealthLog | null,
  care: CareCount,
) {
  const mealCount = health?.meal_count ?? care.meal;
  const poopCount = health?.poop_count ?? 0;
  const painLevel = health?.pain_level ?? null;

  /* 제목 — 오늘 상황에 맞게 */
  let title: string;
  if (mealCount >= 3) title = `"밥은 정의고, 간식은 사랑이다!"`;
  else if ((painLevel ?? 0) >= 4) title = `"오늘은 집사 무릎이 최고야..."`;
  else if (poopCount >= 3) title = `"화장실이 바빴던 하루!"`;
  else if (care.total >= 6) title = `"바쁘다 바빠! 현대 고양이!"`;
  else title = `"느긋한 하루, 그게 내 스타일이다옹~"`;

  const date = formatKoreanDate();

  /* 본문 조합 */
  const parts: string[] = [];
  parts.push(mealStory(catName, mealCount));
  parts.push(poopStory(poopCount, mealCount, painLevel));
  parts.push(waterStory(care.water));
  parts.push(painStory(painLevel));
  parts.push(closingStory(catName, care.total));

  const body = parts.filter(Boolean).join("\n");

  return { title, date, body };
}
