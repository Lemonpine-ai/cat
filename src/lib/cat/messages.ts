/**
 * cat-identity Tier 1 fix R1 #5 — 사용자에게 노출되는 메시지 모음.
 *
 * 한국어 톤·표현 일관성 유지 + i18n 도입 시 단일 진입점.
 */

import { NAME_MAX, BREED_MAX, WEIGHT_MIN, WEIGHT_MAX } from "./constants";

export const CAT_MESSAGES = {
  // validation
  nameRequired: "이름을 입력해 주세요",
  nameTooLong: `이름은 ${NAME_MAX}자 이내로 입력해 주세요`,
  breedRequired: "품종을 선택하거나 입력해 주세요",
  breedTooLong: `품종은 ${BREED_MAX}자 이내로 입력해 주세요`,
  birthRequired: "생년월일을 입력해 주세요",
  birthInvalid: "올바른 날짜 형식이 아니에요",
  birthFuture: "미래 날짜는 선택할 수 없어요",
  weightNotNumber: "체중은 숫자만 입력해 주세요",
  weightOutOfRange: `체중은 ${WEIGHT_MIN}~${WEIGHT_MAX} kg 사이로 입력해 주세요`,
  // submission
  duplicateName: "이미 같은 이름의 고양이가 등록되어 있어요",
  alreadyRegistered: "이미 등록되어 있어요. 홈으로 이동해요.",
  timeout: "네트워크가 불안정해요. 잠시 후 다시 시도해 주세요.",
  unknownError: "알 수 없는 오류가 발생했어요",
  validationGeneric: "입력값을 확인해 주세요",
  insertFailedPrefix: "등록에 실패했어요. ",
  photoUpdateFailedPrefix: "사진은 올렸지만 프로필에 반영하지 못했어요.",
  // photo
  photoDecodeFailed: "사진을 읽지 못했어요. 다른 사진으로 시도해 주세요.",
  photoMimeInvalid: "지원하지 않는 파일 형식이에요. JPG/PNG/WebP/HEIC 만 가능합니다.",
} as const;

export type CatMessageKey = keyof typeof CAT_MESSAGES;
