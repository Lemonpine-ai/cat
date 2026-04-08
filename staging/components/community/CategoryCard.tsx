"use client";

import Link from "next/link";
import { Camera, Baby, Heart, Stethoscope } from "lucide-react";
import styles from "./Community.module.css";

/** 아이콘 이름 → 컴포넌트 매핑 */
const ICON_MAP = {
  Camera,
  Baby,
  Heart,
  Stethoscope,
} as const;

type CategoryCardProps = {
  categoryKey: string;
  name: string;
  description: string;
  icon: keyof typeof ICON_MAP;
  href: string;
};

/** 커뮤니티 카테고리 카드 — 클릭하면 해당 카테고리 글 목록으로 이동 */
export function CategoryCard({
  name,
  description,
  icon,
  href,
}: CategoryCardProps) {
  const IconComponent = ICON_MAP[icon] ?? Camera;

  return (
    <Link href={href} className={styles.categoryCard}>
      <IconComponent size={28} className={styles.categoryCardIcon} />
      <span className={styles.categoryCardName}>{name}</span>
      <span className={styles.categoryCardDesc}>{description}</span>
    </Link>
  );
}
