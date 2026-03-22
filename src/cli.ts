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
  ${c.cyan}-w${c.reset}, ${c.cyan}--with-whitespace${c.reset}     Include whitespace glyph
  ${c.cyan}-h${c.reset}, ${c.cyan}--help${c.reset}                Show this help message
  ${c.cyan}-v${c.reset}, ${c.cyan}--version${c.reset}             Show version

${c.bold}Examples:${c.reset}
  ${c.dim}$${c.reset} fontext -i icons.woff2 -n my-icons -l home,search,menu -f woff2,ttf -o ./fonts
  ${c.dim}$${c.reset} fontext -i icons.ttf -n my-icons -r "" -f woff2
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

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o", default: "." },
      "font-name": { type: "string", short: "n" },
      ligatures: { type: "string", short: "l" },
      raws: { type: "string", short: "r" },
      formats: { type: "string", short: "f" },
      "with-whitespace": { type: "boolean", short: "w", default: false },
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

  if (!values.input) {
    printError("--input is required");
    printHelp();
    process.exit(1);
  }

  if (!values["font-name"]) {
    printError("--font-name is required");
    printHelp();
    process.exit(1);
  }

  if (!values.ligatures && !values.raws) {
    printError("at least one of --ligatures or --raws is required");
    printHelp();
    process.exit(1);
  }

  const inputPath = path.resolve(values.input);
  if (!fs.existsSync(inputPath)) {
    printError(`file not found: ${inputPath}`);
    process.exit(1);
  }

  const outputDir = path.resolve(values.output!);
  const fontName = values["font-name"];
  const ligatures = values.ligatures ? values.ligatures.split(",") : [];
  const raws = values.raws ? values.raws.split(",") : [];
  const formats = values.formats ? (values.formats.split(",") as Formats[]) : undefined;
  const withWhitespace = values["with-whitespace"];

  const content = fs.readFileSync(inputPath);
  const result = await extract(content, {
    fontName,
    ligatures,
    raws,
    formats,
    withWhitespace,
  });

  fs.mkdirSync(outputDir, { recursive: true });

  console.log();
  console.log(
    `  ${c.bold}${fontName}${c.reset}  ${c.dim}${result.meta.length} glyph(s) extracted from ${formatBytes(result.report.originalSize)}${c.reset}`,
  );
  console.log();

  const outputs: Array<{ filePath: string; size: string; saving: number }> = [];

  for (const format of VALID_FORMATS) {
    const buffer = result[format];
    if (buffer) {
      const filePath = path.join(outputDir, `${fontName}.${format}`);
      fs.writeFileSync(filePath, buffer);
      const formatReport = result.report.formats[format];
      outputs.push({
        filePath,
        size: formatBytes(buffer.length),
        saving: formatReport?.saving ?? 0,
      });
    }
  }

  const maxPathLen = Math.max(...outputs.map((o) => o.filePath.length));
  const maxSizeLen = Math.max(...outputs.map((o) => o.size.length));

  for (const { filePath, size, saving } of outputs) {
    const paddedPath = filePath.padEnd(maxPathLen);
    const paddedSize = size.padStart(maxSizeLen);
    console.log(
      `  ${c.green}✓${c.reset} ${c.cyan}${paddedPath}${c.reset}  ${c.dim}${paddedSize}${c.reset}  ${savingBar(saving)} ${savingColor(saving)}${saving}%${c.reset}`,
    );
  }

  console.log();
}

main().catch((err: Error) => {
  printError(err.message);
  process.exit(1);
});
