/**
 * cat-identity Tier 1 — 고양이 등록 화면 상위 컨테이너 (Client Component).
 *
 * 책임:
 *  - CatDraft state 소유 (필수 4 + 사진 + 옵션 7 필드 통합)
 *  - 옵션 섹션 아코디언 펼침/닫힘 상태 (한 필드 아끼려고 useState 2개: draft + showOptional)
 *  - validate + useCatRegistration.submit 연결
 *  - 성공 시 router.replace("/") — stack pollution 방지
 *
 * CLAUDE.md 준수:
 *  - useState 3개 (draft / showOptional / errors) — 한도 8 내
 *  - useEffect 0개
 *  - 본 파일 단독 LOC 100 라인 근처 유지 (필수/옵션 섹션은 각 서브 컴포넌트로 분리)
 */

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CatDraft } from "@/types/cat";
import { useCatRegistration } from "@/hooks/useCatRegistration";
import {
  validateCatDraft,
  type ValidationError,
} from "@/lib/cat/validateCatDraft";
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
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const { submit, state, errorMessage } = useCatRegistration({ homeId });

  const onSubmit = useCallback(async () => {
    /* 제출 직전 validation — 훅 안에서도 다시 돌지만 UI 에러 표시는 여기가 담당 */
    const errs = validateCatDraft(draft);
    setErrors(errs);
    if (errs.length > 0) return;

    const result = await submit(draft);
    if (result.kind === "ok") {
      /* 성공: 홈 복귀. newCatId 쿼리는 Tier 4 에서 활용 예정 (현재는 안 함) */
      router.replace("/");
    }
    /* 실패 시 errorMessage 가 자동으로 배너에 표시됨 (훅이 setState) */
  }, [draft, submit, router]);

  const submitting = state === "submitting";

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

      {showOptional && (
        <CatOptionalFields draft={draft} onChange={setDraft} errors={errors} />
      )}

      {errorMessage && (
        <div role="alert" className={styles.errorBanner}>
          {errorMessage}
        </div>
      )}

      <div className={styles.footer}>
        <button
          type="button"
          onClick={() => router.back()}
          className={styles.btnSecondary}
          disabled={submitting}
        >
          취소
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className={styles.btnPrimary}
        >
          {submitting ? "등록 중..." : "등록하기"}
        </button>
      </div>
    </main>
  );
}
