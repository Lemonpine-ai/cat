-- ============================================================================
-- delete_device_cascade: 카메라 기기 삭제 RPC
-- device_id 가 PostgREST 에서 접근 불가하므로,
-- DB 내부(SECURITY DEFINER)에서 ICE → 세션 → 기기 순서로 안전하게 삭제합니다.
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_device_cascade(p_device_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_home_id UUID;
  v_user_home_id UUID;
BEGIN
  -- ① 삭제 대상 기기의 home_id 확인
  SELECT home_id INTO v_home_id
  FROM camera_devices
  WHERE id = p_device_id;

  IF v_home_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'device_not_found');
  END IF;

  -- ② 호출자가 해당 home 의 소유자인지 확인 (RLS 대체)
  SELECT home_id INTO v_user_home_id
  FROM profiles
  WHERE id = auth.uid();

  IF v_user_home_id IS NULL OR v_user_home_id != v_home_id THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- ③ 연쇄 삭제: ICE 후보 → 세션 → 기기
  DELETE FROM ice_candidates
  WHERE session_id IN (
    SELECT id FROM camera_sessions WHERE device_id = p_device_id
  );

  DELETE FROM camera_sessions
  WHERE device_id = p_device_id;

  DELETE FROM camera_devices
  WHERE id = p_device_id;

  RETURN json_build_object('success', true);
END;
$$;
