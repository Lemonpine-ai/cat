"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DiaryCatProfile,
  CatHealthLog,
  WeeklyCareStats,
  CuteCapture,
  DiaryMemo,
  DailyChartPoint,
} from "@/types/diary";
import type { DiaryStats, HealthAlert } from "../types/diaryStats";
import { CatProfileSelector } from "./CatProfileSelector";
import { CatDiaryStory } from "./CatDiaryStory";
import { HealthTrendChart } from "./HealthTrendChart";
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
import { generateCatDiary } from "../lib/generateCatDiary";
import { kstToday } from "../lib/kstRange";
import { useRealtimeWithFallback } from "../lib/useRealtimeWithFallback";
import { useRealtimeModeAlert } from "../lib/useRealtimeModeAlert";
import styles from "../styles/Diary.module.css";

type DiaryPageClientProps = {
  cats: DiaryCatProfile[];
  homeId: string;
  userId: string;
  healthMap: Record<string, CatHealthLog>;
  weeklyStats: WeeklyCareStats;
  captures: CuteCapture[];
  memoMap: Record<string, DiaryMemo>;
  /** 7일 일별 차트 데이터 (고양이별) */
  chartMap: Record<string, DailyChartPoint[]>;
  /** 30일 평균 (차트 하단 비교용) */
  monthlyAvg: { meal: number; water: number; poop: number; activity: number };
  /** 7일 주간 평균 (고양이별). activity 는 초 단위, 내부에서 분 환산 */
  weeklyAvgMap: Record<string, { meal: number; water: number; poop: number; activity: number }>;
};

/* ─── 실시간 재집계 디바운스 (300ms) ─── */
const REAGGREGATE_DEBOUNCE_MS = 300;

/* ─── weeklyAvg 폴백 (구독 대상 고양이의 7일 평균이 없을 때) ─── */
const DEFAULT_WEEKLY_AVG = { meal: 0, water: 0, poop: 0, activity: 0 };

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
  memoMap: serverMemoMap,
  chartMap,
  monthlyAvg,
  weeklyAvgMap,
}: DiaryPageClientProps) {
  const [selectedCatId, setSelectedCatId] = useState(cats[0]?.id ?? "");
  const selectedCat = cats.find((c) => c.id === selectedCatId) ?? cats[0];

  /* 통합 DiaryStats + 경고 */
  const [stats, setStats] = useState<DiaryStats | null>(null);
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);

  /* 고양이 전환 감지용 previous state — 동일값 setState 는 React bail-out 으로 안전. */
  const [prevCatId, setPrevCatId] = useState(selectedCatId);
  if (prevCatId !== selectedCatId) {
    setPrevCatId(selectedCatId);
    setStats(null);
    setAlerts([]);
  }

  /* 로컬 메모 맵 — 저장 즉시 일기 카드 댓글에 반영 */
  const [localMemoMap, setLocalMemoMap] = useState<Record<string, DiaryMemo>>(serverMemoMap);

  /* 메모 저장 콜백 — 저장된 메모를 localMemoMap 에 주입하여 화면에 즉시 반영 */
  const handleMemoSaved = useCallback((memo: DiaryMemo) => {
    setLocalMemoMap((prev) => ({ ...prev, [memo.cat_id]: memo }));
  }, []);

  /* Supabase 클라이언트 메모 — 매번 재생성 방지 */
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  /* pain_level (1~5) → 0~3 축약. primitive 추출로 healthMap 객체 참조 변동에 비의존 (R3#1) */
  const rawPain = healthMap[selectedCatId]?.pain_level ?? null;
  const painLevel: 0 | 1 | 2 | 3 =
    rawPain === null ? 0 : rawPain >= 4 ? 3 : rawPain >= 3 ? 2 : rawPain >= 2 ? 1 : 0;

  /* 재집계 작업 취소용 플래그 — 실시간 구독 재호출 시 stale Promise 반영 차단 */
  const aggregateCancelRef = useRef<{ cancelled: boolean } | null>(null);
  /* 실시간 구독 디바운스 타이머 — cleanup 에서 clear 하여 누수 방지 */
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 재집계 함수 — 선택 고양이의 stats/alerts 를 다시 계산하여 state 갱신.
   * 선택 고양이 변경 & realtime INSERT/UPDATE 시 동일하게 호출된다.
   */
  const runAggregate = useCallback(async () => {
    if (!selectedCatId) return;

    /* 호출 시점의 KST 날짜 — stale closure 방지. 자정 경계를 넘어도 realtime
     * 이벤트만으로는 부모 리렌더가 없으므로 이 지역변수로 매번 재계산. */
    const date = kstToday();

    /* 이전 호출 취소 — 중첩 실행 시 늦게 끝난 결과가 최신을 덮어쓰는 것 방지 */
    if (aggregateCancelRef.current) {
      aggregateCancelRef.current.cancelled = true;
    }
    const token = { cancelled: false };
    aggregateCancelRef.current = token;

    /* 네 소스 병렬 fetch — allSettled 로 부분 실패 허용, 모두 실패면 경고만 노출 (R4#1) */
    const [behaviorRes, zoneRes, careRes, coverageRes] = await Promise.allSettled([
      behaviorEventsToDiaryStats(supabase, selectedCatId, date),
      zoneEventsToDiaryStats(supabase, selectedCatId, date),
      careLogToDiaryStats(supabase, selectedCatId, date),
      computeAiCoverage(supabase, selectedCatId, date),
    ]);
    if (token.cancelled) return;

    /* 각 결과 중립값 폴백 */
    const behaviorFailed = behaviorRes.status === "rejected";
    const behavior =
      behaviorRes.status === "fulfilled"
        ? behaviorRes.value
        : { meal_count: 0, groom_count: 0, activity_seconds: 0, rest_seconds: 0 };
    const zone = zoneRes.status === "fulfilled" ? zoneRes.value : { poop_count: 0 };
    const care = careRes.status === "fulfilled" ? careRes.value : {};
    const aiCoverage = coverageRes.status === "fulfilled" ? coverageRes.value : 0;

    const anyFailed =
      behaviorFailed ||
      zoneRes.status === "rejected" ||
      careRes.status === "rejected" ||
      coverageRes.status === "rejected";
    const allFailed =
      behaviorFailed &&
      zoneRes.status === "rejected" &&
      careRes.status === "rejected" &&
      coverageRes.status === "rejected";

    /* 집계 실패 경고 카드 (부분/전체 실패 시 prepend) */
    const aggregateErrorAlert: HealthAlert = {
      cat_id: selectedCatId,
      severity: "warning",
      title: "실시간 집계 일시 중단",
      message:
        "네트워크 또는 서버 응답 지연으로 오늘 수치를 불러오지 못했어요. 잠시 후 다시 시도할게요.",
      created_at: new Date().toISOString(),
      read_at: null,
      alert_date: date,
    };

    /* 모두 실패 — 이전 stats 유지, alerts 만 prepend */
    if (allFailed) {
      if (token.cancelled) return;
      setAlerts((prev) => [aggregateErrorAlert, ...prev]);
      return;
    }

    /* behavior 실패 시 aiCoverage=0 으로 강제 → mergeDiaryStats 가 care_log 로 폴백 */
    const effectiveAiCoverage = behaviorFailed ? 0 : aiCoverage;

    const result = mergeDiaryStats({
      behavior,
      zone,
      care,
      aiCoverage: effectiveAiCoverage,
      painLevel,
      catId: selectedCatId,
      date,
    });
    if (token.cancelled) return;
    setStats(result.stats);
    /* 동기화 실패 안내는 사용자가 보기 전 증발하지 않도록 보존 (같은 고양이 한정) */
    setAlerts((prev) => {
      const SYNC_FAILED_TITLE = "알림 센터 동기화 실패";
      const preserved = prev.filter(
        (a) => a.title === SYNC_FAILED_TITLE && a.cat_id === selectedCatId,
      );
      const next = anyFailed
        ? [aggregateErrorAlert, ...result.alerts]
        : result.alerts;
      return [...preserved, ...next];
    });

    /* health_alerts upsert — onConflict: (home_id,cat_id,alert_date,title) UNIQUE. (R4#2)
     * 직전/.then 내부 cancelled 체크로 race 차단 (R23#2). error 시 info 카드 prepend. */
    if (token.cancelled) return;
    if (result.alerts.length > 0) {
      void supabase
        .from("health_alerts")
        .upsert(
          result.alerts.map((a) => ({
            home_id: homeId,
            cat_id: a.cat_id,
            alert_date: date,
            severity: a.severity,
            title: a.title,
            message: a.message,
          })),
          { onConflict: "home_id,cat_id,alert_date,title", ignoreDuplicates: false },
        )
        .then(({ error }) => {
          if (token.cancelled) return;
          if (!error) return;
          if (process.env.NODE_ENV !== "production") {
            console.warn("[diary] health_alerts upsert failed:", error.message);
          }
          const alertSyncFailedAlert: HealthAlert = {
            cat_id: selectedCatId,
            severity: "info",
            title: "알림 센터 동기화 실패",
            message:
              "오늘 저장된 알림이 알림 센터 동기화에 실패했어요. 다음 접속 시 재시도됩니다",
            created_at: new Date().toISOString(),
            read_at: null,
            alert_date: date,
          };
          setAlerts((prev) => [alertSyncFailedAlert, ...prev]);
        });
    }
    /* kstToday 는 외부 import 한 순수 함수 → deps 제외 정당 (exhaustive-deps 무시) */
  }, [supabase, selectedCatId, homeId, painLevel]);

  useEffect(() => {
    // selectedCatId 없으면 집계 스킵 (고양이 미선택 상태)
    if (!selectedCatId) return;

    /* 일기 집계 트리거 — runAggregate 는 async 이며 setState 는 모두 await 이후
     * microtask 에서 실행되므로 set-state-in-effect 는 false positive.
     * ref/startTransition 대안은 stale closure/UX 지연 이슈로 Option A 채택. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runAggregate();

    // cleanup: 언마운트 또는 deps 변경 시 진행 중인 집계 취소
    return () => {
      if (aggregateCancelRef.current) {
        aggregateCancelRef.current.cancelled = true;
      }
    };
  }, [runAggregate, selectedCatId]);

  /* 실시간 트리거 디바운스 — 다건 이벤트가 몰려도 300ms 내 1회만 재집계 */
  const scheduleReaggregate = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (process.env.NODE_ENV !== "production") {
        console.log(`[diary] realtime → reaggregate cat=${selectedCatId}`);
      }
      void runAggregate();
    }, REAGGREGATE_DEBOUNCE_MS);
  }, [runAggregate, selectedCatId]);

  /* 언마운트 시 디바운스 타이머 정리 (stale setState 방지) */
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  /* postgres_changes 필터 — 참조 안정화로 훅 재구독 최소화 */
  const realtimeFilter = useMemo(
    () => ({
      event: "*" as const,
      schema: "public",
      table: "cat_behavior_events",
      filter: `cat_id=eq.${selectedCatId}`,
    }),
    [selectedCatId],
  );

  /* QA R4 #3: 단순 subscribe 는 네트워크 끊김 시 정지 → 재연결+폴링 훅으로 대체 */
  const { mode: realtimeMode } = useRealtimeWithFallback(
    supabase,
    `diary_behavior_${selectedCatId}`,
    realtimeFilter,
    scheduleReaggregate,
  );

  /* 폴링 모드 진입 시 info 카드 prepend (realtime 복구 시 다음 runAggregate 가 덮어써 사라짐) */
  useRealtimeModeAlert(realtimeMode, selectedCatId, setAlerts);

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

  /* 고양이 시점 일기 자동 생성 — stats 가 로드된 후에만.
   * 렌더 시점의 KST 날짜 — runAggregate 와 동일한 kstToday() 호출로 자정 경계에도 일관. */
  const diary = stats
    ? generateCatDiary(selectedCat.name, stats, kstToday())
    : null;

  /* 선택된 고양이의 최근 포착 이미지 1장 — 일기 카드에 표시 */
  const latestCapture = captures.find(
    (c) => c.cat_name === selectedCat.name && c.storage_path,
  );

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

        {/* ⓑ 고양이 시점 일기 (8가지 성격 기반) — stats 로드 후 렌더 */}
        {diary ? (
          <CatDiaryStory
            catName={selectedCat.name}
            title={diary.title}
            date={diary.date}
            body={diary.body}
            captureUrl={latestCapture?.storage_path ?? null}
            butlerMemo={localMemoMap[selectedCatId]?.content ?? null}
            painLevel={healthMap[selectedCatId]?.pain_level ?? null}
          />
        ) : null}

        <TodayCatCard
          cat={selectedCat}
          todayHealth={healthMap[selectedCatId] ?? null}
          homeId={homeId}
        />

        {/* ⓒ 7일 꺾은선 차트 + 30일 평균 비교 */}
        <HealthTrendChart
          data={chartMap[selectedCatId] ?? []}
          monthlyAvg={monthlyAvg}
        />

        <WeeklyHighlightCards
          stats={weeklyStats}
          today={stats}
          weeklyAvg={weeklyAvgMap[selectedCatId] ?? DEFAULT_WEEKLY_AVG}
        />

        <CuteActivityCapture captures={captures} />

        <DiaryMemoInput
          catId={selectedCatId}
          homeId={homeId}
          userId={userId}
          existingMemo={localMemoMap[selectedCatId] ?? null}
          onSaved={handleMemoSaved}
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
