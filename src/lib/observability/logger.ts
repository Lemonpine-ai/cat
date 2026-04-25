/**
 * cat-identity Tier 1 fix R1 #5 — 경량 logger.
 *
 * 콘솔 wrap + scope prefix 표준화. 후속 PR 에서 Sentry/Datadog 등으로
 * pluggable transport 도입 가능 (현재는 console only).
 *
 * 사용 예:
 *   logger.warn("extractHsv", "worker failed, fallback to idle", { reason });
 *   logger.error("uploadCatProfilePhoto", err, { catId, homeId });
 */

type LogContext = Record<string, unknown>;

function format(scope: string, message: string): string {
  return `[${scope}] ${message}`;
}

export const logger = {
  warn(scope: string, message: string, ctx?: LogContext) {
    if (ctx) console.warn(format(scope, message), ctx);
    else console.warn(format(scope, message));
  },
  error(scope: string, error: unknown, ctx?: LogContext) {
    const message = error instanceof Error ? error.message : String(error);
    if (ctx) console.error(format(scope, message), { error, ...ctx });
    else console.error(format(scope, message), { error });
  },
};
