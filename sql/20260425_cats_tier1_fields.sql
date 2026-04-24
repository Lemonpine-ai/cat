-- cat-identity Tier 1 (2026-04-25): cats 테이블에 6개 옵션 필드 추가.
--
-- 기존 컬럼 재사용 (ALTER 불필요):
--   birth_date       — 이미 존재 (date, nullable)
--   medical_notes    — 이미 존재 (text, nullable)
--   photo_front_url  — 이미 존재 (Tier 1 에서 사용)
--
-- 신규 9 컬럼 (모두 nullable → 기존 row 영향 0):
--   is_neutered          BOOLEAN            중성화 여부 (true=yes / false=no / null=모름)
--   weight_kg            NUMERIC(4,2)       체중 kg (0..30 CHECK)
--   medications          TEXT               복용 중인 약
--   supplements          TEXT               영양제
--   litter_type          TEXT               모래 타입 (드롭다운 + 기타 자유입력)
--   food_type            TEXT               사료 브랜드/종류 (자동완성 + 자유입력)
--   color_profile        JSONB              색상 프로파일 HSV (Tier 1 사진 1장 자동 / Tier 2 카메라 정교화)
--   color_sample_count   INTEGER DEFAULT 0  프로파일 생성에 쓴 샘플 수 (Tier 1=1, Tier 2=N)
--   color_updated_at     TIMESTAMPTZ        프로파일 마지막 갱신 시각
--
-- CLAUDE.md #14 트리거 X (단순 nullable 컬럼 추가, 기존 소비처 영향 없음).
-- CLAUDE.md #13 호환 (기존 코드 무수정).
-- 적용 시점: 사장님 승인 후 Supabase MCP apply_migration 실행.

-- 1) 신규 9 컬럼 추가 (IF NOT EXISTS 로 재실행 안전)
ALTER TABLE public.cats
  ADD COLUMN IF NOT EXISTS is_neutered         BOOLEAN,
  ADD COLUMN IF NOT EXISTS weight_kg           NUMERIC(4, 2),
  ADD COLUMN IF NOT EXISTS medications         TEXT,
  ADD COLUMN IF NOT EXISTS supplements         TEXT,
  ADD COLUMN IF NOT EXISTS litter_type         TEXT,
  ADD COLUMN IF NOT EXISTS food_type           TEXT,
  ADD COLUMN IF NOT EXISTS color_profile       JSONB,
  ADD COLUMN IF NOT EXISTS color_sample_count  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS color_updated_at    TIMESTAMPTZ;

-- 2) weight_kg 값 범위 제약 (0 이상, 30 이하 — 대형 고양이 여유치)
--    DO 블록으로 constraint 중복 생성 회피.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cats_weight_kg_valid'
  ) THEN
    ALTER TABLE public.cats
      ADD CONSTRAINT cats_weight_kg_valid
      CHECK (weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 30));
  END IF;
END $$;

-- 3) 컬럼 주석 (운영자/Dev 참고용)
COMMENT ON COLUMN public.cats.is_neutered IS '중성화 여부. true=yes, false=no, null=모름 (UI 3상태 라디오).';
COMMENT ON COLUMN public.cats.weight_kg IS '체중 kg, 소수 2자리. 0..30 범위 CHECK.';
COMMENT ON COLUMN public.cats.medications IS '복용 중인 약 (free text, 줄바꿈 허용).';
COMMENT ON COLUMN public.cats.supplements IS '영양제 (free text).';
COMMENT ON COLUMN public.cats.litter_type IS '모래 타입 (드롭다운: 벤토나이트/두부/우드팰릿/크리스탈/종이/기타).';
COMMENT ON COLUMN public.cats.food_type IS '사료 (자동완성 리스트 + 자유입력).';
COMMENT ON COLUMN public.cats.color_profile IS 'HSV 색상 프로파일 { dominant_hues: number[], sample_count: int, version: "v1" }. Tier 1 등록 사진 1장 자동 / Tier 2 카메라 20장 정교화.';
COMMENT ON COLUMN public.cats.color_sample_count IS '프로파일 생성에 사용된 샘플 수 (Tier 1 = 1, Tier 2 = N).';
COMMENT ON COLUMN public.cats.color_updated_at IS '색상 프로파일 마지막 갱신 시각.';
