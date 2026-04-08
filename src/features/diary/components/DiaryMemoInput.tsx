"use client";

import { useState } from "react";
import type { DiaryMemo } from "@/types/diary";
import { useDiaryMemoSave } from "../lib/useDiaryMemoSave";
import styles from "../styles/Diary.module.css";

/** 최대 글자 수 */
const MAX_LENGTH = 200;

type DiaryMemoInputProps = {
  catId: string;
  homeId: string;
  userId: string;
  existingMemo: DiaryMemo | null;
  /** 저장 성공 시 부모에게 최신 메모를 알려주는 콜백 */
  onSaved?: (memo: DiaryMemo) => void;
};

/**
 * 집사 일기장 — 200자 짧은 메모 입력/수정/저장
 * 저장 성공 시 onSaved 콜백으로 부모에 알림 → 일기 카드 아래 댓글에 즉시 반영
 */
export function DiaryMemoInput({
  catId,
  homeId,
  userId,
  existingMemo,
  onSaved,
}: DiaryMemoInputProps) {
  const [text, setText] = useState(existingMemo?.content ?? "");
  const [isEditing, setIsEditing] = useState(!existingMemo);
  const { save, saving, toast } = useDiaryMemoSave(existingMemo, catId, homeId, userId);
  const isOver = text.length > MAX_LENGTH;

  /* 저장 후 읽기 모드 전환 + 부모에 알림 */
  const handleSave = async () => {
    if (isOver) return;
    const saved = await save(text);
    if (saved) {
      setIsEditing(false);
      onSaved?.(saved);
    }
  };

  return (
    <section className={styles.memoSection}>
      <h2 className={styles.sectionTitle}>📝 집사 일기장</h2>
      <div className={styles.memoCard}>
        {isEditing ? (
          <>
            <textarea className={styles.memoTextarea} value={text} onChange={(e) => setText(e.target.value)} placeholder="오늘 우리 냥이는 어땠나요? (200자)" maxLength={MAX_LENGTH + 10} />
            <div className={styles.memoFooter}>
              <span className={`${styles.memoCount} ${isOver ? styles.memoCountOver : ""}`}>{text.length}/{MAX_LENGTH}</span>
              <button type="button" className={styles.memoSaveBtn} onClick={handleSave} disabled={!text.trim() || isOver || saving}>
                {saving ? "저장 중..." : "저장하기"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.memoSaved}>{text}</div>
            <div className={styles.memoFooter}>
              <span className={styles.memoSavedDate}>오늘 작성됨</span>
              <button type="button" className={styles.memoSaveBtn} onClick={() => setIsEditing(true)}>수정하기</button>
            </div>
          </>
        )}
      </div>
      {toast ? <div className={styles.toast} role="status" aria-live="polite">{toast}</div> : null}
    </section>
  );
}
