-- ============================================================================
-- Viewer RLS 우회 RPC — answer SDP 저장 + viewer ICE 후보 삽입
-- broadcaster 측은 이미 SECURITY DEFINER RPC 로 동작하므로 RLS 문제 없음.
-- viewer 측도 동일하게 RPC 로 전환하여 RLS 정책 충돌을 근본적으로 해결.
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- ============================================================================


-- =====================
-- RPC: viewer_update_answer_sdp
-- 대시보드(viewer)가 answer SDP 를 camera_sessions 에 저장
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
  -- 로그인한 사용자의 home_id 조회
  SELECT home_id INTO v_user_home_id
  FROM profiles WHERE id = auth.uid();

  IF v_user_home_id IS NULL THEN
    RETURN json_build_object('error', 'unauthorized');
  END IF;

  -- 세션의 home_id 확인 (소유권 검증)
  SELECT home_id INTO v_session_home_id
  FROM camera_sessions WHERE id = p_session_id;

  IF v_session_home_id IS NULL OR v_session_home_id != v_user_home_id THEN
    RETURN json_build_object('error', 'session_not_found');
  END IF;

  -- answer SDP 저장
  UPDATE camera_sessions
  SET answer_sdp = p_answer_sdp, updated_at = NOW()
  WHERE id = p_session_id;

  RETURN json_build_object('success', true);
END;
$$;


-- =====================
-- RPC: viewer_add_ice_candidate
-- 대시보드(viewer)가 ICE 후보를 ice_candidates 에 삽입
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
  -- 로그인한 사용자의 home_id 조회
  SELECT home_id INTO v_user_home_id
  FROM profiles WHERE id = auth.uid();

  IF v_user_home_id IS NULL THEN
    RETURN json_build_object('error', 'unauthorized');
  END IF;

  -- 세션의 home_id 확인 (소유권 검증)
  SELECT home_id INTO v_session_home_id
  FROM camera_sessions WHERE id = p_session_id;

  IF v_session_home_id IS NULL OR v_session_home_id != v_user_home_id THEN
    RETURN json_build_object('error', 'session_not_found');
  END IF;

  -- viewer ICE 후보 저장
  INSERT INTO ice_candidates (session_id, sender, candidate)
  VALUES (p_session_id, 'viewer', p_candidate);

  RETURN json_build_object('success', true);
END;
$$;


-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
