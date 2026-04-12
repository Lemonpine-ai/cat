/* ──────────────────────────────────────
   Supabase service_role 클라이언트 (공통)
   FGS API Route + Aggregator에서 공유 사용
   ⚠️ 서버 전용 — RLS 우회 권한
   ────────────────────────────────────── */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** 싱글톤 캐싱 — 매번 새로 만들지 않음 */
let client: SupabaseClient | null = null;

/**
 * service_role 권한의 Supabase 클라이언트 반환
 * RLS를 우회하여 서버에서 직접 INSERT/UPDATE 가능
 */
export function getServiceClient(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.",
      );
    }
    client = createClient(url.trim(), key.trim());
  }
  return client;
}
