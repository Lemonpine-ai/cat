"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadPostImage } from "@/lib/community/uploadPostImage";
import { COMMUNITY_CATEGORIES, type CommunityCategoryKey, HEALTH_TAGS, type HealthTagKey } from "@/types/community";
import styles from "./Community.module.css";

/** 글 작성 폼 — 카테고리, 건강태그, 제목, 본문, 이미지 */
export function PostWriteForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const categoryKeys = Object.keys(COMMUNITY_CATEGORIES) as CommunityCategoryKey[];
  const [category, setCategory] = useState<CommunityCategoryKey>("brag");
  const [healthTag, setHealthTag] = useState<HealthTagKey>("etc");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("로그인이 필요합니다"); return; }
      setImageUrl(await uploadPostImage(file, user.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "이미지 업로드 실패");
      setPreview(null);
      setImageUrl(null);
    } finally { setUploading(false); }
  }

  async function handleSubmit() {
    if (!title.trim() || !content.trim() || busy || uploading) return;
    setBusy(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("로그인이 필요합니다"); return; }
      const { error: e } = await supabase.from("community_posts").insert({
        author_id: user.id, category, title: title.trim(), content: content.trim(),
        image_url: imageUrl, health_tag: category === "health" ? healthTag : null,
      });
      if (e) { setError("글 저장 실패: " + e.message); return; }
      router.push(`/community/${category}`);
    } finally { setBusy(false); }
  }

  return (
    <div className={styles.writeForm}>
      <select value={category} onChange={(e) => setCategory(e.target.value as CommunityCategoryKey)}>
        {categoryKeys.map((k) => <option key={k} value={k}>{COMMUNITY_CATEGORIES[k].name}</option>)}
      </select>
      {category === "health" ? (
        <div className={styles.healthTagRow}>
          {(Object.keys(HEALTH_TAGS) as HealthTagKey[]).map((t) => (
            <button key={t} type="button" className={`${styles.healthTagBtn} ${healthTag === t ? styles.healthTagBtnActive : ""}`} onClick={() => setHealthTag(t)}>
              {HEALTH_TAGS[t].emoji} {HEALTH_TAGS[t].name}
            </button>
          ))}
        </div>
      ) : null}
      <input type="text" placeholder="제목을 입력하세요" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
      <textarea placeholder="내용을 입력하세요" value={content} onChange={(e) => setContent(e.target.value)} />
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? "업로드 중…" : "📷 사진 첨부"}
      </button>
      {preview && <img src={preview} alt="미리보기" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, marginTop: 8 }} />}
      {error && <p style={{ color: "red", fontSize: "0.9rem" }}>{error}</p>}
      <button type="button" className={styles.submitBtn} onClick={handleSubmit} disabled={busy || uploading || !title.trim() || !content.trim()}>
        {busy ? "등록 중…" : "등록하기"}
      </button>
    </div>
  );
}
