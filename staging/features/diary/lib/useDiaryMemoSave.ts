"use client";

import { useCallback, useRef, useState } from "react";
import type { DiaryMemo } from "@/types/diary";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 집사 일기장 메모 저장 훅 — insert / update 분기 처리
 * 저장 성공 시 memo ID를 기억해서 다음 저장은 update로 처리한다.
 */
export function useDiaryMemoSave(
  existingMemo: DiaryMemo | null,
  catId: string,
  homeId: string,
  userId: string,
) {
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  /* 저장된 memo id를 기억 — 첫 insert 후 다음은 update로 분기 */
  const savedIdRef = useRef<string | null>(existingMemo?.id ?? null);

  const save = useCallback(
    async (content: string): Promise<DiaryMemo | null> => {
      if (!content.trim() || saving) return null;
      setSaving(true);
      try {
        const supabase = createSupabaseBrowserClient();
        const today = new Date().toISOString().slice(0, 10);

        /* 이미 저장된 메모가 있으면 update, 없으면 insert */
        if (savedIdRef.current) {
          const { error } = await supabase
            .from("cat_diary")
            .update({ content: content.trim() })
            .eq("id", savedIdRef.current);
          if (error) throw error;

          setToast("일기 수정 완료! ✏️");
          setTimeout(() => setToast(""), 3000);

          /* 수정된 메모 객체 반환 */
          return {
            id: savedIdRef.current,
            cat_id: catId,
            content: content.trim(),
            date: today,
            created_at: existingMemo?.created_at ?? new Date().toISOString(),
          };
        } else {
          /* 새 메모 insert — id를 돌려받아 저장 */
          const { data, error } = await supabase
            .from("cat_diary")
            .insert({
              cat_id: catId,
              home_id: homeId,
              author_id: userId,
              content: content.trim(),
              date: today,
            })
            .select("id, created_at")
            .single();

          if (error) throw error;

          /* 다음 저장은 update로 가도록 id 기억 */
          savedIdRef.current = data.id;

          setToast("일기 저장 완료! 📝");
          setTimeout(() => setToast(""), 3000);

          return {
            id: data.id,
            cat_id: catId,
            content: content.trim(),
            date: today,
            created_at: data.created_at,
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "저장 실패";
        setToast(`오류: ${msg}`);
        setTimeout(() => setToast(""), 3000);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [saving, catId, homeId, userId, existingMemo],
  );

  return { save, saving, toast };
}
