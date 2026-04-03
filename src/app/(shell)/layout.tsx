import { redirect } from "next/navigation";
import { BottomTabBar } from "@/components/shell/BottomTabBar";
import { ShellSplashGate } from "@/components/shell/ShellSplashGate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 메인 셸 — 헤더·하단 탭이 있는 화면(홈·리포트 등).
 * 1) 로그인 여부 확인 → 미로그인 시 /login
 * 2) home_id 여부 확인 → 홈 미설정 시 /onboarding
 */
export default async function MainShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let userExists = false;
  let hasHome = false;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userExists = Boolean(user);

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("home_id")
        .eq("id", user.id)
        .single();
      hasHome = Boolean(profile?.home_id);
    }
  } catch (supabaseInitError) {
    const isEnvMissing =
      supabaseInitError instanceof Error &&
      supabaseInitError.message.includes("NEXT_PUBLIC_SUPABASE");
    if (isEnvMissing) {
      redirect("/login");
    }
  }

  if (!userExists) {
    redirect("/login");
  }

  if (!hasHome) {
    redirect("/onboarding");
  }

  return (
    <ShellSplashGate>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-profile">
            <span className="app-header-avatar" aria-hidden />
            <span className="app-header-name">다보냥</span>
          </div>
          <button type="button" className="app-header-notify" aria-label="알림">
            🔔
          </button>
        </div>
      </header>
      <div className="app-main">{children}</div>
      <BottomTabBar />
    </ShellSplashGate>
  );
}
