/**
 * Supabase 등 API 베이스 URL을 Vercel·HTTPS 페이지에서 Mixed Content 없이 쓰이도록 정규화한다.
 * `http://`로 잘못 설정된 프로덕션 호스트는 `https://`로 승격한다.
 * 로컬 개발용 `localhost` / `127.0.0.1` 은 그대로 둔다.
 */
export function ensureHttpsApiUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.toLowerCase().startsWith("http://")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]"
    ) {
      return trimmed;
    }
    parsed.protocol = "https:";
    return parsed.href;
  } catch {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
}
