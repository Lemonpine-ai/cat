"use client";

import Link from "next/link";
import { Heart, MessageCircle } from "lucide-react";
import type { CommunityPost } from "@/types/community";
import styles from "./Community.module.css";

type PostListItemProps = {
  post: CommunityPost;
  category: string;
};

/** 작성 시간을 상대적 텍스트로 변환 */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

/** 글 목록 한 줄 — 제목, 작성자, 좋아요, 댓글, 시간 */
export function PostListItem({ post, category }: PostListItemProps) {
  return (
    <Link
      href={`/community/${category}/${post.id}`}
      className={styles.postItem}
    >
      <div className={styles.postItemTitle}>{post.title}</div>
      <div className={styles.postItemMeta}>
        <span>{post.author_name ?? "익명"}</span>
        <span className={styles.metaIconSpan}>
          <Heart size={12} /> {post.like_count}
        </span>
        <span className={styles.metaIconSpan}>
          <MessageCircle size={12} /> {post.comment_count}
        </span>
        <span>{timeAgo(post.created_at)}</span>
      </div>
    </Link>
  );
}
