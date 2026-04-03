/**
 * ISO 시각을 한국어 상대 시각 문자열로 변환합니다 (예: "10분 전", "1시간 전").
 */
export function formatRelativeTimeKo(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  if (diffMs < 0) return "방금 전";
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}일 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoTimestamp));
}
