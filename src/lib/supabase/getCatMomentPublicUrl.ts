import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const BUCKET = "cat-moments";

/**
 * 공개 버킷 `cat-moments` 의 storage_path 로 브라우저에서 바로 열 수 있는 URL 을 만듭니다.
 */
export function getCatMomentPublicUrl(storagePath: string): string | null {
  const trimmed = storagePath.trim();
  if (!trimmed) {
    return null;
  }
  const supabase = createSupabaseBrowserClient();
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(trimmed);
  return data.publicUrl;
}
