"use client";

import { useState } from "react";
import type { CommunityPost } from "@/types/community";
import styles from "./Community.module.css";

/**
 * PostEditForm — 글 수정 모드 UI
 *
 * 제목과 본문을 편집할 수 있는 폼을 렌더링합니다.
 * 저장 버튼을 누르면 onSave 콜백으로 수정된 제목/본문을 전달하고,
 * 취소 버튼을 누르면 onCancel 콜백을 호출합니다.
 */
type PostEditFormProps = {
  /** 수정 대상 게시글 데이터 */
  post: CommunityPost;
  /** 저장 버튼 클릭 시 호출 — 수정된 제목과 본문을 전달 */
  onSave: (title: string, content: string) => Promise<void>;
  /** 취소 버튼 클릭 시 호출 — 수정 모드 종료 */
  onCancel: () => void;
};

/** 글 수정 폼 — 제목/본문 편집 + 저장/취소 버튼 */
export function PostEditForm({ post, onSave, onCancel }: PostEditFormProps) {
  /* 수정 중인 제목과 본문 상태 */
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  /* 저장 중 여부 — 중복 클릭 방지용 */
  const [saving, setSaving] = useState(false);

  /* 저장 버튼 클릭 핸들러 */
  async function handleSave() {
    setSaving(true);
    await onSave(title, content);
    setSaving(false);
  }

  return (
    <>
      {/* 제목 편집 입력칸 */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={styles.editTitleInput}
      />

      {/* 본문 편집 텍스트영역 */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        className={styles.editContentTextarea}
      />

      {/* 저장/취소 버튼 영역 */}
      <div className={styles.postActions}>
        <button
          className={styles.postActionBtn}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        <button className={styles.postActionBtn} onClick={onCancel}>
          취소
        </button>
      </div>
    </>
  );
}
