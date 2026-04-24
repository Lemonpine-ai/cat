/**
 * Phase B (R2) — L3 dev-only 런타임 sentinel: "behavior logger 두 경로 동시 활성" 감지.
 *
 * 배경 (R1 QA M2):
 *  - flag ON 시 방송폰 (=이 `CameraBroadcastYoloMount`) 이 DB INSERT 를 담당하고,
 *    뷰어폰은 오버레이 프리뷰만 해야 함 (R1 설계서 §5.1).
 *  - 만약 src/ 반영 단계에서 뷰어폰 `useBehaviorDetection` 의 `onBehaviorChange` 게이트를
 *    빠뜨리면 방송폰 INSERT + 뷰어 4명 INSERT 동시 발생 → Supabase Nano pool (=15) 즉시
 *    고갈 (2026-04-22 장애 재현).
 *  - L1 체크리스트 + L2 JSDoc 주석만으로는 누락 감지 불가. 런타임에서도 경고가 필요.
 *
 * 전략:
 *  - `window.__catBehaviorLoggerArmed__` 전역 sentinel 에 "현재 logger 를 arm 한 쪽" 을 기록.
 *  - 두번째 source 가 다른 값으로 arm 하려 하면 **dev 환경에서만** `console.error` + unarm 콜백.
 *  - prod 환경 (`process.env.NODE_ENV === "production"`) 에서는 no-op 반환 → 런타임 오버헤드 0.
 *
 * 한도:
 *  - dev 에서만 작동 → 실제 prod 로 누락 상태가 배포되면 감지 못 함. 그래서 L1/L2 와 3중 방어.
 *  - Next.js 개발 서버 (pnpm dev) 또는 Vercel Preview 배포 중에는 NODE_ENV !== "production" 이므로
 *    L3 가 의미 있음.
 *
 * ⚠️ Dev 판단:
 *  - `window` 전역에 프로퍼티를 심는 것은 추후 충돌 위험이 있으나, cat 프로젝트 외 다른 코드가
 *    `__catBehaviorLoggerArmed__` 를 건드릴 일이 없고 prefix 가 충분히 unique 하다고 판단.
 *  - worker 컨텍스트에서는 window 가 없으므로 `typeof window === "undefined"` 가드 필수.
 */

/** 전역 sentinel 의 소스 식별자 — 두 곳만 존재. */
export type LoggerArmSource = "broadcaster" | "viewer";

/** `window` 확장 타입 — 전역 오염 없이 sentinel 프로퍼티 노출. */
declare global {

  var __catBehaviorLoggerArmed__: LoggerArmSource | undefined;
}

/** prod 환경 여부 체크 (no-op 분기용). */
function isProduction(): boolean {
  if (typeof process === "undefined") return false;
  return process.env.NODE_ENV === "production";
}

/** no-op cleanup 함수 — prod 에서 반환. */
const noop = (): void => {
  /* intentional */
};

/**
 * behavior logger 활성을 sentinel 에 arm.
 *
 * 규칙:
 *  - prod: 아무 것도 안 함. `() => {}` 반환.
 *  - dev 첫 호출: `window.__catBehaviorLoggerArmed__ = source`. 정상.
 *  - dev 동일 source 재호출: 경고 없이 통과 (idempotent). 반환 cleanup 은 여전히 유효.
 *  - dev 다른 source 호출: `console.error` 로 2026-04-22 장애 재현 위험 경고. 두번째 호출은
 *    arm 되지 않으며, 반환 cleanup 은 no-op (원 source 는 그대로 유지).
 *
 * @param source "broadcaster" (방송폰 driver) 또는 "viewer" (뷰어폰 훅).
 * @returns cleanup 함수 — 컴포넌트 unmount 시 호출하여 sentinel 해제.
 */
export function armBehaviorLogger(source: LoggerArmSource): () => void {
  // 1) prod 빌드: no-op.
  if (isProduction()) return noop;

  // 2) browser 아님 (SSR / worker): no-op.
  if (typeof window === "undefined") return noop;

  const current = window.__catBehaviorLoggerArmed__;

  // 3) 다른 source 가 이미 arm 상태 → 경고 + no-op cleanup.
  if (current && current !== source) {
    console.error(
      `[CATvisor][loggerArmGuard] 두 경로(${current} + ${source})가 동시에 behavior logger 를 ` +
        `활성화하려 합니다. src/ 반영 시 뷰어 측 useBehaviorDetection 의 onBehaviorChange 게이트를 ` +
        `확인하세요 (CLAUDE.md #13, Phase B R2 §3.4). 2026-04-22 Supabase Nano pool 고갈 장애 재현 위험.`,
    );
    return noop;
  }

  // 4) 동일 source 재호출 (idempotent) 또는 첫 arm.
  window.__catBehaviorLoggerArmed__ = source;

  // 5) cleanup — 내가 arm 한 source 가 그대로일 때만 해제 (다른 소스가 덮어쓰면 건드리지 않음).
  return () => {
    if (typeof window === "undefined") return;
    if (window.__catBehaviorLoggerArmed__ === source) {
      window.__catBehaviorLoggerArmed__ = undefined;
    }
  };
}
