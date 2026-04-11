-- ============================================================================
-- V3: viewer_update_answer_sdp에서 DELETE 제거 (Race Condition 수정)
--
-- 문제: setLocalDescription 후 ICE candidate가 비동기로 발화되는데,
--       viewer_update_answer_sdp의 DELETE가 방금 삽입된 ICE를 삭제함
-- 해결: DELETE 제거. ICE 누적은 broadcaster의 dedup(appliedViewerIceKeysRef)이 처리.
--
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- ============================================================================

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

  -- answer SDP 저장 (DELETE 없음 — race condition 방지)
  UPDATE camera_sessions
  SET answer_sdp = p_answer_sdp, updated_at = NOW()
  WHERE id = p_session_id;

  RETURN json_build_object('success', true);
END;
$$;


-- 현재 stale 데이터 정리
DELETE FROM ice_candidates;
UPDATE camera_sessions SET status = 'idle', answer_sdp = NULL WHERE status = 'live';
UPDATE camera_devices SET is_active = false WHERE is_active = true;

NOTIFY pgrst, 'reload schema';
