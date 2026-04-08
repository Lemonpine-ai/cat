/** 커뮤니티 게시글 타입 (profiles 조인 포함) */
export type CommunityPost = {
  id: string;
  author_id: string;
  category: string;
  title: string;
  content: string;
  image_url: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  /** profiles 조인 필드 */
  author_name: string | null;
  author_avatar: string | null;
};

/** 커뮤니티 댓글 타입 (profiles 조인 포함) */
export type CommunityComment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  /** profiles 조인 필드 */
  author_name: string | null;
  author_avatar: string | null;
};

/** 커뮤니티 카테고리 정의 */
export const COMMUNITY_CATEGORIES = {
  brag: {
    name: "자랑하기",
    description: "귀여운 순간 사진/영상 공유",
    icon: "Camera",
  },
  kitten: {
    name: "아기냥",
    description: "새끼 고양이 육아 정보",
    icon: "Baby",
  },
  senior: {
    name: "노령묘",
    description: "노묘 케어 노하우",
    icon: "Heart",
  },
  health: {
    name: "건강/질병",
    description: "증상 공유, 병원 추천",
    icon: "Stethoscope",
  },
} as const;

/** 카테고리 키 유니온 타입 */
export type CommunityCategoryKey = keyof typeof COMMUNITY_CATEGORIES;

/**
 * 카테고리 값이 유효한지 확인하는 함수 (brag, kitten, senior, health 중 하나인지 체크)
 *
 * 사용자가 URL로 직접 접근할 때 존재하지 않는 카테고리를 입력할 수 있으므로,
 * 이 함수로 유효성을 먼저 검증합니다.
 * TypeScript의 타입 가드(type guard) 패턴을 사용하여,
 * 이 함수를 통과하면 해당 값이 CommunityCategoryKey 타입임을 보장합니다.
 *
 * @param val - 검증할 카테고리 문자열
 * @returns 유효한 카테고리이면 true, 아니면 false
 */
export function isValidCategory(val: string): val is CommunityCategoryKey {
  return val in COMMUNITY_CATEGORIES;
}
