import { CatvisorHomeDashboard } from "@/components/catvisor/CatvisorHomeDashboard";
import { HomeCatCards } from "@/components/catvisor/HomeCatCards";
import { HomeProfileRow } from "@/components/home/HomeProfileRow";
import {
  mapActivityLogRows,
  type CatLogJoinRow,
} from "@/lib/catLog/mapActivityLogRows";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dedupeCatsByName } from "@/lib/cat/dedupeCatsByName";
import type { CatProfileRow } from "@/types/cat";
import type { ActivityLogListItem } from "@/types/catLog";

/**
 * CATvisor 민트 홈 — Supabase cats + cat_logs + 카메라 관리.
 */
export default async function HomePage() {
  let cats: CatProfileRow[] = [];
  let catsFetchError: string | null = null;
  let activityLogs: ActivityLogListItem[] = [];
  let activityLogsFetchError: string | null = null;
  let homeId: string | null = null;
  let todayMedicineCount = 0;
  let todayMealCount = 0;
  let lastWaterChangeAt: string | null = null;
  let lastLitterCleanAt: string | null = null;
  let lastMedicineAt: string | null = null;

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
      /* 이름 기준 중복 제거 — dedupeCatsByName 유틸로 단일화.
       * (reports 페이지와 동일 규칙. 보리/찹쌀 각 1장씩만 카드 렌더.)
       * 근본 원인 가드: DB 에 home_id+name 중복 row 존재 시 UI 두 번 렌더 방지. */
      cats = dedupeCatsByName((catRows ?? []) as CatProfileRow[]);
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

    // 오늘 홈 전체 수동 케어 카운트 (meal + medicine)
    if (homeId) {
      const todayStart = (() => {
      const now = new Date();
      now.setUTCHours(0, 0, 0, 0);
      return now.toISOString();
    })();

      const { count: medicineRows } = await supabase
        .from("cat_care_logs")
        .select("id", { count: "exact", head: true })
        .eq("home_id", homeId)
        .eq("care_kind", "medicine")
        .gte("created_at", todayStart);

      todayMedicineCount = medicineRows ?? 0;

      const { count: mealRows } = await supabase
        .from("cat_care_logs")
        .select("id", { count: "exact", head: true })
        .eq("home_id", homeId)
        .eq("care_kind", "meal")
        .gte("created_at", todayStart);

      todayMealCount = mealRows ?? 0;

      // 마지막 식수 교체 / 화장실 청소 시각 조회
      const { data: lastWaterRow } = await supabase
        .from("cat_care_logs")
        .select("created_at")
        .eq("home_id", homeId)
        .eq("care_kind", "water_change")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastWaterChangeAt = lastWaterRow?.created_at ?? null;

      const { data: lastLitterRow } = await supabase
        .from("cat_care_logs")
        .select("created_at")
        .eq("home_id", homeId)
        .eq("care_kind", "litter_clean")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastLitterCleanAt = lastLitterRow?.created_at ?? null;

      // 마지막 약 복용 시각 조회
      const { data: lastMedicineRow } = await supabase
        .from("cat_care_logs")
        .select("created_at")
        .eq("home_id", homeId)
        .eq("care_kind", "medicine")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastMedicineAt = lastMedicineRow?.created_at ?? null;
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
      initialTodayMedicineCount={todayMedicineCount}
      initialTodayMealCount={todayMealCount}
      initialLastWaterChangeAt={lastWaterChangeAt}
      initialLastLitterCleanAt={lastLitterCleanAt}
      initialLastMedicineAt={lastMedicineAt}
      catName={cats.length === 1 ? cats[0].name : null}
    >
      <HomeProfileRow cats={cats} fetchErrorMessage={catsFetchError} />
      {cats.length > 0 ? (
        <details className="group mt-1 rounded-[1.5rem] border border-dashed border-[rgba(30,143,131,0.28)] bg-white/50 px-3 py-2 text-[var(--color-text-sub)] open:bg-white/90">
          <summary className="cursor-pointer list-none text-center text-xs font-semibold text-[var(--mint-700)] marker:content-none [&::-webkit-details-marker]:hidden">
            고양이별 상태 기록 펼치기
          </summary>
          <div className="mt-3 pb-1">
            <HomeCatCards
              cats={cats}
              fetchErrorMessage={null}
              hideSectionTitle
            />
          </div>
        </details>
      ) : null}
    </CatvisorHomeDashboard>
  );
}
