// 일기장 통계 타입 정의
// 여러 데이터 소스(AI 감지 / 사용자 기록)를 통합한 하루 치 통계

// 하루 치 통합 통계
// source 필드로 어떤 경로로 집계되었는지 표시 (ai / care_log / hybrid)
export type DiaryStats = {
  // 식사 횟수 (세션 병합 후)
  meal_count: number;
  // Phase A 신규: 식사 총 지속 시간(초). 세션 병합 후 합산.
  meal_total_seconds?: number;
  // 음수(=물마심) 횟수
  water_count: number;
  // 배변 횟수 (litter zone 10초 이상 체류 기준)
  poop_count: number;
  // Phase A 신규: behavior_class="elimination" 단순 카운트 (poop_count 와 별개의 AI 직접 감지치).
  elimination_count?: number;
  // 그루밍 세션 횟수
  groom_count: number;
  // Phase A 신규: 그루밍 총 지속 시간(초). 세션 병합 후 합산.
  groom_total_seconds?: number;
  // Phase A 신규: 스크래칭 이벤트 카운트 (alert semantic, 임계값 분석 입력값).
  scratching_count?: number;
  // 활동 시간(초) — playing/walking/running semantic 누적
  activity_seconds: number;
  // 휴식 시간(초) — sleeping/sitting/standing semantic 누적
  rest_seconds: number;
  // 통증 레벨 (0=없음, 1=경미, 2=주의, 3=위험)
  pain_level: 0 | 1 | 2 | 3;
  // 집계 소스: 'ai'=AI 위주, 'care_log'=사용자 기록 위주, 'hybrid'=혼합 보완
  source: 'ai' | 'care_log' | 'hybrid';
  // AI 감지 커버리지 (0~1). 하루 중 카메라가 작동한 비율 추정치
  ai_coverage: number;
  // 집사 기록과 **보완 전 raw AI 감지** 의 차이 (care - raw_ai).
  // 양수 = 집사가 더 많이 기록 (AI 가 놓쳤을 가능성)
  // 음수 = AI 가 더 많이 감지 (집사가 기록 안 했을 가능성)
  // null 이면 비교 불가 (AI 커버리지 < 0.1)
  discrepancy: {
    meal: number;
    water: number;
    poop: number;
  } | null;
  // 보완 전 raw AI 카운트 (비교용). discrepancy 산출 시 기반.
  raw_ai: {
    meal: number;
    poop: number;
  } | null;
};

// 건강 알림 (홈 대시보드 알림 벨용)
// discrepancy / pain_level 기반으로 자동 생성
export type HealthAlert = {
  // DB upsert 전(client 생성 시점)에는 id 가 없음 → optional.
  // useHealthAlerts 가 DB 에서 받아온 row 는 id 가 항상 존재.
  // DiaryReportAlertCard 는 id 가 없으므로 `${title}-${alert_date}` 같은 자연키로 key 구성.
  // (QA R13 REJECT #3 반영 — tempId 와 실제 DB id 불일치로 인한 중복 렌더 방지)
  id?: string;
  cat_id: string;
  // home 단위 알림(cat 비특정) realtime payload 에서 올 수 있어 optional
  home_id?: string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
  // DB NOT NULL 컬럼 — KST 기준 "YYYY-MM-DD". insert 시 반드시 주입해야 함.
  alert_date: string;
};
