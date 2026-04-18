import Link from "next/link";
import { redirect } from "next/navigation";
import { WebRtcLogsDashboard } from "@/components/settings/WebRtcLogsDashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 설정 > WebRTC 로그 — 카메라 연결 이력 조회 페이지.
 * RLS 가 own_home SELECT 만 허용하므로, 서버에서는 로그인 여부만 검증한다.
 */
export default async function WebRtcLogsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  /* home_id 없으면 설정 페이지로 — 로그 테이블은 home 단위라 home 없으면 조회 의미 없음 */
  const { data: profile } = await supabase
    .from("profiles")
    .select("home_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.home_id) {
    redirect("/settings");
  }

  return (
    <div
      style={{
        padding: "2rem 1rem",
        maxWidth: "56rem",
        margin: "0 auto",
        color: "#0c2825",
      }}
    >
      {/* 상단 네비 — 설정으로 돌아가는 링크 */}
      <Link
        href="/settings"
        style={{
          fontSize: "0.85rem",
          color: "#5c7d79",
          textDecoration: "none",
        }}
      >
        ← 설정으로
      </Link>

      <h1 style={{ fontSize: "1.1rem", fontWeight: 800, margin: "0.5rem 0" }}>
        WEBRTC 연결 로그
      </h1>
      <p
        style={{
          color: "#5c7d79",
          fontSize: "0.9rem",
          marginBottom: "1.25rem",
        }}
      >
        카메라 연결·끊김·재연결 이벤트를 최근 50건 보여줘요. 항목을 누르면
        자세한 정보(메타데이터)를 볼 수 있어요.
      </p>

      <WebRtcLogsDashboard />
    </div>
  );
}
