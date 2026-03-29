import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 서버 컴포넌트·Server Actions·Route Handler 에서 사용하는 Supabase 클라이언트.
 * 요청 쿠키에 세션이 있으면 RLS 정책이 적용된 데이터를 읽을 수 있습니다.
 * Vercel 환경 변수에 줄바꿈이 포함될 수 있으므로 .trim() 으로 정규화합니다.
 */
export async function createSupabaseServerClient() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!rawUrl || !rawKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 설정되지 않았습니다.",
    );
  }

  const supabaseUrl = rawUrl.trim();
  const supabaseAnonKey = rawKey.trim();

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component 에서 set 이 막힐 수 있음 (세션 갱신은 미들웨어 등에서 처리)
        }
      },
    },
  });
}
