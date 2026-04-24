/**
 * Phase B (R6) — dev-only YOLO driver 진단 배지.
 *
 * 역할 (R6 §3.3 T5/T6):
 *  - 방송폰 화면 우상단 고정 배지로, driver 상태를 개발자 / 사장님이 1초 안에 파악.
 *  - `NODE_ENV === "production"` 일 때는 null 반환 — tree-shake 여부와 무관하게 DOM 0.
 *  - 표시 항목:
 *    · 색상: initStatus ready=녹색 / loading=노랑 / failed=빨강 / idle=회색
 *    · 숫자: health.ticksTotal (0-9999)
 *    · 호버 툴팁: backend / regime / initStatus / retryAttempt / isInferring
 *                  / inferLatencyP50Ms / inferLatencyP95Ms
 *
 * 설계 원칙:
 *  - Tailwind CSS 로 최소 스타일. 추가 의존성 없음.
 *  - 배지 자체는 클릭 가능 영역이 아님 (pointerEvents: none). UI 간섭 0.
 *  - 방송폰에서 데이터 갱신 주기는 driver 의 health flush (2s) + lifecycle latency flush (2s).
 *  - React.memo 미적용 사유: dev-only + DOM 1개 + 2초 주기 갱신이라 리렌더 비용이 무시 수준.
 *    prod 빌드는 NODE_ENV 가드로 null 반환 → memo 효과 0. (R7 D6 / 힌트 #9)
 *
 * 사용 예:
 *   {process.env.NODE_ENV === "development" && <YoloDriverDiagBadge driver={driver} />}
 */

"use client";

import type { DriverResult } from "../../hooks/useBroadcasterYoloDriver";

export interface YoloDriverDiagBadgeProps {
  driver: DriverResult;
}

/**
 * initStatus 에 따른 배지 배경색 클래스.
 * - ready: 정상 → 녹색
 * - loading: ONNX 초기화 중 → 노랑
 * - failed: 5회 재시도 모두 소진 → 빨강
 * - idle: 비활성 → 회색
 *
 * (R7 D4 / MINOR-R6-NEW-4: "retrying" 은 InitStatus 타입에 없음 — 제거.
 *  retry 진행 상태는 driver.retryAttempt 숫자로 별도 노출.)
 */
function statusColorClass(initStatus: DriverResult["initStatus"]): string {
  if (initStatus === "ready") return "bg-green-600/80";
  if (initStatus === "failed") return "bg-red-600/80";
  if (initStatus === "loading") return "bg-yellow-500/80";
  return "bg-gray-500/70";
}

/**
 * dev 전용 배지 컴포넌트.
 * - prod 빌드에서는 null 반환 (Next.js/Turbopack 이 NODE_ENV 를 빌드타임 치환).
 */
export default function YoloDriverDiagBadge({
  driver,
}: YoloDriverDiagBadgeProps): React.JSX.Element | null {
  // prod 가드 — 배지가 영구히 렌더되지 않도록 보장 (Mount 조건부 렌더와 이중 가드).
  if (process.env.NODE_ENV === "production") return null;

  const {
    initStatus,
    retryAttempt,
    backend,
    regime,
    isInferring,
    health,
  } = driver;

  const colorClass = statusColorClass(initStatus);
  const ticks = Math.min(9999, health.ticksTotal);

  // 숫자 포맷 — null 이면 "-", 아니면 소수점 0 (ms 단위 정수 근사).
  const fmtMs = (v: number | null): string =>
    v === null ? "-" : `${Math.round(v)}ms`;

  // 툴팁용 한 줄 문자열. title 속성으로만 쓰이므로 한국어 풀 네임 허용.
  const tooltip = [
    `init=${initStatus}`,
    `backend=${backend ?? "?"}`,
    `regime=${regime}`,
    `retry=${retryAttempt}`,
    `inferring=${isInferring ? "Y" : "N"}`,
    `p50=${fmtMs(health.inferLatencyP50Ms)}`,
    `p95=${fmtMs(health.inferLatencyP95Ms)}`,
  ].join(" ");

  return (
    <div
      className={`fixed top-4 right-4 z-50 px-2 py-1 rounded text-white text-xs font-mono select-none ${colorClass}`}
      style={{ pointerEvents: "none" }}
      title={tooltip}
      aria-hidden
      data-testid="yolo-driver-diag-badge"
    >
      {/* 1줄 핵심 표시: initStatus 첫 글자 + ticks 카운트. 호버 툴팁에 상세. */}
      {initStatus[0]?.toUpperCase() ?? "?"}·{ticks}
    </div>
  );
}
