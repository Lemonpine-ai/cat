"use client";

import { useCallback, useRef, useState } from "react";
import type { DiaryMemo } from "@/types/diary";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { kstToday } from "./kstRange";

/**
 * 집사 일기장 메모 저장 훅 — insert / update 분기 처리
 * 저장 성공 시 DiaryMemo 객체를 반환하여 부모가 즉시 UI에 반영 가능.
 * savedIdRef로 첫 insert 이후에는 update로 자동 전환된다.
 *
 * insert 시 id를 미리 생성해서 함께 넣는다.
 * .select().single()은 RLS 환경에서 실패할 수 있어서 사용하지 않는다.
 * 날짜는 KST 기준 — UTC 기반 toISOString()은 KST 자정~오전 9시 구간에서 전날로 잘못 기록되는 버그가 있어 kstToday() 사용.
 */
export function useDiaryMemoSave(
  existingMemo: DiaryMemo | null,
  catId: string,
  homeId: string,
  userId: string,
) {
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  /* 저장된 memo id 기억 — 첫 insert 후 다음 저장은 update로 분기 */
  const savedIdRef = useRef<string | null>(existingMemo?.id ?? null);

  const save = useCallback(
    async (content: string): Promise<DiaryMemo | null> => {
      if (!content.trim() || saving) return null;
      setSaving(true);
      try {
        const supabase = createSupabaseBrowserClient();
        /* KST 자정~오전 9시 저장 시 전날 기록 버그 방지 */
        const today = kstToday();

        if (savedIdRef.current) {
          /* 기존 메모 업데이트 */
          const { error } = await supabase
            .from("cat_diary")
            .update({ content: content.trim() })
            .eq("id", savedIdRef.current);
          if (error) throw error;

          setToast("일기 수정 완료! ✏️");
          setTimeout(() => setToast(""), 3000);

          return {
            id: savedIdRef.current,
            cat_id: catId,
            content: content.trim(),
            date: today,
            created_at: existingMemo?.created_at ?? new Date().toISOString(),
          };
        } else {
          /* 새 메모 insert — id를 미리 생성해서 RLS SELECT 정책 우회 */
          const newId = crypto.randomUUID();
          const now = new Date().toISOString();

          const { error } = await supabase
            .from("cat_diary")
            .insert({
              id: newId,
              cat_id: catId,
              home_id: homeId,
              author_id: userId,
              content: content.trim(),
              date: today,
            });

          if (error) throw error;

          /* 다음 저장은 update로 가도록 id 기억 */
          savedIdRef.current = newId;

          setToast("일기 저장 완료! 📝");
          setTimeout(() => setToast(""), 3000);

          return {
            id: newId,
            cat_id: catId,
            content: content.trim(),
            date: today,
            created_at: now,
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
