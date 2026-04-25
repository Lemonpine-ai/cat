/**
 * cat-identity Tier 1 fix R1 #5 — validateCatDraft 단위 테스트.
 *
 * 9+ 케이스: 필수 4 누락 / 길이 초과 / 날짜 (미래/유효 무효) / 체중 범위 / 모두 유효.
 * vitest include 위치: src/lib/cat/__tests__/*.test.ts (vitest.config.ts 참조).
 */

import { describe, it, expect } from "vitest";
import { validateCatDraft } from "@/lib/cat/validateCatDraft";
import type { CatDraft } from "@/types/cat";

const BASE_DRAFT: CatDraft = {
  name: "나비",
  breed: "코리안 숏헤어",
  birthDate: "2020-01-01",
  sex: "unknown",
  photoFile: null,
  isNeutered: "unknown",
  weightKg: "",
  medicalNotes: "",
  medications: "",
  supplements: "",
  litterType: "",
  foodType: "",
};

describe("validateCatDraft", () => {
  it("모든 필수 필드 채워지면 에러 없음", () => {
    const errors = validateCatDraft(BASE_DRAFT);
    expect(errors).toEqual([]);
  });

  it("이름 빈 문자열 → name 에러", () => {
    const errors = validateCatDraft({ ...BASE_DRAFT, name: "" });
    expect(errors.find((e) => e.field === "name")).toBeDefined();
  });

  it("이름 공백만 → name 에러", () => {
    const errors = validateCatDraft({ ...BASE_DRAFT, name: "   " });
    expect(errors.find((e) => e.field === "name")).toBeDefined();
  });

  it("이름 30자 초과 → name 에러", () => {
    const errors = validateCatDraft({ ...BASE_DRAFT, name: "가".repeat(31) });
    expect(errors.find((e) => e.field === "name")).toBeDefined();
  });

  it("품종 빈 → breed 에러", () => {
    const errors = validateCatDraft({ ...BASE_DRAFT, breed: "" });
    expect(errors.find((e) => e.field === "breed")).toBeDefined();
  });

  it("생년월일 빈 → birthDate 에러", () => {
    const errors = validateCatDraft({ ...BASE_DRAFT, birthDate: "" });
    expect(errors.find((e) => e.field === "birthDate")).toBeDefined();
  });

  it("미래 날짜 → birthDate 에러", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const errors = validateCatDraft({ ...BASE_DRAFT, birthDate: future });
    expect(errors.find((e) => e.field === "birthDate")).toBeDefined();
  });

  it("체중 비수치 → weightKg 에러", () => {
    const errors = validateCatDraft({ ...BASE_DRAFT, weightKg: "abc" });
    expect(errors.find((e) => e.field === "weightKg")).toBeDefined();
  });

  it("체중 범위 초과 (40 kg) → weightKg 에러", () => {
    const errors = validateCatDraft({ ...BASE_DRAFT, weightKg: "40" });
    expect(errors.find((e) => e.field === "weightKg")).toBeDefined();
  });

  it("체중 0.05 (WEIGHT_MIN 0.1 미달) → weightKg 에러", () => {
    const errors = validateCatDraft({ ...BASE_DRAFT, weightKg: "0.05" });
    expect(errors.find((e) => e.field === "weightKg")).toBeDefined();
  });

  it("체중 비어있으면 옵션 → 에러 없음", () => {
    const errors = validateCatDraft({ ...BASE_DRAFT, weightKg: "" });
    expect(errors.find((e) => e.field === "weightKg")).toBeUndefined();
  });
});
