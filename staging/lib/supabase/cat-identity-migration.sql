-- ============================================================
-- 고양이 색상 기반 개체 구별 v1 마이그레이션
-- 확장성: color_profile JSON의 version 필드로 v2/v3/v4 분기 가능
-- ============================================================

-- 1) cats 테이블에 색상 프로필 컬럼 추가
ALTER TABLE public.cats ADD COLUMN IF NOT EXISTS color_profile jsonb;
ALTER TABLE public.cats ADD COLUMN IF NOT EXISTS color_sample_count int DEFAULT 0;
ALTER TABLE public.cats ADD COLUMN IF NOT EXISTS color_updated_at timestamptz;

-- 2) 샘플 원본 보관 테이블 (재학습/디버깅용)
CREATE TABLE IF NOT EXISTS public.cat_color_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cat_id uuid REFERENCES public.cats(id) ON DELETE CASCADE,
  h_mean real,
  h_std real,
  s_mean real,
  s_std real,
  v_mean real,
  bbox_area real,
  zone_id text,
  lighting_level text CHECK (lighting_level IN ('bright','normal','dim','dark')),
  created_at timestamptz DEFAULT now()
);

-- 3) 인덱스
CREATE INDEX IF NOT EXISTS idx_cat_color_samples_cat ON public.cat_color_samples(cat_id);

-- 4) RLS 활성화
ALTER TABLE public.cat_color_samples ENABLE ROW LEVEL SECURITY;

-- 5) RLS 정책: 자기 home의 cat 샘플만 조회 가능
DROP POLICY IF EXISTS "own_home_cat_samples_select" ON public.cat_color_samples;
CREATE POLICY "own_home_cat_samples_select" ON public.cat_color_samples
  FOR SELECT USING (cat_id IN (
    SELECT id FROM public.cats WHERE home_id IN (
      SELECT id FROM public.homes WHERE owner_id = auth.uid()
    )
  ));

-- 6) RLS 정책: 자기 home의 cat 샘플만 추가 가능
DROP POLICY IF EXISTS "own_home_cat_samples_insert" ON public.cat_color_samples;
CREATE POLICY "own_home_cat_samples_insert" ON public.cat_color_samples
  FOR INSERT WITH CHECK (cat_id IN (
    SELECT id FROM public.cats WHERE home_id IN (
      SELECT id FROM public.homes WHERE owner_id = auth.uid()
    )
  ));

-- 7) cats 테이블 UPDATE 정책 — color_profile 업서트용
--    (saveProfile이 cats.color_profile 컬럼을 update하므로 필요)
--    기존 프로젝트에 own_home_cats_update가 이미 있을 수 있으므로 DROP IF EXISTS로 idempotent
DROP POLICY IF EXISTS "own_home_cats_update" ON public.cats;
CREATE POLICY "own_home_cats_update" ON public.cats
  FOR UPDATE
  USING (home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid()))
  WITH CHECK (home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid()));
