/**
 * 다이어리(리포트) 페이지 타입 정의
 * - DB 테이블 구조에 맞춘 타입들
 * - page.tsx(서버)와 DiaryPageClient(클라이언트) 양쪽에서 공유
 */

/** 고양이 프로필 (cats 테이블에서 필요한 컬럼만) */
export type DiaryCatProfile = {
  id: string;
  name: string;
  photo_front_url: string | null;
  status: string | null;
};

/** 오늘 건강 기록 (cat_health_logs 테이블) */
export type CatHealthLog = {
  id: string;
  cat_id: string;
  record_date: string;
  meal_count: number;
  meal_amount: string | null;
  poop_count: number;
  poop_condition: string | null;
  pain_level: number | null;
  confidence: number;
  notes: string | null;
};

/** 이번 주 돌봄 통계 (cat_care_logs에서 집계) */
export type WeeklyCareStats = {
  totalMeals: number;
  totalWater: number;
  totalLitter: number;
  totalMedicine: number;
};

/** AI 감지 포착 (cat_logs 테이블 + cats 조인) */
export type CuteCapture = {
  id: string;
  captured_at: string;
  cat_name: string;
  storage_path: string | null;
};

/** 차트용 — 하루치 건강 데이터 한 점 */
export type DailyChartPoint = {
  /** 날짜 표시 ('4/2' 형식) */
  date: string;
  /** 식사 횟수 */
  meal: number;
  /** 음수(물갈이) 횟수 */
  water: number;
  /** 배변 횟수 */
  poop: number;
  /** 활동(전체 돌봄 이벤트) 횟수 */
  activity: number;
};

/** 집사 일기 메모 (cat_diary 테이블) */
export type DiaryMemo = {
  id: string;
  cat_id: string;
  content: string;
  date: string;
  created_at: string;
};
