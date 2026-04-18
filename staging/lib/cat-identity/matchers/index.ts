// ============================================================
// Matcher 팩토리 — 전략 교체 진입점
// v2/v3/v4 추가 시 case만 추가, v1 코드 수정 불필요
// ============================================================

import type { CatMatcher } from "./CatMatcher";
import { HsvColorMatcher } from "./HsvColorMatcher";

export type MatcherStrategy = "hsv_v1" | "hsv_size_v2" | "reid_v4";

/**
 * 전략명으로 매처 인스턴스 생성.
 * @param strategy 기본값 "hsv_v1"
 */
export function createMatcher(
  strategy: MatcherStrategy = "hsv_v1",
): CatMatcher {
  switch (strategy) {
    case "hsv_v1":
      return new HsvColorMatcher();
    // v2/v3/v4 매처는 추후 추가
    // case "hsv_size_v2": return new HsvSizeMatcher();
    // case "reid_v4":    return new ReIdMatcher();
    default:
      throw new Error(`Unsupported matcher strategy: ${strategy}`);
  }
}

export type { CatMatcher } from "./CatMatcher";
