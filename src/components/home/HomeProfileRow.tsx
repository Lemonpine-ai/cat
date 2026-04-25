"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { CatProfileRow } from "@/types/cat";

/** 등록 화면에서 sessionStorage 에 남기는 환영 토스트 키 (fix R1 #3 cache). */
const WELCOME_TOAST_KEY = "cat-welcome-name";
/** 토스트 자동 닫힘 시간 (ms). */
const TOAST_DURATION_MS = 3500;

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
  /* fix R1 #3 — 등록 직후 환영 토스트 (sessionStorage 1회성). */
  const [welcomeName, setWelcomeName] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const name = window.sessionStorage.getItem(WELCOME_TOAST_KEY);
    if (!name) return;
    setWelcomeName(name);
    window.sessionStorage.removeItem(WELCOME_TOAST_KEY);
    const timer = window.setTimeout(() => setWelcomeName(null), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  /* fix R1 #3 — 환영 토스트 element. cats 분기 어디서든 위에 노출. */
  const welcomeToast = welcomeName ? (
    <div
      role="status"
      aria-live="polite"
      className="mb-2 rounded-2xl border border-[rgba(30,143,131,0.35)] bg-[var(--mint-100)] px-4 py-2 text-sm font-medium text-[var(--mint-900)] shadow-[var(--shadow-card)]"
    >
      🎉 {welcomeName} 등록 완료! 환영해요.
    </div>
  ) : null;

  if (fetchErrorMessage) {
    return (
      <>
        {welcomeToast}
        <p className="rounded-[1.5rem] border border-red-200/80 bg-white/90 px-4 py-3 text-sm text-red-700 shadow-[var(--shadow-card)]">
          프로필을 불러오지 못했습니다. {fetchErrorMessage}
        </p>
      </>
    );
  }

  if (cats.length === 0) {
    return (
      <>
        {welcomeToast}
        <div className="rounded-[2rem] border-2 border-dashed border-[rgba(30,143,131,0.25)] bg-white/80 px-4 py-6 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm font-medium text-[var(--color-text-sub)]">
            등록된 고양이가 없어요. 고양이를 추가해 주세요.
          </p>
          {/* cat-identity Tier 1: 이전 settings 우회 경로 제거 (Tier 1 이후 직접 이동). */}
          <Link
            href="/cats/new"
            className="mt-3 inline-flex items-center justify-center rounded-full bg-[var(--mint-500)] px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-105"
          >
            🐱 고양이 등록하기
          </Link>
        </div>
      </>
    );
  }

  return (
    <section aria-label="우리 고양이 프로필" className="w-full">
      {welcomeToast}
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
        {/* cat-identity Tier 1: + 추가 버튼이 /cats/new 등록 화면으로 직접 이동 (이전 settings 우회 경로 제거). */}
        <Link
          href="/cats/new"
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
