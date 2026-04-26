/**
 * cat-identity Tier 1 fix R5-2 R3-1 — 등록 화면 submit 흐름 전용 훅.
 *
 * 기존 CatRegistrationScreen 본체 232줄 — onSubmit / onRetryPhoto / onSkipPhoto / 에러 배너 effect /
 * 한국어 에러 메시지 결정 로직이 모두 컴포넌트 내부에 있어 100줄 한도 2.32배 초과.
 *
 * 본 훅으로 분리하여 화면은 JSX 구조 + draft 상태만 책임. submit/retry/skip 흐름은 모두 본 훅.
 *
 * 책임:
 *  - useCatRegistration 호출 + RegistrationResult 처리.
 *  - submitting 동기 가드 (useRef — useState 비동기 race 차단, R4-2 C3).
 *  - validation 에러 + 옵션 필드 화이트리스트 자동 펼침 (R4-2 M5).
 *  - UPLOAD_FAILED 시 catId 보존 + retry/skip 핸들러 (R4-2 M2).
 *  - alreadyExisted 분기 — 환영/이미등록 토스트 (R4-2 M3).
 *  - 성공 시 router.refresh + replace("/") (stack pollution 방지).
 *
 * 설계 원칙 (Arch fix R5-2 §3.2.2.2):
 *  - useState 2 (errors / uploadFailedCatId) — 한도 8 내.
 *  - useRef 1 (submittingRef — 동기 가드).
 *  - useEffect 1 (errorBanner scrollIntoView).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatDraft } from "@/types/cat";
import { useCatRegistration } from "@/hooks/useCatRegistration";
import {
  validateCatDraft,
  type ValidationError,
} from "@/lib/cat/validateCatDraft";
import { CAT_MESSAGES } from "@/lib/cat/messages";

/** 등록 직후 홈에서 환영 토스트 띄우기 위한 sessionStorage 키. */
const WELCOME_TOAST_KEY = "cat-welcome-name";
/** R4-2 M3 — 23505 recheck 매칭 케이스: "이미 등록되어 있어요" 안내 키. */
const ALREADY_TOAST_KEY = "cat-already-exists-name";

/**
 * R4-2 M5 — validation 에러에 포함되면 옵션 섹션을 자동 펼치는 필드 화이트리스트.
 * 사용자가 옵션을 접은 상태에서 weight 등을 잘못 입력하면 입력 위치가 보이지 않는 침묵 회피.
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

export type UseCatSubmitFlowArgs = {
  homeId: string;
  draft: CatDraft;
  setShowOptional: (next: boolean | ((v: boolean) => boolean)) => void;
};

export type UseCatSubmitFlowReturn = {
  /** 폼 submit 핸들러. */
  onSubmit: () => Promise<void>;
  /** UPLOAD_FAILED 후 "사진 다시 시도하기" 버튼 핸들러. */
  onRetryPhoto: () => Promise<void>;
  /** UPLOAD_FAILED 후 "사진 없이 완료하기" 버튼 핸들러. */
  onSkipPhoto: () => void;
  /** validation 에러 목록 (UI 가 필드별 에러 표시용). */
  errors: ValidationError[];
  /** 진행 상태 — useCatRegistration.state 그대로 노출. */
  state: "idle" | "submitting" | "success" | "error";
  /** 에러 메시지 (한국어 generic). */
  errorMessage: string | null;
  /** UPLOAD_FAILED 시 catId 보존 — UI 가 retry 버튼 노출 여부 판단. */
  uploadFailedCatId: string | null;
  /** 에러 배너 ref — scrollIntoView 트리거 + 포커스 이동. */
  errorBannerRef: React.RefObject<HTMLDivElement | null>;
};

/** sessionStorage 토스트 키 분기 (alreadyExisted 에 따라 다른 키). */
function setWelcomeToast(name: string, alreadyExisted: boolean): void {
  if (typeof window === "undefined") return;
  if (alreadyExisted) {
    window.sessionStorage.setItem(ALREADY_TOAST_KEY, name);
    window.sessionStorage.removeItem(WELCOME_TOAST_KEY);
  } else {
    window.sessionStorage.setItem(WELCOME_TOAST_KEY, name);
    window.sessionStorage.removeItem(ALREADY_TOAST_KEY);
  }
}

export function useCatSubmitFlow(args: UseCatSubmitFlowArgs): UseCatSubmitFlowReturn {
  const { homeId, draft, setShowOptional } = args;
  const router = useRouter();
  const { submit, retryPhotoUpload, state, errorMessage } = useCatRegistration({ homeId });

  const [errors, setErrors] = useState<ValidationError[]>([]);
  /* R4-2 M2 — UPLOAD_FAILED 시 catId 보존 → 재시도 버튼 노출. */
  const [uploadFailedCatId, setUploadFailedCatId] = useState<string | null>(null);

  /* R4-2 C3 — 동기 submit 가드. useState 비동기 → 두 번째 onClick 이 같은 렌더 사이클에 통과 가능.
   * useRef 는 동기 → 즉시 차단. */
  const submittingRef = useRef<boolean>(false);

  /* R1 #3 + R4-2 M5 — 에러 배너 자동 스크롤 (모바일 키보드 위로 가려지는 케이스 방지). */
  const errorBannerRef = useRef<HTMLDivElement | null>(null);
  const showValidationBanner = errors.length > 0;
  useEffect(() => {
    if ((errorMessage || showValidationBanner) && errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [errorMessage, showValidationBanner]);

  /* 등록 성공 시 토스트 키 분기 + 홈 이동 (stack pollution 방지). */
  const handleSuccess = useCallback(
    (name: string, alreadyExisted: boolean) => {
      setWelcomeToast(name, alreadyExisted);
      router.refresh();
      router.replace("/");
    },
    [router],
  );

  const onSubmit = useCallback(async () => {
    /* R4-2 C3 — 같은 렌더 사이클의 두 번째 클릭 즉시 reject. */
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      /* 제출 직전 validation — 훅 안에서도 다시 돌지만 UI 에러 표시는 여기가 담당. */
      const errs = validateCatDraft(draft);
      setErrors(errs);
      if (errs.length > 0) {
        /* R4-2 M5 — 옵션 필드 에러 포함 시 옵션 섹션 자동 펼침. */
        if (errs.some((e) => OPTIONAL_FIELD_NAMES.has(e.field))) {
          setShowOptional(true);
        }
        return;
      }
      /* validation 통과 → 이전 upload state 초기화. */
      setUploadFailedCatId(null);

      const result = await submit(draft);
      if (result.kind === "ok") {
        handleSuccess(draft.name.trim(), result.alreadyExisted);
        return;
      }
      /* R4-2 M2 — UPLOAD_FAILED 시 catId 보존 → 액션 버튼 노출. */
      if (result.code === "UPLOAD_FAILED" && result.catId) {
        setUploadFailedCatId(result.catId);
      }
      /* 그 외 실패는 errorMessage 가 자동으로 배너에 표시 (훅이 setState). */
    } catch (err) {
      /* submit 안에서 이미 try/catch — 도달 가능성 낮으나 방어적. */
      // eslint-disable-next-line no-console -- 마지막 보루 (logger 미경유 매우 드문 경로)
      console.error("[useCatSubmitFlow.onSubmit] unexpected", err);
    } finally {
      submittingRef.current = false;
    }
  }, [draft, submit, setShowOptional, handleSuccess]);

  /** R4-2 M2 — "사진 다시 시도하기" 버튼. */
  const onRetryPhoto = useCallback(async () => {
    if (!uploadFailedCatId || !draft.photoFile) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const result = await retryPhotoUpload(uploadFailedCatId, draft.photoFile);
      if (result.kind === "ok") {
        handleSuccess(draft.name.trim(), false);
      }
      /* 실패 시 errorMessage 갱신 → 같은 액션 버튼 다시 노출. */
    } finally {
      submittingRef.current = false;
    }
  }, [uploadFailedCatId, draft.photoFile, draft.name, retryPhotoUpload, handleSuccess]);

  /** R4-2 M2 — "사진 없이 완료하기" 버튼 (cats row 는 INSERT 됐고 photo_front_url 만 null). */
  const onSkipPhoto = useCallback(() => {
    if (!uploadFailedCatId) return;
    handleSuccess(draft.name.trim(), false);
  }, [uploadFailedCatId, draft.name, handleSuccess]);

  /* validation 우선 + hook errorMessage — 기존 화면 로직 호환. */
  const finalErrorMessage = showValidationBanner
    ? CAT_MESSAGES.validationGeneric
    : errorMessage;

  return {
    onSubmit,
    onRetryPhoto,
    onSkipPhoto,
    errors,
    state,
    errorMessage: finalErrorMessage,
    uploadFailedCatId,
    errorBannerRef,
  };
}
