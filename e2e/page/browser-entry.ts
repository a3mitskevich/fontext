import type { BrowserCall, CallResult } from "../manifest";
import type * as BrowserEntryModule from "fontext/browser";
import type { Check } from "./checks";
import { fetchBytes } from "./fetch";

type BrowserEntry = typeof BrowserEntryModule;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function invoke(
  entry: BrowserEntry,
  data: Uint8Array,
  { call }: BrowserCall,
): Promise<CallResult> {
  try {
    if (call.name === "findLigaturesByRaws") {
      return { value: await entry.findLigaturesByRaws(data, call.raws) };
    }
    const font = await entry.createFont(data);
    if (call.name === "findMetaByLigatures") {
      return { value: entry.findMetaByLigatures(font, call.ligatures) };
    }
    if (call.name === "findMetaByCodePoints") {
      return { value: entry.findMetaByCodePoints(font, call.codePoints) };
    }
    return { value: { codePoints: font.codePoints.length } };
  } catch (error) {
    return { error: messageOf(error) };
  }
}

const preview = (result: CallResult): string => JSON.stringify(result).slice(0, 300);

/** Runs `fontext/browser` in this browser and compares each result with the one from Node. */
export async function runBrowserEntry(calls: BrowserCall[]): Promise<Check[]> {
  let entry: BrowserEntry;
  try {
    entry = await import("fontext/browser");
  } catch (error) {
    return [{ name: "fontext/browser loads", passed: false, detail: messageOf(error) }];
  }
  const checks: Check[] = [{ name: "fontext/browser loads", passed: true, detail: "" }];
  for (const call of calls) {
    checks.push(await callCheck(entry, call));
  }
  return checks;
}

async function callCheck(entry: BrowserEntry, call: BrowserCall): Promise<Check> {
  const name = `browser entry ${call.label}`;
  let data: Uint8Array;
  try {
    data = new Uint8Array(await fetchBytes(call.input));
  } catch (error) {
    return { name, passed: false, detail: messageOf(error) };
  }
  const actual = await invoke(entry, data, call);
  const passed = JSON.stringify(actual) === JSON.stringify(call.expected);
  return {
    name,
    passed,
    detail: passed ? "same as Node" : `got ${preview(actual)}, Node gave ${preview(call.expected)}`,
  };
}
