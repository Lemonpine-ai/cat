/**
 * 매핑 함수 모음 — Supabase 조인 결과를 앱에서 사용하는 타입으로 변환합니다.
 *
 * Supabase에서 community_posts나 community_comments를 profiles 테이블과
 * 조인(join)해서 가져오면, 결과가 DB 원본 형태(Record)로 옵니다.
 * 이 파일의 함수들은 그 결과를 앱의 CommunityPost / CommunityComment
 * 타입으로 깔끔하게 변환해 줍니다.
 *
 * 여러 페이지에서 동일한 변환 로직이 필요하므로 한 곳에 모아두었습니다.
 */

import type { CommunityPost, CommunityComment } from "@/types/community";

/**
 * mapRowToPost — Supabase 게시글 조인 결과 한 행을 CommunityPost 타입으로 변환하는 함수입니다.
 *
 * Supabase에서 community_posts 테이블을 profiles와 조인하면
 * { id, author_id, ..., profiles: { nickname, avatar_url } } 형태의 객체가 옵니다.
 * 이 함수는 그 객체를 앱 전체에서 사용하는 CommunityPost 타입으로 바꿔줍니다.
 *
 * @param r - Supabase 조인 결과의 한 행 (Record<string, unknown>)
 * @returns CommunityPost 타입 객체
 */
export function mapRowToPost(r: Record<string, unknown>): CommunityPost {
  // profiles 필드는 Supabase 조인으로 가져온 작성자 프로필 정보입니다.
  const profile = r.profiles as { nickname?: string; avatar_url?: string } | null;

  return {
    id: r.id as string,
    author_id: r.author_id as string,
    category: r.category as string,
    title: r.title as string,
    content: r.content as string,
    // 이미지가 없을 수도 있으므로 null 처리합니다.
    image_url: (r.image_url as string) ?? null,
    like_count: r.like_count as number,
    comment_count: r.comment_count as number,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    // 프로필에서 닉네임과 아바타를 가져오되, 없으면 null로 둡니다.
    author_name: profile?.nickname ?? null,
    author_avatar: profile?.avatar_url ?? null,
  };
}

/**
 * mapRowToComment — Supabase 댓글 조인 결과 한 행을 CommunityComment 타입으로 변환하는 함수입니다.
 *
 * Supabase에서 community_comments 테이블을 profiles와 조인하면
 * { id, post_id, ..., profiles: { nickname, avatar_url } } 형태의 객체가 옵니다.
 * 이 함수는 그 객체를 앱 전체에서 사용하는 CommunityComment 타입으로 바꿔줍니다.
 *
 * @param r - Supabase 조인 결과의 한 행 (Record<string, unknown>)
 * @returns CommunityComment 타입 객체
 */
export function mapRowToComment(r: Record<string, unknown>): CommunityComment {
  // profiles 필드는 Supabase 조인으로 가져온 댓글 작성자 프로필 정보입니다.
  const profile = r.profiles as { nickname?: string; avatar_url?: string } | null;

  return {
    id: r.id as string,
    post_id: r.post_id as string,
    author_id: r.author_id as string,
    content: r.content as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    // 프로필에서 닉네임과 아바타를 가져오되, 없으면 null로 둡니다.
    author_name: profile?.nickname ?? null,
    author_avatar: profile?.avatar_url ?? null,
  };
}
