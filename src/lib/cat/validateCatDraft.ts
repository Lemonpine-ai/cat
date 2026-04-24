/**
 * cat-identity Tier 1 — 등록 폼 validation.
 *
 * 필수 4 필드 + 옵션 제약 (체중 범위). 에러 배열 반환 — 호출자는 각 필드 옆에 표시.
 * 순수 함수 (side effect 없음, fuzz/invariants 테스트 가능).
 */

import type { CatDraft } from "@/types/cat";

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

/** 이름/품종 최대 글자수 (DB text 는 무제한이지만 UX/모바일 UI 배려). */
const NAME_MAX = 30;
const BREED_MAX = 30;

/** 체중 유효 범위 (kg). */
const WEIGHT_MIN = 0;
const WEIGHT_MAX = 30;

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
    errors.push({ field: "name", message: "이름을 입력해 주세요" });
  } else if (nameTrimmed.length > NAME_MAX) {
    errors.push({ field: "name", message: `이름은 ${NAME_MAX}자 이내로 입력해 주세요` });
  }

  // 2) 품종 (필수)
  const breedTrimmed = draft.breed.trim();
  if (!breedTrimmed) {
    errors.push({ field: "breed", message: "품종을 선택하거나 입력해 주세요" });
  } else if (breedTrimmed.length > BREED_MAX) {
    errors.push({ field: "breed", message: `품종은 ${BREED_MAX}자 이내로 입력해 주세요` });
  }

  // 3) 생년월일 (필수)
  if (!draft.birthDate) {
    errors.push({ field: "birthDate", message: "생년월일을 입력해 주세요" });
  } else {
    const d = new Date(draft.birthDate);
    if (!Number.isFinite(d.getTime())) {
      errors.push({ field: "birthDate", message: "올바른 날짜 형식이 아니에요" });
    } else if (d.getTime() > Date.now()) {
      errors.push({ field: "birthDate", message: "미래 날짜는 선택할 수 없어요" });
    }
  }

  // 4) 성별 — 3상태 라디오, "unknown" 기본값이라 항상 유효 (에러 없음)

  // 5) 체중 (옵션) — 입력됐을 때만 범위 체크
  const weightTrimmed = draft.weightKg.trim();
  if (weightTrimmed) {
    const w = parseFloat(weightTrimmed);
    if (!Number.isFinite(w)) {
      errors.push({ field: "weightKg", message: "체중은 숫자만 입력해 주세요" });
    } else if (w < WEIGHT_MIN || w > WEIGHT_MAX) {
      errors.push({
        field: "weightKg",
        message: `체중은 ${WEIGHT_MIN}~${WEIGHT_MAX} kg 사이로 입력해 주세요`,
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
