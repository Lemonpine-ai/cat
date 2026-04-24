// ============================================================
// 고양이 개체 구별 v1 - 타입/인터페이스 정의
// 확장성: ColorProfile union + CatMatcher 전략 패턴으로
// v2/v3/v4 추가 시 v1 코드 수정 불필요
// ============================================================

// ---------- 색상 프로필 JSON 스펙 (버전 관리) ----------
// v1: HSV K-means primary 색상만 사용
export type ColorProfileV1 = {
  version: 1;
  method: "hsv_kmeans";
  primary: {
    h_mean: number;   // 0~360 (원형)
    h_std: number;
    s_mean: number;   // 0~1
    s_std: number;
    weight: number;   // 군집 비중 0~1
  };
  secondary: null | {
    // v3에서 보조 색상(이중모) 활성화 예정
    h_mean: number;
    h_std: number;
    s_mean: number;
    s_std: number;
    weight: number;
  };
  threshold_hint?: number;       // 자동 산출 임계값
  calibrated_at: string;         // ISO timestamp
  sample_stats: {
    count: number;
    lighting_distribution: Record<string, number>;
  };
};

// v2 이상 추가 시 union 확장 (예: ColorProfileV1 | ColorProfileV2)
export type ColorProfile = ColorProfileV1;

// ---------- 조명 단계 ----------
export type LightingLevel = "bright" | "normal" | "dim" | "dark";

// ---------- 매칭 입출력 ----------
export type MatchInput = {
  bbox: { x: number; y: number; w: number; h: number }; // 정규화 0~1
  videoFrame: HTMLVideoElement | ImageBitmap;
  zoneId?: string;
  timestamp: number;
};

export type MatchResult = {
  catId: string | null;
  confidence: number; // 0~1
  debug?: {
    distances: Record<string, number>;
    lighting: LightingLevel;
  };
};

// ---------- 전략 패턴 인터페이스 ----------
// v1: HsvColorMatcher / v2: HsvSizeMatcher / v4: ReIdMatcher ...
export interface CatMatcher {
  readonly strategy: string;
  match(input: MatchInput, cats: CatWithProfile[]): Promise<MatchResult>;
}

// ---------- DB 조회 결과 ----------
export type CatWithProfile = {
  id: string;
  name: string;
  color_profile: ColorProfile | null;
};

// ---------- 추출기 공통 타입 ----------
export type HsvSample = {
  h_mean: number;
  h_std: number;
  s_mean: number;
  s_std: number;
  v_mean: number;
  weight: number;
};
