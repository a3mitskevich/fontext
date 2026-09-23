import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests encode real fonts; with v8 coverage on shared CI runners some take 3-6 s
    testTimeout: 15_000,
    coverage: {
      reporter: ["lcov", "text"],
      include: ["src/**"],
      // TODO: cli.ts tested via execFileSync (child process), v8 can't instrument it
      // Consider refactoring CLI to export functions for direct unit testing
      exclude: ["src/cli.ts"],
      thresholds: {
        statements: 85,
        branches: 70,
        functions: 90,
        lines: 85,
      },
    },
  },
});
