import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ensureHttpsApiUrl } from "@/lib/url/ensureHttpsApiUrl";

/**
 * Supabase 세션 쿠키 자동 갱신 미들웨어.
 * 모든 페이지 요청마다 만료된 JWT 토큰을 갱신해서 쿠키에 다시 저장한다.
 * 이게 없으면 Google OAuth 로그인 후에도 세션이 유지되지 않는다.
 */
export async function middleware(request: NextRequest) {
  /* ── 응답 객체 생성 ── */
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  /* 환경 변수 없으면 미들웨어 건너뜀 */
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  /* ── Supabase 클라이언트 (쿠키 읽기/쓰기) ── */
  const supabase = createServerClient(
    ensureHttpsApiUrl(supabaseUrl.trim()),
    supabaseAnonKey.trim(),
    {
      cookies: {
        /* 요청 쿠키에서 세션 토큰 읽기 */
        getAll() {
          return request.cookies.getAll();
        },
        /* 갱신된 토큰을 응답 쿠키에 쓰기 */
        setAll(cookiesToSet) {
          /* 요청 객체에도 세트 (서버 컴포넌트가 읽을 수 있도록) */
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          /* 새 응답 객체를 만들어서 쿠키 반영 */
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  /* ── 세션 갱신 (이 호출이 만료된 토큰을 자동으로 리프레시) ── */
  await supabase.auth.getUser();

  return supabaseResponse;
}

/* ── 미들웨어 적용 범위 ── */
export const config = {
  matcher: [
    /* 정적 파일, 이미지, 파비콘 제외. 나머지 모든 경로에 적용 */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
