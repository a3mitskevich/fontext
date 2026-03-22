import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    tsconfig: "./tsconfig.lib.json",
    dts: true,
    format: ["cjs", "esm"],
    shims: true,
    clean: true,
  },
  {
    entry: ["src/cli.ts"],
    tsconfig: "./tsconfig.lib.json",
    format: ["cjs"],
    shims: true,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
