"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import styles from "./Community.module.css";

/** 우하단 고정 FAB — 글쓰기 페이지로 이동 */
export function FloatingWriteButton() {
  return (
    <Link href="/community/write" className={styles.fab} aria-label="글쓰기">
      <Plus size={24} />
    </Link>
  );
}
