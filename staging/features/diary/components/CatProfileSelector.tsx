"use client";

import type { DiaryCatProfile } from "../types/diary";
import styles from "../styles/Diary.module.css";

type CatProfileSelectorProps = {
  /** 집에 등록된 고양이 목록 */
  cats: DiaryCatProfile[];
  /** 현재 선택된 고양이 ID */
  selectedCatId: string;
  /** 고양이 선택 시 호출 */
  onSelect: (catId: string) => void;
};

/**
 * 상단 고양이 프로필 아이콘 목록
 * — 탭하면 해당 냥이 다이어리로 전환
 */
export function CatProfileSelector({
  cats,
  selectedCatId,
  onSelect,
}: CatProfileSelectorProps) {
  return (
    <div className={styles.profileSelector} role="tablist" aria-label="고양이 선택">
      {cats.map((cat) => {
        const isActive = cat.id === selectedCatId;
        return (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={styles.profileItem}
            onClick={() => onSelect(cat.id)}
          >
            {/* 고양이 아바타 */}
            <div
              className={`${styles.profileAvatar} ${
                isActive ? styles.profileAvatarActive : ""
              }`}
            >
              {cat.photo_front_url ? (
                <img src={cat.photo_front_url} alt={cat.name} />
              ) : (
                /* 사진 없으면 이모지 */
                <span style={{ fontSize: "1.6rem", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
                  🐱
                </span>
              )}
            </div>
            {/* 이름 */}
            <span
              className={`${styles.profileName} ${
                isActive ? styles.profileNameActive : ""
              }`}
            >
              {cat.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
