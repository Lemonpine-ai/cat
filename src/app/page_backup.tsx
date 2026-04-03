import styles from "./page.module.css";
import ProjectCreationForm from "@/features/project-creation/components/ProjectCreationForm";

/**
 * Task 3 백업: VisionLearningStudio 딥러닝 가이드 홈 (원래 기본 `page.tsx`).
 * 현재 라우트는 `page.tsx`에서 CATvisor로 교체됨. 복구 시 내용을 참고하세요.
 */
const productStepList = [
  "프로젝트 이름과 탐지 클래스를 먼저 확정합니다.",
  "샘플 영상을 업로드하고 프레임 추출 흐름을 연결합니다.",
  "자동 라벨 초안과 검수 화면을 이어 붙입니다.",
  "객체 탐지 모델 학습 실행과 결과 대시보드를 구현합니다.",
];

const productValueCardList = [
  {
    title: "비전공자 친화적 흐름",
    description:
      "영상 업로드부터 추론 결과 확인까지의 과정을 한 단계씩 따라갈 수 있게 구성합니다.",
  },
  {
    title: "Cursor 친화형 작업 분할",
    description:
      "한 화면, 한 API, 한 작업 함수 단위로 쪼개서 바이브코딩이 흔들리지 않게 유지합니다.",
  },
  {
    title: "작동하는 MVP 우선",
    description:
      "고급 기능보다 업로드, 프레임 추출, 라벨, 학습, 추론까지 끝까지 이어지는 흐름을 먼저 완성합니다.",
  },
];

export default function HomePageTask3Backup() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.heroSection}>
          <div className={styles.heroTextBlock}>
            <span className={styles.eyebrow}>VisionLearningStudio</span>
            <h1 className={styles.heroTitle}>
              영상 기반 딥러닝 프로젝트를
              <br />
              작은 단계로 끝까지 완성하는 첫 화면
            </h1>
            <p className={styles.heroDescription}>
              이 화면은 `task 3` 구현 결과입니다. 지금 단계에서는 화려한 기능보다
              프로젝트를 시작할 수 있는 명확한 입력 흐름과 다음 작업으로 이어지는
              구조를 만드는 것이 더 중요합니다.
            </p>
          </div>

          <div className={styles.cardGrid}>
            {productValueCardList.map((productValueCard) => (
              <article className={styles.valueCard} key={productValueCard.title}>
                <h2 className={styles.valueCardTitle}>{productValueCard.title}</h2>
                <p className={styles.valueCardDescription}>
                  {productValueCard.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.roadmapSection}>
          <div className={styles.sectionHeadingBlock}>
            <h2 className={styles.sectionTitle}>지금 바로 보이는 다음 흐름</h2>
            <p className={styles.sectionDescription}>
              PRD의 큰 구조를 프론트엔드 기준으로 풀어내면 아래 순서가 됩니다.
              이 순서를 기준으로 Cursor에게 다음 작업을 하나씩 맡기면 됩니다.
            </p>
          </div>

          <ol className={styles.stepList}>
            {productStepList.map((productStep) => (
              <li className={styles.stepItem} key={productStep}>
                {productStep}
              </li>
            ))}
          </ol>
        </section>

        <ProjectCreationForm />
      </main>
    </div>
  );
}
