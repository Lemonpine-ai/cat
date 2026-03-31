/**
 * Supabase Auth 오류를 사용자에게 보여 줄 한국어 메시지로 변환합니다.
 */
export function mapSupabaseAuthErrorMessage(error: {
  message: string;
  code?: string;
}): string {
  const raw = error.message ?? "";
  const lower = raw.toLowerCase();

  if (
    lower.includes("invalid login credentials") ||
    error.code === "invalid_credentials"
  ) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }

  if (
    lower.includes("user already registered") ||
    lower.includes("already registered")
  ) {
    return "이미 가입된 이메일입니다. 로그인해 주세요.";
  }

  if (lower.includes("email not confirmed")) {
    return "이메일 인증을 완료한 뒤 다시 로그인해 주세요.";
  }

  if (lower.includes("password") && lower.includes("least")) {
    return "비밀번호가 너무 짧습니다. 더 긴 비밀번호를 사용해 주세요.";
  }

  if (lower.includes("invalid email")) {
    return "올바른 이메일 형식이 아닙니다.";
  }

  return raw || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
