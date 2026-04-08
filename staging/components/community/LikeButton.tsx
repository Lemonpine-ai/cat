"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./Community.module.css";

type LikeButtonProps = {
  postId: string;
  initialLikeCount: number;
  initialLiked: boolean;
};

/**
 * 좋아요 토글 버튼 — optimistic UI로 즉시 반영
 *
 * 좋아요/좋아요 취소 수(like_count)는 DB 트리거가 자동으로 관리합니다.
 * (community_likes 테이블에 INSERT/DELETE 시 trg_like_count 트리거가
 *  community_posts.like_count를 자동으로 +1/-1 해줍니다.)
 *
 * 이 컴포넌트에서는 사용자 경험을 위해 optimistic UI로 화면에 즉시 반영하고,
 * 실제 DB의 like_count 갱신은 트리거가 처리하므로 클라이언트에서 별도로
 * like_count를 UPDATE하지 않습니다. router.refresh()를 호출하면
 * 트리거가 반영한 최신 count가 서버에서 자동으로 내려옵니다.
 */
export function LikeButton({
  postId,
  initialLikeCount,
  initialLiked,
}: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialLikeCount);
  const [busy, setBusy] = useState(false);

  async function handleToggle() {
    if (busy) return;
    setBusy(true);

    /* optimistic 업데이트 */
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((prev) => prev + (nextLiked ? 1 : -1));

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      if (nextLiked) {
        await supabase
          .from("community_likes")
          .insert({ post_id: postId, user_id: user.id });
      } else {
        await supabase
          .from("community_likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", user.id);
      }
    } catch {
      /* 실패 시 롤백 */
      setLiked(!nextLiked);
      setCount((prev) => prev + (nextLiked ? -1 : 1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`${styles.likeButton} ${liked ? styles.liked : ""}`}
      onClick={handleToggle}
      disabled={busy}
    >
      <Heart size={16} fill={liked ? "currentColor" : "none"} />
      <span>{count}</span>
    </button>
  );
}
