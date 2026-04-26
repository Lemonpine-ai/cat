/**
 * cat-identity Tier 1 fix R5-2 R3-3 — CatTextArea 단위 테스트.
 *
 * 케이스:
 *  1) 입력 → onChange 호출 (string 인자)
 *  2) maxLength 가 textarea 에 적용되어 있어 초과 입력 차단
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CatTextArea } from "@/app/cats/new/CatTextArea";

describe("CatTextArea fix R5-2 R3-3", () => {
  it("1) 입력 → onChange 호출 (string 인자)", () => {
    const onChange = vi.fn();
    render(
      <CatTextArea
        id="cat-medical"
        label="기저질환 / 주의사항"
        value=""
        onChange={onChange}
        rows={3}
        maxLength={500}
      />,
    );
    const textarea = screen.getByLabelText(/기저질환/);
    fireEvent.change(textarea, { target: { value: "신장 수치 주의" } });
    expect(onChange).toHaveBeenCalledWith("신장 수치 주의");
  });

  it("2) error prop → aria-invalid=true + role=alert + maxLength 속성 적용", () => {
    render(
      <CatTextArea
        id="cat-medical"
        label="기저질환"
        value=""
        onChange={vi.fn()}
        rows={2}
        maxLength={300}
        error="500자 이내로 입력해 주세요"
      />,
    );
    const textarea = screen.getByLabelText(/기저질환/) as HTMLTextAreaElement;
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    /* maxLength 속성도 동시 검증 — 한 케이스에서 상태 + 한도 동시 보장. */
    expect(textarea.maxLength).toBe(300);
    const alerts = screen.getAllByRole("alert");
    const matched = alerts.find((el) =>
      el.textContent?.includes("500자 이내"),
    );
    expect(matched).toBeTruthy();
  });
});
