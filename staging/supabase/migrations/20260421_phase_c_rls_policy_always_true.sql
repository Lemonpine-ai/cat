-- =============================================================================
-- 마이그레이션: Phase C — "USING (true)" 전면 허용 정책 제거 + home 경계 실질화
-- =============================================================================
-- 목적
--   Supabase DB Advisor 가 리포트한 WARN 5건(정책 상 home 경계 미적용)을 해소한다.
--     (1) public.activity_logs     — RLS 켜져 있으나 정책이 "USING (true)" 로 전면 허용
--     (2) public.cameras           — 동일
--     (3) public.cats              — 동일
--     (4) public.community_posts   — 과도하게 광범위한 SELECT/INSERT 정책 잔존
--     (5) public.environment_logs  — 동일 (USING true)
--
-- 사장님 사양 (권한 차등)
--   ▸ cats
--       - INSERT(등록)  : "메인사용자(홈 오너)" 만 가능 — 집에 고양이를 추가·등록
--       - DELETE(제거)  : "메인사용자(홈 오너)" 만 가능 — 고양이 제적
--       - SELECT/UPDATE : 같은 홈 가족 구성원 공동 가능 (display, 메모 등 공동 편집)
--   ▸ cameras / environment_logs
--       - 4종 모두 같은 홈 구성원 공동 — 카메라 페어링/환경 로그는 가족 공동 운영
--   ▸ activity_logs (고양이 활동 로그)
--       - 자체에는 home_id 가 없음 → cats.home_id 를 JOIN 해 같은 홈 구성원만 접근
--       - 성능을 위해 activity_logs.cat_id 에 인덱스 보강 (마지막 단계)
--   ▸ community_posts
--       - 기존 "Enable read access for all users" 는 anon(비로그인) 까지 열려있던 것으로 판단
--         → authenticated 로 제한하는 재작성은 별도 Phase 에서 진행하고, 본 파일에서는
--           문제 정책 2건 DROP 만 수행해 과잉 허용을 먼저 차단한다.
--
-- 보안 배경 (왜 지금 고쳐야 하는가)
--   현재 위 4테이블의 "Enable all for authenticated users" 정책은 USING (true) 로
--   작성되어 있어, 실질적으로 RLS 가 무력화된 상태다. 즉, 로그인만 하면 임의의
--   authenticated 사용자가 타인의 홈 카메라/고양이/활동/환경 로그 전부를 조회·수정·
--   삭제할 수 있다. Phase A(homes/cat_logs) / Phase B(cat_health_logs) 에서 이미
--   채용한 "profiles.home_id 매칭" 패턴을 본 Phase C 에서도 동일하게 적용해
--   home 경계를 실질화한다.
--
-- 접근 패턴 요약 (Phase A/B 와 동일 스타일)
--   공통 서브쿼리: "현재 로그인 사용자의 home_id"
--     SELECT p.home_id FROM public.profiles p
--     WHERE p.id = auth.uid() AND p.home_id IS NOT NULL
--   cats 전용 추가 서브쿼리: "본인이 오너인 홈 목록"
--     SELECT h.id FROM public.homes h
--     WHERE h.owner_id = auth.uid()
--
-- 정책 역할(role)
--   모든 CREATE POLICY 는 TO authenticated — anon 요청은 기본 차단.
--
-- 실행 순서
--   [1/5] 기존 문제 정책 6개 DROP IF EXISTS
--         (4테이블 × "Enable all for authenticated users" + community_posts 2건)
--   [2/5] 신규 정책 16개 DROP IF EXISTS (재실행 안전성 — 본 파일 재적용 대비)
--   [3/5] cats 정책 4개 CREATE (INSERT/DELETE 오너만, SELECT/UPDATE 홈 공동)
--   [4/5] cameras / environment_logs 정책 각 4개 CREATE (모두 홈 공동)
--   [5/5] activity_logs 정책 4개 CREATE (cats JOIN 으로 home 경계 강제)
--   [6/5] (옵션) activity_logs.cat_id 인덱스 보강 — JOIN 성능
--
-- 트랜잭션
--   Supabase `apply_migration` 이 자체 트랜잭션 처리하므로 BEGIN/COMMIT 생략.
--   DROP IF EXISTS + CREATE POLICY 조합으로 파일 전체가 멱등하게 재실행 가능.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- [1/5] 기존 문제 정책 6건 정리 (USING true / 과잉 허용 제거)
-- -----------------------------------------------------------------------------
-- (A) 4테이블의 "Enable all for authenticated users" — USING (true) 로 사실상 무방비.
--     Advisor WARN 해소를 위해 즉시 제거. 제거 즉시 이 테이블은 정책이 0개가 되며
--     바로 아래 [3/5]~[5/5] 에서 엄격한 신규 정책을 붙인다.
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.activity_logs;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.cameras;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.cats;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.environment_logs;

-- (B) community_posts 의 광범위/중복 정책 2건.
--     - "Enable read access for all users" : anon 까지 조회 허용으로 판단되어 즉시 차단.
--     - "Enable insert for authenticated users only" : 이름상 멀쩡해 보이나
--        home 경계 없이 전역 INSERT 를 허용하므로 일단 DROP 한 뒤 후속 Phase 에서
--        정교한 community_posts 정책을 재도입한다.
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.community_posts;
DROP POLICY IF EXISTS "Enable read access for all users"           ON public.community_posts;


-- -----------------------------------------------------------------------------
-- [2/5] 신규 정책 이름 선제 DROP (재실행 안전성)
-- -----------------------------------------------------------------------------
-- 본 파일을 여러 번 돌려도 안전하도록, 아래 CREATE 할 이름 16개를 먼저 DROP IF EXISTS.
-- (과거 라운드에서 같은 이름의 정책이 남아 있을 가능성까지 대비)

-- cats (4)
DROP POLICY IF EXISTS cats_select_same_home  ON public.cats;
DROP POLICY IF EXISTS cats_insert_owner_only ON public.cats;
DROP POLICY IF EXISTS cats_update_same_home  ON public.cats;
DROP POLICY IF EXISTS cats_delete_owner_only ON public.cats;

-- cameras (4)
DROP POLICY IF EXISTS cameras_select_same_home ON public.cameras;
DROP POLICY IF EXISTS cameras_insert_same_home ON public.cameras;
DROP POLICY IF EXISTS cameras_update_same_home ON public.cameras;
DROP POLICY IF EXISTS cameras_delete_same_home ON public.cameras;

-- environment_logs (4)
DROP POLICY IF EXISTS environment_logs_select_same_home ON public.environment_logs;
DROP POLICY IF EXISTS environment_logs_insert_same_home ON public.environment_logs;
DROP POLICY IF EXISTS environment_logs_update_same_home ON public.environment_logs;
DROP POLICY IF EXISTS environment_logs_delete_same_home ON public.environment_logs;

-- activity_logs (4) — cats JOIN 패턴
DROP POLICY IF EXISTS activity_logs_select_via_cat ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_insert_via_cat ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_update_via_cat ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_delete_via_cat ON public.activity_logs;


-- -----------------------------------------------------------------------------
-- [3/5] cats 정책 4개 — 권한 차등 (INSERT/DELETE 오너만, SELECT/UPDATE 홈 공동)
-- -----------------------------------------------------------------------------
-- 공통 서브쿼리 의미
--   (홈 소속) SELECT p.home_id FROM public.profiles p
--            WHERE p.id = auth.uid() AND p.home_id IS NOT NULL
--            → 현재 로그인 사용자가 속한 홈 id. 미배정 사용자는 접근 불가.
--   (오너)   SELECT h.id FROM public.homes h
--            WHERE h.owner_id = auth.uid()
--            → 현재 로그인 사용자가 owner_id 로 소유한 홈 id 목록.
-- 사장님 의도: "등록(INSERT)·제거(DELETE)는 메인사용자(오너)만, 수정(UPDATE)은 가족 공동."

-- (1) SELECT — 같은 홈 구성원이면 모두 조회 가능 (가족 공동)
CREATE POLICY cats_select_same_home
    ON public.cats
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

-- (2) INSERT — 오너만 고양이 신규 등록 가능. 다른 홈에 넣는 것도 차단.
CREATE POLICY cats_insert_owner_only
    ON public.cats
    FOR INSERT
    TO authenticated
    WITH CHECK (
        home_id IN (
            SELECT h.id
            FROM public.homes h
            WHERE h.owner_id = auth.uid()
        )
    );

-- (3) UPDATE — 같은 홈 구성원이면 수정 가능 (홈 간 이동 방지를 위해 WITH CHECK 동일)
CREATE POLICY cats_update_same_home
    ON public.cats
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

-- (4) DELETE — 오너만 고양이 제적(제거) 가능.
CREATE POLICY cats_delete_owner_only
    ON public.cats
    FOR DELETE
    TO authenticated
    USING (
        home_id IN (
            SELECT h.id
            FROM public.homes h
            WHERE h.owner_id = auth.uid()
        )
    );


-- -----------------------------------------------------------------------------
-- [4/5] cameras / environment_logs 정책 각 4개 — 모두 홈 공동
-- -----------------------------------------------------------------------------
-- 카메라 페어링/환경 로그는 가족이 공동으로 운영한다는 사장님 방침에 따라
-- SELECT/INSERT/UPDATE/DELETE 모두 "같은 홈 구성원" 패턴으로 동일하게 구성.

-- =========================
-- cameras 정책 4개
-- =========================

-- (1) SELECT — 같은 홈 구성원이면 카메라 목록 조회 가능
CREATE POLICY cameras_select_same_home
    ON public.cameras
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

-- (2) INSERT — 같은 홈에만 카메라 등록 가능 (가족 누구나 페어링 가능)
CREATE POLICY cameras_insert_same_home
    ON public.cameras
    FOR INSERT
    TO authenticated
    WITH CHECK (
        home_id IN (
            SELECT p.home_id
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.home_id IS NOT NULL
        )
    );

-- (3) UPDATE — 같은 홈이면 카메라 설정 수정 가능 (홈 이동 방지를 위해 WITH CHECK 동일)
CREATE POLICY cameras_update_same_home
    ON public.cameras
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

-- (4) DELETE — 같은 홈이면 카메라 페어링 해제 가능
CREATE POLICY cameras_delete_same_home
    ON public.cameras
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
-- environment_logs 정책 4개
-- =========================
-- cameras 와 완전히 동일한 패턴. 환경 로그(온습도 등)도 가족 공동 조회·기록·편집.

-- (1) SELECT — 같은 홈 구성원이면 환경 로그 조회 가능
CREATE POLICY environment_logs_select_same_home
    ON public.environment_logs
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

-- (2) INSERT — 같은 홈에만 환경 로그 기록 가능
CREATE POLICY environment_logs_insert_same_home
    ON public.environment_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        home_id IN (
            SELECT p.home_id
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.home_id IS NOT NULL
        )
    );

-- (3) UPDATE — 같은 홈이면 환경 로그 수정 가능
CREATE POLICY environment_logs_update_same_home
    ON public.environment_logs
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

-- (4) DELETE — 같은 홈이면 환경 로그 삭제 가능
CREATE POLICY environment_logs_delete_same_home
    ON public.environment_logs
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


-- -----------------------------------------------------------------------------
-- [5/5] activity_logs 정책 4개 — cats JOIN (home_id 컬럼 부재)
-- -----------------------------------------------------------------------------
-- activity_logs 에는 home_id 컬럼이 없다. 대신 cat_id 로 public.cats 를 참조하며,
-- cats.home_id 가 실제 홈 경계이다. 따라서 정책은 다음 2단 서브쿼리를 사용한다.
--
--   cat_id IN (
--     SELECT c.id FROM public.cats c
--     WHERE c.home_id IN (
--       SELECT p.home_id FROM public.profiles p
--       WHERE p.id = auth.uid() AND p.home_id IS NOT NULL
--     )
--   )
--
-- 의미: "현재 로그인 사용자의 홈에 속한 고양이의 로그만 접근 허용".
-- 미배정(home_id NULL) 사용자는 내부 서브쿼리가 0행이 되어 자동 차단.
-- 성능: 아래 [6/5] 인덱스 보강에서 activity_logs.cat_id 인덱스를 만든다.

-- (1) SELECT — 같은 홈 고양이의 활동 로그 조회 가능
CREATE POLICY activity_logs_select_via_cat
    ON public.activity_logs
    FOR SELECT
    TO authenticated
    USING (
        cat_id IN (
            SELECT c.id
            FROM public.cats c
            WHERE c.home_id IN (
                SELECT p.home_id
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.home_id IS NOT NULL
            )
        )
    );

-- (2) INSERT — 같은 홈 고양이의 로그만 기록 가능
CREATE POLICY activity_logs_insert_via_cat
    ON public.activity_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        cat_id IN (
            SELECT c.id
            FROM public.cats c
            WHERE c.home_id IN (
                SELECT p.home_id
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.home_id IS NOT NULL
            )
        )
    );

-- (3) UPDATE — 같은 홈 고양이의 로그만 수정 가능 (타 고양이로 이동 방지 WITH CHECK 동일)
CREATE POLICY activity_logs_update_via_cat
    ON public.activity_logs
    FOR UPDATE
    TO authenticated
    USING (
        cat_id IN (
            SELECT c.id
            FROM public.cats c
            WHERE c.home_id IN (
                SELECT p.home_id
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.home_id IS NOT NULL
            )
        )
    )
    WITH CHECK (
        cat_id IN (
            SELECT c.id
            FROM public.cats c
            WHERE c.home_id IN (
                SELECT p.home_id
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.home_id IS NOT NULL
            )
        )
    );

-- (4) DELETE — 같은 홈 고양이의 로그만 삭제 가능
CREATE POLICY activity_logs_delete_via_cat
    ON public.activity_logs
    FOR DELETE
    TO authenticated
    USING (
        cat_id IN (
            SELECT c.id
            FROM public.cats c
            WHERE c.home_id IN (
                SELECT p.home_id
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.home_id IS NOT NULL
            )
        )
    );


-- -----------------------------------------------------------------------------
-- [6/5] (옵션) activity_logs.cat_id 인덱스 보강 — RLS JOIN 성능
-- -----------------------------------------------------------------------------
-- activity_logs 의 4정책 모두 `cat_id IN (SELECT ... FROM public.cats ...)` 형태라
-- cat_id 컬럼에 인덱스가 없으면 로그가 많아질수록 쿼리 플랜이 급격히 악화된다.
-- 재실행 안전을 위해 IF NOT EXISTS 사용.
CREATE INDEX IF NOT EXISTS idx_activity_logs_cat_id
    ON public.activity_logs (cat_id);


-- =============================================================================
-- 롤백 블록 (참조용 — 실행하지 마세요)
-- =============================================================================
-- 본 마이그레이션을 되돌리려면 (1) 신규 정책 16개를 전부 DROP 하고,
-- (2) 과거의 느슨한 원본 정책 6개를 재생성한다.
-- 단, 원본 6개는 home 경계가 실질적으로 없는 상태이므로 프로덕션 사용 금지.
--
-- ▼ 신규 정책 16개 DROP
--   DROP POLICY IF EXISTS cats_select_same_home         ON public.cats;
--   DROP POLICY IF EXISTS cats_insert_owner_only        ON public.cats;
--   DROP POLICY IF EXISTS cats_update_same_home         ON public.cats;
--   DROP POLICY IF EXISTS cats_delete_owner_only        ON public.cats;
--
--   DROP POLICY IF EXISTS cameras_select_same_home      ON public.cameras;
--   DROP POLICY IF EXISTS cameras_insert_same_home      ON public.cameras;
--   DROP POLICY IF EXISTS cameras_update_same_home      ON public.cameras;
--   DROP POLICY IF EXISTS cameras_delete_same_home      ON public.cameras;
--
--   DROP POLICY IF EXISTS environment_logs_select_same_home ON public.environment_logs;
--   DROP POLICY IF EXISTS environment_logs_insert_same_home ON public.environment_logs;
--   DROP POLICY IF EXISTS environment_logs_update_same_home ON public.environment_logs;
--   DROP POLICY IF EXISTS environment_logs_delete_same_home ON public.environment_logs;
--
--   DROP POLICY IF EXISTS activity_logs_select_via_cat  ON public.activity_logs;
--   DROP POLICY IF EXISTS activity_logs_insert_via_cat  ON public.activity_logs;
--   DROP POLICY IF EXISTS activity_logs_update_via_cat  ON public.activity_logs;
--   DROP POLICY IF EXISTS activity_logs_delete_via_cat  ON public.activity_logs;
--
-- ▼ 인덱스 롤백 (선택)
--   DROP INDEX IF EXISTS public.idx_activity_logs_cat_id;
--
-- ▼ 원본(느슨한) 정책 6개 복원 참조 — Advisor WARN 재발, 프로덕션 사용 금지
--   -- (원본 정책들은 전부 `USING (true)` 전면 허용이었음)
--   CREATE POLICY "Enable all for authenticated users"
--     ON public.activity_logs
--     FOR ALL
--     TO authenticated
--     USING (true)
--     WITH CHECK (true);
--
--   CREATE POLICY "Enable all for authenticated users"
--     ON public.cameras
--     FOR ALL
--     TO authenticated
--     USING (true)
--     WITH CHECK (true);
--
--   CREATE POLICY "Enable all for authenticated users"
--     ON public.cats
--     FOR ALL
--     TO authenticated
--     USING (true)
--     WITH CHECK (true);
--
--   CREATE POLICY "Enable all for authenticated users"
--     ON public.environment_logs
--     FOR ALL
--     TO authenticated
--     USING (true)
--     WITH CHECK (true);
--
--   -- community_posts 원본 정책 2건 (느슨 — anon 조회까지 열려있었음)
--   CREATE POLICY "Enable read access for all users"
--     ON public.community_posts
--     FOR SELECT
--     USING (true);
--
--   CREATE POLICY "Enable insert for authenticated users only"
--     ON public.community_posts
--     FOR INSERT
--     TO authenticated
--     WITH CHECK (true);
-- =============================================================================
