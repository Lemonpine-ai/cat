-- cat-identity Tier 1 fix R1 — cats 테이블 RLS 정책 4개.
-- homes.owner_id = auth.uid() 기반 — 가족 외 사용자 차단.
-- 베타 모드 (사용자 7명) — 기존 row 영향 없음 (사전 SELECT 확인 필요).
--
-- Apply: PR 머지 직후 동일 deploy 윈도우에 apply (CLAUDE.md #14 atomic deploy 조건).
--
-- fix R3 R8 — atomic deploy 5단계 명세:
--   1) PR 머지 (단일 커밋, 단일 PR)
--   2) Vercel `getDeployments` 로 production READY+PROMOTED 확인
--   3) `SELECT count(*) FROM cats WHERE home_id IS NULL` = 0 사전 확인
--      (RLS 정책이 home_id IN (...) 기반 → home_id NULL row 가 있으면 모두 차단됨)
--   4) Supabase MCP `apply_migration` 으로 본 SQL 적용 (서비스 롤로 ALTER TABLE)
--   5) Vercel Instant Rollback 후보 commit ID 메모 (앞선 production READY commit)
--      → 정책 적용 후 SELECT/INSERT 실패 폭증하면 즉시 롤백 가능

ALTER TABLE public.cats ENABLE ROW LEVEL SECURITY;

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
