/**
 * 고양이 목록 중복 제거 유틸 — 이름(name) 기준 첫 번째 행만 유지.
 *
 * 근본 원인 가드:
 *   DB에 같은 home_id+name 의 cats 행이 여러 개 존재하는 경우가 있음.
 *   UNIQUE 인덱스는 별도 migration 으로 적용 예정이나, 그 전까지 홈 대시보드/
 *   리포트 페이지에서 보리/찹쌀 같은 고양이가 두 번 렌더되는 문제를 방지.
 *
 * 규칙:
 *   - name 이 null/undefined/빈 문자열인 행은 제외 대상에서 빼고 그대로 통과시킴
 *     (이름 정보가 없는 임시 레코드까지 묶어서 날리면 안 됨).
 *   - 같은 name 이 두 번째로 등장하면 버림 (정렬이 ascending 인 전제로 첫 번째 유지).
 */

/** 이름 필드만 필수 — 다른 필드는 호출부 타입 그대로 유지 */
export function dedupeCatsByName<T extends { name?: string | null }>(cats: T[]): T[] {
  /* 이미 본 이름 집합 — 중복 여부 O(1) 판정 */
  const seenNames = new Set<string>();
  return cats.filter((cat) => {
    /* 빈 이름/undefined/null 은 통과 (제외 대상에서 제외) */
    if (!cat.name) return true;
    if (seenNames.has(cat.name)) return false;
    seenNames.add(cat.name);
    return true;
  });
}
