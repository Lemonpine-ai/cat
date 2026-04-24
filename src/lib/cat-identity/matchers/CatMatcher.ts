// ============================================================
// CatMatcher 인터페이스 re-export
// 전략 패턴의 "추상 인터페이스" 역할 — 구현체들은 이 파일을 import
// ============================================================

export type {
  CatMatcher,
  MatchInput,
  MatchResult,
  CatWithProfile,
  ColorProfile,
  ColorProfileV1,
  LightingLevel,
  HsvSample,
} from "../types";
