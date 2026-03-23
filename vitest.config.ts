import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
    server: {
      deps: {
        inline: ["ttf2woff2"],
      },
    },
  },
});
