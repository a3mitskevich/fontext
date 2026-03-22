import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["lcov", "text"],
    },
    server: {
      deps: {
        inline: ["ttf2woff2"],
      },
    },
  },
});
