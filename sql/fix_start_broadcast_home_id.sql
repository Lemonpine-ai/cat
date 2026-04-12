-- ============================================================================
-- start_device_broadcast RPC 에 home_id 반환 추가
--
-- 문제: 기존 RPC 가 session_id 만 반환하여 broadcaster 가 home_id 를 모름.
--       그래서 session_started broadcast 가 발신되지 않아
--       뷰어 측 MultiCameraGrid 가 새 세션을 늦게 감지.
--
-- 해결: RETURN 에 home_id 포함. broadcaster 가 즉시 broadcast 채널로 알림 가능.
--
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- ============================================================================

DROP FUNCTION IF EXISTS start_device_broadcast(TEXT, TEXT);

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

  RETURN json_build_object('session_id', v_session_id, 'home_id', v_device.home_id);
END;
$$;

NOTIFY pgrst, 'reload schema';
