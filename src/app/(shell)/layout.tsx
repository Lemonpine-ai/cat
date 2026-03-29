import { BottomTabBar } from "@/components/shell/BottomTabBar";

/**
 * 메인 셸 — 헤더·하단 탭이 있는 화면(홈·리포트 등).
 * 로그인 등 인증 전용 화면은 이 레이아웃 밖에 둡니다.
 */
export default function MainShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-titles">
            <span className="app-header-brand">다보냥</span>
            <span className="app-header-sub">CATvisor</span>
          </div>
          <span className="app-header-badge">보리 &amp; 찹쌀이네 🐾</span>
        </div>
      </header>
      <div className="app-main">{children}</div>
      <BottomTabBar />
    </>
  );
}
