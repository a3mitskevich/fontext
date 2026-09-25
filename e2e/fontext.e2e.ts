import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { BROWSER_ENTRY_CASE, type Manifest, type PageResults } from "./manifest";

const manifest = JSON.parse(
  readFileSync(new URL("page/public/generated/manifest.json", import.meta.url), "utf8"),
) as Manifest;

const cases = [
  ...manifest.fontCases.map(({ id, title }) => ({ id, title })),
  { id: BROWSER_ENTRY_CASE, title: "Browser entry: fontext/browser gives what it gives in Node" },
];

for (const { id, title } of cases) {
  test(title, async ({ page }, testInfo) => {
    await page.goto(`/?case=${id}`);
    const handle = await page.waitForFunction(
      () => globalThis.fontextE2E?.done && globalThis.fontextE2E,
    );
    const results = (await handle.jsonValue()) as PageResults;

    const checks = results.cases.flatMap((result) => result.checks);
    const failures = checks
      .filter((check) => !check.passed)
      .map((check) => `${check.name}: ${check.detail}`);
    if (failures.length > 0) {
      await testInfo.attach("report", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    }

    expect(results.cases.map((result) => result.id)).toStrictEqual([id]);
    expect(checks.length).toBeGreaterThan(0);
    expect(failures).toStrictEqual([]);
  });
}
