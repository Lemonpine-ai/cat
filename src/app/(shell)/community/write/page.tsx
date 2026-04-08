import Link from "next/link";
import { redirect } from "next/navigation";
import { PostWriteForm } from "@/components/community/PostWriteForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "@/components/community/Community.module.css";

/**
 * 글 작성 페이지 — 로그인 유저만 접근 가능.
 * 서버에서 유저 정보만 확인하고, 폼은 클라이언트 컴포넌트에 위임한다.
 */
export default async function WritePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* 비로그인 시 로그인 페이지로 리다이렉트 */
  if (!user) {
    redirect("/login");
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <Link href="/community" className={styles.backLink}>
          ← 커뮤니티
        </Link>
        <h1 className={styles.pageTitle}>글 작성</h1>
      </div>

      <PostWriteForm />
    </div>
  );
}
