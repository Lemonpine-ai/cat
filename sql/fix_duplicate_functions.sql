-- ============================================================================
-- 중복 함수 제거 SQL
-- 기존 UUID 버전 + 새 TEXT 버전이 공존하여 "Could not choose" 에러 발생.
-- 전부 DROP 후 TEXT 버전만 재생성합니다.
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- ============================================================================

-- ─── 모든 기존 함수 완전 제거 (UUID 버전 + TEXT 버전 모두) ───

-- pair_camera_device
DROP FUNCTION IF EXISTS pair_camera_device(text);
DROP FUNCTION IF EXISTS pair_camera_device(uuid);

-- ensure_camera_session_after_pairing
DROP FUNCTION IF EXISTS ensure_camera_session_after_pairing(text);
DROP FUNCTION IF EXISTS ensure_camera_session_after_pairing(uuid);

-- start_device_broadcast
DROP FUNCTION IF EXISTS start_device_broadcast(text, text);
DROP FUNCTION IF EXISTS start_device_broadcast(uuid, text);

-- stop_device_broadcast
DROP FUNCTION IF EXISTS stop_device_broadcast(text);
DROP FUNCTION IF EXISTS stop_device_broadcast(uuid);

-- add_device_ice_candidate
DROP FUNCTION IF EXISTS add_device_ice_candidate(text, uuid, jsonb);
DROP FUNCTION IF EXISTS add_device_ice_candidate(uuid, uuid, jsonb);

-- get_broadcaster_signaling_state
DROP FUNCTION IF EXISTS get_broadcaster_signaling_state(text, uuid);
DROP FUNCTION IF EXISTS get_broadcaster_signaling_state(uuid, uuid);

-- record_device_cat_care_log
DROP FUNCTION IF EXISTS record_device_cat_care_log(text, text, text);
DROP FUNCTION IF EXISTS record_device_cat_care_log(uuid, text, text);
DROP FUNCTION IF EXISTS record_device_cat_care_log(text, text, uuid);
DROP FUNCTION IF EXISTS record_device_cat_care_log(uuid, text, uuid);

-- get_device_home_env_timestamps
DROP FUNCTION IF EXISTS get_device_home_env_timestamps(text);
DROP FUNCTION IF EXISTS get_device_home_env_timestamps(uuid);

-- delete_device_cascade
DROP FUNCTION IF EXISTS delete_device_cascade(uuid);

-- enforce_max_devices_per_home (트리거 먼저 제거 후 함수 삭제)
DROP TRIGGER IF EXISTS trg_enforce_max_devices ON camera_devices;
DROP TRIGGER IF EXISTS tr_limit_camera_devices ON camera_devices;
DROP FUNCTION IF EXISTS enforce_max_devices_per_home();

-- cleanup_stale_camera_data
DROP FUNCTION IF EXISTS cleanup_stale_camera_data();


-- ============================================================================
-- 이제 깨끗한 상태에서 전부 재생성
-- ============================================================================


-- =====================
-- RPC 1: pair_camera_device
-- =====================
CREATE FUNCTION pair_camera_device(input_pairing_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device RECORD;
  v_new_token UUID;
BEGIN
  SELECT id, device_name, home_id
  INTO v_device
  FROM camera_devices
  WHERE pairing_code = input_pairing_code
    AND pairing_code_expires_at > NOW()
    AND is_paired = false
  LIMIT 1;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', '유효하지 않은 코드예요. 다시 확인해 주세요.');
  END IF;

  v_new_token := gen_random_uuid();

  UPDATE camera_devices
  SET is_paired = true,
      device_token = v_new_token,
      pairing_code = NULL,
      pairing_code_expires_at = NULL,
      last_seen_at = NOW()
  WHERE id = v_device.id;

  RETURN json_build_object(
    'device_token', v_new_token,
    'device_id', v_device.id,
    'device_name', v_device.device_name,
    'home_id', v_device.home_id
  );
END;
$$;


-- =====================
-- RPC 2: ensure_camera_session_after_pairing
-- =====================
CREATE FUNCTION ensure_camera_session_after_pairing(p_device_token TEXT)
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
  WHERE device_token = p_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  SELECT id INTO v_session_id
  FROM camera_sessions
  WHERE device_id = v_device.id
    AND home_id = v_device.home_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    INSERT INTO camera_sessions (home_id, device_id, status)
    VALUES (v_device.home_id, v_device.id, 'idle')
    RETURNING id INTO v_session_id;
  END IF;

  RETURN json_build_object('success', true, 'session_id', v_session_id);
END;
$$;


-- =====================
-- RPC 3: start_device_broadcast
-- =====================
CREATE FUNCTION start_device_broadcast(
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

  UPDATE camera_sessions
  SET status = 'idle', updated_at = NOW()
  WHERE device_id = v_device.id
    AND status = 'live';

  INSERT INTO camera_sessions (home_id, device_id, status, offer_sdp, answer_sdp, created_at, updated_at)
  VALUES (v_device.home_id, v_device.id, 'live', input_offer_sdp, NULL, NOW(), NOW())
  RETURNING id INTO v_session_id;

  UPDATE camera_devices
  SET is_active = true, last_seen_at = NOW()
  WHERE id = v_device.id;

  RETURN json_build_object('session_id', v_session_id);
END;
$$;


-- =====================
-- RPC 4: stop_device_broadcast
-- =====================
CREATE FUNCTION stop_device_broadcast(input_device_token TEXT)
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

  UPDATE camera_sessions
  SET status = 'idle', updated_at = NOW()
  WHERE device_id = v_device.id
    AND status = 'live';

  UPDATE camera_devices
  SET is_active = false, last_seen_at = NOW()
  WHERE id = v_device.id;

  RETURN json_build_object('success', true);
END;
$$;


-- =====================
-- RPC 5: add_device_ice_candidate
-- =====================
CREATE FUNCTION add_device_ice_candidate(
  input_device_token TEXT,
  input_session_id UUID,
  input_candidate JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device RECORD;
  v_session_exists BOOLEAN;
BEGIN
  SELECT id INTO v_device
  FROM camera_devices
  WHERE device_token = input_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM camera_sessions
    WHERE id = input_session_id AND device_id = v_device.id
  ) INTO v_session_exists;

  IF NOT v_session_exists THEN
    RETURN json_build_object('error', 'invalid_session');
  END IF;

  INSERT INTO ice_candidates (session_id, sender, candidate)
  VALUES (input_session_id, 'broadcaster', input_candidate);

  RETURN json_build_object('success', true);
END;
$$;


-- =====================
-- RPC 6: get_broadcaster_signaling_state
-- =====================
CREATE FUNCTION get_broadcaster_signaling_state(
  p_device_token TEXT,
  p_session_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device RECORD;
  v_answer_sdp TEXT;
  v_viewer_ice JSONB;
BEGIN
  SELECT id INTO v_device
  FROM camera_devices
  WHERE device_token = p_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  SELECT answer_sdp INTO v_answer_sdp
  FROM camera_sessions
  WHERE id = p_session_id
    AND device_id = v_device.id;

  SELECT COALESCE(jsonb_agg(candidate ORDER BY created_at), '[]'::jsonb)
  INTO v_viewer_ice
  FROM ice_candidates
  WHERE session_id = p_session_id
    AND sender = 'viewer';

  RETURN json_build_object(
    'answer_sdp', v_answer_sdp,
    'viewer_ice', v_viewer_ice
  );
END;
$$;


-- =====================
-- RPC 7: record_device_cat_care_log
-- =====================
CREATE FUNCTION record_device_cat_care_log(
  p_device_token TEXT,
  p_care_kind TEXT,
  p_camera_session_id TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device RECORD;
BEGIN
  SELECT id, home_id INTO v_device
  FROM camera_devices
  WHERE device_token = p_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  INSERT INTO cat_care_logs (home_id, care_kind, created_at)
  VALUES (v_device.home_id, p_care_kind, NOW());

  RETURN json_build_object('success', true);
END;
$$;


-- =====================
-- RPC 8: get_device_home_env_timestamps
-- =====================
CREATE FUNCTION get_device_home_env_timestamps(p_device_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device RECORD;
  v_last_water TIMESTAMPTZ;
  v_last_litter TIMESTAMPTZ;
BEGIN
  SELECT id, home_id INTO v_device
  FROM camera_devices
  WHERE device_token = p_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  SELECT MAX(created_at) INTO v_last_water
  FROM cat_care_logs
  WHERE home_id = v_device.home_id
    AND care_kind = 'water_change';

  SELECT MAX(created_at) INTO v_last_litter
  FROM cat_care_logs
  WHERE home_id = v_device.home_id
    AND care_kind = 'litter_clean';

  RETURN json_build_object(
    'home_id', v_device.home_id,
    'last_water_change_at', v_last_water,
    'last_litter_clean_at', v_last_litter
  );
END;
$$;


-- =====================
-- RPC 9: delete_device_cascade
-- =====================
CREATE FUNCTION delete_device_cascade(p_device_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_home_id UUID;
  v_user_home_id UUID;
BEGIN
  SELECT home_id INTO v_home_id
  FROM camera_devices WHERE id = p_device_id;

  IF v_home_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'device_not_found');
  END IF;

  SELECT home_id INTO v_user_home_id
  FROM profiles WHERE id = auth.uid();

  IF v_user_home_id IS NULL OR v_user_home_id != v_home_id THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  DELETE FROM ice_candidates
  WHERE session_id IN (SELECT id FROM camera_sessions WHERE device_id = p_device_id);
  DELETE FROM camera_sessions WHERE device_id = p_device_id;
  DELETE FROM camera_devices WHERE id = p_device_id;

  RETURN json_build_object('success', true);
END;
$$;


-- =====================
-- 기기 수 제한 트리거
-- =====================
CREATE FUNCTION enforce_max_devices_per_home()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  device_count INT;
  oldest_inactive_id UUID;
BEGIN
  SELECT COUNT(*) INTO device_count
  FROM camera_devices WHERE home_id = NEW.home_id;

  IF device_count < 6 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO oldest_inactive_id
  FROM camera_devices
  WHERE home_id = NEW.home_id AND is_active = false
  ORDER BY created_at ASC LIMIT 1;

  IF oldest_inactive_id IS NULL THEN
    SELECT id INTO oldest_inactive_id
    FROM camera_devices
    WHERE home_id = NEW.home_id
    ORDER BY created_at ASC LIMIT 1;
  END IF;

  DELETE FROM ice_candidates
  WHERE session_id IN (SELECT id FROM camera_sessions WHERE device_id = oldest_inactive_id);
  DELETE FROM camera_sessions WHERE device_id = oldest_inactive_id;
  DELETE FROM camera_devices WHERE id = oldest_inactive_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_max_devices
  BEFORE INSERT ON camera_devices
  FOR EACH ROW
  EXECUTE FUNCTION enforce_max_devices_per_home();


-- =====================
-- 정리 함수 (pg_cron 용)
-- =====================
CREATE FUNCTION cleanup_stale_camera_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM ice_candidates
  WHERE session_id IN (SELECT id FROM camera_sessions WHERE status = 'idle');

  DELETE FROM camera_sessions
  WHERE status = 'idle' AND updated_at < NOW() - INTERVAL '1 hour';

  DELETE FROM camera_devices
  WHERE is_paired = false AND pairing_code_expires_at < NOW();

  DELETE FROM ice_candidates
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;


-- =====================
-- 스테일 데이터 정리
-- =====================
DELETE FROM ice_candidates
WHERE session_id IN (
  SELECT cs.id FROM camera_sessions cs
  LEFT JOIN camera_devices cd ON cd.id = cs.device_id
  WHERE cd.id IS NULL
);

DELETE FROM camera_sessions
WHERE device_id NOT IN (SELECT id FROM camera_devices);

UPDATE camera_sessions SET status = 'idle', updated_at = NOW() WHERE status = 'live';
UPDATE camera_devices SET is_active = false WHERE is_active = true;
