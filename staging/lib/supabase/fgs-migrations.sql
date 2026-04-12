-- ================================================================
-- FGS (Feline Grimace Scale) AI 통증 감지 테이블
-- 고양이 표정 사진 + AI 점수를 저장하여 건강 모니터링 + 자체 모델 학습에 활용
-- ================================================================

-- 1) 고양이 표정 사진 + AI 점수 저장 (나중에 자체 AI 학습에 사용)
CREATE TABLE fgs_frames (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cat_id        UUID NOT NULL REFERENCES cats(id),
  home_id       UUID NOT NULL,
  frame_url     TEXT NOT NULL,           -- Supabase Storage 경로 (크롭된 고양이 얼굴)
  fgs_score     SMALLINT NOT NULL,       -- 0-4 (Vision API가 매긴 점수)
  confidence    REAL NOT NULL,           -- AI 확신도 (0.0~1.0, 0.7 미만이면 "측정 불가")
  au_scores     JSONB,                   -- 5개 지표 개별 점수 {"ear":0,"eye":1,"muzzle":0,"whisker":1,"head":0}
  source        TEXT DEFAULT 'auto',     -- 'auto'(자동 캡처) / 'manual'(유저가 직접 체크)
  user_feedback SMALLINT,                -- 유저가 보정한 점수 (NULL이면 아직 미보정)
  lighting      TEXT,                    -- 'good' / 'low' / 'backlit' (조명 상태)
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 인덱스: 점수별 검색 (모델 학습 시 레이블 균형 맞추기용)
CREATE INDEX idx_fgs_frames_score ON fgs_frames(fgs_score);
-- 인덱스: 고양이별 최신순 조회
CREATE INDEX idx_fgs_frames_cat ON fgs_frames(cat_id, created_at DESC);
-- 인덱스: 유저가 보정한 데이터만 필터링 (학습 시 우선 사용)
CREATE INDEX idx_fgs_frames_feedback ON fgs_frames(user_feedback) WHERE user_feedback IS NOT NULL;

-- 2) 하루 단위 FGS 평균 점수 (7일 추이 차트용)
CREATE TABLE fgs_daily_summary (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cat_id        UUID NOT NULL REFERENCES cats(id),
  home_id       UUID NOT NULL,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  avg_score     REAL NOT NULL,           -- 하루 평균 FGS 점수
  max_score     SMALLINT NOT NULL,       -- 하루 중 가장 높은 FGS 점수
  frame_count   INT NOT NULL DEFAULT 0,  -- 하루 동안 측정한 횟수
  alert_sent    BOOLEAN DEFAULT false,   -- 알림을 이미 보냈는지 여부
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cat_id, date)                   -- 고양이 1마리당 하루 1행만
);

-- 인덱스: 7일 트렌드 조회
CREATE INDEX idx_fgs_daily_cat_date ON fgs_daily_summary(cat_id, date DESC);

-- ================================================================
-- RLS 정책 — 본인 집 데이터만 조회 가능, 저장은 서버(API Route)만
-- ================================================================

-- fgs_frames RLS
ALTER TABLE fgs_frames ENABLE ROW LEVEL SECURITY;

-- 조회: 본인 home_id 데이터만
CREATE POLICY "fgs_frames_select_own"
  ON fgs_frames FOR SELECT
  USING (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );

-- user_feedback 수정: 본인 home_id 데이터만
CREATE POLICY "fgs_frames_update_feedback"
  ON fgs_frames FOR UPDATE
  USING (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );

-- fgs_daily_summary RLS
ALTER TABLE fgs_daily_summary ENABLE ROW LEVEL SECURITY;

-- 조회: 본인 home_id 데이터만
CREATE POLICY "fgs_daily_select_own"
  ON fgs_daily_summary FOR SELECT
  USING (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );
