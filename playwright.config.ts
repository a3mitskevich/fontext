import { defineConfig, devices } from "@playwright/test";
import { PORT } from "./e2e/vite.config";

// Run through `npm run test:e2e:chrome` or `test:e2e:firefox`, which build the package, the fonts
// and the page first. Safari runs through e2e/run-safari.mjs: Playwright can't drive it
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  // Every check of a case runs inside one page; drawing and comparing takes a few seconds
  timeout: 120_000,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    // The Google Chrome installed on this machine, not Playwright's Chromium build
    { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    // Playwright's Firefox build: it can't drive a stock Firefox
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: "npm run e2e:serve",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
});
