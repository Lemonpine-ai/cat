import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CameraBroadcastClient } from "./CameraBroadcastClient";

/**
 * 남는 폰에서 접속하는 방송 페이지.
 * 서버에서 userId + homeId 를 확인한 뒤 클라이언트 컴포넌트에 전달합니다.
 */
export default async function CameraBroadcastPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_id, display_name")
    .eq("id", user.id)
    .single();

  if (!profile?.home_id) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          background: "#0f172a",
          color: "#f8fafc",
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: "3rem" }}>🏠</span>
        <p style={{ fontSize: "1.1rem" }}>
          홈이 아직 설정되지 않았어요.
          <br />
          대시보드에서 먼저 홈을 등록해 주세요.
        </p>
      </div>
    );
  }

  return (
    <CameraBroadcastClient
      userId={user.id}
      homeId={profile.home_id}
      broadcasterDisplayName={profile.display_name ?? "집사"}
    />
  );
}
