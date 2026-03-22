import fs from "fs";
import path from "path";
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
${c.bold}fontext${c.reset} — extract glyphs from icon fonts

${c.bold}Usage:${c.reset}
  fontext ${c.dim}[options]${c.reset}

${c.bold}Options:${c.reset}
  ${c.cyan}-i${c.reset}, ${c.cyan}--input${c.reset} <path>        Path to the font file ${c.dim}(required)${c.reset}
  ${c.cyan}-o${c.reset}, ${c.cyan}--output${c.reset} <dir>        Output directory ${c.dim}(default: .)${c.reset}
  ${c.cyan}-n${c.reset}, ${c.cyan}--font-name${c.reset} <name>    Name for the output font ${c.dim}(required)${c.reset}
  ${c.cyan}-l${c.reset}, ${c.cyan}--ligatures${c.reset} <list>    Comma-separated ligature names
  ${c.cyan}-r${c.reset}, ${c.cyan}--raws${c.reset} <list>         Comma-separated raw unicode characters
  ${c.cyan}-f${c.reset}, ${c.cyan}--formats${c.reset} <list>      Output formats: ${c.dim}${VALID_FORMATS.join(", ")}${c.reset} ${c.dim}(default: all)${c.reset}
  ${c.cyan}-u${c.reset}, ${c.cyan}--unicode-ranges${c.reset} <list>  Comma-separated unicode ranges ${c.dim}(e.g. U+E000-U+E100,U+F000)${c.reset}
  ${c.cyan}-w${c.reset}, ${c.cyan}--with-whitespace${c.reset}     Include whitespace glyph
  ${c.cyan}-j${c.reset}, ${c.cyan}--json${c.reset}                Output result as JSON ${c.dim}(for CI/scripts)${c.reset}
      ${c.cyan}--watch${c.reset}               Watch input file and re-extract on changes
  ${c.cyan}-h${c.reset}, ${c.cyan}--help${c.reset}                Show this help message
  ${c.cyan}-v${c.reset}, ${c.cyan}--version${c.reset}             Show version

${c.bold}Config file:${c.reset}
  Create ${c.cyan}.fontextrc.json${c.reset} in your project root with default options.
  CLI flags override config values. Searched upward from cwd.

  ${c.dim}Example .fontextrc.json:${c.reset}
  ${c.dim}{ "input": "icons.woff2", "fontName": "my-icons",${c.reset}
  ${c.dim}  "ligatures": ["home","search"], "formats": ["woff2","ttf"] }${c.reset}

${c.bold}Examples:${c.reset}
  ${c.dim}$${c.reset} fontext -i icons.woff2 -n my-icons -l home,search,menu -f woff2,ttf -o ./fonts
  ${c.dim}$${c.reset} fontext -i icons.ttf -n my-icons -r "" -f woff2
  ${c.dim}$${c.reset} fontext -i icons.ttf -n my-icons -u U+E000-U+E010 -f woff2
  ${c.dim}$${c.reset} fontext ${c.dim}# uses .fontextrc.json${c.reset}
`);
}

function printVersion(): void {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
  console.log(pkg.version);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function savingColor(saving: number): string {
  if (saving >= 90) return c.green;
  if (saving >= 50) return c.yellow;
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

interface ConfigFile {
  input?: string;
  output?: string;
  fontName?: string;
  ligatures?: string[];
  raws?: string[];
  unicodeRanges?: string[];
  formats?: string[];
  withWhitespace?: boolean;
}

function findConfig(): ConfigFile | null {
  let dir = process.cwd();
  while (true) {
    const configPath = path.join(dir, ".fontextrc.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
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
      formats: { type: "string", short: "f" },
      "with-whitespace": { type: "boolean", short: "w", default: false },
      json: { type: "boolean", short: "j", default: false },
      watch: { type: "boolean", default: false },
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

  const config = findConfig();

  const input = values.input ?? config?.input;
  const fontName = values["font-name"] ?? config?.fontName;
  const ligaturesRaw = values.ligatures;
  const rawsRaw = values.raws;
  const unicodeRangesRaw = values["unicode-ranges"];

  if (!input) {
    printError("--input is required");
    printHelp();
    process.exit(1);
  }

  if (!fontName) {
    printError("--font-name is required");
    printHelp();
    process.exit(1);
  }

  const ligatures = ligaturesRaw ? ligaturesRaw.split(",") : (config?.ligatures ?? []);
  const raws = rawsRaw ? rawsRaw.split(",") : (config?.raws ?? []);
  const unicodeRanges = unicodeRangesRaw
    ? unicodeRangesRaw.split(",")
    : (config?.unicodeRanges ?? []);

  if (ligatures.length === 0 && raws.length === 0 && unicodeRanges.length === 0) {
    printError("at least one of --ligatures, --raws, or --unicode-ranges is required");
    printHelp();
    process.exit(1);
  }

  const inputPath = path.resolve(input);
  if (!fs.existsSync(inputPath)) {
    printError(`file not found: ${inputPath}`);
    process.exit(1);
  }

  const outputDir = path.resolve(values.output !== "." ? values.output! : (config?.output ?? "."));
  const formats = values.formats
    ? (values.formats.split(",") as Formats[])
    : config?.formats
      ? (config.formats as Formats[])
      : undefined;
  const withWhitespace = values["with-whitespace"] || (config?.withWhitespace ?? false);

  const extractOpts = { fontName, ligatures, raws, unicodeRanges, formats, withWhitespace };
  const isJson = values.json;

  async function runExtraction(): Promise<void> {
    const content = fs.readFileSync(inputPath);
    const spinner = !isJson ? createSpinner("Extracting glyphs...") : { stop: () => {} };
    const result = await extract(content, extractOpts);
    spinner.stop();

    fs.mkdirSync(outputDir, { recursive: true });

    const files: Array<{ path: string; format: string; size: number; saving: number }> = [];

    for (const format of VALID_FORMATS) {
      const buffer = result[format];
      if (buffer) {
        const filePath = path.join(outputDir, `${fontName}.${format}`);
        fs.writeFileSync(filePath, buffer);
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
      const jsonOutput = {
        fontName,
        glyphs: result.meta.length,
        originalSize: result.report.originalSize,
        files: files.map(({ path: filePath, format, size, saving }) => ({
          path: filePath,
          format,
          size,
          saving,
        })),
        meta: result.meta.map(({ name, unicode }) => ({ name, unicode })),
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
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
  }

  await runExtraction();

  if (values.watch) {
    console.log(`  ${c.dim}Watching ${inputPath} for changes...${c.reset}`);
    let debounce: ReturnType<typeof setTimeout> | null = null;
    fs.watch(inputPath, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(async () => {
        try {
          await runExtraction();
          console.log(`  ${c.dim}Watching ${inputPath} for changes...${c.reset}`);
        } catch (err: any) {
          printError(err.message);
        }
      }, 200);
    });
  }
}

main().catch((err: Error) => {
  printError(err.message);
  process.exit(1);
});
