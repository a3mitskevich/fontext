import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["lcov", "text"],
      include: ["src/**"],
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
