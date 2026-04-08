-- ============================================================================
-- 카메라 관련 DB 정리 SQL
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- ============================================================================

-- ─── 1. idle 세션의 ICE 후보 삭제 (가장 많이 쌓이는 데이터) ───
-- idle 상태인 세션에 속한 ICE 후보는 더 이상 필요 없습니다.
DELETE FROM ice_candidates
WHERE session_id IN (
  SELECT id FROM camera_sessions WHERE status = 'idle'
);

-- ─── 2. 1시간 이상 지난 idle 세션 삭제 ───
-- 방송 종료 후 1시간이 지난 세션은 정리합니다.
DELETE FROM camera_sessions
WHERE status = 'idle'
  AND updated_at < NOW() - INTERVAL '1 hour';

-- ─── 3. 페어링 만료된 미등록 기기 삭제 ───
-- 페어링 코드가 만료되었는데 아직 연결 안 된 기기를 정리합니다.
DELETE FROM camera_devices
WHERE is_paired = false
  AND pairing_code_expires_at < NOW();

-- ─── 4. 24시간 이상 된 ICE 후보 전부 삭제 (안전망) ───
-- ICE 후보는 연결 수립 후에는 불필요합니다.
DELETE FROM ice_candidates
WHERE created_at < NOW() - INTERVAL '24 hours';


-- ============================================================================
-- [선택] 자동 정리 함수 + pg_cron 스케줄
-- Supabase Pro 이상에서 pg_cron 확장을 활성화한 경우 사용 가능합니다.
-- ============================================================================

-- 정리 함수 생성
CREATE OR REPLACE FUNCTION cleanup_stale_camera_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- idle 세션의 ICE 후보 삭제
  DELETE FROM ice_candidates
  WHERE session_id IN (
    SELECT id FROM camera_sessions WHERE status = 'idle'
  );

  -- 1시간 이상 지난 idle 세션 삭제
  DELETE FROM camera_sessions
  WHERE status = 'idle'
    AND updated_at < NOW() - INTERVAL '1 hour';

  -- 페어링 만료된 미등록 기기 삭제
  DELETE FROM camera_devices
  WHERE is_paired = false
    AND pairing_code_expires_at < NOW();

  -- 24시간 이상 된 ICE 후보 전부 삭제
  DELETE FROM ice_candidates
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- [pg_cron 있을 때] 매시간 자동 실행 스케줄 등록
-- SELECT cron.schedule('cleanup-camera-data', '0 * * * *', 'SELECT cleanup_stale_camera_data()');


-- ============================================================================
-- [선택] 기기 수 제한 트리거 (DB 차원 안전장치)
-- 클라이언트에서도 제한하지만, DB 트리거로 이중 방어합니다.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_max_devices_per_home()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  device_count INT;
  oldest_inactive_id UUID;
BEGIN
  -- 현재 home_id 의 기기 수 확인
  SELECT COUNT(*) INTO device_count
  FROM camera_devices
  WHERE home_id = NEW.home_id;

  -- 6개 이하면 통과
  IF device_count < 6 THEN
    RETURN NEW;
  END IF;

  -- 비활성 기기 중 가장 오래된 것 찾기
  SELECT id INTO oldest_inactive_id
  FROM camera_devices
  WHERE home_id = NEW.home_id
    AND is_active = false
  ORDER BY created_at ASC
  LIMIT 1;

  -- 비활성 기기가 없으면 가장 오래된 것 아무거나
  IF oldest_inactive_id IS NULL THEN
    SELECT id INTO oldest_inactive_id
    FROM camera_devices
    WHERE home_id = NEW.home_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- 연쇄 삭제: ICE → 세션 → 기기
  DELETE FROM ice_candidates
  WHERE session_id IN (
    SELECT id FROM camera_sessions WHERE device_id = oldest_inactive_id
  );
  DELETE FROM camera_sessions WHERE device_id = oldest_inactive_id;
  DELETE FROM camera_devices WHERE id = oldest_inactive_id;

  RETURN NEW;
END;
$$;

-- 트리거 연결 (INSERT 전에 실행)
DROP TRIGGER IF EXISTS trg_enforce_max_devices ON camera_devices;
CREATE TRIGGER trg_enforce_max_devices
  BEFORE INSERT ON camera_devices
  FOR EACH ROW
  EXECUTE FUNCTION enforce_max_devices_per_home();
