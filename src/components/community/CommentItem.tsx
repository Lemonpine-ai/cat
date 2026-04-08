"use client";

import { useState } from "react";
import type { CommunityComment } from "@/types/community";
import styles from "./Community.module.css";

/**
 * CommentItem — 개별 댓글 한 건을 렌더링하는 컴포넌트
 *
 * 댓글 작성자 이름, 본문, 작성 날짜를 표시합니다.
 * 본인 댓글인 경우 수정/삭제 버튼이 노출됩니다.
 * 수정 모드에서는 인라인 입력칸과 저장/취소 버튼이 표시됩니다.
 */
type CommentItemProps = {
  /** 댓글 데이터 */
  comment: CommunityComment;
  /** 현재 로그인 사용자가 이 댓글의 작성자인지 여부 */
  isAuthor: boolean;
  /** 삭제 버튼 클릭 시 호출 — 댓글 ID를 전달 */
  onDelete: (commentId: string) => void | Promise<void>;
  /** 수정 저장 시 호출 — 댓글 ID와 새 내용을 전달 */
  onUpdate: (commentId: string, newContent: string) => void | Promise<void>;
};

/** 개별 댓글 아이템 — 표시, 수정, 삭제 기능 포함 */
export function CommentItem({ comment, isAuthor, onDelete, onUpdate }: CommentItemProps) {
  /* 수정 모드 여부 */
  const [editing, setEditing] = useState(false);
  /* 수정 중인 댓글 내용 */
  const [editContent, setEditContent] = useState(comment.content);

  /* 수정 저장 핸들러 */
  function handleSave() {
    onUpdate(comment.id, editContent);
    setEditing(false);
  }

  return (
    <div className={styles.commentItem}>
      {/* 댓글 작성자 이름 */}
      <span className={styles.commentAuthor}>
        {comment.author_name ?? "익명"}
      </span>

      {/* 수정 모드: 인라인 편집 UI / 읽기 모드: 댓글 본문 */}
      {editing ? (
        <div className={styles.commentEditRow}>
          <input
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className={styles.commentEditInput}
          />
          <button className={styles.postActionBtn} onClick={handleSave}>
            저장
          </button>
          <button className={styles.postActionBtn} onClick={() => setEditing(false)}>
            취소
          </button>
        </div>
      ) : (
        <p className={styles.commentContent}>{comment.content}</p>
      )}

      {/* 하단 메타 영역: 날짜 + 수정/삭제 버튼 */}
      <div className={styles.commentMeta}>
        <span>{new Date(comment.created_at).toLocaleDateString("ko-KR")}</span>
        {isAuthor && !editing ? (
          <>
            <button
              className={`${styles.postActionBtn} ${styles.commentSmallBtn}`}
              onClick={() => {
                setEditing(true);
                setEditContent(comment.content);
              }}
            >
              수정
            </button>
            <button
              className={`${styles.postActionBtn} ${styles.deleteBtn} ${styles.commentSmallBtn}`}
              onClick={() => onDelete(comment.id)}
            >
              삭제
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
