"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { mapSupabaseAuthErrorMessage } from "@/lib/auth/mapSupabaseAuthErrorMessage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./LoginScreen.module.css";

type AuthMode = "login" | "signup";

function isValidEmailFormat(email: string): boolean {
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Supabase가 이미 가입·이메일 확인까지 끝난 주소로 다시 signUp 할 때
 * 보안상 오류 대신 "가짜 user"를 주는데 identities 가 비어 있습니다.
 * 이 경우 실제로는 인증 메일이 재발송되지 않습니다.
 */
function isObfuscatedDuplicateEmailSignup(user: User | null): boolean {
  if (!user) {
    return false;
  }
  return Array.isArray(user.identities) && user.identities.length === 0;
}

/** OAuth 제공자 식별자 */
type OAuthProviderId = "google" | "kakao";

/**
 * 로그인·회원가입 — 따뜻한 힐링 톤 리디자인 (v2)
 * P1(심리전문가): 첫 화면이 앱 전체 인상을 결정. 따뜻함+안심감 필수.
 * C1(카피라이터): 기술 용어 제거, 일기장 톤.
 */
export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [alertKind, setAlertKind] = useState<"error" | "success">("error");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthLoadingProvider, setOauthLoadingProvider] =
    useState<OAuthProviderId | null>(null);

  const supabaseUrlConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  useEffect(() => {
    const oauthError = searchParams.get("error");
    const oauthMessage = searchParams.get("message");
    if (oauthError === "oauth") {
      setAlertKind("error");
      setAlertMessage(
        oauthMessage
          ? decodeURIComponent(oauthMessage)
          : "간편 로그인에 실패했습니다. Supabase에서 제공자 설정과 Redirect URL 을 확인해 주세요.",
      );
    } else if (oauthError === "config") {
      setAlertKind("error");
      setAlertMessage("Supabase 환경 변수가 서버에 설정되지 않았습니다.");
    }
  }, [searchParams]);

  function clearAlert() {
    setAlertMessage(null);
  }

  async function handleOAuthSignIn(provider: OAuthProviderId) {
    clearAlert();
    if (!supabaseUrlConfigured) {
      setAlertKind("error");
      setAlertMessage(
        "Supabase 연결 정보가 없습니다. .env.local 에 URL·Anon 키를 넣어 주세요.",
      );
      return;
    }

    setOauthLoadingProvider(provider);
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectUrl = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
        },
      });
      if (error) {
        setAlertKind("error");
        setAlertMessage(mapSupabaseAuthErrorMessage(error));
      }
    } catch (unknownError) {
      const message =
        unknownError instanceof Error ? unknownError.message : String(unknownError);
      setAlertKind("error");
      setAlertMessage(message || "간편 로그인을 시작하지 못했습니다.");
    } finally {
      setOauthLoadingProvider(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearAlert();

    if (!supabaseUrlConfigured) {
      setAlertKind("error");
      setAlertMessage(
        "Supabase 연결 정보가 없습니다. 프로젝트 루트에 .env.local 파일을 만들고 URL·Anon 키를 넣어 주세요.",
      );
      return;
    }

    const trimmedEmail = email.trim();
    if (!isValidEmailFormat(trimmedEmail)) {
      setAlertKind("error");
      setAlertMessage("올바른 이메일 형식으로 입력해 주세요.");
      return;
    }

    if (!password) {
      setAlertKind("error");
      setAlertMessage("비밀번호를 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) {
          setAlertKind("error");
          setAlertMessage(mapSupabaseAuthErrorMessage(error));
          return;
        }
        router.push("/");
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setAlertKind("error");
        setAlertMessage(mapSupabaseAuthErrorMessage(error));
        return;
      }

      if (data.session) {
        router.push("/");
        router.refresh();
        return;
      }

      if (isObfuscatedDuplicateEmailSignup(data.user)) {
        setAlertKind("error");
        setAlertMessage(
          "이미 가입된 이메일이에요. 위에서 「로그인」을 선택한 뒤 같은 비밀번호로 로그인해 주세요.",
        );
        return;
      }

      setAlertKind("success");
      setAlertMessage(
        "가입 메일을 보냈어요! 메일함을 확인하고 인증을 완료해 주세요.",
      );
    } catch (unknownError) {
      const message =
        unknownError instanceof Error ? unknownError.message : String(unknownError);
      setAlertKind("error");
      if (message.includes("NEXT_PUBLIC_SUPABASE")) {
        setAlertMessage(
          "Supabase 환경 변수를 확인해 주세요. (.env.local 의 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)",
        );
      } else {
        setAlertMessage(message || "알 수 없는 오류가 발생했습니다.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* D3: 귀여운 카와이 고양이 아이콘 */}
        <div className={styles.iconWrap} aria-hidden>
          <WelcomeCatIcon />
        </div>

        {/* C1: 따뜻한 환영 인사 — 헬로키티급 귀여움 */}
        <h1 className={styles.welcome}>
          오늘도 우리 아이 곁에,
          <br />
          <span className={styles.welcomeBrand}>다보냥</span>
        </h1>

        {alertMessage ? (
          <div
            className={`${styles.alertMint}${alertKind === "success" ? ` ${styles.alertMintSuccess}` : ""}`}
            role="alert"
          >
            {alertMessage}
          </div>
        ) : null}

        <div className={styles.modeToggle} role="group" aria-label="로그인 또는 회원가입">
          <button
            type="button"
            className={`${styles.modeButton} ${mode === "login" ? styles.modeButtonActive : ""}`}
            onClick={() => {
              setMode("login");
              clearAlert();
            }}
          >
            로그인
          </button>
          <button
            type="button"
            className={`${styles.modeButton} ${mode === "signup" ? styles.modeButtonActive : ""}`}
            onClick={() => {
              setMode("signup");
              clearAlert();
            }}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-email">
              ✉️ 이메일
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              className={styles.input}
              placeholder="name@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">
              🔒 비밀번호
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className={styles.input}
              placeholder="••••••••"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </div>
          <button type="submit" className={styles.submit} disabled={isSubmitting}>
            {isSubmitting
              ? "처리 중…"
              : mode === "login"
                ? "로그인"
                : "회원가입"}
          </button>
        </form>

        <div className={styles.oauthBlock}>
          <p className={styles.oauthCaption}>✨ 간편 로그인</p>
          <div className={styles.oauthRow}>
            <button
              type="button"
              className={`${styles.oauthBtn} ${styles.oauthBtnGoogle}`}
              disabled={Boolean(oauthLoadingProvider) || isSubmitting}
              onClick={() => {
                void handleOAuthSignIn("google");
              }}
              aria-label="Google 계정으로 로그인"
            >
              <GoogleGMark className={styles.oauthIcon} />
              {oauthLoadingProvider === "google" ? "연결 중…" : "Google"}
            </button>
            <button
              type="button"
              className={`${styles.oauthBtn} ${styles.oauthBtnKakao}`}
              disabled={Boolean(oauthLoadingProvider) || isSubmitting}
              onClick={() => {
                void handleOAuthSignIn("kakao");
              }}
              aria-label="카카오 계정으로 로그인"
            >
              <KakaoSpeechBubbleMark className={styles.oauthIcon} />
              {oauthLoadingProvider === "kakao" ? "연결 중…" : "카카오"}
            </button>
          </div>
        </div>

        {/* C1: 따뜻한 안내 문구 — 기술 용어 제거 */}
        <p className={styles.footerHint}>
          가입하면 바로 사용할 수 있어요 🎀
        </p>

        {!supabaseUrlConfigured ? (
          <p className={styles.envMissing}>
            개발용: .env.local 에 Supabase URL·Anon 키를 설정해야 로그인할 수 있습니다.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function GoogleGMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function KakaoSpeechBubbleMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        fill="#191919"
        d="M12 4C7.58 4 4 7.13 4 11c0 2.38 1.55 4.45 3.89 5.59L7 21l4.09-2.17c.62.1 1.26.17 1.91.17 4.42 0 8-3.13 8-7 0-3.87-3.58-7-8-7z"
      />
    </svg>
  );
}

/**
 * 다보냥 캐릭터 (v6) — 카카오톡 이모티콘 스타일
 * 원칙: 요소 15개 이하, 스트로크 2px 통일, 색상 3개
 * 얼굴만. 단순하고 깔끔하고 귀여운 2D 선화.
 */
function WelcomeCatIcon() {
  /* v9: 코숏 고양이 이모티콘 스타일 — 두꺼운 아웃라인, 넓적 얼굴, 점눈 */
  return (
    <svg width="88" height="82" viewBox="0 0 88 82" fill="none" aria-hidden>
      {/* 얼굴 — 넓적한 코숏 얼굴 */}
      <ellipse cx="44" cy="48" rx="32" ry="26" fill="#fff" stroke="#333" strokeWidth="2.5" />

      {/* 왼쪽 귀 — 꼿꼿한 삼각 */}
      <path d="M18 30 L14 6 L34 24" fill="#fff" stroke="#333" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M19 26 L17 11 L30 23" fill="#ffc0cb" opacity="0.4" />

      {/* 오른쪽 귀 — 꼿꼿한 삼각 */}
      <path d="M70 30 L74 6 L54 24" fill="#fff" stroke="#333" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M69 26 L71 11 L58 23" fill="#ffc0cb" opacity="0.4" />

      {/* 왼쪽 눈 — 작은 점 */}
      <circle cx="31" cy="45" r="2.5" fill="#333" />

      {/* 오른쪽 눈 — 작은 점 */}
      <circle cx="57" cy="45" r="2.5" fill="#333" />

      {/* 코 — 작은 역삼각 */}
      <path d="M42 53 L44 55.5 L46 53Z" fill="#ffab91" stroke="#333" strokeWidth="1.2" strokeLinejoin="round" />

      {/* 입 — 작은 ω */}
      <path d="M40 57 Q42 59.5, 44 57 Q46 59.5, 48 57" stroke="#333" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      {/* 볼터치 */}
      <circle cx="22" cy="52" r="4.5" fill="#ffc0cb" opacity="0.35" />
      <circle cx="66" cy="52" r="4.5" fill="#ffc0cb" opacity="0.35" />

      {/* 수염 — 3쌍 */}
      <line x1="4" y1="44" x2="20" y2="47" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3" y1="50" x2="20" y2="51" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="56" x2="20" y2="55" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="68" y1="47" x2="84" y2="44" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="68" y1="51" x2="85" y2="50" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="68" y1="55" x2="83" y2="56" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
