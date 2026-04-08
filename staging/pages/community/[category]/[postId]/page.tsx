import Link from "next/link";
import { notFound } from "next/navigation";
import { PostDetail } from "@/components/community/PostDetail";
import { CommentSection } from "@/components/community/CommentSection";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  COMMUNITY_CATEGORIES,
  isValidCategory,
} from "@/types/community";
import { mapRowToPost } from "@/lib/community/mappers";
import styles from "@/components/community/Community.module.css";

type Props = {
  params: Promise<{ category: string; postId: string }>;
};

/**
 * 글 상세 페이지 — 글 + 댓글 + 좋아요 상태를 서버에서 fetch.
 */
export default async function PostDetailPage({ params }: Props) {
  const { category, postId } = await params;

  if (!isValidCategory(category)) notFound();

  const supabase = await createSupabaseServerClient();

  /* 현재 로그인 유저 */
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  /* 글 상세 + profiles 조인 */
  const { data: row } = await supabase
    .from("community_posts")
    .select(
      `
      id, author_id, category, title, content, image_url,
      like_count, comment_count, created_at, updated_at,
      profiles!community_posts_author_id_fkey ( display_name )
    `,
    )
    .eq("id", postId)
    .single();

  if (!row) notFound();

  /* 조인 결과를 CommunityPost 형태로 매핑 (공통 매퍼 함수 사용) */
  const post = mapRowToPost(row as Record<string, unknown>);

  /* 좋아요 여부 확인 */
  let initialLiked = false;
  if (userId) {
    const { data: likeRow } = await supabase
      .from("community_likes")
      .select("post_id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();
    initialLiked = !!likeRow;
  }

  /* 댓글 목록 조회 (profiles FK가 없으므로 조인 없이 조회) */
  const { data: commentRows } = await supabase
    .from("community_comments")
    .select("id, post_id, author_id, content, created_at, updated_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  /* 댓글 작성자들의 프로필을 별도로 한 번에 가져오기 */
  const authorIds = [...new Set((commentRows ?? []).map((r) => r.author_id))];
  const profileMap = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", authorIds);
    (profiles ?? []).forEach((p) => {
      if (p.display_name) profileMap.set(p.id, p.display_name);
    });
  }

  /* 댓글에 작성자 이름 붙이기 */
  const comments = (commentRows ?? []).map((r) => ({
    id: r.id as string,
    post_id: r.post_id as string,
    author_id: r.author_id as string,
    content: r.content as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    author_name: profileMap.get(r.author_id) ?? null,
    author_avatar: null,
  }));

  const isAuthor = userId === post.author_id;

  return (
    <div>
      <div className={styles.pageHeader}>
        <Link href={`/community/${category}`} className={styles.backLink}>
          ← {COMMUNITY_CATEGORIES[category].name}
        </Link>
      </div>

      <PostDetail post={post} isAuthor={isAuthor} initialLiked={initialLiked} />

      {/* 댓글 영역 — CommentSection이 상태를 클라이언트에서 관리 */}
      <CommentSection
        postId={postId}
        initialComments={comments}
        currentUserId={userId}
      />
    </div>
  );
}
