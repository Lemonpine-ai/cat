"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  DiaryCatProfile,
  CatHealthLog,
  WeeklyCareStats,
  CuteCapture,
  DiaryMemo,
} from "../types/diary";
import type { DiaryStats, HealthAlert } from "../types/diaryStats";
import { CatProfileSelector } from "./CatProfileSelector";
import { TodayCatCard } from "./TodayCatCard";
import { WeeklyHighlightCards } from "./WeeklyHighlightCards";
import { CuteActivityCapture } from "./CuteActivityCapture";
import { DiaryMemoInput } from "./DiaryMemoInput";
import { DiaryReportAlertCard } from "./DiaryReportAlertCard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { behaviorEventsToDiaryStats } from "../lib/behaviorEventsToDiaryStats";
import { zoneEventsToDiaryStats } from "../lib/zoneEventsToDiaryStats";
import { careLogToDiaryStats } from "../lib/careLogToDiaryStats";
import { computeAiCoverage } from "../lib/aiCoverage";
import { mergeDiaryStats } from "../lib/mergeDiaryStats";
import { kstToday } from "../lib/kstRange";
import styles from "../styles/Diary.module.css";

type DiaryPageClientProps = {
  cats: DiaryCatProfile[];
  homeId: string;
  userId: string;
  healthMap: Record<string, CatHealthLog>;
  weeklyStats: WeeklyCareStats;
  captures: CuteCapture[];
  memoMap: Record<string, DiaryMemo>;
};

/**
 * 다이어리 클라이언트 루트.
 * Phase 2-4: 여러 데이터 소스 병합 + 경고 카드 + 데이터 소스 배지 추가.
 */
export function DiaryPageClient({
  cats,
  homeId,
  userId,
  healthMap,
  weeklyStats,
  captures,
  memoMap,
}: DiaryPageClientProps) {
  const [selectedCatId, setSelectedCatId] = useState(cats[0]?.id ?? "");
  const selectedCat = cats.find((c) => c.id === selectedCatId) ?? cats[0];

  /* 통합 DiaryStats + 경고 */
  const [stats, setStats] = useState<DiaryStats | null>(null);
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);

  /* Supabase 클라이언트 메모 — 매번 재생성 방지 */
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  /* 오늘 날짜(KST) — useEffect 밖에서 1회 계산하여 deps 에 primitive 로 포함 */
  const date = kstToday();

  /* CatHealthLog 의 pain_level (1~5) → DiaryStats 의 0~3 으로 축약 — primitive 추출
   *   QA R3 REJECT #1 반영: healthMap 전체 객체 deps → primitive painLevel 로 전환.
   *   부모 리렌더로 healthMap 참조만 바뀌어도 upsert 재실행되던 문제 해결.
   */
  const rawPain = healthMap[selectedCatId]?.pain_level ?? null;
  const painLevel: 0 | 1 | 2 | 3 =
    rawPain === null ? 0 : rawPain >= 4 ? 3 : rawPain >= 3 ? 2 : rawPain >= 2 ? 1 : 0;

  /* 선택 고양이 변경 시 재집계 */
  useEffect(() => {
    if (!selectedCatId) return;
    let cancelled = false;

    (async () => {
      /* 세 소스 병렬 fetch — Promise.all */
      const [behavior, zone, care, aiCoverage] = await Promise.all([
        behaviorEventsToDiaryStats(supabase, selectedCatId, date),
        zoneEventsToDiaryStats(supabase, selectedCatId, date),
        careLogToDiaryStats(supabase, selectedCatId, date),
        computeAiCoverage(supabase, selectedCatId, date),
      ]);
      if (cancelled) return;

      const result = mergeDiaryStats({
        behavior,
        zone,
        care,
        aiCoverage,
        painLevel,
        catId: selectedCatId,
        date,
      });
      if (cancelled) return;
      setStats(result.stats);
      setAlerts(result.alerts);

      /* 경고를 health_alerts 테이블에 upsert — fire-and-forget
       * onConflict: (home_id, cat_id, alert_date, title) UNIQUE 제약 기반.
       * 같은 날 같은 경고가 반복 insert 되지 않도록 하루 1건으로 병합.
       * deps 가 primitive 뿐이라 부모 리렌더로는 재실행되지 않음.
       *
       * QA R23 #2 반영: upsert 직전에도 cancelled 체크 —
       *   고양이 전환 중 이전 effect 의 upsert 가 늦게 떨어져
       *   다른 cat 의 alert 가 DB 에 섞여 들어가던 race 차단.
       */
      if (cancelled) return;
      if (result.alerts.length > 0) {
        void supabase.from("health_alerts").upsert(
          result.alerts.map((a) => ({
            home_id: homeId,
            cat_id: a.cat_id,
            alert_date: date,
            severity: a.severity,
            title: a.title,
            message: a.message,
          })),
          { onConflict: "home_id,cat_id,alert_date,title", ignoreDuplicates: false },
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, selectedCatId, homeId, date, painLevel]);

  /* 고양이 없음 가드 */
  if (!selectedCat) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <p style={{ textAlign: "center", color: "var(--color-text-muted)", padding: "3rem 0" }}>
            등록된 고양이가 없어요 🐾<br />
            홈 화면에서 고양이를 먼저 등록해주세요!
          </p>
        </div>
      </div>
    );
  }

  /* 데이터 소스 라벨 (하단 배지) */
  const sourceLabel =
    stats?.source === "ai"
      ? "AI 감지 기반"
      : stats?.source === "hybrid"
        ? "AI + 집사 기록 병합"
        : stats?.source === "care_log"
          ? "집사 기록 기반"
          : "";

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {cats.length > 1 ? (
          <CatProfileSelector
            cats={cats}
            selectedCatId={selectedCatId}
            onSelect={setSelectedCatId}
          />
        ) : null}

        {/* ⓐ 경고 카드 — 상단 배치 (알림 있을 때만) */}
        <DiaryReportAlertCard alerts={alerts} />

        <TodayCatCard
          cat={selectedCat}
          todayHealth={healthMap[selectedCatId] ?? null}
          homeId={homeId}
        />

        <WeeklyHighlightCards stats={weeklyStats} />

        <CuteActivityCapture captures={captures} />

        <DiaryMemoInput
          catId={selectedCatId}
          homeId={homeId}
          userId={userId}
          existingMemo={memoMap[selectedCatId] ?? null}
        />

        {/* ⓑ 데이터 소스 배지 — 하단 작게 */}
        {sourceLabel ? (
          <p style={{ textAlign: "center", fontSize: 11, color: "#999", marginTop: 16 }}>
            · {sourceLabel} (감지 커버리지 {Math.round((stats?.ai_coverage ?? 0) * 100)}%) ·
          </p>
        ) : null}
      </div>
    </div>
  );
}
