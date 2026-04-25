/**
 * cat-identity Tier 1 — 정면 사진 선택/촬영 컴포넌트.
 *
 * <input type=file accept="image/*" capture="environment">:
 *  - iOS/Android 모바일: "카메라 / 라이브러리" 선택 시트 자동 노출
 *  - PC: 파일 선택 대화상자
 *
 * 클라이언트 검증 (업로드 전 차단):
 *  - 크기: 5MB 이하
 *  - MIME: jpeg / png / webp / heic / heif
 *
 * 프리뷰 URL 은 URL.createObjectURL 로 생성 → 언마운트/재선택 시 revokeObjectURL 로 해제.
 */

"use client";

import { memo, useEffect, useRef, useState } from "react";
import { MAX_FILE_BYTES, ALLOWED_MIME } from "@/lib/cat/constants";
import { CAT_MESSAGES } from "@/lib/cat/messages";
import styles from "./CatRegistrationScreen.module.css";

/* fix R4-3 M6 — 로컬 MAX_FILE_BYTES / ALLOWED_MIME 재정의 제거.
 * 단일 출처 src/lib/cat/constants.ts 사용 — 변경 시 한 곳만 수정. */

export type CatPhotoPickerProps = {
  /** 현재 선택된 파일 (상위 state). null 이면 비어있음. */
  file: File | null;
  /** 사용자가 파일을 선택/제거할 때 호출. null = 제거. */
  onChange: (file: File | null) => void;
  /** 에러 메시지 (상위에서 주입 — validateCatDraft 나 MIME 거부). */
  errorMessage?: string | null;
};

/* fix R2 R6-1 — React.memo 로 props 변경 없을 때 리렌더 차단.
 * 부모 (CatProfileForm) 가 onChange 를 useCallback 으로 안정화해야 효과 발생. */
function CatPhotoPickerImpl({ file, onChange, errorMessage }: CatPhotoPickerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* 프리뷰 URL 생성/해제 — 파일 바뀔 때마다 구 URL revoke */
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const handleFileSelect = (selected: File | null) => {
    setLocalError(null);
    if (!selected) {
      onChange(null);
      return;
    }
    /* fix R4-3 M6 — messages.ts 단일 출처 사용 (inline 한국어 문자열 제거). */
    if (!ALLOWED_MIME.includes(selected.type as (typeof ALLOWED_MIME)[number])) {
      setLocalError(CAT_MESSAGES.photoMimeInvalid);
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setLocalError(CAT_MESSAGES.photoSizeTooLarge);
      return;
    }
    onChange(selected);
  };

  const displayError = localError ?? errorMessage ?? null;

  return (
    <div className={styles.photoPicker}>
      <label className={styles.photoLabel}>정면 사진 (선택)</label>
      {previewUrl ? (
        <div className={styles.photoPreviewWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 blob URL 은 next/image 가 처리 불가 */}
          <img src={previewUrl} alt="선택한 고양이 사진 미리보기" className={styles.photoPreview} />
          <button
            type="button"
            className={styles.photoRemoveBtn}
            onClick={() => handleFileSelect(null)}
            aria-label="사진 제거"
          >
            ✕ 사진 제거
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.photoPlaceholder}
          onClick={() => inputRef.current?.click()}
        >
          📷 사진 추가하기
          <span className={styles.photoPlaceholderHint}>카메라 또는 갤러리</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.photoInput}
        onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
      />
      {displayError && <div className={styles.fieldError}>{displayError}</div>}
    </div>
  );
}

/* fix R2 R6-1 — memo 래핑 export. */
export const CatPhotoPicker = memo(CatPhotoPickerImpl);
