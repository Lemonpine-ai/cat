/**
 * Phase B — "N프레임 연속 동일 클래스 확정" 순수 함수. (R2)
 *
 * 목적:
 *  - 기존 `src/hooks/useBehaviorDetection.ts` 내부에만 있던 "최근 N프레임 동일 키면
 *    확정" 로직을 훅 외부 모듈로 분리 → 단위 테스트 가능하고 주기/윈도우 바뀔 때
 *    일관된 규칙 재사용 가능.
 *
 * ⚠️ R2 변경점 (R1 QA C1 REJECT 대응):
 *  - 기존 `{ confirmedKey: string | null }` 반환은 "히스토리 부족/혼재" 와 "NONE × windowSize
 *    확정" 이 **같은 null 값** 으로 섞여 호출부가 두 케이스를 구분 못함. 결과적으로 단발
 *    오탐 1건만 들어와도 확정된 sleeping 이벤트를 조기 close → row 폭증 → Supabase
 *    Nano pool 재고갈 위험.
 *  - 반환을 **3상태 discriminated union** 으로 분리.
 *    · `"confirmed"` : windowSize 프레임 전부 동일 실제 클래스. 호출부는 currentBehavior 갱신.
 *    · `"pending"`   : 창 미달 or 혼재. 호출부는 **현재 상태 유지** (아무 것도 하지 않음).
 *    · `"cleared"`   : windowSize 프레임 전부 NONE_KEY 동일. 호출부는 currentBehavior=null.
 *  - 타입 레벨 강제 → 호출부가 switch(status) 분기를 빠뜨리면 컴파일 에러.
 *
 * 규칙 요약 (R2 설계서 §1.1 §1.2):
 *  - history: 최근 N개의 classKey 를 오래된→최근 순으로 보관하는 배열.
 *  - incomingKey: 방금 들어온 classKey (탐지 없음 = "__none__" 센티넬).
 *  - newHistory = [...history, incomingKey].slice(-windowSize)
 *  - newHistory.length < windowSize         → pending
 *  - 창 내 키가 하나라도 다름                → pending
 *  - 전부 동일 + 첫 키가 NONE_KEY            → cleared
 *  - 전부 동일 + 첫 키가 실제 클래스         → confirmed
 *
 * 입출력 설계:
 *  - 순수 함수 (부수효과 X, 입력 불변). history 는 반환값으로 갱신된 배열 제공.
 *  - 호출부에서 ref/state 에 `newHistory` 를 다시 대입하여 사용.
 */

/** "탐지 없음" 을 의미하는 센티넬 — 로거/훅 전반에서 공통 사용. */
export const NONE_KEY = "__none__" as const;

/**
 * 3상태 discriminated union.
 *  - "confirmed": 최근 windowSize 프레임이 전부 동일 실제 클래스로 확정.
 *                 key 는 12 화이트리스트 중 하나 (NONE_KEY 아님).
 *  - "pending":   아직 windowSize 미충족 or 창 내 키가 혼재 → 호출부는 "현재 상태 유지".
 *  - "cleared":   최근 windowSize 프레임이 전부 NONE_KEY 로 동일 → "진짜 고양이 없음" 확정 →
 *                 호출부는 currentBehavior 를 null 로 close.
 */
export type ConfirmResult =
  | { readonly status: "confirmed"; readonly key: string; readonly newHistory: string[] }
  | { readonly status: "pending"; readonly newHistory: string[] }
  | { readonly status: "cleared"; readonly newHistory: string[] };

/**
 * 최근 N프레임 히스토리 + 이번 프레임 classKey 를 받아 3상태 확정 결과 반환.
 *
 * @param history     현재까지의 classKey 히스토리 (최신이 마지막). 불변으로 취급.
 * @param incomingKey 방금 들어온 classKey. "탐지 없음" 은 `NONE_KEY` ("__none__").
 * @param windowSize  몇 프레임 연속이면 확정인지 (낮=3 / 야간=2 권장).
 *
 * @returns `ConfirmResult` — §1.4 엣지케이스 표 참조.
 *
 * @throws windowSize < 1 일 때 Error (개발/테스트 실수 조기 감지)
 */
export function confirmDetection(
  history: readonly string[],
  incomingKey: string,
  windowSize: number,
): ConfirmResult {
  // 1) 방어적 가드 — 테스트 환경에서 잘못된 설정을 즉시 드러낸다.
  if (!Number.isFinite(windowSize) || windowSize < 1) {
    throw new Error(
      `[confirmDetection] windowSize 는 1 이상 정수여야 합니다. 받은 값=${windowSize}`,
    );
  }

  // 2) history 는 불변 — 새 배열 생성 후 windowSize 꼬리만 남김.
  const merged = [...history, incomingKey];
  const newHistory =
    merged.length > windowSize ? merged.slice(-windowSize) : merged;

  // 3) 아직 windowSize 개 미달 → pending.
  if (newHistory.length < windowSize) {
    return { status: "pending", newHistory };
  }

  // 4) windowSize 개가 모두 같은 key 인지 검사.
  const first = newHistory[0];
  const allSame = newHistory.every((k) => k === first);
  if (!allSame) {
    return { status: "pending", newHistory };
  }

  // 5) 전부 NONE_KEY → cleared (진짜 고양이 없음 확정).
  if (first === NONE_KEY) {
    return { status: "cleared", newHistory };
  }

  // 6) 전부 실제 클래스 → confirmed.
  return { status: "confirmed", key: first, newHistory };
}
