-- ============================================================================
-- camera_zones — 카메라별 감지 영역 (밥그릇/화장실/물그릇/캣타워)
-- 기기 삭제 시 CASCADE로 자동 정리
-- ============================================================================

CREATE TABLE IF NOT EXISTS camera_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES camera_devices(id) ON DELETE CASCADE,
  home_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT '새 구역',
  zone_type TEXT NOT NULL DEFAULT 'custom'
    CHECK (zone_type IN ('food_bowl', 'water_bowl', 'litter_box', 'cat_tower', 'custom')),
  rect JSONB NOT NULL DEFAULT '{"x":0,"y":0,"width":0.2,"height":0.2}',
  color TEXT NOT NULL DEFAULT 'rgba(158,158,158,0.4)',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스: device_id별 조회 최적화
CREATE INDEX IF NOT EXISTS idx_camera_zones_device ON camera_zones(device_id);
CREATE INDEX IF NOT EXISTS idx_camera_zones_home ON camera_zones(home_id);

-- ─── RLS 정책 (기존 camera_devices와 동일한 패턴) ───

ALTER TABLE camera_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "camera_zones_select_own_home" ON camera_zones;
CREATE POLICY "camera_zones_select_own_home" ON camera_zones
  FOR SELECT USING (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "camera_zones_insert_own_home" ON camera_zones;
CREATE POLICY "camera_zones_insert_own_home" ON camera_zones
  FOR INSERT WITH CHECK (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "camera_zones_update_own_home" ON camera_zones;
CREATE POLICY "camera_zones_update_own_home" ON camera_zones
  FOR UPDATE USING (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  ) WITH CHECK (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "camera_zones_delete_own_home" ON camera_zones;
CREATE POLICY "camera_zones_delete_own_home" ON camera_zones
  FOR DELETE USING (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
