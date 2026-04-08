"use client";

import { useCallback, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./Diary.module.css";

type Props = { catId: string; homeId: string; existingMemo: string | null };

/** 집사 일기장 — 200자 제한 textarea + 저장 (cat_diary insert/update) */
export function DiaryMemoInput({ catId, homeId, existingMemo }: Props) {
  const [content, setContent] = useState(existingMemo ?? "");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  }, []);

  const handleSave = useCallback(async () => {
    if (!content.trim() || saving) return;
    setSaving(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast("로그인이 필요해요!");
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      if (existingMemo !== null) {
        await supabase.from("cat_diary").update({ content: content.trim() })
          .eq("cat_id", catId).eq("home_id", homeId).eq("date", today);
      } else {
        await supabase.from("cat_diary").insert({
          home_id: homeId, author_id: user.id, cat_id: catId,
          content: content.trim(), date: today,
        });
      }

      showToast("저장했다옹! 🐾");
    } catch {
      showToast("저장에 실패했어요 😿");
    } finally {
      setSaving(false);
    }
  }, [content, saving, catId, homeId, existingMemo, showToast]);

  return (
    <div className={styles.diaryMemo}>
      <div className={styles.diaryMemoTitle}>집사 일기장 ✏️</div>
      <textarea className={styles.diaryTextarea} placeholder="오늘 우리 냥이에게 한마디..."
        maxLength={200} value={content} onChange={(e) => setContent(e.target.value)} />
      <div className={styles.diaryCharCount}>{content.length}/200</div>
      <button
        className={styles.diarySaveBtn}
        onClick={handleSave}
        disabled={saving || !content.trim()}
      >
        {saving ? "저장 중..." : "저장하기"}
      </button>

      {/* 토스트 메시지 */}
      {toast && (
        <div className={styles.toast} role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
