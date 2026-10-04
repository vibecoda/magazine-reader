import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const context = {};
runInNewContext(readFileSync(new URL("../chrome/summary.js", import.meta.url), "utf8"), context);
const parse = text => JSON.parse(JSON.stringify(context.magazineSummary.parse(text)));
const inline = text => JSON.parse(JSON.stringify(context.magazineSummary.inline(text)));
const copyText = context.magazineSummary.copyText;

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

test("copy excludes a final labelled disclaimer while preserving the summary's formatting", () => {
  const body = "A working week\n\nAn overview with **200 people**.\n\nKey points\n• First point\n• Second point";
  for (const ending of [
    "Limitations\nThe excerpt is incomplete.",
    "Limitations: The excerpt is incomplete.",
    "### Disclaimer\nThis summary is based on a partial excerpt.",
    "**Limitations:** Some OCR is unclear.\n\nAnother paragraph of limitations.",
    "**Note**: OCR is unclear.",
    "Caveats\n- Missing figures\n- Partial text",
  ]) assert.equal(copyText(`${body}\n\n${ending}`), body);
});

test("copy handles an older standalone disclaimer, but keeps factual caveats in the main summary", () => {
  const body = "A trial\n\nThe study found no detailed productivity data.\n\n• The trial does not establish suitability for every company.";
  assert.equal(copyText(`${body}\n\nThis summary is based on the provided excerpt only.`), body);
  assert.equal(copyText(`${body}\n\nThe excerpt provides no detailed productivity measurements.`), body);
  assert.equal(copyText(body), body);
  assert.equal(copyText("A trial\n\n• Note: Employees reported more work."), "A trial\n\n• Note: Employees reported more work.");
});

test("copy leaves an earlier note section intact when another substantive section follows", () => {
  const text = "Title\n\nNote\nAn earlier note.\n\n## Main points\n• A substantive point.";
  assert.equal(copyText(text), text);
});

test("style-specific section labels such as Vocabulary become headings", () => {
  assert.deepEqual(parse("New ways of working\n\nA short gist.\n\nVocabulary\n• 両立 (りょうりつ) — balance\n• 負担 (ふたん) — burden"), [
    { type: "title", text: "New ways of working" },
    { type: "paragraph", text: "A short gist." },
    { type: "heading", text: "Vocabulary" },
    { type: "list", ordered: false, items: ["両立 (りょうりつ) — balance", "負担 (ふたん) — burden"] },
  ]);
  assert.equal(copyText("Title\n\nGlossary:\n• 語 — word\n\nLimitations: Partial."), "Title\n\nGlossary:\n• 語 — word");
});

test("stock bullets parse codes, names and provenance; only valid codes get a Monex link", () => {
  const { stock, stockUrl } = context.magazineSummary;
  assert.deepEqual({ ...stock("7203 | トヨタ自動車 | Toyota Motor | stated | Raised its forecast") },
    { code: "7203", ja: "トヨタ自動車", en: "Toyota Motor", source: "stated", note: "Raised its forecast" });
  assert.equal(stock("**160a** | アズーム | Azoom | inferred | Parking platform").code, "160A");
  assert.equal(stock("---- | 某社 | A startup | stated | Unlisted").code, null);
  assert.equal(stock("A plain bullet without fields"), null);
  assert.equal(stockUrl("160A"), "https://monex.ifis.co.jp/index.php?sa=find&ta=n&wd=160A");
  for (const bad of ["0123", "72031", "7a03", "../x", "1&=2"]) assert.equal(stockUrl(bad), null);
  assert.deepEqual(parse("Title\n\nStocks\n- 7203 | トヨタ | Toyota | stated | x\n\nOther companies\n- ---- | 某社 | Firm | stated | y")
    .map(block => block.type), ["title", "heading", "list", "heading", "list"]);
});

test("vocabulary bullets parse the pipe format and the older dash format, and reject other bullets", () => {
  const { term } = context.magazineSummary;
  assert.deepEqual({ ...term("両立 | りょうりつ | balancing two things | at once") },
    { term: "両立", reading: "りょうりつ", meaning: "balancing two things | at once" });
  assert.deepEqual({ ...term("**負担** | ふたん | burden") }, { term: "負担", reading: "ふたん", meaning: "burden" });
  assert.deepEqual({ ...term("通勤時間（つうきんじかん）— commuting time") }, { term: "通勤時間", reading: "つうきんじかん", meaning: "commuting time" });
  assert.equal(term("Employees reported less commuting."), null);
  assert.deepEqual(parse("- 両立 | りょうりつ | balance\n- 負担 | ふたん | burden").map(block => block.type), ["list"]);
});
