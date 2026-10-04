import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ARCHIVE_DIR = resolve(ROOT, "data");
// Kept from when this lived in dot_home, so existing installs and the extension keep matching.
export const HOST_NAME = "com.dot_home.magazine_reader";
export const DATA_DIR = join(homedir(), "Library", "Application Support", "Magazine Reader");
export const CHROME_DIR = join(homedir(), "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");

export function extensionId() {
  const { key } = JSON.parse(readFileSync(join(ROOT, "chrome", "manifest.json"), "utf8"));
  return [...createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32)]
    .map(c => String.fromCharCode(97 + parseInt(c, 16))).join("");
}
