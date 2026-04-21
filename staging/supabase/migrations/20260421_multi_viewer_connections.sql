-- =============================================================================
-- 마이그레이션: Multi-Viewer 지원 — camera_viewer_connections 테이블 + RPC 8종
-- =============================================================================
-- 배경
--   현재 1방송폰 → 1뷰어(답자 SDP 를 camera_sessions.answer_sdp 에 직접 저장)
--   구조는 같은 home 의 여러 기기/사용자가 동시에 카메라를 시청할 수 없다.
--   (두 번째 뷰어가 붙으면 answer_sdp 를 덮어써 첫 뷰어가 끊김.)
--
--   Multi-Viewer 지원을 위해 "viewer 별 peer connection" 을 1행으로 보존하는
--   camera_viewer_connections 테이블을 신설하고, offer/answer SDP 와 ICE 후보를
--   viewer 단위로 격리한다. 동시 viewer 수는 상한 4명으로 제한해 방송폰 부하를
--   관리한다.
--
-- 해결 8단계
--   [1/8] camera_viewer_connections 테이블 + 인덱스 3개
--         - (session_id, status) / (home_id, status) / (last_ping_at) partial
--   [2/8] RLS 정책 — SELECT/INSERT/UPDATE (DELETE 는 DEFINER RPC 전용)
--   [3/8] ice_candidates.viewer_connection_id 컬럼 + partial 인덱스
--   [4/8] viewer_create_connection RPC — 뷰어가 offer 올리며 row UPSERT
--         · 동시 viewer 4명 상한 (30s 이내 ping 만 active 로 간주)
--   [5/8] broadcaster_get_viewer_connections RPC — 방송폰 폴링용
--         · 60s 이내 ping 한 pending/connected viewer 와 그 viewer_ice 반환
--   [6/8] broadcaster_set_viewer_answer RPC — 방송폰이 answer 올리고 connected 전환
--         · lock_timeout(3s) + FOR UPDATE NOWAIT — 기존 viewer_update_answer_sdp 패턴 답습
--   [7/8] ICE candidate RPC v2
--         · viewer_add_ice_candidate_v2(viewer_connection_id, candidate)
--         · add_device_ice_candidate_v2(token, viewer_connection_id, candidate)
--         · 기존 v1 함수는 유지 (호환) — 단일 viewer 경로 그대로 동작
--   [8/8] 유령 viewer 청소 + ANALYZE
--         · viewer_ping / broadcaster_close_viewer / cleanup_stale_viewer_connections
--
-- 안전성
--   - 신규 테이블/컬럼/함수 모두 IF NOT EXISTS / OR REPLACE 로 멱등 재실행 가능
--   - ice_candidates 기존 컬럼·인덱스·RLS 는 무변경 (viewer_connection_id NULL 허용)
--   - 기존 단일 viewer RPC (add_device_ice_candidate v1, viewer_add_ice_candidate v1,
--     viewer_update_answer_sdp) 는 전혀 건드리지 않음 → 점진 마이그레이션 가능
--   - DELETE 는 RLS 정책에서 제외 (SECURITY DEFINER cleanup RPC 로만 수행)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- [1/8] camera_viewer_connections 테이블 신설 + 쿼리 패턴별 인덱스 3개
-- -----------------------------------------------------------------------------
-- 한 session 에 여러 viewer row 가 붙는 구조. UNIQUE(session_id, viewer_user_id)
-- 로 "같은 사용자가 같은 session 재접속" 시 UPSERT 로 재협상한다.
CREATE TABLE IF NOT EXISTS public.camera_viewer_connections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES public.camera_sessions(id) ON DELETE CASCADE,
  viewer_user_id     UUID NOT NULL REFERENCES auth.users(id),
  home_id            UUID NOT NULL REFERENCES public.homes(id),
  offer_sdp          TEXT NOT NULL,                       -- 뷰어가 INSERT 시 올림
  answer_sdp         TEXT NULL,                           -- 방송폰이 나중에 UPDATE 로 채움
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','connected','closed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ping_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- viewer 가 주기적으로 갱신
  UNIQUE (session_id, viewer_user_id)
);

-- 쿼리: broadcaster 가 pending/connected viewer 조회 (WHERE session_id=X AND status IN ...)
CREATE INDEX IF NOT EXISTS idx_cvc_session_status
  ON public.camera_viewer_connections (session_id, status);

-- 쿼리: 홈 대시보드에서 home 별 활성 viewer 카운트/목록 조회
CREATE INDEX IF NOT EXISTS idx_cvc_home_status
  ON public.camera_viewer_connections (home_id, status);

-- 쿼리: cleanup_stale_viewer_connections 의 `WHERE last_ping_at < now() - 1 hour`
--   status 필터 없이 모든 row 대상이므로 partial WHERE 제거 — 전체 인덱스로 전환.
--   row 수 상한(세션당 ≤4 × 세션 수) 이 작아 full 인덱스 부담 미미.
CREATE INDEX IF NOT EXISTS idx_cvc_last_ping
  ON public.camera_viewer_connections (last_ping_at);


-- -----------------------------------------------------------------------------
-- [2/8] RLS — viewer 본인 + 같은 home 사용자 읽기/쓰기, DELETE 는 RPC 전용
-- -----------------------------------------------------------------------------
-- SELECT: 본인 row 또는 같은 home 사용자 (방송폰도 authenticated 사용자이면 접근 가능,
--         but 방송폰은 주로 DEFINER RPC 로 조회하므로 RLS 우회)
-- INSERT: 본인 row 만, 그리고 home_id 가 본인의 home 과 일치해야 함
-- UPDATE: SELECT 와 동일 (뷰어가 자기 offer 재전송, 방송폰측은 DEFINER RPC 사용)
-- DELETE: 정책 없음 — cleanup_stale_viewer_connections / broadcaster_close_viewer 전용
ALTER TABLE public.camera_viewer_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cvc_select ON public.camera_viewer_connections;
CREATE POLICY cvc_select ON public.camera_viewer_connections
  FOR SELECT USING (
    viewer_user_id = auth.uid()
    OR home_id IN (SELECT home_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS cvc_insert ON public.camera_viewer_connections;
CREATE POLICY cvc_insert ON public.camera_viewer_connections
  FOR INSERT WITH CHECK (
    viewer_user_id = auth.uid()
    AND home_id IN (SELECT home_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS cvc_update ON public.camera_viewer_connections;
CREATE POLICY cvc_update ON public.camera_viewer_connections
  FOR UPDATE USING (
    viewer_user_id = auth.uid()
    OR home_id IN (SELECT home_id FROM public.profiles WHERE id = auth.uid())
  );


-- -----------------------------------------------------------------------------
-- [3/8] ice_candidates.viewer_connection_id 컬럼 추가 + partial 인덱스
-- -----------------------------------------------------------------------------
-- v2 RPC 경로에서는 ICE 후보를 viewer_connection_id 로 바인딩한다.
-- v1 경로는 NULL 로 남으며 기존 쿼리(session_id, sender) 그대로 동작.
ALTER TABLE public.ice_candidates
  ADD COLUMN IF NOT EXISTS viewer_connection_id UUID
  REFERENCES public.camera_viewer_connections(id) ON DELETE CASCADE;

-- 새 쿼리 패턴: WHERE viewer_connection_id = X AND sender = 'viewer'
-- NULL row 는 인덱스에서 제외 → 인덱스 크기 최소화
CREATE INDEX IF NOT EXISTS idx_ice_candidates_viewer_connection
  ON public.ice_candidates (viewer_connection_id)
  WHERE viewer_connection_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- [4/8] viewer_create_connection RPC — 뷰어가 offer 올리며 row UPSERT
-- -----------------------------------------------------------------------------
-- 1) 로그인 사용자 home_id 조회 + session 의 home_id 와 일치 검증
-- 2) 동시 viewer 수 상한 4명 — 30초 이내 ping 한 본인 외 연결만 카운트
-- 3) UPSERT — 같은 (session_id, viewer_user_id) 재접속 시 offer 갱신 + answer 초기화
-- 반환: {viewer_connection_id, session_id} 또는 {error}
CREATE OR REPLACE FUNCTION public.viewer_create_connection(
  p_session_id UUID,
  p_offer_sdp TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_user_home_id    UUID;
  v_session_home_id UUID;
  v_active_count    INTEGER;
  v_connection_id   UUID;
BEGIN
  -- (1) 로그인 사용자 home_id
  SELECT home_id INTO v_user_home_id FROM public.profiles WHERE id = auth.uid();
  IF v_user_home_id IS NULL THEN
    RETURN json_build_object('error', 'unauthorized');
  END IF;

  -- 세션 소유권 (같은 home 안의 session 만 접근 가능)
  SELECT home_id INTO v_session_home_id
  FROM public.camera_sessions WHERE id = p_session_id;
  IF v_session_home_id IS NULL OR v_session_home_id != v_user_home_id THEN
    RETURN json_build_object('error', 'session_not_found');
  END IF;

  -- (2) 동시 viewer 상한 4명 (소프트 상한) — 30초 이내 ping 한 "본인 외" 연결만 카운트
  --     본인은 UPSERT 대상이므로 카운트에서 제외해 재접속이 막히지 않게 한다.
  --     "본인 외 >= 4" 이면 거절 → 새 접속 포함 5명째 차단 = 최대 4명 보장.
  --
  --     *30s 임계값 이유*: 거의 확실히 살아있는 연결만 상한 체크에 반영.
  --       방송폰 조회(60s)보다 엄격 — 거의 끊긴 좀비 viewer 가 상한을 점유해
  --       신규 가족 구성원 접속을 막는 현상 방지.
  --
  --     *race condition 소프트 용인*: SELECT COUNT 와 INSERT 사이에 동시 요청이
  --       들어오면 순간적으로 5명까지 허용될 수 있다 (row 락 없이 count 하므로).
  --       가족 4인 환경에서 동시 접속 race 는 극히 드물고, 다음 폴링 사이클에
  --       ping 만료(30s)로 자연 수렴. 엄격 보장 필요 시 향후 LOCK TABLE ... SHARE
  --       ROW EXCLUSIVE 추가 가능.
  SELECT COUNT(*) INTO v_active_count
  FROM public.camera_viewer_connections
  WHERE session_id = p_session_id
    AND status IN ('pending','connected')
    AND last_ping_at > now() - interval '30 seconds'
    AND viewer_user_id != auth.uid();
  IF v_active_count >= 4 THEN
    RETURN json_build_object('error', 'too_many_viewers');
  END IF;

  -- (3) UPSERT — 재접속 시 offer 갱신, answer/상태 초기화
  INSERT INTO public.camera_viewer_connections
    (session_id, viewer_user_id, home_id, offer_sdp, status, last_ping_at)
  VALUES
    (p_session_id, auth.uid(), v_user_home_id, p_offer_sdp, 'pending', now())
  ON CONFLICT (session_id, viewer_user_id)
  DO UPDATE SET
    offer_sdp    = EXCLUDED.offer_sdp,
    answer_sdp   = NULL,              -- 재협상 시 answer 초기화
    status       = 'pending',
    last_ping_at = now(),
    updated_at   = now()
  RETURNING id INTO v_connection_id;

  RETURN json_build_object(
    'viewer_connection_id', v_connection_id,
    'session_id', p_session_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.viewer_create_connection(UUID, TEXT) TO authenticated;


-- -----------------------------------------------------------------------------
-- [5/8] broadcaster_get_viewer_connections RPC — 방송폰 폴링용
-- -----------------------------------------------------------------------------
-- 방송폰 device_token 으로 device 검증 → session_id 의 device 소유권 확인 →
-- 해당 session 의 pending/connected viewer 중 60초 이내 ping 한 것만 반환.
-- 각 viewer 마다 answer/상태 + viewer 측 ICE 후보 배열을 함께 돌려준다.
--
-- *권장 폴링 주기*: Realtime channel 기반이 1순위, 폴링은 fallback 으로 2초 간격.
--   뷰어 4명 × ICE 평균 20개 = 80 rows 집계 → 400ms 이하 폴링 시 json_agg 부하로
--   statement_timeout 위험. R2 Dev 는 Realtime postgres_changes 구독을 기본으로 하고
--   폴링은 구독 단절 감지 시 2s interval 으로만 사용할 것.
CREATE OR REPLACE FUNCTION public.broadcaster_get_viewer_connections(
  input_device_token TEXT,
  input_session_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_device_id         UUID;
  v_session_device_id UUID;
  v_result            JSON;
BEGIN
  -- device_token 검증
  SELECT id INTO v_device_id
  FROM public.camera_devices
  WHERE device_token = input_device_token::UUID
    AND is_paired = true;
  IF v_device_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  -- 세션이 이 device 소유인지 확인
  SELECT device_id INTO v_session_device_id
  FROM public.camera_sessions WHERE id = input_session_id;
  IF v_session_device_id IS NULL OR v_session_device_id != v_device_id THEN
    RETURN json_build_object('error', 'session_not_found');
  END IF;

  -- viewer 목록 + 각 viewer 의 ICE 후보를 한 번에 집계
  SELECT json_build_object(
    'viewers', COALESCE(json_agg(
      json_build_object(
        'viewer_connection_id', cvc.id,
        'offer_sdp',  cvc.offer_sdp,
        'answer_sdp', cvc.answer_sdp,
        'status',     cvc.status,
        'viewer_ice', COALESCE((
          SELECT json_agg(json_build_object('id', ic.id, 'candidate', ic.candidate))
          FROM public.ice_candidates ic
          WHERE ic.viewer_connection_id = cvc.id
            AND ic.sender = 'viewer'
        ), '[]'::json)
      )
      ORDER BY cvc.created_at
    ), '[]'::json)
  ) INTO v_result
  FROM public.camera_viewer_connections cvc
  WHERE cvc.session_id = input_session_id
    AND cvc.status IN ('pending','connected')
    AND cvc.last_ping_at > now() - interval '60 seconds';

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.broadcaster_get_viewer_connections(TEXT, UUID) TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- [6/8] broadcaster_set_viewer_answer RPC — 방송폰이 answer 올림
-- -----------------------------------------------------------------------------
-- 잠금 대기 사고를 피하려 lock_timeout(3s) + FOR UPDATE NOWAIT 를 선행 적용.
-- (viewer_update_answer_sdp 에서 검증된 패턴 — 55P03 전파로 클라이언트 retry 유도)
CREATE OR REPLACE FUNCTION public.broadcaster_set_viewer_answer(
  input_device_token TEXT,
  input_viewer_connection_id UUID,
  input_answer_sdp TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_device_id         UUID;
  v_session_device_id UUID;
BEGIN
  -- (a) 트랜잭션 한정 lock 대기 한계 — 3초 초과 시 lock_not_available
  SET LOCAL lock_timeout = '3s';

  -- device_token 검증
  SELECT id INTO v_device_id
  FROM public.camera_devices
  WHERE device_token = input_device_token::UUID
    AND is_paired = true;
  IF v_device_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  -- (b) 해당 viewer connection 의 session 이 이 device 소유인지 검증 + 잠금 즉시 시도
  SELECT cs.device_id INTO v_session_device_id
  FROM public.camera_viewer_connections cvc
  JOIN public.camera_sessions cs ON cs.id = cvc.session_id
  WHERE cvc.id = input_viewer_connection_id
  FOR UPDATE NOWAIT;

  IF v_session_device_id IS NULL OR v_session_device_id != v_device_id THEN
    RETURN json_build_object('error', 'connection_not_found');
  END IF;

  -- answer 저장 + status='connected' 전환
  UPDATE public.camera_viewer_connections
  SET answer_sdp = input_answer_sdp,
      status     = 'connected',
      updated_at = now()
  WHERE id = input_viewer_connection_id;

  RETURN json_build_object('success', true);

EXCEPTION
  -- (c) 잠금 실패(NOWAIT 즉시 실패 / lock_timeout 초과 모두 55P03) → 그대로 전파
  WHEN lock_not_available THEN
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.broadcaster_set_viewer_answer(TEXT, UUID, TEXT) TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- [7/8] ICE candidate RPC v2 — viewer_connection 단위로 ICE 후보 바인딩
-- -----------------------------------------------------------------------------
-- 기존 v1 함수(viewer_add_ice_candidate / add_device_ice_candidate)는 유지.
-- v2 는 새 함수명으로 별도 추가해 호환성 유지.

-- 7-A. viewer 측 — 뷰어가 자기 connection 에 ICE 후보 추가
CREATE OR REPLACE FUNCTION public.viewer_add_ice_candidate_v2(
  p_viewer_connection_id UUID,
  p_candidate JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_session_id         UUID;
  v_connection_user_id UUID;
  v_ice_id             UUID;
BEGIN
  -- connection 존재 및 소유자 확인
  SELECT session_id, viewer_user_id
    INTO v_session_id, v_connection_user_id
  FROM public.camera_viewer_connections
  WHERE id = p_viewer_connection_id;

  IF v_session_id IS NULL THEN
    RETURN json_build_object('error', 'connection_not_found');
  END IF;
  IF v_connection_user_id != auth.uid() THEN
    RETURN json_build_object('error', 'unauthorized');
  END IF;

  -- session_id 도 함께 기록 (기존 인덱스/쿼리와의 호환을 위해)
  INSERT INTO public.ice_candidates (session_id, viewer_connection_id, sender, candidate)
  VALUES (v_session_id, p_viewer_connection_id, 'viewer', p_candidate)
  RETURNING id INTO v_ice_id;

  RETURN json_build_object('id', v_ice_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.viewer_add_ice_candidate_v2(UUID, JSONB) TO authenticated;


-- 7-B. broadcaster 측 — 방송폰이 특정 viewer connection 에 ICE 후보 추가
CREATE OR REPLACE FUNCTION public.add_device_ice_candidate_v2(
  input_device_token TEXT,
  input_viewer_connection_id UUID,
  input_candidate JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_device_id         UUID;
  v_session_id        UUID;
  v_session_device_id UUID;
  v_ice_id            UUID;
BEGIN
  -- device_token 검증
  SELECT id INTO v_device_id
  FROM public.camera_devices
  WHERE device_token = input_device_token::UUID
    AND is_paired = true;
  IF v_device_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  -- connection 의 session 이 이 device 소유인지 확인
  SELECT cvc.session_id, cs.device_id
    INTO v_session_id, v_session_device_id
  FROM public.camera_viewer_connections cvc
  JOIN public.camera_sessions cs ON cs.id = cvc.session_id
  WHERE cvc.id = input_viewer_connection_id;

  IF v_session_device_id IS NULL OR v_session_device_id != v_device_id THEN
    RETURN json_build_object('error', 'connection_not_found');
  END IF;

  INSERT INTO public.ice_candidates (session_id, viewer_connection_id, sender, candidate)
  VALUES (v_session_id, input_viewer_connection_id, 'broadcaster', input_candidate)
  RETURNING id INTO v_ice_id;

  RETURN json_build_object('id', v_ice_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_device_ice_candidate_v2(TEXT, UUID, JSONB) TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- [8/8] 유령 viewer 청소 + ANALYZE
-- -----------------------------------------------------------------------------

-- 8-A. viewer_ping — 뷰어가 주기적으로 호출해 last_ping_at 갱신
--      (방송폰 측은 60s 이내 ping 한 것만 active 로 간주)
CREATE OR REPLACE FUNCTION public.viewer_ping(
  p_viewer_connection_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
BEGIN
  UPDATE public.camera_viewer_connections
  SET last_ping_at = now()
  WHERE id = p_viewer_connection_id
    AND viewer_user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'connection_not_found');
  END IF;
  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.viewer_ping(UUID) TO authenticated;


-- 8-B. broadcaster_close_viewer — 방송폰이 특정 viewer 연결을 closed 로 전환
CREATE OR REPLACE FUNCTION public.broadcaster_close_viewer(
  input_device_token TEXT,
  input_viewer_connection_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_device_id         UUID;
  v_session_device_id UUID;
BEGIN
  SELECT id INTO v_device_id
  FROM public.camera_devices
  WHERE device_token = input_device_token::UUID
    AND is_paired = true;
  IF v_device_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_device');
  END IF;

  SELECT cs.device_id INTO v_session_device_id
  FROM public.camera_viewer_connections cvc
  JOIN public.camera_sessions cs ON cs.id = cvc.session_id
  WHERE cvc.id = input_viewer_connection_id;

  IF v_session_device_id IS NULL OR v_session_device_id != v_device_id THEN
    RETURN json_build_object('error', 'connection_not_found');
  END IF;

  UPDATE public.camera_viewer_connections
  SET status = 'closed', updated_at = now()
  WHERE id = input_viewer_connection_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.broadcaster_close_viewer(TEXT, UUID) TO anon, authenticated;


-- 8-C. cleanup_stale_viewer_connections — 1시간 이상 ping 없는 row 삭제
--      viewer 세션 수명 최대 1시간 가정. pg_cron 또는 start_device_broadcast 에서 호출.
CREATE OR REPLACE FUNCTION public.cleanup_stale_viewer_connections()
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.camera_viewer_connections
  WHERE last_ping_at < now() - interval '1 hour';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN json_build_object('deleted', v_deleted, 'cleaned_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_stale_viewer_connections() TO authenticated;


-- -----------------------------------------------------------------------------
-- 8-D. start_device_broadcast — viewer cleanup inline 호출 추가
-- -----------------------------------------------------------------------------
-- 선행 마이그 20260421_camera_sessions_indexes_and_cleanup.sql 의 [6/7] 패턴을
-- 그대로 답습한다. 거기서 cleanup_stale_camera_sessions() PERFORM 을 이미 걸어
-- 두었고, 이번에 cleanup_stale_viewer_connections() 를 **같은 BEGIN...EXCEPTION
-- 블록** 안에 함께 묶어 추가한다. 단일 EXCEPTION 으로 한 번에 감싸야 첫 cleanup
-- 실패 시에도 두 번째 cleanup 이 시도된다 (단일 try/catch 는 첫 에러에서 중단되지만,
-- plpgsql 의 BEGIN...EXCEPTION 블록은 블록 전체를 catch 하므로 둘 다 시도하려면
-- 각각 작은 블록으로 감싸는 편이 더 안전 — 아래처럼 둘 다 PERFORM 을 하나씩 감쌈).
--
-- 본문 나머지는 sql/fix_start_broadcast_home_id.sql + 선행 마이그 [6/7] 과 100% 일치.
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
  -- [신규 — 선행 마이그에서 추가됨] stale 카메라 세션 정리. 실패 무시.
  BEGIN
    PERFORM public.cleanup_stale_camera_sessions();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- [신규 — 이번 마이그에서 추가됨] stale viewer 연결 정리. 실패 무시.
  BEGIN
    PERFORM public.cleanup_stale_viewer_connections();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- [이하 원본 본문 — sql/fix_start_broadcast_home_id.sql] device 검증
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

  -- 반환값: session_id + home_id (선행 마이그와 동일)
  RETURN json_build_object('session_id', v_session_id, 'home_id', v_device.home_id);
END;
$$;


-- 8-E. ANALYZE — planner 가 새 테이블/인덱스 통계 즉시 활용
ANALYZE public.camera_viewer_connections;
ANALYZE public.ice_candidates;


-- =============================================================================
-- 롤백 (참조용 — 실행하지 마세요)
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.cleanup_stale_viewer_connections();
-- DROP FUNCTION IF EXISTS public.broadcaster_close_viewer(TEXT, UUID);
-- DROP FUNCTION IF EXISTS public.viewer_ping(UUID);
-- DROP FUNCTION IF EXISTS public.add_device_ice_candidate_v2(TEXT, UUID, JSONB);
-- DROP FUNCTION IF EXISTS public.viewer_add_ice_candidate_v2(UUID, JSONB);
-- DROP FUNCTION IF EXISTS public.broadcaster_set_viewer_answer(TEXT, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.broadcaster_get_viewer_connections(TEXT, UUID);
-- DROP FUNCTION IF EXISTS public.viewer_create_connection(UUID, TEXT);
--
-- start_device_broadcast 는 sql/fix_start_broadcast_home_id.sql 재실행으로 원복.
-- (선행 마이그 + 본 마이그의 CREATE OR REPLACE 를 연속 적용한 상태에서 원본으로 복귀)
--
-- DROP INDEX IF EXISTS public.idx_ice_candidates_viewer_connection;
-- ALTER TABLE public.ice_candidates DROP COLUMN IF EXISTS viewer_connection_id;
--
-- DROP TABLE IF EXISTS public.camera_viewer_connections CASCADE;
--   (테이블 DROP 시 FK · 인덱스 · RLS 정책 모두 자동 제거됨)
