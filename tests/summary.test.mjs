import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const context = {};
runInNewContext(readFileSync(new URL("../chrome/summary.js", import.meta.url), "utf8"), context);
const parse = text => JSON.parse(JSON.stringify(context.magazineSummary.parse(text)));
const inline = text => JSON.parse(JSON.stringify(context.magazineSummary.inline(text)));

test("plain-text summaries keep their title, wrapped paragraphs, bullets and limits", () => {
  assert.deepEqual(parse("A new working week\n\nThe trial lasted three months.\nIt involved 200 people.\n\nKey points\n• Less commuting\n  and more time at home\n• A shorter schedule\n\nLimitations\nNo productivity data."), [
    { type: "title", text: "A new working week" },
    { type: "paragraph", text: "The trial lasted three months. It involved 200 people." },
    { type: "heading", text: "Key points" },
    { type: "list", ordered: false, items: ["Less commuting and more time at home", "A shorter schedule"] },
    { type: "note", text: "No productivity data." },
  ]);
});

test("markdown headings and numbered lists preserve section boundaries", () => {
  assert.deepEqual(parse("# Title\n\n## Overview\nA paragraph.\n\n1. First point\n2. Second point\n\nLimitations: An incomplete excerpt."), [
    { type: "title", text: "Title" },
    { type: "heading", text: "Overview" },
    { type: "paragraph", text: "A paragraph." },
    { type: "list", ordered: true, items: ["First point", "Second point"] },
    { type: "note", text: "An incomplete excerpt." },
  ]);
});

test("inline formatting keeps source HTML literal and does not lose content", () => {
  const source = "**200 people** and *three months* <img onerror=alert(1)>";
  assert.deepEqual(inline(source), [
    { type: "strong", text: "200 people" }, { type: "text", text: " and " },
    { type: "em", text: "three months" }, { type: "text", text: " <img onerror=alert(1)>" },
  ]);
  assert.deepEqual(parse(""), []);
  assert.deepEqual(parse("A sentence with no separate title."), [{ type: "paragraph", text: "A sentence with no separate title." }]);
});
