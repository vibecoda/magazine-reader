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

/** Each request gets its own folder, including edited-text summary retries. */
export function createArchive(message, { root = ARCHIVE_DIR, now = new Date() } = {}) {
  const timestamp = now.toISOString();
  const day = join(root, timestamp.slice(0, 10));
  mkdirSync(day, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(day, `${timestamp.slice(11, 23).replace(/:/g, "-")}-`));
  const textPath = join(directory, "ocr.txt"), summaryPath = join(directory, "summary.md");
  const metadataPath = join(directory, "metadata.json");
  const metadata = { version: 1, requestId: message.id, savedAt: timestamp,
    requestType: message.type, mode: message.mode || "summary",
    style: message.mode === "ocr" ? null : message.style || null, source: sourceMetadata(message.source),
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
