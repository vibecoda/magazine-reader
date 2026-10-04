/* global chrome */
const HOST = "com.dot_home.magazine_reader";
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

chrome.action.onClicked.addListener(async tab => {
  if (!tab?.id) return;
  try {
    if (!supported(tab.url)) throw new Error("Open a Rakuten Magazine reader tab to use Magazine Reader.");
    cancel(tab.id);
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    await chrome.storage.session.remove(sessionKey(tab.id));
    const injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["summary.js", "content.js"] });
    const prepared = await send(tab.id, { type: "prepare" });
    if (!prepared?.ok) throw new Error(prepared?.error || "Could not prepare the capture.");
    await assertActive(tab);
    const image = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    await assertActive(tab);
    const capture = { token: crypto.randomUUID(), documentId: injected[0].documentId,
      url: tab.url, capturedAt: new Date().toISOString(), expires: Date.now() + 15 * 60_000 };
    await chrome.storage.session.set({ [sessionKey(tab.id)]: capture });
    await send(tab.id, { type: "select", image, ...capture });
  } catch (error) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" }).catch(() => {});
    await chrome.action.setTitle({ tabId: tab.id, title: error.message }).catch(() => {});
    await send(tab.id, { type: "error", error: error.message }).catch(() => {});
  }
});

async function request(message, sender) {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab || !supported(sender.url))
    throw new Error("Requests must come from the active reader overlay.");
  const tabId = sender.tab.id;
  const capture = (await chrome.storage.session.get(sessionKey(tabId)))[sessionKey(tabId)];
  if (!capture || capture.token !== message.token || capture.documentId !== sender.documentId
    || capture.url !== sender.url || capture.expires < Date.now())
    throw new Error("This capture expired. Click the extension to capture again.");
  if (message.type === "cancel") { cancel(tabId); return { ok: true }; }
  if (!["capture", "summarize"].includes(message.type)) throw new Error("Unknown overlay request.");
  if (typeof message.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(message.id)) throw new Error("Invalid request ID.");
  if (jobs.has(tabId)) throw new Error("A request is already running.");
  if (message.type === "capture" && (!/^data:image\/png;base64,/.test(message.image || "")
    || message.image.length > 28 * 1024 * 1024 || !["ocr", "summary"].includes(message.mode)))
    throw new Error("Invalid or oversized screenshot.");
  if (message.type === "summarize" && (typeof message.text !== "string" || !message.text.trim() || message.text.length > 60_000))
    throw new Error("Supply between 1 and 60,000 characters of OCR text.");
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
      ? "Install the Magazine Reader native host: node utils/magazine-reader/host/install.mjs"
      : "The native host stopped. Check the OCR binary and native host installation." });
  });
  job.timer = setTimeout(() => {
    void deliver({ id, done: true, ok: false, error: "Processing timed out. Try a smaller region." });
    finish();
  }, 130_000);
  try {
    port.postMessage({ id, type: message.type, ...(message.type === "capture"
      ? { image: message.image, mode: message.mode } : { text: message.text }) });
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
