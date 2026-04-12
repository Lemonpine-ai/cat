"use client";

import styles from "./Fgs.module.css";

type Props = {
  /** 동의 완료 시 콜백 */
  onAgree: () => void;
  /** 거부 시 콜백 */
  onDecline: () => void;
};

/**
 * FGS 프라이버시 동의 모달 — 최초 1회 표시
 * - 동의하면 고양이 사진이 AI 개선에 활용됨
 * - 거부하면 FGS 점수만 기록, 사진은 저장 안 함
 */
export function FgsConsentModal({ onAgree, onDecline }: Props) {
  return (
    <div className={styles.consentOverlay}>
      <div className={styles.consentModal}>
        <div className={styles.consentTitle}>
          AI 표정 분석 동의 🐱
        </div>
        <div className={styles.consentBody}>
          CATvisor는 고양이 표정을 AI로 분석하여
          통증 징후를 조기에 발견합니다.
          <br /><br />
          <strong>수집하는 정보:</strong>
          <br />
          - 고양이 얼굴 사진 (배경 제거, 고양이 얼굴만 저장)
          <br />
          - AI 분석 점수
          <br /><br />
          <strong>사람 얼굴은 저장하지 않습니다.</strong>
          <br />
          수집된 데이터는 AI 개선에 활용되며,
          설정에서 언제든 철회할 수 있습니다.
        </div>
        <div className={styles.consentActions}>
          <button
            className={styles.consentDecline}
            onClick={onDecline}
          >
            나중에
          </button>
          <button
            className={styles.consentAgree}
            onClick={onAgree}
          >
            동의하고 시작
          </button>
        </div>
      </div>
    </div>
  );
}
