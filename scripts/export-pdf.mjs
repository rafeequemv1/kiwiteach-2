import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const token = process.argv.find((arg) => arg.startsWith(prefix));
  if (token) return token.slice(prefix.length);

  // Support npm config style arguments:
  // npm run pdf:export --url=http://localhost:5173
  const npmConfigKey = `npm_config_${name.replace(/-/g, "_")}`;
  const fromNpmConfig = process.env[npmConfigKey];
  return fromNpmConfig ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const helpText = `
Controlled PDF export using Chromium printToPDF (Playwright).

Usage:
  npm run pdf:export -- --url=http://localhost:5173/result --out=./artifacts/paper.pdf

Optional flags:
  --url=<url>                      Page URL to render.
  --out=<path>                     Output PDF file path. Default: ./artifacts/quiz-paper.pdf
  --wait-for=<selector>            Wait until selector is visible before printing.
  --wait-timeout=<ms>              Wait timeout for selector/url load. Default: 45000
  --landscape                      Print in landscape mode.
  --scale=<number>                 PDF scale from 0.1 to 2. Default: 1
  --page-ranges=<range>            Chrome page ranges (example: 1-2,4).
  --header-template=<html>         Header template HTML.
  --footer-template=<html>         Footer template HTML.
  --display-header-footer          Show header/footer templates.
  --help                           Print this help.

Examples:
  npm run pdf:export -- --url=http://localhost:5173 --out=./artifacts/preview.pdf
  npm run pdf:export -- --url=http://localhost:5173 --wait-for=#printable-paper-area
`;

if (hasFlag("help")) {
  console.log(helpText.trim());
  process.exit(0);
}

const url = getArg("url");
if (!url) {
  console.error("Missing required argument: --url");
  console.error("Run with --help for usage.");
  process.exit(1);
}

const outputPath = path.resolve(
  process.cwd(),
  getArg("out", "./artifacts/quiz-paper.pdf")
);
const waitForSelector = getArg("wait-for", "#printable-paper-area");
const waitTimeout = Number(getArg("wait-timeout", "45000"));
const landscape = hasFlag("landscape");
const scale = Number(getArg("scale", "1"));
const pageRanges = getArg("page-ranges");
const displayHeaderFooter = hasFlag("display-header-footer");
const headerTemplate = getArg("header-template", "");
const footerTemplate = getArg("footer-template", "");

if (!Number.isFinite(waitTimeout) || waitTimeout < 0) {
  console.error("--wait-timeout must be a non-negative number.");
  process.exit(1);
}

if (!Number.isFinite(scale) || scale < 0.1 || scale > 2) {
  console.error("--scale must be between 0.1 and 2.");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: waitTimeout });

  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, {
      state: "visible",
      timeout: waitTimeout,
    });
  }

  await page.emulateMedia({ media: "print" });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await page.pdf({
    path: outputPath,
    printBackground: true,
    preferCSSPageSize: true,
    margin: {
      top: "0mm",
      right: "0mm",
      bottom: "0mm",
      left: "0mm",
    },
    landscape,
    scale,
    pageRanges,
    displayHeaderFooter,
    headerTemplate,
    footerTemplate,
  });

  console.log(`PDF generated: ${outputPath}`);
} finally {
  await browser.close();
}
