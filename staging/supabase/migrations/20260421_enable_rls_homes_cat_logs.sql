-- =============================================================================
-- 마이그레이션: homes / cat_logs RLS 활성화 + profiles home_id 변조 공격 방어 (R5 QA HIGH)
-- =============================================================================
-- 목적
--   (A) Supabase DB Advisor 가 리포트한 ERROR 2건을 해소한다.
--       (1) public.homes     — "RLS Disabled in Public"
--       (2) public.cat_logs  — "RLS Disabled in Public"
--   (B) R5 QA 에서 적발된 profiles 정책 HIGH 이슈를 같은 트랜잭션으로 원자 적용한다.
--       → homes RLS 만 켜고 profiles 정책을 그대로 두면 공격자가 여전히 우회 가능하므로
--         한 파일에 통합해서 "순서 의존 버그" 를 원천 차단한다.
--
-- profiles home_id 변조 공격 시나리오 (R5 QA 지적, 본 파일에서 봉쇄)
--   1) 공격자 X 는 로그인 후 자기 소유 profiles 행에 대해 UPDATE 권한을 갖는다.
--   2) 기존 profiles_update_own 은 WITH CHECK 가 `id = auth.uid()` 뿐이므로,
--      X 는 `UPDATE profiles SET home_id = '<피해자 홈 H>' WHERE id = auth.uid()`
--      를 실행해 자기 프로필의 home_id 를 임의의 홈으로 바꿀 수 있었다.
--   3) 그 뒤 cat_logs / homes 의 RLS 정책이 profiles.home_id 를 "공동 집사" 자격으로
--      신뢰하기 때문에, X 는 홈 H 의 모든 로그와 홈 행을 조회/삽입/수정/삭제할 수 있다.
--   4) 본 마이그레이션은 profiles.home_id 를 "본인이 오너인 홈" 또는 NULL 로만 허용하고,
--      이미 배정된 공동 집사가 home_id 를 유지하는 경우(셀프 참조)는 통과시켜
--      공격을 차단하면서 기존 정상 시나리오를 깨지 않는다.
--
-- 접근 패턴 (설계서 기준, profiles.home_id = 현재 사용자가 속한 홈)
--   homes
--     - SELECT  : 오너(owner_id) 본인 이거나, 공동 집사(profiles.home_id 매치)
--     - INSERT  : 본인을 owner_id 로 하는 홈만 생성 가능
--     - UPDATE  : 오너만 수정 가능 (USING + WITH CHECK 양쪽에서 owner_id 검증)
--     - DELETE  : 오너만 삭제 가능
--   cat_logs
--     - SELECT  : 같은 홈(profiles.home_id 매치)의 구성원이면 전부 조회
--     - INSERT  : 같은 홈에만 기록 가능, recorded_by 는 NULL 이거나 본인 uid
--     - UPDATE  : 같은 홈이면 수정 가능
--     - DELETE  : 같은 홈이면 삭제 가능
--   profiles (R6 보강)
--     - SELECT  : 기존 profiles_select_authenticated 유지 (본 파일에서 건드리지 않음)
--     - INSERT  : id = auth.uid() 이고, home_id 는 NULL 또는 본인 오너 홈만 허용
--     - UPDATE  : id = auth.uid() 이고, home_id 는 NULL / 본인 오너 홈 / 기존값 유지만 허용
--                 (3번째 "기존값 유지" 분기는 공동 집사가 display_name 등 무해 필드를
--                  업데이트할 때 깨지지 않게 하기 위함)
--
-- 정책 역할(role)
--   모든 정책은 TO authenticated 로 제한 → anon 요청은 기본적으로 전부 차단.
--
-- 실행 순서
--   1) 기존 동명 정책 제거(DROP POLICY IF EXISTS) — 재실행 안전성 확보
--      (homes 4 + cat_logs 4 + profiles 2 = 총 10개)
--   2) CREATE POLICY 10개 (homes 4 + cat_logs 4 + profiles 2 재작성)
--   3) ALTER TABLE ... ENABLE ROW LEVEL SECURITY — 정책 생성 뒤에 배치
--      (profiles 는 이미 RLS 가 켜져 있으므로 여기서는 homes / cat_logs 만 ENABLE)
--      (FORCE ROW LEVEL SECURITY 는 다른 테이블과 일관성을 위해 사용하지 않음)
--
-- 트랜잭션
--   Supabase `apply_migration` 이 자체적으로 트랜잭션 처리하므로 BEGIN/COMMIT 생략.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- [1/4] 기존 정책 정리 (재실행 가능성 확보)
-- -----------------------------------------------------------------------------
-- homes
DROP POLICY IF EXISTS homes_select_own_or_member ON public.homes;
DROP POLICY IF EXISTS homes_insert_self_owner    ON public.homes;
DROP POLICY IF EXISTS homes_update_owner         ON public.homes;
DROP POLICY IF EXISTS homes_delete_owner         ON public.homes;

-- cat_logs
DROP POLICY IF EXISTS cat_logs_select_same_home ON public.cat_logs;
DROP POLICY IF EXISTS cat_logs_insert_same_home ON public.cat_logs;
DROP POLICY IF EXISTS cat_logs_update_same_home ON public.cat_logs;
DROP POLICY IF EXISTS cat_logs_delete_same_home ON public.cat_logs;

-- profiles (R6 보강: home_id 변조 방어를 위해 기존 2개를 삭제 후 재생성)
DROP POLICY IF EXISTS profiles_insert_own  ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own  ON public.profiles;


-- -----------------------------------------------------------------------------
-- [2/4] 정책 생성 (homes 4개 + cat_logs 4개 + profiles 2개 재작성 = 총 10개)
-- -----------------------------------------------------------------------------

-- =========================
-- homes 정책
-- =========================

-- 조회 허용: 오너 본인 이거나, profiles.home_id 가 이 홈을 가리키는 공동 집사.
CREATE POLICY homes_select_own_or_member
  ON public.homes
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT home_id
      FROM public.profiles
      WHERE id = auth.uid()
        AND home_id IS NOT NULL
    )
  );

-- 생성 허용: 본인을 owner_id 로 지정한 행만 INSERT 가능.
CREATE POLICY homes_insert_self_owner
  ON public.homes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
  );

-- 수정 허용: 오너만 UPDATE 가능. 수정 후에도 owner_id 가 본인이어야 함(권한 양도 차단).
CREATE POLICY homes_update_owner
  ON public.homes
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
  )
  WITH CHECK (
    owner_id = auth.uid()
  );

-- 삭제 허용: 오너만 DELETE 가능.
CREATE POLICY homes_delete_owner
  ON public.homes
  FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid()
  );


-- =========================
-- cat_logs 정책
-- =========================
-- 공통 서브쿼리:
--   SELECT p.home_id FROM public.profiles p
--   WHERE p.id = auth.uid() AND p.home_id IS NOT NULL
-- → 현재 로그인 사용자의 home_id 를 반환. 미배정(NULL) 사용자는 어떤 행도 통과 못함.

-- 조회 허용: 같은 홈(profiles.home_id 매치) 구성원이면 이 홈의 모든 로그 조회 가능.
CREATE POLICY cat_logs_select_same_home
  ON public.cat_logs
  FOR SELECT
  TO authenticated
  USING (
    home_id IN (
      SELECT p.home_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.home_id IS NOT NULL
    )
  );

-- 생성 허용: 같은 홈에만 로그를 쓸 수 있고, recorded_by 는 NULL 이거나 본인 uid.
CREATE POLICY cat_logs_insert_same_home
  ON public.cat_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    home_id IN (
      SELECT p.home_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.home_id IS NOT NULL
    )
    AND (recorded_by IS NULL OR recorded_by = auth.uid())
  );

-- 수정 허용: 같은 홈 구성원이면 UPDATE 가능 (홈 이동 방지를 위해 WITH CHECK 도 동일 조건).
CREATE POLICY cat_logs_update_same_home
  ON public.cat_logs
  FOR UPDATE
  TO authenticated
  USING (
    home_id IN (
      SELECT p.home_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.home_id IS NOT NULL
    )
  )
  WITH CHECK (
    home_id IN (
      SELECT p.home_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.home_id IS NOT NULL
    )
  );

-- 삭제 허용: 같은 홈 구성원이면 DELETE 가능.
CREATE POLICY cat_logs_delete_same_home
  ON public.cat_logs
  FOR DELETE
  TO authenticated
  USING (
    home_id IN (
      SELECT p.home_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.home_id IS NOT NULL
    )
  );


-- =========================
-- profiles 정책 (R6 보강 재작성)
-- =========================
-- 기존 정책 (복원용 참조 — R5 이전 버전, HIGH 취약점 포함)
--   profiles_insert_own
--     FOR INSERT TO authenticated
--     WITH CHECK: id = auth.uid()
--   profiles_update_own
--     FOR UPDATE TO authenticated
--     USING:      id = auth.uid()
--     WITH CHECK: id = auth.uid()
--   → home_id 를 아무 홈으로나 변조할 수 있어 공동 집사 경계가 무력화됨.
--     본 파일의 새 정책이 해당 공격을 봉쇄한다.
--   (롤백 필요 시 본 주석을 참고해 원본 CREATE POLICY 문을 복원)

-- 생성 허용: 본인 프로필만 만들 수 있고, home_id 는 NULL 이거나 본인 오너 홈만 허용.
CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND (
      home_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.homes h
        WHERE h.id = profiles.home_id
          AND h.owner_id = auth.uid()
      )
    )
  );

-- 수정 허용: 본인 프로필만 수정 가능.
-- WITH CHECK 는 다음 세 분기 중 하나를 만족해야 통과:
--   (1) home_id 를 NULL 로 비우는 경우 (홈 탈퇴)
--   (2) 본인이 오너인 홈으로 지정 (홈 생성/재진입 시)
--   (3) 기존 profiles.home_id 와 동일 (공동 집사가 display_name 등 무해 필드만 업데이트)
-- → 공격자가 타인의 홈을 home_id 로 적는 케이스를 모두 막는다.
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
  )
  WITH CHECK (
    id = auth.uid()
    AND (
      home_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.homes h
        WHERE h.id = profiles.home_id
          AND h.owner_id = auth.uid()
      )
      -- 공동 집사 호환: 바꾸려는 home_id 가 기존 값과 같으면 통과 (셀프 참조 subquery).
      -- 예: B 가 display_name 만 바꾸는데 home_id 를 건드리지 않는 경우 WITH CHECK 통과.
      OR home_id = (
        SELECT p2.home_id
        FROM public.profiles p2
        WHERE p2.id = auth.uid()
      )
    )
  );


-- -----------------------------------------------------------------------------
-- [3/4] RLS 활성화 (정책이 전부 만들어진 뒤에 켠다)
-- -----------------------------------------------------------------------------
-- 주의: FORCE ROW LEVEL SECURITY 는 쓰지 않는다 (다른 테이블과의 일관성 유지).
-- profiles 는 이미 RLS 가 켜져 있으므로 여기서는 homes / cat_logs 만 ENABLE.
ALTER TABLE public.homes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_logs ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- [4/4] 롤백 (참조용 — 실행하지 마세요)
-- =============================================================================
-- ALTER TABLE public.homes    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.cat_logs DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY homes_select_own_or_member ON public.homes;
-- DROP POLICY homes_insert_self_owner    ON public.homes;
-- DROP POLICY homes_update_owner         ON public.homes;
-- DROP POLICY homes_delete_owner         ON public.homes;
--
-- DROP POLICY cat_logs_select_same_home ON public.cat_logs;
-- DROP POLICY cat_logs_insert_same_home ON public.cat_logs;
-- DROP POLICY cat_logs_update_same_home ON public.cat_logs;
-- DROP POLICY cat_logs_delete_same_home ON public.cat_logs;
--
-- DROP POLICY profiles_insert_own ON public.profiles;
-- DROP POLICY profiles_update_own ON public.profiles;
--
-- -- 원본 profiles 정책 복원 (R5 이전 버전, HIGH 취약점 포함 — 프로덕션 사용 금지)
-- CREATE POLICY profiles_insert_own
--   ON public.profiles
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (id = auth.uid());
--
-- CREATE POLICY profiles_update_own
--   ON public.profiles
--   FOR UPDATE
--   TO authenticated
--   USING      (id = auth.uid())
--   WITH CHECK (id = auth.uid());


-- =============================================================================
-- 테스트 시나리오 (참조용 — 실행하지 마세요)
-- =============================================================================
-- 세션: 오너 A (homes.owner_id = A.uid, profiles 는 비어도 됨)
--   1) SELECT * FROM public.homes WHERE owner_id = auth.uid();
--      → 본인 소유 홈만 반환.
--   2) INSERT INTO public.homes (id, owner_id, name) VALUES (gen_random_uuid(), auth.uid(), 'My Home');
--      → 성공.
--   3) INSERT INTO public.homes (id, owner_id, name) VALUES (gen_random_uuid(), '<타 uid>', 'X');
--      → 차단 (WITH CHECK 위반).
--   4) UPDATE public.homes SET name = 'Renamed' WHERE id = '<내 home>';
--      → 성공.
--   5) UPDATE public.homes SET owner_id = '<타 uid>' WHERE id = '<내 home>';
--      → 차단 (WITH CHECK 에서 owner_id = auth.uid() 검사 실패).
--   6) DELETE FROM public.homes WHERE id = '<타인 홈>';
--      → 0 rows.
--
-- 세션: 공동 집사 B (profiles.id = B.uid, profiles.home_id = '<홈 H>')
--   7) SELECT * FROM public.homes;
--      → 홈 H 1행만 노출 (오너 아님에도 member 자격으로 읽힘).
--   8) UPDATE public.homes SET name = '...' WHERE id = '<홈 H>';
--      → 차단 (owner_id 가 B 아님).
--   9) SELECT * FROM public.cat_logs WHERE home_id = '<홈 H>';
--      → 홈 H 의 모든 로그 노출.
--  10) INSERT INTO public.cat_logs (home_id, recorded_by, ...) VALUES ('<홈 H>', auth.uid(), ...);
--      → 성공.
--  11) INSERT INTO public.cat_logs (home_id, recorded_by, ...) VALUES ('<홈 H>', '<타 uid>', ...);
--      → 차단 (recorded_by 검증 실패).
--  12) INSERT INTO public.cat_logs (home_id, ...) VALUES ('<타 홈>', ...);
--      → 차단 (home_id 서브쿼리 미스).
--  13) DELETE FROM public.cat_logs WHERE home_id = '<타 홈>';
--      → 0 rows.
--
-- 세션: 미배정 사용자 C (profiles 없음 또는 home_id IS NULL, 소유 홈 없음)
--  14) SELECT * FROM public.homes;    → 0 rows.
--  15) SELECT * FROM public.cat_logs; → 0 rows.
--
-- 세션: anon (로그인 X)
--  16) 어떤 SELECT/INSERT/UPDATE/DELETE 도 전부 차단 (TO authenticated 때문).
--
-- ============================================================================
-- R6 신규: profiles home_id 변조 공격 케이스 (HIGH 차단 확인)
-- ============================================================================
-- 세션: 공격자 X (profiles.id = X.uid, profiles.home_id = NULL, 소유 홈 없음)
--  17) UPDATE public.profiles SET home_id = '<피해자 홈 H>' WHERE id = auth.uid();
--      → 차단 (WITH CHECK: home_id NULL 아님 / 오너 홈 아님 / 기존값(NULL) 과 다름).
--  18) UPDATE public.profiles SET home_id = '<내 오너 홈>' WHERE id = auth.uid();
--      → 성공 (EXISTS 분기 통과 — 내가 오너인 홈).
--  19) UPDATE public.profiles SET home_id = NULL WHERE id = auth.uid();
--      → 성공 (home_id IS NULL 분기 통과 — 홈 탈퇴 가능).
--  20) INSERT INTO public.profiles (id, home_id) VALUES (auth.uid(), '<피해자 홈 H>');
--      → 차단 (WITH CHECK 위반).
--  21) INSERT INTO public.profiles (id, home_id) VALUES (auth.uid(), NULL);
--      → 성공.
--  22) UPDATE public.profiles SET id = '<타 uid>' WHERE id = auth.uid();
--      → 차단 (WITH CHECK: id = auth.uid() 위반).
--
-- 세션: 공동 집사 B (profiles.id = B.uid, profiles.home_id = '<홈 H>', 오너 아님)
--  23) UPDATE public.profiles SET display_name = 'Bob' WHERE id = auth.uid();
--      → 성공 (3번 분기 "home_id 기존값 유지" 통과 — home_id 변경 없음).
--  24) UPDATE public.profiles SET home_id = '<타 홈 H2>' WHERE id = auth.uid();
--      → 차단 (오너 아님 + 기존값 '<홈 H>' 와 다름).
--  25) UPDATE public.profiles SET home_id = NULL WHERE id = auth.uid();
--      → 성공 (home_id IS NULL 분기 통과 — 공동 집사가 홈에서 빠지는 것은 허용).
-- =============================================================================
