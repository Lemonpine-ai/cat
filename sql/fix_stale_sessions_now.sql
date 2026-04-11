-- ============================================================================
-- 스테일 live 세션 정리
-- 삭제된 기기의 세션이 live 상태로 남아서 대시보드가 무한 재시도하는 문제 수정.
-- Supabase Dashboard → SQL Editor 에서 실행하세요.
-- ============================================================================

-- 1. 현재 상태 진단 (실행 결과 확인용)
SELECT
  cs.id AS session_id,
  cs.status,
  cs.device_id,
  cs.home_id,
  cd.device_name,
  cd.is_paired,
  cd.is_active,
  CASE WHEN cd.id IS NULL THEN '❌ 기기 삭제됨 (고아 세션)' ELSE '✅ 기기 존재' END AS device_status,
  CASE WHEN cs.offer_sdp IS NOT NULL THEN '있음' ELSE '없음' END AS offer,
  CASE WHEN cs.answer_sdp IS NOT NULL THEN '있음' ELSE '없음' END AS answer,
  cs.updated_at
FROM camera_sessions cs
LEFT JOIN camera_devices cd ON cd.id = cs.device_id
WHERE cs.status = 'live'
ORDER BY cs.updated_at DESC;

-- 2. 고아 세션 정리 (기기가 삭제된 세션 → idle 처리)
UPDATE camera_sessions
SET status = 'idle', updated_at = NOW()
WHERE status = 'live'
  AND device_id NOT IN (SELECT id FROM camera_devices);

-- 3. 비활성 기기의 live 세션도 idle 처리
UPDATE camera_sessions
SET status = 'idle', updated_at = NOW()
WHERE status = 'live'
  AND device_id IN (
    SELECT id FROM camera_devices WHERE is_active = false
  );

-- 4. 고아 ICE candidates 정리
DELETE FROM ice_candidates
WHERE session_id IN (
  SELECT cs.id FROM camera_sessions cs
  LEFT JOIN camera_devices cd ON cd.id = cs.device_id
  WHERE cd.id IS NULL
);

-- 5. 정리 후 상태 확인
SELECT
  cs.id AS session_id,
  cs.status,
  cd.device_name,
  cd.is_active
FROM camera_sessions cs
LEFT JOIN camera_devices cd ON cd.id = cs.device_id
WHERE cs.status = 'live'
ORDER BY cs.updated_at DESC;
