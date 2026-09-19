import { readFileSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// The tests talk to the same Supabase project the app does, so they need the
// same credentials. Next loads .env.local for the app; nothing loads it here.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // No .env.local: the suite will fail loudly on the first query instead.
}

const PORT = Number(process.env.PORT ?? 3100);
// Point the suite at a deployed environment instead of a local build:
//   E2E_BASE_URL=https://shelf-mu-rose.vercel.app npx playwright test
// Note the suite empties the catalog between tests, so only aim it at an
// environment whose data you are willing to lose.
const deployedURL = process.env.E2E_BASE_URL;
const baseURL = deployedURL ?? `http://127.0.0.1:${PORT}`;

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
  // Nothing to start when testing a deployment.
  webServer: deployedURL ? undefined : {
    // A production build rather than `next dev`: it is what actually ships,
    // and `next dev` refuses to start when another dev server is already
    // running on the machine.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
