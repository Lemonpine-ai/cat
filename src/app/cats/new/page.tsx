/**
 * cat-identity Tier 1 — /cats/new 라우트 (Server Component).
 *
 * 책임 (서버 사이드):
 *  1) auth 체크 — 미로그인 시 /login 리다이렉트
 *  2) profile.home_id 해석 — 없으면 /onboarding 리다이렉트 (기존 플로우 활용)
 *  3) 클라이언트 <CatRegistrationScreen homeId={...} /> 렌더
 *
 * home_id 를 서버에서 결정해 클라이언트 훅 (useCatRegistration) 이 auth.getUser 호출
 * 을 중복 수행하지 않도록 prop 으로 전달. (src/app/(shell)/page.tsx 의 기존 패턴 재사용.)
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CatRegistrationScreen } from "./CatRegistrationScreen";

export const dynamic = "force-dynamic"; // auth state 기반 SSR 이므로 정적 생성 X

export default async function CatNewPage() {
  const supabase = await createSupabaseServerClient();

  /* 1) 로그인 체크 */
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  /* 2) profile.home_id 조회 */
  const { data: profile } = await supabase
    .from("profiles")
    .select("home_id")
    .eq("id", user.id)
    .maybeSingle();
  const homeId = profile?.home_id ?? null;

  if (!homeId) {
    /* home 없는 신규 사용자는 기존 온보딩 플로우로 */
    redirect("/onboarding");
  }

  /* 3) 클라이언트 컴포넌트 렌더 — 이 시점 homeId 는 string 확정 */
  return <CatRegistrationScreen homeId={homeId} />;
}
