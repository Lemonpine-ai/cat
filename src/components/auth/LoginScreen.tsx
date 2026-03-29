"use client";

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
 * 로그인·회원가입 — Supabase Auth + (DB 트리거로 profiles 자동 생성).
 */
type OAuthProviderId = "google" | "kakao";

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

      setAlertKind("success");
      setAlertMessage(
        "가입 메일을 보냈습니다. 메일함을 확인한 뒤 인증을 완료하고 로그인해 주세요.",
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
        <div className={styles.iconWrap} aria-hidden>
          <WelcomeCatIcon />
        </div>
        <h1 className={styles.welcome}>
          다보냥 CATvisor에
          <br />
          오신 걸 환영합니다!
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
              Email
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
              Password
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
          <p className={styles.oauthCaption}>또는 간편하게 로그인하기</p>
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

        <p className={styles.footerHint}>
          가입 시 서버의 profiles 테이블에 자동으로 프로필이 만들어집니다.
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

function WelcomeCatIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden>
      <circle cx="36" cy="38" r="22" fill="url(#catGrad)" />
      <path
        d="M18 28 L14 14 L26 22 Z"
        fill="#0d9488"
        stroke="#0f766e"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M54 28 L58 14 L46 22 Z"
        fill="#0d9488"
        stroke="#0f766e"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <ellipse cx="29" cy="36" rx="3.2" ry="4" fill="#0f172a" />
      <ellipse cx="43" cy="36" rx="3.2" ry="4" fill="#0f172a" />
      <ellipse cx="29.5" cy="35.2" rx="1.1" ry="1.3" fill="#fff" />
      <ellipse cx="43.5" cy="35.2" rx="1.1" ry="1.3" fill="#fff" />
      <path
        d="M32 44 Q36 47 40 44"
        stroke="#0f766e"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse cx="36" cy="48" rx="3" ry="2.2" fill="#fda4af" opacity="0.65" />
      <defs>
        <linearGradient id="catGrad" x1="20" y1="18" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ccfbf1" />
          <stop offset="1" stopColor="#5eead4" />
        </linearGradient>
      </defs>
    </svg>
  );
}
