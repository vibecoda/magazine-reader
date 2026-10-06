/* global chrome */
/* The Library: browses what the native host saved in data/. Read-only; nothing is sent anywhere. */
(() => {
  const HOST = "io.github.vibecoda.magazine_reader";
  // Keep in step with STYLES in content.js. [tab, reading label]
  const STYLES = { bullets: ["Key points", "Key points"], overview: ["Overview", "English summary"], prose: ["Prose", "English summary"],
    detailed: ["Detailed", "Detailed notes"], translation: ["Translation", "English translation"], glossary: ["Vocabulary", "Vocabulary"],
    stocks: ["Stocks", "Stocks mentioned"], ask: ["Ask", "Questions about this page"], ocr: ["Japanese text", "Japanese text"] };
  const FONTS = { serif: `"Iowan Old Style","Charter","Georgia","Hiragino Mincho ProN",serif`, sans: `system-ui,-apple-system,"Helvetica Neue","Hiragino Sans",sans-serif`,
    humanist: `"Avenir Next","Optima","Segoe UI","Hiragino Sans",sans-serif`, mono: `"SF Mono","Menlo","Consolas",monospace` };
  const SPACING = { compact: 1.5, normal: 1.75, airy: 2.05 }, WIDTHS = { narrow: 580, medium: 740, wide: 960 };
  const THEMES = ["paper", "sepia", "night"];
  const M = globalThis.magazineSummary;
  const $ = selector => document.querySelector(selector);
  const list = $(".list"), count = $(".count"), page = $(".page"), search = $(".search");
  let captures = [], selected = null, settings = {}, loadToken = 0;

  const node = (tag, className, text) => {
    const e = document.createElement(tag); if (className) e.className = className;
    if (text !== undefined) e.textContent = text; return e;
  };
  const button = (text, handler, className = "") => {
    const b = node("button", className, text); b.type = "button"; b.addEventListener("click", handler); return b;
  };
  const day = iso => iso ? new Date(iso).toLocaleDateString([], { weekday: "short", year: "numeric", month: "short", day: "numeric" }) : "Undated";
  const time = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const styleOf = entry => entry.style || "ocr";

  function host(payload) {
    return new Promise((resolve, reject) => chrome.runtime.sendNativeMessage(HOST, { id: crypto.randomUUID(), type: "library", ...payload }, reply => {
      const failure = chrome.runtime.lastError;
      if (failure) reject(new Error(/not found|forbidden/i.test(failure.message || "")
        ? "Install the Magazine Reader native host: node host/install.mjs in the magazine-reader repo" : "The native host stopped."));
      else if (!reply?.ok) reject(new Error(reply?.error || "The native host gave no answer."));
      else resolve(reply);
    }));
  }

  // ---- Reading settings are shared with the overlay ----
  function applySettings() {
    const root = document.documentElement.style;
    document.documentElement.dataset.theme = THEMES.includes(settings.theme) ? settings.theme : "paper";
    root.setProperty("--reader-font", FONTS[settings.font] || FONTS.serif);
    root.setProperty("--reader-size", `${Number.isInteger(settings.size) ? settings.size : 18}px`);
    root.setProperty("--reader-leading", String(SPACING[settings.spacing] || SPACING.normal));
    root.setProperty("--reader-align", settings.align === "justify" ? "justify" : "left");
    root.setProperty("--width", `${WIDTHS[settings.width] || WIDTHS.medium}px`);
  }
  async function loadSettings() {
    try { settings = (await chrome.storage.local.get("readerSettings")).readerSettings || {}; } catch { settings = {}; }
    applySettings();
  }
  $(".theme").addEventListener("click", () => {
    settings = { ...settings, theme: THEMES[(Math.max(0, THEMES.indexOf(settings.theme)) + 1) % THEMES.length] };
    applySettings();
    try { void chrome.storage.local.set({ readerSettings: settings }).catch(() => {}); } catch { /* this page only */ }
  });
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes.readerSettings) { settings = changes.readerSettings.newValue || {}; applySettings(); }
  });

  // ---- Rendering (model text becomes DOM; nothing is parsed as HTML) ----
  const appendInline = (target, value) => {
    for (const part of M.inline(value)) target.append(part.type === "text" ? document.createTextNode(part.text) : node(part.type, "", part.text));
  };
  function stockRow(row) {
    const li = node("li", "stock"), url = row.code && M.stockUrl(row.code);
    if (url) li.append(Object.assign(node("a", "ticker", row.code), { href: url, target: "_blank", rel: "noopener noreferrer" }));
    else li.append(node("span", "ticker none", "—"));
    const body = node("div"), name = node("div", "stock-name"), en = node("strong");
    appendInline(en, row.en || row.ja); name.append(en);
    if (row.ja && row.en) { const ja = node("span", "stock-ja", row.ja); ja.lang = "ja"; name.append(ja); }
    if (row.code && row.source === "inferred") name.append(node("span", "badge", "verify code"));
    body.append(name);
    if (row.note) { const note = node("div", "stock-note"); appendInline(note, row.note); body.append(note); }
    li.append(body); return li;
  }
  function renderBlocks(target, text, { lead = true } = {}) {
    let firstParagraph = lead;
    for (const block of M.parse(text)) {
      if (block.type === "list" && block.items.every(item => M.stock(item)) && block.items.some(item => M.stock(item).code)) {
        const ul = node("ul", "stocks"); for (const item of block.items) ul.append(stockRow(M.stock(item))); target.append(ul); continue;
      }
      if (block.type === "list" && block.items.every(item => M.term(item))) {
        const ul = node("ul", "vocab");
        for (const item of block.items) {
          const { term, reading, meaning } = M.term(item), li = node("li"), word = node("div", "vocab-word");
          const ja = node("span", "vocab-term", term); ja.lang = "ja"; word.append(ja);
          if (reading) { const kana = node("span", "vocab-reading", reading); kana.lang = "ja"; word.append(kana); }
          const gloss = node("div"); appendInline(gloss, meaning); li.append(word, gloss); ul.append(li);
        }
        target.append(ul); continue;
      }
      if (block.type === "list") {
        const ul = node(block.ordered ? "ol" : "ul");
        for (const item of block.items) { const li = node("li"); appendInline(li, item); ul.append(li); }
        target.append(ul); continue;
      }
      const element = node(block.type === "title" ? "h3" : block.type === "heading" ? "h4" : "p",
        block.type === "note" ? "note" : block.type === "paragraph" && firstParagraph ? "lead" : "");
      if (block.type === "note") element.append(node("span", "note-label", "Limits of this excerpt"));
      if (block.type === "paragraph") firstParagraph = false;
      appendInline(element, block.text); target.append(element);
    }
  }
  /** Ask entries are saved as "## Question … ## Answer …". */
  function turnOf(summary) {
    const match = String(summary || "").match(/^## Question\s+([\s\S]*?)\s+## Answer\s+([\s\S]*)$/);
    return match ? { question: match[1].trim(), answer: match[2].trim() } : { question: "", answer: String(summary || "") };
  }

  // ---- The list of captures ----
  function renderList() {
    list.replaceChildren();
    let lastDay = null;
    for (const capture of captures) {
      const label = day(capture.capturedAt);
      if (label !== lastDay) { list.append(node("div", "day", label)); lastDay = label; }
      const item = button("", () => void open(capture.key), "item");
      item.dataset.key = capture.key; item.setAttribute("aria-current", String(capture.key === selected?.key));
      const snippet = node("span", "item-snippet", capture.snippet); snippet.lang = "ja";
      item.append(node("span", "item-title", capture.title || capture.snippet.slice(0, 40) || "Untitled capture"), snippet);
      const meta = node("span", "item-meta"); meta.append(time(capture.capturedAt));
      for (const style of [...new Set(capture.entries.map(styleOf))]) meta.append(node("span", "pill", STYLES[style]?.[0] || style));
      item.append(meta); list.append(item);
    }
  }
  async function refresh() {
    const token = ++loadToken, query = search.value.trim();
    count.textContent = query ? "Searching…" : "Loading…";
    try {
      const reply = await host({ action: "list", query });
      if (token !== loadToken) return;
      captures = reply.captures;
      count.textContent = reply.total ? `${reply.total} saved capture${reply.total === 1 ? "" : "s"}${query ? ` matching “${query}”` : ""}`
        + (reply.total > captures.length ? ` · showing the newest ${captures.length}` : "") : query ? "Nothing matches." : "Nothing saved yet.";
      renderList();
      const wanted = selected?.key || decodeURIComponent(location.hash.slice(1));
      if (!selected && captures.some(capture => capture.key === wanted)) void open(wanted);
    } catch (error) { if (token === loadToken) count.textContent = error.message; }
  }
  let searchTimer = null;
  search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(refresh, 250); });

  // ---- One capture ----
  async function open(key) {
    const capture = captures.find(item => item.key === key);
    if (!capture) return;
    history.replaceState(null, "", `#${encodeURIComponent(key)}`);
    selected = { key, capture, data: null, style: null, version: {} };
    for (const item of list.querySelectorAll(".item")) item.setAttribute("aria-current", String(item.dataset.key === key));
    page.replaceChildren(node("p", "empty", "Opening…"));
    try {
      const data = await host({ action: "read", ids: capture.entries.map(entry => entry.id) });
      if (selected?.key !== key) return;
      selected.data = data;
      const summaries = data.entries.filter(entry => entry.summary);
      selected.style = styleOf(summaries.findLast(entry => entry.style !== "ask") || summaries.at(-1) || data.entries.at(-1) || {});
      renderCapture();
      $("main").scrollTop = 0;
    } catch (error) {
      if (selected?.key === key) { const p = node("p", "status error", error.message); p.setAttribute("role", "alert"); page.replaceChildren(p); }
    }
  }
  function renderCapture() {
    const { capture, data, style } = selected;
    const byStyle = new Map();
    for (const entry of data.entries) {
      const key = styleOf(entry);
      if (key !== "ocr" && !entry.summary) continue; // a request that failed or was cancelled saved only its text
      if (!byStyle.has(key)) byStyle.set(key, []);
      byStyle.get(key).push(entry);
    }
    if (!byStyle.size && data.entries.length) byStyle.set("ocr", data.entries);
    const keys = Object.keys(STYLES).filter(key => byStyle.has(key));
    const active = byStyle.has(style) ? style : keys[0];
    const out = [];
    const meta = node("div", "meta");
    meta.append(`Captured ${day(capture.capturedAt)}, ${time(capture.capturedAt)}`);
    if (capture.url) meta.append(Object.assign(node("a", "", "Open magazine"), { href: capture.url, target: "_blank", rel: "noopener noreferrer",
      title: "Opens the magazine on Rakuten; it may not open at this page" }));
    out.push(meta);
    const tabs = node("div", "tabs"); tabs.setAttribute("role", "tablist");
    for (const key of keys) {
      const versions = byStyle.get(key).length;
      const tab = button(versions > 1 && key !== "ask" ? `${STYLES[key][0]} ·${versions}` : STYLES[key][0], () => { selected.style = key; renderCapture(); }, "tab");
      tab.setAttribute("role", "tab"); tab.setAttribute("aria-selected", String(key === active));
      if (versions > 1 && key !== "ask") tab.title = `${versions} saved versions`;
      tabs.append(tab);
    }
    if (keys.length) out.push(tabs);
    if (data.omitted) out.push(node("p", "status error", `${data.omitted} saved request${data.omitted === 1 ? " is" : "s are"} too large to show here. Open the folder to read ${data.omitted === 1 ? "it" : "them"}.`));
    const entries = byStyle.get(active) || [];
    let shown = entries.at(-1), text = "";
    const body = node("article", "summary");
    if (active === "ask") {
      for (const entry of entries) {
        const { question, answer } = turnOf(entry.summary), turn = node("div", "turn"), reply = node("div", "answer");
        if (question) turn.append(node("div", "question", question));
        renderBlocks(reply, answer, { lead: false });
        reply.querySelectorAll("h3").forEach(h => { const p = node("p"); p.append(...h.childNodes); h.replaceWith(p); });
        turn.append(reply); body.append(turn);
      }
      text = entries.map(entry => turnOf(entry.summary)).map(({ question, answer }) => `Q: ${question}\n\n${answer}`).join("\n\n---\n\n");
    } else if (active === "ocr" || !shown) {
      const ja = node("div", "japanese", data.texts[shown?.textIndex] ?? ""); ja.lang = "ja"; body.append(ja);
      text = data.texts[shown?.textIndex] ?? "";
    } else {
      const index = Math.min(selected.version[active] ?? entries.length - 1, entries.length - 1);
      shown = entries[index];
      if (entries.length > 1) {
        const versions = node("div", "versions"), older = button("‹ Older", () => { selected.version[active] = index - 1; renderCapture(); });
        const newer = button("Newer ›", () => { selected.version[active] = index + 1; renderCapture(); });
        older.disabled = index === 0; newer.disabled = index === entries.length - 1;
        versions.append(older, `Version ${index + 1} of ${entries.length} · ${time(shown.savedAt)}`, newer);
        out.push(versions);
      }
      renderBlocks(body, shown.summary);
      if (shown.truncated) body.append(node("p", "note", "This output reached the length limit when it was made."));
      text = M.copyText(shown.summary);
    }
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const label = node("div", "reading-label");
    label.append(node("span", "", STYLES[active]?.[1] || ""), node("span", "",
      active === "ask" ? `${entries.length} answered` : active === "ocr" ? `${text.replace(/\s/g, "").length} characters`
        : body.querySelector(".vocab") ? `${body.querySelectorAll(".vocab>li").length} terms` : `${words} words`));
    out.push(label, body);
    if (active !== "ocr" && shown) {
      const details = node("details"), ja = node("div", "japanese", data.texts[shown.textIndex] ?? "");
      ja.lang = "ja";
      const edited = new Set(data.entries.map(entry => entry.textIndex)).size > 1;
      details.append(node("summary", "", edited ? "Japanese text used for this version (edited between requests)" : "Japanese text"), ja);
      out.push(details);
    }
    const actions = node("div", "actions");
    const copy = button("Copy", async () => {
      try { await navigator.clipboard.writeText(text); copy.textContent = "Copied"; setTimeout(() => { copy.textContent = "Copy"; }, 1600); }
      catch { copy.textContent = "Copy failed"; }
    });
    copy.disabled = !text;
    actions.append(copy, node("span", "spacer"));
    if (shown) {
      const path = node("span", "path", shown.directory); path.title = `Saved ${shown.savedAt ? new Date(shown.savedAt).toLocaleString() : ""}${shown.model ? ` · ${shown.model}` : ""}`;
      actions.append(path);
    }
    out.push(actions);
    page.replaceChildren(...out);
  }

  document.addEventListener("keydown", event => {
    if (event.target.matches("input, textarea") || event.metaKey || event.ctrlKey || event.altKey) {
      if (event.key === "Escape" && event.target === search && search.value) { search.value = ""; void refresh(); }
      return;
    }
    if (event.key === "/") { event.preventDefault(); search.focus(); return; }
    // Arrows scroll the reading pane unless focus is in the list; j and k work anywhere.
    if (!["j", "k"].includes(event.key) && !(["ArrowDown", "ArrowUp"].includes(event.key) && event.target.closest?.(".sidebar"))) return;
    const index = captures.findIndex(capture => capture.key === selected?.key);
    const next = captures[Math.max(0, Math.min(captures.length - 1, index + (["j", "ArrowDown"].includes(event.key) ? 1 : -1)))];
    if (next && next.key !== selected?.key) {
      event.preventDefault(); void open(next.key);
      list.querySelector(`[data-key="${CSS.escape(next.key)}"]`)?.scrollIntoView({ block: "nearest" });
    }
  });

  void loadSettings().then(refresh);
})();
