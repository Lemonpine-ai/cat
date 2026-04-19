import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DiaryPageClient } from "./DiaryPageClient";
import { kstToday } from "@/features/diary/lib/kstRange";
import {
  fetchWeeklyBehaviorAvgMap,
  type WeeklyAvgEntry,
} from "@/features/diary/lib/weeklyBehaviorAvg";
import { dedupeCatsByName } from "@/lib/cat/dedupeCatsByName";
import type {
  DiaryCatProfile,
  CatHealthLog,
  CuteCapture,
  DiaryMemo,
  DailyChartPoint,
  WeeklyCareStats,
} from "@/types/diary";

/**
 * 다이어리(건강 리포트) 페이지 — 서버 컴포넌트
 * Supabase에서 고양이 목록, 건강 기록, 돌봄 통계, AI 포착, 메모를 fetch 후
 * DiaryPageClient에 props로 전달한다.
 */
export default async function ReportsPage() {
  /* ── 기본값 초기화 ── */
  let cats: DiaryCatProfile[] = [];
  let homeId = "";
  let userId = "";
  const healthMap: Record<string, CatHealthLog> = {};
  let captures: CuteCapture[] = [];
  const memoMap: Record<string, DiaryMemo> = {};
  const chartMap: Record<string, DailyChartPoint[]> = {};
  /** 고양이별 오늘 돌봄 횟수 (일기 생성용) */
  type CareCount = { meal: number; water: number; litter: number; medicine: number; total: number };
  const todayCareMap: Record<string, CareCount> = {};
  /** 30일 평균 */
  const monthlyAvg = { meal: 0, water: 0, poop: 0, activity: 0 };
  /** 이번 주(최근 7일) 돌봄 집계 — WeeklyHighlightCards 폴백용 (유지) */
  const weeklyStats: WeeklyCareStats = {
    totalMeals: 0,
    totalWater: 0,
    totalLitter: 0,
    totalMedicine: 0,
  };
  /** 고양이별 7일 주간 평균 (cat_behavior_events 기반) — WeeklyHighlightCards 용 */
  let weeklyAvgMap: Record<string, WeeklyAvgEntry> = {};

  try {
    const supabase = await createSupabaseServerClient();

    /* ── 1. 현재 사용자 + home_id 조회 ── */
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return <FallbackMessage text="로그인이 필요해요 🐾" />;

    userId = user.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("home_id")
      .eq("id", user.id)
      .single();

    homeId = profile?.home_id ?? "";

    if (!homeId) return <FallbackMessage text="홈을 먼저 설정해주세요 🏠" />;

    /* ── 2. 고양이 목록 조회 ── */
    const { data: catRows } = await supabase
      .from("cats")
      .select("id, name, photo_front_url, status")
      .eq("home_id", homeId)
      .order("name", { ascending: true });

    /* 이름 기준 중복 제거 — dedupeCatsByName 유틸로 단일화.
     * (홈 페이지와 동일 규칙. DB 에 home_id+name 중복 row 존재 시 UI 두 번 렌더 방지.) */
    cats = dedupeCatsByName((catRows ?? []) as DiaryCatProfile[]);

    if (cats.length === 0) return <FallbackMessage text="등록된 고양이가 없어요 🐱" />;

    /* ── 3. 최근 30일 건강 기록 조회 (차트 7일 + 평균 30일) ──
     * 날짜 기준은 KST 로 통일.
     * - cat_diary.date, cat_health_logs.record_date 는 KST 기준으로 저장됨
     * - UTC 자정~KST 09시 구간에서 UTC today ≠ KST today → 오늘 기록이 어제로 빠지는 버그 차단
     */
    const today = kstToday();
    /* care_log 는 TIMESTAMPTZ(UTC) 라 UTC 오늘 비교가 정확 — KST 와 분리 유지 */
    const utcToday = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthAgoDate = monthAgo.toISOString().slice(0, 10);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: healthRows } = await supabase
      .from("cat_health_logs")
      .select("*")
      .eq("home_id", homeId)
      .gte("record_date", monthAgoDate)
      .order("record_date", { ascending: true });

    /* 오늘 건강 기록 맵 */
    if (healthRows) {
      for (const row of healthRows as CatHealthLog[]) {
        if (row.record_date === today) {
          healthMap[row.cat_id] = row;
        }
      }
    }

    /* 30일 평균 계산 (건강 기록 기반) */
    if (healthRows && healthRows.length > 0) {
      let totalMeal = 0, totalPoop = 0, count = 0;
      for (const row of healthRows as CatHealthLog[]) {
        totalMeal += row.meal_count;
        totalPoop += row.poop_count;
        count++;
      }
      if (count > 0) {
        monthlyAvg.meal = Math.round((totalMeal / count) * 10) / 10;
        monthlyAvg.poop = Math.round((totalPoop / count) * 10) / 10;
      }
    }

    /* ── 4. 최근 30일 돌봄 로그 (차트 + 평균 + 일기) ── */
    const monthAgoIso = monthAgo.toISOString();

    const { data: careRows } = await supabase
      .from("cat_care_logs")
      .select("care_kind, cat_id, created_at")
      .eq("home_id", homeId)
      .gte("created_at", monthAgoIso);

    /* 30일 평균 (돌봄 로그 기반) + 오늘 돌봄 횟수 맵 + 7일 weeklyStats */
    const weekAgoIso = weekAgo.toISOString();
    if (careRows) {
      let totalWater = 0, totalActivity = 0;
      for (const row of careRows as { care_kind: string; cat_id: string; created_at: string }[]) {
        if (row.care_kind === "water_change") totalWater++;
        totalActivity++;

        /* 최근 7일 구간 → weeklyStats 증가 (WeeklyHighlightCards 용) */
        if (row.created_at >= weekAgoIso) {
          if (row.care_kind === "meal") weeklyStats.totalMeals += 1;
          else if (row.care_kind === "water_change") weeklyStats.totalWater += 1;
          else if (row.care_kind === "litter_clean") weeklyStats.totalLitter += 1;
          else if (row.care_kind === "medicine") weeklyStats.totalMedicine += 1;
        }

        /* 오늘 데이터만 todayCareMap에 집계 (UTC 타임스탬프 비교) */
        if (row.created_at.slice(0, 10) === utcToday) {
          if (!todayCareMap[row.cat_id]) {
            todayCareMap[row.cat_id] = { meal: 0, water: 0, litter: 0, medicine: 0, total: 0 };
          }
          const c = todayCareMap[row.cat_id];
          if (row.care_kind === "meal") c.meal++;
          if (row.care_kind === "water_change") c.water++;
          if (row.care_kind === "litter_clean") c.litter++;
          if (row.care_kind === "medicine") c.medicine++;
          c.total++;
        }
      }
      const days = 30;
      monthlyAvg.water = Math.round((totalWater / days) * 10) / 10;
      monthlyAvg.activity = Math.round((totalActivity / days) * 10) / 10;
    }

    /* ── 4-2. 고양이별 7일 주간 평균 (cat_behavior_events 기반) ──
     *
     * WeeklyHighlightCards 의 "오늘 vs 주간 평균" 비교에 사용.
     * 로직은 `fetchWeeklyBehaviorAvgMap` 헬퍼로 분리
     * (behaviorEventsToDiaryStats 의 세션 병합 규칙과 동일).
     *   - eating: 5초 이상 + 5분 병합 → meal
     *   - drinking/water_drink: 카운트 → water
     *   - peeing/pooping: 카운트 → poop
     *   - walk_run/roll/grooming: duration 초 합산 → activity
     *   - confidence ≥ 0.6 만 유효
     *   - 기록 없는 날도 0 으로 포함하여 7 로 나눔
     */
    weeklyAvgMap = await fetchWeeklyBehaviorAvgMap(
      supabase,
      homeId,
      weekAgoIso,
      cats.map((c) => c.id),
    );

    /* ── 4-1. 고양이별 7일 차트 데이터 빌드 ── */
    {
      /* 7일치 날짜 목록 생성 */
      const dateLabels: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dateLabels.push(d.toISOString().slice(0, 10));
      }

      /* 고양이별 날짜별 빈 맵 초기화 */
      type DayBucket = { meal: number; water: number; poop: number; activity: number };
      const buckets: Record<string, Record<string, DayBucket>> = {};

      for (const cat of cats) {
        buckets[cat.id] = {};
        for (const dt of dateLabels) {
          buckets[cat.id][dt] = { meal: 0, water: 0, poop: 0, activity: 0 };
        }
      }

      /* cat_health_logs에서 식사/배변 채우기 */
      if (healthRows) {
        for (const row of healthRows as CatHealthLog[]) {
          const b = buckets[row.cat_id]?.[row.record_date];
          if (b) {
            b.meal = row.meal_count;
            b.poop = row.poop_count;
          }
        }
      }

      /* cat_care_logs에서 음수/활동 채우기 */
      if (careRows) {
        for (const row of careRows as { care_kind: string; cat_id: string; created_at: string }[]) {
          const dt = row.created_at.slice(0, 10);
          const b = buckets[row.cat_id]?.[dt];
          if (!b) continue;

          if (row.care_kind === "water_change") b.water += 1;
          b.activity += 1; /* 모든 돌봄 이벤트 = 활동 1회 */
        }
      }

      /* 최종 차트 데이터 배열로 변환 */
      for (const cat of cats) {
        chartMap[cat.id] = dateLabels.map((dt) => {
          const b = buckets[cat.id][dt];
          /* 날짜를 짧은 형식으로 (예: "4/8") */
          const [, m, d] = dt.split("-");
          return {
            date: `${Number(m)}/${Number(d)}`,
            meal: b.meal,
            water: b.water,
            poop: b.poop,
            activity: b.activity,
          };
        });
      }
    }

    /* ── 5. 최근 AI 감지 포착 (cat_logs) — 최근 10건 ── */
    const { data: logRows } = await supabase
      .from("cat_logs")
      .select("id, captured_at, cat_id, storage_path, cats ( name )")
      .eq("home_id", homeId)
      .order("captured_at", { ascending: false })
      .limit(10);

    if (logRows) {
      captures = (logRows as unknown as Array<{
        id: string;
        captured_at: string;
        cat_id: string;
        storage_path: string | null;
        cats: { name: string }[] | { name: string } | null;
      }>).map((row) => {
        const catObj = Array.isArray(row.cats) ? row.cats[0] : row.cats;
        return {
          id: row.id,
          captured_at: row.captured_at,
          cat_name: catObj?.name ?? "알 수 없는 냥이",
          storage_path: row.storage_path,
        };
      });
    }

    /* ── 6. 오늘 집사 메모 조회 (cat_diary) ── */
    const { data: memoRows } = await supabase
      .from("cat_diary")
      .select("id, cat_id, content, date, created_at")
      .eq("home_id", homeId)
      .eq("date", today);

    if (memoRows) {
      for (const row of memoRows as DiaryMemo[]) {
        memoMap[row.cat_id] = row;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return <FallbackMessage text={`데이터 로딩 실패: ${msg}`} />;
  }

  /* ── 클라이언트 컴포넌트에 전달 ── */
  return (
    <DiaryPageClient
      cats={cats}
      homeId={homeId}
      userId={userId}
      healthMap={healthMap}
      weeklyStats={weeklyStats}
      captures={captures}
      memoMap={memoMap}
      chartMap={chartMap}
      monthlyAvg={monthlyAvg}
      weeklyAvgMap={weeklyAvgMap}
    />
  );
}

/** 에러·빈 상태 폴백 메시지 */
function FallbackMessage({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "3rem 1rem",
        textAlign: "center",
        color: "#5c7d79",
        fontSize: "0.95rem",
      }}
    >
      {text}
    </div>
  );
}
