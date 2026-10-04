/* global chrome */
(() => {
  if (globalThis.__magazineReaderLoaded) return;
  globalThis.__magazineReaderLoaded = true;
  const CHANNEL = "magazine-reader";
  // Keep the keys in step with STYLES in host/deepseek.mjs. [tab, description, reading label]
  const STYLES = {
    bullets: ["Key points", "A title and 3–5 bullets", "Key points"],
    overview: ["Overview", "An overview paragraph plus key points", "English summary"],
    prose: ["Prose", "A literal summary in flowing paragraphs", "English summary"],
    detailed: ["Detailed", "Section-by-section notes with figures and quotes", "Detailed notes"],
    translation: ["Translation", "A full English translation, not a summary", "English translation"],
    glossary: ["Vocabulary", "The gist plus a Japanese word list", "Gist and vocabulary"],
  };
  const FONTS = {
    serif: ["Serif", `"Iowan Old Style","Charter","Georgia","Hiragino Mincho ProN",serif`],
    sans: ["Sans", `system-ui,-apple-system,"Helvetica Neue","Hiragino Sans",sans-serif`],
    humanist: ["Humanist", `"Avenir Next","Optima","Segoe UI","Hiragino Sans",sans-serif`],
    mono: ["Mono", `"SF Mono","Menlo","Consolas",monospace`],
  };
  const SPACING = { compact: ["Compact", 1.5], normal: ["Normal", 1.75], airy: ["Airy", 2.05] };
  const WIDTHS = { narrow: ["Narrow", 580, 380], medium: ["Medium", 740, 480], wide: ["Wide", 960, 620] };
  const THEMES = { paper: "Paper", sepia: "Sepia", night: "Night" };
  const LAYOUTS = { center: "Centered", left: "Dock left", right: "Dock right" };
  const SIZE = { min: 13, max: 28 };
  const DEFAULTS = { style: "overview", font: "serif", size: 18, spacing: "normal", width: "medium",
    theme: "paper", layout: "center", align: "left", toolbarSide: "right" };
  const choices = { style: STYLES, font: FONTS, spacing: SPACING, width: WIDTHS, theme: THEMES, layout: LAYOUTS,
    align: { left: "", justify: "" }, toolbarSide: { left: "", right: "" } };
  const sanitize = saved => {
    const clean = { ...DEFAULTS };
    for (const [key, options] of Object.entries(choices)) if (Object.hasOwn(options, saved?.[key])) clean[key] = saved[key];
    if (Number.isInteger(saved?.size)) clean.size = Math.min(SIZE.max, Math.max(SIZE.min, saved.size));
    return clean;
  };
  let settings = { ...DEFAULTS };
  const settingsReady = (async () => {
    try { settings = sanitize((await chrome.storage?.local?.get("readerSettings"))?.readerSettings); } catch { /* defaults */ }
  })();

  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:none;font-family:system-ui,-apple-system,sans-serif;color:#e8edf3;font-size:14px;color-scheme:dark";
  const root = host.attachShadow({ mode: "closed" });
  (document.body || document.documentElement).append(host);
  const style = document.createElement("style");
  style.textContent = `
    :host{font-family:system-ui,-apple-system,sans-serif;color:#e8edf3;font-size:14px;color-scheme:dark}
    *{box-sizing:border-box}button,textarea,select,input{font:inherit}[hidden]{display:none!important}
    button{cursor:pointer;border:1px solid #3b4c5d;border-radius:8px;background:#223140;color:#e8edf3;padding:9px 12px}
    button:hover{background:#30485c}button:disabled{opacity:.45;cursor:not-allowed}.primary{background:#c6ee98;color:#183019;border:0;font-weight:650}.primary:hover{background:#d9f6b7}
    .selection{position:fixed;inset:0;pointer-events:auto;touch-action:none;cursor:crosshair;background:#14202c}
    .snapshot{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none}
    .rect{position:absolute;border:2px solid #c6ee98;box-shadow:0 0 0 200vmax #0009;pointer-events:none;display:none}
    .toolbar{position:fixed;right:14px;top:14px;width:min(232px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;padding:14px;cursor:auto;pointer-events:auto;border-radius:14px;box-shadow:0 8px 36px #0008;background:#13202df5;border:1px solid #415263}
    .toolbar[data-side="left"]{left:14px;right:auto}.toolbar .actions{flex-direction:column}.toolbar .actions button{width:100%}.side-switch{width:100%;margin:9px 0;font-size:12px;padding:6px 9px}
    .toolbar label{display:block;margin-top:12px;font-size:11px;font-weight:600;letter-spacing:.4px;color:#b3c0cb}
    .toolbar select{display:block;width:100%;margin-top:5px;padding:8px 9px;border-radius:8px;border:1px solid #3b4c5d;background:#223140;color:#e8edf3}
    .standby{position:fixed;top:14px;right:14px;pointer-events:auto;display:flex;align-items:center;gap:12px;padding:10px 10px 10px 16px;border-radius:12px;background:#13202df5;border:1px solid #415263;box-shadow:0 8px 30px #0007;max-width:calc(100vw - 28px);animation:fade .15s}
    .standby[data-side="left"]{left:14px;right:auto}.standby .actions{margin:0;flex-wrap:nowrap;gap:6px}.standby button{padding:7px 12px;font-size:12px}.standby .standby-close{background:transparent;font-size:16px;padding:4px 9px}
    h2{font-size:16px;letter-spacing:-.2px;margin:0 0 7px}.muted{color:#b3c0cb;font-size:12px;line-height:1.5}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}

    .reader{position:fixed;inset:0;display:flex;justify-content:center;align-items:center;padding:14px;pointer-events:none}
    .reader[data-layout="center"]{pointer-events:auto;background:#0a1016b3;animation:fade .18s ease-out}
    .reader[data-layout="left"]{justify-content:flex-start}.reader[data-layout="right"]{justify-content:flex-end}
    @keyframes fade{from{opacity:0}}@keyframes rise{from{opacity:0;transform:translateY(10px)}}
    .panel{--bg:#faf8f1;--fg:#293c33;--heading:#203d31;--muted:#6a775e;--accent:#829f62;--line:#d8ddcf;--chrome:#18302b;--chrome-fg:#edf2e9;--chrome-btn:#244138;--chrome-line:#476358;
      --surface:#f0f1e8;--note-bg:#f0eddf;--note-line:#b5aa7b;--note-fg:#66644f;--btn:#fafbf6;--btn-line:#c5ceb9;--btn-fg:#36503e;--primary:#285742;--primary-fg:#f2f5e9;--field:#fffdf8;--error:#a13f32;--error-bg:#f9e9e1;--skeleton:#e7e8dc;
      pointer-events:auto;position:relative;width:min(var(--width),100%);height:100%;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 80px #0007;color-scheme:light}
    .reader[data-layout="center"] .panel{height:min(100%,1000px);animation:rise .22s ease-out}
    .panel[data-theme="sepia"]{--bg:#f6eedc;--fg:#4a3a2a;--heading:#3b2b1c;--muted:#8a7660;--accent:#b0874f;--line:#e3d5b9;--chrome:#3f3123;--chrome-fg:#f6eedc;--chrome-btn:#53412f;--chrome-line:#6d5741;
      --surface:#eee2c9;--note-bg:#ede0c3;--note-line:#c09a5b;--note-fg:#6d5838;--btn:#f9f2e3;--btn-line:#d6c4a0;--btn-fg:#5a4530;--primary:#7a5530;--primary-fg:#fbf4e6;--field:#fbf6ea;--skeleton:#e9dcc0}
    .panel[data-theme="night"]{--bg:#1a1f24;--fg:#d3dade;--heading:#eef2f4;--muted:#8d9aa4;--accent:#8eae66;--line:#2e363e;--chrome:#11161a;--chrome-fg:#e3e9ed;--chrome-btn:#1f272e;--chrome-line:#36414b;
      --surface:#151a1e;--note-bg:#232a30;--note-line:#7c7550;--note-fg:#bdb89e;--btn:#232b32;--btn-line:#38434d;--btn-fg:#d5dbe0;--primary:#9cc070;--primary-fg:#122010;--field:#141a1f;--error:#f0a090;--error-bg:#3a2320;--skeleton:#262e35;color-scheme:dark}
    .panel-top{background:var(--chrome);color:var(--chrome-fg);flex:none;padding:12px 14px 0}
    .header{display:flex;align-items:center;justify-content:space-between;gap:12px}.header h2{margin:0;font-size:14px;font-weight:600;letter-spacing:.1px}
    .brand-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#c6dd9f;margin-right:8px;vertical-align:middle}
    .header-tools{display:flex;gap:6px}.icon-button{min-width:34px;height:32px;padding:0 9px;background:var(--chrome-btn);border-color:var(--chrome-line);color:var(--chrome-fg);font-size:13px;font-weight:600}
    .icon-button:hover,.icon-button[aria-expanded="true"]{background:var(--chrome-line)}.close{font-size:19px;font-weight:400;background:transparent}
    .style-tabs{display:flex;gap:2px;margin:10px -14px 0;padding:0 10px;overflow-x:auto;scrollbar-width:none}
    .style-tab{flex:none;background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;color:var(--chrome-fg);opacity:.7;padding:8px 10px 9px;font-size:12px;font-weight:550;position:relative}
    .style-tab:hover{background:transparent;opacity:1}.style-tab[aria-selected="true"]{opacity:1;border-bottom-color:#c6dd9f}
    .style-tab.cached::after{content:"";position:absolute;top:7px;right:3px;width:5px;height:5px;border-radius:50%;background:#c6dd9f}
    .settings{flex:none;background:var(--surface);border-bottom:1px solid var(--line);padding:14px 16px 12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px 20px;max-height:55%;overflow:auto;animation:fade .15s}
    .setting{display:flex;flex-direction:column;gap:6px;min-width:0}.setting-label{font-size:10px;font-weight:650;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted)}
    .segmented{display:flex;border:1px solid var(--btn-line);border-radius:8px;overflow:hidden;background:var(--btn)}
    .segmented button{flex:1;min-width:0;border:0;border-radius:0;background:transparent;color:var(--btn-fg);padding:6px 4px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .segmented button+button{border-left:1px solid var(--btn-line)}.segmented button:hover{background:var(--surface)}.segmented button[aria-checked="true"]{background:var(--primary);color:var(--primary-fg)}
    .size-row{display:flex;align-items:center;gap:8px}.size-row button{background:var(--btn);border-color:var(--btn-line);color:var(--btn-fg);padding:4px 10px;font-size:12px}.size-row input{flex:1;accent-color:var(--primary);min-width:60px}
    .size-value{font-size:12px;color:var(--muted);min-width:34px;text-align:right;font-variant-numeric:tabular-nums}
    .settings-foot{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:11px;color:var(--muted);flex-wrap:wrap}
    .link{background:none;border:0;padding:0;color:var(--btn-fg);text-decoration:underline;font-size:11px}.link:hover{background:none}
    kbd{font:600 10px/1 ui-monospace,monospace;border:1px solid var(--btn-line);border-bottom-width:2px;border-radius:4px;padding:2px 4px;background:var(--btn)}
    .progress{flex:none;height:2px;background:transparent}.progress span{display:block;height:100%;width:0;background:var(--accent);transition:width .1s linear}
    .panel-body{overflow:auto;min-height:0;flex:1;padding:22px clamp(18px,5%,44px) 34px;scrollbar-color:var(--btn-line) transparent;scrollbar-width:thin;scroll-behavior:smooth}
    .capture-time{color:var(--muted);font-size:11px;line-height:1.5}.status{margin:12px 0;color:var(--accent);font-size:12px;line-height:1.5}.status.error{color:var(--error);background:var(--error-bg);padding:10px;border-radius:8px}
    .reading-label{font-size:10px;font-weight:650;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);padding:16px 0 14px;border-top:1px solid var(--line);margin-top:14px;display:flex;justify-content:space-between;gap:10px}
    .summary{font-family:var(--reader-font);font-size:var(--reader-size);line-height:var(--reader-leading);text-align:var(--reader-align);hyphens:auto;overflow-wrap:break-word;color:var(--fg)}
    .summary h3{font-size:1.7em;font-weight:650;line-height:1.2;letter-spacing:-.02em;color:var(--heading);margin:0 0 .9em;text-align:left;hyphens:manual;text-wrap:balance}
    .panel[data-font="serif"] .summary h3{font-weight:400}
    .summary h4{font:650 11px/1.5 system-ui,sans-serif;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin:2em 0 .8em;text-align:left}
    .summary p{margin:0 0 1em}.summary .lead{font-size:1.06em}.summary ul,.summary ol{margin:.8em 0 1.4em;padding-left:1.3em}.summary li{padding-left:.35em;margin:0 0 .7em}.summary li::marker{color:var(--accent)}
    .summary strong{color:var(--heading)}
    .summary .note{background:var(--note-bg);border-left:3px solid var(--note-line);border-radius:0 7px 7px 0;padding:.8em 1em;font-size:.8em;line-height:1.65;color:var(--note-fg);margin:1.6em 0;font-family:system-ui,sans-serif;text-align:left}
    .note-label{display:block;font:650 10px/1.5 system-ui,sans-serif;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px}
    .skeleton{padding:4px 0 10px}.skeleton i{display:block;height:.9em;margin:0 0 1em;border-radius:5px;background:linear-gradient(90deg,var(--skeleton) 30%,var(--bg) 50%,var(--skeleton) 70%) 0 0/300% 100%;animation:shimmer 1.4s linear infinite;font-size:var(--reader-size)}
    .skeleton i:first-child{height:1.6em;width:65%;margin-bottom:1.4em}.skeleton i:nth-child(3n){width:82%}.skeleton i:nth-child(4n){width:58%}
    @keyframes shimmer{to{background-position:-300% 0}}
    @media(prefers-reduced-motion:reduce){.skeleton i,.reader,.panel,.settings{animation:none}.panel-body{scroll-behavior:auto}}
    details{border-top:1px solid var(--line);padding-top:14px;margin-top:20px}summary{cursor:pointer;color:var(--muted);font-size:12px;font-weight:550;line-height:1.5}
    textarea{display:block;width:100%;height:240px;resize:vertical;background:var(--field);color:var(--fg);border:1px solid var(--btn-line);border-radius:8px;padding:13px;line-height:1.8;margin-top:12px;font-size:15px;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",system-ui,sans-serif}
    .preview{width:100%;max-height:220px;object-fit:contain;background:var(--surface);border-radius:6px;margin-top:12px}
    .panel-bottom{padding:11px 14px 12px;background:var(--surface);border-top:1px solid var(--line);flex:none}
    .panel-bottom .actions{margin:0;gap:7px;align-items:center}.panel-bottom .spacer{flex:1}
    .panel-bottom button{background:var(--btn);border-color:var(--btn-line);color:var(--btn-fg);font-size:12px;padding:8px 12px}.panel-bottom button:hover{background:var(--bg)}
    .panel-bottom button.primary{background:var(--primary);border-color:var(--primary);color:var(--primary-fg)}.panel-bottom button.primary:hover{filter:brightness(1.1)}
    .footnote{display:flex;justify-content:space-between;gap:10px;margin-top:8px;font-size:10px;line-height:1.5;color:var(--muted);flex-wrap:wrap}.archive-status{color:var(--accent);overflow-wrap:anywhere}
    .panel button:focus-visible,.panel summary:focus-visible,.panel textarea:focus-visible,.panel input:focus-visible,.toolbar :focus-visible{outline:2px solid var(--accent,#8eae66);outline-offset:2px}
    @media(max-width:600px){.toolbar{padding:12px}button{padding:8px 10px}.reader{padding:6px}.panel-body{padding:18px}.settings{grid-template-columns:1fr}}
  `;
  root.append(style);
  let ui = null, capture = null, image = null, region = null, busy = false, jobId = null, jobStyle = null;
  let resetting = false, archiveInfo = null, settingsOpen = false;
  let ocrText = "", cropped = "", activeStyle = DEFAULTS.style;
  const summaries = new Map(); // style → { text, source, truncated }
  let panel = null, panelStatus = null, summaryNode = null, skeleton = null, readingLabel = null, textArea = null, archiveNode = null;
  let summarizeButton = null, copyButton = null, cancelButton = null, settingsButton = null, settingsSheet = null, tabButtons = [];
  const syncers = [];
  const node = (tag, className, text) => {
    const e = document.createElement(tag); if (className) e.className = className;
    if (text !== undefined) e.textContent = text; return e;
  };
  const button = (text, handler, className = "") => {
    const b = node("button", className, text); b.type = "button"; b.addEventListener("click", handler); return b;
  };
  const isReader = () => ui?.classList.contains("reader");
  const current = () => summaries.get(activeStyle);
  const ask = payload => chrome.runtime.sendMessage({ channel: CHANNEL, token: capture?.token, ...payload });
  function resetUI(next) { if (ui) ui.remove(); ui = next; root.append(ui); host.style.display = "block"; }
  function close() {
    if (capture) void ask({ type: "cancel" }).catch(() => {});
    busy = false; jobId = null; host.style.display = "none";
  }
  async function restartCapture() {
    if (resetting) return;
    resetting = true; busy = false; jobId = null;
    try {
      const response = await ask({ type: "reset" });
      if (!response?.ok) throw new Error(response?.error || "Could not start a new capture. Click the extension again.");
    } catch (error) { showPanel(); updateBusy(false); setStatus(error.message, true); }
    finally { resetting = false; }
  }
  // Steps aside so the magazine can be turned; the screenshot is only taken on "Capture page".
  function standby() {
    if (busy && capture) void ask({ type: "cancel" }).catch(() => {});
    if (busy) setStatus("Cancelled. Recognized text is retained.");
    updateBusy(false); jobId = null; jobStyle = null; toggleSettings(false);
    const previous = isReader() ? ui : null;
    const bar = node("section", "standby"); bar.dataset.side = settings.toolbarSide;
    bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Magazine Reader: ready for a new capture");
    const actions = node("div", "actions");
    actions.append(button("Capture page", () => void restartCapture(), "primary"));
    if (previous) actions.append(button("Back", () => { resetUI(previous); updateBusy(false); }));
    actions.append(button("×", close, "standby-close"));
    actions.lastChild.setAttribute("aria-label", "Close Magazine Reader");
    bar.append(node("div", "muted", "Turn to the page you want, then capture it."), actions);
    resetUI(bar);
    // Leave keyboard focus with the page so its own page-turn keys keep working.
    root.activeElement?.blur();
  }

  function saveSettings(patch) {
    settings = sanitize({ ...settings, ...patch });
    applySettings();
    try { void chrome.storage?.local?.set({ readerSettings: settings })?.catch?.(() => {}); } catch { /* session only */ }
  }
  function applySettings() {
    if (!isReader()) return;
    const docked = settings.layout !== "center";
    ui.dataset.layout = settings.layout;
    panel.dataset.theme = settings.theme; panel.dataset.font = settings.font;
    panel.style.setProperty("--width", `${WIDTHS[settings.width][docked ? 2 : 1]}px`);
    panel.style.setProperty("--reader-font", FONTS[settings.font][1]);
    panel.style.setProperty("--reader-size", `${settings.size}px`);
    panel.style.setProperty("--reader-leading", String(SPACING[settings.spacing][1]));
    panel.style.setProperty("--reader-align", settings.align);
    panel.setAttribute("aria-modal", String(!docked));
    for (const sync of syncers) sync();
  }
  function segmented(label, key, options, render) {
    const group = node("div", "setting"), row = node("div", "segmented");
    row.setAttribute("role", "radiogroup"); row.setAttribute("aria-label", label);
    const buttons = Object.entries(options).map(([value, option]) => {
      const b = button(Array.isArray(option) ? option[0] : option, () => saveSettings({ [key]: value }));
      b.setAttribute("role", "radio"); render?.(b, value); row.append(b); return [value, b];
    });
    syncers.push(() => { for (const [value, b] of buttons) b.setAttribute("aria-checked", String(settings[key] === value)); });
    group.append(node("span", "setting-label", label), row); return group;
  }
  function buildSettings() {
    syncers.length = 0;
    const sheet = node("div", "settings"); sheet.setAttribute("role", "region"); sheet.setAttribute("aria-label", "Reading settings");
    sheet.append(segmented("Typeface", "font", FONTS, (b, value) => { b.style.fontFamily = FONTS[value][1]; }));
    const size = node("div", "setting"), row = node("div", "size-row"), range = node("input"), value = node("span", "size-value");
    Object.assign(range, { type: "range", min: SIZE.min, max: SIZE.max, step: 1 }); range.setAttribute("aria-label", "Text size");
    range.addEventListener("input", () => saveSettings({ size: Number(range.value) }));
    const smaller = button("A−", () => saveSettings({ size: settings.size - 1 })), larger = button("A+", () => saveSettings({ size: settings.size + 1 }));
    smaller.setAttribute("aria-label", "Smaller text"); larger.setAttribute("aria-label", "Larger text"); larger.style.fontSize = "15px";
    row.append(smaller, range, larger, value); size.append(node("span", "setting-label", "Text size"), row); sheet.append(size);
    syncers.push(() => { range.value = settings.size; value.textContent = `${settings.size}px`; smaller.disabled = settings.size <= SIZE.min; larger.disabled = settings.size >= SIZE.max; });
    sheet.append(segmented("Line spacing", "spacing", SPACING), segmented("Width", "width", WIDTHS),
      segmented("Theme", "theme", THEMES), segmented("Position", "layout", LAYOUTS),
      segmented("Alignment", "align", { left: "Ragged", justify: "Justified" }));
    const foot = node("div", "settings-foot"), keys = node("span");
    for (const [key, text] of [["+", " / "], ["−", " size · "], ["1", "–"], ["6", " style · "], ["Esc", " close"]]) keys.append(node("kbd", "", key), text);
    foot.append(keys, button("Reset reading settings", () => saveSettings({ ...DEFAULTS, style: settings.style, toolbarSide: settings.toolbarSide }), "link"));
    sheet.append(foot); return sheet;
  }
  function toggleSettings(open = !settingsOpen) {
    settingsOpen = open;
    if (!settingsSheet) return;
    settingsSheet.hidden = !open; settingsButton.setAttribute("aria-expanded", String(open));
    if (!open && root.activeElement && settingsSheet.contains(root.activeElement)) settingsButton.focus({ preventScroll: true });
  }

  function updateArchive(info) {
    archiveInfo = info;
    if (!archiveNode) return;
    archiveNode.hidden = !info;
    archiveNode.textContent = info ? (info.summaryPath ? "OCR and summary saved locally" : "OCR saved locally") : "";
    archiveNode.title = info?.directory || "";
  }
  function setStatus(text, error = false) {
    if (!panelStatus) return;
    panelStatus.textContent = text; panelStatus.className = error ? "status error" : "status";
    panelStatus.hidden = !text;
  }
  function updateBusy(value) {
    busy = value;
    const entry = current(), fresh = entry && entry.source === ocrText;
    if (summarizeButton) {
      summarizeButton.disabled = value || !ocrText.trim(); summarizeButton.hidden = value && !ocrText.trim();
      summarizeButton.textContent = fresh ? "Regenerate" : activeStyle === "translation" ? "Translate" : "Summarize";
      summarizeButton.title = fresh ? `Ask DeepSeek for a new ${STYLES[activeStyle][0].toLowerCase()} version` : "";
    }
    if (copyButton) { copyButton.disabled = !entry; copyButton.hidden = !entry || value; }
    if (cancelButton) cancelButton.hidden = !value;
    if (textArea) textArea.disabled = value;
    if (skeleton) skeleton.hidden = !value;
    if (summaryNode) summaryNode.hidden = value;
    for (const tab of tabButtons) {
      const key = tab.dataset.style;
      tab.disabled = value; tab.setAttribute("aria-selected", String(key === activeStyle));
      tab.classList.toggle("cached", summaries.has(key) && key !== activeStyle);
    }
  }
  function renderSummary() {
    if (!summaryNode) return;
    const entry = current(), text = entry?.text || "";
    summaryNode.replaceChildren();
    const appendInline = (target, value) => {
      for (const part of globalThis.magazineSummary.inline(value)) {
        if (part.type === "text") target.append(document.createTextNode(part.text));
        else target.append(node(part.type, "", part.text));
      }
    };
    let firstParagraph = true;
    for (const block of globalThis.magazineSummary.parse(text)) {
      if (block.type === "list") {
        const list = node(block.ordered ? "ol" : "ul");
        for (const item of block.items) { const li = node("li"); appendInline(li, item); list.append(li); }
        summaryNode.append(list); continue;
      }
      const element = node(block.type === "title" ? "h3" : block.type === "heading" ? "h4" : "p",
        block.type === "note" ? "note" : block.type === "paragraph" && firstParagraph ? "lead" : "");
      if (block.type === "note") element.append(node("span", "note-label", "Limits of this excerpt"));
      if (block.type === "paragraph") firstParagraph = false;
      appendInline(element, block.text); summaryNode.append(element);
    }
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    readingLabel.hidden = !text;
    readingLabel.replaceChildren(node("span", "", `${STYLES[activeStyle][2]} · ${Math.max(1, Math.ceil(words / 200))} min read`),
      node("span", "", entry && entry.source !== ocrText ? "Japanese text edited since" : `${words} words`));
    summaryNode.parentElement.scrollTop = 0;
  }
  function chooseStyle(key) {
    if (busy || !Object.hasOwn(STYLES, key)) return;
    activeStyle = key; saveSettings({ style: key });
    renderSummary(); updateBusy(false);
    if (summaries.has(key) || !ocrText.trim()) { setStatus(""); return; }
    void submit({ type: "summarize", text: ocrText, style: key });
  }
  async function submit(payload) {
    const id = crypto.randomUUID();
    updateArchive(null);
    jobId = id; jobStyle = payload.mode === "ocr" ? null : payload.style; updateBusy(true);
    if (copyButton) copyButton.textContent = "Copy";
    setStatus(payload.type === "capture" ? "Reading Japanese text locally…" : `Creating ${STYLES[payload.style][2].toLowerCase()} with DeepSeek…`);
    try {
      const response = await ask({ ...payload, id });
      if (!response?.ok) throw new Error(response?.error || "The extension did not respond.");
    } catch (error) { if (jobId === id) { updateBusy(false); jobId = null; setStatus(error.message, true); } }
  }
  function showPanel() {
    const reader = node("div", "reader");
    panel = node("section", "panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Magazine Reader");
    const top = node("header", "panel-top"), header = node("div", "header"), tools = node("div", "header-tools");
    const brand = node("h2"); brand.append(node("span", "brand-dot"), document.createTextNode("Magazine Reader"));
    settingsButton = button("Aa", () => toggleSettings(), "icon-button");
    settingsButton.setAttribute("aria-label", "Reading settings"); settingsButton.title = "Typeface, size, spacing, width, theme";
    const closeButton = button("×", close, "icon-button close"); closeButton.setAttribute("aria-label", "Close reader");
    tools.append(settingsButton, closeButton); header.append(brand, tools);
    const tabs = node("div", "style-tabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Summary style");
    tabButtons = Object.entries(STYLES).map(([key, [label, description]], index) => {
      const tab = button(label, () => chooseStyle(key), "style-tab");
      tab.dataset.style = key; tab.setAttribute("role", "tab"); tab.title = `${description} (${index + 1})`; tabs.append(tab); return tab;
    });
    top.append(header, tabs); panel.append(top);
    settingsSheet = buildSettings(); panel.append(settingsSheet);
    const progress = node("div", "progress"), bar = node("span"); progress.append(bar); panel.append(progress);
    const body = node("div", "panel-body");
    body.addEventListener("scroll", () => {
      const max = body.scrollHeight - body.clientHeight;
      bar.style.width = `${max > 0 ? Math.round(body.scrollTop / max * 100) : 0}%`;
    }, { passive: true });
    body.append(node("div", "capture-time", capture ? `Captured at ${new Date(capture.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · reading this snapshot` : ""));
    panelStatus = node("div", "status", "Ready"); panelStatus.setAttribute("role", "status"); panelStatus.setAttribute("aria-live", "polite"); body.append(panelStatus);
    readingLabel = node("div", "reading-label"); body.append(readingLabel);
    skeleton = node("div", "skeleton"); skeleton.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 8; i++) skeleton.append(node("i")); body.append(skeleton);
    summaryNode = node("article", "summary"); summaryNode.setAttribute("aria-label", "English summary"); body.append(summaryNode);
    const details = node("details"); details.append(node("summary", "", "Japanese text · review or edit"));
    textArea = node("textarea"); textArea.setAttribute("aria-label", "Japanese OCR text"); textArea.lang = "ja"; textArea.maxLength = 60_000; textArea.value = ocrText;
    textArea.addEventListener("input", () => { ocrText = textArea.value; updateBusy(busy); }); details.append(textArea); body.append(details);
    if (cropped) {
      const source = node("details"); source.append(node("summary", "", "Captured region"));
      const preview = node("img", "preview"); preview.src = cropped; preview.alt = "Captured region being summarized"; source.append(preview); body.append(source);
    }
    panel.append(body);
    const actions = node("div", "actions");
    summarizeButton = button("Summarize", () => { ocrText = textArea.value; void submit({ type: "summarize", text: ocrText, style: activeStyle }); }, "primary");
    copyButton = button("Copy", async event => {
      const entry = current(); if (!entry) return;
      try {
        await navigator.clipboard.writeText(globalThis.magazineSummary.copyText(entry.text)); event.target.textContent = "Copied";
        setTimeout(() => { event.target.textContent = "Copy"; }, 1600);
      } catch { setStatus("Clipboard access failed. Select and copy the summary text manually.", true); }
    });
    copyButton.title = "Copy without the limitations note";
    cancelButton = button("Cancel", () => { void ask({ type: "cancel" }).catch(() => {}); updateBusy(false); jobId = null; setStatus("Cancelled. Recognized text is retained."); });
    actions.append(button("New capture", standby), node("span", "spacer"), cancelButton, copyButton, summarizeButton);
    archiveNode = node("span", "archive-status"); archiveNode.setAttribute("role", "status"); updateArchive(archiveInfo);
    const footnote = node("div", "footnote"); footnote.append(archiveNode, node("span", "", "Summaries send text to DeepSeek. Images stay on this Mac."));
    const bottom = node("div", "panel-bottom"); bottom.append(actions, footnote); panel.append(bottom);
    reader.append(panel); resetUI(reader);
    applySettings(); toggleSettings(settingsOpen); renderSummary(); updateBusy(busy);
    closeButton.focus({ preventScroll: true });
  }
  function selectionUI() {
    const selection = node("div", "selection");
    selection.setAttribute("role", "dialog"); selection.setAttribute("aria-label", "Select a magazine region"); selection.setAttribute("aria-modal", "true");
    const snapshot = node("img", "snapshot"); snapshot.src = capture.image; snapshot.alt = "Select text from this captured magazine spread"; selection.append(snapshot);
    const rect = node("div", "rect"); selection.append(rect);
    const toolbar = node("section", "toolbar"); toolbar.dataset.side = settings.toolbarSide;
    const sideSwitch = button("", () => {
      saveSettings({ toolbarSide: settings.toolbarSide === "right" ? "left" : "right" });
      toolbar.dataset.side = settings.toolbarSide; sideSwitch.textContent = `Move to ${settings.toolbarSide === "right" ? "left" : "right"}`;
    }, "side-switch");
    sideSwitch.textContent = `Move to ${settings.toolbarSide === "right" ? "left" : "right"}`;
    toolbar.append(node("h2", "", "Select a page or article"), sideSwitch,
      node("div", "muted", "Drag a rectangle around the Japanese text. Zoom the reader before capturing if the type is small. Escape cancels."));
    const label = node("label", "", "Summary style"), picker = node("select"), hint = node("div", "muted");
    for (const [key, [name]] of Object.entries(STYLES)) {
      const option = node("option", "", name); option.value = key; picker.append(option);
    }
    const pick = () => { hint.textContent = STYLES[picker.value][1]; };
    picker.value = settings.style; pick();
    picker.addEventListener("change", () => { saveSettings({ style: picker.value }); pick(); });
    label.append(picker); toolbar.append(label, hint);
    hint.style.marginTop = "5px";
    const actions = node("div", "actions");
    const process = async mode => {
      if (!region) return;
      try {
        const sx = image.naturalWidth / window.innerWidth, sy = image.naturalHeight / window.innerHeight;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(region.width * sx)); canvas.height = Math.max(1, Math.round(region.height * sy));
        canvas.getContext("2d").drawImage(image, region.x * sx, region.y * sy, region.width * sx, region.height * sy, 0, 0, canvas.width, canvas.height);
        cropped = canvas.toDataURL("image/png"); ocrText = ""; summaries.clear(); activeStyle = settings.style;
        showPanel(); await submit({ type: "capture", image: cropped, mode, style: activeStyle });
      } catch (error) { showPanel(); updateBusy(false); setStatus(error.message, true); }
    };
    const summarize = button("Summarize selection", () => void process("summary"), "primary");
    const recognize = button("OCR only", () => void process("ocr"));
    summarize.disabled = true; recognize.disabled = true;
    const paint = () => {
      rect.style.display = "block";
      Object.assign(rect.style, { left: `${region.x}px`, top: `${region.y}px`, width: `${region.width}px`, height: `${region.height}px` });
      summarize.disabled = region.width < 12 || region.height < 12; recognize.disabled = summarize.disabled;
    };
    const whole = button("Whole viewport", () => { region = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }; paint(); });
    actions.append(summarize, recognize, whole, button("New capture", standby), button("Cancel", close));
    toolbar.append(actions, node("div", "muted", "Summarize sends recognized text to DeepSeek. OCR only stays on this Mac.")); selection.append(toolbar);
    let start = null;
    selection.addEventListener("pointerdown", event => {
      if (toolbar.contains(event.target) || event.button !== 0) return;
      start = { x: event.clientX, y: event.clientY }; selection.setPointerCapture(event.pointerId); event.preventDefault();
    });
    selection.addEventListener("pointermove", event => {
      if (!start) return;
      const x = Math.max(0, Math.min(window.innerWidth, event.clientX)), y = Math.max(0, Math.min(window.innerHeight, event.clientY));
      region = { x: Math.min(start.x, x), y: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) }; paint();
    });
    selection.addEventListener("pointerup", () => { start = null; });
    selection.addEventListener("pointercancel", () => { start = null; });
    resetUI(selection); whole.focus({ preventScroll: true });
  }
  async function onMessage(message) {
    if (message.type === "prepare") {
      close();
      if (document.fullscreenElement) return { ok: false, error: "Exit reader fullscreen, then click the extension again." };
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { ok: true };
    }
    if (message.type === "select") {
      await settingsReady;
      capture = message; region = null; ocrText = ""; summaries.clear(); cropped = ""; jobId = null; jobStyle = null; busy = false; archiveInfo = null;
      activeStyle = settings.style; settingsOpen = false;
      image = new Image(); image.src = capture.image; await image.decode(); selectionUI(); return { ok: true };
    }
    if (message.type === "error") { await settingsReady; showPanel(); updateBusy(false); setStatus(message.error, true); return { ok: true }; }
    if (message.type !== "progress" || message.token !== capture?.token || !busy || message.id !== jobId) return { ok: true };
    if (message.archive) updateArchive(message.archive);
    if (typeof message.text === "string") { ocrText = message.text; textArea.value = ocrText; }
    if (message.stage === "recognizing") setStatus("Reading Japanese text locally…");
    if (message.stage === "recognized") setStatus("Japanese text recognized.");
    if (message.stage === "summarizing" && jobStyle) setStatus(`Creating ${STYLES[jobStyle][2].toLowerCase()} with DeepSeek…`);
    if (message.done) {
      const style = jobStyle;
      jobId = null; jobStyle = null;
      if (!message.ok) { updateBusy(false); setStatus(message.error || "Processing failed.", true); return { ok: true }; }
      if (message.summary && style) {
        summaries.set(style, { text: message.summary, source: ocrText, truncated: Boolean(message.truncated) });
        activeStyle = style; updateBusy(false); renderSummary();
        setStatus(message.truncated ? "This reached the output limit. Select a smaller excerpt or a shorter style." : "");
      } else {
        updateBusy(false); setStatus("OCR complete. Review the Japanese text, then pick a style above or summarize.");
        ui.querySelector("details").open = true;
      }
    }
    return { ok: true };
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.channel !== CHANNEL) return false;
    onMessage(message).then(respond, error => { showPanel(); setStatus(error.message, true); respond({ ok: false, error: error.message }); });
    return true;
  });
  function trapFocus(event) {
    const items = Array.from(ui.querySelectorAll("button, textarea, input, select, summary"))
      .filter(item => !item.disabled && item.getClientRects().length);
    if (!items.length) return;
    const index = items.indexOf(root.activeElement);
    const next = items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length];
    event.preventDefault(); next.focus({ preventScroll: true });
  }
  document.addEventListener("keydown", event => {
    if (host.style.display === "none") return;
    if (event.key === "Escape") {
      if (isReader() && settingsOpen) toggleSettings(false); else close();
      event.stopPropagation(); return;
    }
    const modal = ui?.className === "selection" || (isReader() && settings.layout === "center");
    if (event.key === "Tab") { if (modal) trapFocus(event); return; }
    // Docked reading leaves the page usable; only shortcuts typed while focus is in the panel are ours.
    if (!isReader() || (!modal && !root.activeElement) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (root.activeElement?.matches("textarea, input, select")) return;
    const styleKeys = Object.keys(STYLES);
    if (event.key === "+" || event.key === "=") saveSettings({ size: settings.size + 1 });
    else if (event.key === "-" || event.key === "_") saveSettings({ size: settings.size - 1 });
    else if (/^[1-9]$/.test(event.key) && styleKeys[event.key - 1]) chooseStyle(styleKeys[event.key - 1]);
    else return;
    event.preventDefault(); event.stopPropagation();
  }, true);
  window.addEventListener("resize", () => { if (ui?.className === "selection") { close(); } });
})();
