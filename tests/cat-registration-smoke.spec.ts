import { expect, test } from "@playwright/test";

/**
 * cat-identity Tier 1 — /cats/new 등록 화면 스모크 테스트.
 *
 * 비로그인 상태 시나리오만 (실제 로그인 + DB INSERT 는 staging E2E 별도).
 *  1) 비로그인 → /login 리다이렉트
 *  2) 페이지 도달 시 콘솔 경고 (aria-hidden / hydration mismatch) 없음
 *
 * 실제 등록 플로우 (이름/품종/생년월일/사진 → 홈 복귀) 검증은 인증 토큰 주입 환경 전제.
 */

test.describe("/cats/new 등록 화면 스모크", () => {
  test("비로그인 사용자는 /login 으로 리다이렉트된다", async ({ page }) => {
    /* server component 가 redirect("/login") 호출 → 직접 /login 도달 확인 */
    await page.goto("/cats/new", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/);
  });

  test("로그인 페이지 자체는 콘솔 경고 없이 렌더된다", async ({ page }) => {
    /* /cats/new 진입 후 /login 자동 이동 → 거기서 aria-hidden / hydration 경고 점검 */
    const consoleWarnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning") {
        consoleWarnings.push(msg.text());
      }
    });

    await page.goto("/cats/new", { waitUntil: "domcontentloaded" });
    /* 리다이렉트 완료 대기 */
    await page.waitForURL(/\/login/);

    const blocking = consoleWarnings.filter(
      (t) =>
        /Blocked aria-hidden|aria-hidden.*focus|Hydration failed|did not match/i.test(
          t,
        ),
    );
    expect(
      blocking,
      `콘솔 차단 경고 발견: ${blocking.join(" | ")}`,
    ).toEqual([]);
  });
});
