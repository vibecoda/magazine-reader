/**
 * Bridge to Kotoba, the vocabulary site whose reader extension keeps a local word library on this Mac.
 * Its own host modules do the work, loaded from the Kotoba repository named by KOTOBA_REPO (set by
 * `node host/install.mjs --kotoba <path>`): the same library lookup, the same DeepSeek card draft, and
 * the same ingest call, so a card added here is indistinguishable from one added by Kotoba Reader.
 * Magazine text is copyrighted, so words are drafted and registered as Kotoba's "web" source:
 * original example sentences, labelled "Web reading".
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { deepseekKey } from "./deepseek.mjs";

export const MAX_TERMS = 40, MAX_TERM = 40;
const SOURCE = "web";

export function kotobaHostDir(repo = process.env.KOTOBA_REPO) {
  if (!repo) throw new Error("Kotoba is not connected. Run: node host/install.mjs --kotoba /path/to/the/kotoba/repo");
  const dir = join(repo, "extension", "host");
  if (!existsSync(join(dir, "host.mjs"))) throw new Error("The Kotoba reader host was not found. Re-run node host/install.mjs --kotoba with the right path.");
  return dir;
}

export async function loadKotoba(dir = kotobaHostDir()) {
  const load = name => import(pathToFileURL(join(dir, name)).href);
  const [host, lemma, library, paths, deepseek] = await Promise.all(
    ["host.mjs", "lemma.mjs", "library.mjs", "paths.mjs", "draft-deepseek.mjs"].map(load));
  return { host, lemma, library, paths, deepseek };
}

const kana = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・]+$/u;
function cleanTerm(value) {
  const term = typeof value === "string" ? value.replace(/\s+/g, "") : "";
  if (!term || term.length > MAX_TERM) throw new Error(`Each word must be 1–${MAX_TERM} characters.`);
  return term;
}
const cleanReading = (value, k) => typeof value === "string" && kana.test(value.replace(/\s+/g, "")) && value.length <= 64
  ? k.lemma.toHiragana(value.replace(/\s+/g, "")) : null;
const optional = (value, max) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/** { action: "lookup", terms: [{ term, reading }] } | { action: "draft", term, reading, lemma, sentence } | { action: "register", card } */
export async function kotoba(message, { load = loadKotoba, key = deepseekKey } = {}) {
  if (!["lookup", "draft", "register"].includes(message.action)) throw new Error("Unknown Kotoba request.");
  const k = await load();
  if (message.action === "lookup") {
    if (!Array.isArray(message.terms) || !message.terms.length || message.terms.length > MAX_TERMS)
      throw new Error(`Look up between 1 and ${MAX_TERMS} words at a time.`);
    const terms = message.terms.map(item => ({ term: cleanTerm(item?.term), reading: cleanReading(item?.reading, k) }));
    const tokenizer = await k.lemma.loadTokenizer();
    const db = k.library.openLibrary(k.paths.LIBRARY_PATH);
    try {
      return { results: terms.map(({ term, reading }) => {
        const candidates = k.lemma.candidatesFor(tokenizer, term), lemma = candidates[0]?.term ?? term;
        const words = k.library.findWords(db, candidates, term, reading).slice(0, 5);
        // Otherwise only parts matched: 試験的に finds 試験, which is related but not the word itself.
        const exact = words.some(word => word.match === "reading" || word.term === term || word.term === lemma);
        return { term, lemma, exact, words };
      }) };
    } finally { db.close(); }
  }
  if (message.action === "draft") {
    const apiKey = key();
    if (!apiKey) throw new Error("No DeepSeek API key. Run: node host/install.mjs --set-key");
    const term = cleanTerm(message.term);
    const { card, ms, model } = await k.deepseek.draftCardDeepSeek({ selection: term, source: SOURCE,
      lemma: optional(message.lemma, 64), ruby: cleanReading(message.reading, k), sentence: optional(message.sentence, 400) }, { key: apiKey });
    return { card, ms, model };
  }
  if (!message.card || typeof message.card !== "object" || JSON.stringify(message.card).length > 20_000) throw new Error("Invalid card.");
  // Kotoba's own handler checks the card, posts it to the site, and adds it to the local library.
  const { remote, localId, label } = await k.host.handle({ type: "register", card: message.card, source: SOURCE });
  return { remote, localId, label };
}
