"use client";

import { useCallback, useState } from "react";
import type { DiaryMemo } from "../types/diary";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "../styles/Diary.module.css";

/** 최대 글자 수 */
const MAX_LENGTH = 200;

type DiaryMemoInputProps = {
  /** 선택된 고양이 ID */
  catId: string;
  /** 집 ID */
  homeId: string;
  /** 현재 사용자 ID */
  userId: string;
  /** 오늘 이미 저장된 메모 (없으면 null) */
  existingMemo: DiaryMemo | null;
};

/**
 * 집사 일기장 — 200자 짧은 메모 입력 + 저장
 * 오늘 이미 메모가 있으면 읽기 전용으로 표시, 수정 가능.
 */
export function DiaryMemoInput({
  catId,
  homeId,
  userId,
  existingMemo,
}: DiaryMemoInputProps) {
  const [text, setText] = useState(existingMemo?.content ?? "");
  const [isEditing, setIsEditing] = useState(!existingMemo);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  /* 글자 수 초과 여부 */
  const isOver = text.length > MAX_LENGTH;

  /** 저장 핸들러 */
  const handleSave = useCallback(async () => {
    if (!text.trim() || isOver || saving) return;
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const today = new Date().toISOString().slice(0, 10);

      if (existingMemo) {
        /* 기존 메모 업데이트 */
        const { error } = await supabase
          .from("cat_diary")
          .update({ content: text.trim() })
          .eq("id", existingMemo.id);
        if (error) throw error;
      } else {
        /* 새 메모 삽입 */
        const { error } = await supabase
          .from("cat_diary")
          .insert({
            cat_id: catId,
            home_id: homeId,
            author_id: userId,
            content: text.trim(),
            date: today,
          });
        if (error) throw error;
      }

      setToast("일기 저장 완료! 📝");
      setIsEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "저장 실패";
      setToast(`오류: ${msg}`);
    } finally {
      setSaving(false);
      setTimeout(() => setToast(""), 3000);
    }
  }, [text, isOver, saving, existingMemo, catId, homeId, userId]);

  return (
    <section className={styles.memoSection}>
      <h2 className={styles.sectionTitle}>📝 집사 일기장</h2>

      <div className={styles.memoCard}>
        {isEditing ? (
          <>
            {/* 입력 모드 */}
            <textarea
              className={styles.memoTextarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="오늘 우리 냥이는 어땠나요? (200자)"
              maxLength={MAX_LENGTH + 10}
            />
            <div className={styles.memoFooter}>
              {/* 글자 수 카운터 */}
              <span
                className={`${styles.memoCount} ${isOver ? styles.memoCountOver : ""}`}
              >
                {text.length}/{MAX_LENGTH}
              </span>
              {/* 저장 버튼 */}
              <button
                type="button"
                className={styles.memoSaveBtn}
                onClick={handleSave}
                disabled={!text.trim() || isOver || saving}
              >
                {saving ? "저장 중..." : "저장하기"}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* 읽기 모드 — 저장된 메모 표시 */}
            <div className={styles.memoSaved}>{text}</div>
            <div className={styles.memoFooter}>
              <span className={styles.memoSavedDate}>
                오늘 작성됨
              </span>
              <button
                type="button"
                className={styles.memoSaveBtn}
                onClick={() => setIsEditing(true)}
              >
                수정하기
              </button>
            </div>
          </>
        )}
      </div>

      {/* 토스트 */}
      {toast ? (
        <div className={styles.toast} role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </section>
  );
}
