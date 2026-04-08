import Link from "next/link";
import { notFound } from "next/navigation";
import { PostList } from "@/components/community/PostList";
import { HealthTagFilter } from "@/components/community/HealthTagFilter";
import { FloatingWriteButton } from "@/components/community/FloatingWriteButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  COMMUNITY_CATEGORIES,
  isValidCategory,
} from "@/types/community";
import { mapRowToPost } from "@/lib/community/mappers";
import styles from "@/components/community/Community.module.css";

type Props = {
  params: Promise<{ category: string }>;
};

/**
 * 글 목록 페이지 — 카테고리별 최신 글 20개를 서버에서 fetch.
 * profiles 조인으로 작성자 닉네임을 가져온다.
 */
export default async function CategoryPostListPage({ params }: Props) {
  const { category } = await params;

  if (!isValidCategory(category)) {
    notFound();
  }

  const catInfo = COMMUNITY_CATEGORIES[category];
  const supabase = await createSupabaseServerClient();

  /* 해당 카테고리 글 최신순 20개 + profiles 조인 */
  const { data: rows } = await supabase
    .from("community_posts")
    .select(
      `
      id, author_id, category, title, content, image_url, health_tag,
      like_count, comment_count, created_at, updated_at,
      profiles!community_posts_author_id_fkey ( display_name )
    `,
    )
    .eq("category", category)
    .order("created_at", { ascending: false })
    .limit(20);

  /* 조인 결과를 CommunityPost 형태로 매핑 (공통 매퍼 함수 사용) */
  const posts = (rows ?? []).map((r: Record<string, unknown>) => mapRowToPost(r));

  return (
    <div>
      <div className={styles.pageHeader}>
        <Link href="/community" className={styles.backLink}>
          ← 커뮤니티
        </Link>
        <h1 className={styles.pageTitle}>{catInfo.name}</h1>
        <p className={styles.pageDesc}>{catInfo.description}</p>
      </div>

      {/* health 카테고리: 서브 태그 필터 탭 / 나머지: 일반 목록 */}
      {category === "health" ? (
        <HealthTagFilter posts={posts} />
      ) : (
        <PostList posts={posts} category={category} />
      )}
      <FloatingWriteButton />
    </div>
  );
}
