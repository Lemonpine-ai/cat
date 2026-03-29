import { CatvisorHomeDashboard } from "@/components/catvisor/CatvisorHomeDashboard";
import { HomeCatCards } from "@/components/catvisor/HomeCatCards";
import {
  mapActivityLogRows,
  type CatLogJoinRow,
} from "@/lib/catLog/mapActivityLogRows";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CatProfileRow } from "@/types/cat";
import type { CatDailySummaryItem } from "@/types/catDailySummary";
import type { ActivityLogListItem } from "@/types/catLog";

/** 오늘 00:00:00 UTC 기준 ISO 문자열 */
function buildTodayStartUtcIso(): string {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString();
}

type DailySummaryRow = {
  cat_id: string;
  status: string | null;
  cats: { name: string } | { name: string }[] | null;
};

function aggregateDailySummary(rows: DailySummaryRow[]): CatDailySummaryItem[] {
  const map = new Map<string, CatDailySummaryItem>();

  for (const row of rows) {
    if (row.status !== "식사" && row.status !== "배변") {
      continue;
    }
    const catName =
      row.cats == null
        ? row.cat_id
        : Array.isArray(row.cats)
          ? (row.cats[0]?.name ?? row.cat_id)
          : row.cats.name;

    const existing = map.get(row.cat_id) ?? {
      catId: row.cat_id,
      catName,
      mealCount: 0,
      toiletCount: 0,
    };
    map.set(row.cat_id, {
      ...existing,
      mealCount: row.status === "식사" ? existing.mealCount + 1 : existing.mealCount,
      toiletCount: row.status === "배변" ? existing.toiletCount + 1 : existing.toiletCount,
    });
  }

  return Array.from(map.values()).sort((a, b) => a.catName.localeCompare(b.catName));
}

/**
 * CATvisor 민트 홈 — Supabase cats + cat_logs + 카메라 관리.
 */
export default async function HomePage() {
  let cats: CatProfileRow[] = [];
  let catsFetchError: string | null = null;
  let activityLogs: ActivityLogListItem[] = [];
  let activityLogsFetchError: string | null = null;
  let dailySummary: CatDailySummaryItem[] = [];
  let homeId: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("home_id")
        .eq("id", user.id)
        .single();
      homeId = profile?.home_id ?? null;
    }

    const { data: catRows, error: catsError } = await supabase
      .from("cats")
      .select("id, home_id, name, sex, breed, photo_front_url, status")
      .order("name", { ascending: true });

    if (catsError) {
      catsFetchError = catsError.message;
    } else {
      cats = (catRows ?? []) as CatProfileRow[];
    }

    const { data: logRows, error: logsError } = await supabase
      .from("cat_logs")
      .select(
        `
        id,
        captured_at,
        cat_id,
        storage_path,
        cats ( name, status )
      `,
      )
      .order("captured_at", { ascending: false })
      .limit(50);

    if (logsError) {
      activityLogsFetchError = logsError.message;
    } else {
      activityLogs = mapActivityLogRows(logRows as CatLogJoinRow[] | null);
    }

    // 오늘의 식사·배변 집계
    const { data: summaryRows } = await supabase
      .from("cat_logs")
      .select("cat_id, status, cats ( name )")
      .gte("captured_at", buildTodayStartUtcIso())
      .in("status", ["식사", "배변"]);

    if (summaryRows) {
      dailySummary = aggregateDailySummary(summaryRows as DailySummaryRow[]);
    }
  } catch (unknownError) {
    const message =
      unknownError instanceof Error ? unknownError.message : "알 수 없는 오류";
    if (!catsFetchError) {
      catsFetchError = message;
    }
    if (!activityLogsFetchError) {
      activityLogsFetchError = message;
    }
  }

  const catsLookupForActivity = cats.map((cat) => ({
    id: cat.id,
    name: cat.name,
    status: cat.status ?? null,
  }));

  return (
    <CatvisorHomeDashboard
      homeId={homeId ?? ""}
      initialActivityLogs={activityLogs}
      activityLogsFetchError={activityLogsFetchError}
      catsLookupForActivity={catsLookupForActivity}
      initialDailySummary={dailySummary}
    >
      <HomeCatCards cats={cats} fetchErrorMessage={catsFetchError} />
    </CatvisorHomeDashboard>
  );
}
