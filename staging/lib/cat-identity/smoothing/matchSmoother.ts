// ============================================================
// 매칭 결과 스무더
// - EMA: cat별 confidence 지수이동평균 (alpha=0.3)
// - 3프레임 연속 가드: 같은 catId가 3회 연속 이겨야 "확정"
// - 플리커 방지 — 한 프레임 튀어도 흔들리지 않음
// ============================================================

import type { MatchResult } from "../types";

const ALPHA = 0.3;           // EMA 가중치
const CONFIRM_FRAMES = 3;    // 연속 프레임 수
const MIN_CONFIDENCE = 0.3;  // 최소 신뢰도

export class MatchSmoother {
  // cat별 EMA confidence 저장
  private emaMap = new Map<string, number>();
  // 최근 후보(연속 집계용)
  private lastCandidate: string | null = null;
  private streak = 0;
  // 확정된 결과
  private confirmedId: string | null = null;

  /**
   * 새 프레임 결과 반영 후 현재 확정 상태 반환.
   */
  push(result: MatchResult): { identifiedCatId: string | null; confidence: number } {
    // 1) EMA 갱신 — 성공한 catId만 갱신 (실패 프레임은 아래 else에서 감쇠)
    if (result.catId && result.confidence >= MIN_CONFIDENCE) {
      const prev = this.emaMap.get(result.catId) ?? 0;
      const next = ALPHA * result.confidence + (1 - ALPHA) * prev;
      this.emaMap.set(result.catId, next);

      // 2) 연속 프레임 카운트
      if (this.lastCandidate === result.catId) {
        this.streak += 1;
      } else {
        this.lastCandidate = result.catId;
        this.streak = 1;
      }

      // 3) CONFIRM_FRAMES 도달 시 확정
      if (this.streak >= CONFIRM_FRAMES) {
        this.confirmedId = result.catId;
      }
    } else {
      // 실패 프레임 — streak 약화
      this.streak = Math.max(0, this.streak - 1);
      if (this.streak === 0) {
        this.lastCandidate = null;
      }
      // EMA 모두 감쇠
      for (const [k, v] of this.emaMap) {
        this.emaMap.set(k, v * (1 - ALPHA));
      }
    }

    const confidence = this.confirmedId
      ? this.emaMap.get(this.confirmedId) ?? 0
      : 0;

    return { identifiedCatId: this.confirmedId, confidence };
  }

  /** 상태 초기화 (카메라 전환 등) */
  reset() {
    this.emaMap.clear();
    this.lastCandidate = null;
    this.streak = 0;
    this.confirmedId = null;
  }
}
