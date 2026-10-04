#!/usr/bin/env node
/** Test the real framed native host without registering it in Chrome. */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { extensionId, ROOT } from "./paths.mjs";
import { decodeMessages, encodeMessage } from "./protocol.mjs";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { summarize: { type: "boolean" } } });
if (positionals.length !== 1) {
  console.error("Usage: node host/check-image.mjs image.png [--summarize]\n--summarize sends recognized text to DeepSeek; otherwise OCR stays local.");
  process.exit(2);
}
const image = `data:image/png;base64,${readFileSync(positionals[0]).toString("base64")}`;
const child = spawn(process.execPath, [join(ROOT, "host", "host.mjs"), `chrome-extension://${extensionId()}/`], { stdio: ["pipe", "pipe", "inherit"] });
let buffer = Buffer.alloc(0), done = false;
const timer = setTimeout(() => { console.error("Native host timed out."); child.kill(); process.exitCode = 1; }, 130_000);
child.stdout.on("data", chunk => {
  const decoded = decodeMessages(Buffer.concat([buffer, chunk])); buffer = decoded.rest;
  for (const message of decoded.messages) {
    if (message.stage) console.error(message.stage);
    if (!message.done) continue;
    done = true; clearTimeout(timer);
    if (message.ok) console.log(JSON.stringify({ text: message.text, summary: message.summary, model: message.model, ms: message.ms, archive: message.archive }, null, 2));
    else { console.error(message.error); process.exitCode = 1; }
    child.stdin.end();
  }
});
child.on("error", error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
child.on("close", code => { clearTimeout(timer); if (!done) { console.error(`Host stopped before replying (${code}).`); process.exitCode = 1; } });
// The helper's input limit is deliberately smaller than the browser's: this
// diagnostic takes a small PNG, not a high-resolution whole viewport.
child.stdin.write(encodeMessage({ id: "image-check", type: "capture", mode: values.summarize ? "summary" : "ocr", image }));
