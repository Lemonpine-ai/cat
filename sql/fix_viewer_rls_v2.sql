-- ============================================================================
-- V2: viewer RPC 강화 + stale 데이터 정리
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- ============================================================================


-- =====================
-- 1. viewer_update_answer_sdp 강화
-- answer 저장 전에 기존 viewer ICE 후보를 삭제하여 매번 깨끗한 연결 보장
-- =====================
CREATE OR REPLACE FUNCTION viewer_update_answer_sdp(
  p_session_id UUID,
  p_answer_sdp TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_home_id UUID;
  v_session_home_id UUID;
BEGIN
  SELECT home_id INTO v_user_home_id
  FROM profiles WHERE id = auth.uid();

  IF v_user_home_id IS NULL THEN
    RETURN json_build_object('error', 'unauthorized');
  END IF;

  SELECT home_id INTO v_session_home_id
  FROM camera_sessions WHERE id = p_session_id;

  IF v_session_home_id IS NULL OR v_session_home_id != v_user_home_id THEN
    RETURN json_build_object('error', 'session_not_found');
  END IF;

  -- 기존 viewer ICE 후보 삭제 (재연결 시 깨끗한 상태 보장)
  DELETE FROM ice_candidates
  WHERE session_id = p_session_id AND sender = 'viewer';

  -- answer SDP 저장
  UPDATE camera_sessions
  SET answer_sdp = p_answer_sdp, updated_at = NOW()
  WHERE id = p_session_id;

  RETURN json_build_object('success', true);
END;
$$;


-- =====================
-- 2. viewer_add_ice_candidate (변경 없음, 재생성으로 확실히 존재 보장)
-- =====================
CREATE OR REPLACE FUNCTION viewer_add_ice_candidate(
  p_session_id UUID,
  p_candidate JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_home_id UUID;
  v_session_home_id UUID;
BEGIN
  SELECT home_id INTO v_user_home_id
  FROM profiles WHERE id = auth.uid();

  IF v_user_home_id IS NULL THEN
    RETURN json_build_object('error', 'unauthorized');
  END IF;

  SELECT home_id INTO v_session_home_id
  FROM camera_sessions WHERE id = p_session_id;

  IF v_session_home_id IS NULL OR v_session_home_id != v_user_home_id THEN
    RETURN json_build_object('error', 'session_not_found');
  END IF;

  INSERT INTO ice_candidates (session_id, sender, candidate)
  VALUES (p_session_id, 'viewer', p_candidate);

  RETURN json_build_object('success', true);
END;
$$;


-- =====================
-- 3. 일회성 stale 데이터 정리
-- =====================

-- 모든 ICE 후보 삭제 (stale 연결 잔해)
DELETE FROM ice_candidates;

-- 모든 live 세션 → idle + answer_sdp 초기화
UPDATE camera_sessions
SET status = 'idle', answer_sdp = NULL, updated_at = NOW()
WHERE status = 'live';

-- 기기 활성 상태 초기화
UPDATE camera_devices
SET is_active = false
WHERE is_active = true;

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
