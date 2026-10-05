#!/usr/bin/env node
/**
 * Sets up Magazine Reader on this Mac:
 *   node host/install.mjs              build bin/ocr if needed and register the Chrome native host
 *   node host/install.mjs --set-key    store a DeepSeek API key (prompted, or piped on stdin)
 *   node host/install.mjs --remove-key delete the stored key
 *   node host/install.mjs --check      report what is installed
 *   node host/install.mjs --kotoba <path to the Kotoba repository>
 *                                      also connect the Vocabulary tab to Kotoba (remembered on re-install)
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { deepseekKeySource } from "./deepseek.mjs";
import { CHROME_DIR, DATA_DIR, extensionId, HOST_NAME, LEGACY_HOST_NAMES, OCR_BINARY, OCR_SOURCE, ROOT } from "./paths.mjs";

const { values } = parseArgs({ options: {
  check: { type: "boolean" }, "set-key": { type: "boolean" }, "remove-key": { type: "boolean" },
  ocr: { type: "string" }, kotoba: { type: "string" }, "skip-key-prompt": { type: "boolean" },
  "data-dir": { type: "string", default: DATA_DIR }, "hosts-dir": { type: "string", default: CHROME_DIR },
} });
const dataDir = resolve(values["data-dir"]), hostsDir = resolve(values["hosts-dir"]);
const keyFile = join(dataDir, "deepseek-api-key");
const launcher = join(dataDir, "magazine-reader-host");
const manifestPath = join(hostsDir, `${HOST_NAME}.json`);
const id = extensionId();
const launcherValue = name => existsSync(launcher) ? readFileSync(launcher, "utf8").match(new RegExp(`^${name}='([^']+)'$`, "m"))?.[1] ?? null : null;
const kotobaHost = repo => join(repo, "extension", "host");

async function checkKotoba(repo) {
  if (!repo) return "not connected (optional: node host/install.mjs --kotoba /path/to/kotoba)";
  if (!existsSync(join(kotobaHost(repo), "host.mjs"))) return `missing (${repo} has no extension/host/host.mjs)`;
  try {
    const { LIBRARY_PATH } = await import(pathToFileURL(join(kotobaHost(repo), "paths.mjs")).href);
    const { ingestToken } = await import(pathToFileURL(join(kotobaHost(repo), "ingest.mjs")).href);
    return `${repo}\n  library: ${existsSync(LIBRARY_PATH) ? LIBRARY_PATH : "missing (in Kotoba run node extension/host/build-library.mjs)"}`
      + `\n  ingest token: ${ingestToken() ? "found" : "missing (adding cards will fail)"}`;
  } catch (error) { return `${repo} (could not load: ${error.message})`; }
}

/** Reads a line without echoing it when typed at a terminal; reads all of stdin when piped. */
async function readSecret(prompt) {
  if (!process.stdin.isTTY) {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    return text.trim();
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  process.stdout.write(prompt);
  rl._writeToOutput = () => {}; // keep the key off the screen
  const answer = await new Promise(resolve => rl.question("", resolve));
  rl.close(); process.stdout.write("\n");
  return answer.trim();
}

function saveKey(key) {
  if (/\s/.test(key) || key.length > 500) throw new Error("That does not look like an API key; nothing was saved.");
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  writeFileSync(keyFile, key + "\n", { mode: 0o600 });
  chmodSync(keyFile, 0o600);
  console.log(`Saved the DeepSeek key to ${keyFile} (readable only by you).`);
}

function buildOcr() {
  if (existsSync(OCR_BINARY) && statSync(OCR_BINARY).mtimeMs >= statSync(OCR_SOURCE).mtimeMs) return OCR_BINARY;
  console.log("Building the OCR helper (bin/ocr) with swiftc…");
  mkdirSync(join(ROOT, "bin"), { recursive: true });
  try {
    execFileSync("/usr/bin/xcrun", ["swiftc", "-O", OCR_SOURCE, "-o", OCR_BINARY, "-framework", "VisionKit", "-framework", "AppKit"],
      { stdio: ["ignore", "inherit", "inherit"] });
  } catch {
    throw new Error("Could not build bin/ocr. Install the Xcode Command Line Tools (xcode-select --install), then re-run.");
  }
  return OCR_BINARY;
}

if (values.check) {
  const key = deepseekKeySource({ keyFile });
  console.log(`Extension ID: ${id}`);
  console.log(`Native host: ${existsSync(manifestPath) ? manifestPath : "not installed (run node host/install.mjs)"}`);
  console.log(`Launcher: ${existsSync(launcher) ? launcher : "not installed"}`);
  console.log(`DeepSeek key: ${key ? `found (${key.source})` : "missing (run node host/install.mjs --set-key)"}`);
  if (existsSync(launcher)) {
    const match = readFileSync(launcher, "utf8").match(/^MAGAZINE_OCR_BINARY='([^']+)'$/m);
    console.log(`OCR: ${match && existsSync(match[1]) ? match[1] : "missing (re-run node host/install.mjs)"}`);
  }
  console.log(`Kotoba: ${await checkKotoba(launcherValue("KOTOBA_REPO"))}`);
} else if (values["remove-key"]) {
  rmSync(keyFile, { force: true });
  console.log(`Removed ${keyFile}.`);
} else if (values["set-key"]) {
  const key = await readSecret("DeepSeek API key (from https://platform.deepseek.com/api_keys): ");
  if (!key) throw new Error("No key entered; nothing was saved.");
  saveKey(key);
} else {
  if (process.platform !== "darwin") throw new Error("Magazine Reader uses macOS Live Text for OCR and requires macOS 13 or newer.");
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Use Node 22 or newer.");
  const ocr = values.ocr ? resolve(values.ocr) : buildOcr();
  if (!existsSync(ocr)) throw new Error(`OCR binary not found at ${ocr}.`);
  const quote = text => `'${text.replaceAll("'", "'\\''")}'`;
  const kotoba = values.kotoba ? resolve(values.kotoba) : launcherValue("KOTOBA_REPO");
  if (kotoba && !existsSync(join(kotobaHost(kotoba), "host.mjs"))) throw new Error(`No Kotoba reader host at ${kotobaHost(kotoba)}.`);
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  mkdirSync(hostsDir, { recursive: true });
  writeFileSync(launcher, ["#!/bin/sh", `MAGAZINE_OCR_BINARY=${quote(ocr)}`, "export MAGAZINE_OCR_BINARY",
    ...(kotoba ? [`KOTOBA_REPO=${quote(kotoba)}`, "export KOTOBA_REPO"] : []),
    `exec ${quote(process.execPath)} --disable-warning=ExperimentalWarning ${quote(join(ROOT, "host", "host.mjs"))} "$@"`, ""].join("\n"), { mode: 0o700 });
  chmodSync(launcher, 0o700);
  writeFileSync(manifestPath, JSON.stringify({ name: HOST_NAME, description: "Magazine OCR and English summary",
    path: launcher, type: "stdio", allowed_origins: [`chrome-extension://${id}/`] }, null, 2) + "\n", { mode: 0o600 });
  chmodSync(manifestPath, 0o600);
  // Earlier versions registered under another name; remove only that file.
  for (const name of LEGACY_HOST_NAMES) rmSync(join(hostsDir, `${name}.json`), { force: true });
  console.log(`Installed ${HOST_NAME} for extension ${id}.`);
  console.log(kotoba ? `Vocabulary cards use Kotoba at ${kotoba}.` : "Kotoba not connected; add --kotoba <path> to look up and add vocabulary cards.");
  if (!deepseekKeySource({ keyFile })) {
    if (process.stdin.isTTY && !values["skip-key-prompt"]) {
      console.log("\nSummaries need a DeepSeek API key (https://platform.deepseek.com/api_keys).");
      const key = await readSecret("Paste it now, or press Enter to skip: ");
      if (key) saveKey(key);
      else console.log("Skipped. Run node host/install.mjs --set-key before summarizing.");
    } else console.log("No DeepSeek key yet: run node host/install.mjs --set-key before summarizing.");
  }
  console.log(`\nNext: open chrome://extensions, turn on Developer mode, click Load unpacked, and choose:\n  ${join(ROOT, "chrome")}`);
  console.log("Re-run this installer after upgrading Node or moving the repository.");
}
