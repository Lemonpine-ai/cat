/**
 * cat-identity Tier 1 fix R1 #5 — 상수 모음.
 *
 * validate / extractHsv / upload 곳곳에 흩어진 매직 넘버를 한 곳으로 모아 수정 시 일관성 보장.
 */

/** 이름 최대 글자수. */
export const NAME_MAX = 30;

/** 품종 최대 글자수. */
export const BREED_MAX = 30;

/** 체중 최소 (kg). 0 은 의미 없음. */
export const WEIGHT_MIN = 0.1;

/** 체중 최대 (kg). 30 = 비현실적 상한 (대형 고양이 ~10kg). */
export const WEIGHT_MAX = 30;

/** HSV 추출 다운샘플 타깃 해상도 (TARGET × TARGET). */
export const HSV_TARGET = 256;

/** HSV 추출 시 중앙 crop 비율 (0.5 = 중앙 50% 만 사용 — 배경 제외). */
export const HSV_CROP_RATIO = 0.5;

/** Hue 히스토그램 bin 개수 (18 × 20도). */
export const HSV_BIN_COUNT = 18;

/** 채도 컷오프 (이하 무채색 제외). */
export const HSV_SAT_THRESHOLD = 0.2;

/** 명도 컷오프 (이하 너무 어두움 제외). */
export const HSV_VAL_THRESHOLD = 0.15;

/** 업로드 가능한 최대 파일 크기 (5 MB). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** 허용 MIME 타입 (jpeg / png / webp / heic / heif). */
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type AllowedMime = (typeof ALLOWED_MIME)[number];
