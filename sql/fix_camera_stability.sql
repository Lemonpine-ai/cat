-- ============================================================================
-- 카메라 재연결 안정화 — RPC 강화
-- start_device_broadcast: ICE 정리 + home_id 응답
-- stop_device_broadcast: ICE 정리 추가
-- ============================================================================

-- =====================
-- start_device_broadcast 강화
-- =====================
CREATE OR REPLACE FUNCTION start_device_broadcast(
  input_device_token TEXT,
  input_offer_sdp TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device RECORD;
  v_session_id UUID;
BEGIN
  SELECT id, home_id INTO v_device
  FROM camera_devices
  WHERE device_token = input_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  -- 기존 live 세션의 ICE 후보 삭제 (stale 데이터 방지)
  DELETE FROM ice_candidates
  WHERE session_id IN (
    SELECT id FROM camera_sessions
    WHERE device_id = v_device.id AND status = 'live'
  );

  -- 기존 live 세션 → idle + answer 초기화
  UPDATE camera_sessions
  SET status = 'idle', answer_sdp = NULL, updated_at = NOW()
  WHERE device_id = v_device.id
    AND status = 'live';

  -- 새 세션 생성
  INSERT INTO camera_sessions (home_id, device_id, status, offer_sdp, answer_sdp, created_at, updated_at)
  VALUES (v_device.home_id, v_device.id, 'live', input_offer_sdp, NULL, NOW(), NOW())
  RETURNING id INTO v_session_id;

  -- 기기 활성 상태 갱신
  UPDATE camera_devices
  SET is_active = true, last_seen_at = NOW()
  WHERE id = v_device.id;

  -- home_id 를 응답에 포함 (broadcaster 가 broadcast 채널 전송에 사용)
  RETURN json_build_object('session_id', v_session_id, 'home_id', v_device.home_id);
END;
$$;


-- =====================
-- stop_device_broadcast 강화
-- =====================
CREATE OR REPLACE FUNCTION stop_device_broadcast(input_device_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device RECORD;
BEGIN
  SELECT id INTO v_device
  FROM camera_devices
  WHERE device_token = input_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  -- live 세션의 ICE 후보 삭제
  DELETE FROM ice_candidates
  WHERE session_id IN (
    SELECT id FROM camera_sessions
    WHERE device_id = v_device.id AND status = 'live'
  );

  -- live 세션 → idle
  UPDATE camera_sessions
  SET status = 'idle', answer_sdp = NULL, updated_at = NOW()
  WHERE device_id = v_device.id
    AND status = 'live';

  -- 기기 비활성
  UPDATE camera_devices
  SET is_active = false, last_seen_at = NOW()
  WHERE id = v_device.id;

  RETURN json_build_object('success', true);
END;
$$;


-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

-- 현재 stale 데이터 정리
DELETE FROM ice_candidates;
UPDATE camera_sessions SET status = 'idle', answer_sdp = NULL WHERE status = 'live';
UPDATE camera_devices SET is_active = false WHERE is_active = true;
