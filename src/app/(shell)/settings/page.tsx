import Link from "next/link";

export default function SettingsPage() {
  return (
    <div
      style={{
        padding: "2rem 1rem",
        maxWidth: "56rem",
        margin: "0 auto",
        color: "#0c2825",
      }}
    >
      <h1 style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: "0.5rem" }}>
        SETTINGS
      </h1>
      <p style={{ color: "#5c7d79", fontSize: "0.9rem", marginBottom: "1rem" }}>
        설정 화면은 준비 중입니다.
      </p>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/login" style={{ color: "#0d9488", fontWeight: 600 }}>
          로그인 · 회원가입
        </Link>
      </p>
      <Link href="/" style={{ color: "#0d9488", fontWeight: 600 }}>
        ← HOME
      </Link>
    </div>
  );
}
