import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Supabase OAuth(PKCE) 콜백 — 구글·카카오 등 signInWithOAuth 후 돌아오는 주소.
 * 대시보드 Authentication → URL 설정에 이 경로를 Redirect URL 로 추가해야 합니다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = url.searchParams.get("next") ?? "/";
  const origin = url.origin;

  const safeNext = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  const cookieStore = await cookies();
  const redirectResponse = NextResponse.redirect(`${origin}${safeNext}`);

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          redirectResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const message = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/login?error=oauth&message=${message}`);
  }

  return redirectResponse;
}
