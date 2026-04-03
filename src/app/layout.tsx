import type { Metadata } from "next";
import { Inter, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

/** UI 산세리프 — 피그마 하이엔드 톤(Inter) */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/** 본문 한글 — 가독성 */
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-noto",
  display: "swap",
});

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
      <body className={`${inter.variable} ${notoSansKr.variable}`}>
        {children}
      </body>
    </html>
  );
}
