/* global chrome */
(() => {
  if (globalThis.__magazineReaderLoaded) return;
  globalThis.__magazineReaderLoaded = true;
  const CHANNEL = "magazine-reader";
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:none;font-family:system-ui,-apple-system,sans-serif;color:#e8edf3;font-size:14px;color-scheme:dark";
  const root = host.attachShadow({ mode: "closed" });
  (document.body || document.documentElement).append(host);
  const style = document.createElement("style");
  style.textContent = `
    :host{font-family:system-ui,-apple-system,sans-serif;color:#e8edf3;font-size:14px;color-scheme:dark}
    *{box-sizing:border-box}button,textarea{font:inherit}button{cursor:pointer;border:1px solid #3b4c5d;border-radius:8px;background:#223140;color:#e8edf3;padding:9px 12px}
    button:hover{background:#30485c}button:disabled{opacity:.45;cursor:wait}.primary{background:#c6ee98;color:#183019;border:0;font-weight:650}.primary:hover{background:#d9f6b7}
    .selection{position:fixed;inset:0;pointer-events:auto;touch-action:none;cursor:crosshair;background:#14202c}
    .snapshot{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none}
    .rect{position:absolute;border:2px solid #c6ee98;box-shadow:0 0 0 200vmax #0009;pointer-events:none;display:none}
    .dock{position:fixed;right:14px;top:14px;width:min(220px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;padding:14px;cursor:auto;pointer-events:auto;border-radius:14px;box-shadow:0 8px 36px #0008}
    .dock[data-side="left"]{left:14px;right:auto}.dock .actions{flex-direction:column}.dock .actions button{width:100%}.side-switch{width:100%;margin:9px 0;font-size:12px;padding:6px 9px}
    .toolbar{background:#13202df5;border:1px solid #415263}
    h2{font-size:16px;letter-spacing:-.2px;margin:0 0 7px}.muted{color:#b3c0cb;font-size:12px;line-height:1.5}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    .panel{background:#faf8f1;color:#293c33;border:1px solid #d8ded4;padding:0;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 16px 70px #0006}
    .panel.expanded{width:min(580px,calc(100vw - 28px));height:calc(100vh - 28px)}
    .panel-top{padding:15px;background:#18302b;color:#edf2e9;flex:none}.header{display:flex;align-items:center;justify-content:space-between;gap:12px}.header h2{margin:0;font-size:15px;font-weight:600;letter-spacing:.1px}
    .brand-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#c6dd9f;margin-right:8px;vertical-align:middle}.close{padding:2px 9px;font-size:20px;background:transparent;border-color:#456057;color:#e9eee6}
    .panel-controls{display:flex;gap:7px;margin-top:12px}.panel-controls button{flex:1;width:auto;margin:0;padding:7px;font-size:11px;white-space:nowrap;border-color:#476358;background:#244138;color:#e9eee6}.expanded .panel-controls button{font-size:12px}
    .new-capture{width:100%;margin-top:8px;padding:7px;font-size:12px;background:#314c42;border-color:#527262;color:#edf2e9}.new-capture:hover{background:#3c5f50}
    .panel-body{overflow:auto;min-height:0;flex:1;padding:15px;scrollbar-color:#b3bdad transparent;scrollbar-width:thin}.expanded .panel-body{padding:24px 30px 30px}
    .capture-time{color:#647366;font-size:11px;line-height:1.5}.status{margin:12px 0;color:#456940;font-size:12px;line-height:1.5}.status.error{color:#a13f32;background:#f9e9e1;padding:10px;border-radius:8px}
    .reading-label{font-size:10px;font-weight:650;letter-spacing:1.5px;text-transform:uppercase;color:#6a775e;padding:17px 0 12px;border-top:1px solid #d8ddcf;margin-top:16px}
    .summary{font-size:15px;line-height:1.75;overflow-wrap:anywhere}.expanded .summary{font-size:17px;line-height:1.8}
    .summary h3{font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:400;line-height:1.22;letter-spacing:-.5px;color:#203d31;margin:0 0 22px;overflow-wrap:normal}
    .expanded .summary h3{font-size:32px}.summary h4{font:650 11px/1.5 system-ui,sans-serif;text-transform:uppercase;letter-spacing:1.5px;color:#667751;margin:24px 0 10px}
    .summary p{margin:0 0 18px}.summary .lead{color:#405749}.summary ul,.summary ol{margin:15px 0 24px;padding-left:22px}.summary li{padding-left:6px;margin:0 0 13px}.summary li::marker{color:#829f62}
    .summary .note{background:#f0eddf;border-left:3px solid #b5aa7b;border-radius:0 7px 7px 0;padding:14px 17px;font-size:13px;line-height:1.7;color:#66644f;margin:24px 0}.note-label{display:block;font:650 10px/1.5 system-ui,sans-serif;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px}
    details{border-top:1px solid #d8ddcf;padding-top:14px;margin-top:18px}summary{cursor:pointer;color:#53664d;font-size:12px;font-weight:550;line-height:1.5}
    textarea{display:block;width:100%;height:240px;resize:vertical;background:#fffdf8;color:#293c33;border:1px solid #c6cebe;border-radius:8px;padding:13px;line-height:1.7;margin-top:12px;font-size:15px}
    .preview{width:100%;max-height:160px;object-fit:contain;background:#eeeadd;border-radius:6px;margin-top:12px}
    .panel-bottom{padding:12px 15px 14px;background:#f0f1e8;border-top:1px solid #d8ddcf;flex:none}.panel-bottom .actions{margin:0;gap:7px}.panel-bottom button{background:#fafbf6;border-color:#c5ceb9;color:#36503e;font-size:12px;padding:9px 12px}
    .panel-bottom button.primary{background:#285742;border-color:#285742;color:#f2f5e9}.panel-bottom button.primary:hover{background:#356b52}.panel.expanded .actions{flex-direction:row}.panel.expanded .actions button{width:auto}
    .panel .meta{margin-top:10px;color:#73816a;font-size:10px;line-height:1.5}.panel button:focus-visible,.panel summary:focus-visible,.panel textarea:focus-visible{outline:2px solid #8eae66;outline-offset:3px}
    .archive-status{font-size:11px;color:#456940;line-height:1.5;margin-top:8px;overflow-wrap:anywhere}
    .panel:not(.expanded).processing details,.panel:not(.expanded).processing .capture-time{display:none}
    @media(max-width:600px){.dock{padding:12px}button{padding:8px 10px}}
    @media(max-width:600px){.panel{padding:0}.expanded .panel-body{padding:20px}.expanded .summary h3{font-size:27px}}
  `;
  root.append(style);
  let ui = null, capture = null, image = null, region = null, busy = false, jobId = null;
  let dockSide = "right";
  let resetting = false, archiveInfo = null, archiveNode = null;
  let panelExpanded = false, sizeWasChosen = false, expandButton = null, copyButton = null, cancelButton = null, readingLabel = null;
  let ocrText = "", cropped = "", currentSummary = "", panelStatus = null, summaryNode = null, textArea = null, summarizeButton = null;
  const node = (tag, className, text) => {
    const e = document.createElement(tag); if (className) e.className = className;
    if (text !== undefined) e.textContent = text; return e;
  };
  const button = (text, handler, className = "") => {
    const b = node("button", className, text); b.type = "button"; b.addEventListener("click", handler); return b;
  };
  function sideSwitch(dock) {
    dock.dataset.side = dockSide;
    const toggle = button(`Move to ${dockSide === "right" ? "left" : "right"}`, () => {
      dockSide = dockSide === "right" ? "left" : "right";
      dock.dataset.side = dockSide;
      toggle.textContent = `Move to ${dockSide === "right" ? "left" : "right"}`;
    }, "side-switch");
    return toggle;
  }
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
    if (ui?.classList.contains("panel")) ui.classList.toggle("processing", value);
    if (summarizeButton) { summarizeButton.disabled = value || !ocrText.trim(); summarizeButton.hidden = value && !ocrText.trim(); }
    if (copyButton) { copyButton.disabled = !currentSummary; copyButton.hidden = !currentSummary; }
    if (cancelButton) cancelButton.hidden = !value;
    if (textArea) textArea.disabled = value;
  }
  function setExpanded(value) {
    panelExpanded = value;
    if (!ui?.classList.contains("panel")) return;
    ui.classList.toggle("expanded", value);
    expandButton.textContent = value ? "Collapse" : "Expand";
    expandButton.setAttribute("aria-expanded", String(value));
  }
  function renderSummary(text) {
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
    readingLabel.hidden = !text;
    readingLabel.textContent = `English summary · ${Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200))} min read`;
  }
  async function submit(payload) {
    const id = crypto.randomUUID();
    updateArchive(null);
    currentSummary = ""; updateBusy(true); jobId = id;
    if (copyButton) copyButton.textContent = "Copy summary";
    if (summaryNode) renderSummary("");
    setStatus(payload.type === "capture" ? "Reading Japanese text locally…" : "Creating an English summary…");
    try {
      const response = await ask({ ...payload, id });
      if (!response?.ok) throw new Error(response?.error || "The extension did not respond.");
    } catch (error) { if (jobId === id) { updateBusy(false); jobId = null; setStatus(error.message, true); } }
  }
  function showPanel() {
    const panel = node("section", "panel dock"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Magazine summary");
    const top = node("div", "panel-top"), header = node("div", "header");
    const brand = node("h2"); brand.append(node("span", "brand-dot"), document.createTextNode("Magazine Reader"));
    header.append(brand, button("×", close, "close"));
    header.lastChild.setAttribute("aria-label", "Close summary");
    const controls = node("div", "panel-controls");
    expandButton = button("Expand", () => { sizeWasChosen = true; setExpanded(!panelExpanded); });
    controls.append(expandButton, sideSwitch(panel));
    top.append(header, controls, button("New capture", () => void restartCapture(), "new-capture")); panel.append(top);
    const body = node("div", "panel-body");
    body.append(node("div", "capture-time", capture ? `Captured at ${new Date(capture.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · summary of this snapshot` : ""));
    panelStatus = node("div", "status", "Ready"); panelStatus.setAttribute("role", "status"); panelStatus.setAttribute("aria-live", "polite"); body.append(panelStatus);
    readingLabel = node("div", "reading-label"); body.append(readingLabel);
    summaryNode = node("article", "summary"); summaryNode.setAttribute("aria-label", "English summary"); body.append(summaryNode); renderSummary(currentSummary);
    const details = node("details"); details.append(node("summary", "", "Japanese text · review or edit"));
    textArea = node("textarea"); textArea.setAttribute("aria-label", "Japanese OCR text"); textArea.maxLength = 60_000; textArea.value = ocrText;
    textArea.addEventListener("input", () => { ocrText = textArea.value; updateBusy(busy); }); details.append(textArea); body.append(details);
    if (cropped) {
      const source = node("details"); source.append(node("summary", "", "Captured region"));
      const preview = node("img", "preview"); preview.src = cropped; preview.alt = "Captured region being summarized"; source.append(preview); body.append(source);
    }
    panel.append(body);
    const actions = node("div", "actions");
    summarizeButton = button("Summarize text", () => { ocrText = textArea.value; void submit({ type: "summarize", text: ocrText }); }, "primary");
    copyButton = button("Copy summary", async event => {
      if (!currentSummary) return;
      try { await navigator.clipboard.writeText(globalThis.magazineSummary.copyText(currentSummary)); event.target.textContent = "Copied"; }
      catch { setStatus("Clipboard access failed. Select and copy the summary text manually.", true); }
    });
    cancelButton = button("Cancel", () => { void ask({ type: "cancel" }).catch(() => {}); updateBusy(false); jobId = null; setStatus("Cancelled. Recognized text is retained."); });
    actions.append(summarizeButton, copyButton, cancelButton);
    archiveNode = node("div", "archive-status"); archiveNode.setAttribute("role", "status"); updateArchive(archiveInfo);
    const bottom = node("div", "panel-bottom"); bottom.append(actions, archiveNode, node("div", "meta", "Summaries send text to DeepSeek. Images stay on this Mac.")); panel.append(bottom);
    resetUI(panel); setExpanded(panelExpanded); updateBusy(busy); header.lastChild.focus({ preventScroll: true });
  }
  function selectionUI() {
    const selection = node("div", "selection");
    selection.setAttribute("role", "dialog"); selection.setAttribute("aria-label", "Select a magazine region"); selection.setAttribute("aria-modal", "true");
    const snapshot = node("img", "snapshot"); snapshot.src = capture.image; snapshot.alt = "Select text from this captured magazine spread"; selection.append(snapshot);
    const rect = node("div", "rect"); selection.append(rect);
    const toolbar = node("section", "toolbar dock"); toolbar.append(node("h2", "", "Select a page or article"), sideSwitch(toolbar),
      node("div", "muted", "Drag a rectangle around the Japanese text. Zoom the reader before capturing if the type is small. Escape cancels."));
    const actions = node("div", "actions");
    const process = async mode => {
      if (!region) return;
      try {
        const sx = image.naturalWidth / window.innerWidth, sy = image.naturalHeight / window.innerHeight;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(region.width * sx)); canvas.height = Math.max(1, Math.round(region.height * sy));
        canvas.getContext("2d").drawImage(image, region.x * sx, region.y * sy, region.width * sx, region.height * sy, 0, 0, canvas.width, canvas.height);
        cropped = canvas.toDataURL("image/png"); ocrText = ""; currentSummary = "";
        showPanel(); await submit({ type: "capture", image: cropped, mode });
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
    actions.append(summarize, recognize, whole, button("New capture", () => void restartCapture()), button("Cancel", close));
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
      capture = message; region = null; ocrText = ""; currentSummary = ""; cropped = ""; jobId = null; busy = false; panelExpanded = false; sizeWasChosen = false; archiveInfo = null;
      image = new Image(); image.src = capture.image; await image.decode(); selectionUI(); return { ok: true };
    }
    if (message.type === "error") { showPanel(); updateBusy(false); setStatus(message.error, true); return { ok: true }; }
    if (message.type !== "progress" || message.token !== capture?.token || !busy || message.id !== jobId) return { ok: true };
    if (message.archive) updateArchive(message.archive);
    if (typeof message.text === "string") { ocrText = message.text; textArea.value = ocrText; }
    if (message.stage === "recognizing") setStatus("Reading Japanese text locally…");
    if (message.stage === "recognized") setStatus("Japanese text recognized.");
    if (message.stage === "summarizing") setStatus("Creating an English summary with DeepSeek…");
    if (message.done) {
      updateBusy(false); jobId = null;
      if (!message.ok) { setStatus(message.error || "Processing failed.", true); return { ok: true }; }
      if (message.summary) {
        currentSummary = message.summary; renderSummary(currentSummary); updateBusy(false);
        setStatus(message.truncated ? "Summary reached the output limit. Select a smaller excerpt." : "");
      } else { setStatus("OCR complete. Review the Japanese text, then summarize when ready."); ui.querySelector("details").open = true; }
      if (!sizeWasChosen) setExpanded(true);
    }
    return { ok: true };
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.channel !== CHANNEL) return false;
    onMessage(message).then(respond, error => { showPanel(); setStatus(error.message, true); respond({ ok: false, error: error.message }); });
    return true;
  });
  document.addEventListener("keydown", event => {
    if (host.style.display !== "none" && event.key === "Escape") { close(); event.stopPropagation(); }
    if (host.style.display !== "none" && ui?.className === "selection" && event.key === "Tab") {
      const buttons = Array.from(ui.querySelectorAll("button:not(:disabled)"));
      const index = buttons.indexOf(root.activeElement);
      const next = buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length];
      event.preventDefault(); next?.focus({ preventScroll: true });
    }
  }, true);
  window.addEventListener("resize", () => { if (ui?.className === "selection") { close(); } });
})();
