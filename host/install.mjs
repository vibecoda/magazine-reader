#!/usr/bin/env node
/** Register a separate native host; never modifies Kotoba's installation. */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { deepseekKey } from "./deepseek.mjs";
import { CHROME_DIR, DATA_DIR, extensionId, HOST_NAME, ROOT } from "./paths.mjs";

const { values } = parseArgs({ options: {
  check: { type: "boolean" }, ocr: { type: "string" },
  "data-dir": { type: "string", default: DATA_DIR }, "hosts-dir": { type: "string", default: CHROME_DIR },
} });
const dataDir = resolve(values["data-dir"]), hostsDir = resolve(values["hosts-dir"]);
const launcher = join(dataDir, "magazine-reader-host");
const manifestPath = join(hostsDir, `${HOST_NAME}.json`);
const id = extensionId();
if (values.check) {
  console.log(`Extension ID: ${id}`);
  console.log(`Native host: ${existsSync(manifestPath) ? manifestPath : "not installed"}`);
  console.log(`Launcher: ${existsSync(launcher) ? launcher : "not installed"}`);
  console.log(`DeepSeek key: ${deepseekKey() ? "available" : "missing (environment or ~/.env2)"}`);
  if (existsSync(launcher)) {
    const match = readFileSync(launcher, "utf8").match(/^MAGAZINE_OCR_BINARY='([^']+)'$/m);
    console.log(`OCR: ${match && existsSync(match[1]) ? match[1] : "check launcher OCR path"}`);
  }
  process.exit(0);
}
if (process.platform !== "darwin") throw new Error("The bundled OCR and installer require macOS.");
if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Use Node 22 or newer.");
let ocr = values.ocr;
if (!ocr) {
  try { ocr = execFileSync("/usr/bin/which", ["ocr"], { encoding: "utf8" }).trim(); } catch { /* checked below */ }
}
if (!ocr || !existsSync(resolve(ocr))) throw new Error("OCR not found. Pass --ocr /absolute/path/to/ocr.");
ocr = resolve(ocr);
const quote = text => `'${text.replaceAll("'", "'\\''")}'`;
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
mkdirSync(hostsDir, { recursive: true });
writeFileSync(launcher, ["#!/bin/sh", `MAGAZINE_OCR_BINARY=${quote(ocr)}`, "export MAGAZINE_OCR_BINARY",
  `exec ${quote(process.execPath)} ${quote(join(ROOT, "host", "host.mjs"))} "$@"`, ""].join("\n"), { mode: 0o700 });
chmodSync(launcher, 0o700);
writeFileSync(manifestPath, JSON.stringify({ name: HOST_NAME, description: "Magazine OCR and English summary",
  path: launcher, type: "stdio", allowed_origins: [`chrome-extension://${id}/`] }, null, 2) + "\n", { mode: 0o600 });
chmodSync(manifestPath, 0o600);
console.log(`Installed ${HOST_NAME} for extension ${id}.`);
console.log(`Load unpacked: ${join(ROOT, "chrome")}`);
console.log("Re-run this installer after upgrading Node or moving the repo/OCR binary.");
