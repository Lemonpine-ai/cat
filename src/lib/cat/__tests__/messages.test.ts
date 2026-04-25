/**
 * cat-identity Tier 1 fix R5-2 R7-2 — messages.ts 회귀 테스트.
 *
 * 보안: photoMimeInvalid 에 "HEIC" 가 포함되지 않음 — ALLOWED_MIME 에서 HEIC 가 제거됐는데
 * 사용자 메시지가 "HEIC 만 가능합니다" 같은 거짓 안내를 하면 사용자 혼란.
 */

import { describe, it, expect } from "vitest";
import { CAT_MESSAGES } from "@/lib/cat/messages";

describe("CAT_MESSAGES fix R5-2 R7-2", () => {
  it("photoMimeInvalid 본문에 'HEIC' 가 포함되지 않음 (회귀 방지)", () => {
    expect(CAT_MESSAGES.photoMimeInvalid).not.toContain("HEIC");
    expect(CAT_MESSAGES.photoMimeInvalid).not.toContain("heic");
  });

  it("photoMimeInvalid 본문에 JPG/PNG/WebP 정확히 안내", () => {
    expect(CAT_MESSAGES.photoMimeInvalid).toContain("JPG");
    expect(CAT_MESSAGES.photoMimeInvalid).toContain("PNG");
    expect(CAT_MESSAGES.photoMimeInvalid).toContain("WebP");
  });
});
