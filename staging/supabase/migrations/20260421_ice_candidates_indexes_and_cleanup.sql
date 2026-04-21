-- =============================================================================
-- 마이그레이션: ice_candidates 인덱스 3개 + stale cleanup + 자동 cleanup 함수
-- =============================================================================
-- 배경
--   LTE 환경에서 카메라 영상이 15초 타임아웃 나는 이슈 추적 결과,
--   ice_candidates 테이블에 PK 외 인덱스가 0개였다. 1885 rows 누적된 상태에서
--   방송폰의 `get_broadcaster_signaling_state` RPC 가 viewer ICE 후보를 SELECT
--   할 때 full scan → Supabase 의 30초 statement_timeout 초과 → RPC 취소 →
--   방송폰이 응답 못 함 → 뷰어 측 CameraSlot 이 15초 타임아웃 발생.
--
-- 로그에서 확인된 증상:
--   방송폰: "canceling statement due to statement timeout"
--   LTE 뷰어: "[CameraSlot] 연결 타임아웃 (15초)"
--
-- 해결 3중
--   (1) 쿼리 패턴별 인덱스 3개 추가 — session_id / (session_id,sender) / created_at
--   (2) 1일 이상 된 stale rows 즉시 삭제 (현재 활성 세션과 무관)
--   (3) cleanup_stale_ice_candidates() 함수 신설 — 향후 자동 정리 호출용
--
-- 안전성
--   - IF NOT EXISTS 로 멱등 재실행 가능
--   - DELETE 조건이 "1일 이상 된 것" 이라 활성 세션 영향 없음
--   - ANALYZE 로 planner 가 새 인덱스 즉시 활용
-- =============================================================================


-- -----------------------------------------------------------------------------
-- [1/3] 인덱스 추가 — WebRTC 주요 쿼리 패턴 커버
-- -----------------------------------------------------------------------------
-- 쿼리: SELECT ... WHERE session_id = X
CREATE INDEX IF NOT EXISTS idx_ice_candidates_session_id
  ON public.ice_candidates (session_id);

-- 쿼리: SELECT ... WHERE session_id = X AND sender = 'viewer'/'broadcaster'
CREATE INDEX IF NOT EXISTS idx_ice_candidates_session_sender
  ON public.ice_candidates (session_id, sender);

-- 쿼리: DELETE WHERE created_at < now() - interval '1 day' (cleanup 용)
CREATE INDEX IF NOT EXISTS idx_ice_candidates_created_at
  ON public.ice_candidates (created_at);


-- -----------------------------------------------------------------------------
-- [2/3] stale cleanup — 1일 이상 된 ICE 후보 삭제
-- -----------------------------------------------------------------------------
-- WebRTC ICE candidate 는 세션 종료 후 쓸모 없음. 누적은 쿼리 성능 악화만 초래.
DELETE FROM public.ice_candidates
WHERE created_at < now() - interval '1 day';


-- -----------------------------------------------------------------------------
-- [3/3] 자동 cleanup 함수 — 주기적 호출용
-- -----------------------------------------------------------------------------
-- 안전하게 호출 가능 (SECURITY DEFINER, 1일 초과만 삭제)
-- 향후 방송 시작 흐름이나 pg_cron 에서 호출 가능.
CREATE OR REPLACE FUNCTION public.cleanup_stale_ice_candidates()
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.ice_candidates
  WHERE created_at < now() - interval '1 day';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN json_build_object(
    'deleted', v_deleted_count,
    'cleaned_at', now()
  );
END;
$$;

-- 호출 권한 (anon·authenticated 모두) — 방송 시작 흐름에서도 호출 가능하도록
GRANT EXECUTE ON FUNCTION public.cleanup_stale_ice_candidates() TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 통계 업데이트 — planner 가 새 인덱스 즉시 활용
-- -----------------------------------------------------------------------------
ANALYZE public.ice_candidates;


-- =============================================================================
-- 롤백 (참조용 — 실행하지 마세요)
-- =============================================================================
-- DROP INDEX IF EXISTS public.idx_ice_candidates_session_id;
-- DROP INDEX IF EXISTS public.idx_ice_candidates_session_sender;
-- DROP INDEX IF EXISTS public.idx_ice_candidates_created_at;
-- DROP FUNCTION IF EXISTS public.cleanup_stale_ice_candidates();
