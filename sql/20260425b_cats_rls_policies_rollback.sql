-- cat-identity Tier 1 fix R4-1 C4 — cats RLS 정책 DOWN 마이그.
--
-- 사용 시점: 20260425b_cats_rls_policies.sql 적용 후 SELECT/INSERT 폭증 차단 등
--           이상 징후 발견 시 즉시 적용 (베타 모드 5초 임계 — CLAUDE.md 운영 모드 표).
--
-- 본 파일도 idempotent — 정책이 없어도 DROP IF EXISTS 가 noop. 안전 다회 적용.

BEGIN;

DROP POLICY IF EXISTS cats_select_by_home_owner ON public.cats;
DROP POLICY IF EXISTS cats_insert_by_home_owner ON public.cats;
DROP POLICY IF EXISTS cats_update_by_home_owner ON public.cats;
DROP POLICY IF EXISTS cats_delete_by_home_owner ON public.cats;

ALTER TABLE public.cats DISABLE ROW LEVEL SECURITY;

COMMIT;
