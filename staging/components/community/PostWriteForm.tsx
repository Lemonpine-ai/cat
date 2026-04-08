"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  COMMUNITY_CATEGORIES,
  type CommunityCategoryKey,
} from "@/types/community";
import styles from "./Community.module.css";

/** 글 작성 폼 — 카테고리 선택, 제목, 본문, 이미지 URL */
export function PostWriteForm() {
  const router = useRouter();
  const categoryKeys = Object.keys(COMMUNITY_CATEGORIES) as CommunityCategoryKey[];

  const [category, setCategory] = useState<CommunityCategoryKey>("brag");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !content.trim() || busy) return;
    setBusy(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("community_posts").insert({
        author_id: user.id,
        category,
        title: title.trim(),
        content: content.trim(),
        image_url: imageUrl.trim() || null,
      });

      /* 성공 시 해당 카테고리 목록으로 이동 */
      router.push(`/community/${category}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.writeForm}>
      {/* 카테고리 선택 */}
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as CommunityCategoryKey)}
      >
        {categoryKeys.map((key) => (
          <option key={key} value={key}>
            {COMMUNITY_CATEGORIES[key].name}
          </option>
        ))}
      </select>

      {/* 제목 */}
      <input
        type="text"
        placeholder="제목을 입력하세요"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={100}
      />

      {/* 본문 */}
      <textarea
        placeholder="내용을 입력하세요"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      {/* 이미지 URL (선택) */}
      <input
        type="text"
        placeholder="이미지 URL (선택)"
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
      />

      {/* 등록 버튼 */}
      <button
        type="button"
        className={styles.submitBtn}
        onClick={handleSubmit}
        disabled={busy || !title.trim() || !content.trim()}
      >
        {busy ? "등록 중…" : "등록하기"}
      </button>
    </div>
  );
}
