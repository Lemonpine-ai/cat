-- ============================================================
-- CATvisor 건강 알림 테이블
-- - DiaryStats 분석 결과로 자동 생성되는 알림
-- - 헤더 알림 벨 + 드로어에서 렌더
-- - home_id 기준 RLS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.health_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id     UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  -- cat_id: nullable — home 전체 알림(특정 고양이 지정 없이 home 단위)을 미래에 허용하기 위해 NULL 허용.
  -- 기존 RLS 의 `cat_id IS NULL OR ...` 분기와 의도 일치 (QA R13 REJECT #2 반영).
  cat_id      UUID REFERENCES public.cats(id) ON DELETE CASCADE,
  -- 알림 생성 기준 날짜 (KST "YYYY-MM-DD"). UNIQUE 제약 + 하루 단위 조회용
  alert_date  DATE NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'danger')),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ,
  -- 같은 날짜/홈/고양이/제목 조합은 하나만 (upsert 대상)
  -- NULLS NOT DISTINCT: cat_id IS NULL (home 전체 알림)도 중복 방지
  -- 없으면 PostgreSQL이 NULL을 서로 다르게 취급해 upsert onConflict 실패
  CONSTRAINT health_alerts_daily_unique
    UNIQUE NULLS NOT DISTINCT (home_id, cat_id, alert_date, title),
  -- 악성 클라이언트가 긴 텍스트로 "위험" 알림 도배하지 못하도록 길이 제한
  -- title 100자, message 500자까지만 허용 (UI 가독성 + 보안 양방향)
  CONSTRAINT health_alerts_title_length
    CHECK (length(title) <= 100 AND length(message) <= 500)
);

-- 홈별 미확인 알림 조회 최적화
CREATE INDEX IF NOT EXISTS idx_health_alerts_home_unread
  ON public.health_alerts (home_id, created_at DESC)
  WHERE read_at IS NULL;

-- 고양이별 알림 조회
CREATE INDEX IF NOT EXISTS idx_health_alerts_cat_time
  ON public.health_alerts (cat_id, created_at DESC);

-- RLS
ALTER TABLE public.health_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_home_health_alerts_select" ON public.health_alerts;
CREATE POLICY "own_home_health_alerts_select" ON public.health_alerts
  FOR SELECT USING (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  );

-- INSERT: home_id가 내 홈이어야 하고 + cat_id가 해당 home의 cats에 속해야 함
-- (cross-tenant 오염 방지 — 다른 홈의 cat_id로 insert 불가)
-- WITH CHECK 안에서 public.health_alerts.home_id 자기참조는 PostgreSQL에서 모호하므로
-- EXISTS 서브쿼리로 명시적으로 c.home_id = health_alerts.home_id 비교
DROP POLICY IF EXISTS "own_home_health_alerts_insert" ON public.health_alerts;
CREATE POLICY "own_home_health_alerts_insert" ON public.health_alerts
  FOR INSERT WITH CHECK (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
    AND (
      cat_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.cats c
        WHERE c.id = public.health_alerts.cat_id
          AND c.home_id = public.health_alerts.home_id
      )
    )
  );

-- UPDATE: 동일 패턴 — home_id 소유권 + cat_id 홈 소속 검증 (EXISTS 패턴)
DROP POLICY IF EXISTS "own_home_health_alerts_update" ON public.health_alerts;
CREATE POLICY "own_home_health_alerts_update" ON public.health_alerts
  FOR UPDATE USING (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
    AND (
      cat_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.cats c
        WHERE c.id = public.health_alerts.cat_id
          AND c.home_id = public.health_alerts.home_id
      )
    )
  );

DROP POLICY IF EXISTS "own_home_health_alerts_delete" ON public.health_alerts;
CREATE POLICY "own_home_health_alerts_delete" ON public.health_alerts
  FOR DELETE USING (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  );
