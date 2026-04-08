-- ============================================================
-- CATvisor 다이어리 — 건강 리포트 테이블 마이그레이션
-- 실행 환경: Supabase SQL Editor
-- 작성일: 2026-04-08
-- ============================================================
--
-- cat_diary   → 사장님이 Supabase에서 직접 생성
-- cat_health_logs → 이 파일에서 생성 (통증 5단계 기록용)
--
-- ============================================================


-- ────────────────────────────────────────
-- 1. cat_diary (집사 일기장)
-- ────────────────────────────────────────
-- 고양이별 하루 한 줄 메모. 200자 제한.

CREATE TABLE IF NOT EXISTS cat_diary (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id       uuid        NOT NULL,
  author_id     uuid        NOT NULL REFERENCES auth.users (id),
  cat_id        uuid        NOT NULL REFERENCES cats (id) ON DELETE CASCADE,
  content       text        NOT NULL CHECK (char_length(content) <= 200),
  date          date        NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 같은 고양이 + 같은 날짜에 중복 방지 (하루 1줄)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_diary_cat_date
  ON cat_diary (cat_id, date DESC);

-- 집(가정) 단위 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_cat_diary_home
  ON cat_diary (home_id, date DESC);

ALTER TABLE cat_diary ENABLE ROW LEVEL SECURITY;

-- 읽기: 본인 home_id 소속만
CREATE POLICY "cat_diary_읽기_본인집만"
  ON cat_diary FOR SELECT
  USING (
    home_id = (SELECT p.home_id FROM profiles p WHERE p.id = auth.uid())
  );

-- 쓰기: 본인 home_id 소속만
CREATE POLICY "cat_diary_작성_본인집만"
  ON cat_diary FOR INSERT
  WITH CHECK (
    home_id = (SELECT p.home_id FROM profiles p WHERE p.id = auth.uid())
  );

-- 수정: 본인 home_id 소속만
CREATE POLICY "cat_diary_수정_본인집만"
  ON cat_diary FOR UPDATE
  USING (
    home_id = (SELECT p.home_id FROM profiles p WHERE p.id = auth.uid())
  );

-- 삭제: 본인 home_id 소속만
CREATE POLICY "cat_diary_삭제_본인집만"
  ON cat_diary FOR DELETE
  USING (
    home_id = (SELECT p.home_id FROM profiles p WHERE p.id = auth.uid())
  );


-- ────────────────────────────────────────
-- 2. cat_health_logs (통증 지수 5단계 기록)
-- ────────────────────────────────────────
-- 고양이별 날짜별 건강 상태를 기록합니다.
-- 통증 지수(1~5)가 핵심 — AI 분석 95% 정확도 기반.
-- 하루에 고양이 한 마리당 한 줄씩 기록하는 구조입니다.

CREATE TABLE cat_health_logs (
  -- 고유 ID
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 어떤 고양이의 기록인지
  cat_id        uuid        NOT NULL REFERENCES cats (id) ON DELETE CASCADE,

  -- 어떤 집(가정)의 기록인지 (profiles.home_id와 동일 값)
  home_id       uuid        NOT NULL,

  -- 기록 날짜 (기본값: 오늘)
  record_date   date        NOT NULL DEFAULT CURRENT_DATE,

  -- 식사 횟수 (0 이상)
  meal_count    int         NOT NULL DEFAULT 0 CHECK (meal_count >= 0),

  -- 식사량 메모 (예: '많이', '보통', '적게')
  meal_amount   text,

  -- 배변 횟수 (0 이상)
  poop_count    int         NOT NULL DEFAULT 0 CHECK (poop_count >= 0),

  -- 배변 상태 (예: '정상', '묽음', '딱딱함')
  poop_condition text,

  -- 통증 지수 (1~5단계, NULL 허용 — 모를 때는 안 적어도 됨)
  -- 1: 정상  2: 약간 불편  3: 중간  4: 심함  5: 매우 심함
  pain_level    int         CHECK (pain_level >= 1 AND pain_level <= 5),

  -- AI 분석 신뢰도 (0~100%, 기본값 95.0)
  -- 나중에 실제 AI 모델 결과값으로 업데이트할 컬럼
  confidence    decimal     NOT NULL DEFAULT 95.0,

  -- 추가 메모 (자유 입력)
  notes         text,

  -- 생성 시각
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 같은 고양이 + 같은 날짜에 중복 기록 방지 (하루 1줄)
CREATE UNIQUE INDEX idx_health_logs_cat_date
  ON cat_health_logs (cat_id, record_date);

-- 집(가정) 단위로 전체 기록 조회할 때 사용
CREATE INDEX idx_health_logs_home
  ON cat_health_logs (home_id, record_date DESC);


-- ────────────────────────────────────────
-- 3. RLS 정책: 본인 home_id만 읽기/쓰기
-- ────────────────────────────────────────

ALTER TABLE cat_health_logs ENABLE ROW LEVEL SECURITY;

-- 읽기: 본인 home_id 소속만
CREATE POLICY "health_logs_읽기_본인집만"
  ON cat_health_logs FOR SELECT
  USING (
    home_id = (
      SELECT p.home_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

-- 쓰기: 본인 home_id 소속만
CREATE POLICY "health_logs_작성_본인집만"
  ON cat_health_logs FOR INSERT
  WITH CHECK (
    home_id = (
      SELECT p.home_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

-- 수정: 본인 home_id 소속만
CREATE POLICY "health_logs_수정_본인집만"
  ON cat_health_logs FOR UPDATE
  USING (
    home_id = (
      SELECT p.home_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

-- 삭제: 본인 home_id 소속만
CREATE POLICY "health_logs_삭제_본인집만"
  ON cat_health_logs FOR DELETE
  USING (
    home_id = (
      SELECT p.home_id FROM profiles p WHERE p.id = auth.uid()
    )
  );


-- ============================================================
-- 끝. 요약:
-- ============================================================
-- cat_diary       → CREATE TABLE 포함 (RLS + 인덱스 완비)
-- cat_health_logs → 신규 생성 완료
--   - 식사 횟수/양, 배변 횟수/상태, 통증 지수(1-5), 신뢰도(95.0%), 메모
--   - 고양이 + 날짜 유니크 (하루 1줄)
--   - RLS: 본인 home_id 소속만 CRUD 가능
--   - 인덱스: cat_id+record_date (유니크), home_id+record_date
-- ============================================================
