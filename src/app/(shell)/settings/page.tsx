import Link from "next/link";
import { redirect } from "next/navigation";
import { CameraDeviceManager } from "@/components/catvisor/CameraDeviceManager";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 설정 — 카메라 페어링·기기 목록(홈이 있을 때).
 */
export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_id")
    .eq("id", user.id)
    .single();

  const homeId = profile?.home_id ?? null;

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
      <p style={{ color: "#5c7d79", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
        집·카메라 연결을 관리해요. 남는 폰에서 코드를 입력하면 아래 목록이 갱신되고, 코드 창은 자동으로 닫혀요.
      </p>

      {!homeId ? (
        <p style={{ marginBottom: "1rem", color: "#b45309" }}>
          아직 집이 연결되지 않았어요. 온보딩에서 집 이름을 먼저 설정해 주세요.
        </p>
      ) : (
        <div style={{ marginBottom: "2rem" }}>
          <CameraDeviceManager homeId={homeId} />
        </div>
      )}

      {/* 로그아웃 버튼 — 설정 페이지 하단 */}
      <div style={{ marginTop: "1.5rem" }}>
        <LogoutButton />
      </div>
    </div>
  );
}
