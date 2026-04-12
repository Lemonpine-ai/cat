/* ──────────────────────────────────────
   FGS 어그리게이터 — 일일 평균 계산 + 요약 업서트
   매 FGS 분석 후 fgs_daily_summary 테이블을 갱신한다
   ⚠️ 서버 전용 — service_role 키 사용
   ────────────────────────────────────── */

import { getServiceClient } from "./serviceClient";

/**
 * 오늘 날짜의 일일 요약을 업서트 (없으면 생성, 있으면 갱신)
 *
 * @param catId - 고양이 ID
 * @param homeId - 홈 ID
 * @param newScore - 이번에 산출된 FGS 점수
 */
export async function upsertDailySummary(
  catId: string,
  homeId: string,
  newScore: number,
): Promise<void> {
  const supabase = getServiceClient();
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  /*
   * upsert 사용 — UNIQUE(cat_id, date) 제약 조건에 의해
   * 동시 요청이 와도 레이스 컨디션 없이 안전하게 처리
   * 첫 측정이면 INSERT, 이미 있으면 아래 RPC로 갱신
   */
  const { data: existing } = await supabase
    .from("fgs_daily_summary")
    .select("id, avg_score, max_score, frame_count")
    .eq("cat_id", catId)
    .eq("date", today)
    .maybeSingle(); /* single() 대신 maybeSingle() — 없으면 null, 에러 아님 */

  if (existing) {
    /* 기존 요약 갱신 — 새 평균 계산 */
    const count = existing.frame_count + 1;
    const newAvg =
      (existing.avg_score * existing.frame_count + newScore) / count;
    const newMax = Math.max(existing.max_score, newScore);

    await supabase
      .from("fgs_daily_summary")
      .update({
        avg_score: Math.round(newAvg * 100) / 100,
        max_score: newMax,
        frame_count: count,
      })
      .eq("id", existing.id);
  } else {
    /* 오늘 첫 측정 — upsert로 UNIQUE 충돌 시 무시 */
    await supabase.from("fgs_daily_summary").upsert(
      {
        cat_id: catId,
        home_id: homeId,
        date: today,
        avg_score: newScore,
        max_score: newScore,
        frame_count: 1,
        alert_sent: false,
      },
      { onConflict: "cat_id,date", ignoreDuplicates: true },
    );
  }
}

/**
 * FGS 2일 연속 2+ 인지 확인 (알림 트리거 조건)
 *
 * @returns true이면 알림 보내야 함
 */
export async function shouldSendAlert(
  catId: string,
): Promise<boolean> {
  const supabase = getServiceClient();

  /* 최근 2일 요약 조회 */
  const { data } = await supabase
    .from("fgs_daily_summary")
    .select("date, avg_score, alert_sent")
    .eq("cat_id", catId)
    .order("date", { ascending: false })
    .limit(2);

  if (!data || data.length < 2) return false;

  /* 두 날 모두 평균 2 이상이고, 아직 알림 안 보냈으면 */
  const [today, yesterday] = data;
  return (
    today.avg_score >= 2 &&
    yesterday.avg_score >= 2 &&
    !today.alert_sent
  );
}

/**
 * 알림 발송 완료 표시
 */
export async function markAlertSent(catId: string): Promise<void> {
  const supabase = getServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  await supabase
    .from("fgs_daily_summary")
    .update({ alert_sent: true })
    .eq("cat_id", catId)
    .eq("date", today);
}
