// KST 자정 기준 날짜 범위를 UTC ISO 문자열로 변환
// Supabase 쿼리 파라미터용. 하루는 KST 00:00 ~ 다음날 KST 00:00.
// KST = UTC+9 이므로 KST 00:00 = 전날 UTC 15:00.

// KST 날짜 문자열("YYYY-MM-DD")을 받아 해당일의 UTC 시작/끝을 반환
// 예: "2026-04-18" → startUtc="2026-04-17T15:00:00.000Z", endUtc="2026-04-18T15:00:00.000Z"
export function kstDateRangeToUtc(date: string): { startUtc: string; endUtc: string } {
  // 입력 형식 검증 — 잘못된 값이면 오늘 KST로 폴백
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    const now = new Date();
    // 현재 시각에서 KST 오프셋 적용한 날짜 추출
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const y = kstNow.getUTCFullYear();
    const m = String(kstNow.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kstNow.getUTCDate()).padStart(2, '0');
    return kstDateRangeToUtc(`${y}-${m}-${d}`);
  }

  const [, y, m, d] = match;
  // KST 00:00 = UTC 전날 15:00. Date.UTC(y, m-1, d, -9) 로 계산
  const startDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), -9, 0, 0, 0));
  // 다음날 KST 00:00
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

  return {
    startUtc: startDate.toISOString(),
    endUtc: endDate.toISOString(),
  };
}

// 오늘 날짜(KST)를 "YYYY-MM-DD" 형식으로 반환
// 일기장 기본값 계산용 헬퍼
export function kstToday(): string {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kstNow.getUTCFullYear();
  const m = String(kstNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kstNow.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
