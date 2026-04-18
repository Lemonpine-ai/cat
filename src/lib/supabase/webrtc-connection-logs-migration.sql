-- webrtc_connection_logs 테이블 — WebRTC 연결 이벤트 로그
-- 각 카메라/뷰어의 연결/재연결/실패 이벤트를 기록하여
-- 네트워크 품질 추적·장애 사후 분석에 사용합니다.

CREATE TABLE IF NOT EXISTS public.webrtc_connection_logs (
  id                  BIGSERIAL PRIMARY KEY,
  home_id             UUID        NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  device_id           TEXT        NOT NULL,
  camera_id           TEXT,
  role                TEXT        NOT NULL,                       -- viewer_slot | viewer_live | broadcaster
  event_type          TEXT        NOT NULL,                       -- connected | disconnected | ice_restart | ...
  pc_state            TEXT,                                        -- RTCPeerConnectionState (nullable)
  error_message       TEXT,
  reconnect_attempt   INTEGER     NOT NULL DEFAULT 0,
  metadata            JSONB,                                       -- ua, connection, delayMs 등 자유 필드
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스: 홈별 최근 로그 조회 (대시보드·디버깅)
CREATE INDEX IF NOT EXISTS idx_webrtc_logs_home_time
  ON public.webrtc_connection_logs (home_id, created_at DESC);

-- 인덱스: 카메라별 로그 조회
CREATE INDEX IF NOT EXISTS idx_webrtc_logs_camera_time
  ON public.webrtc_connection_logs (camera_id, created_at DESC);

-- 인덱스: 이벤트 타입별 조회 (failed/error 필터링)
CREATE INDEX IF NOT EXISTS idx_webrtc_logs_event
  ON public.webrtc_connection_logs (event_type, created_at DESC);

-- RLS 활성화
ALTER TABLE public.webrtc_connection_logs ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 본인 home 의 로그만 SELECT (zone_events 패턴 참고)
CREATE POLICY "own_home_webrtc_logs_select"
  ON public.webrtc_connection_logs
  FOR SELECT
  USING (
    home_id IN (
      SELECT id FROM public.homes WHERE owner_id = auth.uid()
    )
  );

-- RLS 정책: 본인 home 의 로그만 INSERT
CREATE POLICY "own_home_webrtc_logs_insert"
  ON public.webrtc_connection_logs
  FOR INSERT
  WITH CHECK (
    home_id IN (
      SELECT id FROM public.homes WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
-- broadcaster 전용 로그 RPC (SECURITY DEFINER)
-- broadcaster 는 anon 세션(device_token 기반)이라 auth.uid()=null.
-- 위 INSERT 정책으로는 RLS 에 막히므로, device_token 검증 후
-- SECURITY DEFINER 로 우회해 INSERT 한다.
-- device_token 유효성 검증 패턴은 camera_system_complete.sql 의
-- start_device_broadcast / get_device_home_env_timestamps 와 동일.
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_device_webrtc_event(
  p_device_token   TEXT,
  p_camera_id      TEXT,
  p_event_type     TEXT,
  p_pc_state       TEXT,
  p_error_message  TEXT,
  p_reconnect_attempt INTEGER,
  p_metadata       JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id UUID;
  v_home_id   UUID;
BEGIN
  -- device_token 으로 device + home 조회 (컬럼 타입은 UUID)
  SELECT id, home_id INTO v_device_id, v_home_id
  FROM public.camera_devices
  WHERE device_token = p_device_token::UUID;

  IF v_device_id IS NULL THEN
    RAISE EXCEPTION 'invalid device_token';
  END IF;

  INSERT INTO public.webrtc_connection_logs (
    home_id, device_id, camera_id, role, event_type, pc_state,
    error_message, reconnect_attempt, metadata
  ) VALUES (
    v_home_id,
    v_device_id::TEXT,
    p_camera_id,
    'broadcaster',
    p_event_type,
    p_pc_state,
    p_error_message,
    COALESCE(p_reconnect_attempt, 0),
    p_metadata
  );
END;
$$;

-- anon/authenticated 모두 호출 허용 (SECURITY DEFINER 로 내부 RLS 우회)
GRANT EXECUTE ON FUNCTION public.log_device_webrtc_event(
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB
) TO anon, authenticated;
