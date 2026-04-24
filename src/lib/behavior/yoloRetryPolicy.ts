/**
 * Phase B (R2) — ONNX worker 초기화 실패 시 재시도 정책 (순수 함수).
 *
 * 역할:
 *  - `useBroadcasterYoloDriver` 의 `scheduleRetry` 안에서 "다음 retry 까지 몇 ms 기다릴지"
 *    결정하는 로직을 순수 함수로 분리. driver 본체 LOC 를 깎고 단위 테스트 가능하게 함.
 *
 * 규칙 (R2 설계서 §2.3):
 *  - 지수 백오프: delay = min(RETRY_BASE_MS * 2^(attempt-1), RETRY_MAX_MS)
 *  - attempt=1 → 30 000ms (30초)
 *  - attempt=2 → 60 000ms (1분)
 *  - attempt=3 → 120 000ms (2분)
 *  - attempt=4 → 240 000ms (4분)
 *  - attempt=5 → 480 000ms (8분) ← 상한
 *  - attempt > MAX_RETRIES (=5) 는 호출부에서 별도 처리 (initStatus="failed"). 본 함수는
 *    attempt 값 범위 체크만 수행.
 */

/** 최대 재시도 횟수 — 5회 시도까지 허용 (이후 failed 상태). */
export const MAX_RETRIES = 5;
/** 첫 재시도 대기 시간 (ms). */
export const RETRY_BASE_MS = 30_000;
/** 상한 대기 시간 (ms) — 8분. 지수 백오프가 포화되는 지점. */
export const RETRY_MAX_MS = 480_000;

/**
 * 현재 attempt 번호(1부터 시작)로 다음 retry 까지 대기할 ms 를 계산.
 *
 * @param attempt 현재 몇 번째 재시도인지 (1 이상, MAX_RETRIES 이하 권장).
 * @returns 대기 ms. attempt < 1 이면 0 (즉시). attempt > MAX_RETRIES 는 상한값 반환.
 */
export function computeBackoffMs(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt < 1) return 0;
  // 2^(attempt-1) — attempt=1 일 때 1, attempt=2 일 때 2, ... attempt=5 일 때 16.
  const factor = 2 ** (attempt - 1);
  const raw = RETRY_BASE_MS * factor;
  // 상한 clamp — 8분 초과로 가지 않도록 방어.
  return raw > RETRY_MAX_MS ? RETRY_MAX_MS : raw;
}

/**
 * 재시도 가능 여부 — attempt 번호가 MAX_RETRIES 내에 있으면 true.
 *
 * @param nextAttempt 다음 시도할 번호 (retryAttemptRef + 1 값).
 */
export function canRetry(nextAttempt: number): boolean {
  return nextAttempt <= MAX_RETRIES;
}
