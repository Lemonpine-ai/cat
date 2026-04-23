/**
 * YOLO 행동 인식 12개 클래스 정의 (Phase A 신규 분류 체계)
 * - 학습 데이터셋 model.names 와 1:1 매핑 (id 0~11 순서 동일)
 * - key  : 영문 식별자 (DB cat_behavior_events.behavior_class 저장용)
 * - label: 한글 UI 표시
 * - emoji: 오버레이 배지 표시용 아이콘
 *
 * ⚠️ 변경 주의:
 *  - 기존 12 클래스(arch / arm_stretch / ... / walk_run) 는 본 Phase A 에서 폐기.
 *  - 같은 인덱스라도 의미가 완전히 달라지므로 DB 마이그레이션 별도.
 *  - behavior_class 화이트리스트 CHECK constraint 와 본 배열은 동기 유지 필수.
 */

export const BEHAVIOR_CLASSES = [
  { id: 0,  key: "eating",      label: "식사 중",   emoji: "🍽️" },
  { id: 1,  key: "drinking",    label: "물 마심",   emoji: "💧" },
  { id: 2,  key: "grooming",    label: "그루밍",    emoji: "🧼" },
  { id: 3,  key: "sleeping",    label: "자는 중",   emoji: "😴" },
  { id: 4,  key: "playing",     label: "놀이",      emoji: "🧶" },
  { id: 5,  key: "walking",     label: "걷기",      emoji: "🚶" },
  { id: 6,  key: "running",     label: "뛰기",      emoji: "🏃" },
  { id: 7,  key: "sitting",     label: "앉음",      emoji: "🪑" },
  { id: 8,  key: "standing",    label: "서 있음",   emoji: "🧍" },
  { id: 9,  key: "scratching",  label: "스크래칭",  emoji: "🪵" },
  { id: 10, key: "elimination", label: "배설",      emoji: "🚽" },
  { id: 11, key: "other",       label: "기타",      emoji: "❓" },
] as const;

/** 12 클래스 키 유니온 — DB 입력/타입 검증 시 활용 */
export type BehaviorClassKey = typeof BEHAVIOR_CLASSES[number]["key"];

/**
 * classId(0~11) → 클래스 정보 조회.
 * - YOLO 출력 인덱스로 빠른 룩업
 * - 범위 밖이면 null (UI 가 안전하게 스킵)
 */
export function getBehaviorClass(
  classId: number,
): (typeof BEHAVIOR_CLASSES)[number] | null {
  if (classId < 0 || classId >= BEHAVIOR_CLASSES.length) return null;
  return BEHAVIOR_CLASSES[classId];
}

/**
 * 의미(semantic) 카테고리 — 일기/통계 집계 시 같은 의미 그룹으로 묶기 위함.
 *  meal     : eating
 *  water    : drinking
 *  hygiene  : grooming, elimination
 *  rest     : sleeping, sitting, standing
 *  activity : playing, walking, running
 *  alert    : scratching, other
 */
export type BehaviorSemantic =
  | "meal"
  | "water"
  | "hygiene"
  | "rest"
  | "activity"
  | "alert";

/** 12 클래스 → semantic 매핑 테이블 (사장님 100% 확정) */
export const BEHAVIOR_SEMANTIC_MAP: Record<BehaviorClassKey, BehaviorSemantic> = {
  eating: "meal",
  drinking: "water",
  grooming: "hygiene",
  sleeping: "rest",
  playing: "activity",
  walking: "activity",
  running: "activity",
  sitting: "rest",
  standing: "rest",
  scratching: "alert",
  elimination: "hygiene",
  other: "alert",
};

/**
 * 임의 문자열 → BehaviorSemantic | null.
 * - DB 의 behavior_class 가 12 클래스 외 값일 때(레거시 데이터 등) null 로 폴백.
 */
export function getBehaviorSemantic(key: string): BehaviorSemantic | null {
  return (BEHAVIOR_SEMANTIC_MAP as Record<string, BehaviorSemantic | undefined>)[
    key
  ] ?? null;
}

/** 12 클래스 키 화이트리스트 Set — RPC 입력 검증/필터에서 활용 */
export const BEHAVIOR_CLASS_KEYS: ReadonlySet<string> = new Set(
  BEHAVIOR_CLASSES.map((c) => c.key),
);

// ⚠️ R8 추가 (R7-(3)): 모듈 import 시 1회 자동 invariants 검증.
//   12 클래스 매핑이 깨졌을 때 silent failure 대신 console.error 로 즉시 감지.
//   테스트 파일에서 import 시 무한 루프 방지 위해 IIFE + 단발 보호 ref.
//   - BEHAVIOR_CLASSES 길이 ≠ 12: 클래스 누락/중복 의심
//   - id 가 0,1,...,11 순서가 아님: YOLO classId 룩업 깨짐
//   - SEMANTIC_MAP 에 누락 키: 통계 집계 시 null 폴백 누수
let _invariantsChecked = false;
(function checkOnce() {
  if (_invariantsChecked) return;
  _invariantsChecked = true;
  try {
    if (BEHAVIOR_CLASSES.length !== 12) {
      // eslint-disable-next-line no-console
      console.error("[behaviorClasses] 길이 ≠ 12:", BEHAVIOR_CLASSES.length);
    }
    const idsOK = BEHAVIOR_CLASSES.every((c, i) => c.id === i);
    if (!idsOK) {
      // eslint-disable-next-line no-console
      console.error(
        "[behaviorClasses] id 순서 깨짐:",
        BEHAVIOR_CLASSES.map((c) => c.id),
      );
    }
    const keys = BEHAVIOR_CLASSES.map((c) => c.key);
    const semKeys = Object.keys(BEHAVIOR_SEMANTIC_MAP);
    const missing = keys.filter((k) => !semKeys.includes(k));
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.error("[behaviorClasses] SEMANTIC_MAP missing:", missing);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[behaviorClasses] invariants check 실패:", e);
  }
})();
