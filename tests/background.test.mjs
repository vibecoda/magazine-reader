import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { ROOT } from "../host/paths.mjs";

const URL_READER = "https://magazine.rakuten.co.jp/read/test";
const source = readFileSync(join(ROOT, "chrome", "background.js"), "utf8");
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
function fixture({ store = {}, active = { id: 1, windowId: 2, url: URL_READER } } = {}) {
  const sent = [], ports = [], captures = [], badges = [];
  const chrome = {
    action: { onClicked: event(), setBadgeText: async data => badges.push(data), setTitle: async () => {} },
    scripting: { executeScript: async () => [{ documentId: "document-one" }] },
    storage: { session: {
      get: async key => ({ [key]: store[key] }), set: async object => Object.assign(store, object),
      remove: async key => { delete store[key]; },
    } },
    tabs: {
      get: async id => ({ ...active, id }),
      query: async () => [active],
      captureVisibleTab: async id => { captures.push(id); return "data:image/png;base64,fixture"; },
      sendMessage: async (tabId, message) => { sent.push({ tabId, message }); return { ok: true }; },
      onRemoved: event(), onUpdated: event(),
    },
    runtime: { id: "this-extension", onMessage: event(), connectNative: () => {
      const port = { onMessage: event(), onDisconnect: event(), posted: [], disconnected: false,
        postMessage(message) { this.posted.push(message); }, disconnect() { this.disconnected = true; } };
      ports.push(port); return port;
    } },
  };
  vm.runInNewContext(source, { chrome, URL, crypto: webcrypto, setTimeout, clearTimeout });
  const sender = { id: "this-extension", frameId: 0, documentId: "document-one", url: URL_READER, tab: { id: 1 } };
  const ask = payload => new Promise(resolve => chrome.runtime.onMessage.listeners[0]({ channel: "magazine-reader", ...payload }, sender, resolve));
  const click = () => chrome.action.onClicked.listeners[0]({ id: 1, windowId: 2, url: URL_READER });
  return { chrome, store, sent, ports, captures, badges, sender, ask, click };
}

test("capture uses the requested window and stores metadata, never screenshot bytes", async () => {
  const f = fixture(); await f.click();
  assert.deepEqual(f.captures, [2]);
  assert.equal(f.store["capture-1"].documentId, "document-one");
  assert.ok(!JSON.stringify(f.store).includes("base64"));
  assert.equal(f.sent.at(-1).message.type, "select");
});

test("a switched active tab cannot be captured", async () => {
  const f = fixture({ active: { id: 9, url: URL_READER } }); await f.click();
  assert.equal(f.captures.length, 0); assert.equal(f.sent.at(-1).message.type, "error");
});

test("a capture survives service worker restart but rejects another document or origin", async () => {
  const f = fixture(); await f.click();
  const restarted = fixture({ store: f.store });
  const message = { type: "summarize", text: "日本語", id: "request-one", token: f.store["capture-1"].token };
  restarted.sender.documentId = "another-document";
  assert.equal((await restarted.ask(message)).ok, false);
  restarted.sender.documentId = "document-one"; restarted.sender.url = "https://other.example/read/test";
  assert.equal((await restarted.ask(message)).ok, false);
  restarted.sender.url = URL_READER;
  assert.equal((await restarted.ask(message)).ok, true);
  assert.equal(restarted.ports[0].posted[0].text, "日本語");
  await restarted.ask({ type: "cancel", token: message.token });
  assert.equal(restarted.ports[0].disconnected, true);
});

test("only the current request may deliver progress; navigation disconnects the native host", async () => {
  const f = fixture(); await f.click();
  const token = f.store["capture-1"].token;
  await f.ask({ type: "summarize", text: "本文", token, id: "new-job" });
  const port = f.ports[0], before = f.sent.length;
  port.onMessage.listeners[0]({ id: "old-job", summary: "stale", done: true });
  assert.equal(f.sent.length, before);
  port.onMessage.listeners[0]({ id: "new-job", stage: "summarizing" });
  assert.equal(f.sent.at(-1).message.token, token);
  f.chrome.tabs.onUpdated.listeners[0](1, { status: "loading" });
  assert.equal(port.disconnected, true); assert.equal(f.store["capture-1"], undefined);
});

test("missing host errors are actionable and don't leave a live request", async () => {
  const f = fixture(); await f.click(); const token = f.store["capture-1"].token;
  await f.ask({ type: "capture", mode: "ocr", image: "data:image/png;base64,fixture", token, id: "one" });
  f.chrome.runtime.lastError = { message: "Specified native messaging host not found." };
  f.ports[0].onDisconnect.listeners[0]();
  assert.match(f.sent.at(-1).message.error, /install.mjs/);
  delete f.chrome.runtime.lastError;
  assert.equal((await f.ask({ type: "summarize", text: "本文", token, id: "two" })).ok, true);
  await f.ask({ type: "cancel", token });
});

test("reset takes a fresh capture, cancels old processing, and replaces an expired token", async () => {
  const f = fixture(); await f.click();
  const previous = { ...f.store["capture-1"] };
  await f.ask({ type: "summarize", text: "本文", token: previous.token, id: "old-job" });
  f.store["capture-1"].expires = 0;
  assert.equal((await f.ask({ type: "reset", token: previous.token })).ok, true);
  assert.deepEqual(f.captures, [2, 2]);
  assert.equal(f.ports[0].disconnected, true);
  assert.notEqual(f.store["capture-1"].token, previous.token);
  assert.equal(f.sent.at(-1).message.type, "select");
  assert.equal((await f.ask({ type: "summarize", text: "本文", token: previous.token, id: "stale" })).ok, false);
});

test("reset works without old metadata, but rejects another active tab or origin", async () => {
  const f = fixture();
  assert.equal((await f.ask({ type: "reset" })).ok, true);
  f.sender.documentId = "old-document";
  assert.equal((await f.ask({ type: "reset" })).ok, false);
  assert.equal(f.captures.length, 1);
  f.sender.url = "https://other.example";
  assert.equal((await f.ask({ type: "reset" })).ok, false);
  const other = fixture({ active: { id: 9, windowId: 2, url: URL_READER } });
  assert.equal((await other.ask({ type: "reset" })).ok, false);
  assert.equal(other.captures.length, 0);
});

test("native archive metadata comes from the capture, rather than overlay input", async () => {
  const f = fixture(); await f.click(); const saved = f.store["capture-1"];
  await f.ask({ type: "summarize", text: "本文", token: saved.token, id: "one", source: { url: "https://wrong.example" } });
  const posted = f.ports[0].posted[0];
  assert.equal(posted.source.url, URL_READER);
  assert.equal(posted.source.captureId, saved.token);
  assert.equal(posted.source.capturedAt, saved.capturedAt);
  await f.ask({ type: "cancel", token: saved.token });
});

test("questions are bounded and forwarded with their history, never their overlay-supplied source", async () => {
  const f = fixture(); await f.click(); const token = f.store["capture-1"].token;
  assert.equal((await f.ask({ type: "ask", text: "本文", question: " ", token, id: "empty" })).ok, false);
  assert.equal((await f.ask({ type: "ask", text: "本文", question: "x".repeat(2001), token, id: "long" })).ok, false);
  assert.equal((await f.ask({ type: "ask", text: "本文", question: "q", history: Array(9).fill({}), token, id: "deep" })).ok, false);
  const history = [{ question: "Who?", answer: "A firm." }];
  assert.equal((await f.ask({ type: "ask", text: "本文", question: "Why?", history, token, id: "ok" })).ok, true);
  const posted = f.ports[0].posted[0];
  assert.deepEqual([posted.type, posted.text, posted.question, posted.history], ["ask", "本文", "Why?", history]);
  assert.equal(posted.source.url, URL_READER);
  await f.ask({ type: "cancel", token });
});
