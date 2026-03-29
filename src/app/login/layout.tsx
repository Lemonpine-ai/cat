import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "로그인 · 다보냥 · CATvisor",
  description: "우리 고양이 모니터링 대시보드에 오신 걸 환영합니다",
};

export default function LoginRouteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
