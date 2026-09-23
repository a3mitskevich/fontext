import { defineConfig, type UserConfig } from "tsdown";

// ESM only; with "type": "module" the output keeps plain .js / .d.ts names
const shared: UserConfig = {
  tsconfig: "./tsconfig.lib.json",
  format: "esm",
  fixedExtension: false,
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/index.ts"],
    dts: true,
    clean: true,
  },
  {
    ...shared,
    entry: ["src/browser.ts"],
    platform: "neutral",
    dts: true,
    clean: false,
  },
  {
    ...shared,
    entry: ["src/cli.ts"],
    banner: { js: "#!/usr/bin/env node" },
    dts: false,
    clean: false,
  },
]);
