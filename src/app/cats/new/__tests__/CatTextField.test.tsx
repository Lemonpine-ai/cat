/**
 * cat-identity Tier 1 fix R4-3 m14 — CatTextField 단위 테스트.
 *
 * 3 case:
 *  1) errorMessage 존재 → aria-invalid=true + role=alert 노드 렌더
 *  2) maxLength=30 + value="나비" → counter "28자 남음" 표시
 *  3) onChange 호출 → 부모 callback 호출
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CatTextField } from "@/app/cats/new/CatTextField";

describe("CatTextField fix R4-3 m14", () => {
  it("1) errorMessage 존재 → aria-invalid=true + role=alert", () => {
    render(
      <CatTextField
        id="cat-name"
        label="이름"
        required
        value=""
        onChange={vi.fn()}
        maxLength={30}
        errorMessage="이름을 입력해 주세요"
      />,
    );
    const input = screen.getByLabelText(/이름/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    /* errorMessage 가 role=alert 노드로 표시. */
    const alerts = screen.getAllByRole("alert");
    const matched = alerts.find((el) =>
      el.textContent?.includes("이름을 입력해"),
    );
    expect(matched).toBeTruthy();
  });

  it("2) maxLength=30 + value='나비' → '28자 남음' 카운터", () => {
    render(
      <CatTextField
        id="cat-name"
        label="이름"
        value="나비"
        onChange={vi.fn()}
        maxLength={30}
      />,
    );
    /* trim 길이 카운터 = 30 - 2 = 28. */
    expect(screen.getByText("28자 남음")).toBeTruthy();
  });

  it("3) onChange 호출 → 부모 callback 호출 (string 인자)", () => {
    const onChange = vi.fn();
    render(
      <CatTextField
        id="cat-name"
        label="이름"
        value=""
        onChange={onChange}
        maxLength={30}
      />,
    );
    const input = screen.getByLabelText(/이름/);
    fireEvent.change(input, { target: { value: "나비" } });
    expect(onChange).toHaveBeenCalledWith("나비");
  });

  it("4) errorMessage 부재 → aria-invalid=false (또는 미설정)", () => {
    render(
      <CatTextField
        id="cat-name"
        label="이름"
        value="나비"
        onChange={vi.fn()}
        maxLength={30}
      />,
    );
    const input = screen.getByLabelText(/이름/);
    /* aria-invalid 가 "false" 거나 미설정. */
    const inv = input.getAttribute("aria-invalid");
    expect(inv === "false" || inv === null).toBe(true);
  });
});
