"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { CatProfileRow } from "@/types/cat";

type HomeProfileRowProps = {
  cats: CatProfileRow[];
  fetchErrorMessage: string | null;
};

/**
 * 피그마 스타일 상단 고양이 프로필 가로 스트립 — 이름·사진은 Supabase cats 기준.
 */
export function HomeProfileRow({
  cats,
  fetchErrorMessage,
}: HomeProfileRowProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (fetchErrorMessage) {
    return (
      <p className="rounded-[1.5rem] border border-red-200/80 bg-white/90 px-4 py-3 text-sm text-red-700 shadow-[var(--shadow-card)]">
        프로필을 불러오지 못했습니다. {fetchErrorMessage}
      </p>
    );
  }

  if (cats.length === 0) {
    return (
      <div className="rounded-[2rem] border-2 border-dashed border-[rgba(30,143,131,0.25)] bg-white/80 px-4 py-6 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm font-medium text-[var(--color-text-sub)]">
          등록된 고양이가 없어요. 고양이를 추가해 주세요.
        </p>
        <Link
          href="/settings"
          className="mt-3 inline-flex items-center justify-center rounded-full bg-[var(--mint-500)] px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-105"
        >
          설정에서 추가하기
        </Link>
      </div>
    );
  }

  return (
    <section aria-label="우리 고양이 프로필" className="w-full">
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cats.map((cat, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`flex shrink-0 flex-col items-center gap-1.5 rounded-3xl px-2 pt-1 pb-2 transition ${
                isActive
                  ? "ring-2 ring-[var(--mint-600)] ring-offset-2 ring-offset-[#e0f7fa]"
                  : "opacity-75 hover:opacity-100"
              }`}
            >
              <div className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-white bg-[var(--mint-100)] shadow-[var(--shadow-card)]">
                {cat.photo_front_url ? (
                  <Image
                    src={cat.photo_front_url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl" aria-hidden>
                    🐱
                  </span>
                )}
              </div>
              <span
                className={`max-w-[4.5rem] truncate text-center text-xs font-semibold ${
                  isActive ? "text-[var(--mint-900)]" : "text-[var(--color-text-muted)]"
                }`}
              >
                {cat.name}
              </span>
            </button>
          );
        })}
        <Link
          href="/settings"
          className="flex shrink-0 flex-col items-center gap-1.5 rounded-3xl px-2 pt-1 pb-2 text-[var(--color-text-muted)] opacity-90 hover:opacity-100"
          aria-label="고양이 추가"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-[rgba(30,143,131,0.35)] bg-white/70 shadow-sm">
            <Plus className="h-6 w-6 text-[var(--mint-700)]" strokeWidth={2} aria-hidden />
          </div>
          <span className="text-xs font-semibold">추가</span>
        </Link>
      </div>
    </section>
  );
}
