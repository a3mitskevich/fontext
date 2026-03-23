/* oxlint-disable max-lines */
import fs from "fs";
import path from "path";
import readline from "readline";
import { parseArgs } from "node:util";
import extract from "./extract";
import { Format, type Formats } from "./types";

const VALID_FORMATS = Object.values(Format);

const useColor = !process.env.NO_COLOR && process.stdout.isTTY !== false;

const c = {
  reset: useColor ? "\x1b[0m" : "",
  bold: useColor ? "\x1b[1m" : "",
  dim: useColor ? "\x1b[2m" : "",
  red: useColor ? "\x1b[31m" : "",
  green: useColor ? "\x1b[32m" : "",
  yellow: useColor ? "\x1b[33m" : "",
  cyan: useColor ? "\x1b[36m" : "",
  magenta: useColor ? "\x1b[35m" : "",
};

function printHelp(): void {
  console.log(`
${c.bold}fontext${c.reset} — extract and subset fonts

${c.bold}Usage:${c.reset}
  fontext ${c.dim}[options]${c.reset}

${c.bold}Common Options:${c.reset}
  ${c.cyan}-i${c.reset}, ${c.cyan}--input${c.reset} <path>        Path to the font file ${c.dim}(required)${c.reset}
  ${c.cyan}-o${c.reset}, ${c.cyan}--output${c.reset} <dir>        Output directory ${c.dim}(default: .)${c.reset}
  ${c.cyan}-n${c.reset}, ${c.cyan}--font-name${c.reset} <name>    Name for the output font ${c.dim}(required)${c.reset}
  ${c.cyan}-f${c.reset}, ${c.cyan}--formats${c.reset} <list>      Output formats: ${c.dim}${VALID_FORMATS.join(", ")}${c.reset} ${c.dim}(default: all)${c.reset}
      ${c.cyan}--engine${c.reset} <type>        Engine: ${c.dim}icon${c.reset} ${c.dim}(default)${c.reset} | ${c.dim}subset${c.reset} | ${c.dim}convert${c.reset}
      ${c.cyan}--safari-fix${c.reset}            Fix OS/2 and hhea tables for Safari compatibility
      ${c.cyan}--dry-run${c.reset}              Run without writing files ${c.dim}(preview output only)${c.reset}
  ${c.cyan}-s${c.reset}, ${c.cyan}--silent${c.reset}              Suppress all output ${c.dim}(files still written)${c.reset}
  ${c.cyan}-j${c.reset}, ${c.cyan}--json${c.reset}                Output result as JSON ${c.dim}(for CI/scripts)${c.reset}
      ${c.cyan}--watch${c.reset}               Watch input file and re-extract on changes
      ${c.cyan}--init${c.reset}                Create .fontextrc.json via interactive wizard
  ${c.cyan}-h${c.reset}, ${c.cyan}--help${c.reset}                Show this help message
  ${c.cyan}-v${c.reset}, ${c.cyan}--version${c.reset}             Show version

${c.bold}Icon Engine:${c.reset} ${c.dim}--engine icon (default, for icon fonts)${c.reset}
  ${c.cyan}-l${c.reset}, ${c.cyan}--ligatures${c.reset} <list>    Comma-separated ligature names
  ${c.cyan}-r${c.reset}, ${c.cyan}--raws${c.reset} <list>         Comma-separated raw unicode characters
  ${c.cyan}-u${c.reset}, ${c.cyan}--unicode-ranges${c.reset} <list>  Comma-separated unicode ranges
  ${c.cyan}-w${c.reset}, ${c.cyan}--with-whitespace${c.reset}     Include whitespace glyph

${c.bold}Subset Engine:${c.reset} ${c.dim}--engine subset (for text fonts, preserves kerning)${c.reset}
  ${c.cyan}-c${c.reset}, ${c.cyan}--characters${c.reset} <text>   Characters to keep ${c.dim}(e.g. "ABCabc0-9")${c.reset}
  ${c.cyan}-l${c.reset}, ${c.cyan}--ligatures${c.reset} <list>    Ligature component characters
  ${c.cyan}-u${c.reset}, ${c.cyan}--unicode-ranges${c.reset} <list>  Comma-separated unicode ranges
  ${c.cyan}-w${c.reset}, ${c.cyan}--with-whitespace${c.reset}     Include whitespace glyph

${c.bold}Convert Engine:${c.reset} ${c.dim}--engine convert (format conversion without minification)${c.reset}
  ${c.dim}No glyph selection needed — converts the full font.${c.reset}

${c.bold}Config file:${c.reset}
  Create ${c.cyan}.fontextrc.json${c.reset} in your project root with default options.
  CLI flags override config values. Searched upward from cwd.

  ${c.dim}Example .fontextrc.json:${c.reset}
  ${c.dim}{ "input": "icons.woff2", "fontName": "my-icons",${c.reset}
  ${c.dim}  "ligatures": ["home","search"], "formats": ["woff2","ttf"] }${c.reset}

  ${c.dim}Batch mode — process multiple fonts:${c.reset}
  ${c.dim}{ "output": "./fonts", "formats": ["woff2"],${c.reset}
  ${c.dim}  "batch": [${c.reset}
  ${c.dim}    { "input": "icons.woff2", "fontName": "icons", "ligatures": ["home"] },${c.reset}
  ${c.dim}    { "input": "symbols.ttf", "fontName": "symbols", "unicodeRanges": ["U+E000-U+E100"] }${c.reset}
  ${c.dim}  ] }${c.reset}

${c.bold}Examples:${c.reset}
  ${c.dim}$${c.reset} fontext -i icons.woff2 -n my-icons -l home,search,menu -f woff2,ttf -o ./fonts
  ${c.dim}$${c.reset} fontext -i icons.ttf -n my-icons -r "" -f woff2
  ${c.dim}$${c.reset} fontext -i icons.ttf -n my-icons -u U+E000-U+E010 -f woff2
  ${c.dim}$${c.reset} fontext -i Roboto.ttf -n roboto-latin --engine subset -c "ABCabc" -f woff2
  ${c.dim}$${c.reset} fontext -i Roboto.ttf -n roboto-cyrillic --engine subset -u U+0400-U+04FF -f woff2
  ${c.dim}$${c.reset} fontext -i Roboto.ttf -n roboto --engine convert -f woff2,ttf
  ${c.dim}$${c.reset} fontext ${c.dim}# uses .fontextrc.json${c.reset}
`);
}

function printVersion(): void {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
  console.log(pkg.version);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function savingColor(saving: number): string {
  if (saving >= 90) {
    return c.green;
  }
  if (saving >= 50) {
    return c.yellow;
  }
  return c.red;
}

function savingBar(saving: number): string {
  const width = 20;
  const filled = Math.round((saving / 100) * width);
  const empty = width - filled;
  const color = savingColor(saving);
  return `${color}${"█".repeat(filled)}${c.dim}${"░".repeat(empty)}${c.reset}`;
}

function printError(msg: string): void {
  console.error(`${c.red}${c.bold}error${c.reset}${c.red}: ${msg}${c.reset}`);
}

function printWarning(msg: string): void {
  console.warn(`${c.yellow}${c.bold}warning${c.reset}${c.yellow}: ${msg}${c.reset}`);
}

function createSpinner(text: string): { stop: () => void } {
  if (!useColor || !process.stderr.isTTY) {
    return { stop: () => {} };
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const interval = setInterval(() => {
    process.stderr.write(
      `\r${c.cyan}${frames[i++ % frames.length]}${c.reset} ${c.dim}${text}${c.reset}`,
    );
  }, 80);
  return {
    stop: () => {
      clearInterval(interval);
      process.stderr.write("\r\x1b[K");
    },
  };
}

interface ConfigEntry {
  input?: string;
  output?: string;
  fontName?: string;
  ligatures?: string[];
  raws?: string[];
  unicodeRanges?: string[];
  characters?: string;
  engine?: string;
  formats?: string[];
  withWhitespace?: boolean;
  safariFix?: boolean;
  dryRun?: boolean;
  silent?: boolean;
}

interface ConfigFile extends ConfigEntry {
  batch?: ConfigEntry[];
}

function findConfig(): ConfigFile | null {
  let dir = process.cwd();
  while (true) {
    const configPath = path.join(dir, ".fontextrc.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

class Prompter {
  private lines: string[] = [];
  private lineResolvers: ((line: string) => void)[] = [];
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
    this.rl.on("line", (line) => {
      const resolver = this.lineResolvers.shift();
      if (resolver) {
        resolver(line);
      } else {
        this.lines.push(line);
      }
    });
  }

  private nextLine(): Promise<string> {
    const buffered = this.lines.shift();
    if (buffered !== undefined) {
      return Promise.resolve(buffered);
    }
    return new Promise((resolve) => {
      this.lineResolvers.push(resolve);
    });
  }

  async ask(question: string, defaultValue?: string): Promise<string> {
    const suffix = defaultValue ? ` ${c.dim}(${defaultValue})${c.reset}` : "";
    process.stdout.write(`  ${c.cyan}?${c.reset} ${question}${suffix}: `);
    const answer = await this.nextLine();
    return answer.trim() || defaultValue || "";
  }

  close(): void {
    this.rl.close();
  }
}

async function runInit(): Promise<void> {
  const configPath = path.resolve(".fontextrc.json");
  const prompter = new Prompter();

  try {
    if (fs.existsSync(configPath)) {
      const overwrite = await prompter.ask(".fontextrc.json already exists. Overwrite? (y/N)", "N");
      if (overwrite.toLowerCase() !== "y") {
        console.log(`  ${c.dim}Aborted.${c.reset}`);
        return;
      }
    }

    console.log();
    console.log(`  ${c.bold}fontext init${c.reset}`);
    console.log();

    const input = await prompter.ask("Path to font file", "font.woff2");
    const defaultName = path.basename(input, path.extname(input));
    const fontName = await prompter.ask("Output font name", defaultName);

    const engineChoice = await prompter.ask(
      `Engine — 1) icon ${c.dim}(default)${c.reset}  2) subset  3) convert`,
      "1",
    );
    const engineMap: Record<string, string> = { "1": "icon", "2": "subset", "3": "convert" };
    const engine = engineMap[engineChoice] ?? "icon";

    const formatsChoice = await prompter.ask(
      `Formats — 1) woff2,ttf ${c.dim}(default)${c.reset}  2) all  3) custom`,
      "1",
    );
    let formats: string[];
    if (formatsChoice === "2") {
      formats = [...VALID_FORMATS];
    } else if (formatsChoice === "3") {
      const custom = await prompter.ask(`Formats (${VALID_FORMATS.join(", ")})`, "woff2,ttf");
      formats = custom.split(",").map((f) => f.trim());
    } else {
      formats = ["woff2", "ttf"];
    }

    const config: Record<string, unknown> = { input, fontName, engine, formats };

    if (engine === "icon") {
      config.ligatures = ["home", "search"];
    } else if (engine === "subset") {
      config.characters = "ABCabc0123";
    }

    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    console.log();
    console.log(`  ${c.green}✓${c.reset} Created ${c.cyan}.fontextrc.json${c.reset}`);
    console.log();
  } finally {
    prompter.close();
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o", default: "." },
      "font-name": { type: "string", short: "n" },
      ligatures: { type: "string", short: "l" },
      raws: { type: "string", short: "r" },
      "unicode-ranges": { type: "string", short: "u" },
      characters: { type: "string", short: "c" },
      engine: { type: "string" },
      formats: { type: "string", short: "f" },
      "with-whitespace": { type: "boolean", short: "w", default: false },
      "safari-fix": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      silent: { type: "boolean", short: "s", default: false },
      json: { type: "boolean", short: "j", default: false },
      watch: { type: "boolean", default: false },
      init: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    strict: true,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (values.version) {
    printVersion();
    process.exit(0);
  }

  if (values.init) {
    await runInit();
    process.exit(0);
  }

  const config = findConfig();
  const isJson = values.json;
  let isSilent = values.silent || (config?.silent ?? false);

  const isDryRun = values["dry-run"] || (config?.dryRun ?? false);

  if (isSilent && isJson) {
    printWarning("--silent ignored, --json takes priority");
    isSilent = false;
  }

  if (isDryRun && values.watch) {
    printWarning("--watch ignored, --dry-run takes priority");
  }

  function resolveEntry(
    entry: ConfigEntry,
    cliOverrides: boolean,
  ): {
    inputPath: string;
    outputDir: string;
    fontName: string;
    extractOpts: Parameters<typeof extract>[1];
  } {
    const input = cliOverrides ? (values.input ?? entry.input) : entry.input;
    const fontName = cliOverrides ? (values["font-name"] ?? entry.fontName) : entry.fontName;

    if (!input) {
      throw new Error("input is required");
    }
    if (!fontName) {
      throw new Error("fontName is required");
    }

    const ligatures =
      cliOverrides && values.ligatures ? values.ligatures.split(",") : (entry.ligatures ?? []);
    const raws = cliOverrides && values.raws ? values.raws.split(",") : (entry.raws ?? []);
    const unicodeRanges =
      cliOverrides && values["unicode-ranges"]
        ? values["unicode-ranges"].split(",")
        : (entry.unicodeRanges ?? []);
    const characters = cliOverrides ? (values.characters ?? entry.characters) : entry.characters;
    const engine = (cliOverrides ? (values.engine ?? entry.engine) : entry.engine) as
      | "icon"
      | "subset"
      | "convert"
      | undefined;

    if (engine !== "convert") {
      const hasSelection =
        ligatures.length > 0 ||
        raws.length > 0 ||
        unicodeRanges.length > 0 ||
        (characters !== undefined && characters.length > 0);

      if (!hasSelection) {
        throw new Error(
          "at least one of ligatures, raws, unicodeRanges, or characters is required",
        );
      }
    }

    const inputPath = path.resolve(input);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`file not found: ${inputPath}`);
    }

    const outputDir = path.resolve(
      cliOverrides && values.output !== "." ? (values.output ?? ".") : (entry.output ?? "."),
    );
    let formats: Formats[] | undefined;
    if (cliOverrides && values.formats) {
      formats = values.formats.split(",") as Formats[];
    } else if (entry.formats) {
      formats = entry.formats as Formats[];
    }
    const withWhitespace =
      (cliOverrides && values["with-whitespace"]) || (entry.withWhitespace ?? false);
    const safariFix = (cliOverrides && values["safari-fix"]) || (entry.safariFix ?? false);
    const silent = (cliOverrides && values.silent) || (entry.silent ?? false);

    return {
      inputPath,
      outputDir,
      fontName,
      extractOpts: {
        fontName,
        ligatures,
        raws,
        unicodeRanges,
        characters,
        engine,
        formats,
        withWhitespace,
        safariFix,
        silent,
      },
    };
  }

  async function runOne(
    inputPath: string,
    outputDir: string,
    fontName: string,
    extractOpts: Parameters<typeof extract>[1],
  ): Promise<void> {
    const content = fs.readFileSync(inputPath);
    const spinner =
      !isJson && !isSilent ? createSpinner(`Extracting ${fontName}...`) : { stop: () => {} };
    const result = await extract(content, extractOpts);
    spinner.stop();

    if (!isDryRun) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const files: { path: string; format: string; size: number; saving: number }[] = [];

    for (const format of VALID_FORMATS) {
      const buffer = result[format];
      if (buffer) {
        const filePath = path.join(outputDir, `${fontName}.${format}`);
        if (!isDryRun) {
          fs.writeFileSync(filePath, buffer);
        }
        const formatReport = result.report.formats[format];
        files.push({
          path: filePath,
          format,
          size: buffer.length,
          saving: formatReport?.saving ?? 0,
        });
      }
    }

    if (isJson) {
      return void jsonResults.push({
        fontName,
        glyphs: result.meta.length,
        originalSize: result.report.originalSize,
        files: files.map(({ path: p, format, size, saving }) => ({
          path: p,
          format,
          size,
          saving,
        })),
        meta: result.meta.map(({ name, unicode }) => ({ name, unicode })),
      });
    }

    if (isSilent) {
      return;
    }

    console.log();
    console.log(
      `  ${c.bold}${fontName}${c.reset}  ${c.dim}${result.meta.length} glyph(s) extracted from ${formatBytes(result.report.originalSize)}${c.reset}`,
    );
    console.log();

    const maxPathLen = Math.max(...files.map((f) => f.path.length));
    const maxSizeLen = Math.max(...files.map((f) => formatBytes(f.size).length));

    for (const { path: filePath, size, saving } of files) {
      const paddedPath = filePath.padEnd(maxPathLen);
      const paddedSize = formatBytes(size).padStart(maxSizeLen);
      console.log(
        `  ${c.green}✓${c.reset} ${c.cyan}${paddedPath}${c.reset}  ${c.dim}${paddedSize}${c.reset}  ${savingBar(saving)} ${savingColor(saving)}${saving}%${c.reset}`,
      );
    }

    console.log();
  }

  const jsonResults: unknown[] = [];

  // Batch mode: config has batch array
  if (config?.batch && config.batch.length > 0 && !values.input) {
    for (const entry of config.batch) {
      const merged = { ...config, ...entry };
      const { inputPath, outputDir, fontName, extractOpts } = resolveEntry(merged, false);
      await runOne(inputPath, outputDir, fontName, extractOpts);
    }
  } else {
    // Single mode: CLI flags + config fallback
    const entry = resolveEntry(config ?? {}, true);
    await runOne(entry.inputPath, entry.outputDir, entry.fontName, entry.extractOpts);

    if (values.watch && !isDryRun) {
      if (!isSilent) {
        console.log(`  ${c.dim}Watching ${entry.inputPath} for changes...${c.reset}`);
      }
      let debounce: ReturnType<typeof setTimeout> | null = null;
      const watcher = fs.watch(entry.inputPath, () => {
        if (debounce) {
          clearTimeout(debounce);
        }
        debounce = setTimeout(async () => {
          try {
            await runOne(entry.inputPath, entry.outputDir, entry.fontName, entry.extractOpts);
            if (!isSilent) {
              console.log(`  ${c.dim}Watching ${entry.inputPath} for changes...${c.reset}`);
            }
          } catch (err: unknown) {
            printError((err as Error).message);
          }
        }, 200);
      });
      watcher.on("error", (err) => {
        printError(`Watch failed: ${err.message}`);
        process.exit(1);
      });
    }
  }

  if (isJson) {
    console.log(JSON.stringify(jsonResults.length === 1 ? jsonResults[0] : jsonResults, null, 2));
  }
}

main().catch((err: Error) => {
  printError(err.message);
  process.exit(1);
});
