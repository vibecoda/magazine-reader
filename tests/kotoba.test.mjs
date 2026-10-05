import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handle } from "../host/host.mjs";
import { kotoba, kotobaHostDir } from "../host/kotoba.mjs";
import { HOST_NAME, ROOT } from "../host/paths.mjs";

/** Stand-ins for the Kotoba host modules, recording what they were asked. */
function fakeKotoba(library = {}) {
  const calls = { find: [], drafts: [], handled: [], closed: 0 };
  const modules = {
    paths: { LIBRARY_PATH: "/fixture/library.db" },
    lemma: {
      toHiragana: text => text.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)),
      loadTokenizer: async () => "tokenizer",
      candidatesFor: (_tokenizer, term) => [{ term: term.replace(/に$/, ""), reading: null }, { term, reading: null }],
    },
    library: {
      openLibrary: path => { assert.equal(path, "/fixture/library.db"); return { close: () => { calls.closed++; } }; },
      findWords: (_db, candidates, selection, reading) => {
        calls.find.push({ selection, reading });
        return library[selection] ?? library[candidates[0].term] ?? [];
      },
    },
    deepseek: { draftCardDeepSeek: async (request, options) => { calls.drafts.push({ request, options }); return { card: { term: "通勤" }, ms: 4200, model: "deepseek-flash" }; } },
    host: { handle: async message => { calls.handled.push(message); return { remote: { status: "added", guideSaved: true }, localId: 7, label: "Web reading" }; } },
  };
  return { calls, load: async () => modules };
}

test("lookup checks every word in one library session and tells exact words from related ones", async () => {
  const { calls, load } = fakeKotoba({
    負担: [{ term: "負担", match: "term" }],
    試験的: [{ term: "試験", match: "term" }],
    透きとおる: [{ term: "透き通る", match: "reading" }],
  });
  const { results } = await kotoba({ action: "lookup", terms: [{ term: "負 担", reading: "フタン" }, { term: "試験的に" },
    { term: "透きとおる", reading: "すきとおる" }, { term: "新語", reading: "not kana" }] }, { load });
  assert.deepEqual(results.map(r => [r.term, r.lemma, r.exact, r.words.length]),
    [["負担", "負担", true, 1], ["試験的に", "試験的", false, 1], ["透きとおる", "透きとおる", true, 1], ["新語", "新語", false, 0]]);
  assert.deepEqual(calls.find.map(c => c.reading), ["ふたん", null, "すきとおる", null]);
  assert.equal(calls.closed, 1);
});

test("lookup rejects empty, oversized and malformed word lists", async () => {
  const { load } = fakeKotoba();
  await assert.rejects(kotoba({ action: "lookup", terms: [] }, { load }), /between 1 and 40/);
  await assert.rejects(kotoba({ action: "lookup", terms: Array(41).fill({ term: "語" }) }, { load }), /between 1 and 40/);
  await assert.rejects(kotoba({ action: "lookup", terms: [{ term: "あ".repeat(41) }] }, { load }), /1–40/);
  await assert.rejects(kotoba({ action: "lookup", terms: [{}] }, { load }), /1–40/);
  await assert.rejects(kotoba({ action: "delete" }, { load }), /Unknown Kotoba request/);
});

test("drafts go to DeepSeek with this extension's key, as a copyrighted web source", async () => {
  const { calls, load } = fakeKotoba();
  const result = await kotoba({ action: "draft", term: "通勤時間", reading: "つうきんじかん", lemma: "通勤時間",
    sentence: "通勤時間が減った。" }, { load, key: () => "fake-test-key" });
  assert.deepEqual(result, { card: { term: "通勤" }, ms: 4200, model: "deepseek-flash" });
  assert.deepEqual(calls.drafts[0].request, { selection: "通勤時間", source: "web", lemma: "通勤時間", ruby: "つうきんじかん", sentence: "通勤時間が減った。" });
  assert.deepEqual(calls.drafts[0].options, { key: "fake-test-key" });
  await assert.rejects(kotoba({ action: "draft", term: "語" }, { load, key: () => null }), /--set-key/);
});

test("registering hands the card to Kotoba's own handler as a web reading", async () => {
  const { calls, load } = fakeKotoba();
  const card = { term: "通勤", reading: "つうきん", meaning: "commuting", examples: [] };
  assert.deepEqual(await kotoba({ action: "register", card }, { load }),
    { remote: { status: "added", guideSaved: true }, localId: 7, label: "Web reading" });
  assert.deepEqual(calls.handled, [{ type: "register", card, source: "web" }]);
  await assert.rejects(kotoba({ action: "register", card: "x" }, { load }), /Invalid card/);
  await assert.rejects(kotoba({ action: "register", card: { meaning: "x".repeat(20_001) } }, { load }), /Invalid card/);
});

test("the native host answers Kotoba requests without archiving anything", async () => {
  const seen = [];
  const result = await handle({ id: "word-1", type: "kotoba", action: "lookup", terms: [{ term: "負担" }] },
    { vocab: async message => { seen.push(message.action); return { results: [] }; }, archive: () => { throw new Error("archived"); } });
  assert.deepEqual(result, { results: [] }); assert.deepEqual(seen, ["lookup"]);
});

test("an unconnected or misplaced Kotoba repository gives the installer command", () => {
  assert.throws(() => kotobaHostDir(undefined), /--kotoba/);
  assert.throws(() => kotobaHostDir(join(tmpdir(), "no-such-kotoba-repo")), /--kotoba/);
});

test("installer records the Kotoba repository, keeps it on re-install, and rejects a wrong path", () => {
  const dir = mkdtempSync(join(tmpdir(), "magazine-kotoba-install-"));
  try {
    const repo = join(dir, "kotoba"), data = join(dir, "data"), hosts = join(dir, "hosts");
    mkdirSync(join(repo, "extension", "host"), { recursive: true });
    writeFileSync(join(repo, "extension", "host", "host.mjs"), "");
    const run = extra => execFileSync(process.execPath, [join(ROOT, "host", "install.mjs"), "--ocr", "/bin/echo",
      "--data-dir", data, "--hosts-dir", hosts, ...extra], { input: "", encoding: "utf8" });
    const launcher = () => readFileSync(JSON.parse(readFileSync(join(hosts, `${HOST_NAME}.json`), "utf8")).path, "utf8");
    run(["--kotoba", repo]);
    assert.ok(launcher().includes(`KOTOBA_REPO='${repo}'\nexport KOTOBA_REPO`));
    run([]);
    assert.ok(launcher().includes(`KOTOBA_REPO='${repo}'`));
    assert.throws(() => run(["--kotoba", dir]), { stderr: /No Kotoba reader host/ });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
