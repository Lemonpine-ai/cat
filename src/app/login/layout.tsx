import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "로그인 · 다보냥 · CATvisor",
  description: "보리·찹쌀이네에 오신 걸 환영합니다",
};

export default function LoginRouteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
