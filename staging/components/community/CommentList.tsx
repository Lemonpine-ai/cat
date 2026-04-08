"use client";

import { CommentItem } from "./CommentItem";
import type { CommunityComment } from "@/types/community";
import styles from "./Community.module.css";

type CommentListProps = {
  /** 댓글 배열 */
  comments: CommunityComment[];
  /** 현재 로그인 사용자 ID (비로그인이면 null) */
  currentUserId: string | null;
  /** 댓글 수정 시 호출 — 부모(CommentSection)가 DB + 상태를 관리 */
  onUpdate: (commentId: string, newContent: string) => void;
  /** 댓글 삭제 시 호출 — 부모(CommentSection)가 DB + 상태를 관리 */
  onDelete: (commentId: string) => void;
};

/**
 * CommentList — 댓글 목록 표시 컴포넌트
 *
 * 댓글 배열을 받아 CommentItem을 렌더링합니다.
 * DB 호출 로직은 부모(CommentSection)에서 처리하며,
 * 이 컴포넌트는 순수하게 표시와 콜백 전달만 담당합니다.
 */
export function CommentList({ comments, currentUserId, onUpdate, onDelete }: CommentListProps) {
  /* 댓글이 없을 때 안내 문구 표시 */
  if (comments.length === 0) {
    return (
      <div className={`${styles.emptyMessage} ${styles.emptyCommentMessage}`}>
        아직 댓글이 없어요
      </div>
    );
  }

  /* 댓글 배열을 CommentItem으로 렌더링 */
  return (
    <div className={styles.commentList}>
      {comments.map((c) => (
        <CommentItem
          key={c.id}
          comment={c}
          isAuthor={currentUserId === c.author_id}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
