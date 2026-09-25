import { defineConfig, devices } from "@playwright/test";
import { PORT } from "./e2e/vite.config";

const isCI = Boolean(process.env.CI);

// Run through `npm run test:e2e`, which builds the package, the fonts and the page first
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  // Every check of a case runs inside one page; drawing and comparing takes a few seconds
  timeout: 120_000,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run e2e:serve",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
  },
});
