-- zone_events 테이블 — zone 진입/퇴장/체류 이벤트 기록
-- 고양이가 특정 zone에 머문 시간과 활동 종류를 추적합니다.

CREATE TABLE IF NOT EXISTS public.zone_events (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  home_id       UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  device_id     TEXT NOT NULL,
  zone_id       UUID NOT NULL REFERENCES public.camera_zones(id) ON DELETE CASCADE,
  cat_id        UUID REFERENCES public.cats(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN ('enter', 'exit', 'dwell_complete')),
  care_kind     TEXT,          -- meal, water_change, litter_clean 등 (nullable)
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INTEGER,   -- 체류 시간 (초). enter 시에는 null
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스 — 홈별 최근 이벤트 조회 최적화
CREATE INDEX IF NOT EXISTS idx_zone_events_home_started
  ON public.zone_events (home_id, started_at DESC);

-- 인덱스 — zone별 이벤트 조회
CREATE INDEX IF NOT EXISTS idx_zone_events_zone_id
  ON public.zone_events (zone_id, started_at DESC);

-- 인덱스 — 고양이별 활동 조회
CREATE INDEX IF NOT EXISTS idx_zone_events_cat_id
  ON public.zone_events (cat_id, started_at DESC)
  WHERE cat_id IS NOT NULL;

-- RLS 활성화
ALTER TABLE public.zone_events ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 본인 home의 zone_events만 읽기
CREATE POLICY "own_home_zone_events_select"
  ON public.zone_events
  FOR SELECT
  USING (
    home_id IN (
      SELECT id FROM public.homes WHERE owner_id = auth.uid()
    )
  );

-- RLS 정책: 본인 home의 zone_events만 쓰기
CREATE POLICY "own_home_zone_events_insert"
  ON public.zone_events
  FOR INSERT
  WITH CHECK (
    home_id IN (
      SELECT id FROM public.homes WHERE owner_id = auth.uid()
    )
  );
