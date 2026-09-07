import { defineConfig } from "@playwright/test";

// Set E2E_EXTERNAL_SERVICES=1 to exercise an existing web/API/PostgreSQL stack.
const external = process.env.E2E_EXTERNAL_SERVICES === "1";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  workers: 1,
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          chromiumSandbox: true,
        }
      : {},
  },
  webServer: external
    ? undefined
    : [
        {
          command: "pnpm --filter api build && node e2e/api-harness.mjs",
          url: "http://localhost:3101",
          timeout: 120000,
        },
        {
          command: "pnpm dev --port 3100",
          url: "http://localhost:3100",
          env: { NEXT_PUBLIC_API_URL: "http://localhost:3101" },
          timeout: 120000,
        },
      ],
});
