import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createArchive } from "../host/archive.mjs";
import { handle } from "../host/host.mjs";
import { library, listCaptures, readCapture, titleOf } from "../host/library.mjs";

const url = "https://magazine.rakuten.co.jp/read/test";
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "magazine-library-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const save = (message, summary, now) => {
    const saved = createArchive({ type: "summarize", ...message }, { root, now: new Date(now) });
    if (summary) saved.complete({ summary, model: "test-model" });
    return saved.info;
  };
  return { root, save };
}

test("captures group every request by capture ID, newest first, with a title and snippet", t => {
  const f = fixture(t), one = { url, captureId: "one", capturedAt: "2026-10-04T01:00:00Z" }, two = { url, captureId: "two", capturedAt: "2026-10-05T01:00:00Z" };
  f.save({ id: "a", style: "overview", source: one, text: "週四日の勤務制度" }, "A four-day week\n\nOverview text.", "2026-10-04T01:01:00Z");
  f.save({ id: "b", type: "ask", style: "ask", source: one, text: "週四日の勤務制度" }, "## Question\n\nWhy?\n\n## Answer\n\nBecause.\n", "2026-10-04T01:02:00Z");
  f.save({ id: "c", style: "glossary", source: two, text: "半導体" }, "- 半導体 | はんどうたい | semiconductor", "2026-10-05T01:01:00Z");
  f.save({ id: "d", style: "overview", source: two, text: "半導体" }, null, "2026-10-05T01:02:00Z"); // failed request: text only
  const { total, captures } = listCaptures({ root: f.root });
  assert.equal(total, 2);
  assert.deepEqual(captures.map(c => c.key), ["two", "one"]);
  assert.equal(captures[1].title, "A four-day week");
  assert.equal(captures[0].title, null);
  assert.equal(captures[0].snippet, "半導体");
  assert.deepEqual(captures[1].entries.map(e => e.style), ["overview", "ask"]);
  assert.deepEqual(captures[0].entries.map(e => e.hasSummary), [true, false]);
  assert.deepEqual(listCaptures({ root: f.root, query: "BECAUSE" }).captures.map(c => c.key), ["one"]);
  assert.deepEqual(listCaptures({ root: f.root, query: "半導体" }).captures.map(c => c.key), ["two"]);
  assert.equal(listCaptures({ root: join(f.root, "missing") }).total, 0);
});

test("reading a capture returns its outputs and each distinct Japanese text once", t => {
  const f = fixture(t), source = { url, captureId: "one", capturedAt: "2026-10-04T01:00:00Z" };
  f.save({ id: "a", style: "overview", source, text: "原文" }, "Title\n\nFirst.", "2026-10-04T01:01:00Z");
  f.save({ id: "b", style: "overview", source, text: "原文" }, "Title\n\nSecond.", "2026-10-04T01:02:00Z");
  f.save({ id: "c", style: "translation", source, text: "修正した原文" }, "Translated", "2026-10-04T01:03:00Z");
  const ids = listCaptures({ root: f.root }).captures[0].entries.map(e => e.id);
  const { texts, entries, omitted } = readCapture(ids, { root: f.root });
  assert.deepEqual(texts, ["原文", "修正した原文"]);
  assert.deepEqual(entries.map(e => [e.style, e.textIndex, e.summary]), [["overview", 0, "Title\n\nFirst."], ["overview", 0, "Title\n\nSecond."], ["translation", 1, "Translated"]]);
  assert.equal(entries[0].model, "test-model"); assert.equal(omitted, 0);
});

test("library requests cannot name paths outside the archive", t => {
  const f = fixture(t);
  mkdirSync(join(f.root, "2026-10-04"), { recursive: true });
  writeFileSync(join(f.root, "secret.txt"), "no");
  for (const id of ["../secret.txt", "2026-10-04/../../etc", "/etc/passwd", "2026-10-04/a/b", 5])
    assert.throws(() => readCapture([id], { root: f.root }), /Invalid saved capture/);
  assert.throws(() => readCapture([], { root: f.root }), /Choose/);
  assert.deepEqual(readCapture(["2026-10-04/missing"], { root: f.root }).omitted, 1);
  assert.throws(() => library({ action: "delete" }), /Unknown library request/);
});

test("titles come from a summary's first line or the question; word lists have none", () => {
  assert.equal(titleOf("## A **title**\n\nBody", "overview"), "A title");
  assert.equal(titleOf("Title: Chips\n\nBody", "bullets"), "Chips");
  assert.equal(titleOf("- 7203 | トヨタ | Toyota", "stocks"), null);
  assert.equal(titleOf("## Question\n\nWhat happened?\n\n## Answer\n\nA thing.", "ask"), "What happened?");
  assert.equal(titleOf(null, "overview"), null);
});

test("the native host routes library requests without archiving or calling DeepSeek", async () => {
  let seen;
  const result = await handle({ id: "lib", type: "library", action: "list" }, {
    books: message => { seen = message; return { total: 0, captures: [] }; },
    archive: () => assert.fail("archived"), llm: async () => assert.fail("summarized"),
  });
  assert.equal(seen.action, "list"); assert.deepEqual(result, { total: 0, captures: [] });
});
