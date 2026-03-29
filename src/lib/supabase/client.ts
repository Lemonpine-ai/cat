import { createBrowserClient } from "@supabase/ssr";

/**
 * 브라우저 전용 Supabase 클라이언트 (클라이언트 컴포넌트·폼 제출에서 사용).
 * Vercel 환경 변수에 줄바꿈이 포함될 수 있으므로 .trim() 으로 정규화합니다.
 */
export function createSupabaseBrowserClient() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!rawUrl || !rawKey) {
    throw new Error(
      "Supabase 환경 변수가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 확인해 주세요.",
    );
  }

  return createBrowserClient(rawUrl.trim(), rawKey.trim());
}
