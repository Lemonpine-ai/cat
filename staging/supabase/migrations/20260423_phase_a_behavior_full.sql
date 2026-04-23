-- ============================================================================
-- Phase A 마이그레이션: behavior 클래스 매핑 + metadata + user_label + Phase E 뼈대
-- ----------------------------------------------------------------------------
-- 변경 요약
--  (1) cat_behavior_events 컬럼 추가:
--      - metadata JSONB DEFAULT '{}'   : top2_class / top2_confidence / bbox_area_ratio / model_version
--      - user_label TEXT NULL          : NULL | correct | human | shadow | other_animal | reclassified:<class>
--      - snapshot_url TEXT NULL        : Phase E 에서 사용
--      - labeled_at TIMESTAMPTZ NULL   : 라벨 수정 시각
--      - labeled_by UUID NULL          : 라벨 수정한 사용자
--  (2) behavior_class CHECK constraint 신설 (12 클래스 화이트리스트)
--  (3) user_label partial index (라벨링 UI 빠른 조회)
--  (4) cat_behavior_events_archive 빈 테이블 (Phase E 노이즈/구버전 row 이관)
--  (5) cat_behavior_label_history 빈 테이블 (Phase D audit log)
--  (6) Storage bucket "behavior-snapshots" (Phase E private)
--  (7) update_behavior_user_label RPC (Phase D 라벨링)
--  (8) export_behavior_dataset RPC (Phase E metadata-only export)
-- ============================================================================
-- ⚠️ 주의: cat_behavior_events 는 home_id 컬럼을 직접 보유 (cats join 불필요).
--   기존 RLS 정책은 home_id 기반 (homes.owner_id = auth.uid()).
--   본 마이그레이션의 RPC 도 같은 권한 모델을 따른다.
-- ============================================================================

-- ⚠️ R7 추가 (R59): 부분 실패 방지 — 전체 마이그를 하나의 트랜잭션으로 묶음.
--   도중 에러 시 전체 ROLLBACK 되어 "컬럼만 추가되고 RPC 는 실패" 같은 부분 적용
--   상태를 원천 차단. storage.buckets / storage.objects 는 일반 public 스키마
--   테이블이라 트랜잭션 안에서도 정상 동작 (자체 트랜잭션 아님).
--   CREATE OR REPLACE FUNCTION, ALTER TABLE, INSERT ON CONFLICT 모두 트랜잭션
--   내부에서 안전함.
BEGIN;

-- ----------------------------------------------------------------------------
-- (0) 12 클래스 화이트리스트 helper — 단일 진실 원천 (R7 추가)
-- ----------------------------------------------------------------------------
-- ⚠️ R7 추가 (R60): 12 클래스 화이트리스트 단일 진실 원천.
--   기존 4곳(CHECK constraint, update RPC, export RPC ×2)에서 중복 하드코딩됐던 것을
--   단일 함수로 통합. 향후 클래스 추가 시 이 함수만 수정하면 일관 적용.
--   IMMUTABLE 로 선언 → optimizer 가 상수 폴딩/인덱스 활용 가능.
CREATE OR REPLACE FUNCTION public.is_valid_behavior_class(p_class TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_class IN (
    'eating','drinking','grooming','sleeping','playing',
    'walking','running','sitting','standing','scratching',
    'elimination','other'
  );
$$;

-- ⚠️ R8 추가 (R71): is_valid_behavior_class 가 CHECK constraint / RPC 본문에서 호출되므로
--   authenticated + anon role 양쪽에 EXECUTE 권한 명시. 기본 PUBLIC EXECUTE 가 막혀
--   있을 수 있는 환경(예: REVOKE EXECUTE ON ALL FUNCTIONS FROM PUBLIC 운영 정책) 대비.
--   IMMUTABLE SQL 함수라 부수효과 없음 → 양 role 노출 안전.
GRANT EXECUTE ON FUNCTION public.is_valid_behavior_class(TEXT) TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- (1) cat_behavior_events 컬럼 추가 (멱등 — 재실행 안전)
-- ----------------------------------------------------------------------------
-- ⚠️ R6 메모 (R53): cat_id 컬럼 자체는 src/ 마이그에서 이미 정의됨.
--   src/lib/supabase/cat-behavior-events-migration.sql 의 ON DELETE 정책 확인 필수:
--   - ON DELETE CASCADE 면: cat 삭제 시 events 전부 삭제 → 통계 무너짐
--   - ON DELETE RESTRICT 면: cat 삭제 차단
--   현재 가정: ON DELETE CASCADE (cat 삭제 = 모든 데이터 정리). Phase A 안 변경 없음.
ALTER TABLE public.cat_behavior_events
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS user_label TEXT NULL,
  ADD COLUMN IF NOT EXISTS snapshot_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS labeled_at TIMESTAMPTZ NULL,
  -- ⚠️ R6 변경 (R53): 사용자 탈퇴 시 audit log 보존을 위해 ON DELETE SET NULL.
  --   ON DELETE 절은 아래 별도 ALTER 블록(R6 보강 ISSUE-1)에서 강제 갱신.
  ADD COLUMN IF NOT EXISTS labeled_by UUID NULL REFERENCES auth.users(id);

-- ⚠️ R6 보강 (ISSUE-1): FK 정책을 별도 ALTER 로 강제 갱신.
--   ADD COLUMN IF NOT EXISTS 는 두 번째 실행 시 컬럼이 이미 있으면 ALTER 절 자체를
--   스킵하므로 ON DELETE 정책 변경이 silent drift. DROP+ADD CONSTRAINT 패턴으로
--   재실행 안전성 확보 (사용자 탈퇴 시 audit 보존).
ALTER TABLE public.cat_behavior_events
  DROP CONSTRAINT IF EXISTS cat_behavior_events_labeled_by_fkey;
ALTER TABLE public.cat_behavior_events
  ADD CONSTRAINT cat_behavior_events_labeled_by_fkey
    FOREIGN KEY (labeled_by) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cat_behavior_events.metadata IS
  'JSONB 부가 메타: { top2_class, top2_confidence, bbox_area_ratio, model_version }';
COMMENT ON COLUMN public.cat_behavior_events.user_label IS
  'NULL | correct | human | shadow | other_animal | reclassified:<12 클래스 중 하나>';
COMMENT ON COLUMN public.cat_behavior_events.snapshot_url IS
  'Phase E 에서 사용. 지금은 항상 NULL.';
COMMENT ON COLUMN public.cat_behavior_events.labeled_at IS
  '집사가 라벨 수정한 시각 (audit 용).';
COMMENT ON COLUMN public.cat_behavior_events.labeled_by IS
  '집사가 라벨 수정한 사용자 id (auth.users 참조).';

-- ----------------------------------------------------------------------------
-- (2) behavior_class CHECK constraint — 12 클래스 강제 (NOT VALID 모드)
-- ----------------------------------------------------------------------------
-- ⚠️ R5 추가 (R37 운영 함정): 본 블록을 두 번째 실행하면 DROP CONSTRAINT → ADD ... NOT VALID
--   순서로 인해 constraint 가 다시 unvalidated 상태로 회귀한다.
--   재실행 후에는 반드시 20260423_phase_a_validate_after_cleanup.sql 을 다시 한 번
--   apply_migration 으로 돌려야 신규 INSERT 외 기존 row 도 12 클래스로 강제됨.
-- ⚠️ R2 변경 (REJECT-1 대응):
--   - NOT VALID 옵션으로 추가 → 기존 row(구 클래스 arch/walk_run 등) 검증 스킵.
--   - 신규 INSERT/UPDATE 만 12 클래스 화이트리스트로 검증.
--   - 기존 row cleanup 후 별도 마이그레이션
--     (20260423_phase_a_validate_after_cleanup.sql) 으로 VALIDATE CONSTRAINT 실행.
--   - 데이터 마이그레이션(구→신 매핑) 또는 archive 이관은 사장님 결정.
ALTER TABLE public.cat_behavior_events
  DROP CONSTRAINT IF EXISTS cat_behavior_events_behavior_class_check;
-- ⚠️ R7 변경 (R60): 하드코딩 12 클래스 → is_valid_behavior_class() 단일 진실 원천.
ALTER TABLE public.cat_behavior_events
  ADD CONSTRAINT cat_behavior_events_behavior_class_check
  CHECK (public.is_valid_behavior_class(behavior_class)) NOT VALID;

-- ----------------------------------------------------------------------------
-- (3) user_label partial index — Phase D 라벨링 UI 빠른 조회용
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cat_behavior_events_user_label
  ON public.cat_behavior_events(user_label)
  WHERE user_label IS NOT NULL;

-- ----------------------------------------------------------------------------
-- (4) Archive 빈 테이블 — Phase E 에서 노이즈/구버전 row 이관 대상
-- ----------------------------------------------------------------------------
-- LIKE INCLUDING ALL 로 cat_behavior_events 와 동일 스키마 + 기본값/제약/인덱스 복사.
-- 단, FK/RLS 는 별도 처리 필요 (현재 Phase A 에서는 비어있음 → 무시).
CREATE TABLE IF NOT EXISTS public.cat_behavior_events_archive (
  LIKE public.cat_behavior_events INCLUDING ALL
);
COMMENT ON TABLE public.cat_behavior_events_archive IS
  'Phase E 에서 노이즈 row + 구 모델 v1 row 이관 대상. 지금은 비어있음.';

-- ⚠️ R3 추가 (Issue A): LIKE INCLUDING ALL 은 RLS policy 미복사. archive 테이블이
--   RLS 비활성 상태로 만들어지므로 방어적 DENY ALL 정책 명시. Phase E 에서
--   정식 policy 추가 시 DROP & RECREATE.
ALTER TABLE public.cat_behavior_events_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all ON public.cat_behavior_events_archive;
-- ⚠️ R7 변경 (ISSUE-4): TO authenticated → TO public
--   TO public 은 anon + authenticated 양쪽을 모두 포함. anon role 도 명시적 차단하여
--   서비스 롤 이외에는 절대 접근 불가하도록 방어 범위 확대.
CREATE POLICY deny_all ON public.cat_behavior_events_archive
  FOR ALL TO public USING (false) WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- (5) Audit history 빈 테이블 — Phase D update_behavior_user_label 가 INSERT
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cat_behavior_label_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ⚠️ R4 변경 (Issue F): Phase E 가 cat_behavior_events row 를 archive 로 MOVE
  --   (DELETE + INSERT) 할 때 ON DELETE CASCADE 였다면 history 도 함께 손실.
  --   audit log 보존 우선 → ON DELETE SET NULL + NULL 허용.
  --   Phase E 이관 시 별도 컬럼 archived_event_id 로 추적 권장.
  event_id UUID NULL REFERENCES public.cat_behavior_events(id) ON DELETE SET NULL,
  old_label TEXT NULL,
  new_label TEXT NULL,
  labeled_by UUID NULL REFERENCES auth.users(id),
  labeled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cbeh_event_id
  ON public.cat_behavior_label_history(event_id);

-- ⚠️ R6 보강 (ISSUE-1): cat_behavior_label_history.event_id FK 정책 강제 갱신.
--   CREATE TABLE IF NOT EXISTS 는 두 번째 실행 시 컬럼 정의 무시. 별도 ALTER 로
--   ON DELETE SET NULL 정책을 멱등 안전하게 보장 (Phase E archive 이관 시 audit 보존).
ALTER TABLE public.cat_behavior_label_history
  DROP CONSTRAINT IF EXISTS cat_behavior_label_history_event_id_fkey;
ALTER TABLE public.cat_behavior_label_history
  ADD CONSTRAINT cat_behavior_label_history_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.cat_behavior_events(id) ON DELETE SET NULL;

COMMENT ON TABLE public.cat_behavior_label_history IS
  '집사 라벨 수정 audit log. 변경 전/후 라벨 + 시각 + 사용자 기록.
   ⚠️ DENY ALL RLS 적용 — TS 클라이언트가 .from("cat_behavior_label_history").select() 직접 호출 시 빈 배열 반환됨.
   조회는 반드시 SECURITY DEFINER RPC (예: get_label_history_for_event, Phase D 신설 예정) 경유.';

-- ⚠️ R4 추가 (Issue E): cat_behavior_label_history 도 archive 와 동일한
--   방어 패턴. RLS ENABLE + DENY ALL — SECURITY DEFINER RPC 만 INSERT/SELECT.
--   Phase D 라벨 이력 조회 UI 가 필요하면 별도 RPC (get_label_history_for_event) 신설.
ALTER TABLE public.cat_behavior_label_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_history ON public.cat_behavior_label_history;
-- ⚠️ R7 변경 (ISSUE-4): TO authenticated → TO public
--   TO public 은 anon + authenticated 양쪽을 모두 포함. anon role 도 명시적 차단하여
--   audit log 의 읽기/쓰기 모두 SECURITY DEFINER RPC 경유만 허용.
CREATE POLICY deny_all_history ON public.cat_behavior_label_history
  FOR ALL TO public USING (false) WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- (6) Storage bucket — Phase E snapshot 저장용 (private)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('behavior-snapshots', 'behavior-snapshots', false)
ON CONFLICT (id) DO NOTHING;

-- ⚠️ R6 추가 (R51 CRITICAL): behavior-snapshots bucket 의 storage.objects 에
--   policy 0개 → Phase E 진입 시 authenticated 가 다른 home 의 snapshot 무차별
--   접근 가능. 방어적 DENY ALL placeholder. Phase E 에서 owner-only SELECT/INSERT
--   policy 로 DROP & RECREATE.
DROP POLICY IF EXISTS deny_all_snapshots ON storage.objects;
-- ⚠️ R7 변경 (ISSUE-4): TO authenticated → TO public
--   TO public 은 anon + authenticated 양쪽을 모두 포함. anon role 도 명시적 차단하여
--   behavior-snapshots 버킷의 모든 객체 접근을 전면 DENY (Phase E 에서 owner-only 로 교체).
CREATE POLICY deny_all_snapshots ON storage.objects
  FOR ALL TO public
  USING (bucket_id = 'behavior-snapshots' AND false)
  WITH CHECK (bucket_id = 'behavior-snapshots' AND false);

-- ----------------------------------------------------------------------------
-- (7) update_behavior_user_label RPC
-- ----------------------------------------------------------------------------
-- - SECURITY DEFINER: RLS 우회하고 함수 안에서 권한 검증 직접 수행
-- - search_path 고정 (CLAUDE.md 보안 권고)
-- - 라벨 화이트리스트 검증 후 UPDATE + audit log INSERT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_behavior_user_label(
  p_event_id UUID,
  p_label TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_event_home_id UUID;
  v_old_label TEXT;
  v_valid BOOLEAN;
  v_owner_id UUID;
BEGIN
  -- 인증 확인
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- ⚠️ R2 추가 (REJECT-4a): p_label 길이 제한 — 64자 초과 거부
  --   reclassified:elimination(=27자) + 약간의 여유. 64 면 충분.
  --   error message 입력 echo 안함 (REJECT-4c).
  IF p_label IS NOT NULL AND length(p_label) > 64 THEN
    RAISE EXCEPTION 'invalid label format';
  END IF;

  -- 라벨 화이트리스트 검증
  -- ⚠️ R7 변경 (R60): reclassified:<cls> 의 cls 검증을 is_valid_behavior_class() 로 통합.
  v_valid := p_label IS NULL
    OR p_label IN ('correct','human','shadow','other_animal')
    OR (p_label LIKE 'reclassified:%'
        AND public.is_valid_behavior_class(substring(p_label from 14)));
  IF NOT v_valid THEN
    -- ⚠️ R2 변경 (REJECT-4c): 입력 값 echo 제거 → 정보 누출 방지
    RAISE EXCEPTION 'invalid label format';
  END IF;

  -- 이벤트의 home_id 조회 (cat_behavior_events.home_id 컬럼 직접 사용)
  -- ⚠️ R3 추가 (Issue C): 동시 라벨 수정 race 방어. row lock 으로 audit log 의
  --   old_label 일관성 보장. (home_id + user_label 한번에 SELECT — 중복 쿼리 회피)
  SELECT e.home_id, e.user_label
    INTO v_event_home_id, v_old_label
  FROM public.cat_behavior_events e
  WHERE e.id = p_event_id
  FOR UPDATE;

  IF v_event_home_id IS NULL THEN
    RAISE EXCEPTION 'event not found';
  END IF;

  -- 권한 검증: 호출자가 해당 home 의 owner 인가? (RLS 정책과 동일 모델)
  SELECT owner_id INTO v_owner_id
  FROM public.homes
  WHERE id = v_event_home_id;

  IF v_owner_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- 업데이트
  UPDATE public.cat_behavior_events
  SET user_label = p_label,
      labeled_at = now(),
      labeled_by = v_user_id
  WHERE id = p_event_id;

  -- audit log INSERT (Phase D 활용)
  INSERT INTO public.cat_behavior_label_history
    (event_id, old_label, new_label, labeled_by)
  VALUES
    (p_event_id, v_old_label, p_label, v_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_behavior_user_label(UUID, TEXT)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- (8) export_behavior_dataset RPC — metadata-only (Phase E 데이터셋 export)
-- ----------------------------------------------------------------------------
-- effective_class 는 user_label 보정 결과를 반영 (TS effectiveClass.ts 와 1:1 동치):
--   ① user_label IN (human,shadow,other_animal)        → NULL (노이즈)
--   ② user_label LIKE 'reclassified:<cls>' + 화이트리스트 → cls / 아니면 NULL
--   ③ 그 외 (NULL, 'correct', 알 수 없는 값) + behavior_class 화이트리스트
--                                                       → behavior_class / 아니면 NULL
-- ⚠️ R2 변경 (REJECT-3): 화이트리스트 미통과 시 NULL 폴백 — 잘못된 값 누수 차단.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_behavior_dataset(
  p_home_id UUID,
  p_since DATE,
  p_until DATE
) RETURNS TABLE (
  event_id UUID,
  cat_id UUID,
  behavior_class TEXT,
  user_label TEXT,
  effective_class TEXT,
  bbox JSONB,
  confidence REAL,
  model_version TEXT,
  snapshot_url TEXT,
  detected_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_owner_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- 권한 검증: 호출자가 해당 home 의 owner 인지 확인
  SELECT owner_id INTO v_owner_id
  FROM public.homes
  WHERE id = p_home_id;

  IF v_owner_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- ⚠️ R3 추가 (Issue D): DoS 방지 — 1년 초과 범위 거부.
  IF (p_until - p_since) > 366 THEN
    RAISE EXCEPTION 'range too large (max 366 days)';
  END IF;
  IF p_since > p_until THEN
    RAISE EXCEPTION 'invalid date range';
  END IF;

  RETURN QUERY
  SELECT
    e.id AS event_id,
    e.cat_id,
    e.behavior_class,
    e.user_label,
    -- ⚠️ R2 변경 (REJECT-3): TS effectiveClass.ts 와 1:1 동치인 3분기 CASE.
    --   COALESCE 폴백 제거 → 화이트리스트 미통과는 NULL 로 명시.
    -- ⚠️ R7 변경 (R60): 화이트리스트 IN 리터럴 → is_valid_behavior_class() 함수 호출.
    --   기존 4곳(constraint, update RPC, export RPC ×2) 중복 제거. 단일 진실 원천.
    CASE
      -- ① 노이즈 라벨: 학습 데이터에서 제외
      WHEN e.user_label IN ('human','shadow','other_animal') THEN NULL
      -- ② 재분류: 화이트리스트 통과 시 그 클래스, 아니면 NULL
      WHEN e.user_label LIKE 'reclassified:%' THEN
        CASE WHEN public.is_valid_behavior_class(substring(e.user_label from 14))
          THEN substring(e.user_label from 14) ELSE NULL END
      -- ③ 그 외 (NULL / 'correct' / 알 수 없는 값): 원본 behavior_class
      --    역시 화이트리스트 검증 — 구 클래스(arch/walk_run 등) 누수 차단
      ELSE
        CASE WHEN public.is_valid_behavior_class(e.behavior_class)
          THEN e.behavior_class ELSE NULL END
    END AS effective_class,
    e.bbox,
    e.confidence,
    (e.metadata->>'model_version')::TEXT AS model_version,
    e.snapshot_url,
    e.detected_at,
    e.metadata
  FROM public.cat_behavior_events e
  WHERE e.home_id = p_home_id
    AND e.detected_at >= p_since::timestamptz
    AND e.detected_at <  (p_until::timestamptz + interval '1 day')
    AND e.user_label IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_behavior_dataset(UUID, DATE, DATE)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- (9) 기존 bbox 컬럼 COMMENT 보강 (R5 추가)
-- ----------------------------------------------------------------------------
-- bbox 컬럼은 본 마이그레이션이 아닌 기존 src/ 마이그에서 이미 정의됨.
-- Phase A 에서 의미 명세만 보강 (멱등 — COMMENT ON COLUMN 은 재실행 안전).
COMMENT ON COLUMN public.cat_behavior_events.bbox IS
  '⚠️ 좌표계: letterbox 역변환 후 원본 비디오 기준 정규화 (0.0~1.0). 픽셀 아님.
   yoloPostprocess.unletterbox 출력과 1:1 매핑.';

-- ⚠️ R8 추가 (R7-(4)): 본 마이그 적용 후 운영자 인지용 NOTICE.
--   본 마이그는 CHECK constraint 를 NOT VALID 로 추가하기 때문에 신규 INSERT/UPDATE
--   에는 12 클래스 화이트리스트가 강제되지만 기존 row 는 검증되지 않은 상태로 남는다.
--   구 클래스(arch/walk_run 등) row 가 0건임을 확인한 후
--   20260423_phase_a_validate_after_cleanup.sql 을 별도로 apply_migration 으로
--   실행해야 VALIDATE CONSTRAINT 가 적용되어 모든 row 에 대해 강제된다.
DO $$ BEGIN
  RAISE NOTICE '⚠️ Phase A 본 마이그 적용 완료. 구 클래스 row 가 0건임을 확인한 후 별도로 20260423_phase_a_validate_after_cleanup.sql 을 apply_migration 으로 실행해야 CHECK constraint 가 VALIDATE 됩니다.';
END $$;

-- ⚠️ R7 추가 (R59): BEGIN 의 짝 — 전체 마이그 트랜잭션 종료.
--   여기까지 모든 DDL/INSERT/FUNCTION 정의가 성공하면 COMMIT.
--   하나라도 실패하면 Postgres 가 자동 ROLLBACK → 부분 적용 상태 0.
COMMIT;

-- ============================================================================
-- 끝. 적용은 QA 라운드 후 사장님 컨펌 → mcp__supabase__apply_migration 으로.
-- ============================================================================
