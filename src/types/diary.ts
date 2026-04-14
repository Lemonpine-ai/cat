/* ──────────────────────────────────────
   다이어리(건강 리포트) 페이지 전용 타입
   ────────────────────────────────────── */

/** 고양이 프로필 — 다이어리 상단 선택기용 최소 필드 */
export type DiaryCatProfile = {
  id: string;
  name: string;
  photo_front_url: string | null;
  status: string | null;
};

/** 통증 지수 (1~5 단계) */
export type PainLevel = 1 | 2 | 3 | 4 | 5;

/** cat_health_logs 테이블 한 줄 */
export type CatHealthLog = {
  id: string;
  cat_id: string;
  home_id: string;
  record_date: string;       // 'YYYY-MM-DD'
  meal_count: number;
  meal_amount: string | null;
  poop_count: number;
  poop_condition: string | null;
  pain_level: PainLevel | null;
  /** AI 분석 신뢰도 (0~100, 기본값 95.0) */
  confidence: number;
  notes: string | null;
  created_at: string;
};

/** 이번 주 하이라이트 — 돌봄 통계 집계 */
export type WeeklyCareStats = {
  totalMeals: number;
  totalWater: number;
  totalLitter: number;
  totalMedicine: number;
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

/** cat_logs 최근 AI 감지 — 귀여운 영상 포착 카드용 */
export type CuteCapture = {
  id: string;
  captured_at: string;
  cat_name: string;
  storage_path: string | null;
};

/** cat_diary 집사 메모 한 줄 */
export type DiaryMemo = {
  id: string;
  cat_id: string;
  content: string;
  date: string;              // 'YYYY-MM-DD'
  created_at: string;
};

/** AI 분석 정확도 정보 */
export type PainAnalysis = {
  painLevel: PainLevel | null;
  /** AI 분석 정확도 (0~100, 기본값 95) */
  accuracy: number;
};

/** 통증 슬라이더에서 사용하는 단계별 설정 */
export type PainStep = {
  level: PainLevel;
  label: string;
  emoji: string;
  color: string;
};

/* ──────────────────────────────────────
   Daily Diary (타임라인 일기) 전용 타입
   ────────────────────────────────────── */

/** 돌봄 로그 한 건 — cat_care_logs 테이블 기반 */
export type CareLogEntry = {
  id: string;
  care_kind: string;   // meal | water_change | litter_clean | medicine
  cat_id: string;
  cat_name: string;    // 조인 또는 클라이언트에서 매핑
  created_at: string;  // ISO 8601
};

/** 시간대 구분 — 오전 / 오후 / 저녁 */
export type TimeSection = "morning" | "afternoon" | "evening";

/** 타임라인 한 줄 — UI 렌더링용 */
export type DiaryTimelineEntry = {
  id: string;           // 원본 로그 ID
  section: TimeSection;
  sentence: string;     // 귀여운 문장
  timeLabel: string;    // "오전 8:30" 형식
  careKind: string;     // 아이콘 매핑용
};
