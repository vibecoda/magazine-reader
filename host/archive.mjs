import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHIVE_DIR } from "./paths.mjs";

function sourceMetadata(source) {
  if (!source || typeof source.url !== "string" || source.url.length > 2000) return null;
  try {
    const url = new URL(source.url);
    if (url.origin !== "https://magazine.rakuten.co.jp" || !url.pathname.startsWith("/read/")) return null;
    return { url: url.href,
      capturedAt: typeof source.capturedAt === "string" && Number.isFinite(Date.parse(source.capturedAt))
        ? new Date(source.capturedAt).toISOString() : null,
      captureId: typeof source.captureId === "string" ? source.captureId.slice(0, 80) : null };
  } catch { return null; }
}

/** Which part of the article came from which capture, as the overlay recorded it. */
function partsMetadata(parts) {
  if (!Array.isArray(parts) || !parts.length) return null;
  return parts.slice(0, 99).map(entry => ({
    part: Number.isInteger(entry?.part) && entry.part > 0 && entry.part < 100 ? entry.part : null,
    capturedAt: typeof entry?.capturedAt === "string" && Number.isFinite(Date.parse(entry.capturedAt))
      ? new Date(entry.capturedAt).toISOString() : null,
  }));
}

/** The reader command that produced a summary, or null for the built-in styles. */
function commandMetadata(command) {
  if (!command || typeof command.id !== "string" || typeof command.name !== "string") return null;
  return { id: command.id.slice(0, 64), name: command.name.slice(0, 40) };
}

/** Each request gets its own folder, including edited-text summary retries. */
export function createArchive(message, { root = ARCHIVE_DIR, now = new Date() } = {}) {
  const timestamp = now.toISOString();
  const day = join(root, timestamp.slice(0, 10));
  mkdirSync(day, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(day, `${timestamp.slice(11, 23).replace(/:/g, "-")}-`));
  const textPath = join(directory, "ocr.txt"), summaryPath = join(directory, "summary.md");
  const metadataPath = join(directory, "metadata.json"), parts = partsMetadata(message.parts), command = commandMetadata(message.command);
  const metadata = { version: 1, requestId: message.id, savedAt: timestamp,
    requestType: message.type, mode: message.mode || "summary",
    style: message.mode === "ocr" ? null : message.style || null, source: sourceMetadata(message.source),
    ...(command ? { command } : {}),
    ...(parts ? { parts } : {}),
    textFile: "ocr.txt", summaryFile: null };
  const writeMetadata = () => {
    const temporary = join(directory, `.metadata-${randomUUID()}.tmp`);
    writeFileSync(temporary, JSON.stringify(metadata, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    renameSync(temporary, metadataPath);
  };
  writeFileSync(textPath, message.text, { flag: "wx", mode: 0o600 });
  writeMetadata();
  return {
    info: { directory, textPath, summaryPath: null },
    complete(result) {
      writeFileSync(summaryPath, result.summary, { flag: "wx", mode: 0o600 });
      Object.assign(metadata, { summaryFile: "summary.md", summarySavedAt: new Date().toISOString(),
        model: result.model, truncated: Boolean(result.truncated) });
      writeMetadata();
      this.info = { directory, textPath, summaryPath };
      return this.info;
    },
  };
}
