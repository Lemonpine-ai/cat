-- cat-identity Tier 1 fix R4-1 C4 / C5 — cats 테이블 RLS 정책 4개 (idempotent + atomic).
--
-- homes.owner_id = auth.uid() 기반 — 가족 외 사용자 차단.
-- 베타 모드 (사용자 7명) — 기존 row 영향 없음 (사전 SELECT 4건 확인 필수).
--
-- fix R4-1 C4 — 본 파일은 idempotent (DROP IF EXISTS → CREATE) — 두 번 적용 가능.
--               BEGIN/COMMIT 단일 트랜잭션 — 4개 정책 중 하나라도 실패하면 전부 rollback.
--               DOWN 마이그: sql/20260425b_cats_rls_policies_rollback.sql.
--
-- fix R4-1 C5 — 사전 검증 절차 (apply 전 Supabase SQL Editor 또는 MCP execute_sql 로 4건 모두 PASS 확인):
--   A) SELECT relrowsecurity FROM pg_class WHERE relname = 'homes';
--      → 결과 t (true). f 면 STOP — homes RLS 먼저 활성화 필요.
--   B) SELECT count(*) FROM public.homes WHERE owner_id IS NULL;
--      → 결과 0. > 0 면 STOP — owner_id NULL row 존재 → cats RLS 가 해당 home 차단.
--   C) SELECT count(*) FROM public.cats WHERE home_id IS NULL;
--      → 결과 0. > 0 면 STOP — home_id NULL cats row 가 RLS 적용 후 영구 차단됨.
--   D) SELECT count(*) FROM public.cats c
--      LEFT JOIN public.homes h ON c.home_id = h.id WHERE h.id IS NULL;
--      → 결과 0. > 0 면 STOP — orphan cats row (home 삭제됨) 가 RLS 후 영구 차단됨.
-- 4건 모두 PASS 후 본 마이그 적용. 실패 시 sql/20260425b_cats_rls_policies_rollback.sql 즉시 적용.
--
-- ARCHITECTURE.md §11.6.1 atomic deploy 6단계 (fix R4-1) 참조.

BEGIN;

ALTER TABLE public.cats ENABLE ROW LEVEL SECURITY;

-- 두 번 적용 가능하도록 DROP IF EXISTS — fix R4-1 C4 idempotent.
DROP POLICY IF EXISTS cats_select_by_home_owner ON public.cats;
DROP POLICY IF EXISTS cats_insert_by_home_owner ON public.cats;
DROP POLICY IF EXISTS cats_update_by_home_owner ON public.cats;
DROP POLICY IF EXISTS cats_delete_by_home_owner ON public.cats;

-- 1) SELECT — 본인이 owner 인 home 의 cats 만 조회.
CREATE POLICY cats_select_by_home_owner ON public.cats
  FOR SELECT USING (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  );

-- 2) INSERT — 본인 home 에만 등록 가능.
CREATE POLICY cats_insert_by_home_owner ON public.cats
  FOR INSERT WITH CHECK (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  );

-- 3) UPDATE — 본인 home 의 cats 만 수정.
CREATE POLICY cats_update_by_home_owner ON public.cats
  FOR UPDATE USING (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  ) WITH CHECK (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  );

-- 4) DELETE — 본인 home 의 cats 만 삭제.
CREATE POLICY cats_delete_by_home_owner ON public.cats
  FOR DELETE USING (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  );

COMMIT;
