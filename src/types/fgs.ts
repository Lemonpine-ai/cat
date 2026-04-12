/* ──────────────────────────────────────
   FGS (Feline Grimace Scale) AI 통증 감지 타입
   고양이 표정 분석 → 통증 점수 0-4
   ────────────────────────────────────── */

/** FGS 5가지 Action Unit 개별 점수 (각 0-4) */
export type FgsAuScores = {
  /** 귀 위치 — 뒤로 젖혀지거나 옆으로 벌어짐 */
  ear: number;
  /** 눈 찡그림 — 눈을 가늘게 뜸, 눈꺼풀 긴장 */
  eye: number;
  /** 코·볼 변화 — 볼 부풀림, 코 주름 */
  muzzle: number;
  /** 수염 긴장 — 수염이 앞으로 곧게 섬 */
  whisker: number;
  /** 머리 위치 — 머리를 아래로 숙임 */
  head: number;
};

/** fgs_frames 테이블 한 줄 — 고양이 표정 사진 + AI 점수 */
export type FgsFrameRow = {
  id: string;
  cat_id: string;
  home_id: string;
  /** Supabase Storage 경로 (크롭된 고양이 얼굴 사진) */
  frame_url: string;
  /** FGS 통증 점수 (0=정상, 1=경미, 2=주의, 3=경고, 4=심각) */
  fgs_score: number;
  /** AI 확신도 (0.0~1.0, 0.7 미만이면 "측정 불가") */
  confidence: number;
  /** 5개 지표 개별 점수 (null이면 상세 분석 없음) */
  au_scores: FgsAuScores | null;
  /** 'auto'=자동 캡처, 'manual'=유저가 직접 체크 */
  source: "auto" | "manual";
  /** 유저가 보정한 점수 (null이면 아직 미보정) */
  user_feedback: number | null;
  /** 조명 상태 */
  lighting: "good" | "low" | "backlit" | null;
  created_at: string;
};

/** fgs_daily_summary 테이블 한 줄 — 하루 평균 FGS */
export type FgsDailySummaryRow = {
  id: string;
  cat_id: string;
  home_id: string;
  /** 날짜 (YYYY-MM-DD) */
  date: string;
  /** 하루 평균 FGS 점수 */
  avg_score: number;
  /** 하루 중 최고 FGS 점수 */
  max_score: number;
  /** 하루 측정 횟수 */
  frame_count: number;
  /** 알림 이미 보냈는지 */
  alert_sent: boolean;
  created_at: string;
};

/** Claude Vision API 응답 — FGS 분석 결과 */
export type FgsAnalysisResult = {
  /** 종합 FGS 점수 (0-4) */
  fgs_score: number;
  /** AI 확신도 (0.0-1.0) */
  confidence: number;
  /** 5개 지표 개별 점수 */
  au_scores: FgsAuScores;
  /** 판단 근거 (한글 설명) */
  reasoning: string;
};

/** POST /api/fgs/analyze 요청 본문 */
export type FgsAnalyzeRequest = {
  cat_id: string;
  /** home_id는 서버에서 세션 기반으로 조회 — 클라이언트에서 보내지 않음 (보안) */
  /** 고양이 얼굴 이미지 (base64 인코딩, 최대 5MB) */
  frame: string;
  /** 'auto'=자동 캡처, 'manual'=유저가 직접 체크 */
  source: "auto" | "manual";
};

/** PATCH /api/fgs/feedback 요청 본문 */
export type FgsFeedbackRequest = {
  frame_id: string;
  /** 유저가 보정한 점수 (0-4) */
  user_feedback: number;
};
