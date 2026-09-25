/**
 * Runs the browser checks in the Safari installed on this Mac through safaridriver, which ships
 * with macOS. Playwright can't drive Safari itself, only its own WebKit build.
 * Run `npm run test:e2e:safari` (it builds the page first); pass case ids to run only those.
 * Once per Mac: Safari > Settings > Advanced > "Show features for web developers", then
 * Settings > Developer > "Allow remote automation".
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

const MANIFEST = new URL("page/public/generated/manifest.json", import.meta.url);
const VITE_CONFIG = new URL("vite.config.ts", import.meta.url);
const BROWSER_ENTRY_CASE = "browser-entry";
const DRIVER_PORT = 4445;
const DRIVER = `http://localhost:${DRIVER_PORT}`;
const POLL_MS = 250;
const CASE_TIMEOUT_MS = 120_000;
const DRIVER_START_TIMEOUT_MS = 10_000;

const SETUP_HELP = `Safari refused automation. Once per Mac:
  1. Safari > Settings > Advanced > "Show features for web developers"
  2. Safari > Settings > Developer > "Allow remote automation"
  (or run: safaridriver --enable, which asks for an admin password)`;

async function webdriver(method, path, body) {
  const init = { method, headers: { "Content-Type": "application/json" } };
  const response = await fetch(
    `${DRIVER}${path}`,
    body === undefined ? init : { ...init, body: JSON.stringify(body) },
  );
  const { value } = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${value?.message ?? response.status}`);
  }
  return value;
}

async function startDriver() {
  const driver = spawn("/usr/bin/safaridriver", ["--port", String(DRIVER_PORT)], {
    stdio: "ignore",
  });
  const deadline = Date.now() + DRIVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await webdriver("GET", "/status");
      return driver;
    } catch {
      await sleep(POLL_MS);
    }
  }
  driver.kill();
  throw new Error("safaridriver did not start");
}

async function createSession() {
  try {
    const { sessionId, capabilities } = await webdriver("POST", "/session", {
      capabilities: { alwaysMatch: { browserName: "safari" } },
    });
    return { sessionId, version: capabilities.browserVersion };
  } catch (error) {
    throw new Error(`${error.message}\n\n${SETUP_HELP}`, { cause: error });
  }
}

/** Opens the page for one case and waits for the results it exposes as `fontextE2E`. */
async function runCase(sessionId, baseUrl, id) {
  await webdriver("POST", `/session/${sessionId}/url`, { url: `${baseUrl}?case=${id}` });
  const deadline = Date.now() + CASE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const results = await webdriver("POST", `/session/${sessionId}/execute/sync`, {
      script: "return globalThis.fontextE2E?.done ? globalThis.fontextE2E : null;",
      args: [],
    });
    if (results) {
      return results.cases.flatMap((result) => result.checks);
    }
    await sleep(POLL_MS);
  }
  return [
    { name: "page finishes", passed: false, detail: `no results after ${CASE_TIMEOUT_MS}ms` },
  ];
}

function report(title, checks) {
  const failures = checks.filter((check) => !check.passed);
  if (checks.length === 0) {
    failures.push({ name: "page runs checks", detail: "the page reported no checks" });
  }
  console.log(`${failures.length === 0 ? "✓" : "✗"} ${title} (${checks.length} checks)`);
  for (const { name, detail } of failures) {
    console.log(`    ${name}: ${detail}`);
  }
  return failures.length;
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const requested = process.argv.slice(2);
const cases = [
  ...manifest.fontCases.map(({ id, title }) => ({ id, title })),
  { id: BROWSER_ENTRY_CASE, title: "Browser entry: fontext/browser gives what it gives in Node" },
].filter(({ id }) => requested.length === 0 || requested.includes(id));

const server = await preview({ configFile: fileURLToPath(VITE_CONFIG), logLevel: "warn" });
const [baseUrl] = server.resolvedUrls.local;
const driver = await startDriver();
let failed = 0;
try {
  const { sessionId, version } = await createSession();
  console.log(`Safari ${version}, ${baseUrl}`);
  try {
    for (const { id, title } of cases) {
      failed += report(title, await runCase(sessionId, baseUrl, id)) > 0 ? 1 : 0;
    }
  } finally {
    await webdriver("DELETE", `/session/${sessionId}`);
  }
  console.log(`\n${cases.length - failed} passed, ${failed} failed`);
} catch (error) {
  console.error(error.message);
  failed = 1;
} finally {
  driver.kill();
  await server.close();
}
process.exitCode = failed > 0 ? 1 : 0;
