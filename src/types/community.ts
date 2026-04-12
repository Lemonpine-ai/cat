/** 커뮤니티 게시글 타입 (profiles 조인 포함) */
export type CommunityPost = {
  id: string;
  author_id: string;
  category: string;
  title: string;
  content: string;
  image_url: string | null;
  /** 건강/질병 서브 태그 — category가 'health'일 때만 사용 */
  health_tag: string | null;
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

/**
 * 커뮤니티 카테고리 정의 — v2
 * C1(카피): 따뜻한 톤 설명 문구, 돌봄 앱 감성
 */
export const COMMUNITY_CATEGORIES = {
  brag: {
    name: "자랑하기",
    description: "우리 아이 귀여운 순간 자랑해요",
    icon: "Camera",
  },
  kitten: {
    name: "아기냥 육아",
    description: "새끼 고양이 키우기 꿀팁",
    icon: "Baby",
  },
  senior: {
    name: "노령묘 케어",
    description: "오래오래 건강하게, 노묘 돌봄",
    icon: "Heart",
  },
  health: {
    name: "건강 상담",
    description: "증상 공유하고 함께 고민해요",
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
/**
 * 건강/질병 서브카테고리 (health_tag)
 * category가 'health'일 때만 사용한다.
 */
export const HEALTH_TAGS = {
  kidney:         { name: "신장",   emoji: "🫘" },
  herpes:         { name: "허피스", emoji: "🦠" },
  panleukopenia:  { name: "범백",   emoji: "🩸" },
  heart:          { name: "심장",   emoji: "❤️" },
  dental:         { name: "치아",   emoji: "🦷" },
  etc:            { name: "기타",   emoji: "📋" },
} as const;

/** 건강 태그 키 유니온 타입 */
export type HealthTagKey = keyof typeof HEALTH_TAGS;

export function isValidCategory(val: string): val is CommunityCategoryKey {
  return val in COMMUNITY_CATEGORIES;
}
