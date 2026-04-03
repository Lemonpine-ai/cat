/**
 * 홈 화면 고양이 카드에 쓰는 최소 필드 (public.cats 기준).
 */
export type CatProfileRow = {
  id: string;
  home_id: string;
  name: string;
  sex: "male" | "female" | "unknown" | null;
  breed: string | null;
  photo_front_url: string | null;
  /** 사용자가 버튼으로 갱신하는 최근 상태 (Supabase `cats.status`) */
  status: string | null;
};
