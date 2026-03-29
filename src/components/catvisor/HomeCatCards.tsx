import type { CatProfileRow } from "@/types/cat";
import { CatCard } from "./CatCard";
import styles from "./CatvisorHomeDashboard.module.css";

type HomeCatCardsProps = {
  cats: CatProfileRow[];
  fetchErrorMessage: string | null;
};

/**
 * Supabase cats 행을 카드 그리드로 표시합니다. 각 카드는 상태 버튼으로 `cats.status` 를 갱신합니다.
 */
export function HomeCatCards({ cats, fetchErrorMessage }: HomeCatCardsProps) {
  if (fetchErrorMessage) {
    return (
      <div className={styles.catSection}>
        <p className={styles.catSectionHint} role="alert">
          고양이 정보를 불러오지 못했습니다. {fetchErrorMessage}
        </p>
      </div>
    );
  }

  if (cats.length === 0) {
    return (
      <div className={styles.catSection}>
        <p className={styles.catSectionHint}>
          등록된 고양이가 없거나, 로그인 후 같은 집(home)에 연결된 프로필에서만 볼 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <section className={styles.catSection} aria-label="우리 고양이">
      <h2 className={styles.catSectionTitle}>우리 고양이</h2>
      <div className={styles.catCardGrid}>
        {cats.map((cat) => (
          <CatCard key={cat.id} cat={cat} homeId={cat.home_id} />
        ))}
      </div>
    </section>
  );
}
