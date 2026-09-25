import { BROWSER_ENTRY_CASE, type CaseResult, type Manifest, type PageResults } from "../manifest";
import { runBrowserEntry } from "./browser-entry";
import { type Check, runFontCase } from "./checks";
import { fetchJson } from "./fetch";
import { renderCase, renderSummary } from "./report";
import "./style.css";

declare global {
  // oxlint-disable-next-line no-var -- a global the Playwright spec reads needs a var declaration
  var fontextE2E: PageResults | undefined;
}

const results: PageResults = { done: false, cases: [] };
globalThis.fontextE2E = results;

const summary = document.querySelector<HTMLElement>("#summary") as HTMLElement;
const cases = document.querySelector<HTMLElement>("#cases") as HTMLElement;
document.querySelector("#agent")?.append(navigator.userAgent);

/** `?case=a,b` runs only those cases, the way the Playwright spec opens the page. */
const requested = new URLSearchParams(location.search).get("case")?.split(",");
const isRequested = (id: string): boolean => !requested || requested.includes(id);

function record(id: string, title: string, subtitle: string, checks: Check[]): void {
  results.cases.push({
    id,
    checks: checks.map(({ name, passed, detail }) => ({ name, passed, detail })),
  } satisfies CaseResult);
  renderCase(cases, title, subtitle, checks);
  const all = results.cases.flatMap((result) => result.checks);
  renderSummary(summary, all.length, all.filter((check) => !check.passed).length, true);
}

async function run(): Promise<void> {
  const manifest = (await fetchJson("generated/manifest.json")) as Manifest;
  for (const fontCase of manifest.fontCases.filter(({ id }) => isRequested(id))) {
    record(fontCase.id, fontCase.title, fontCase.option, await runFontCase(fontCase));
  }
  if (isRequested(BROWSER_ENTRY_CASE)) {
    const subtitle = "fontext/browser in this browser against the same calls in Node";
    record(
      BROWSER_ENTRY_CASE,
      "Browser entry",
      subtitle,
      await runBrowserEntry(manifest.browserCalls),
    );
  }
}

run()
  .catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    record("page", "Page error", detail, [{ name: "page runs", passed: false, detail }]);
  })
  .finally(() => {
    const all = results.cases.flatMap((result) => result.checks);
    renderSummary(summary, all.length, all.filter((check) => !check.passed).length, false);
    results.done = true;
  });
