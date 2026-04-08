"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 로그아웃 버튼 — 설정 페이지 하단에 배치
 * confirm 후 Supabase signOut → /login 이동
 */
export function LogoutButton() {
  const router = useRouter();

  /* 로그아웃 핸들러 */
  const handleLogout = async () => {
    const ok = window.confirm("정말 로그아웃 하시겠어요?");
    if (!ok) return;

    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      style={{
        width: "100%",
        padding: "0.85rem",
        border: "1.5px solid #fecaca",
        borderRadius: "0.75rem",
        background: "#fff5f5",
        color: "#dc2626",
        fontSize: "0.9rem",
        fontWeight: 700,
        cursor: "pointer",
        transition: "background 0.15s ease",
      }}
      onMouseOver={(e) => { e.currentTarget.style.background = "#fee2e2"; }}
      onMouseOut={(e) => { e.currentTarget.style.background = "#fff5f5"; }}
    >
      로그아웃
    </button>
  );
}
