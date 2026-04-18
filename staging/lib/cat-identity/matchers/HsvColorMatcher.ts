// ============================================================
// HsvColorMatcher (v1)
// color_profile.version === 1만 대상으로 마할라노비스 거리 계산
// dark 조명 → 즉시 unknown 반환 (오판 방지)
// 거리 최소인 cat 선택, threshold 초과 시 unknown
// ============================================================

import type {
  CatMatcher,
  MatchInput,
  MatchResult,
  CatWithProfile,
  ColorProfileV1,
} from "./CatMatcher";
import { extractHsvKmeans, hueDist } from "../extractors/hsvKmeansExtractor";
import { detectLighting } from "../extractors/lightingDetector";

// 기본 임계값 (threshold_hint 없을 때 fallback)
const DEFAULT_THRESHOLD = 2.5;

export class HsvColorMatcher implements CatMatcher {
  readonly strategy = "hsv_v1";

  async match(
    input: MatchInput,
    cats: CatWithProfile[],
  ): Promise<MatchResult> {
    // 1) 조명 체크 — dark은 즉시 실패
    const lighting = detectLighting(input.videoFrame, input.bbox);
    if (lighting === "dark") {
      return { catId: null, confidence: 0, debug: { distances: {}, lighting } };
    }

    // 2) v1 프로필만 필터링 (v2 이상은 다른 matcher에서 처리)
    //    version === 1 + method === "hsv_kmeans" 둘 다 체크 (확장 대비)
    const v1Cats = cats.filter(
      (c) =>
        c.color_profile !== null &&
        c.color_profile.version === 1 &&
        c.color_profile.method === "hsv_kmeans",
    );
    if (v1Cats.length === 0) {
      return { catId: null, confidence: 0, debug: { distances: {}, lighting } };
    }

    // 3) 샘플 추출
    const samples = extractHsvKmeans(input.videoFrame, input.bbox);
    if (!samples || samples.length === 0) {
      return { catId: null, confidence: 0, debug: { distances: {}, lighting } };
    }
    const primary = samples[0];

    // 4) 각 cat에 대해 마할라노비스 거리 계산
    const distances: Record<string, number> = {};
    let bestId: string | null = null;
    let bestDist = Infinity;
    let bestThreshold = DEFAULT_THRESHOLD;

    for (const cat of v1Cats) {
      const p = cat.color_profile!;
      if (p.version !== 1) continue;
      if (p.method !== "hsv_kmeans") continue;
      // v2/v3 추가 시에도 v1 경로가 안 깨지도록 명시적 타입 확정
      const v1p: ColorProfileV1 = p;
      const prof = v1p.primary;

      // H는 원형 거리, S는 일반 거리 — 각각 std로 정규화
      const dh = hueDist(primary.h_mean, prof.h_mean) / Math.max(prof.h_std, 5);
      const ds = (primary.s_mean - prof.s_mean) / Math.max(prof.s_std, 0.05);
      const dist = Math.sqrt(dh * dh + ds * ds);

      distances[cat.id] = dist;
      if (dist < bestDist) {
        bestDist = dist;
        bestId = cat.id;
        bestThreshold = v1p.threshold_hint ?? DEFAULT_THRESHOLD;
      }
    }

    // 5) threshold 초과 시 unknown
    if (bestId === null || bestDist > bestThreshold) {
      return {
        catId: null,
        confidence: 0,
        debug: { distances, lighting },
      };
    }

    // 6) confidence: 0 거리 → 1.0, threshold 거리 → 0.0 선형 변환
    const confidence = Math.max(0, 1 - bestDist / bestThreshold);
    return {
      catId: bestId,
      confidence,
      debug: { distances, lighting },
    };
  }
}
