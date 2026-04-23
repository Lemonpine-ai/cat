/**
 * Supabase query 빌더용 user_label 필터 헬퍼.
 *
 * - 통계 집계(behaviorEventsToDiaryStats / weeklyBehaviorAvg) 시 노이즈 라벨
 *   (human / shadow / other_animal) row 는 SELECT 단계에서 제외해야 함.
 * - PostgREST `or()` 절 문자열 형식 사용:
 *     user_label.is.null,user_label.not.in.(human,shadow,other_animal)
 *   → "user_label IS NULL  OR  user_label NOT IN (...)"
 *
 * 사용 예:
 *   supabase
 *     .from("cat_behavior_events")
 *     .select(...)
 *     .or(NON_NOISE_FILTER)
 */

/** 노이즈 라벨 값 (RPC/CHECK 와 동일 화이트리스트) */
export const NOISE_LABEL_VALUES = ["human", "shadow", "other_animal"] as const;

/**
 * PostgREST or() 절 문자열 — "is null OR not in (노이즈)".
 * - in.() 안의 값은 따옴표 없는 raw token (PostgREST 규약).
 * - 호출부: `.or(NON_NOISE_FILTER)`
 *
 * ⚠️ PostgREST 의미: 본 or() 절은 호출부의 다른 .eq/.gte/.lt 와 AND 결합된다.
 *   즉 "(other filters) AND (user_label IS NULL OR user_label NOT IN (...))" 형태.
 *   or() 안에 다른 컬럼 필터를 추가하면 AND→OR 로 의미가 바뀌므로 금지.
 */
export const NON_NOISE_FILTER = `user_label.is.null,user_label.not.in.(${NOISE_LABEL_VALUES.join(",")})`;
