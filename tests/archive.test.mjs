import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createArchive } from "../host/archive.mjs";
import { handle } from "../host/host.mjs";
import { ARCHIVE_DIR, ROOT } from "../host/paths.mjs";

const source = { url: "https://magazine.rakuten.co.jp/read/test", capturedAt: "2026-10-04T01:00:00Z", captureId: "capture-one" };
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "magazine-archive-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, archive: message => createArchive(message, { root, now: new Date("2026-10-04T01:02:03Z") }) };
}

test("archives preserve Japanese, English, source metadata and private file permissions", t => {
  const f = fixture(t);
  const saved = f.archive({ id: "one", type: "capture", mode: "summary", source, text: "日本語\n本文", image: "never save this" });
  saved.complete({ summary: "A summary\n\n• A key point", model: "test-model", truncated: false });
  assert.equal(readFileSync(saved.info.textPath, "utf8"), "日本語\n本文");
  assert.equal(readFileSync(saved.info.summaryPath, "utf8"), "A summary\n\n• A key point");
  const metadata = JSON.parse(readFileSync(join(saved.info.directory, "metadata.json"), "utf8"));
  assert.equal(metadata.source.url, source.url);
  assert.equal(metadata.source.captureId, source.captureId);
  assert.equal(metadata.model, "test-model");
  assert.equal(metadata.summaryFile, "summary.md");
  assert.ok(!JSON.stringify(metadata).includes("never save this"));
  assert.equal(statSync(saved.info.directory).mode & 0o777, 0o700);
  assert.equal(statSync(saved.info.textPath).mode & 0o777, 0o600);
  assert.equal(statSync(saved.info.summaryPath).mode & 0o777, 0o600);
  assert.equal(statSync(join(saved.info.directory, "metadata.json")).mode & 0o777, 0o600);
  assert.equal(ARCHIVE_DIR, resolve(ROOT, "../../data/magazine-reader"));
});

test("repeated requests get distinct folders and preserve earlier text versions", t => {
  const f = fixture(t), request = { id: "same-id", type: "summarize", source, text: "original" };
  const original = f.archive(request), edited = f.archive({ ...request, text: "edited" });
  assert.notEqual(original.info.directory, edited.info.directory);
  assert.equal(readFileSync(original.info.textPath, "utf8"), "original");
  assert.equal(readFileSync(edited.info.textPath, "utf8"), "edited");
});

test("OCR-only archives the text; summary calls see it on disk before they run", async t => {
  const f = fixture(t), events = [];
  const request = { id: "one", type: "capture", mode: "ocr", image: "fixture", source };
  const options = { archive: f.archive, emit: event => events.push(event), ocr: async () => "本文", llm: async () => { assert.fail("OCR-only called LLM"); } };
  const ocr = await handle(request, options);
  assert.equal(ocr.archive.summaryPath, null);
  assert.equal(readFileSync(ocr.archive.textPath, "utf8"), "本文");
  options.llm = async text => {
    const archived = events.findLast(event => event.stage === "archived");
    assert.equal(readFileSync(archived.archive.textPath, "utf8"), text);
    return { summary: "English", model: "test" };
  };
  const summary = await handle({ ...request, id: "two", mode: "summary" }, options);
  assert.equal(readFileSync(summary.archive.summaryPath, "utf8"), "English");
});

test("provider failure or cancellation leaves edited OCR archived without a false summary", async t => {
  const f = fixture(t);
  for (const error of ["network failure", "Cancelled."]) {
    const events = [];
    await assert.rejects(handle({ id: "retry", type: "summarize", text: "修正済み本文", source }, {
      archive: f.archive, emit: event => events.push(event), llm: async () => { throw new Error(error); },
    }), { message: error });
    const saved = events.find(event => event.stage === "archived").archive;
    assert.equal(readFileSync(saved.textPath, "utf8"), "修正済み本文");
    assert.equal(saved.summaryPath, null);
    assert.equal(existsSync(join(saved.directory, "summary.md")), false);
  }
});

test("archive failures are actionable and prevent an unsaved input from reaching the LLM", async t => {
  const f = fixture(t), blocked = join(f.root, "file"); writeFileSync(blocked, "not a directory");
  let called = false;
  await assert.rejects(handle({ id: "one", type: "summarize", text: "本文" }, {
    archive: message => createArchive(message, { root: blocked }), llm: async () => { called = true; },
  }), /Could not save OCR locally/);
  assert.equal(called, false);
});
