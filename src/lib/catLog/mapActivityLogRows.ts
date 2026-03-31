import type { ActivityLogListItem } from "@/types/catLog";

type CatEmbed = { name: string; status: string | null } | null;

/** Supabase `cat_logs` + cats embed 조회 한 줄 */
export type CatLogJoinRow = {
  id: string;
  captured_at: string;
  cat_id: string;
  storage_path: string | null;
  cats: CatEmbed | CatEmbed[];
};

function pickCatEmbed(value: CatEmbed | CatEmbed[]): CatEmbed {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

/**
 * Supabase `cat_logs` + `cats` 조인 결과를 ActivityLogListItem 으로 변환합니다.
 */
export function mapActivityLogRows(
  rows: CatLogJoinRow[] | null | undefined,
): ActivityLogListItem[] {
  if (!rows?.length) {
    return [];
  }
  return rows.map((row) => {
    const cat = pickCatEmbed(row.cats);
    return {
      id: row.id,
      captured_at: row.captured_at,
      cat_id: row.cat_id,
      cat_name: cat?.name?.trim() ? cat.name : "고양이",
      cat_status: cat?.status ?? null,
      storage_path: row.storage_path,
    };
  });
}
