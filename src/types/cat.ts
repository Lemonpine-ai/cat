/**
 * 홈 화면 고양이 카드에 쓰는 최소 필드 (public.cats 기준).
 */
export type CatProfileRow = {
  id: string;
  home_id: string;
  name: string;
  sex: "male" | "female" | "unknown" | null;
  breed: string | null;
  photo_front_url: string | null;
  /** 사용자가 버튼으로 갱신하는 최근 상태 (Supabase `cats.status`) */
  status: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// cat-identity Tier 1 (2026-04-25): 등록 화면용 타입 추가.
// - 필수 4 필드 + 사진 1장 + 옵션 7 필드 구조
// - DB 6 신규 컬럼은 sql/20260425_cats_tier1_fields.sql 참조
// ────────────────────────────────────────────────────────────────────────────

/** 성별 라디오 선택지. */
export type CatSex = "male" | "female" | "unknown";

/** 중성화 3상태 라디오 — "모름" 포함 (미구별/정보 부족 허용). */
export type CatNeuteredStatus = "yes" | "no" | "unknown";

/**
 * 등록 화면 폼 상태 (client-side 만, DB 직접 매핑 아님).
 * - 필수 4: name / breed / birthDate / sex
 * - 사진 1장 (옵션 — null 허용)
 * - 옵션 7 필드 (전부 비어있어도 등록 가능)
 *
 * 모든 문자열 필드는 **원본 그대로** 저장하고, DB INSERT 직전에
 * `catDraftToInsertPayload()` 가 trim + null 변환 수행.
 */
export type CatDraft = {
  // 필수
  name: string;
  breed: string;        // 자동완성 리스트 또는 자유입력 (최대 30자)
  birthDate: string;    // ISO date "YYYY-MM-DD" (<input type=date> 반환 형식)
  sex: CatSex;
  // 사진 (선택)
  photoFile: File | null;
  // 옵션 7
  isNeutered: CatNeuteredStatus;
  weightKg: string;     // number 문자열 — validation 시 parseFloat
  medicalNotes: string;
  medications: string;
  supplements: string;
  litterType: string;   // 드롭다운 value — "기타" 선택 시 자유입력 보조 필드 가능
  foodType: string;     // 자동완성 value 또는 자유입력
};

/**
 * HSV 색상 프로파일 (cats.color_profile JSONB 컬럼 매핑).
 * Tier 1: 등록 사진 1장 자동 추출 / Tier 2: 카메라 스트림 20장 정교화.
 */
export type CatColorProfileJson = {
  dominant_hues: number[];
  sample_count: number;
  version: "v1";
};

/** cats 테이블 INSERT 페이로드 (DB 컬럼 매핑). */
export type CatInsertPayload = {
  home_id: string;
  name: string;
  breed: string;
  birth_date: string;
  sex: CatSex | null;
  photo_front_url: string | null;
  is_neutered: boolean | null;
  weight_kg: number | null;
  medical_notes: string | null;
  medications: string | null;
  supplements: string | null;
  litter_type: string | null;
  food_type: string | null;
};

/**
 * cats 테이블 UPDATE 페이로드 — 등록 후 사진/색상 프로파일 반영용.
 * (INSERT 먼저, 업로드 나중 Orphan 방지 순서)
 */
export type CatPhotoUpdatePayload = {
  photo_front_url: string | null;
  color_profile: CatColorProfileJson | null;
  color_sample_count: number;
  color_updated_at: string; // ISO timestamp
};

/**
 * CatDraft → CatInsertPayload 정규화.
 * - 문자열 trim + 빈 문자열은 null
 * - weightKg → Number.isFinite 통과 시 number, 아니면 null
 * - isNeutered "unknown" → null (DB BOOLEAN 3상태 mapping)
 * - sex "unknown" → null (Phase A CatProfileRow 규약 유지)
 */
export function catDraftToInsertPayload(
  draft: CatDraft,
  homeId: string,
  photoUrl: string | null,
): CatInsertPayload {
  const weightParsed = parseFloat(draft.weightKg);
  const weightValid =
    Number.isFinite(weightParsed) && weightParsed > 0 && weightParsed <= 30;
  return {
    home_id: homeId,
    name: draft.name.trim(),
    breed: draft.breed.trim(),
    birth_date: draft.birthDate,
    sex: draft.sex === "unknown" ? null : draft.sex,
    photo_front_url: photoUrl,
    is_neutered:
      draft.isNeutered === "yes" ? true :
      draft.isNeutered === "no" ? false : null,
    weight_kg: weightValid ? weightParsed : null,
    medical_notes: draft.medicalNotes.trim() || null,
    medications: draft.medications.trim() || null,
    supplements: draft.supplements.trim() || null,
    litter_type: draft.litterType.trim() || null,
    food_type: draft.foodType.trim() || null,
  };
}
