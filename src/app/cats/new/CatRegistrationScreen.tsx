/**
 * cat-identity Tier 1 — 고양이 등록 화면 상위 컨테이너 (Client Component).
 *
 * 책임:
 *  - CatDraft state 소유 (필수 4 + 사진 + 옵션 7 필드 통합)
 *  - 옵션 섹션 아코디언 펼침/닫힘 상태 (한 필드 아끼려고 useState 2개: draft + showOptional)
 *  - validate + useCatRegistration.submit 연결
 *  - 성공 시 router.replace("/") — stack pollution 방지
 *
 * fix R4-2 사용자 흐름 (C2/C3/M2/M3/M5):
 *  - C3: submittingRef (useRef) 동기 가드 — disabled state 적용 전 두 번째 클릭 차단.
 *  - M2: UPLOAD_FAILED 시 uploadFailedCatId 보존 + ErrorBanner 에 액션 버튼 2개
 *        ("사진 다시 시도하기" / "사진 없이 완료하기").
 *  - M3: result.alreadyExisted 분기 → ALREADY_TOAST_KEY 로 다른 토스트 노출.
 *  - M5: validation 에러에 옵션 필드 포함 시 자동 펼침 + top-level 배너.
 *
 * CLAUDE.md 준수:
 *  - useState 4개 (draft / showOptional / errors / uploadFailedCatId) — 한도 8 내
 *  - useRef 1개 (submittingRef — 동기 가드)
 *  - useEffect 1개 (errorBanner scrollIntoView, fix R1 #3)
 *  - 본 파일 단독 LOC 200 라인 근처 (필수/옵션 섹션은 각 서브 컴포넌트로 분리)
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatDraft } from "@/types/cat";
import { useCatRegistration } from "@/hooks/useCatRegistration";
import {
  validateCatDraft,
  type ValidationError,
} from "@/lib/cat/validateCatDraft";
import { CAT_MESSAGES } from "@/lib/cat/messages";
import { CatProfileForm } from "./CatProfileForm";
import { CatOptionalFields } from "./CatOptionalFields";
import styles from "./CatRegistrationScreen.module.css";

/** 등록 직후 홈에서 환영 토스트 띄우기 위한 sessionStorage 키 (HomeProfileRow 와 공유). */
const WELCOME_TOAST_KEY = "cat-welcome-name";

/**
 * fix R4-2 M3 — 23505 recheck 매칭 케이스: 이미 등록된 고양이.
 * 환영 메시지 ("🎉 ... 환영해요!") 대신 "이미 등록되어 있어요" 안내.
 */
const ALREADY_TOAST_KEY = "cat-already-exists-name";

/**
 * fix R4-2 M5 — validation 에러에 포함되면 옵션 섹션을 자동 펼치는 필드 화이트리스트.
 * 사용자가 옵션을 접은 상태에서 weight 등을 잘못 입력하면 에러는 보이는데 입력 위치는 안 보이는 침묵 회피.
 */
const OPTIONAL_FIELD_NAMES = new Set<string>([
  "weightKg",
  "medicalNotes",
  "medications",
  "supplements",
  "litterType",
  "foodType",
  "isNeutered",
]);

/* fix R2 R6-4 — optionalClass 헬퍼 제거.
 * 매 렌더 함수 호출 + 새 문자열 생성 비용을 inline 으로 단순화. */

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
  const [draft, setDraftRaw] = useState<CatDraft>(INITIAL_DRAFT);
  const [showOptional, setShowOptional] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  /* fix R4-2 M2 — UPLOAD_FAILED 시 catId 보존 → 재시도 버튼 노출. */
  const [uploadFailedCatId, setUploadFailedCatId] = useState<string | null>(null);
  const { submit, retryPhotoUpload, state, errorMessage } = useCatRegistration({ homeId });

  /* fix R1 #2 — setDraft 안정화 (자식 React.memo 가 ref 변동으로 깨지는 것 방지). */
  const setDraft = useCallback<typeof setDraftRaw>((next) => {
    setDraftRaw(next);
  }, []);

  /* fix R4-2 C3 — 동기 submit 가드. useState(submitting) 는 비동기 → 두 번째 onClick 이
   * 같은 렌더 사이클에 통과 가능. useRef 는 동기. */
  const submittingRef = useRef<boolean>(false);

  /* fix R1 #3 — 에러 배너 자동 스크롤 (모바일 키보드 위로 가려지는 케이스 방지).
   * fix R4-2 M5 — validation 에러로 인한 배너도 함께 트리거. */
  const errorBannerRef = useRef<HTMLDivElement | null>(null);
  const showValidationBanner = errors.length > 0;
  useEffect(() => {
    if ((errorMessage || showValidationBanner) && errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [errorMessage, showValidationBanner]);

  /* fix R4-5 m21 — isDirty 매 렌더 trim ×10 호출 회피 (useMemo). */
  const isDirty = useMemo(
    () =>
      draft.name.trim() !== "" ||
      draft.breed.trim() !== "" ||
      draft.birthDate !== "" ||
      draft.photoFile !== null ||
      draft.weightKg.trim() !== "" ||
      draft.medicalNotes.trim() !== "" ||
      draft.medications.trim() !== "" ||
      draft.supplements.trim() !== "" ||
      draft.litterType !== "" ||
      draft.foodType.trim() !== "",
    [draft],
  );

  const onCancel = useCallback(() => {
    if (
      isDirty &&
      typeof window !== "undefined" &&
      !window.confirm("입력한 내용이 사라져요. 정말 취소할까요?")
    ) {
      return;
    }
    router.back();
  }, [isDirty, router]);

  /**
   * fix R4-2 M3 연계 — 등록 성공 시 토스트 키 분기 + 홈 이동.
   * alreadyExisted=true → "이미 등록되어 있어요" 토스트, false → "🎉 환영해요" 토스트.
   */
  const handleRegistrationSuccess = useCallback(
    (name: string, alreadyExisted: boolean) => {
      if (typeof window !== "undefined") {
        if (alreadyExisted) {
          window.sessionStorage.setItem(ALREADY_TOAST_KEY, name);
          window.sessionStorage.removeItem(WELCOME_TOAST_KEY);
        } else {
          window.sessionStorage.setItem(WELCOME_TOAST_KEY, name);
          window.sessionStorage.removeItem(ALREADY_TOAST_KEY);
        }
      }
      router.refresh();
      router.replace("/");
    },
    [router],
  );

  const onSubmit = useCallback(async () => {
    /* fix R4-2 C3 — 동기 가드. 같은 렌더 사이클의 두 번째 클릭 즉시 reject. */
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      /* 제출 직전 validation — 훅 안에서도 다시 돌지만 UI 에러 표시는 여기가 담당 */
      const errs = validateCatDraft(draft);
      setErrors(errs);
      if (errs.length > 0) {
        /* fix R4-2 M5 — 옵션 필드 에러 포함 시 옵션 섹션 자동 펼침. */
        const hasOptionalFieldError = errs.some((e) =>
          OPTIONAL_FIELD_NAMES.has(e.field),
        );
        if (hasOptionalFieldError && !showOptional) {
          setShowOptional(true);
        }
        return;
      }

      /* validation 통과 → 이전 에러/upload state 초기화. */
      setUploadFailedCatId(null);

      const result = await submit(draft);
      if (result.kind === "ok") {
        handleRegistrationSuccess(draft.name.trim(), result.alreadyExisted);
        return;
      }
      /* fix R4-2 M2 — UPLOAD_FAILED 시 catId 보존 → 액션 버튼 노출. */
      if (result.code === "UPLOAD_FAILED" && result.catId) {
        setUploadFailedCatId(result.catId);
      }
      /* 그 외 실패는 errorMessage 가 자동으로 배너에 표시됨 (훅이 setState). */
    } catch (err) {
      /* submit 안에서 이미 try/catch — 도달 가능성 낮으나 방어적. */
      // eslint-disable-next-line no-console -- 마지막 보루 (logger 미경유 매우 드문 경로)
      console.error("[CatRegistrationScreen.onSubmit] unexpected", err);
    } finally {
      submittingRef.current = false;
    }
  }, [draft, submit, showOptional, handleRegistrationSuccess]);

  /**
   * fix R4-2 M2 — "사진 다시 시도하기" 버튼.
   * uploadFailedCatId + draft.photoFile 모두 존재해야 한다 (UI 가드 가 이미 보장).
   */
  const onRetryPhoto = useCallback(async () => {
    if (!uploadFailedCatId || !draft.photoFile) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const result = await retryPhotoUpload(uploadFailedCatId, draft.photoFile);
      if (result.kind === "ok") {
        handleRegistrationSuccess(draft.name.trim(), false);
      }
      /* 실패 시 errorMessage 가 그대로 갱신됨 → 같은 액션 버튼 다시 노출. */
    } finally {
      submittingRef.current = false;
    }
  }, [uploadFailedCatId, draft.photoFile, draft.name, retryPhotoUpload, handleRegistrationSuccess]);

  /**
   * fix R4-2 M2 — "사진 없이 완료하기" 버튼.
   * cats row 는 INSERT 됐으나 photo_front_url 만 null 인 상태로 홈 이동.
   */
  const onSkipPhoto = useCallback(() => {
    if (!uploadFailedCatId) return;
    handleRegistrationSuccess(draft.name.trim(), false);
  }, [uploadFailedCatId, draft.name, handleRegistrationSuccess]);

  const submitting = state === "submitting";

  /* fix R4-2 M5 — 배너 텍스트: validation 에러 우선, 그 다음 hook errorMessage. */
  const bannerText = showValidationBanner
    ? CAT_MESSAGES.validationGeneric
    : errorMessage;
  const showBanner = !!bannerText;
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

      {/* fix R1 #2 — 항상 렌더 + max-height transition (재마운트 비용 제거).
       * fix R2 R6-4 — optionalClass 헬퍼 제거 후 inline 클래스 결합. */}
      <div
        className={
          showOptional
            ? `${styles.optionalSection} ${styles.open}`
            : styles.optionalSection
        }
        aria-hidden={!showOptional}
      >
        <CatOptionalFields draft={draft} onChange={setDraft} errors={errors} />
      </div>

      {showBanner && (
        <div role="alert" ref={errorBannerRef} className={styles.errorBanner}>
          <p>{bannerText}</p>
          {showRetryActions && (
            <div className={styles.errorActions}>
              <button
                type="button"
                onClick={onRetryPhoto}
                disabled={submitting}
              >
                사진 다시 시도하기
              </button>
              <button
                type="button"
                onClick={onSkipPhoto}
                disabled={submitting}
              >
                사진 없이 완료하기
              </button>
            </div>
          )}
        </div>
      )}

      <div className={styles.footer}>
        <button
          type="button"
          onClick={onCancel}
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
