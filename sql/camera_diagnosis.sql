-- ============================================================================
-- 카메라 시스템 진단 SQL
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- 결과를 사장님이 보여주시면 정확한 처방이 가능합니다.
-- ============================================================================

-- ─── 1. 테이블 데이터 현황 ───
SELECT '1_camera_devices' AS 항목, COUNT(*) AS 개수 FROM camera_devices
UNION ALL SELECT '2_camera_sessions', COUNT(*) FROM camera_sessions
UNION ALL SELECT '3_live_sessions', COUNT(*) FROM camera_sessions WHERE status = 'live'
UNION ALL SELECT '4_idle_sessions', COUNT(*) FROM camera_sessions WHERE status = 'idle'
UNION ALL SELECT '5_ice_candidates', COUNT(*) FROM ice_candidates;

-- ─── 2. 기기 상태 확인 ───
SELECT id, device_name, is_paired, is_active,
       device_token IS NOT NULL AS has_token,
       last_seen_at, created_at
FROM camera_devices
ORDER BY created_at DESC;

-- ─── 3. RPC 함수 존재 여부 ───
SELECT proname AS 함수명, pronargs AS 매개변수수
FROM pg_proc
WHERE proname IN (
  'pair_camera_device',
  'start_device_broadcast',
  'stop_device_broadcast',
  'add_device_ice_candidate',
  'get_broadcaster_signaling_state',
  'ensure_camera_session_after_pairing',
  'record_device_cat_care_log',
  'get_device_home_env_timestamps',
  'delete_device_cascade',
  'enforce_max_devices_per_home',
  'cleanup_stale_camera_data'
)
ORDER BY proname;

-- ─── 4. RLS 정책 확인 ───
SELECT tablename AS 테이블, policyname AS 정책명, cmd AS 명령
FROM pg_policies
WHERE tablename IN ('camera_devices', 'camera_sessions', 'ice_candidates')
ORDER BY tablename, policyname;

-- ─── 5. RLS 활성화 여부 확인 ───
SELECT relname AS 테이블,
       relrowsecurity AS rls_활성화
FROM pg_class
WHERE relname IN ('camera_devices', 'camera_sessions', 'ice_candidates');

-- ─── 6. 트리거 확인 ───
SELECT trigger_name AS 트리거명, event_manipulation AS 이벤트, action_timing AS 시점
FROM information_schema.triggers
WHERE event_object_table IN ('camera_devices', 'camera_sessions', 'ice_candidates');
