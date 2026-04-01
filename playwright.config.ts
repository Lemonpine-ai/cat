import { defineConfig, devices } from "@playwright/test";

/**
 * WebRTC·ICE 검증용. 실제 “공용 Wi‑Fi 방화벽”은 OS/네트워크 밖이라 여기서 완전 재현은 불가하고,
 * 브라우저가 우리 ICE 설정으로 후보 수집까지 되는지 확인한다.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
