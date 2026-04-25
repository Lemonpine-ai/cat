/**
 * cat-identity Tier 1 fix R5-2 R7-2 — constants.ts 회귀 테스트.
 *
 * 보안: ALLOWED_MIME 에 image/heic / image/heif 가 포함되지 않음.
 * fragile 1차 통과 (단계 1 통과 후 단계 2 magic byte 거부) 회피 정책 회귀 방지.
 */

import { describe, it, expect } from "vitest";
import { ALLOWED_MIME } from "@/lib/cat/constants";

describe("ALLOWED_MIME fix R5-2 R7-2", () => {
  it("image/heic 미포함 (회귀 방지)", () => {
    expect(ALLOWED_MIME).not.toContain("image/heic");
  });

  it("image/heif 미포함 (회귀 방지)", () => {
    expect(ALLOWED_MIME).not.toContain("image/heif");
  });

  it("image/jpeg / image/png / image/webp 정확히 3종만 포함", () => {
    expect(ALLOWED_MIME).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});
