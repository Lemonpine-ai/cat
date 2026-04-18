"use client";

import { useCallback, useEffect, useState } from "react";
import { CATVISOR_SOUND_ENABLED_STORAGE_KEY } from "@/lib/sound/soundPreferenceStorageKey";

/**
 * 효과음 on/off 설정을 localStorage에 동기화하는 훅.
 * 마운트 시 저장값 로딩, 토글 시 저장값 갱신.
 */
export function useSoundPreference() {
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);

  /* ── 효과음 설정 로딩 ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CATVISOR_SOUND_ENABLED_STORAGE_KEY);
      if (raw === "0") setIsSoundEnabled(false);
      if (raw === "1") setIsSoundEnabled(true);
    } catch {
      // storage 사용 불가
    }
  }, []);

  /** 효과음 토글 */
  const toggleSoundEnabled = useCallback(() => {
    setIsSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(
          CATVISOR_SOUND_ENABLED_STORAGE_KEY,
          next ? "1" : "0",
        );
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { isSoundEnabled, toggleSoundEnabled };
}
