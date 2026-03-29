import Link from "next/link";

export default function ReportsPage() {
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
        REPORTS
      </h1>
      <p style={{ color: "#5c7d79", fontSize: "0.9rem", marginBottom: "1rem" }}>
        주간 리포트 화면은 준비 중입니다.
      </p>
      <Link href="/" style={{ color: "#0d9488", fontWeight: 600 }}>
        ← HOME
      </Link>
    </div>
  );
}
