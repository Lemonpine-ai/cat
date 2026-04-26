/**
 * cat-identity Tier 1 fix R5-2 R3-2 / R3-3 — CatRadioGroup 단위 테스트.
 *
 * 케이스:
 *  1) 옵션 선택 → onChange 호출 + value 갱신
 *  2) error prop → aria-invalid=true + 에러 텍스트 (role=alert)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CatRadioGroup } from "@/app/cats/new/CatRadioGroup";

const SEX_OPTIONS = [
  { value: "male", label: "남아 (수컷)" },
  { value: "female", label: "여아 (암컷)" },
  { value: "unknown", label: "모름" },
] as const;

describe("CatRadioGroup fix R5-2 R3-2", () => {
  it("1) 옵션 선택 → onChange 호출 (next value 인자)", () => {
    const onChange = vi.fn();
    render(
      <CatRadioGroup
        name="cat-sex"
        options={SEX_OPTIONS}
        value="unknown"
        onChange={onChange}
        legend="성별 *"
      />,
    );
    const female = screen.getByLabelText(/여아/);
    fireEvent.click(female);
    expect(onChange).toHaveBeenCalledWith("female");
  });

  it("2) error prop → aria-invalid=true + role=alert 에러 텍스트", () => {
    render(
      <CatRadioGroup
        name="cat-sex"
        options={SEX_OPTIONS}
        value={null}
        onChange={vi.fn()}
        legend="성별 *"
        error="성별을 선택해 주세요"
      />,
    );
    /* radiogroup role 노드의 aria-invalid 검증. */
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("aria-invalid")).toBe("true");

    /* error 메시지가 role=alert 로 렌더. */
    const alerts = screen.getAllByRole("alert");
    const matched = alerts.find((el) =>
      el.textContent?.includes("성별을 선택"),
    );
    expect(matched).toBeTruthy();
  });
});
