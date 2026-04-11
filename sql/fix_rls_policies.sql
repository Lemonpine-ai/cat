-- ============================================================================
-- RLS 정책 복원 SQL
-- fix_duplicate_functions.sql 실행 후 RLS 정책이 누락된 상태를 복구합니다.
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- ============================================================================


-- ─── 1. RLS 활성화 확인 (이미 켜져 있어도 안전) ───

ALTER TABLE camera_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice_candidates ENABLE ROW LEVEL SECURITY;


-- ─── 2. camera_devices 정책 ───

DROP POLICY IF EXISTS "camera_devices_select_own_home" ON camera_devices;
CREATE POLICY "camera_devices_select_own_home" ON camera_devices
  FOR SELECT USING (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "camera_devices_insert_own_home" ON camera_devices;
CREATE POLICY "camera_devices_insert_own_home" ON camera_devices
  FOR INSERT WITH CHECK (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "camera_devices_update_own_home" ON camera_devices;
CREATE POLICY "camera_devices_update_own_home" ON camera_devices
  FOR UPDATE USING (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "camera_devices_delete_own_home" ON camera_devices;
CREATE POLICY "camera_devices_delete_own_home" ON camera_devices
  FOR DELETE USING (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );


-- ─── 3. camera_sessions 정책 ───

DROP POLICY IF EXISTS "camera_sessions_select_own_home" ON camera_sessions;
CREATE POLICY "camera_sessions_select_own_home" ON camera_sessions
  FOR SELECT USING (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "camera_sessions_update_own_home" ON camera_sessions;
CREATE POLICY "camera_sessions_update_own_home" ON camera_sessions
  FOR UPDATE USING (
    home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
  );


-- ─── 4. ice_candidates 정책 ───

DROP POLICY IF EXISTS "ice_candidates_select_own_session" ON ice_candidates;
CREATE POLICY "ice_candidates_select_own_session" ON ice_candidates
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM camera_sessions
      WHERE home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "ice_candidates_insert_own_session" ON ice_candidates;
CREATE POLICY "ice_candidates_insert_own_session" ON ice_candidates
  FOR INSERT WITH CHECK (
    session_id IN (
      SELECT id FROM camera_sessions
      WHERE home_id = (SELECT home_id FROM profiles WHERE id = auth.uid())
    )
  );


-- ─── 5. 스키마 캐시 갱신 ───

NOTIFY pgrst, 'reload schema';


-- ─── 6. 검증 쿼리 (결과 확인용) ───

-- RLS 정책 목록 출력
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('camera_devices', 'camera_sessions', 'ice_candidates')
ORDER BY tablename, policyname;
