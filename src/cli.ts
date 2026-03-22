import fs from "fs";
import path from "path";
import { parseArgs } from "node:util";
import extract from "./extract";
import { Format, type Formats } from "./types";

const VALID_FORMATS = Object.values(Format);

function printHelp(): void {
  console.log(`
Usage: fontext [options]

Options:
  -i, --input <path>        Path to the font file (required)
  -o, --output <dir>        Output directory (default: current directory)
  -n, --font-name <name>    Name for the output font (required)
  -l, --ligatures <list>    Comma-separated ligature names
  -r, --raws <list>         Comma-separated raw unicode characters
  -f, --formats <list>      Comma-separated output formats: ${VALID_FORMATS.join(", ")} (default: all)
  -w, --with-whitespace     Include whitespace glyph in the output
  -h, --help                Show this help message
  -v, --version             Show version

Examples:
  fontext -i icons.woff2 -n my-icons -l home,search,menu -f woff2,ttf -o ./fonts
  fontext -i icons.ttf -n my-icons -r "" -f woff2
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
    console.error("Error: --input is required");
    printHelp();
    process.exit(1);
  }

  if (!values["font-name"]) {
    console.error("Error: --font-name is required");
    printHelp();
    process.exit(1);
  }

  if (!values.ligatures && !values.raws) {
    console.error("Error: at least one of --ligatures or --raws is required");
    printHelp();
    process.exit(1);
  }

  const inputPath = path.resolve(values.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: file not found: ${inputPath}`);
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

  const written: string[] = [];
  for (const format of VALID_FORMATS) {
    const buffer = result[format];
    if (buffer) {
      const filePath = path.join(outputDir, `${fontName}.${format}`);
      fs.writeFileSync(filePath, buffer);
      const formatReport = result.report.formats[format];
      const saving = formatReport ? `, saved ${formatReport.saving}%` : "";
      written.push(
        `  ${path.relative(process.cwd(), filePath)} (${formatBytes(buffer.length)}${saving})`,
      );
    }
  }

  console.log(
    `Extracted ${result.meta.length} glyph(s) from ${formatBytes(result.report.originalSize)} source:`,
  );
  written.forEach((line) => console.log(line));
}

main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
