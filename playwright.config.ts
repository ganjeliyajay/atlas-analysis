import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_CHANNEL
          ? { channel: process.env.PLAYWRIGHT_CHANNEL }
          : process.platform === "win32" && !process.env.CI
          ? { channel: "msedge" }
          : {}),
      },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL_APP: process.env.DATABASE_URL_APP || "postgresql://atlas_app@localhost:5432/atlas_analytics_test",
      DATABASE_URL_OPS: process.env.DATABASE_URL_OPS || "postgresql://atlas_ops@localhost:5432/atlas_analytics_test",
      AUTH_SECRET: process.env.AUTH_SECRET || "test_auth_secret_minimum_32_characters_long_2026",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "test_auth_secret_minimum_32_characters_long_2026",
    },
  },
});
