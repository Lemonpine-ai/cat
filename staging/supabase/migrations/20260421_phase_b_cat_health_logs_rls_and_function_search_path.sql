-- =============================================================================
-- 마이그레이션: Phase B — cat_health_logs RLS 정책 + 함수 search_path 고정
-- =============================================================================
-- 목적
--   Supabase DB Advisor 가 리포트한 2종 경고를 단일 트랜잭션으로 원자 적용한다.
--     (A) INFO  × 1 — public.cat_health_logs 에 RLS 는 켜져 있으나 정책이 하나도
--                     없어 authenticated 사용자가 전혀 접근하지 못하는 상태.
--                     cat_logs 와 동일한 "같은 홈 구성원" 패턴으로 4정책 생성.
--     (B) WARN  × 17 — public 스키마 함수 17개의 search_path 가 미설정(unset) 이라
--                      함수 실행 컨텍스트에서 스키마 해석이 호출자에게 좌우된다.
--                      특히 SECURITY DEFINER 14개는 권한 상승 결합 시 치명적.
--                      17개 전부 `public, extensions, pg_temp` 로 고정한다.
--
-- cat_health_logs 공격/접근불가 시나리오
--   1) 테이블에 RLS 는 ENABLE 되어 있지만 정책이 전무한 상태다.
--   2) PostgreSQL 기본 동작상 RLS ON + 정책 0개 = "전부 거부" 이므로,
--      authenticated 사용자조차도 자기 홈의 건강 로그를 읽거나 쓰지 못한다.
--   3) 그렇다고 RLS 를 OFF 로 되돌리면 다른 홈의 로그까지 모두 노출된다.
--   4) 본 마이그레이션은 cat_logs 와 동일하게 `profiles.home_id` 매칭 정책을
--      4종(SELECT/INSERT/UPDATE/DELETE) 추가하여, 같은 홈 구성원만 접근 가능하게
--      한다. (cat_health_logs 에는 recorded_by 컬럼이 없으므로 WITH CHECK 에서
--      uid 추가 검증은 하지 않는다.)
--
-- 함수 search_path 공격 시나리오 (SECURITY DEFINER × search_path unset)
--   1) SECURITY DEFINER 함수는 "함수 소유자 권한" 으로 본문을 실행한다.
--      Supabase 환경에서는 대체로 postgres 슈퍼유저 권한에 가깝다.
--   2) search_path 가 명시되지 않으면 호출자 세션의 search_path 가 상속된다.
--   3) 공격자가 `SET search_path = attack, public;` 으로 세션을 조작한 뒤
--      DEFINER 함수를 호출하면, 함수 내부의 미수식 호출
--      (예: `gen_random_uuid()`, `now()`, 사용자 정의 함수 호출 등) 이
--      `attack` 스키마에 심어둔 동명 악성 함수로 바인딩될 수 있다.
--   4) 그 결과 공격자 소유 코드가 "함수 소유자 권한" 으로 실행되어 권한 상승.
--   5) 본 마이그레이션은 17개 함수 전부에 `search_path = public, extensions, pg_temp`
--      를 못 박아 외부 세션 변수가 개입할 여지를 없앤다.
--      - `public` : 함수 본문이 참조하는 테이블/함수가 대부분 여기 있음.
--      - `extensions` : `pair_camera_device` 가 `gen_random_uuid()` 를 미수식으로
--                       호출하며, Supabase 에서 pgcrypto 는 extensions 스키마에
--                       설치된다. 한 함수라도 필요하면 일관성을 위해 전체 포함.
--      - `pg_temp` : PostgreSQL 권장 마지막 요소. 임시 객체 해석 순서 고정.
--   INVOKER 3개는 권한 상승 위험은 없지만 동일한 공격면(동명 함수 덮어쓰기로
--   호출자의 예상과 다른 코드 실행) 을 막기 위해 같은 정책을 적용한다.
--
-- 접근 패턴 (설계서 기준)
--   cat_health_logs (cat_logs 와 동일 패턴, recorded_by 없음)
--     - SELECT : 같은 홈(profiles.home_id 매치) 구성원이면 전부 조회
--     - INSERT : 같은 홈에만 기록 가능
--     - UPDATE : 같은 홈이면 수정 가능 (USING + WITH CHECK 양쪽)
--     - DELETE : 같은 홈이면 삭제 가능
--   모든 정책은 TO authenticated — anon 요청은 기본 차단.
--
-- 실행 순서
--   [1/6] cat_health_logs 기존 동명 정책 DROP (재실행 안전성)
--   [2/6] cat_health_logs 정책 4개 CREATE
--   [3/6] cat_health_logs RLS 상태 주석 (이미 ON, ALTER 불필요)
--   [4/6] DEFINER 함수 14개 search_path 고정
--   [5/6] INVOKER 함수 3개 search_path 고정
--   [6/6] 롤백 참조 블록 (주석)
--
-- 트랜잭션
--   Supabase `apply_migration` 이 자체 트랜잭션 처리하므로 BEGIN/COMMIT 생략.
--   ALTER FUNCTION ... SET search_path = ... 는 동일값 재적용에도 에러가 없어
--   파일 전체가 멱등하게 재실행 가능하다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- [1/6] cat_health_logs 기존 정책 정리 (재실행 안전)
-- -----------------------------------------------------------------------------
-- 과거 라운드에서 유사 이름 정책이 일부 존재했을 가능성을 고려하여,
-- CREATE 전에 DROP IF EXISTS 로 깨끗이 지운 뒤 재생성한다.
DROP POLICY IF EXISTS cat_health_logs_select_same_home ON public.cat_health_logs;
DROP POLICY IF EXISTS cat_health_logs_insert_same_home ON public.cat_health_logs;
DROP POLICY IF EXISTS cat_health_logs_update_same_home ON public.cat_health_logs;
DROP POLICY IF EXISTS cat_health_logs_delete_same_home ON public.cat_health_logs;


-- -----------------------------------------------------------------------------
-- [2/6] cat_health_logs 정책 4개 생성 (cat_logs 패턴, recorded_by 없어 단순화)
-- -----------------------------------------------------------------------------
-- 공통 서브쿼리 의미: "현재 로그인 사용자가 소속된 홈의 home_id"
--   SELECT p.home_id FROM public.profiles p
--   WHERE p.id = auth.uid() AND p.home_id IS NOT NULL
-- NULL 홈은 결과에서 제외되어 "아직 홈이 없는 사용자" 는 자동으로 접근 불가.

-- (1) SELECT — 같은 홈 구성원이면 모두 조회 가능
CREATE POLICY cat_health_logs_select_same_home
    ON public.cat_health_logs
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

-- (2) INSERT — 같은 홈에만 기록 가능 (recorded_by 컬럼이 없으므로 uid 추가 검증 불가/불필요)
CREATE POLICY cat_health_logs_insert_same_home
    ON public.cat_health_logs
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

-- (3) UPDATE — 같은 홈이면 수정 가능 (USING: 현재 행이 같은 홈, WITH CHECK: 수정 후에도 같은 홈)
CREATE POLICY cat_health_logs_update_same_home
    ON public.cat_health_logs
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

-- (4) DELETE — 같은 홈이면 삭제 가능
CREATE POLICY cat_health_logs_delete_same_home
    ON public.cat_health_logs
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
-- [3/6] cat_health_logs RLS 활성화 상태 확인 (주석만)
-- -----------------------------------------------------------------------------
-- Supabase DB Advisor 리포트(INFO) 상 cat_health_logs 는 이미 RLS 가 ON 이다.
-- (정책이 0개여서 "접근 불가" 상태였을 뿐이며 RLS 자체는 켜져 있음.)
-- 따라서 여기서 별도의 ALTER TABLE ... ENABLE ROW LEVEL SECURITY 는 불필요.
-- 혹시라도 운영 중 OFF 로 되돌아갔다면 별도 마이그레이션으로 재활성화할 것.


-- -----------------------------------------------------------------------------
-- [4/6] SECURITY DEFINER 함수 14개 search_path 고정
-- -----------------------------------------------------------------------------
-- 모든 DEFINER 함수는 함수 소유자 권한으로 실행되므로, 호출자 세션의
-- search_path 영향을 받지 않도록 반드시 명시적으로 고정한다.
-- 값: 'public', 'extensions', 'pg_temp'
--   - public     : 프로젝트 메인 스키마. 대부분의 테이블/함수가 여기 있음.
--   - extensions : pgcrypto(gen_random_uuid) 등 확장 함수가 설치된 Supabase 표준 위치.
--   - pg_temp    : PostgreSQL 권장 마지막 요소. 임시객체 해석 경로 고정.
-- 함수 signature 는 인자 타입으로 정확히 매칭 (오버로딩 방지 차원에서 IN/OUT 생략).

-- (1/14) add_device_ice_candidate(device_id, broadcast_id, candidate)
ALTER FUNCTION public.add_device_ice_candidate(text, uuid, jsonb)
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (2/14) auto_confirm_new_email_signup — Auth 트리거용
ALTER FUNCTION public.auto_confirm_new_email_signup()
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (3/14) cleanup_stale_camera_data — 오래된 시그널링 데이터 정리
ALTER FUNCTION public.cleanup_stale_camera_data()
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (4/14) delete_device_cascade — 디바이스 + 관련 행 일괄 삭제
ALTER FUNCTION public.delete_device_cascade(uuid)
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (5/14) enforce_max_devices_per_home — 홈당 디바이스 수 제한 트리거 함수
ALTER FUNCTION public.enforce_max_devices_per_home()
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (6/14) ensure_camera_session_after_pairing — 페어링 후 세션 row 보장
ALTER FUNCTION public.ensure_camera_session_after_pairing(text)
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (7/14) get_broadcaster_signaling_state — 브로드캐스터 시그널링 상태 조회
ALTER FUNCTION public.get_broadcaster_signaling_state(text, uuid)
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (8/14) get_device_home_env_timestamps — 디바이스 홈 환경 타임스탬프 조회
ALTER FUNCTION public.get_device_home_env_timestamps(text)
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (9/14) pair_camera_device — 페어링 코드로 카메라 연결 (gen_random_uuid 사용 → extensions 필수)
ALTER FUNCTION public.pair_camera_device(text)
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (10/14) record_device_cat_care_log — 디바이스가 직접 기록하는 케어 로그
ALTER FUNCTION public.record_device_cat_care_log(text, text, text)
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (11/14) start_device_broadcast — 디바이스 방송 시작
ALTER FUNCTION public.start_device_broadcast(text, text)
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (12/14) stop_device_broadcast — 디바이스 방송 중지
ALTER FUNCTION public.stop_device_broadcast(text)
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (13/14) viewer_add_ice_candidate — 뷰어측 ICE candidate 추가
ALTER FUNCTION public.viewer_add_ice_candidate(uuid, jsonb)
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (14/14) viewer_update_answer_sdp — 뷰어 SDP answer 갱신
ALTER FUNCTION public.viewer_update_answer_sdp(uuid, text)
    SET search_path = 'public', 'extensions', 'pg_temp';


-- -----------------------------------------------------------------------------
-- [5/6] SECURITY INVOKER 함수 3개 search_path 고정
-- -----------------------------------------------------------------------------
-- INVOKER 는 권한 상승 위험은 없지만, 동명 함수 덮어쓰기 공격(호출자의 예상과
-- 다른 코드 실행)을 막기 위해 동일한 정책으로 search_path 를 고정한다.

-- (1/3) enforce_max_devices — 디바이스 수 제한 트리거 (구식 버전 잔존)
ALTER FUNCTION public.enforce_max_devices()
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (2/3) update_comment_count — 댓글 수 집계 트리거
ALTER FUNCTION public.update_comment_count()
    SET search_path = 'public', 'extensions', 'pg_temp';

-- (3/3) update_like_count — 좋아요 수 집계 트리거
ALTER FUNCTION public.update_like_count()
    SET search_path = 'public', 'extensions', 'pg_temp';


-- -----------------------------------------------------------------------------
-- [6/6] 롤백 블록 (참조용 주석)
-- -----------------------------------------------------------------------------
-- 만약 본 마이그레이션을 되돌려야 할 경우 아래 SQL 을 참고한다.
-- 실제 실행 시에는 정책 삭제로 기능이 멈출 수 있으니 주의.
--
-- ▼ cat_health_logs 정책 4개 롤백
--   DROP POLICY IF EXISTS cat_health_logs_select_same_home ON public.cat_health_logs;
--   DROP POLICY IF EXISTS cat_health_logs_insert_same_home ON public.cat_health_logs;
--   DROP POLICY IF EXISTS cat_health_logs_update_same_home ON public.cat_health_logs;
--   DROP POLICY IF EXISTS cat_health_logs_delete_same_home ON public.cat_health_logs;
--
-- ▼ 함수 search_path 를 서버 기본값으로 되돌리기 (17개)
--   ALTER FUNCTION public.add_device_ice_candidate(text, uuid, jsonb)         RESET search_path;
--   ALTER FUNCTION public.auto_confirm_new_email_signup()                     RESET search_path;
--   ALTER FUNCTION public.cleanup_stale_camera_data()                         RESET search_path;
--   ALTER FUNCTION public.delete_device_cascade(uuid)                         RESET search_path;
--   ALTER FUNCTION public.enforce_max_devices_per_home()                      RESET search_path;
--   ALTER FUNCTION public.ensure_camera_session_after_pairing(text)           RESET search_path;
--   ALTER FUNCTION public.get_broadcaster_signaling_state(text, uuid)         RESET search_path;
--   ALTER FUNCTION public.get_device_home_env_timestamps(text)                RESET search_path;
--   ALTER FUNCTION public.pair_camera_device(text)                            RESET search_path;
--   ALTER FUNCTION public.record_device_cat_care_log(text, text, text)        RESET search_path;
--   ALTER FUNCTION public.start_device_broadcast(text, text)                  RESET search_path;
--   ALTER FUNCTION public.stop_device_broadcast(text)                         RESET search_path;
--   ALTER FUNCTION public.viewer_add_ice_candidate(uuid, jsonb)               RESET search_path;
--   ALTER FUNCTION public.viewer_update_answer_sdp(uuid, text)                RESET search_path;
--   ALTER FUNCTION public.enforce_max_devices()                               RESET search_path;
--   ALTER FUNCTION public.update_comment_count()                              RESET search_path;
--   ALTER FUNCTION public.update_like_count()                                 RESET search_path;
-- =============================================================================
