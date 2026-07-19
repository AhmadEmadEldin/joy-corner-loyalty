import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 10_000 },
  projects: [
    { name: "supabase-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "supabase-mobile", use: { ...devices["Pixel 5"] } },
  ],
  testDir: "./tests/supabase-e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:8082",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node --max-old-space-size=4096 ./node_modules/webpack/bin/webpack.js --config webpack.config.ts --mode production && tsx ./scripts/write_standalone_html.ts && node ./scripts/static_server.cjs dist 8082",
    env: {
      ...process.env,
      VITE_DATA_PROVIDER: "supabase",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_smoke_test",
      VITE_SUPABASE_URL: "https://example.supabase.co",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:8082",
  },
  workers: 1,
});
