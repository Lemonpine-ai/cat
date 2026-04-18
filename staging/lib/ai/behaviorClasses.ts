/**
 * YOLO 행동 인식 12개 클래스 정의
 * - 학습 데이터셋과 정확히 같은 순서 (id 0~11)
 * - key: 영문 식별자 (DB 저장용)
 * - label: 한글 UI 표시
 * - emoji: 오버레이 표시용 아이콘
 */

export const BEHAVIOR_CLASSES = [
  { id: 0, key: "arch", label: "아치자세", emoji: "🐈" },
  { id: 1, key: "arm_stretch", label: "기지개", emoji: "🧘" },
  { id: 2, key: "foot_push", label: "발차기", emoji: "🦶" },
  { id: 3, key: "get_down", label: "내려오기", emoji: "⬇️" },
  { id: 4, key: "grooming", label: "그루밍", emoji: "💧" },
  { id: 5, key: "heading", label: "박치기", emoji: "🎯" },
  { id: 6, key: "lay_down", label: "눕기", emoji: "🛌" },
  { id: 7, key: "lying", label: "누워있음", emoji: "😴" },
  { id: 8, key: "roll", label: "구르기", emoji: "🔄" },
  { id: 9, key: "sit_down", label: "앉기", emoji: "🪑" },
  { id: 10, key: "tailing", label: "꼬리흔들기", emoji: "〰️" },
  { id: 11, key: "walk_run", label: "걷기/뛰기", emoji: "🏃" },
] as const;

export type BehaviorClassKey = typeof BEHAVIOR_CLASSES[number]["key"];

/**
 * classId(0~11) → 클래스 정보 조회
 * - YOLO 출력의 인덱스로 빠르게 룩업
 * - 범위 밖이면 null 반환 (UI가 안전하게 스킵)
 */
export function getBehaviorClass(
  classId: number,
): (typeof BEHAVIOR_CLASSES)[number] | null {
  if (classId < 0 || classId >= BEHAVIOR_CLASSES.length) return null;
  return BEHAVIOR_CLASSES[classId];
}
