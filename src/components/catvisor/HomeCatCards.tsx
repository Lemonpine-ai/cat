import type { CatProfileRow } from "@/types/cat";
import { CatCard } from "./CatCard";
import styles from "./CatvisorHomeDashboard.module.css";

type HomeCatCardsProps = {
  cats: CatProfileRow[];
  fetchErrorMessage: string | null;
  /** 접힘 패널 안에 넣을 때 상단 제목 숨김 */
  hideSectionTitle?: boolean;
};

/**
 * 등록된 고양이가 없을 때 사용자에게 보여주는 등록 절차 안내 카드입니다.
 */
function CatRegistrationGuide() {
  return (
    <div className={styles.catRegistrationGuide}>
      <div className={styles.catRegistrationIconWrap} aria-hidden>🐱</div>
      <h2 className={styles.catRegistrationTitle}>고양이를 등록해보세요</h2>
      <p className={styles.catRegistrationDesc}>
        아직 등록된 고양이가 없어요. 아래 단계를 따라 우리 고양이를 추가해보세요!
      </p>
      <ol className={styles.catRegistrationSteps}>
        <li>
          <span className={styles.catRegistrationStepNum}>1</span>
          <span>Supabase 대시보드 → <strong>cats</strong> 테이블에 고양이 이름·품종·성별 입력</span>
        </li>
        <li>
          <span className={styles.catRegistrationStepNum}>2</span>
          <span>같은 <strong>home_id</strong>로 연결된 계정에서 로그인</span>
        </li>
        <li>
          <span className={styles.catRegistrationStepNum}>3</span>
          <span>홈 화면을 새로고침하면 고양이 카드가 나타납니다 🎉</span>
        </li>
      </ol>
    </div>
  );
}

/**
 * Supabase cats 행을 카드 그리드로 표시합니다. 각 카드는 상태 버튼으로 `cats.status` 를 갱신합니다.
 * 등록된 고양이가 없으면 `CatRegistrationGuide` 를 보여줍니다.
 */
export function HomeCatCards({
  cats,
  fetchErrorMessage,
  hideSectionTitle = false,
}: HomeCatCardsProps) {
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
        <CatRegistrationGuide />
      </div>
    );
  }

  return (
    <section className={styles.catSection} aria-label="우리 고양이">
      {hideSectionTitle ? null : (
        <h2 className={styles.catSectionTitle}>우리 고양이</h2>
      )}
      <div className={styles.catCardGrid}>
        {cats.map((cat) => (
          <CatCard key={cat.id} cat={cat} homeId={cat.home_id} />
        ))}
      </div>
    </section>
  );
}
