import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureHttpsApiUrl } from "@/lib/url/ensureHttpsApiUrl";

/**
 * Supabase Auth 콜백 핸들러.
 *
 * 처리 케이스:
 * 1. OAuth PKCE 콜백 — `?code=...` (Google, Kakao signInWithOAuth 후 돌아오는 주소)
 * 2. 이메일 확인 / 매직링크 — `?token_hash=...&type=signup|email|recovery`
 *
 * Supabase 대시보드 Authentication → URL Configuration → Redirect URLs 에
 * `https://cat-lac-eight.vercel.app/auth/callback` 를 반드시 추가해야 합니다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  type EmailOtpType = "signup" | "email" | "recovery" | "invite" | "email_change";
  const rawType = url.searchParams.get("type") ?? "signup";
  const otpType: EmailOtpType = (
    ["signup", "email", "recovery", "invite", "email_change"].includes(rawType)
      ? rawType
      : "signup"
  ) as EmailOtpType;
  const nextPath = url.searchParams.get("next") ?? "/";
  const origin = url.origin;

  const safeNext = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;

  if (!code && !tokenHash) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  const cookieStore = await cookies();
  const redirectResponse = NextResponse.redirect(`${origin}${safeNext}`);

  const supabase = createServerClient(
    ensureHttpsApiUrl(supabaseUrl.trim()),
    supabaseAnonKey.trim(),
    {
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

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
    if (error) {
      const message = encodeURIComponent(error.message);
      return NextResponse.redirect(`${origin}/login?error=oauth&message=${message}`);
    }
    return redirectResponse;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    const message = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/login?error=oauth&message=${message}`);
  }

  return redirectResponse;
}
