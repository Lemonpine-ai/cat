/**
 * cat-identity Tier 1 fix R4-3 M7 — catDraftToInsertPayload weight 임계값 회귀 방지.
 *
 * 회귀 방지: validate (WEIGHT_MIN=0.1) ↔ payload (>0) 모순 차단.
 * 5 case (weight=0 / 0.05 / 0.1 / 30 / 30.01).
 */

import { describe, it, expect } from "vitest";
import { catDraftToInsertPayload } from "@/types/cat";
import type { CatDraft } from "@/types/cat";

const BASE: CatDraft = {
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

describe("catDraftToInsertPayload weight 경계", () => {
  it("1) weight=0 → null (validate 와 동일 임계값)", () => {
    const out = catDraftToInsertPayload({ ...BASE, weightKg: "0" }, "home-1", null);
    expect(out.weight_kg).toBeNull();
  });

  it("2) weight=0.05 → null (WEIGHT_MIN=0.1 미만)", () => {
    const out = catDraftToInsertPayload({ ...BASE, weightKg: "0.05" }, "home-1", null);
    expect(out.weight_kg).toBeNull();
  });

  it("3) weight=0.1 → 0.1 (정확 경계 통과)", () => {
    const out = catDraftToInsertPayload({ ...BASE, weightKg: "0.1" }, "home-1", null);
    expect(out.weight_kg).toBe(0.1);
  });

  it("4) weight=30 → 30 (정확 경계 통과)", () => {
    const out = catDraftToInsertPayload({ ...BASE, weightKg: "30" }, "home-1", null);
    expect(out.weight_kg).toBe(30);
  });

  it("5) weight=30.01 → null (WEIGHT_MAX=30 초과)", () => {
    const out = catDraftToInsertPayload({ ...BASE, weightKg: "30.01" }, "home-1", null);
    expect(out.weight_kg).toBeNull();
  });

  it("6) weight=빈 문자열 → null", () => {
    const out = catDraftToInsertPayload({ ...BASE, weightKg: "" }, "home-1", null);
    expect(out.weight_kg).toBeNull();
  });

  it("7) weight=숫자 아닌 문자 → null", () => {
    const out = catDraftToInsertPayload({ ...BASE, weightKg: "abc" }, "home-1", null);
    expect(out.weight_kg).toBeNull();
  });
});
