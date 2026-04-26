/**
 * cat-identity Tier 1 — 고양이 등록 화면 상위 컨테이너 (Client Component).
 *
 * fix R5-2 R3-1 단순화 — 318줄 (본체 232줄) → 본체 ≤ 100줄:
 *  - submit / retry / skip / 에러 배너 / 토스트 분기 등 흐름 책임을 useCatSubmitFlow 로 이전.
 *  - 본 컴포넌트는 draft 상태 + isDirty memo + 옵션 펼침 + JSX 만 담당.
 *
 * CLAUDE.md 준수:
 *  - useState 1개 (draft + showOptional + 단순 boolean) — 한도 8 내
 *  - useCallback 1개 (onCancel — 라우팅)
 *  - useEffect 0개 (배너 effect 는 useCatSubmitFlow 로 이전)
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatDraft } from "@/types/cat";
import { useCatSubmitFlow } from "@/hooks/useCatSubmitFlow";
import { CatProfileForm } from "./CatProfileForm";
import { CatOptionalFields } from "./CatOptionalFields";
import styles from "./CatRegistrationScreen.module.css";

/** 폼 초기 draft — 사용자 처음 진입 시 화면 값. */
const INITIAL_DRAFT: CatDraft = {
  name: "",
  breed: "",
  birthDate: "",
  sex: "unknown",
  photoFile: null,
  isNeutered: "unknown",
  weightKg: "",
  medicalNotes: "",
  medications: "",
  supplements: "",
  litterType: "",
  foodType: "",
};

export type CatRegistrationScreenProps = {
  /** 서버 컴포넌트에서 이미 해석한 home_id — 클라이언트 auth 호출 중복 제거. */
  homeId: string;
};

export function CatRegistrationScreen({ homeId }: CatRegistrationScreenProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<CatDraft>(INITIAL_DRAFT);
  const [showOptional, setShowOptional] = useState(false);

  /* R5-2 R3-1 — submit/retry/skip 흐름 + 에러 배너 effect 위임. */
  const flow = useCatSubmitFlow({ homeId, draft, setShowOptional });
  const { onSubmit, onRetryPhoto, onSkipPhoto, errors, state, errorMessage,
    uploadFailedCatId, errorBannerRef } = flow;

  /* R4-5 m21 — isDirty 매 렌더 trim ×10 호출 회피 (useMemo). */
  const isDirty = useMemo(
    () =>
      draft.name.trim() !== "" || draft.breed.trim() !== "" || draft.birthDate !== "" ||
      draft.photoFile !== null || draft.weightKg.trim() !== "" ||
      draft.medicalNotes.trim() !== "" || draft.medications.trim() !== "" ||
      draft.supplements.trim() !== "" || draft.litterType !== "" || draft.foodType.trim() !== "",
    [draft],
  );

  const onCancel = useCallback(() => {
    if (isDirty && typeof window !== "undefined" &&
        !window.confirm("입력한 내용이 사라져요. 정말 취소할까요?")) {
      return;
    }
    router.back();
  }, [isDirty, router]);

  const submitting = state === "submitting";
  const showValidationBanner = errors.length > 0;
  const showBanner = !!errorMessage;
  const showRetryActions =
    !!uploadFailedCatId && draft.photoFile !== null && !showValidationBanner;

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <h1 className={styles.title}>🐱 우리 고양이 등록하기</h1>
        <p className={styles.subtitle}>
          기본 정보만 입력해도 등록돼요. 자세한 정보는 나중에 추가 가능해요.
        </p>
      </header>

      <CatProfileForm draft={draft} onChange={setDraft} errors={errors} />

      <button
        type="button"
        onClick={() => setShowOptional((v) => !v)}
        className={styles.optionalToggle}
        aria-expanded={showOptional}
      >
        {showOptional ? "▼ 추가 정보 접기" : "▶ 더 자세히 입력하기 (선택)"}
      </button>

      {/* R1 #2 — 항상 렌더 + max-height transition (재마운트 비용 제거). */}
      <div
        className={showOptional ? `${styles.optionalSection} ${styles.open}` : styles.optionalSection}
        aria-hidden={!showOptional}
      >
        <CatOptionalFields draft={draft} onChange={setDraft} errors={errors} />
      </div>

      {showBanner && (
        <div role="alert" ref={errorBannerRef} className={styles.errorBanner}>
          <p>{errorMessage}</p>
          {showRetryActions && (
            <div className={styles.errorActions}>
              <button type="button" onClick={onRetryPhoto} disabled={submitting}>
                사진 다시 시도하기
              </button>
              <button type="button" onClick={onSkipPhoto} disabled={submitting}>
                사진 없이 완료하기
              </button>
            </div>
          )}
        </div>
      )}

      <div className={styles.footer}>
        <button type="button" onClick={onCancel} className={styles.btnSecondary} disabled={submitting}>
          취소
        </button>
        <button type="button" onClick={onSubmit} disabled={submitting} className={styles.btnPrimary}>
          {submitting ? "등록 중..." : "등록하기"}
        </button>
      </div>
    </main>
  );
}
