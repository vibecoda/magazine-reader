/* global chrome */
const HOST = "io.github.vibecoda.magazine_reader";
const CHANNEL = "magazine-reader";
const jobs = new Map();
const sessionKey = tabId => `capture-${tabId}`;
const supported = url => {
  try { const u = new URL(url); return u.origin === "https://magazine.rakuten.co.jp" && u.pathname.startsWith("/read/"); }
  catch { return false; }
};
const send = (tabId, message) => chrome.tabs.sendMessage(tabId, { channel: CHANNEL, ...message }, { frameId: 0 });

function cancel(tabId) {
  const job = jobs.get(tabId);
  if (job) { jobs.delete(tabId); clearTimeout(job.timer); job.port.disconnect(); }
}

async function assertActive(tab) {
  const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (active?.id !== tab.id || active.url !== tab.url) throw new Error("The active tab changed. Return to the reader and click again.");
}

async function captureReader(tab, expectedDocumentId) {
  if (!supported(tab.url)) throw new Error("Open a Rakuten Magazine reader tab to use Magazine Reader.");
  cancel(tab.id);
  await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  await chrome.storage.session.remove(sessionKey(tab.id));
  const injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["summary.js", "content.js"] });
  if (expectedDocumentId && injected[0]?.documentId !== expectedDocumentId)
    throw new Error("The reader document changed. Click the extension again.");
  const prepared = await send(tab.id, { type: "prepare" });
  if (!prepared?.ok) throw new Error(prepared?.error || "Could not prepare the capture.");
  await assertActive(tab);
  const image = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  await assertActive(tab);
  const capture = { token: crypto.randomUUID(), documentId: injected[0].documentId,
    url: tab.url, capturedAt: new Date().toISOString(), expires: Date.now() + 15 * 60_000 };
  await chrome.storage.session.set({ [sessionKey(tab.id)]: capture });
  await send(tab.id, { type: "select", image, ...capture });
}

chrome.action.onClicked.addListener(async tab => {
  if (!tab?.id) return;
  try {
    await captureReader(tab);
  } catch (error) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" }).catch(() => {});
    await chrome.action.setTitle({ tabId: tab.id, title: error.message }).catch(() => {});
    await send(tab.id, { type: "error", error: error.message }).catch(() => {});
  }
});

const NOT_INSTALLED = "Install the Magazine Reader native host: node host/install.mjs in the magazine-reader repo";

/** Vocabulary cards go one message at a time to their own host process, so they never wait for a summary. */
function kotoba(message) {
  if (!["lookup", "draft", "register"].includes(message.action)) throw new Error("Unknown Kotoba request.");
  const { action, terms, term, reading, lemma, sentence, card } = message;
  const payload = { id: crypto.randomUUID(), type: "kotoba", action, terms, term, reading, lemma, sentence, card };
  if (JSON.stringify(payload).length > 64 * 1024) throw new Error("This Kotoba request is too large.");
  return new Promise(resolve => chrome.runtime.sendNativeMessage(HOST, payload, reply => {
    const failure = chrome.runtime.lastError;
    if (failure) resolve({ ok: false, error: /not found|forbidden/i.test(failure.message || "") ? NOT_INSTALLED : "The native host stopped." });
    else resolve(reply ?? { ok: false, error: "The native host gave no answer." });
  }));
}

async function request(message, sender) {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab || !supported(sender.url))
    throw new Error("Requests must come from the active reader overlay.");
  const tabId = sender.tab.id;
  if (message.type === "reset") {
    const tab = await chrome.tabs.get(tabId);
    await assertActive(tab);
    await captureReader(tab, sender.documentId);
    return { ok: true };
  }
  const capture = (await chrome.storage.session.get(sessionKey(tabId)))[sessionKey(tabId)];
  if (!capture || capture.token !== message.token || capture.documentId !== sender.documentId
    || capture.url !== sender.url || capture.expires < Date.now())
    throw new Error("This capture expired. Click the extension to capture again.");
  if (message.type === "cancel") { cancel(tabId); return { ok: true }; }
  if (message.type === "kotoba") return kotoba(message);
  if (!["capture", "summarize", "ask"].includes(message.type)) throw new Error("Unknown overlay request.");
  if (typeof message.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(message.id)) throw new Error("Invalid request ID.");
  if (jobs.has(tabId)) throw new Error("A request is already running.");
  const images = message.type === "capture" ? message.images : [];
  if (message.type === "capture" && (!Array.isArray(images) || !images.length || images.length > 12
    || !images.every(image => typeof image === "string" && /^data:image\/png;base64,/.test(image))
    || images.reduce((total, image) => total + image.length, 0) > 28 * 1024 * 1024 || !["ocr", "summary"].includes(message.mode)))
    throw new Error("Invalid or oversized screenshot.");
  if (message.firstPart !== undefined && (!Number.isInteger(message.firstPart) || message.firstPart < 1 || message.firstPart > 99))
    throw new Error("Invalid article part number.");
  // The native host cleans part metadata; this only bounds what is forwarded.
  if (message.parts !== undefined && (!Array.isArray(message.parts) || message.parts.length > 99 || JSON.stringify(message.parts).length > 16_384))
    throw new Error("Invalid article parts.");
  if (message.type === "ask" && (typeof message.question !== "string" || !message.question.trim()
    || message.question.length > 2000 || !Array.isArray(message.history ?? []) || (message.history ?? []).length > 8))
    throw new Error("Ask a question of up to 2,000 characters.");
  if (message.type !== "capture" && (typeof message.text !== "string" || !message.text.trim() || message.text.length > 60_000))
    throw new Error("Supply between 1 and 60,000 characters of OCR text.");
  // The native host checks the exact style list; this only bounds what is forwarded.
  if (message.style !== undefined && (typeof message.style !== "string" || !/^[a-z]{1,20}$/.test(message.style)))
    throw new Error("Unknown summary style.");
  const id = message.id;
  const port = chrome.runtime.connectNative(HOST);
  const job = { id, port, timer: null };
  jobs.set(tabId, job);
  const deliver = event => send(tabId, { type: "progress", token: capture.token, ...event }).catch(() => cancel(tabId));
  const finish = () => { if (jobs.get(tabId) === job) jobs.delete(tabId); clearTimeout(job.timer); port.disconnect(); };
  port.onMessage.addListener(event => {
    if (jobs.get(tabId) !== job || event?.id !== id) return;
    void deliver(event);
    if (event.done) finish();
  });
  port.onDisconnect.addListener(() => {
    const failure = chrome.runtime.lastError;
    if (jobs.get(tabId) !== job) return;
    jobs.delete(tabId); clearTimeout(job.timer);
    const missing = /not found|forbidden/i.test(failure?.message || "");
    void deliver({ id, done: true, ok: false, error: missing
      ? NOT_INSTALLED : "The native host stopped. Check the OCR binary and native host installation." });
  });
  job.timer = setTimeout(() => {
    void deliver({ id, done: true, ok: false, error: "Processing timed out. Try a smaller region." });
    finish();
  }, 130_000 + 15_000 * Math.max(0, images.length - 1));
  try {
    port.postMessage({ id, type: message.type, style: message.style,
      source: { url: capture.url, capturedAt: capture.capturedAt, captureId: capture.token }, parts: message.parts,
      ...(message.type === "capture"
      ? { images, mode: message.mode, firstPart: message.firstPart }
      : message.type === "ask" ? { text: message.text, question: message.question, history: message.history ?? [] }
        : { text: message.text }) });
  } catch (error) { finish(); throw error; }
  return { ok: true, id };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.channel !== CHANNEL) return false;
  request(message, sender).then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => { cancel(tabId); void chrome.storage.session.remove(sessionKey(tabId)); });
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading" || change.url) { cancel(tabId); void chrome.storage.session.remove(sessionKey(tabId)); }
});
