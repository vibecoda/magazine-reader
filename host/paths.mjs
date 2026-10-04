import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ARCHIVE_DIR = resolve(ROOT, "data");
export const HOST_NAME = "io.github.vibecoda.magazine_reader";
/** Registered by versions before 0.6; the installer removes this one file if present. */
export const LEGACY_HOST_NAMES = ["com.dot_home.magazine_reader"];
export const DATA_DIR = join(homedir(), "Library", "Application Support", "Magazine Reader");
export const KEY_FILE = join(DATA_DIR, "deepseek-api-key");
export const OCR_SOURCE = join(ROOT, "ocr", "ocr.swift");
export const OCR_BINARY = join(ROOT, "bin", "ocr");
export const CHROME_DIR = join(homedir(), "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");

export function extensionId() {
  const { key } = JSON.parse(readFileSync(join(ROOT, "chrome", "manifest.json"), "utf8"));
  return [...createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32)]
    .map(c => String.fromCharCode(97 + parseInt(c, 16))).join("");
}
