-- ============================================================================
-- 고아 세션 정리 SQL (1회 실행)
-- 기기가 삭제되었지만 세션이 남아있는 stale 데이터를 정리합니다.
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- ============================================================================

-- ─── 1. 기기가 없는 세션의 ICE 후보 삭제 ───
DELETE FROM ice_candidates
WHERE session_id IN (
  SELECT cs.id
  FROM camera_sessions cs
  LEFT JOIN camera_devices cd ON cd.id = cs.device_id
  WHERE cd.id IS NULL
);

-- ─── 2. 기기가 없는 고아 세션 삭제 ───
DELETE FROM camera_sessions
WHERE device_id NOT IN (
  SELECT id FROM camera_devices
);

-- ─── 3. 현재 stale 'live' 세션 전부 idle 로 전환 ───
-- (실제 방송 중인 기기가 없다면 live 세션은 모두 stale)
UPDATE camera_sessions
SET status = 'idle', updated_at = NOW()
WHERE status = 'live';

-- 확인: 남아있는 세션 수
SELECT
  (SELECT COUNT(*) FROM camera_devices) AS device_count,
  (SELECT COUNT(*) FROM camera_sessions) AS session_count,
  (SELECT COUNT(*) FROM camera_sessions WHERE status = 'live') AS live_session_count,
  (SELECT COUNT(*) FROM ice_candidates) AS ice_count;
