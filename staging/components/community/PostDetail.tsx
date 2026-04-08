"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LikeButton } from "@/components/community/LikeButton";
import { PostEditForm } from "./PostEditForm";
import type { CommunityPost } from "@/types/community";
import styles from "./Community.module.css";

type PostDetailProps = {
  /** 표시할 게시글 데이터 */
  post: CommunityPost;
  /** 현재 로그인 사용자가 글 작성자인지 여부 */
  isAuthor: boolean;
  /** 좋아요 초기 상태 */
  initialLiked: boolean;
};

/**
 * PostDetail — 글 상세 읽기 전용 표시
 *
 * 제목, 작성자, 이미지, 본문, 좋아요 버튼을 표시합니다.
 * 본인 글인 경우 수정/삭제 버튼이 노출되며,
 * 수정 모드는 PostEditForm 컴포넌트에 위임합니다.
 */
export function PostDetail({ post, isAuthor, initialLiked }: PostDetailProps) {
  const router = useRouter();
  /* 수정 모드 여부 */
  const [editing, setEditing] = useState(false);

  /* 삭제 처리 — 확인 후 DB에서 삭제하고 목록으로 이동 */
  async function handleDelete() {
    if (!confirm("정말 삭제하시겠어요?")) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("community_posts").delete().eq("id", post.id);
    router.push(`/community/${post.category}`);
  }

  /* 수정 저장 — PostEditForm에서 호출됨 */
  async function handleSave(title: string, content: string) {
    const supabase = createSupabaseBrowserClient();
    await supabase
      .from("community_posts")
      .update({ title, content, updated_at: new Date().toISOString() })
      .eq("id", post.id);
    setEditing(false);
    router.refresh();
  }

  /* 수정 모드일 때는 PostEditForm을 렌더링 */
  if (editing) {
    return (
      <article className={styles.postDetail}>
        <PostEditForm post={post} onSave={handleSave} onCancel={() => setEditing(false)} />
      </article>
    );
  }

  /* 읽기 전용 모드 */
  return (
    <article className={styles.postDetail}>
      <h1 className={styles.postDetailTitle}>{post.title}</h1>

      {/* 작성자·시간 */}
      <div className={styles.postDetailAuthor}>
        <span>{post.author_name ?? "익명"}</span>
        <span>·</span>
        <span>{new Date(post.created_at).toLocaleDateString("ko-KR")}</span>
      </div>

      {/* 첨부 이미지 */}
      {post.image_url ? (
        <img src={post.image_url} alt="첨부 이미지" className={styles.postImage} />
      ) : null}

      {/* 본문 */}
      <div className={styles.postContent}>{post.content}</div>

      {/* 좋아요 버튼 */}
      <LikeButton postId={post.id} initialLikeCount={post.like_count} initialLiked={initialLiked} />

      {/* 본인 글 수정/삭제 버튼 */}
      {isAuthor ? (
        <div className={styles.postActions}>
          <button className={styles.postActionBtn} onClick={() => setEditing(true)}>수정</button>
          <button className={`${styles.postActionBtn} ${styles.deleteBtn}`} onClick={handleDelete}>삭제</button>
        </div>
      ) : null}
    </article>
  );
}
