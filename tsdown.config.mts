import { defineConfig, type UserConfig } from "tsdown";

// Keep the file names published by earlier releases: CJS as .js, ESM as .mjs
const outExtensions: UserConfig["outExtensions"] = ({ format }) =>
  format === "cjs" ? { js: ".js", dts: ".d.ts" } : { js: ".mjs", dts: ".d.mts" };

const shared: UserConfig = {
  tsconfig: "./tsconfig.lib.json",
  outExtensions,
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    // CJS consumers keep `require("fontext").extract` and `.default` side by side
    outputOptions: { exports: "named" },
  },
  {
    ...shared,
    entry: ["src/browser.ts"],
    format: ["esm"],
    platform: "neutral",
    dts: true,
    clean: false,
  },
  {
    ...shared,
    entry: ["src/cli.ts"],
    format: ["cjs"],
    banner: { js: "#!/usr/bin/env node" },
    dts: false,
    clean: false,
  },
]);
