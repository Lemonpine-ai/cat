"use client";

import { PostListItem } from "@/components/community/PostListItem";
import type { CommunityPost } from "@/types/community";
import styles from "./Community.module.css";

type PostListProps = {
  posts: CommunityPost[];
  category: string;
};

/** 글 목록 컨테이너 — 비어있으면 안내 메시지 표시 */
export function PostList({ posts, category }: PostListProps) {
  if (posts.length === 0) {
    return (
      <div className={styles.emptyMessage}>
        아직 글이 없어요 🐾<br />
        첫 번째 글을 작성해 보세요!
      </div>
    );
  }

  return (
    <div className={styles.postList}>
      {posts.map((post) => (
        <PostListItem key={post.id} post={post} category={category} />
      ))}
    </div>
  );
}
