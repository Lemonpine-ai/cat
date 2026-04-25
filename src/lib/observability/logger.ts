/**
 * cat-identity Tier 1 fix R1 #5 — 경량 logger.
 *
 * 콘솔 wrap + scope prefix 표준화. 후속 PR 에서 Sentry/Datadog 등으로
 * pluggable transport 도입 가능 (현재는 console + Sentry 슬롯).
 *
 * fix R4-4 m11 보강:
 *  1) PII 마스킹 — context 객체의 owner_id / email / phone / user_id / home_id 등을
 *     `앞 4자 + ***` 로 자동 마스크. production 콘솔/Vercel 로그에 PII 누출 차단.
 *  2) Sentry 슬롯 — `process.env.NEXT_PUBLIC_SENTRY_DSN` 존재 시 hook 호출 (실제 SDK 미연동, 슬롯만).
 *
 * 사용 예:
 *   logger.warn("extractHsv", "worker failed, fallback to idle", { reason });
 *   logger.error("uploadCatProfilePhoto", err, { catId, homeId });
 *   // 출력: { ..., home_id: "abcd***" } (앞 4자만)
 */

type LogContext = Record<string, unknown>;

/**
 * fix R4-4 m11 — PII 마스킹 대상 키 화이트리스트.
 *
 * 추가 시점에 본 set 만 갱신. 다른 키는 그대로 출력.
 */
const PII_KEYS = new Set<string>([
  "owner_id",
  "email",
  "phone",
  "user_id",
  "home_id",
  "homeId", // camelCase 변형
  "ownerId",
  "userId",
  "phoneNumber",
]);

/**
 * 단일 값 마스킹.
 *  - 비-PII 키 → 그대로 반환.
 *  - PII 문자열 → 앞 4자 + ***.
 *  - PII 비-문자열 → "***".
 */
function maskValue(key: string, value: unknown): unknown {
  if (!PII_KEYS.has(key)) return value;
  if (typeof value !== "string") return "***";
  return value.length <= 4 ? "***" : `${value.slice(0, 4)}***`;
}

/**
 * context 객체 전체 PII 마스킹 (얕은 복사).
 * 중첩 객체는 1단계까지만 (실용상 logger.error 의 ctx 는 plain dict).
 */
function maskContext(ctx: LogContext): LogContext {
  const out: LogContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = maskValue(k, v);
  }
  return out;
}

function format(scope: string, message: string): string {
  return `[${scope}] ${message}`;
}

/**
 * Sentry transport 슬롯.
 *
 * 실제 SDK 연동은 후속 PR (의존성 추가 시점). 본 commit 은 슬롯만 제공.
 * `NEXT_PUBLIC_SENTRY_DSN` 환경변수 부재 시 noop.
 */
function emitToSentry(
  _scope: string,
  _level: "warn" | "error",
  _message: string,
  _ctx?: LogContext,
): void {
  if (typeof window === "undefined") return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  /* SDK 미연동 — 후속 PR 에서 window.__SENTRY_HUB__?.captureMessage(...) 추가 예정.
   * 본 위치가 호출 진입점임을 명시적으로 남김. */
}

export const logger = {
  warn(scope: string, message: string, ctx?: LogContext) {
    const masked = ctx ? maskContext(ctx) : undefined;
    if (masked) console.warn(format(scope, message), masked);
    else console.warn(format(scope, message));
    emitToSentry(scope, "warn", message, masked);
  },
  error(scope: string, error: unknown, ctx?: LogContext) {
    const message = error instanceof Error ? error.message : String(error);
    const masked = ctx ? maskContext(ctx) : undefined;
    if (masked) console.error(format(scope, message), { error, ...masked });
    else console.error(format(scope, message), { error });
    emitToSentry(scope, "error", message, masked);
  },
};
