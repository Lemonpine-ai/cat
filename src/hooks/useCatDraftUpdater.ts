/**
 * cat-identity Tier 1 fix R4-3 M1 — CatDraft 단일 필드 업데이트 헬퍼.
 *
 * 배경:
 *  - CatProfileForm 만 fix R3 R5-E3 적용 (`onChange((prev) => ...)`, deps `[onChange]`).
 *  - 자식 CatHealthFields / CatLifestyleFields 는 여전히 `onChange({ ...draft, [key]: value })`,
 *    deps `[draft, onChange]` → memo 효과 무효 (draft 가 바뀔 때마다 update 재생성).
 *
 * 본 훅으로 동일 패턴 강제 — deps = [onChange] 만, 함수형 setter (prev => ...).
 *
 * @example
 *   const update = useCatDraftUpdater(onChange);
 *   update("name", "나비");
 *   update("isNeutered", "yes");
 */

"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { CatDraft } from "@/types/cat";

/**
 * CatDraft 의 단일 필드 업데이트 setter 를 useCallback 으로 안정화 반환.
 *
 * deps = [onChange] 만 → onChange 가 안정화되어 있으면 update 도 첫 렌더에 한 번만 생성.
 * 함수형 updater (`prev => ...`) 사용으로 stale closure 회피.
 */
export function useCatDraftUpdater(
  onChange: Dispatch<SetStateAction<CatDraft>>,
): <K extends keyof CatDraft>(key: K, value: CatDraft[K]) => void {
  return useCallback(
    <K extends keyof CatDraft>(key: K, value: CatDraft[K]) => {
      onChange((prev) => ({ ...prev, [key]: value }));
    },
    [onChange],
  );
}
