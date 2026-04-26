/**
 * cat-identity Tier 1 fix R4-3 M1 — useCatDraftUpdater 단위 테스트.
 *
 * 핵심 회귀 방지:
 *  - 동일 onChange 참조 → 동일 update 함수 ref (memo 효과 보존).
 *  - update("name", "나비") → onChange((prev) => ({ ...prev, name: "나비" })) 호출됨.
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCatDraftUpdater } from "@/hooks/useCatDraftUpdater";
import type { CatDraft } from "@/types/cat";

const SAMPLE_DRAFT: CatDraft = {
  name: "",
  breed: "",
  birthDate: "",
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

describe("useCatDraftUpdater", () => {
  it("1) 동일 onChange → 동일 update 함수 ref (memo 효과)", () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(({ fn }) => useCatDraftUpdater(fn), {
      initialProps: { fn: onChange },
    });
    const first = result.current;
    rerender({ fn: onChange });
    expect(result.current).toBe(first);
  });

  it("2) update(key, value) → 함수형 setter 호출 (prev => { ...prev, [key]: value })", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useCatDraftUpdater(onChange));
    result.current("name", "나비");
    expect(onChange).toHaveBeenCalledTimes(1);
    /* 인자가 함수 (updater) 임을 검증. */
    const updaterArg = onChange.mock.calls[0][0];
    expect(typeof updaterArg).toBe("function");
    /* updater 호출 시 SAMPLE_DRAFT.name = "나비" 로 변경된 새 객체 반환. */
    const next = updaterArg(SAMPLE_DRAFT);
    expect(next).toEqual({ ...SAMPLE_DRAFT, name: "나비" });
    /* 원본 미변경 (immutability). */
    expect(SAMPLE_DRAFT.name).toBe("");
  });

  it("3) onChange 가 바뀌면 update 도 새로 생성", () => {
    const onChangeA = vi.fn();
    const onChangeB = vi.fn();
    const { result, rerender } = renderHook(({ fn }) => useCatDraftUpdater(fn), {
      initialProps: { fn: onChangeA },
    });
    const first = result.current;
    rerender({ fn: onChangeB });
    expect(result.current).not.toBe(first);
  });
});
