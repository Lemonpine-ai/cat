"use client";

import type { DiaryCatProfile } from "@/types/diary";
import styles from "./Diary.module.css";

/** 고양이 프로필 셀렉터 Props */
type Props = {
  cats: DiaryCatProfile[];
  selectedCatId: string;
  onSelect: (catId: string) => void;
};

/**
 * 상단 고양이 프로필 아이콘 목록
 * - 가로 스크롤 가능
 * - 선택된 고양이에 민트색 테두리 표시
 */
export function CatProfileSelector({ cats, selectedCatId, onSelect }: Props) {
  return (
    <div className={styles.catSelector} role="tablist" aria-label="고양이 선택">
      {cats.map((cat) => {
        const isSelected = cat.id === selectedCatId;
        return (
          <button
            key={cat.id}
            className={styles.catSelectorItem}
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(cat.id)}
          >
            {/* 프로필 사진 또는 기본 아이콘 */}
            {cat.photo_front_url ? (
              <img
                src={cat.photo_front_url}
                alt={cat.name}
                className={`${styles.catSelectorAvatar} ${isSelected ? styles.selected : ""}`}
              />
            ) : (
              <div
                className={`${styles.catSelectorPlaceholder} ${isSelected ? styles.selected : ""}`}
              >
                🐱
              </div>
            )}
            <span className={styles.catSelectorName}>{cat.name}</span>
          </button>
        );
      })}
    </div>
  );
}
