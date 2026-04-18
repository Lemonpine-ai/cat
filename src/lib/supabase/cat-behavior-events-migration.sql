-- ============================================================
-- YOLO 행동 인식 이벤트 저장 테이블
-- - 확정된 행동 이벤트 1건 = 1 row
-- - 시작/종료 타임스탬프로 구간 표현
-- - home_id 기준 RLS (가족 단위 접근)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cat_behavior_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  camera_id UUID REFERENCES public.camera_devices(id) ON DELETE SET NULL,
  cat_id UUID REFERENCES public.cats(id) ON DELETE SET NULL,
  behavior_class TEXT NOT NULL,       -- BEHAVIOR_CLASSES[].key (arch/grooming/...)
  behavior_label TEXT NOT NULL,       -- 한글 라벨 (아치자세/그루밍/...)
  confidence REAL NOT NULL,           -- 0.0 ~ 1.0 평균 신뢰도
  bbox JSONB,                         -- { x, y, w, h } 정규화 좌표
  zone_id UUID,                       -- 해당 이벤트 발생 zone (옵션)
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,               -- 행동 종료 시각 (NULL = 진행 중)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 홈별 타임라인 조회 최적화
CREATE INDEX IF NOT EXISTS idx_cat_behavior_events_home_time
  ON public.cat_behavior_events (home_id, detected_at DESC);

-- 카메라별 조회 최적화
CREATE INDEX IF NOT EXISTS idx_cat_behavior_events_camera_time
  ON public.cat_behavior_events (camera_id, detected_at DESC);

-- RLS 활성화
ALTER TABLE public.cat_behavior_events ENABLE ROW LEVEL SECURITY;

-- 본인 소유 홈의 이벤트만 SELECT 가능
DROP POLICY IF EXISTS "own_home_behavior_select" ON public.cat_behavior_events;
CREATE POLICY "own_home_behavior_select" ON public.cat_behavior_events
  FOR SELECT USING (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  );

-- 본인 소유 홈에만 INSERT 가능
DROP POLICY IF EXISTS "own_home_behavior_insert" ON public.cat_behavior_events;
CREATE POLICY "own_home_behavior_insert" ON public.cat_behavior_events
  FOR INSERT WITH CHECK (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  );

-- 본인 소유 홈의 이벤트만 UPDATE 가능 (ended_at 채우기용)
-- NOTE: user_id가 아니라 home_id(homes.owner_id) 기준 → 공동 사용자(home_members)도
--       owner_id 로 user_id를 강제 기록하므로 SELECT/UPDATE가 모두 통과한다.
DROP POLICY IF EXISTS "own_home_behavior_update" ON public.cat_behavior_events;
CREATE POLICY "own_home_behavior_update" ON public.cat_behavior_events
  FOR UPDATE USING (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  );

-- 본인 소유 홈의 이벤트 DELETE (오탐 수동 삭제용)
DROP POLICY IF EXISTS "own_home_behavior_delete" ON public.cat_behavior_events;
CREATE POLICY "own_home_behavior_delete" ON public.cat_behavior_events
  FOR DELETE USING (
    home_id IN (SELECT id FROM public.homes WHERE owner_id = auth.uid())
  );
