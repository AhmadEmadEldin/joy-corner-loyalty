import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  testDir: "./tests/e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:8081",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node --max-old-space-size=4096 ./node_modules/webpack/bin/webpack.js --config webpack.config.ts --mode production && tsx ./scripts/write_standalone_html.ts && node ./scripts/static_server.cjs dist 8081",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:8081",
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
