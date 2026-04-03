/**
 * 마지막 기록 ISO 시각 → '0분 전', 'n분 전', 'n시간 전', 'n일 전'.
 */
export function formatElapsedTimeLabel(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "기록 없음";
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  if (diffMs < 0) return "0분 전";
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "0분 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}일 전`;
}
