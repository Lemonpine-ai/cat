import { CategoryCard } from "@/components/community/CategoryCard";
import {
  COMMUNITY_CATEGORIES,
  type CommunityCategoryKey,
} from "@/types/community";
import styles from "@/components/community/Community.module.css";

/**
 * 커뮤니티 메인 — 4개 카테고리를 2x2 그리드로 표시.
 * 각 카드를 클릭하면 해당 카테고리 글 목록으로 이동한다.
 */
export default function CommunityPage() {
  const keys = Object.keys(COMMUNITY_CATEGORIES) as CommunityCategoryKey[];

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>커뮤니티</h1>
        <p className={styles.pageDesc}>고양이 집사들의 이야기 공간</p>
      </div>

      <div className={styles.categoryGrid}>
        {keys.map((key) => {
          const cat = COMMUNITY_CATEGORIES[key];
          return (
            <CategoryCard
              key={key}
              categoryKey={key}
              name={cat.name}
              description={cat.description}
              icon={cat.icon}
              href={`/community/${key}`}
            />
          );
        })}
      </div>
    </div>
  );
}
