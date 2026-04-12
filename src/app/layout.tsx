import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "다보냥 · CATvisor",
  description: "우리 고양이 모니터링 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        {children}
      </body>
    </html>
  );
}
