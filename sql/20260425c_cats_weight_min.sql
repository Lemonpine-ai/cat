-- cat-identity Tier 1 fix R1 #6 — cats.weight_kg 최소값 0 → 0.1 으로 강화.
-- 0kg 은 현실적으로 무의미 (입력 실수 차단).
--
-- 베타 모드 (사용자 7명) — 기존 row 영향:
--   apply 전 SELECT count(*) FROM cats WHERE weight_kg = 0; 이 0 인지 사전 확인 필요.
--   (현재 등록된 cats 모두 weight_kg IS NULL 또는 정상 값 — Tier 1 직후이므로 안전.)

ALTER TABLE public.cats
  DROP CONSTRAINT IF EXISTS cats_weight_kg_valid;

ALTER TABLE public.cats
  ADD CONSTRAINT cats_weight_kg_valid
  CHECK (weight_kg IS NULL OR (weight_kg >= 0.1 AND weight_kg <= 30));

COMMENT ON COLUMN public.cats.weight_kg IS '체중 kg, 소수 2자리. 0.1..30 범위 CHECK (fix R1 #6).';
