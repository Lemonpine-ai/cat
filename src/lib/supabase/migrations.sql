-- ============================================================
-- CATvisor 커뮤니티 & 일기 테이블 마이그레이션
-- 실행 환경: Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────
-- 1. community_posts (커뮤니티 게시글)
-- ────────────────────────────────────────
CREATE TABLE community_posts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   uuid        NOT NULL REFERENCES auth.users (id),
  category    text        NOT NULL CHECK (category IN ('brag', 'kitten', 'senior', 'health')),
  title       text        NOT NULL,
  content     text        NOT NULL,
  image_url   text,
  like_count    int       NOT NULL DEFAULT 0,
  comment_count int       NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 보안 정책 활성화
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

-- 로그인 유저만 읽기 가능
CREATE POLICY "community_posts_읽기_로그인유저"
  ON community_posts FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 본인만 작성 가능
CREATE POLICY "community_posts_작성_본인만"
  ON community_posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- 본인만 수정 가능
CREATE POLICY "community_posts_수정_본인만"
  ON community_posts FOR UPDATE
  USING (auth.uid() = author_id);

-- 본인만 삭제 가능
CREATE POLICY "community_posts_삭제_본인만"
  ON community_posts FOR DELETE
  USING (auth.uid() = author_id);


-- ────────────────────────────────────────
-- 2. community_comments (댓글)
-- ────────────────────────────────────────
CREATE TABLE community_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid        NOT NULL REFERENCES community_posts (id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL REFERENCES auth.users (id),
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_comments_읽기_로그인유저"
  ON community_comments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "community_comments_작성_본인만"
  ON community_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "community_comments_수정_본인만"
  ON community_comments FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "community_comments_삭제_본인만"
  ON community_comments FOR DELETE
  USING (auth.uid() = author_id);


-- ────────────────────────────────────────
-- 3. community_likes (좋아요 — 중복 방지)
-- ────────────────────────────────────────
CREATE TABLE community_likes (
  post_id     uuid        NOT NULL REFERENCES community_posts (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)   -- 한 유저가 같은 글에 좋아요 1번만
);

ALTER TABLE community_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_likes_읽기_로그인유저"
  ON community_likes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "community_likes_작성_본인만"
  ON community_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_likes_삭제_본인만"
  ON community_likes FOR DELETE
  USING (auth.uid() = user_id);


-- ────────────────────────────────────────
-- 4. cat_diary (고양이 일기)
-- ────────────────────────────────────────
CREATE TABLE cat_diary (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id     uuid        NOT NULL,  -- profiles.home_id와 동일 값 (homes 테이블 미존재로 FK 미설정)
  author_id   uuid        NOT NULL REFERENCES auth.users (id),
  content     text        NOT NULL CHECK (char_length(content) <= 200),  -- 최대 200자
  cat_id      uuid        NOT NULL REFERENCES cats (id) ON DELETE CASCADE,
  date        date        NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cat_diary ENABLE ROW LEVEL SECURITY;

-- 본인만 읽기 가능 (일기장은 개인 데이터)
CREATE POLICY "cat_diary_읽기_본인만"
  ON cat_diary FOR SELECT
  USING (auth.uid() = author_id);

CREATE POLICY "cat_diary_작성_본인만"
  ON cat_diary FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "cat_diary_수정_본인만"
  ON cat_diary FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "cat_diary_삭제_본인만"
  ON cat_diary FOR DELETE
  USING (auth.uid() = author_id);


-- ============================================================
-- 트리거: 좋아요 수 자동 업데이트
-- community_likes에 INSERT/DELETE 되면
-- community_posts.like_count를 자동으로 +1 / -1
-- ============================================================

CREATE OR REPLACE FUNCTION update_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts
       SET like_count = like_count + 1
     WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts
       SET like_count = like_count - 1
     WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_like_count
  AFTER INSERT OR DELETE ON community_likes
  FOR EACH ROW EXECUTE FUNCTION update_like_count();


-- ============================================================
-- 트리거: 댓글 수 자동 업데이트
-- community_comments에 INSERT/DELETE 되면
-- community_posts.comment_count를 자동으로 +1 / -1
-- ============================================================

CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts
       SET comment_count = comment_count + 1
     WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts
       SET comment_count = comment_count - 1
     WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_count
  AFTER INSERT OR DELETE ON community_comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_count();


-- ============================================================
-- 인덱스: 조회 성능 최적화
-- ============================================================

-- 커뮤니티 게시글: 카테고리별 최신순 조회
CREATE INDEX idx_community_posts_category ON community_posts (category, created_at DESC);

-- 커뮤니티 게시글: 작성자별 조회
CREATE INDEX idx_community_posts_author ON community_posts (author_id);

-- 댓글: 게시글별 시간순 조회
CREATE INDEX idx_community_comments_post ON community_comments (post_id, created_at ASC);

-- 일기: 고양이별 날짜순 조회
CREATE INDEX idx_cat_diary_cat_date ON cat_diary (cat_id, date DESC);

-- ============================================================
-- 이미지 URL 컬럼 추가 (community_posts에 사진 첨부 기능 추가)
-- ============================================================
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS image_url TEXT;


-- ============================================================
-- Supabase Storage: post-images 버킷 생성 + 정책
-- ============================================================
-- 아래 SQL을 Supabase SQL Editor에서 실행하세요.
-- 버킷이 이미 존재하면 INSERT는 무시됩니다.
-- ============================================================

-- 1. 버킷 생성 (공개 읽기 허용)
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. 로그인 유저 → 업로드 허용
CREATE POLICY "post_images_업로드_로그인유저"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'post-images'
    AND auth.uid() IS NOT NULL
  );

-- 3. 누구나 → 공개 읽기 허용 (게시글 이미지 표시)
CREATE POLICY "post_images_읽기_모든유저"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images');

-- 4. 본인 폴더만 삭제 허용 (파일 경로가 userId/로 시작)
CREATE POLICY "post_images_삭제_본인만"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'post-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- 건강/질병 서브 카테고리 (health_tag) 컬럼 추가
-- ============================================================
-- category='health'인 글에만 사용하는 서브 태그.
-- 값: kidney, herpes, panleukopenia, heart, dental, etc
-- NULL 허용 — health가 아닌 카테고리에서는 null.

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS health_tag TEXT
  CHECK (health_tag IS NULL OR health_tag IN ('kidney', 'herpes', 'panleukopenia', 'heart', 'dental', 'etc'));

-- 건강 카테고리 내 태그별 최신순 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_community_posts_health_tag
  ON community_posts (health_tag, created_at DESC)
  WHERE category = 'health';
