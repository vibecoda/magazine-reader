import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { endianness, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ask, askMessages, cleanText, cleanThread, deepseekKey, deepseekKeySource, ENDPOINT, joinParts, MODEL, STYLES, summarize, systemPrompt } from "../host/deepseek.mjs";
import { handle } from "../host/host.mjs";
import { decodeImage, recognize } from "../host/ocr.mjs";
import { extensionId, HOST_NAME, ROOT } from "../host/paths.mjs";
import { decodeMessages, encodeMessage, MAX_INPUT, MAX_OUTPUT } from "../host/protocol.mjs";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

test("native framing preserves split headers, split bodies, batched frames, and Japanese", () => {
  const messages = [{ id: "one", text: "経済と金融" }, { id: "two", ok: true }];
  const stream = Buffer.concat(messages.map(encodeMessage));
  let buffer = Buffer.alloc(0), received = [];
  for (const byte of stream) {
    const decoded = decodeMessages(Buffer.concat([buffer, Buffer.from([byte])]));
    buffer = decoded.rest; received.push(...decoded.messages);
  }
  assert.deepEqual(received, messages); assert.equal(buffer.length, 0);
  assert.deepEqual(decodeMessages(stream).messages, messages);
});

test("native framing rejects oversized input immediately and oversized output", () => {
  const header = Buffer.alloc(4);
  if (endianness() === "LE") header.writeUInt32LE(MAX_INPUT + 1); else header.writeUInt32BE(MAX_INPUT + 1);
  assert.throws(() => decodeMessages(header), /size/);
  assert.throws(() => encodeMessage({ text: "あ".repeat(MAX_OUTPUT) }), /too large/);
});

test("DeepSeek key lookup prefers the environment, then the key file, then ~/.env2, without sourcing shell", () => {
  const dir = mkdtempSync(join(tmpdir(), "magazine-key-test-"));
  try {
    const envPath = join(dir, "env"), keyFile = join(dir, "deepseek-api-key"), missing = join(dir, "missing");
    writeFileSync(envPath, 'OTHER=ignore\nexport DEEPSEEK_API_KEY="fake-test-key=123" # comment\n');
    assert.equal(deepseekKey({ env: {}, keyFile: missing, envPath }), "fake-test-key=123");
    assert.equal(deepseekKey({ env: { DEEPSEEK_API_KEY: " override " }, keyFile, envPath }), "override");
    writeFileSync(keyFile, "file-key\n");
    assert.deepEqual(deepseekKeySource({ env: {}, keyFile, envPath }), { key: "file-key", source: keyFile });
    assert.equal(deepseekKey({ env: {}, keyFile: missing, envPath: missing }), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("summary sends only text to the fixed DeepSeek endpoint with thinking off", async () => {
  const result = await summarize("\n日本語の本文\n", { key: "fake-test-key", fetchImpl: async (url, options) => {
    assert.equal(url, ENDPOINT); assert.equal(options.redirect, "error");
    const body = JSON.parse(options.body);
    assert.equal(body.model, MODEL); assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(body.messages[0].role, "system"); assert.match(body.messages[0].content, /untrusted/);
    assert.deepEqual(body.messages[1], { role: "user", content: "日本語の本文" });
    assert.equal(body.messages.length, 2);
    assert.ok(!options.body.includes("data:image") && !options.body.includes("rakuten"));
    return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "English summary" } }] }) };
  } });
  assert.equal(result.summary, "English summary"); assert.equal(result.truncated, false);
});

test("each summary style shapes the prompt and output budget, and unknown styles are rejected", async () => {
  const seen = {};
  for (const style of Object.keys(STYLES)) {
    const result = await summarize("日本語", { style, key: "test", fetchImpl: async (_url, options) => {
      seen[style] = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "Out" } }] }) };
    } });
    assert.equal(result.style, style);
    assert.equal(seen[style].max_tokens, STYLES[style].tokens);
    assert.match(seen[style].messages[0].content, /untrusted/);
  }
  assert.match(systemPrompt("translation"), /^Translate/);
  assert.match(systemPrompt("bullets"), /3–5 concise/);
  assert.notEqual(seen.prose.messages[0].content, seen.detailed.messages[0].content);
  await assert.rejects(summarize("日本語", { style: "constructor", key: "test" }), /Unknown summary style/);
  await assert.rejects(handle({ id: "x", type: "summarize", text: "日本語", style: "poem" }, { archive: () => assert.fail("archived") }), /Unknown summary style/);
});

test("questions send the excerpt once, then earlier turns in order, and validate their inputs", async () => {
  let body;
  const result = await ask("記事の本文", { key: "test", question: " And the cost? ",
    history: [{ question: "Who ran it?", answer: "A company." }], fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "Not stated." } }] }) };
    } });
  assert.equal(result.answer, "Not stated.");
  assert.deepEqual(body.messages.map(m => m.role), ["system", "user", "assistant", "user"]);
  assert.match(body.messages[0].content, /untrusted/);
  assert.match(body.messages[1].content, /記事の本文[\s\S]*Question: Who ran it\?/);
  assert.equal(body.messages[3].content, "And the cost?");
  assert.equal(body.messages.filter(m => m.content.includes("記事の本文")).length, 1);
  assert.throws(() => cleanThread({ question: " " }), /Type a question/);
  assert.throws(() => cleanThread({ question: "x".repeat(2001) }), /under 2,000/);
  assert.throws(() => cleanThread({ question: "q", history: Array(9).fill({ question: "q", answer: "a" }) }), /history/);
  assert.throws(() => cleanThread({ question: "q", history: [{ question: "q", answer: 3 }] }), /history/);
  await assert.rejects(ask("本文", { key: "test", question: "q", fetchImpl: async () => ({ ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content: "" } }] }) }) }), /empty answer/);
});

test("API failures have useful errors without relaying provider bodies or keys", async () => {
  for (const [status, expected] of [[401, /rejected/], [402, /balance/], [429, /busy/], [500, /HTTP 500/]]) {
    await assert.rejects(summarize("日本語", { key: "fake-test-key", fetchImpl: async () => ({ status, ok: false,
      json: async () => { throw new Error("provider-secret"); } }) }), expected);
  }
  await assert.rejects(summarize("日本語", { key: null }), /--set-key/);
  assert.throws(() => cleanText(" "), /No readable text/);
  assert.throws(() => cleanText("あ".repeat(60_001)), /Too much/);
});

test("truncated or empty model output is handled explicitly", async () => {
  const fetchImpl = content => async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: "length", message: { content } }] }) });
  assert.equal((await summarize("日本語", { key: "test", fetchImpl: fetchImpl("Partial summary") })).truncated, true);
  await assert.rejects(summarize("日本語", { key: "test", fetchImpl: fetchImpl("") }), /empty summary/);
});

test("image validation rejects disguised files and excessive decoded dimensions", () => {
  assert.ok(decodeImage(PNG).length > 24);
  assert.throws(() => decodeImage("data:image/png;base64," + Buffer.from("not an image").toString("base64")), /Invalid PNG/);
  const huge = Buffer.from(PNG.split(",")[1], "base64"); huge.writeUInt32BE(50_000, 16);
  assert.throws(() => decodeImage("data:image/png;base64," + huge.toString("base64")), /dimensions/);
  assert.throws(() => decodeImage("file:///tmp/image.png"), /Expected a PNG/);
});

test("OCR uses a private image file and cleans it up on both success and failure", async () => {
  const dir = mkdtempSync(join(tmpdir(), "magazine-ocr-test-"));
  const binary = join(dir, "ocr"), marker = join(dir, "path");
  try {
    writeFileSync(binary, `#!/bin/sh\nprintf '%s' "$1" > '${marker}'\nprintf '日本語のテスト'\n`, { mode: 0o700 });
    assert.equal(await recognize(PNG, { command: binary }), "日本語のテスト");
    assert.equal(existsSync(readFileSync(marker, "utf8")), false);
    writeFileSync(binary, `#!/bin/sh\nprintf '%s' "$1" > '${marker}'\nexit 1\n`, { mode: 0o700 });
    await assert.rejects(recognize(PNG, { command: binary }), /OCR failed/);
    assert.equal(existsSync(readFileSync(marker, "utf8")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("OCR-only never invokes DeepSeek; summary errors leave the recognized text available", async () => {
  const events = [];
  const options = { emit: e => events.push(e), ocr: async () => "本文", llm: async () => { throw new Error("network failed"); },
    archive: () => ({ info: { directory: "fixture" } }) };
  assert.deepEqual(await handle({ id: "test", type: "capture", image: PNG, mode: "ocr" }, options), { text: "本文", archive: { directory: "fixture" } });
  await assert.rejects(handle({ id: "test", type: "capture", image: PNG, mode: "summary" }, options), /network failed/);
  assert.ok(events.some(e => e.stage === "recognized" && e.text === "本文"));
});

test("several boxes are recognized in order and joined as numbered parts of one article", async () => {
  const events = [], seen = [];
  const options = { emit: e => events.push(e), archive: () => ({ info: {} }),
    ocr: async image => { seen.push(image); return `本文${seen.length}`; } };
  const one = await handle({ id: "one", type: "capture", image: PNG, mode: "ocr" }, options);
  assert.equal(one.text, "本文1");
  seen.length = 0;
  const boxes = await handle({ id: "two", type: "capture", images: [PNG, `${PNG}#2`], mode: "ocr" }, options);
  assert.deepEqual(seen, [PNG, `${PNG}#2`]);
  assert.equal(boxes.text, "――― Part 1 ―――\n本文1\n\n――― Part 2 ―――\n本文2");
  assert.deepEqual(events.filter(e => e.id === "two" && e.stage === "recognizing").map(e => [e.box, e.boxes]), [[1, 2], [2, 2]]);
  seen.length = 0;
  const later = await handle({ id: "three", type: "capture", images: [PNG], firstPart: 3, mode: "ocr" }, options);
  assert.equal(later.text, "――― Part 3 ―――\n本文1");
  assert.equal(joinParts(["a"]), "a");
  await assert.rejects(handle({ id: "x", type: "capture", images: [], mode: "ocr" }, options), /between 1 and 12/);
  await assert.rejects(handle({ id: "x", type: "capture", images: Array(13).fill(PNG), mode: "ocr" }, options), /between 1 and 12/);
  await assert.rejects(handle({ id: "x", type: "capture", images: [PNG], firstPart: 0, mode: "ocr" }, options), /part number/);
  options.ocr = async image => { if (image.endsWith("#2")) throw new Error("No readable text. Select a larger or clearer region."); return "本文"; };
  await assert.rejects(handle({ id: "x", type: "capture", images: [PNG, `${PNG}#2`], mode: "ocr" }, options), /Box 2 has no readable text/);
  await assert.rejects(handle({ id: "x", type: "capture", images: [`${PNG}#2`], mode: "ocr" }, options), /^Error: No readable text/);
});

test("prompts explain the part markers for summaries and questions", () => {
  for (const style of Object.keys(STYLES)) assert.match(systemPrompt(style), /――― Part 2 ―――[\s\S]*one continuous article/);
  assert.match(askMessages("本文", { question: "q", history: [] })[0].content, /one continuous article/);
});

test("cancelling OCR aborts its executable and removes the temporary screenshot", async () => {
  const dir = mkdtempSync(join(tmpdir(), "magazine-abort-test-"));
  const binary = join(dir, "ocr"), marker = join(dir, "path");
  const controller = new AbortController();
  try {
    writeFileSync(binary, `#!/bin/sh\nprintf '%s' "$1" > '${marker}'\nexec /bin/sleep 10\n`, { mode: 0o700 });
    const pending = recognize(PNG, { command: binary, signal: controller.signal });
    const rejected = assert.rejects(pending, /Cancelled/);
    for (let i = 0; i < 100 && !existsSync(marker); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(existsSync(marker));
    controller.abort(); await rejected;
    assert.equal(existsSync(readFileSync(marker, "utf8")), false);
  } finally { controller.abort(); rmSync(dir, { recursive: true, force: true }); }
});

test("installer pins node, OCR, and exactly this extension, replaces the legacy host, and stores a piped key privately", () => {
  const dir = mkdtempSync(join(tmpdir(), "magazine-install-test-"));
  try {
    const data = join(dir, "data"), hosts = join(dir, "hosts"), args = ["--data-dir", data, "--hosts-dir", hosts];
    mkdirSync(hosts); writeFileSync(join(hosts, "com.dot_home.magazine_reader.json"), "{}"); writeFileSync(join(hosts, "other.json"), "{}");
    const run = (extra, input) => execFileSync(process.execPath, [join(ROOT, "host", "install.mjs"), ...extra, ...args], { input, encoding: "utf8" });
    run(["--ocr", "/bin/echo"], "");
    const manifest = JSON.parse(readFileSync(join(hosts, `${HOST_NAME}.json`), "utf8"));
    assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${extensionId()}/`]);
    const launcher = readFileSync(manifest.path, "utf8");
    assert.ok(launcher.includes(process.execPath)); assert.match(launcher, /MAGAZINE_OCR_BINARY='\/bin\/echo'/);
    assert.deepEqual(readdirSync(hosts).sort(), [`${HOST_NAME}.json`, "other.json"]);
    const output = run(["--set-key"], "sk-test-piped\n");
    assert.ok(!output.includes("sk-test-piped"));
    const keyFile = join(data, "deepseek-api-key");
    assert.equal(readFileSync(keyFile, "utf8"), "sk-test-piped\n");
    assert.equal(statSync(keyFile).mode & 0o777, 0o600);
    assert.throws(() => run(["--set-key"], "two words\n"));
    assert.match(run(["--check"], ""), /DeepSeek key: found/);
    run(["--remove-key"], ""); assert.equal(existsSync(keyFile), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("native host rejects another extension before handling any request", async () => {
  const child = spawn(process.execPath, [join(ROOT, "host", "host.mjs"), "chrome-extension://untrusted/"], { stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", data => { output += data; });
  const code = await new Promise(resolve => child.on("close", resolve));
  assert.equal(code, 1); assert.equal(output, "");
});
