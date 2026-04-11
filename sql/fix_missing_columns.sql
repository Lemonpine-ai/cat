-- ============================================================================
-- camera_sessions 테이블 누락 컬럼 추가 + RPC 재생성
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- ============================================================================

-- ─── 1. 누락 컬럼 추가 ───
ALTER TABLE camera_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE camera_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ─── 2. start_device_broadcast 재생성 ───
DROP FUNCTION IF EXISTS start_device_broadcast(text, text);

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
