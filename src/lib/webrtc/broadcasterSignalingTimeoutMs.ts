/**
 * broadcasterSignalingTimeoutMs — Broadcaster 측 signaling 타임아웃 ENV 제어 유틸.
 *
 * 목적:
 *   broadcaster (방송폰) 가 offer 송신 후 viewer answer 수신을 기다리는 최대 시간(ms) 을
 *   환경변수 NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS 로 조정 가능하게 한다.
 *   기본값 15000ms (기존 하드코딩 동작 100% 유지 — CLAUDE.md #13 무손상).
 *   viewer 의 NEXT_PUBLIC_ICE_TIMEOUT_MS (예: 60000ms) 와 짝을 맞춰 LTE 환경에서
 *   세션 폭증 (15초마다 broadcaster 가 세션 재생성) 을 방지하는 용도.
 *
 * ENV:
 *   NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS (선택, 미설정 시 15000ms)
 *
 * 허용 범위:
 *   [1000, 300000] ms (1초 ~ 5분)
 *
 * Fallback 정책:
 *   - 미설정 / 빈 문자열 → 15000ms (warn 없음, CLAUDE.md #13 무손상 원칙)
 *   - NaN / 음수 / 0 / 범위 초과 → 15000ms + console.warn (clamp 아님)
 *   - 인자 없이 호출 (process.env literal access) → ENV 값 그대로 / 미설정 시 15000ms
 *
 * 의존성: 없음 (Pure TS, no React, no Supabase, no DOM).
 */

/* 기본 타임아웃 (ms) — ENV 미설정 시 사용. 기존 하드코딩 15초 100% 유지. */
const DEFAULT_BROADCASTER_SIGNALING_TIMEOUT_MS = 15_000;
/* 허용 최소값 (ms) — 1초 미만은 즉시 재생성 폭주 위험 */
const MIN_BROADCASTER_SIGNALING_TIMEOUT_MS = 1_000;
/* 허용 최대값 (ms) — 5분 초과는 stale 세션 정리 효과 무력화 */
const MAX_BROADCASTER_SIGNALING_TIMEOUT_MS = 300_000;
/* 환경변수 키 이름 */
const ENV_NAME = "NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS";

/**
 * ENV 에서 broadcaster signaling 타임아웃 값을 읽어 검증 후 반환.
 *
 * @param env - 검증 대상 env 객체. 미지정 시 process.env 사용.
 * @returns 검증 통과한 타임아웃 ms (실패 시 15000ms fallback)
 */
export function getBroadcasterSignalingTimeoutMs(env?: NodeJS.ProcessEnv): number {
  /* STEP 1: ENV 값 추출 — Next.js webpack DefinePlugin 호환 LITERAL access.
   *
   * 중요: Next.js 는 process.env.NEXT_PUBLIC_FOO (literal property access) 만
   * 빌드타임에 client bundle 로 inline 한다. 동적 indexing (source[varName])
   * 은 process polyfill ({}) 로 fallback 되어 client 측에서 항상 undefined.
   *
   * → 인자 (env) 가 주어지면 그쪽 우선 (단위 테스트 주입 용도).
   * → 인자 없으면 process.env.NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS 를
   *   LITERAL 로 access (Next.js DefinePlugin 이 빌드타임에 실제 ENV 값으로 치환). */
  const raw = env !== undefined
    ? env[ENV_NAME]
    : process.env.NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS;

  /* STEP 2: 미설정/undefined/null → DEFAULT 반환 (warn 없음) */
  if (raw === undefined || raw === null) {
    return DEFAULT_BROADCASTER_SIGNALING_TIMEOUT_MS;
  }

  /* STEP 3: 빈 문자열 → DEFAULT 반환 (warn 없음) */
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return DEFAULT_BROADCASTER_SIGNALING_TIMEOUT_MS;
  }

  /* STEP 4: Number() 로 변환 — parseInt 금지 ("30000abc" 같은 꼼수 차단) */
  const parsed = Number(trimmed);

  /* STEP 5: NaN / Infinity → warn + DEFAULT */
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    console.warn(
      `[broadcasterSignalingTimeoutMs] 잘못된 ENV 값 무시: ${ENV_NAME}=${raw}, ${DEFAULT_BROADCASTER_SIGNALING_TIMEOUT_MS}ms 로 fallback`,
    );
    return DEFAULT_BROADCASTER_SIGNALING_TIMEOUT_MS;
  }

  /* STEP 6: 정수화 (소수점 절삭) */
  const intValue = Math.trunc(parsed);

  /* STEP 7: 0 이하 → warn + DEFAULT */
  if (intValue <= 0) {
    console.warn(
      `[broadcasterSignalingTimeoutMs] 0 이하 값 거부: ${ENV_NAME}=${raw}, ${DEFAULT_BROADCASTER_SIGNALING_TIMEOUT_MS}ms 로 fallback`,
    );
    return DEFAULT_BROADCASTER_SIGNALING_TIMEOUT_MS;
  }

  /* STEP 8: 범위 [MIN, MAX] 초과 → warn + DEFAULT (clamp 아님, fallback) */
  if (intValue < MIN_BROADCASTER_SIGNALING_TIMEOUT_MS || intValue > MAX_BROADCASTER_SIGNALING_TIMEOUT_MS) {
    console.warn(
      `[broadcasterSignalingTimeoutMs] 범위 [${MIN_BROADCASTER_SIGNALING_TIMEOUT_MS}, ${MAX_BROADCASTER_SIGNALING_TIMEOUT_MS}] 초과: ${ENV_NAME}=${raw}, ${DEFAULT_BROADCASTER_SIGNALING_TIMEOUT_MS}ms 로 fallback`,
    );
    return DEFAULT_BROADCASTER_SIGNALING_TIMEOUT_MS;
  }

  /* STEP 9: 검증 통과 — 정수 값 반환 */
  return intValue;
}
