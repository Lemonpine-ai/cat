"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CommunityComment } from "@/types/community";
import styles from "./Community.module.css";

type CommentInputProps = {
  /** 댓글을 달 게시글 ID */
  postId: string;
  /** 댓글 등록 성공 시 부모에게 새 댓글 데이터를 전달하는 콜백 */
  onAdd: (comment: CommunityComment) => void;
};

/**
 * 댓글 입력 — textarea + 등록 버튼
 *
 * 등록 성공 시 onAdd 콜백으로 새 댓글 데이터를 부모(CommentSection)에 전달합니다.
 * 부모가 로컬 상태를 즉시 업데이트하므로 화면에 바로 반영됩니다.
 */
export function CommentInput({ postId, onAdd }: CommentInputProps) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!content.trim() || busy) return;
    setBusy(true);
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      /* 현재 로그인 유저 확인 */
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("로그인이 필요합니다"); return; }

      /* 유저 프로필에서 표시 이름 가져오기 */
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      /* DB에 댓글 저장 — insert 후 생성된 row를 바로 반환받음 */
      const { data: inserted, error: insertError } = await supabase
        .from("community_comments")
        .insert({ post_id: postId, author_id: user.id, content: content.trim() })
        .select("id, post_id, author_id, content, created_at, updated_at")
        .single();

      if (insertError || !inserted) {
        setError("댓글 등록에 실패했습니다: " + (insertError?.message ?? ""));
        return;
      }

      /* 부모에게 새 댓글 전달 — 화면에 즉시 반영됨 */
      const newComment: CommunityComment = {
        ...inserted,
        author_name: profile?.display_name ?? null,
        author_avatar: null,
      };
      onAdd(newComment);
      setContent("");
    } catch {
      setError("댓글 등록 중 오류가 발생했습니다");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.commentInput}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="댓글을 입력하세요…"
        rows={2}
      />
      <button type="button" onClick={handleSubmit} disabled={busy || !content.trim()}>
        {busy ? "등록 중…" : "등록"}
      </button>
      {/* 에러 메시지 표시 */}
      {error ? <p style={{ color: "red", fontSize: "0.8rem", marginTop: "0.3rem" }}>{error}</p> : null}
    </div>
  );
}
