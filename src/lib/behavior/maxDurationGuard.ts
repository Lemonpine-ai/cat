/**
 * Phase B — 최대 지속 시간 초과 시 강제 close 판정.
 *
 * 배경:
 *  - 새벽에 고양이가 8시간 연속 잠자면 cat_behavior_events 에 1 row 로 8시간 duration
 *    이 기록된다. Phase D 라벨링 UI 에서 "한 row 를 어디 시점까지 수정할지" 애매해지고,
 *    장시간 open row 는 ended_at UPDATE race 위험도 커진다.
 *  - 따라서 30분(기본) 을 넘으면 driver 훅이 현재 행동을 `null` 로 통지해 logger 가
 *    이전 row 를 close 시키고, 다음 tick 에서 동일 행동이 감지되면 새 row 로 시작하게 한다.
 *
 * 이 모듈은 "판단" 만 담당 — 실제 close / null 전환은 호출부(driver 훅) 책임.
 *
 * ⚠️ Dev 판단 (설계서 §3.4 준수):
 *  - now - startedAt 이 음수(시계 역행) 인 경우는 false 반환 → OS 시간 보정 중에 엉뚱한
 *    close 를 유발하지 않도록 보수적으로 처리.
 *  - 설계서는 ">= maxMs" 기준이므로 30분 정각(30 * 60 * 1000 ms) 에 true 가 되도록 함.
 */

/** "30분" 기본 한도 (밀리초) — driver 훅에서 override 가능. */
export const DEFAULT_MAX_EVENT_DURATION_MS = 30 * 60 * 1000;

/** 현재 열려있는 (ended_at 없는) 이벤트 요약. */
export interface OpenEventLite {
  /** 이벤트 시작 시각 (로거가 INSERT 한 startedAt) */
  startedAt: Date;
  /** 이벤트 classKey (디버그/로그용, 판정엔 미사용) */
  classKey: string;
}

/**
 * 현재 열려있는 이벤트가 "너무 오래 지속" 되었는지 판정.
 *
 * @param openEvent 현재 열려있는 이벤트 요약. null 이면 판정 대상 없음 → false.
 * @param now       판정 기준 시각.
 * @param maxMs     초과 허용 ms (기본 30분).
 * @returns (now - startedAt) >= maxMs 이면 true, 그 외 false.
 */
export function shouldForceClose(
  openEvent: OpenEventLite | null,
  now: Date,
  maxMs: number = DEFAULT_MAX_EVENT_DURATION_MS,
): boolean {
  // 열린 이벤트 없음 → 판정 불가, false.
  if (openEvent === null) return false;

  const startedMs = openEvent.startedAt.getTime();
  const nowMs = now.getTime();
  const elapsed = nowMs - startedMs;

  // 시계가 뒤로 흘렀거나(사용자 시간 수동 변경 등) NaN 인 경우는 false 로 보수 처리.
  if (!Number.isFinite(elapsed) || elapsed < 0) return false;

  return elapsed >= maxMs;
}
