/**
 * 행동 패턴 분석기 — Phase A: 스크래칭(scratching) 동적 분류 임계값.
 *
 * 사장님 100% 확정 임계값:
 *   DAILY_COUNT_ELEVATED   = 5      (1일 5회 이상 → elevated)
 *   DAILY_COUNT_HIGH       = 10     (1일 10회 이상 → high)
 *   SINGLE_DURATION_SEC    = 30     (단일 30초 이상 → elevated)
 *   HOURLY_BURST_COUNT     = 3      (1시간 내 3회 burst → elevated)
 *   HOURLY_BURST_WINDOW_MS = 3600000
 *
 * 결과:
 *   severity = "normal" | "elevated" | "high"
 *   isExcessive = severity !== "normal"
 *   triggeredRules = ["daily_count_high", "long_duration", ...]
 *
 * 입력은 단순화된 BehaviorEvent (DB row 호환).
 */

/**
 * ⚠️ R7 추가 (R63): 타임존 단일 진실 원천.
 *
 * Phase A 본 파일의 모든 집계는 KST(Asia/Seoul) 기준.
 * 호출 측(Phase B 다이어리 집계)은 이 상수를 참조해 KST 자정 경계를 구성해야 함.
 */
export const TIMEZONE = "Asia/Seoul" as const;

/** 사장님 확정 임계값 */
export const SCRATCHING_THRESHOLDS = {
  DAILY_COUNT_ELEVATED: 5,
  DAILY_COUNT_HIGH: 10,
  SINGLE_DURATION_SEC: 30,
  HOURLY_BURST_COUNT: 3,
  HOURLY_BURST_WINDOW_MS: 60 * 60 * 1000,
} as const;

/** 분석 입력 — DB row 형태 그대로 받을 수 있게 단순화 */
export type ScratchingInputEvent = {
  detected_at: string; // ISO 시각 (UTC)
  duration_seconds?: number | null; // 지속시간(초). 없으면 단일 프레임 취급.
};

/** 심각도 단계 */
export type ScratchingSeverity = "normal" | "elevated" | "high";

/** 분석 결과 */
export interface ScratchingPatternResult {
  isExcessive: boolean;
  severity: ScratchingSeverity;
  reason: string;
  triggeredRules: string[];
}

/**
 * scratching 이벤트들로부터 패턴 심각도 분류 (정상 / elevated / high).
 *
 * - 룰 1: 1일 카운트가 HIGH 이상 → high (override).
 * - 룰 2: 단일 지속시간이 30초 이상 → 최소 elevated.
 * - 룰 3: 1시간 burst (sliding window) → 최소 elevated.
 *
 * ⚠️ R7 추가 (R63): events 는 **KST(Asia/Seoul) 자정 기준 1일치 슬라이스** 로 가정.
 *   호출 측(Phase B 다이어리 집계)이 KST 00:00:00.000 ~ 24:00:00.000 에 해당하는
 *   detected_at 만 필터링해서 넘겨야 함. 원본 DB 컬럼 detected_at 은 UTC
 *   TIMESTAMPTZ 이므로, KST 자정 경계를 UTC 로 환산해 WHERE 절을 구성해야 한다
 *   (예: KST 2026-04-23 00:00 KST = 2026-04-22 15:00 UTC). 만약 UTC ISO 범위를
 *   그대로 넘기면 UTC 자정(= KST 오전 9시) 경계에 있는 이벤트가 잘못된 일자에
 *   집계될 수 있음.
 *
 *   타임존 상수는 위 TIMEZONE 을 참조 ("Asia/Seoul" 고정).
 *
 * @param events  scratching 이벤트들 (KST 당일치만 전달)
 * @param options now: 테스트용 시각 주입 (현재는 미사용; 미래 확장 슬롯)
 */
export function classifyScratchingPattern(
  events: ScratchingInputEvent[],
  _options?: { now?: Date },
): ScratchingPatternResult {
  const triggered: string[] = [];
  let severity: ScratchingSeverity = "normal";

  // 룰 1: 1일 카운트
  // - HIGH 이상이면 high (override). HIGH 미만 + ELEVATED 이상이면 elevated.
  const count = events.length;
  if (count >= SCRATCHING_THRESHOLDS.DAILY_COUNT_HIGH) {
    severity = "high";
    triggered.push("daily_count_high");
  } else if (count >= SCRATCHING_THRESHOLDS.DAILY_COUNT_ELEVATED) {
    severity = "elevated";
    triggered.push("daily_count_elevated");
  }

  // 룰 2: 단일 지속시간 (30초 이상)
  // ⚠️ R2 변경 (REJECT-5a): typeof === "number" 는 NaN/Infinity 통과 → Number.isFinite 로 강화.
  //   - NaN >= 30 = false 라 결과는 동일하나, 의도 표현(유한 실수만 허용) 명시.
  //   - Number.isFinite 는 type guard 가 아니므로 narrowing 위해 ! 사용.
  const longDuration = events.some(
    (e) =>
      Number.isFinite(e.duration_seconds) &&
      e.duration_seconds! >= SCRATCHING_THRESHOLDS.SINGLE_DURATION_SEC,
  );
  if (longDuration) {
    if (severity === "normal") severity = "elevated";
    triggered.push("long_duration");
  }

  // 룰 3: 1시간 burst (sliding window O(n) — events 정렬 후 i 시작점 기준 j 확장)
  if (events.length >= SCRATCHING_THRESHOLDS.HOURLY_BURST_COUNT) {
    const sorted = [...events].sort(
      (a, b) =>
        new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime(),
    );
    for (let i = 0; i < sorted.length; i++) {
      const start = new Date(sorted[i].detected_at).getTime();
      if (Number.isNaN(start)) continue;
      let burstCount = 1;
      for (let j = i + 1; j < sorted.length; j++) {
        const t = new Date(sorted[j].detected_at).getTime();
        if (Number.isNaN(t)) continue;
        if (t - start > SCRATCHING_THRESHOLDS.HOURLY_BURST_WINDOW_MS) break;
        burstCount++;
      }
      if (burstCount >= SCRATCHING_THRESHOLDS.HOURLY_BURST_COUNT) {
        if (severity === "normal") severity = "elevated";
        triggered.push("hourly_burst");
        break;
      }
    }
  }

  const reason =
    severity === "high"
      ? `1일 ${count}회 감지 — 평소보다 매우 많음`
      : severity === "elevated"
      ? `1일 ${count}회 감지 — 평소보다 많음`
      : `정상 범위`;

  return {
    isExcessive: severity !== "normal",
    severity,
    reason,
    triggeredRules: triggered,
  };
}
