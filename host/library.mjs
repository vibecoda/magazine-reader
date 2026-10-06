/**
 * Read-only access to the data/ archive for the extension's Library page. Folders are named only by
 * IDs this module produced ("YYYY-MM-DD/<folder>"), so a request can never reach outside data/.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHIVE_DIR } from "./paths.mjs";

export const MAX_CAPTURES = 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/, FOLDER = /^[0-9A-Za-z._-]{1,80}$/;
const ENTRY_ID = /^(\d{4}-\d{2}-\d{2})\/([0-9A-Za-z._-]{1,80})$/;
// The whole reply has to fit in one native message (MAX_OUTPUT is 900 KB).
const READ_BUDGET = 760 * 1024;

const readText = path => { try { return readFileSync(path, "utf8"); } catch { return null; } };

function readEntry(root, day, folder) {
  const directory = join(root, day, folder);
  let metadata;
  try { metadata = JSON.parse(readFileSync(join(directory, "metadata.json"), "utf8")); } catch { return null; }
  if (!metadata || typeof metadata !== "object") return null;
  return { id: `${day}/${folder}`, directory, metadata };
}

function entries(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const day of readdirSync(root).filter(name => DAY.test(name))) {
    let folders;
    try { folders = readdirSync(join(root, day)).filter(name => FOLDER.test(name)); } catch { continue; }
    for (const folder of folders) { const entry = readEntry(root, day, folder); if (entry) out.push(entry); }
  }
  return out;
}

/** A one-line label: the summary's title, or the question asked. */
export function titleOf(summary, style) {
  if (!summary) return null;
  if (style === "ask") return summary.match(/## Question\s+([^\n]+)/)?.[1]?.trim().slice(0, 160) || null;
  for (const raw of summary.split("\n")) {
    const line = raw.trim().replace(/^#{1,6}\s+/, "").replace(/^Title:\s*/i, "").replace(/\*\*/g, "").trim();
    if (!line) continue;
    if (/^[-*•]\s|^\d+[.)]\s/.test(line) || line.includes("|")) return null; // a word or stock list has no title
    return line.slice(0, 160);
  }
  return null;
}

const summaryOf = entry => entry.metadata.summaryFile === "summary.md" ? readText(join(entry.directory, "summary.md")) : null;
const capturedAt = entry => entry.metadata.source?.capturedAt || entry.metadata.savedAt || "";
const groupKey = entry => entry.metadata.source?.captureId || `entry:${entry.id}`;

/** Captures, newest first: each request saved for one screenshot, with titles and a short snippet. */
export function listCaptures({ query = "", root = ARCHIVE_DIR } = {}) {
  const needle = typeof query === "string" ? query.trim().toLowerCase().slice(0, 200) : "";
  const groups = new Map();
  for (const entry of entries(root)) {
    const key = groupKey(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const captures = [];
  for (const [key, group] of groups) {
    group.sort((a, b) => String(a.metadata.savedAt).localeCompare(String(b.metadata.savedAt)));
    const texts = group.map(entry => ({ entry, text: readText(join(entry.directory, "ocr.txt")) || "", summary: summaryOf(entry) }));
    if (needle && !texts.some(({ text, summary }) => text.toLowerCase().includes(needle) || summary?.toLowerCase().includes(needle))) continue;
    const latest = texts.at(-1);
    // A summary's title describes the page better than a question about it.
    const titles = texts.map(({ entry, summary }) => titleOf(summary, entry.metadata.style));
    const title = titles.findLast((t, i) => t && texts[i].entry.metadata.style !== "ask") ?? titles.findLast(Boolean) ?? null;
    captures.push({
      key, url: group[0].metadata.source?.url || null, capturedAt: capturedAt(group[0]),
      title, snippet: latest.text.replace(/\s+/g, " ").trim().slice(0, 120),
      entries: texts.map(({ entry, summary }) => ({ id: entry.id, style: entry.metadata.style || null,
        savedAt: entry.metadata.savedAt || null, hasSummary: Boolean(summary), truncated: Boolean(entry.metadata.truncated) })),
    });
  }
  captures.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  return { total: captures.length, captures: captures.slice(0, MAX_CAPTURES) };
}

/** Every request saved for one capture, oldest first, with its Japanese text and English output. */
export function readCapture(ids, { root = ARCHIVE_DIR } = {}) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 200) throw new Error("Choose a saved capture.");
  const texts = [], out = [];
  let size = 0, omitted = 0;
  for (const id of ids) {
    const match = typeof id === "string" && id.match(ENTRY_ID);
    if (!match) throw new Error("Invalid saved capture.");
    const entry = readEntry(root, match[1], match[2]);
    if (!entry) { omitted++; continue; }
    const text = readText(join(entry.directory, "ocr.txt")) ?? "", summary = summaryOf(entry);
    // Retries and other styles usually share one text; send each distinct text once.
    let textIndex = texts.indexOf(text);
    const cost = (textIndex < 0 ? text.length * 3 : 0) + (summary?.length ?? 0) * 3;
    if (size + cost > READ_BUDGET) { omitted++; continue; }
    size += cost;
    if (textIndex < 0) textIndex = texts.push(text) - 1;
    const { metadata } = entry;
    out.push({ id: entry.id, directory: entry.directory, style: metadata.style || null, mode: metadata.mode || null,
      savedAt: metadata.savedAt || null, model: metadata.model || null, truncated: Boolean(metadata.truncated),
      source: metadata.source || null, textIndex, summary });
  }
  return { texts, entries: out, omitted };
}

/** { action: "list", query } | { action: "read", ids } */
export function library(message, options) {
  if (message.action === "list") return listCaptures({ ...options, query: message.query });
  if (message.action === "read") return readCapture(message.ids, options);
  throw new Error("Unknown library request.");
}
