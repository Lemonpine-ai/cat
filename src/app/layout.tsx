import type { Metadata } from "next";
import { Jua, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

/** 한글 디스플레이 폰트 — 둥글둥글하고 귀여운 느낌 */
const jua = Jua({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jua",
  display: "swap",
});

/** 본문 폰트 — 가독성 좋은 한국어 산세리프 */
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
      <body className={`${jua.variable} ${notoSansKr.variable}`}>
        {children}
      </body>
    </html>
  );
}
