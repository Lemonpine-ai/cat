"use client";

import { useState } from "react";

import styles from "./ProjectCreationForm.module.css";
import type {
  ProjectCreationFormState,
  ProjectCreationPreview,
} from "../types/projectCreationFormState";

const initialProjectCreationFormState: ProjectCreationFormState = {
  projectDisplayName: "",
  objectClassNameText: "",
  datasetGoalDescription: "",
  sourceVideoDescription: "",
};

type ProjectCreationFieldName = keyof ProjectCreationFormState;

function createProjectCreationPreview({
  projectCreationFormState,
}: {
  projectCreationFormState: ProjectCreationFormState;
}): ProjectCreationPreview {
  const objectClassNameList = projectCreationFormState.objectClassNameText
    .split(",")
    .map((objectClassName) => objectClassName.trim())
    .filter(Boolean);

  return {
    projectDisplayName: projectCreationFormState.projectDisplayName.trim(),
    objectClassNameList,
    datasetGoalDescription:
      projectCreationFormState.datasetGoalDescription.trim(),
    sourceVideoDescription:
      projectCreationFormState.sourceVideoDescription.trim(),
    recommendedNextStepList: [
      "다음 작업으로 업로드 API와 파일 저장 구조를 연결합니다.",
      "샘플 영상 1개로 프레임 추출이 끝까지 동작하는지 확인합니다.",
      "자동 라벨 초안 기능을 붙이기 전에 클래스 이름을 확정합니다.",
    ],
  };
}

export default function ProjectCreationForm() {
  const [projectCreationFormState, setProjectCreationFormState] =
    useState<ProjectCreationFormState>(initialProjectCreationFormState);
  const [projectCreationPreview, setProjectCreationPreview] =
    useState<ProjectCreationPreview | null>(null);

  const isProjectCreationReady =
    projectCreationFormState.projectDisplayName.trim().length > 0 &&
    projectCreationFormState.objectClassNameText.trim().length > 0 &&
    projectCreationFormState.datasetGoalDescription.trim().length > 0;

  function updateProjectCreationField({
    fieldName,
    fieldValue,
  }: {
    fieldName: ProjectCreationFieldName;
    fieldValue: string;
  }) {
    setProjectCreationFormState((previousProjectCreationFormState) => ({
      ...previousProjectCreationFormState,
      [fieldName]: fieldValue,
    }));
  }

  function handleProjectCreationSubmit({
    submittedEvent,
  }: {
    submittedEvent: React.FormEvent<HTMLFormElement>;
  }) {
    submittedEvent.preventDefault();

    setProjectCreationPreview(
      createProjectCreationPreview({
        projectCreationFormState,
      }),
    );
  }

  return (
    <section className={styles.formPanel}>
      <div className={styles.formHeader}>
        <h2 className={styles.formTitle}>첫 프로젝트 초안 만들기</h2>
        <p className={styles.formDescription}>
          아직 백엔드가 연결되지 않았더라도 괜찮습니다. 지금 단계의 목표는
          사용자가 어떤 프로젝트를 만들지 명확하게 정의하고, 다음 구현 작업으로
          자연스럽게 넘어갈 수 있는 화면을 만드는 것입니다.
        </p>
      </div>

      <form
        className={styles.fieldGrid}
        onSubmit={(submittedEvent) =>
          handleProjectCreationSubmit({
            submittedEvent,
          })
        }
      >
        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>프로젝트 이름</span>
          <span className={styles.fieldHint}>
            예시: 실내 반려견 장난감 탐지기, 공장 안전모 탐지 학습기
          </span>
          <input
            className={styles.fieldInput}
            name="projectDisplayName"
            placeholder="무엇을 만들고 싶은지 한눈에 드러나는 이름을 적어주세요."
            value={projectCreationFormState.projectDisplayName}
            onChange={(changeEvent) =>
              updateProjectCreationField({
                fieldName: "projectDisplayName",
                fieldValue: changeEvent.target.value,
              })
            }
          />
        </label>

        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>탐지할 클래스 목록</span>
          <span className={styles.fieldHint}>
            쉼표로 구분해서 적어주세요. 예시: cat, food_bowl, litter_box
          </span>
          <input
            className={styles.fieldInput}
            name="objectClassNameText"
            placeholder="person, helmet, vest"
            value={projectCreationFormState.objectClassNameText}
            onChange={(changeEvent) =>
              updateProjectCreationField({
                fieldName: "objectClassNameText",
                fieldValue: changeEvent.target.value,
              })
            }
          />
        </label>

        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>데이터 목적 설명</span>
          <span className={styles.fieldHint}>
            이 데이터를 왜 모으는지, 모델이 어떤 장면을 구분해야 하는지 적어주세요.
          </span>
          <textarea
            className={styles.fieldTextarea}
            name="datasetGoalDescription"
            placeholder="실내 CCTV 영상에서 반려동물과 급식기 위치를 탐지해 활동 구간을 분석하려고 합니다."
            value={projectCreationFormState.datasetGoalDescription}
            onChange={(changeEvent) =>
              updateProjectCreationField({
                fieldName: "datasetGoalDescription",
                fieldValue: changeEvent.target.value,
              })
            }
          />
        </label>

        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>예상 영상 소스 설명</span>
          <span className={styles.fieldHint}>
            어떤 카메라, 어떤 각도, 어떤 길이의 영상을 다룰지 미리 적어두면
            다음 작업이 쉬워집니다.
          </span>
          <textarea
            className={styles.fieldTextarea}
            name="sourceVideoDescription"
            placeholder="거실 상단 고정 카메라에서 30초~2분 길이의 mp4 영상을 업로드할 예정입니다."
            value={projectCreationFormState.sourceVideoDescription}
            onChange={(changeEvent) =>
              updateProjectCreationField({
                fieldName: "sourceVideoDescription",
                fieldValue: changeEvent.target.value,
              })
            }
          />
        </label>

        <button
          className={styles.submitButton}
          type="submit"
          disabled={!isProjectCreationReady}
        >
          프로젝트 초안 생성하기
        </button>
      </form>

      {projectCreationPreview ? (
        <section className={styles.previewPanel}>
          <h3 className={styles.previewTitle}>로컬 프로젝트 초안이 준비되었습니다</h3>
          <div className={styles.previewGrid}>
            <div className={styles.previewItem}>
              <span className={styles.previewLabel}>프로젝트 이름</span>
              <p className={styles.previewValue}>
                {projectCreationPreview.projectDisplayName}
              </p>
            </div>

            <div className={styles.previewItem}>
              <span className={styles.previewLabel}>탐지 클래스</span>
              <div className={styles.classChipList}>
                {projectCreationPreview.objectClassNameList.map(
                  (objectClassName) => (
                    <span className={styles.classChip} key={objectClassName}>
                      {objectClassName}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className={styles.previewItem}>
              <span className={styles.previewLabel}>데이터 목적</span>
              <p className={styles.previewValue}>
                {projectCreationPreview.datasetGoalDescription}
              </p>
            </div>

            <div className={styles.previewItem}>
              <span className={styles.previewLabel}>예상 영상 소스</span>
              <p className={styles.previewValue}>
                {projectCreationPreview.sourceVideoDescription ||
                  "아직 입력되지 않았습니다."}
              </p>
            </div>

            <div className={styles.previewItem}>
              <span className={styles.previewLabel}>다음 구현 제안</span>
              <ol className={styles.checklist}>
                {projectCreationPreview.recommendedNextStepList.map(
                  (recommendedNextStep) => (
                    <li key={recommendedNextStep}>{recommendedNextStep}</li>
                  ),
                )}
              </ol>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
