import { redirect } from "next/navigation";
import { BottomTabBar } from "@/components/shell/BottomTabBar";
import { ShellSplashGate } from "@/components/shell/ShellSplashGate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 메인 셸 — 헤더·하단 탭이 있는 화면(홈·리포트 등).
 * Middleware 이후 2차 서버 사이드 인증 검사를 수행합니다.
 * 로그인 등 인증 전용 화면은 이 레이아웃 밖에 둡니다.
 */
export default async function MainShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }
  } catch {
    redirect("/login");
  }

  return (
    <ShellSplashGate>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-titles">
            <span className="app-header-brand">다보냥</span>
            <span className="app-header-sub">CATvisor</span>
          </div>
          <span className="app-header-badge">집사 대시보드 🐾</span>
        </div>
      </header>
      <div className="app-main">{children}</div>
      <BottomTabBar />
    </ShellSplashGate>
  );
}
