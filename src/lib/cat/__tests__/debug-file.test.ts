/**
 * cat-identity Tier 1 fix R4-1 — 임시 디버깅 파일 (vitest include 미포함, 비활성).
 *
 * jsdom 의 File / Blob 가 arrayBuffer() 메서드를 미지원함을 확인하기 위해
 * 임시로 사용했던 파일. detectImageMagic.ts 가 FileReader 폴백을 갖도록 수정한 후
 * 본 파일은 vitest include 에서 제외하여 실행되지 않는다.
 *
 * CLAUDE.md "파일 삭제 절대 금지" — 빈 placeholder 만 남김.
 */
export {};
