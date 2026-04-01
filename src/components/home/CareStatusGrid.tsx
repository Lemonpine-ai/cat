"use client";

import {
  Activity,
  Baby,
  Droplets,
  Pill,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatElapsedTimeLabel } from "@/lib/time/formatElapsedTimeLabel";

const MEAL_DAILY_GOAL = 3;

/** 빠른 케어 기록 버튼과 동일 팔레트·아이콘 (맘마=Baby/민트, 식수=물방울+리프레시/블루, 화장실=스파클/코랄, 약=캡슐/라벤더) */
function CareStatusIconBadge({
  category,
}: {
  category: "litter" | "water" | "meal" | "medicine";
}) {
  if (category === "litter") {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(255,171,145,0.38)] text-[#E65100]"
        aria-hidden
      >
        <Sparkles size={18} strokeWidth={2} />
      </span>
    );
  }
  if (category === "water") {
    return (
      <span
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(3,169,244,0.22)] text-[#0277BD]"
        aria-hidden
      >
        <Droplets size={17} strokeWidth={2} className="relative z-[1]" />
        <RefreshCw
          size={11}
          strokeWidth={2.5}
          className="absolute bottom-0.5 right-0.5 opacity-95"
        />
      </span>
    );
  }
  if (category === "meal") {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(77,182,172,0.32)] text-[#00695C]"
        aria-hidden
      >
        <Baby size={18} strokeWidth={2} />
      </span>
    );
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(179,136,255,0.3)] text-[#5E35B1]"
      aria-hidden
    >
      <Pill size={18} strokeWidth={2} />
    </span>
  );
}

type CareStatusGridProps = {
  /** 분 단위 경과 라벨 갱신용 (부모에서 1분마다 증가) */
  revalidateTick: number;
  homeId: string;
  lastWaterChangeAt: string | null;
  lastLitterCleanAt: string | null;
  initialTodayMealCount: number;
  initialTodayMedicineCount: number;
  onRequestWaterChange: () => void;
  onRequestLitterClean: () => void;
  envSavingWater: boolean;
  envSavingLitter: boolean;
};

/**
 * 피그마 CARE STATUS — 화장실·식수·맘마·약 (Supabase cat_care_logs + 경과 시간).
 */
export function CareStatusGrid({
  revalidateTick,
  homeId,
  lastWaterChangeAt,
  lastLitterCleanAt,
  initialTodayMealCount,
  initialTodayMedicineCount,
  onRequestWaterChange,
  onRequestLitterClean,
  envSavingWater,
  envSavingLitter,
}: CareStatusGridProps) {
  const [mealCount, setMealCount] = useState(initialTodayMealCount);
  const [medicineCount, setMedicineCount] = useState(initialTodayMedicineCount);

  useEffect(() => {
    setMealCount(initialTodayMealCount);
  }, [initialTodayMealCount]);

  useEffect(() => {
    setMedicineCount(initialTodayMedicineCount);
  }, [initialTodayMedicineCount]);

  useEffect(() => {
    if (!homeId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`care_status_grid_${homeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "cat_care_logs",
          filter: `home_id=eq.${homeId}`,
        },
        (payload) => {
          const row = payload.new as { care_kind: string; created_at: string };
          const insertedDate = row.created_at.slice(0, 10);
          const todayDate = new Date().toISOString().slice(0, 10);
          if (insertedDate !== todayDate) return;
          if (row.care_kind === "meal") {
            setMealCount((previous) => previous + 1);
          } else if (row.care_kind === "medicine") {
            setMedicineCount((previous) => previous + 1);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [homeId]);

  const waterLabel = lastWaterChangeAt ? "교체 완료" : "기록 없음";
  const litterLabel = lastLitterCleanAt ? "깨끗함" : "기록 없음";
  const medicineLabel = medicineCount > 0 ? "완료" : "기록 없음";

  void revalidateTick;

  return (
    <section aria-label="돌봄 현황" className="w-full">
      <div className="mb-3 flex items-center justify-between px-0.5">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide text-[var(--color-primary-dark)]">
          CARE STATUS
        </h2>
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
          돌봄 현황
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onRequestLitterClean}
          disabled={envSavingLitter}
          className="flex flex-col gap-2 rounded-[1.75rem] border border-white/80 bg-white p-4 text-left shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-card-hover)] active:scale-[0.99] disabled:opacity-60"
        >
          <div className="flex items-center gap-2">
            <CareStatusIconBadge category="litter" />
            <span className="text-xs font-bold text-[var(--color-text-muted)]">화장실</span>
          </div>
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-primary-dark)]">
            {litterLabel}
          </p>
          <p className="text-[0.72rem] text-[var(--color-text-muted)]">
            {lastLitterCleanAt
              ? formatElapsedTimeLabel(lastLitterCleanAt)
              : "청소 기록을 남겨 주세요"}
          </p>
        </button>

        <button
          type="button"
          onClick={onRequestWaterChange}
          disabled={envSavingWater}
          className="flex flex-col gap-2 rounded-[1.75rem] border border-white/80 bg-white p-4 text-left shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-card-hover)] active:scale-[0.99] disabled:opacity-60"
        >
          <div className="flex items-center gap-2">
            <CareStatusIconBadge category="water" />
            <span className="text-xs font-bold text-[var(--color-text-muted)]">식수</span>
          </div>
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-primary-dark)]">
            {waterLabel}
          </p>
          <p className="text-[0.72rem] text-[var(--color-text-muted)]">
            {lastWaterChangeAt
              ? formatElapsedTimeLabel(lastWaterChangeAt)
              : "교체 기록을 남겨 주세요"}
          </p>
        </button>

        <div className="flex flex-col gap-2 rounded-[1.75rem] border border-white/80 bg-white p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <CareStatusIconBadge category="meal" />
            <span className="text-xs font-bold text-[var(--color-text-muted)]">맘마 먹기</span>
          </div>
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-primary-dark)]">
            {mealCount}/{MEAL_DAILY_GOAL}
          </p>
          <p className="text-[0.72rem] text-[var(--color-text-muted)]">오늘 기록 횟수</p>
        </div>

        <div className="flex flex-col gap-2 rounded-[1.75rem] border border-white/80 bg-white p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <CareStatusIconBadge category="medicine" />
            <span className="text-xs font-bold text-[var(--color-text-muted)]">약 먹기</span>
          </div>
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-primary-dark)]">
            {medicineLabel}
          </p>
          <p className="text-[0.72rem] text-[var(--color-text-muted)]">
            {medicineCount > 0 ? "오늘 복약이 기록됐어요" : "아직 기록 없음"}
          </p>
        </div>

        <div className="col-span-2 flex flex-col gap-2 rounded-[1.75rem] border border-white/80 bg-white p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[rgba(148,163,184,0.2)] text-[var(--color-text-sub)]">
              <Activity size={18} strokeWidth={2} aria-hidden />
            </span>
            <span className="text-xs font-bold text-[var(--color-text-muted)]">오늘의 활동</span>
            <Sparkles className="ml-auto h-4 w-4 text-[var(--mint-500)]" aria-hidden />
          </div>
          <p className="font-[family-name:var(--font-display)] text-sm font-medium text-[var(--color-text-sub)]">
            맘마 {mealCount}회 · 약 {medicineCount}회 기록
          </p>
        </div>
      </div>
    </section>
  );
}
