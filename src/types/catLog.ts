/**
 * 최근 활동( cat_logs ) 리스트 한 줄 — UI·실시간 구독 공통.
 */
export type ActivityLogListItem = {
  id: string;
  captured_at: string;
  cat_id: string;
  cat_name: string;
  /** 조회 시점 cats.status (스냅샷 아님) */
  cat_status: string | null;
  storage_path: string | null;
};
