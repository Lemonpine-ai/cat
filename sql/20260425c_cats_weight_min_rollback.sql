-- cat-identity Tier 1 fix R4-1 C4 — cats.weight_kg CHECK DOWN 마이그.
--
-- 사용 시점: 20260425c_cats_weight_min.sql 적용 후 0.1 ~ 0 사이 row 가 다수 발견되어
--           CHECK 위반으로 INSERT 폭증 차단 시 즉시 원복.
-- 원복 정책: weight_kg >= 0 (Tier 1 PR 머지 직전 상태 — fix R1 #6 이전).
--
-- 본 파일도 idempotent — DROP IF EXISTS + ADD CONSTRAINT.

BEGIN;

ALTER TABLE public.cats
  DROP CONSTRAINT IF EXISTS cats_weight_kg_valid;

ALTER TABLE public.cats
  ADD CONSTRAINT cats_weight_kg_valid
  CHECK (weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 30));

COMMENT ON COLUMN public.cats.weight_kg IS '체중 kg, 소수 2자리. 0..30 범위 CHECK (fix R4-1 rollback).';

COMMIT;
