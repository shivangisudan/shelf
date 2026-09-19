import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // The catalog lives in localStorage while Supabase is unreachable, so tests
  // run one at a time against one dev server rather than fighting over it.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    // A mid-range Android phone, which is what the merchants are on.
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    launchOptions: {
      // A synthetic microphone, so the recorder can be driven for real.
      // Permission is still granted per test, leaving the denial path testable.
      args: ["--use-fake-device-for-media-stream"],
    },
  },
  webServer: {
    // A production build rather than `next dev`: it is what actually ships,
    // and `next dev` refuses to start when another dev server is already
    // running on the machine.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
