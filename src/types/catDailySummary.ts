/** 고양이 1마리 분의 오늘 활동 집계 */
export type CatDailySummaryItem = {
  catId: string;
  catName: string;
  mealCount: number;
  toiletCount: number;
  medicineCount: number;
};
