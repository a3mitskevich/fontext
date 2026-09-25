import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export const PORT = 4178;

// The page imports the built browser entry, the way a bundling user of the package would
export default defineConfig({
  root: path("page"),
  // No fallback to index.html: a font the generator didn't write must answer 404
  appType: "mpa",
  resolve: { alias: { "fontext/browser": path("../dist/browser.js") } },
  build: { outDir: path(".output"), emptyOutDir: true },
  preview: { port: PORT, strictPort: true },
});
