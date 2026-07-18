import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  retries: 2,
  testDir: "./tests/e2e",
  timeout: 120_000,
  use: {
    baseURL: "https://joycornerapp-c784d.web.app",
    trace: "retain-on-failure",
  },
  workers: 1,
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
