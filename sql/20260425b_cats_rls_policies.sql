-- cat-identity Tier 1 fix R1 — cats 테이블 RLS 정책 4개.
-- homes.owner_id = auth.uid() 기반 — 가족 외 사용자 차단.
-- 베타 모드 (사용자 7명) — 기존 row 영향 없음 (사전 SELECT 확인 필요).
--
-- Apply: 팀장이 Supabase MCP `apply_migration` 으로 별도 (사장님 승인 후).

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
