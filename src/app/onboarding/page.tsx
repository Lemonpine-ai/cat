import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OnboardingClient } from "./OnboardingClient";

/**
 * 첫 로그인 후 home_id 가 없는 사용자를 위한 온보딩 페이지.
 * 이미 홈이 있으면 대시보드로 즉시 이동.
 */
export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_id, display_name")
    .eq("id", user.id)
    .single();

  if (profile?.home_id) redirect("/");

  return (
    <OnboardingClient
      userId={user.id}
      displayName={profile?.display_name ?? user.email?.split("@")[0] ?? "집사"}
    />
  );
}
