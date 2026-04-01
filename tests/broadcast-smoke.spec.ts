import { expect, test } from "@playwright/test";

/**
 * 방송 페이지 스모크: 페어링 UI·가짜 기기 토큰 후 컨트롤·콘솔 aria-hidden 경고 없음.
 * 실제 카메라·로그인은 재현하지 않음 (헤드리스에서 getUserMedia 는 보통 실패).
 */
test.describe("방송 페이지 스모크 (/camera/broadcast)", () => {
  test("비페어링이면 안내 카드가 보인다", async ({ page }) => {
    const consoleWarnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning") {
        consoleWarnings.push(msg.text());
      }
    });

    await page.goto("/camera/broadcast", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "먼저 페어링이 필요해요" }),
    ).toBeVisible();

    const ariaBlocked = consoleWarnings.some((t) =>
      /Blocked aria-hidden|aria-hidden.*focus/i.test(t),
    );
    expect(ariaBlocked, `콘솔 경고: ${consoleWarnings.join(" | ")}`).toBe(
      false,
    );
  });

  test("로컬스토리지에 device_token 이 있으면 카메라 켜기 버튼이 보인다", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "catvisor_device_token",
        "playwright-e2e-smoke-token",
      );
      window.localStorage.setItem("catvisor_device_name", "E2E 카메라");
    });

    await page.goto("/camera/broadcast", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: /카메라 켜기/ }),
    ).toBeVisible();
  });
});
