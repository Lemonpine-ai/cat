"use client";

/**
 * reports/page.tsx에서 ./DiaryPageClient로 import하기 위한 래퍼.
 * 실제 구현은 features/diary에 있고, 여기서 re-export한다.
 */
export { DiaryPageClient } from "@/features/diary/components/DiaryPageClient";
