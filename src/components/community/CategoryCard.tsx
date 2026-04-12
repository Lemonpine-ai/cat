"use client";

import Link from "next/link";
import { Camera, Baby, Heart, Stethoscope } from "lucide-react";
import styles from "./Community.module.css";

/* ── v2 디자인 리뷰 적용 ──
   D2(UX): 돌봄/모니터링 앱 카테고리 카드 패턴. 아이콘뱃지 + 색상 배경 + 설명
   D3(비주얼): 각 카테고리별 파스텔 배경색으로 시각적 구분
   P1(심리): 따뜻한 파스텔 색상 = 접근하기 편한 느낌
   C1(카피): 따뜻한 설명 문구 */

/** 아이콘 이름 → 컴포넌트 매핑 */
const ICON_MAP = {
  Camera,
  Baby,
  Heart,
  Stethoscope,
} as const;

/** 카테고리별 파스텔 배경색 + 아이콘 색상 — v4 따뜻한 톤 */
const CATEGORY_COLORS: Record<string, { bg: string; icon: string; border: string }> = {
  brag:    { bg: "rgba(255,218,185,0.3)", icon: "#e8804a", border: "rgba(255,183,166,0.2)" },
  kitten:  { bg: "rgba(255,183,197,0.25)", icon: "#e05580", border: "rgba(255,183,197,0.2)" },
  senior:  { bg: "rgba(196,181,253,0.25)", icon: "#7c3aed", border: "rgba(196,181,253,0.2)" },
  health:  { bg: "rgba(167,223,250,0.25)", icon: "#2980b9", border: "rgba(167,223,250,0.2)" },
};

type CategoryCardProps = {
  categoryKey: string;
  name: string;
  description: string;
  icon: keyof typeof ICON_MAP;
  href: string;
};

/** 커뮤니티 카테고리 카드 — v2 파스텔 아이콘뱃지 스타일 */
export function CategoryCard({
  categoryKey,
  name,
  description,
  icon,
  href,
}: CategoryCardProps) {
  const IconComponent = ICON_MAP[icon] ?? Camera;
  const colors = CATEGORY_COLORS[categoryKey] ?? CATEGORY_COLORS.brag;

  return (
    <Link href={href} className={styles.categoryCard}>
      {/* D3: 파스텔 원형 아이콘뱃지 */}
      <span
        className={styles.categoryIconBadge}
        style={{ background: colors.bg, color: colors.icon }}
      >
        <IconComponent size={22} strokeWidth={2} />
      </span>
      <span className={styles.categoryCardName}>{name}</span>
      <span className={styles.categoryCardDesc}>{description}</span>
    </Link>
  );
}
