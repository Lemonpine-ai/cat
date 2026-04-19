-- ==========================================================================
-- 20260419_cats_unique_name_per_home.sql
-- ==========================================================================
-- 목적:
--   같은 home_id 내에서 cats.name 이 중복되면 홈 대시보드 / 리포트 페이지에
--   같은 고양이가 두 번 렌더된다. UI 레벨의 dedupeCatsByName 유틸은 가드일 뿐,
--   근본 원인은 DB 중복 row 이므로 UNIQUE 인덱스로 재삽입 차단.
--
-- 적용 방법 (사장님 수동 승인 필요):
--   1) Supabase SQL 에디터에서 아래 "진단 쿼리" 블록을 주석 해제하여
--      현재 중복 row 를 먼저 확인한다.
--   2) 중복 row 를 어느 쪽 id 로 통합할지 사장님이 결정 (카드 썸네일/상태/
--      cat_logs FK 참조 등 보존해야 할 행 기준으로 결정).
--   3) 결정된 정리 쿼리를 수동으로 실행한 뒤 "UNIQUE INDEX 생성" 을 적용.
--
-- ⚠️ 이 마이그레이션 파일에는 DELETE 를 포함하지 않는다.
--    DELETE 는 데이터 손실 위험이 크므로 반드시 사람 눈으로 확인 후 수동 실행.
-- ==========================================================================


-- ── 진단 쿼리 (필요 시 주석 해제하여 Supabase SQL 에디터에서 실행) ──
--
-- /*
-- -- home_id + name 으로 중복된 고양이 행 확인.
-- -- 결과가 비어있으면 곧바로 UNIQUE INDEX 생성 가능.
-- SELECT home_id,
--        name,
--        COUNT(*) AS duplicate_count,
--        ARRAY_AGG(id ORDER BY created_at) AS cat_ids,
--        ARRAY_AGG(created_at ORDER BY created_at) AS created_ats
--   FROM public.cats
--  GROUP BY home_id, name
-- HAVING COUNT(*) > 1
--  ORDER BY duplicate_count DESC, home_id, name;
--
-- -- 특정 home 의 중복 상세 (home_id 치환 후 실행).
-- -- SELECT id, home_id, name, status, photo_front_url, created_at
-- --   FROM public.cats
-- --  WHERE home_id = '여기에-home_id-붙여넣기'
-- --  ORDER BY name, created_at;
-- */


-- ── UNIQUE INDEX 생성 ──
-- 중복 row 정리가 끝난 뒤에만 실행해야 한다.
-- CONCURRENTLY 로 생성하여 테이블 잠금을 최소화.
-- 부분 인덱스(WHERE name IS NOT NULL AND name <> '') 로 임시 레코드(이름 미입력)는 허용.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS cats_unique_name_per_home_idx
    ON public.cats (home_id, name)
 WHERE name IS NOT NULL
   AND name <> '';

-- 주의:
--   CREATE INDEX CONCURRENTLY 는 트랜잭션 블록 안에서 실행할 수 없다.
--   Supabase SQL 에디터 / psql 에서 단독 문으로 실행해야 한다.
--   만약 중복 row 가 남아있으면 이 구문은 실패하고 롤백된다 (정상 동작).
