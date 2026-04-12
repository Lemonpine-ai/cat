"use client";

import { useState } from "react";
import { HEALTH_TAGS, type HealthTagKey } from "@/types/community";
import type { CommunityPost } from "@/types/community";
import { PostListItem } from "./PostListItem";
import styles from "./Community.module.css";

type HealthTagFilterProps = {
  /** health 카테고리 글 전체 목록 */
  posts: CommunityPost[];
};

const TAG_KEYS = Object.keys(HEALTH_TAGS) as HealthTagKey[];

/**
 * 건강/질병 서브 태그 필터 — 상단 탭으로 태그 선택, 글 목록 필터링
 * "전체" 탭 포함 총 7개 탭.
 */
export function HealthTagFilter({ posts }: HealthTagFilterProps) {
  /* null = 전체, string = 특정 태그 */
  const [activeTag, setActiveTag] = useState<HealthTagKey | null>(null);

  /* 필터링된 글 목록 */
  const filtered = activeTag
    ? posts.filter((p) => p.health_tag === activeTag)
    : posts;

  return (
    <>
      {/* 태그 필터 탭 바 */}
      <div className={styles.healthFilterBar}>
        {/* 전체 탭 */}
        <button
          type="button"
          className={`${styles.healthFilterTab} ${activeTag === null ? styles.healthFilterTabActive : ""}`}
          onClick={() => setActiveTag(null)}
        >
          전체
        </button>
        {/* 각 태그 탭 */}
        {TAG_KEYS.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`${styles.healthFilterTab} ${activeTag === tag ? styles.healthFilterTabActive : ""}`}
            onClick={() => setActiveTag(tag)}
          >
            {HEALTH_TAGS[tag].emoji} {HEALTH_TAGS[tag].name}
          </button>
        ))}
      </div>

      {/* 필터된 글 목록 */}
      {filtered.length === 0 ? (
        <div className={styles.emptyMessage}>
          {activeTag ? `${HEALTH_TAGS[activeTag].name} 관련 글이 아직 없어요 🐾💭` : "아직 글이 없어요... 첫 글을 써볼까요? 🐱✨"}
        </div>
      ) : (
        <div className={styles.postList}>
          {filtered.map((post) => (
            <PostListItem key={post.id} post={post} category="health" />
          ))}
        </div>
      )}
    </>
  );
}
