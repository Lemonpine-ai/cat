-- =============================================================================
-- 마이그레이션: camera_sessions 인덱스 3개 + stale cleanup + cleanup 함수
--               + viewer_update_answer_sdp lock_timeout / FOR UPDATE NOWAIT
-- =============================================================================
-- 배경
--   선행 마이그레이션 `20260421_ice_candidates_indexes_and_cleanup.sql` 적용으로
--   ice_candidates 쪽 statement_timeout 은 해소되었으나, LTE 환경의 카메라
--   "연결 타임아웃 (15초)" 증상이 지속됨. EXPLAIN / Postgres 로그 분석 결과
--   진범이 `camera_sessions` 테이블로 좁혀짐.
--
--   - 누적 3678 rows 중 status='live' 는 단 2개, 나머지 3676 rows 는 stale.
--   - PK `id` 외 인덱스 0개 → `WHERE home_id = X AND status = 'live'` 가 Seq Scan.
--   - `viewer_update_answer_sdp` RPC 가 동일 row 를 UPDATE 하는 동안 다른 트랜잭션의
--     읽기·쓰기가 row-level lock 대기에 걸려 statement_timeout 까지 떠밀림.
--
-- 로그에서 확인된 증상:
--   방송폰(S9): "canceling statement due to statement timeout"
--   Postgres : "process N acquired AccessExclusiveLock on tuple (40,34)"
--              "process M still waiting for ShareLock on transaction ..."
--   LTE 뷰어 : "[CameraSlot] 연결 타임아웃 (15초)"
--
-- 해결 4중 + 1 (방송 시작 시 cleanup)
--   (1) 쿼리 패턴별 인덱스 3개 추가
--         - (home_id, status)         : 홈 대시보드 카메라 조회
--         - (device_id, status)       : 방송폰 자기 세션 lookup
--         - (updated_at) WHERE !live  : cleanup 전용 partial index
--   (2) updated_at 1일 이상 + status != 'live' 인 stale 즉시 삭제
--         (활성 세션 영향 없음 — status='live' 는 절대 건드리지 않음)
--   (3) cleanup_stale_camera_sessions() 함수 신설 — 자동 정리 호출용
--   (4) viewer_update_answer_sdp 에 lock_timeout(3s) + FOR UPDATE NOWAIT 적용
--         - 잠금 대기 중 statement_timeout(30s)까지 떠밀리는 사고 차단
--         - 잠금 실패는 SQLSTATE 55P03(lock_not_available) 로 즉시 에러 반환.
--         - 동반 클라이언트 패치: useWebRtcLiveConnection / useWebRtcSlotConnection
--           두 훅 모두 55P03 감지 시 exponential backoff(200→400→800ms, 최대 3회)
--           로 재시도하며, 3회 실패 시 사용자에게 에러 전파.
--
-- 안전성
--   - IF NOT EXISTS / OR REPLACE 로 멱등 재실행 가능
--   - DELETE 조건이 "1일 이상 + status != 'live'" 라 활성 카메라 세션 무관
--   - viewer_update_answer_sdp 본문 로직(권한 체크·UPDATE)은 V3 정의 그대로 보존,
--     lock_timeout / SELECT FOR UPDATE NOWAIT / EXCEPTION 핸들러만 덧붙임
--   - ANALYZE 로 planner 가 새 인덱스 즉시 활용
-- =============================================================================


-- -----------------------------------------------------------------------------
-- [1/7] 인덱스 추가 — camera_sessions 주요 쿼리 패턴 커버
-- -----------------------------------------------------------------------------
-- 쿼리: WHERE home_id = X AND status = 'live'
--   사용처: 홈 대시보드의 카메라 슬롯 목록 조회
CREATE INDEX IF NOT EXISTS idx_camera_sessions_home_status
  ON public.camera_sessions (home_id, status);

-- 쿼리: WHERE device_id = X AND status = 'live'
--   사용처: 방송폰이 자기 세션을 찾을 때 (start_device_broadcast 등)
CREATE INDEX IF NOT EXISTS idx_camera_sessions_device_status
  ON public.camera_sessions (device_id, status);

-- 쿼리: cleanup 용 partial index — status != 'live' 인 stale 만 인덱싱
--   live 세션은 인덱스에서 빠져 있어 사이즈가 작고, cleanup 쿼리에 즉시 매칭됨.
CREATE INDEX IF NOT EXISTS idx_camera_sessions_updated_at_stale
  ON public.camera_sessions (updated_at)
  WHERE status <> 'live';


-- -----------------------------------------------------------------------------
-- [2/7] stale cleanup — 1일 이상 안 갱신 + live 가 아닌 세션 삭제
-- -----------------------------------------------------------------------------
-- 활성 세션(status='live')은 조건에 걸리지 않으므로 안전.
-- 누적 3676 rows 의 stale 이 인덱스 fan-out 과 Seq Scan 을 모두 갉아먹는다.
DELETE FROM public.camera_sessions
WHERE updated_at < now() - interval '1 day'
  AND status <> 'live';


-- -----------------------------------------------------------------------------
-- [3/7] 자동 cleanup 함수 — 주기적 호출용
-- -----------------------------------------------------------------------------
-- 안전하게 호출 가능 (SECURITY DEFINER, 1일 + 비활성 만 삭제).
-- 향후 방송 시작 흐름이나 pg_cron 에서 호출 가능.
CREATE OR REPLACE FUNCTION public.cleanup_stale_camera_sessions()
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.camera_sessions
  WHERE updated_at < now() - interval '1 day'
    AND status <> 'live';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN json_build_object(
    'deleted', v_deleted_count,
    'cleaned_at', now()
  );
END;
$$;

-- [4/7] cleanup_stale_camera_sessions GRANT 조이기 (Level 3 보안)
--   anon 은 cleanup 호출할 상황이 없음 — authenticated 로만 제한.
--   pg_cron 스케줄은 후속 운영 작업으로 분리 (현재는 start_device_broadcast 내부에서만 호출).
GRANT EXECUTE ON FUNCTION public.cleanup_stale_camera_sessions() TO authenticated;


-- -----------------------------------------------------------------------------
-- [5/7] viewer_update_answer_sdp — lock_timeout + FOR UPDATE NOWAIT 적용
-- -----------------------------------------------------------------------------
-- 기존 정의(sql/fix_viewer_rls_v3.sql, V3) 본문을 보존한 minimal 변경:
--   (a) 함수 진입 직후 SET LOCAL lock_timeout = '3s'  — 잠금 대기 한계
--   (b) UPDATE 직전 SELECT ... FOR UPDATE NOWAIT      — 잠금 즉시 시도
--   (c) EXCEPTION WHEN lock_not_available             — 55P03 즉시 RAISE
--       → 클라이언트 2곳(useWebRtcLiveConnection:317, useWebRtcSlotConnection:367)
--         의 55P03 backoff retry 루프가 다음 라운드에서 재시도 (200→400→800ms, max 3회).
--
-- V3 의 핵심 의도(DELETE 제거로 race condition 방지)는 그대로 유지하며,
-- 권한 체크 · UPDATE · 반환값 형식 모두 동일하다.
CREATE OR REPLACE FUNCTION public.viewer_update_answer_sdp(
  p_session_id UUID,
  p_answer_sdp TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_user_home_id    UUID;
  v_session_home_id UUID;
BEGIN
  -- (a) 트랜잭션 한정 lock 대기 한계 — 3초 초과 시 lock_not_available 발생
  SET LOCAL lock_timeout = '3s';

  -- 로그인한 사용자의 home_id 조회
  SELECT home_id INTO v_user_home_id
  FROM public.profiles WHERE id = auth.uid();

  IF v_user_home_id IS NULL THEN
    RETURN json_build_object('error', 'unauthorized');
  END IF;

  -- (b) 세션 소유권 검증 + 행 잠금 즉시 시도 (NOWAIT)
  --     이미 다른 트랜잭션이 잠근 상태면 즉시 SQLSTATE 55P03 으로 실패.
  SELECT home_id INTO v_session_home_id
  FROM public.camera_sessions
  WHERE id = p_session_id
  FOR UPDATE NOWAIT;

  IF v_session_home_id IS NULL OR v_session_home_id != v_user_home_id THEN
    RETURN json_build_object('error', 'session_not_found');
  END IF;

  -- answer SDP 저장 (V3 의도 그대로 — DELETE 없음, race condition 방지)
  UPDATE public.camera_sessions
  SET answer_sdp = p_answer_sdp,
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN json_build_object('success', true);

EXCEPTION
  -- (c) 잠금 실패(NOWAIT 즉시 실패 / lock_timeout 초과 모두 55P03)
  --     RAISE 로 그대로 던져 PostgREST → 클라이언트까지 에러 코드 전달.
  --     useWebRtcLiveConnection 측 backoff retry 가 다음 라운드에서 재시도.
  WHEN lock_not_available THEN
    RAISE;
END;
$$;

-- 호출 권한 — 기존과 동일하게 authenticated 사용자만 호출 가능
GRANT EXECUTE ON FUNCTION public.viewer_update_answer_sdp(UUID, TEXT) TO authenticated;


-- -----------------------------------------------------------------------------
-- [6/7] start_device_broadcast — 방송 시작 시 stale cleanup inline 호출
-- -----------------------------------------------------------------------------
-- 배경: cleanup_stale_camera_sessions() 를 만들어도 호출처가 없으면 dead function.
-- pg_cron 도입은 후속 운영 작업으로 분리. 우선 가장 확실한 trigger point 인
-- "방송 시작" 흐름에 inline 호출만 덧붙인다.
--
-- 호출 지점: 함수 진입 직후 — cleanup 이 실패해도 방송은 시작되어야 하므로
-- BEGIN ... EXCEPTION 으로 감싸 조용히 무시(PERFORM).
--
-- 원본 정의: sql/fix_start_broadcast_home_id.sql (최신) — home_id 반환 포함.
-- 맨 앞에 cleanup PERFORM 5줄만 추가하고, 본문 + 반환값 형식 모두 원본 그대로 보존.
CREATE OR REPLACE FUNCTION public.start_device_broadcast(
  input_device_token TEXT,
  input_offer_sdp TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_device RECORD;
  v_session_id UUID;
BEGIN
  -- [신규] stale 세션 정리 (1일 이상 비활성). 실패해도 방송은 시작되어야 함.
  BEGIN
    PERFORM public.cleanup_stale_camera_sessions();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- [이하 원본 본문 그대로 — sql/fix_start_broadcast_home_id.sql] device 검증
  SELECT id, home_id INTO v_device
  FROM public.camera_devices
  WHERE device_token = input_device_token::UUID
    AND is_paired = true;

  IF v_device IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  -- 기존 live 세션을 idle 로 전환 (중복 방지)
  UPDATE public.camera_sessions
  SET status = 'idle', updated_at = NOW()
  WHERE device_id = v_device.id
    AND status = 'live';

  -- 새 session INSERT (live + offer_sdp)
  INSERT INTO public.camera_sessions
    (home_id, device_id, status, offer_sdp, answer_sdp, created_at, updated_at)
  VALUES
    (v_device.home_id, v_device.id, 'live', input_offer_sdp, NULL, NOW(), NOW())
  RETURNING id INTO v_session_id;

  -- device 활성 플래그 갱신
  UPDATE public.camera_devices
  SET is_active = true, last_seen_at = NOW()
  WHERE id = v_device.id;

  -- 반환값: session_id + home_id (원본 최신 정의 유지 — broadcaster 측 broadcast 발신용)
  RETURN json_build_object('session_id', v_session_id, 'home_id', v_device.home_id);
END;
$$;


-- -----------------------------------------------------------------------------
-- [7/7] 통계 업데이트 — planner 가 새 인덱스 즉시 활용
-- -----------------------------------------------------------------------------
ANALYZE public.camera_sessions;


-- =============================================================================
-- 롤백 (참조용 — 실행하지 마세요)
-- =============================================================================
-- DROP INDEX IF EXISTS public.idx_camera_sessions_home_status;
-- DROP INDEX IF EXISTS public.idx_camera_sessions_device_status;
-- DROP INDEX IF EXISTS public.idx_camera_sessions_updated_at_stale;
-- DROP FUNCTION IF EXISTS public.cleanup_stale_camera_sessions();
--
-- viewer_update_answer_sdp 는 sql/fix_viewer_rls_v3.sql 의 V3 정의로 되돌릴 것.
-- (CREATE OR REPLACE 이므로 V3 SQL 을 다시 실행하면 원복됨)
--
-- start_device_broadcast 는 sql/fix_start_broadcast_home_id.sql 을 다시 실행하면
-- 원복됨 (CREATE OR REPLACE — cleanup PERFORM 블록만 빠진 상태로 돌아감).
