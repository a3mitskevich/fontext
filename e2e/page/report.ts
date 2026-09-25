import type { Check } from "./checks";
import { diffImage } from "./raster";

const THUMBNAIL_HEIGHT = 96;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function thumbnail(source: HTMLCanvasElement, caption: string): HTMLElement {
  const figure = element("figure", "thumb");
  const canvas = element("canvas", "");
  canvas.height = THUMBNAIL_HEIGHT;
  canvas.width = Math.ceil((source.width / source.height) * THUMBNAIL_HEIGHT);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  figure.append(canvas, element("figcaption", "", caption));
  return figure;
}

function checkRow(check: Check, showDrawings: boolean): HTMLElement {
  const row = element("li", check.passed ? "check pass" : "check fail");
  row.append(
    element("span", "mark", check.passed ? "pass" : "FAIL"),
    element("span", "name", check.name),
  );
  if (check.detail) {
    row.append(element("span", "detail", check.detail));
  }
  if (check.comparison && (showDrawings || !check.passed)) {
    const drawings = element("div", "drawings");
    drawings.append(
      thumbnail(check.comparison.reference.canvas, "source"),
      thumbnail(check.comparison.output.canvas, "output"),
      thumbnail(diffImage(check.comparison), "diff"),
    );
    row.append(drawings);
  }
  return row;
}

/** Drawings are shown for the TTF and SVG shape checks and for every failure. */
const showsDrawings = (check: Check): boolean =>
  check.name.startsWith("ttf shape") || check.name.startsWith("svg glyph");

export function renderCase(
  container: HTMLElement,
  title: string,
  subtitle: string,
  checks: Check[],
): void {
  const failed = checks.filter((check) => !check.passed).length;
  const section = element("section", failed > 0 ? "case failed" : "case passed");
  const header = element("header", "case-header");
  header.append(
    element("h2", "", title),
    element(
      "span",
      "badge",
      failed > 0 ? `${failed} of ${checks.length} failed` : `${checks.length} passed`,
    ),
  );
  const details = element("details", "");
  details.open = failed > 0;
  details.append(element("summary", "", subtitle));
  const list = element("ul", "checks");
  list.append(...checks.map((check) => checkRow(check, showsDrawings(check))));
  details.append(list);
  section.append(header, details);
  container.append(section);
}

type RunState = "running" | "failed" | "passed";

function stateOf(failed: number, running: boolean): RunState {
  if (running) {
    return "running";
  }
  return failed > 0 ? "failed" : "passed";
}

const SUMMARIES: Record<RunState, (total: number, failed: number) => string> = {
  running: (total, failed) => `Running… ${total} checks so far, ${failed} failed`,
  failed: (total, failed) => `${failed} of ${total} checks failed`,
  passed: (total) => `All ${total} checks passed`,
};

export function renderSummary(
  container: HTMLElement,
  total: number,
  failed: number,
  running: boolean,
): void {
  const state = stateOf(failed, running);
  container.textContent = SUMMARIES[state](total, failed);
  container.dataset.state = state;
}
