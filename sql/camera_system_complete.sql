-- ============================================================================
-- CATvisor 카메라 시스템 — 완전한 RPC + RLS 정의
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- CREATE OR REPLACE 이므로 기존 함수가 있어도 안전하게 덮어씁니다.
-- ============================================================================


-- =====================
-- RPC 1: pair_camera_device
-- 폰에서 4자리 코드 입력 → 기기 연결
-- =====================
CREATE OR REPLACE FUNCTION pair_camera_device(input_pairing_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device RECORD;
  v_new_token UUID;
BEGIN
  -- 유효한 페어링 코드 찾기 (만료 안 됨 + 미연결)
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

  -- device_token 생성
  v_new_token := gen_random_uuid();

  -- 기기 상태 업데이트: 페어링 완료
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
-- 페어링 직후 초기 세션 확보 (없으면 생성)
-- =====================
CREATE OR REPLACE FUNCTION ensure_camera_session_after_pairing(p_device_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device RECORD;
  v_session_id UUID;
BEGIN
  -- device_token 으로 기기 조회
  SELECT id, home_id INTO v_device
  FROM camera_devices
  WHERE device_token = p_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  -- 기존 세션 확인
  SELECT id INTO v_session_id
  FROM camera_sessions
  WHERE device_id = v_device.id
    AND home_id = v_device.home_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- 없으면 idle 세션 생성
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
-- 폰에서 방송 시작 → 세션 생성 + offer SDP 저장
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
  -- device_token 검증
  SELECT id, home_id INTO v_device
  FROM camera_devices
  WHERE device_token = input_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  -- 기존 live 세션이 있으면 idle 로 전환 (중복 방지)
  UPDATE camera_sessions
  SET status = 'idle', updated_at = NOW()
  WHERE device_id = v_device.id
    AND status = 'live';

  -- 새 세션 생성 (live + offer_sdp)
  INSERT INTO camera_sessions (home_id, device_id, status, offer_sdp, answer_sdp, created_at, updated_at)
  VALUES (v_device.home_id, v_device.id, 'live', input_offer_sdp, NULL, NOW(), NOW())
  RETURNING id INTO v_session_id;

  -- 기기 활성 상태 갱신
  UPDATE camera_devices
  SET is_active = true, last_seen_at = NOW()
  WHERE id = v_device.id;

  RETURN json_build_object('session_id', v_session_id);
END;
$$;


-- =====================
-- RPC 4: stop_device_broadcast
-- 방송 종료
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

  -- live 세션 → idle
  UPDATE camera_sessions
  SET status = 'idle', updated_at = NOW()
  WHERE device_id = v_device.id
    AND status = 'live';

  -- 기기 비활성
  UPDATE camera_devices
  SET is_active = false, last_seen_at = NOW()
  WHERE id = v_device.id;

  RETURN json_build_object('success', true);
END;
$$;


-- =====================
-- RPC 5: add_device_ice_candidate
-- broadcaster 측 ICE 후보 추가
-- =====================
CREATE OR REPLACE FUNCTION add_device_ice_candidate(
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
  -- device_token 검증
  SELECT id INTO v_device
  FROM camera_devices
  WHERE device_token = input_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  -- 세션 소유권 확인
  SELECT EXISTS(
    SELECT 1 FROM camera_sessions
    WHERE id = input_session_id AND device_id = v_device.id
  ) INTO v_session_exists;

  IF NOT v_session_exists THEN
    RETURN json_build_object('error', 'invalid_session');
  END IF;

  -- ICE 후보 저장
  INSERT INTO ice_candidates (session_id, sender, candidate)
  VALUES (input_session_id, 'broadcaster', input_candidate);

  RETURN json_build_object('success', true);
END;
$$;


-- =====================
-- RPC 6: get_broadcaster_signaling_state
-- broadcaster 가 폴링: answer SDP + viewer ICE 수신
-- =====================
CREATE OR REPLACE FUNCTION get_broadcaster_signaling_state(
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
  -- device_token 검증
  SELECT id INTO v_device
  FROM camera_devices
  WHERE device_token = p_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  -- answer_sdp 조회
  SELECT answer_sdp INTO v_answer_sdp
  FROM camera_sessions
  WHERE id = p_session_id
    AND device_id = v_device.id;

  -- viewer ICE 후보 목록 조회
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
-- 카메라 폰에서 케어 활동(밥, 물, 화장실, 약) 기록
-- =====================
CREATE OR REPLACE FUNCTION record_device_cat_care_log(
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
  v_home_id UUID;
BEGIN
  -- device_token 검증
  SELECT id, home_id INTO v_device
  FROM camera_devices
  WHERE device_token = p_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  v_home_id := v_device.home_id;

  -- 케어 로그 저장
  INSERT INTO cat_care_logs (home_id, care_kind, created_at)
  VALUES (v_home_id, p_care_kind, NOW());

  RETURN json_build_object('success', true);
END;
$$;


-- =====================
-- RPC 8: get_device_home_env_timestamps
-- 방송 폰에서 식수교체/화장실청소 최근 시간 조회
-- =====================
CREATE OR REPLACE FUNCTION get_device_home_env_timestamps(p_device_token TEXT)
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

  -- 식수 교체 최근 시간
  SELECT MAX(created_at) INTO v_last_water
  FROM cat_care_logs
  WHERE home_id = v_device.home_id
    AND care_kind = 'water_change';

  -- 화장실 청소 최근 시간
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
-- RPC 9: delete_device_cascade (이전 제공분)
-- 기기 + 연관 세션/ICE 안전 삭제
-- =====================
CREATE OR REPLACE FUNCTION delete_device_cascade(p_device_id UUID)
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


-- ============================================================================
-- RLS 정책 (없으면 생성)
-- ============================================================================

-- camera_devices RLS
ALTER TABLE camera_devices ENABLE ROW LEVEL SECURITY;

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

-- camera_sessions RLS
ALTER TABLE camera_sessions ENABLE ROW LEVEL SECURITY;

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

-- ice_candidates RLS
ALTER TABLE ice_candidates ENABLE ROW LEVEL SECURITY;

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


-- ============================================================================
-- 기기 수 제한 트리거 (기존과 동일)
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

DROP TRIGGER IF EXISTS trg_enforce_max_devices ON camera_devices;
CREATE TRIGGER trg_enforce_max_devices
  BEFORE INSERT ON camera_devices
  FOR EACH ROW
  EXECUTE FUNCTION enforce_max_devices_per_home();


-- ============================================================================
-- 스테일 데이터 최종 정리
-- ============================================================================

-- 고아 ICE 삭제
DELETE FROM ice_candidates
WHERE session_id IN (
  SELECT cs.id FROM camera_sessions cs
  LEFT JOIN camera_devices cd ON cd.id = cs.device_id
  WHERE cd.id IS NULL
);

-- 고아 세션 삭제
DELETE FROM camera_sessions
WHERE device_id NOT IN (SELECT id FROM camera_devices);

-- 모든 stale live 세션 → idle
UPDATE camera_sessions
SET status = 'idle', updated_at = NOW()
WHERE status = 'live';

-- 모든 기기 is_active → false (현재 실제 방송 없으므로)
UPDATE camera_devices
SET is_active = false
WHERE is_active = true;
