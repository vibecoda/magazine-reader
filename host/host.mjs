/** stdout is exclusively Chrome's framed JSON channel; no document or key logging. */
import { fileURLToPath } from "node:url";
import { ask, cleanText, cleanThread, DEFAULT_STYLE, STYLES, summarize } from "./deepseek.mjs";
import { createArchive } from "./archive.mjs";
import { kotoba } from "./kotoba.mjs";
import { library } from "./library.mjs";
import { recognize } from "./ocr.mjs";
import { extensionId } from "./paths.mjs";
import { decodeMessages, encodeMessage, MAX_INPUT } from "./protocol.mjs";

export async function handle(message, { emit = () => {}, ocr = recognize, llm = summarize, asker = ask, archive = createArchive, vocab = kotoba, books = library, signal } = {}) {
  if (!message || typeof message.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(message.id)) throw new Error("Invalid request ID.");
  // Vocabulary cards: nothing is archived, and the only reply is the final one.
  if (message.type === "kotoba") return vocab(message);
  // The Library page: read-only, and nothing leaves the Mac.
  if (message.type === "library") return books(message);
  if (!["summarize", "ask"].includes(message.type) && (message.type !== "capture" || !["ocr", "summary"].includes(message.mode))) throw new Error("Unknown request.");
  const thread = message.type === "ask" ? cleanThread(message) : null;
  const style = thread ? "ask" : message.style ?? DEFAULT_STYLE;
  if (!thread && !Object.hasOwn(STYLES, style)) throw new Error("Unknown summary style.");
  let text = message.text;
  if (message.type === "capture") {
    emit({ id: message.id, stage: "recognizing" });
    text = await ocr(message.image, { signal });
    emit({ id: message.id, stage: "recognized", text });
  }
  text = cleanText(text);
  let saved;
  try { saved = archive({ id: message.id, type: message.type, mode: message.mode, source: message.source, style, text }); }
  catch { throw new Error("Could not save OCR locally. Check the magazine-reader data/ folder permissions and disk space."); }
  emit({ id: message.id, stage: "archived", archive: saved.info, text });
  if (message.type === "capture" && message.mode === "ocr") return { text, archive: saved.info };
  if (thread) {
    emit({ id: message.id, stage: "answering" });
    const result = await asker(text, { ...thread, signal });
    try { saved.complete({ ...result, summary: `## Question\n\n${thread.question}\n\n## Answer\n\n${result.answer}\n` }); }
    catch { throw new Error("The answer could not be saved locally. Check disk space and try again."); }
    return { ...result, archive: saved.info };
  }
  emit({ id: message.id, stage: "summarizing" });
  const result = await llm(text, { style, signal });
  try { saved.complete(result); }
  catch { throw new Error("The summary could not be saved locally. OCR is saved; check disk space and try again."); }
  return { text, ...result, archive: saved.info };
}

function main() {
  if (process.argv[2] !== `chrome-extension://${extensionId()}/`) {
    process.stderr.write("Magazine Reader: unauthorized extension origin.\n");
    process.exitCode = 1;
    return;
  }
  let buffer = Buffer.alloc(0), busy = false;
  const controller = new AbortController();
  const emit = message => { if (!controller.signal.aborted) process.stdout.write(encodeMessage(message)); };
  const stop = () => { controller.abort(); process.stdin.destroy(); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  process.stdout.on("error", stop);
  process.stdin.on("end", () => {
    if (buffer.length) process.stderr.write("Magazine Reader: incomplete native message.\n");
    stop();
  });
  process.stdin.on("data", chunk => {
    try {
      if (buffer.length + chunk.length > MAX_INPUT + 4) throw new Error("Native input is too large.");
      const decoded = decodeMessages(Buffer.concat([buffer, chunk]));
      buffer = decoded.rest;
      for (const message of decoded.messages) {
        if (busy) { emit({ id: message?.id, done: true, ok: false, error: "A request is already running." }); continue; }
        busy = true;
        handle(message, { emit, signal: controller.signal }).then(
          result => emit({ id: message.id, done: true, ok: true, ...result }),
          error => emit({ id: message?.id, done: true, ok: false, error: error.message }),
        ).finally(() => { busy = false; });
      }
    } catch {
      process.stderr.write("Magazine Reader: invalid native input.\n");
      stop();
      process.exitCode = 1;
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
