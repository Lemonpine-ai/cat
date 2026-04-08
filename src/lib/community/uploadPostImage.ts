import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** 파일 크기 제한: 5MB */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** 허용 이미지 MIME 타입 */
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/**
 * 이미지를 Supabase Storage(post-images)에 업로드하고 공개 URL을 반환한다.
 * 파일 크기(5MB), 타입(JPG/PNG/GIF/WebP) 검증 포함.
 */
export async function uploadPostImage(file: File, userId: string): Promise<string> {
  if (file.size > MAX_FILE_SIZE) throw new Error("파일 크기는 5MB 이하만 가능합니다");
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("JPG, PNG, GIF, WebP 이미지만 업로드 가능합니다");

  const supabase = createSupabaseBrowserClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${userId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from("post-images").upload(filePath, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    if (error.message.includes("not found") || error.message.includes("Bucket")) {
      throw new Error("이미지 저장소(post-images)가 아직 설정되지 않았습니다. 관리자에게 문의해주세요.");
    }
    throw new Error("이미지 업로드 실패: " + error.message);
  }

  const { data: urlData } = supabase.storage.from("post-images").getPublicUrl(filePath);
  return urlData.publicUrl;
}
