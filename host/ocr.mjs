import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { cleanText } from "./deepseek.mjs";

export function decodeImage(dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length > 28 * 1024 * 1024) throw new Error("Screenshot is too large.");
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error("Expected a PNG screenshot.");
  const image = Buffer.from(match[1], "base64");
  if (image.length < 24 || !image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    || image.toString("ascii", 12, 16) !== "IHDR") throw new Error("Invalid PNG screenshot.");
  const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
  if (!width || !height || width * height > 40_000_000 || width > 16_000 || height > 16_000)
    throw new Error("Screenshot dimensions are too large or invalid.");
  return image;
}

export async function recognize(dataUrl, { command = process.env.MAGAZINE_OCR_BINARY || join(homedir(), ".local", "bin", "ocr"), signal } = {}) {
  const image = decodeImage(dataUrl);
  const directory = await mkdtemp(join(tmpdir(), "magazine-reader-"));
  try {
    const path = join(directory, "capture.png");
    await writeFile(path, image, { mode: 0o600 });
    const text = await new Promise((resolve, reject) => {
      execFile(command, [path], { encoding: "utf8", timeout: 60_000, maxBuffer: 512 * 1024, signal }, (error, stdout) => {
        if (error) {
          reject(new Error(signal?.aborted ? "Cancelled." : error.code === "ENOENT"
            ? "OCR binary not found. Run host/install.mjs with --ocr pointing to your ocr binary."
            : error.killed ? "OCR did not finish within 60 seconds." : "OCR failed. Try a clearer region or test the ocr binary directly."));
        } else resolve(stdout);
      });
    });
    return cleanText(text);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
