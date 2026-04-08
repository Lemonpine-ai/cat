"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CommentList } from "@/components/community/CommentList";
import { CommentInput } from "@/components/community/CommentInput";
import type { CommunityComment } from "@/types/community";
import styles from "@/components/community/Community.module.css";

type CommentSectionProps = {
  /** 게시글 ID */
  postId: string;
  /** 서버에서 가져온 초기 댓글 목록 */
  initialComments: CommunityComment[];
  /** 현재 로그인 유저 ID (비로그인이면 null) */
  currentUserId: string | null;
};

/**
 * CommentSection — 댓글 영역 전체를 감싸는 래퍼 컴포넌트
 *
 * 댓글 상태를 클라이언트에서 직접 관리합니다.
 * 추가/수정/삭제 시 DB에 반영하면서 로컬 상태도 즉시 업데이트하여
 * router.refresh() 없이도 화면이 바로 갱신됩니다.
 */
export function CommentSection({
  postId,
  initialComments,
  currentUserId,
}: CommentSectionProps) {
  /* 댓글 목록 상태 — 서버에서 받은 초기값으로 시작 */
  const [comments, setComments] = useState<CommunityComment[]>(initialComments);

  /* 댓글 추가 — CommentInput에서 호출됨 */
  function handleAdd(newComment: CommunityComment) {
    setComments((prev) => [...prev, newComment]);
  }

  /* 댓글 수정 — CommentList에서 호출됨 */
  async function handleUpdate(commentId: string, newContent: string) {
    const supabase = createSupabaseBrowserClient();
    await supabase
      .from("community_comments")
      .update({ content: newContent, updated_at: new Date().toISOString() })
      .eq("id", commentId);

    /* 로컬 상태 즉시 반영 */
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, content: newContent } : c)),
    );
  }

  /* 댓글 삭제 — CommentList에서 호출됨 */
  async function handleDelete(commentId: string) {
    if (!confirm("댓글을 삭제하시겠어요?")) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("community_comments").delete().eq("id", commentId);

    /* 로컬 상태에서 제거 */
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  return (
    <>
      {/* 댓글 수 표시 */}
      <h2 className={styles.sectionTitle}>댓글 {comments.length}</h2>

      {/* 댓글 목록 */}
      <CommentList
        comments={comments}
        currentUserId={currentUserId}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />

      {/* 댓글 입력 */}
      <CommentInput postId={postId} onAdd={handleAdd} />
    </>
  );
}
