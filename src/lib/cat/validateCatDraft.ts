/**
 * cat-identity Tier 1 — 등록 폼 validation.
 *
 * 필수 4 필드 + 옵션 제약 (체중 범위). 에러 배열 반환 — 호출자는 각 필드 옆에 표시.
 * 순수 함수 (side effect 없음, fuzz/invariants 테스트 가능).
 *
 * @example
 *   const errors = validateCatDraft(draft);
 *   if (errors.length > 0) {
 *     showError(errors[0].message);
 *     return;
 *   }
 */

import type { CatDraft } from "@/types/cat";
import {
  NAME_MAX,
  BREED_MAX,
  WEIGHT_MIN,
  WEIGHT_MAX,
} from "./constants";
import { CAT_MESSAGES } from "./messages";

export type CatDraftField =
  | "name"
  | "breed"
  | "birthDate"
  | "sex"
  | "photoFile"
  | "weightKg"
  | "medicalNotes"
  | "medications"
  | "supplements"
  | "litterType"
  | "foodType"
  | "isNeutered";

export type ValidationError = {
  field: CatDraftField;
  message: string;
};

/**
 * 텍스트 필드 길이 검증 헬퍼 (fix R1 #4 단순화).
 * - 빈 값 → required 가 아니면 호출자가 책임 (여기선 길이만)
 * - 길이 초과 → ValidationError 반환
 */
function lengthError(
  field: CatDraftField,
  value: string,
  max: number,
  message: string,
): ValidationError | null {
  if (value.length > max) {
    return { field, message };
  }
  return null;
}

/**
 * CatDraft → 에러 배열. 빈 배열 = 유효.
 * - 필수 4: name / breed / birthDate / sex
 * - 사진: 선택 (null 허용 — 에러 아님)
 * - 옵션: 입력됐을 때만 범위 체크
 */
export function validateCatDraft(draft: CatDraft): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1) 이름 (필수)
  const nameTrimmed = draft.name.trim();
  if (!nameTrimmed) {
    errors.push({ field: "name", message: CAT_MESSAGES.nameRequired });
  } else {
    const e = lengthError("name", nameTrimmed, NAME_MAX, CAT_MESSAGES.nameTooLong);
    if (e) errors.push(e);
  }

  // 2) 품종 (필수)
  const breedTrimmed = draft.breed.trim();
  if (!breedTrimmed) {
    errors.push({ field: "breed", message: CAT_MESSAGES.breedRequired });
  } else {
    const e = lengthError("breed", breedTrimmed, BREED_MAX, CAT_MESSAGES.breedTooLong);
    if (e) errors.push(e);
  }

  // 3) 생년월일 (필수)
  if (!draft.birthDate) {
    errors.push({ field: "birthDate", message: CAT_MESSAGES.birthRequired });
  } else {
    const d = new Date(draft.birthDate);
    if (!Number.isFinite(d.getTime())) {
      errors.push({ field: "birthDate", message: CAT_MESSAGES.birthInvalid });
    } else if (d.getTime() > Date.now()) {
      errors.push({ field: "birthDate", message: CAT_MESSAGES.birthFuture });
    }
  }

  // 4) 성별 — 3상태 라디오, "unknown" 기본값이라 항상 유효 (에러 없음)

  // 5) 체중 (옵션) — 입력됐을 때만 범위 체크
  const weightTrimmed = draft.weightKg.trim();
  if (weightTrimmed) {
    const w = parseFloat(weightTrimmed);
    if (!Number.isFinite(w)) {
      errors.push({ field: "weightKg", message: CAT_MESSAGES.weightNotNumber });
    } else if (w < WEIGHT_MIN || w > WEIGHT_MAX) {
      errors.push({
        field: "weightKg",
        message: CAT_MESSAGES.weightOutOfRange,
      });
    }
  }

  return errors;
}

/** 특정 필드의 에러 메시지 (UI 에러 표시용). 없으면 null. */
export function getFieldError(
  errors: ValidationError[],
  field: CatDraftField,
): string | null {
  return errors.find((e) => e.field === field)?.message ?? null;
}
