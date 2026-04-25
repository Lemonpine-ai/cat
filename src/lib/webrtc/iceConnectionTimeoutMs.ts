/**
 * iceConnectionTimeoutMs — WebRTC ICE 협상 타임아웃 ENV 제어 유틸.
 *
 * 목적:
 *   CameraSlot WebRTC 연결 시 stale 세션을 정리하기 위한 타임아웃(ms)을
 *   환경변수 NEXT_PUBLIC_ICE_TIMEOUT_MS 로 조정 가능하게 한다.
 *   기본값 15000ms (LTE 환경에서도 유효한 마진).
 *
 * ENV:
 *   NEXT_PUBLIC_ICE_TIMEOUT_MS (선택, 미설정 시 15000ms)
 *
 * 허용 범위:
 *   [5000, 120000] ms (5초 ~ 120초)
 *
 * Fallback 정책:
 *   - 미설정 / 빈 문자열 → 15000ms (warn 없음, CLAUDE.md #13 무손상 원칙)
 *   - NaN / 음수 / 0 / 범위 초과 → 15000ms + console.warn (clamp 아님)
 *
 * 의존성: 없음 (Pure TS, no React, no Supabase, no DOM).
 */

/* 기본 타임아웃 (ms) — ENV 미설정 시 사용 */
const DEFAULT_ICE_TIMEOUT_MS = 15_000;
/* 허용 최소값 (ms) — 5초 미만은 LTE 환경에서 너무 빨리 끊김 */
const MIN_ICE_TIMEOUT_MS = 5_000;
/* 허용 최대값 (ms) — 120초 초과는 stale 세션 정리 효과 무력화 */
const MAX_ICE_TIMEOUT_MS = 120_000;
/* 환경변수 키 이름 */
const ENV_NAME = "NEXT_PUBLIC_ICE_TIMEOUT_MS";

/**
 * ENV 에서 ICE 타임아웃 값을 읽어 검증 후 반환.
 *
 * @param env - 검증 대상 env 객체. 미지정 시 process.env 사용.
 * @returns 검증 통과한 타임아웃 ms (실패 시 15000ms fallback)
 */
export function getIceConnectionTimeoutMs(env?: NodeJS.ProcessEnv): number {
  /* STEP 1: env 인자 또는 process.env 에서 raw 값 추출 */
  const source = env ?? process.env;
  const raw = source[ENV_NAME];

  /* STEP 2: 미설정/undefined/null → DEFAULT 반환 (warn 없음) */
  if (raw === undefined || raw === null) {
    return DEFAULT_ICE_TIMEOUT_MS;
  }

  /* STEP 3: 빈 문자열 → DEFAULT 반환 (warn 없음) */
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return DEFAULT_ICE_TIMEOUT_MS;
  }

  /* STEP 4: Number() 로 변환 — parseInt 금지 ("30000abc" 같은 꼼수 차단) */
  const parsed = Number(trimmed);

  /* STEP 5: NaN / Infinity → warn + DEFAULT */
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    console.warn(
      `[iceConnectionTimeoutMs] 잘못된 ENV 값 무시: ${ENV_NAME}=${raw}, ${DEFAULT_ICE_TIMEOUT_MS}ms 로 fallback`,
    );
    return DEFAULT_ICE_TIMEOUT_MS;
  }

  /* STEP 6: 정수화 (소수점 절삭) */
  const intValue = Math.trunc(parsed);

  /* STEP 7: 0 이하 → warn + DEFAULT */
  if (intValue <= 0) {
    console.warn(
      `[iceConnectionTimeoutMs] 0 이하 값 거부: ${ENV_NAME}=${raw}, ${DEFAULT_ICE_TIMEOUT_MS}ms 로 fallback`,
    );
    return DEFAULT_ICE_TIMEOUT_MS;
  }

  /* STEP 8: 범위 [MIN, MAX] 초과 → warn + DEFAULT (clamp 아님, fallback) */
  if (intValue < MIN_ICE_TIMEOUT_MS || intValue > MAX_ICE_TIMEOUT_MS) {
    console.warn(
      `[iceConnectionTimeoutMs] 범위 [${MIN_ICE_TIMEOUT_MS}, ${MAX_ICE_TIMEOUT_MS}] 초과: ${ENV_NAME}=${raw}, ${DEFAULT_ICE_TIMEOUT_MS}ms 로 fallback`,
    );
    return DEFAULT_ICE_TIMEOUT_MS;
  }

  /* STEP 9: 검증 통과 — 정수 값 반환 */
  return intValue;
}
