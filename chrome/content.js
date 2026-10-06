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
    glossary: ["Vocabulary", "Japanese words with readings and meanings", "Vocabulary"],
    stocks: ["Stocks", "Companies and securities codes, linked to Monex", "Stocks mentioned"],
  };
  // The Ask tab is a conversation about the page rather than a summary style.
  const TABS = { ...STYLES, ask: ["Ask", "Ask DeepSeek anything about this page", "Questions about this page"] };
  const SUGGESTIONS = ["What is this article mainly about?", "Explain the key numbers and what they mean",
    "What are the implications for investors?", "Explain the difficult Japanese terms", "What is unclear or missing in this excerpt?"];
  const MAX_TURNS = 8;
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
    .ask{margin-top:4px}.thread .turn{margin:0 0 1.4em}.thread .question{margin:0 0 .7em auto;width:fit-content;max-width:85%;background:var(--surface);border:1px solid var(--line);border-radius:14px 14px 4px 14px;padding:.55em .9em;font-size:.9em;line-height:1.5;white-space:pre-wrap;text-align:left}
    .thread .answer{padding-left:.9em;border-left:2px solid var(--accent)}.thread .answer>:last-child{margin-bottom:0}.answer-error{color:var(--error);font-size:.85em}
    .answer.pending{display:flex;gap:6px;padding:.6em .9em}.answer.pending i{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:pulse 1s ease-in-out infinite}.answer.pending i:nth-child(2){animation-delay:.15s}.answer.pending i:nth-child(3){animation-delay:.3s}
    @keyframes pulse{50%{opacity:.25;transform:translateY(-2px)}}
    .suggestions{display:flex;flex-wrap:wrap;gap:7px;margin:4px 0 14px}.chip{background:var(--btn);border:1px solid var(--btn-line);color:var(--btn-fg);border-radius:999px;padding:6px 12px;font-size:12px}.chip:hover{background:var(--surface)}
    .composer{position:sticky;bottom:-34px;display:flex;gap:8px;align-items:flex-end;background:var(--bg);padding:10px 0 6px;border-top:1px solid var(--line)}
    .ask-input{margin:0;height:auto;min-height:44px;max-height:180px;resize:none;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;font-size:15px;line-height:1.5;padding:10px 12px}
    .ask-send{flex:none;height:44px;padding:0 18px;background:var(--primary);color:var(--primary-fg)}
    .composer-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--muted);padding-bottom:4px}
    .summary ul.vocab{list-style:none;padding:0;margin:0 0 1.4em}.summary ul.vocab>li{display:grid;grid-template-columns:minmax(7em,30%) 1fr;gap:.3em 1.2em;align-items:baseline;padding:.65em 0;margin:0;border-bottom:1px solid var(--line)}
    .vocab-word{display:flex;flex-direction:column;min-width:0}.vocab-term{font:500 1.15em/1.35 "Hiragino Mincho ProN","Hiragino Sans",serif;color:var(--heading)}.vocab-reading{font-size:.72em;color:var(--muted);letter-spacing:.04em}
    .vocab-meaning{line-height:1.45}.summary ul.vocab>li.kotoba-row{grid-template-columns:minmax(7em,30%) 1fr auto}
    .kotoba-toggle{align-self:center;justify-self:end;font:600 11px/1.2 system-ui,sans-serif;letter-spacing:.2px;padding:5px 10px;border-radius:999px;background:var(--btn);border:1px solid var(--btn-line);color:var(--btn-fg);white-space:nowrap}
    .kotoba-toggle:hover{background:var(--bg)}.kotoba-toggle[data-state="found"],.kotoba-toggle[data-state="added"]{background:var(--primary);border-color:var(--primary);color:var(--primary-fg)}
    .kotoba-toggle[data-state="checking"]{opacity:.55}.kotoba-toggle[aria-expanded="true"]{outline:2px solid var(--accent);outline-offset:1px}
    .kotoba{grid-column:1/-1;margin:.4em 0 .2em;padding:.9em 1.1em 1em;background:var(--surface);border:1px solid var(--line);border-radius:10px;font:14px/1.55 system-ui,-apple-system,"Hiragino Sans",sans-serif;text-align:left;hyphens:manual;animation:fade .15s}
    .kotoba p{margin:.3em 0}.kotoba .kstatus{color:var(--muted)}.kotoba .kerror{color:var(--error)}.kotoba .knote{color:var(--muted);font-size:12px}
    .kword+.kword{border-top:1px solid var(--line);margin-top:.8em;padding-top:.8em}
    .kterm{font:500 26px/1.25 "Hiragino Mincho ProN","Yu Mincho",serif;color:var(--heading)}.kreading{color:var(--muted);font-size:15px;margin-left:.6em}
    .kmeaning{font-size:15px}.ktags{display:flex;flex-wrap:wrap;gap:4px;margin:.4em 0}.ktag{background:var(--bg);border:1px solid var(--line);border-radius:99px;padding:1px 8px;font-size:11px;color:var(--muted)}
    .kotoba ul.kexamples{list-style:none;padding:0;margin:.5em 0}.kotoba ul.kexamples li{margin:.5em 0}
    .kja{font:15px/1.9 "Hiragino Mincho ProN","Yu Mincho",serif;color:var(--fg)}.ken{color:var(--muted);font-size:13px}.kotoba rt{font-size:9px;color:var(--muted)}
    .kotoba details{border-top:1px solid var(--line);margin-top:.6em;padding-top:.6em}.kotoba summary{font-size:12px}
    .kguide{margin-top:.4em}.kguide p,.kguide li{font-size:14px;line-height:1.7;margin:0 0 .6em}.kguide ul,.kguide ol{padding-left:1.3em;margin:0 0 .6em}.kguide li::marker{color:var(--accent)}
    .kguide h5{font:650 13px/1.4 system-ui,sans-serif;margin:.8em 0 .4em;color:var(--heading)}
    .kotoba label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin:.7em 0 .2em}
    .kotoba input,.kotoba textarea{display:block;width:100%;height:auto;margin:0;font:14px/1.6 system-ui,-apple-system,"Hiragino Sans",sans-serif;color:var(--fg);background:var(--field);border:1px solid var(--btn-line);border-radius:8px;padding:6px 9px}
    .kotoba fieldset{border:1px solid var(--line);border-radius:9px;margin:.7em 0 0;padding:.2em .8em .8em}.kotoba legend{font-size:12px;font-weight:600;color:var(--muted);padding:0 4px}
    .kguide-head{display:flex;justify-content:space-between;align-items:center;margin:.8em 0 .2em}.kguide-head span{font-size:12px;font-weight:600;color:var(--muted)}
    .kguide-preview{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:.5em .9em}
    .kotoba .actions{margin-top:.9em;gap:7px}.kotoba .actions button{font-size:12px;padding:7px 13px;background:var(--btn);border-color:var(--btn-line);color:var(--btn-fg)}
    .kotoba .actions button.primary{background:var(--primary);border-color:var(--primary);color:var(--primary-fg)}.kotoba .actions button.link{background:none;border:0;padding:0;font-size:12px;color:var(--btn-fg)}
    @media(max-width:600px){.summary ul.vocab>li,.summary ul.vocab>li.kotoba-row{grid-template-columns:1fr}.kotoba-toggle{justify-self:start}}
    .summary ul.stocks{list-style:none;padding:0;margin:.6em 0 1.4em}.summary li.stock{display:flex;gap:.9em;align-items:flex-start;padding:.7em 0;margin:0;border-bottom:1px solid var(--line)}
    .ticker{flex:none;min-width:4.6em;text-align:center;font:650 .8em/1 "SF Mono",Menlo,monospace;letter-spacing:.04em;padding:.55em .5em;margin-top:.15em;border-radius:7px;background:var(--primary);color:var(--primary-fg);text-decoration:none}
    a.ticker:hover{filter:brightness(1.12)}a.ticker:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.ticker.none{background:var(--surface);color:var(--muted)}
    .stock-body{min-width:0;line-height:1.45}.stock-name{display:flex;flex-wrap:wrap;align-items:baseline;gap:.2em .6em}.stock-ja{font-size:.85em;color:var(--muted)}
    .badge{font:600 10px/1.4 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.8px;color:var(--note-fg);background:var(--note-bg);border:1px solid var(--note-line);border-radius:999px;padding:1px 7px}
    .stock-note{font-size:.85em;color:var(--muted);margin-top:.2em}
    .summary .note{background:var(--note-bg);border-left:3px solid var(--note-line);border-radius:0 7px 7px 0;padding:.8em 1em;font-size:.8em;line-height:1.65;color:var(--note-fg);margin:1.6em 0;font-family:system-ui,sans-serif;text-align:left}
    .note-label{display:block;font:650 10px/1.5 system-ui,sans-serif;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px}
    .skeleton{padding:4px 0 10px}.skeleton i{display:block;height:.9em;margin:0 0 1em;border-radius:5px;background:linear-gradient(90deg,var(--skeleton) 30%,var(--bg) 50%,var(--skeleton) 70%) 0 0/300% 100%;animation:shimmer 1.4s linear infinite;font-size:var(--reader-size)}
    .skeleton i:first-child{height:1.6em;width:65%;margin-bottom:1.4em}.skeleton i:nth-child(3n){width:82%}.skeleton i:nth-child(4n){width:58%}
    @keyframes shimmer{to{background-position:-300% 0}}
    @media(prefers-reduced-motion:reduce){.answer.pending i,.skeleton i,.reader,.panel,.settings{animation:none}.panel-body{scroll-behavior:auto}}
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
  const thread = []; // { question, answer?, error?, truncated? }; at most one turn is pending
  const vocab = new Map(); // "term|reading" → the word's Kotoba state for this capture; see vocabEntry
  let askNode = null, threadNode = null, askInput = null, askButton = null, suggestionsNode = null, clearButton = null;
  let panel = null, panelStatus = null, summaryNode = null, skeleton = null, readingLabel = null, textArea = null, archiveNode = null, kotobaCount = null;
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
    for (const [key, text] of [["+", " / "], ["−", " size · "], ["1", "–"], [String(Object.keys(TABS).length), " tab · "], ["Esc", " close"]]) keys.append(node("kbd", "", key), text);
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
    archiveNode.textContent = info ? (info.summaryPath ? "OCR and result saved locally" : "OCR saved locally") : "";
    archiveNode.title = info?.directory || "";
  }
  function setStatus(text, error = false) {
    if (!panelStatus) return;
    panelStatus.textContent = text; panelStatus.className = error ? "status error" : "status";
    panelStatus.hidden = !text;
  }
  function updateBusy(value) {
    busy = value;
    const asking = activeStyle === "ask", entry = current(), fresh = entry && entry.source === ocrText;
    if (summarizeButton) {
      summarizeButton.disabled = value || !ocrText.trim(); summarizeButton.hidden = asking || (value && !ocrText.trim());
      summarizeButton.textContent = fresh ? "Regenerate" : activeStyle === "translation" ? "Translate" : "Summarize";
      summarizeButton.title = fresh ? `Ask DeepSeek for a new ${STYLES[activeStyle][0].toLowerCase()} version` : "";
    }
    const copyable = asking ? thread.some(turn => turn.answer) : Boolean(entry);
    if (copyButton) { copyButton.disabled = !copyable; copyButton.hidden = !copyable || value; copyButton.title = asking ? "Copy the conversation" : "Copy without the limitations note"; }
    if (cancelButton) cancelButton.hidden = !value;
    if (textArea) textArea.disabled = value;
    if (skeleton) skeleton.hidden = !value || asking;
    if (summaryNode) summaryNode.hidden = value || asking;
    if (askNode) {
      askNode.hidden = !asking;
      const ready = Boolean(ocrText.trim());
      askInput.disabled = value || !ready;
      askInput.placeholder = ready ? "Ask anything about this page…" : "Waiting for the Japanese text…";
      askButton.disabled = value || !ready || !askInput.value.trim();
      suggestionsNode.hidden = thread.length > 0 || !ready;
      for (const chip of suggestionsNode.children) chip.disabled = value;
      clearButton.hidden = !thread.length || value;
    }
    for (const tab of tabButtons) {
      const key = tab.dataset.style;
      tab.disabled = value; tab.setAttribute("aria-selected", String(key === activeStyle));
      tab.classList.toggle("cached", summaries.has(key) && key !== activeStyle);
    }
  }
  const appendInline = (target, value) => {
    for (const part of globalThis.magazineSummary.inline(value)) {
      if (part.type === "text") target.append(document.createTextNode(part.text));
      else target.append(node(part.type, "", part.text));
    }
  };
  /** Renders model text as DOM; nothing is parsed as HTML. */
  function renderBlocks(target, text, { stocks = false, vocabulary = false, kotoba = false, lead = true } = {}) {
    let firstParagraph = lead;
    for (const block of globalThis.magazineSummary.parse(text)) {
      if (block.type === "list" && stocks && block.items.every(item => globalThis.magazineSummary.stock(item))) {
        const list = node("ul", "stocks");
        for (const item of block.items) list.append(stockRow(globalThis.magazineSummary.stock(item)));
        target.append(list); continue;
      }
      if (block.type === "list" && vocabulary && block.items.every(item => globalThis.magazineSummary.term(item))) {
        const list = node("ul", "vocab");
        for (const item of block.items) {
          const row = globalThis.magazineSummary.term(item), { term, reading, meaning } = row, li = node("li");
          const word = node("div", "vocab-word"), ja = node("span", "vocab-term", term); ja.lang = "ja"; word.append(ja);
          if (reading) { const kana = node("span", "vocab-reading", reading); kana.lang = "ja"; word.append(kana); }
          const gloss = node("div", "vocab-meaning"); appendInline(gloss, meaning);
          li.append(word, gloss); list.append(li);
          if (kotoba) attachKotoba(li, row);
        }
        target.append(list); continue;
      }
      if (block.type === "list") {
        const list = node(block.ordered ? "ol" : "ul");
        for (const item of block.items) { const li = node("li"); appendInline(li, item); list.append(li); }
        target.append(list); continue;
      }
      const element = node(block.type === "title" ? "h3" : block.type === "heading" ? "h4" : "p",
        block.type === "note" ? "note" : block.type === "paragraph" && firstParagraph ? "lead" : "");
      if (block.type === "note") element.append(node("span", "note-label", "Limits of this excerpt"));
      if (block.type === "paragraph") firstParagraph = false;
      appendInline(element, block.text); target.append(element);
    }
  }
  function renderThread() {
    if (!threadNode) return;
    threadNode.replaceChildren();
    for (const turn of thread) {
      const item = node("div", "turn");
      item.append(node("div", "question", turn.question));
      const answer = node("div", "answer");
      if (turn.answer) {
        // Answers are prose, so a short first line is not promoted to a title.
        renderBlocks(answer, turn.answer, { lead: false });
        answer.querySelectorAll("h3").forEach(h => { const p = node("p"); p.append(...h.childNodes); h.replaceWith(p); });
        if (turn.truncated) answer.append(node("p", "note", "This answer reached the length limit. Ask a narrower question for the rest."));
      } else if (turn.error) answer.append(node("p", "answer-error", turn.error));
      else { answer.classList.add("pending"); answer.setAttribute("aria-label", "DeepSeek is answering"); for (let i = 0; i < 3; i++) answer.append(node("i")); }
      item.append(answer); threadNode.append(item);
    }
    readingLabel.hidden = !thread.length;
    const answered = thread.filter(turn => turn.answer).length;
    readingLabel.replaceChildren(node("span", "", TABS.ask[2]), node("span", "", `${answered} answered`));
  }
  function renderSummary() {
    if (!summaryNode) return;
    if (activeStyle === "ask") { summaryNode.replaceChildren(); renderThread(); return; }
    const entry = current(), text = entry?.text || "";
    summaryNode.replaceChildren();
    renderBlocks(summaryNode, text, { stocks: activeStyle === "stocks", vocabulary: activeStyle === "glossary", kotoba: activeStyle === "glossary" });
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const terms = summaryNode.querySelectorAll(".vocab>li").length;
    readingLabel.hidden = !text;
    kotobaCount = terms ? node("span") : null;
    readingLabel.replaceChildren(node("span", "", terms ? `${STYLES[activeStyle][2]} · ${terms} terms` : `${STYLES[activeStyle][2]} · ${Math.max(1, Math.ceil(words / 200))} min read`),
      entry && entry.source !== ocrText ? node("span", "", "Japanese text edited since") : kotobaCount || node("span", "", `${words} words`));
    summaryNode.parentElement.scrollTop = 0;
    if (terms) { void lookupWords(); paintCount(); }
  }
  function stockRow(row) {
    const li = node("li", "stock"), url = row.code && globalThis.magazineSummary.stockUrl(row.code);
    if (url) {
      const link = node("a", "ticker", row.code);
      Object.assign(link, { href: url, target: "_blank", rel: "noopener noreferrer", title: `Open ${row.code} on Monex (IFIS) in a new tab` });
      li.append(link);
    } else li.append(node("span", "ticker none", "—"));
    const body = node("div", "stock-body"), name = node("div", "stock-name");
    const en = node("strong"); appendInline(en, row.en || row.ja); name.append(en);
    if (row.ja && row.en) { const ja = node("span", "stock-ja", row.ja); ja.lang = "ja"; name.append(ja); }
    if (row.code && row.source === "inferred") {
      const badge = node("span", "badge", "verify code"); badge.title = "The model supplied this code; it is not in the article."; name.append(badge);
    }
    body.append(name);
    if (row.note) { const note = node("div", "stock-note"); appendInline(note, row.note); body.append(note); }
    li.append(body); return li;
  }
  // ---- Kotoba: each vocabulary word's card in the local Kotoba library, or a DeepSeek draft to add ----
  const KOTOBA_LABELS = { checking: ["…", "Checking your Kotoba library"], found: ["In Kotoba", "Show the Kotoba card"],
    related: ["Related", "Kotoba has related words, not this one. Show them or generate a card"],
    missing: ["+ Card", "Not in Kotoba. Generate a card with DeepSeek"], added: ["Added", "Added to Kotoba"],
    error: ["Kotoba", "Kotoba lookup failed. Show details"] };
  const FURIGANA = /([\p{Script=Han}々〆ヶ]+)（([\p{Script=Hiragana}\p{Script=Katakana}ー]+)）/gu;
  /**
   * One word's state, kept across tab switches for the capture: lookup status and results, an open
   * card, and a draft being edited, so re-rendering the list never loses what was typed.
   */
  function vocabEntry({ term, reading }) {
    const key = `${term}|${reading || ""}`;
    if (!vocab.has(key)) vocab.set(key, { term, reading: reading || "", status: null, words: [], lemma: term,
      open: false, working: null, card: null, drafted: "", added: null, error: "", nodes: null });
    return vocab.get(key);
  }
  function attachKotoba(li, row) {
    const entry = vocabEntry(row), toggle = button("", () => { entry.open = !entry.open; paintEntry(entry); }, "kotoba-toggle");
    const card = node("div", "kotoba");
    li.classList.add("kotoba-row"); li.append(toggle, card);
    entry.nodes = { li, toggle, card };
    paintEntry(entry);
  }
  const kotobaRequest = payload => ask({ type: "kotoba", ...payload })
    .catch(error => ({ ok: false, error: error.message }))
    .then(reply => reply ?? { ok: false, error: "The extension did not respond." });
  function paintCount() {
    if (!kotobaCount) return;
    const entries = [...vocab.values()].filter(entry => entry.nodes?.li.isConnected);
    const known = entries.filter(entry => entry.status === "found" || entry.status === "added").length;
    kotobaCount.textContent = entries.some(entry => entry.status === "checking") ? "Checking Kotoba…"
      : entries.every(entry => entry.status === "error") ? "Kotoba unavailable" : `${known} of ${entries.length} in Kotoba`;
  }
  async function lookupWords(entries = [...vocab.values()].filter(entry => !entry.status && entry.nodes?.li.isConnected)) {
    if (!entries.length) return;
    for (const entry of entries) { entry.status = "checking"; entry.error = ""; paintEntry(entry); }
    paintCount();
    for (let start = 0; start < entries.length; start += 40) {
      const batch = entries.slice(start, start + 40);
      const reply = await kotobaRequest({ action: "lookup", terms: batch.map(({ term, reading }) => ({ term, reading })) });
      batch.forEach((entry, index) => {
        const result = reply.ok && reply.results?.[index];
        if (!result) Object.assign(entry, { status: "error", error: reply.error || "Kotoba did not answer." });
        else Object.assign(entry, { status: result.exact ? "found" : result.words.length ? "related" : "missing",
          words: result.words, lemma: result.lemma || entry.term });
        paintEntry(entry);
      });
    }
    paintCount();
  }
  /** The sentence the word came from, which tells DeepSeek the sense; it is never copied into the card. */
  function sentenceFor(term) {
    const sentences = ocrText.replace(/\s+/g, "").split(/(?<=[。！？!?])/);
    return (sentences.find(sentence => sentence.includes(term)) || "").slice(0, 400);
  }
  async function draftWord(entry) {
    Object.assign(entry, { working: "draft", error: "", open: true }); paintEntry(entry);
    const reply = await kotobaRequest({ action: "draft", term: entry.term, reading: entry.reading, lemma: entry.lemma, sentence: sentenceFor(entry.term) });
    entry.working = null;
    if (!reply.ok || !reply.card) entry.error = reply.error || "The draft failed.";
    else Object.assign(entry, { card: reply.card, drafted: `Drafted by ${reply.model} in ${(reply.ms / 1000).toFixed(1)} s. Edit anything, then add it.` });
    paintEntry(entry);
  }
  async function registerWord(entry) {
    const card = { ...entry.card, examples: entry.card.examples.filter(example => example.japanese.trim() && example.english.trim()) };
    const missing = ["term", "reading", "meaning"].find(key => !card[key]?.trim());
    if (missing) { entry.error = `Fill in the ${missing === "term" ? "word" : missing} first.`; paintEntry(entry); return; }
    Object.assign(entry, { working: "register", error: "" }); paintEntry(entry);
    const reply = await kotobaRequest({ action: "register", card });
    entry.working = null;
    if (!reply.ok) entry.error = reply.error || "The card could not be added.";
    else Object.assign(entry, { added: reply, status: "added" });
    paintEntry(entry); paintCount();
  }
  function paintEntry(entry) {
    const nodes = entry.nodes;
    if (!nodes) return;
    const [label, title] = KOTOBA_LABELS[entry.status || "checking"];
    nodes.toggle.textContent = label; nodes.toggle.title = title; nodes.toggle.dataset.state = entry.status || "checking";
    nodes.toggle.setAttribute("aria-expanded", String(entry.open));
    nodes.toggle.setAttribute("aria-label", `${entry.term}: ${title}`);
    nodes.card.hidden = !entry.open;
    if (entry.open) nodes.card.replaceChildren(...kotobaView(entry));
  }
  function kotobaView(entry) {
    const out = [], error = entry.error && node("p", "kerror", entry.error);
    if (error) error.setAttribute("role", "alert");
    const actions = (...items) => { const row = node("div", "actions"); row.append(...items); return row; };
    if (entry.status === "checking") return [node("p", "kstatus", "Looking it up in your Kotoba library…")];
    if (entry.status === "error") return [error, actions(button("Try again", () => void lookupWords([entry])))];
    if (entry.added) {
      const { remote, label } = entry.added;
      out.push(node("p", "kstatus", remote.status === "added" ? "Added to Kotoba. It joins the study queue as a new word."
        : `Kotoba already had this word (added on the site after your last backup). It is now labelled ${label}.`));
      if (entry.card.studyGuide && !remote.guideSaved) out.push(node("p", "knote", "The site did not store the study guide yet; it is kept in your local library."));
      out.push(wordView({ ...entry.card, tags: [label], source: "reader" }, true));
      return out;
    }
    if (entry.working === "draft") return [node("p", "kstatus", "Drafting a card with DeepSeek — a few seconds…")];
    if (entry.card) return [node("p", "knote", entry.drafted), cardForm(entry), error];
    const generate = button(entry.status === "missing" ? "Generate card with DeepSeek" : "Generate a card for this word",
      () => void draftWord(entry), entry.status === "missing" ? "primary" : "");
    if (entry.status === "found" || entry.status === "related") {
      if (entry.status === "related") out.push(node("p", "knote", `${entry.lemma} itself is not in Kotoba. Related words it has:`));
      // Related words are the parts kuromoji split out (週休三日制 → 三, 日…), so only the first few are worth showing.
      entry.words.slice(0, entry.status === "found" ? 5 : 3).forEach((word, index) => out.push(wordView(word, entry.status === "found" && index === 0)));
      out.push(error, actions(entry.status === "found" ? link("Not the word you meant? Generate a new card", () => void draftWord(entry)) : generate));
      return out;
    }
    out.push(node("p", "", `${entry.lemma} is not in your Kotoba library yet.`), error, actions(generate),
      node("p", "knote", "Sends the word and its sentence to DeepSeek. Nothing is added until you confirm."));
    return out;
  }
  const link = (text, handler) => button(text, handler, "link");
  function withFurigana(target, text) {
    let last = 0;
    for (const match of text.matchAll(FURIGANA)) {
      target.append(text.slice(last, match.index));
      const ruby = node("ruby", "", match[1]); ruby.append(node("rt", "", match[2])); target.append(ruby);
      last = match.index + match[0].length;
    }
    target.append(text.slice(last));
    return target;
  }
  /** Study guides are Markdown from any Kotoba member: rendered as DOM text, never parsed as HTML. */
  function renderGuide(text) {
    const box = node("div", "kguide"); box.lang = "en";
    let list = null, paragraph = null;
    for (const raw of String(text).replace(/\r/g, "").split("\n")) {
      const line = raw.trim();
      if (!line) { list = paragraph = null; continue; }
      const heading = line.match(/^#{1,6}\s+(.*)$/), item = line.match(/^(?:[-*+]|(\d{1,9})[.)])\s+(.*)$/);
      if (heading) { const h = node("h5"); appendInline(h, heading[1]); box.append(h); list = paragraph = null; continue; }
      if (item) {
        const tag = item[1] ? "OL" : "UL";
        if (list?.tagName !== tag) { list = node(tag.toLowerCase()); box.append(list); }
        const li = node("li"); appendInline(li, item[2]); list.append(li); paragraph = null; continue;
      }
      list = null;
      if (paragraph) paragraph.append(node("br")); else { paragraph = node("p"); box.append(paragraph); }
      appendInline(paragraph, line);
    }
    return box;
  }
  function wordView(word, guideOpen = false) {
    const article = node("article", "kword"), head = node("div"), term = node("span", "kterm", word.term);
    term.lang = "ja"; head.append(term);
    if (word.reading && word.reading !== word.term) { const reading = node("span", "kreading", word.reading); reading.lang = "ja"; head.append(reading); }
    article.append(head, node("p", "kmeaning", word.meaning));
    if (word.match === "reading") article.append(node("p", "knote", "Matched by reading: Kotoba spells it differently."));
    if (word.source === "reader") article.append(node("p", "knote", "Added from a reader since your last Kotoba backup."));
    if (word.tags?.length) { const tags = node("div", "ktags"); for (const tag of word.tags) tags.append(node("span", "ktag", tag)); article.append(tags); }
    if (word.examples?.length) {
      const list = node("ul", "kexamples");
      for (const example of word.examples) {
        const li = node("li"), ja = withFurigana(node("div", "kja"), example.japanese); ja.lang = "ja";
        li.append(ja, node("div", "ken", example.english)); list.append(li);
      }
      article.append(list);
    }
    if (word.studyGuide) {
      const details = node("details"); details.open = guideOpen;
      details.append(node("summary", "", "Study guide"), renderGuide(word.studyGuide)); article.append(details);
    }
    return article;
  }
  let fieldCount = 0;
  function field(label, value, onInput, { multiline = false, rows = 2, lang } = {}) {
    const id = `kotoba-field-${++fieldCount}`, input = node(multiline ? "textarea" : "input");
    if (multiline) input.rows = rows; else input.type = "text";
    if (lang) input.lang = lang;
    input.id = id; input.value = value ?? "";
    input.addEventListener("input", () => onInput(input.value));
    const tag = node("label", "", label); tag.htmlFor = id;
    return [tag, input];
  }
  function cardForm(entry) {
    const card = entry.card, form = node("form");
    // No submit button: Enter in a field must never publish a card to the site.
    form.addEventListener("submit", event => event.preventDefault());
    form.append(...field("Word", card.term, value => { card.term = value; }, { lang: "ja" }),
      ...field("Reading (hiragana)", card.reading, value => { card.reading = value; }, { lang: "ja" }),
      ...field("Meaning", card.meaning, value => { card.meaning = value; }));
    card.examples.forEach((example, index) => {
      const set = node("fieldset"); set.append(node("legend", "", `Example ${index + 1}`),
        ...field("Japanese", example.japanese, value => { example.japanese = value; }, { multiline: true, rows: 2, lang: "ja" }),
        ...field("English", example.english, value => { example.english = value; }, { multiline: true }));
      form.append(set);
    });
    // The guide shows as it will read on the site, with its Markdown one click away.
    const guide = node("textarea"), preview = node("div", "kguide-preview"), head = node("div", "kguide-head");
    guide.rows = 10; guide.value = card.studyGuide || ""; guide.setAttribute("aria-label", "Study guide (Markdown)");
    guide.addEventListener("input", () => { card.studyGuide = guide.value; });
    const toggle = link("", () => show(guide.hidden));
    const show = editing => {
      guide.hidden = !editing; preview.hidden = editing; toggle.textContent = editing ? "Preview" : "Edit";
      if (editing) guide.focus(); else preview.replaceChildren(guide.value.trim() ? renderGuide(guide.value) : node("p", "knote", "No study guide."));
    };
    head.append(node("span", "", "Study guide"), toggle); form.append(head, preview, guide);
    show(false);
    const add = button(entry.working === "register" ? "Adding…" : "Add to Kotoba", () => void registerWord(entry), "primary");
    add.disabled = entry.working === "register"; add.title = "Adds the card to the Kotoba site and your local library";
    const row = node("div", "actions");
    row.append(add, button("Draft again", () => void draftWord(entry)),
      button("Discard", () => { Object.assign(entry, { card: null, error: "" }); paintEntry(entry); }));
    form.append(row);
    return form;
  }
  function askQuestion(question) {
    question = question.trim();
    if (busy || !question || !ocrText.trim()) return;
    // Failed turns are shown but never sent back as history.
    const history = thread.filter(turn => turn.answer).slice(-MAX_TURNS).map(({ question: q, answer }) => ({ question: q, answer }));
    for (let i = thread.length - 1; i >= 0; i--) if (thread[i].error) thread.splice(i, 1);
    thread.push({ question }); askInput.value = ""; renderThread();
    askNode.parentElement.scrollTop = askNode.parentElement.scrollHeight;
    void submit({ type: "ask", text: ocrText, question, history });
  }
  function chooseStyle(key) {
    if (busy) return;
    if (key === "ask") {
      activeStyle = "ask"; renderSummary(); updateBusy(false); setStatus("");
      askInput.focus({ preventScroll: true }); return;
    }
    if (!Object.hasOwn(STYLES, key)) return;
    activeStyle = key; saveSettings({ style: key });
    renderSummary(); updateBusy(false);
    if (summaries.has(key) || !ocrText.trim()) { setStatus(""); return; }
    void submit({ type: "summarize", text: ocrText, style: key });
  }
  async function submit(payload) {
    const id = crypto.randomUUID();
    updateArchive(null);
    jobId = id; jobStyle = payload.type === "ask" ? "ask" : payload.mode === "ocr" ? null : payload.style; updateBusy(true);
    if (copyButton) copyButton.textContent = "Copy";
    setStatus(payload.type === "capture" ? "Reading Japanese text locally…" : payload.type === "ask" ? ""
      : `Creating ${STYLES[payload.style][2].toLowerCase()} with DeepSeek…`);
    try {
      const response = await ask({ ...payload, id });
      if (!response?.ok) throw new Error(response?.error || "The extension did not respond.");
    } catch (error) {
      if (jobId !== id) return;
      updateBusy(false); jobId = null;
      if (payload.type === "ask") failQuestion(error.message); else setStatus(error.message, true);
    }
  }
  function failQuestion(error) {
    const turn = thread.at(-1);
    if (turn && !turn.answer) { turn.error = error; if (!askInput.value) askInput.value = turn.question; }
    renderThread(); updateBusy(false);
  }
  function showPanel() {
    const reader = node("div", "reader");
    panel = node("section", "panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Magazine Reader");
    const top = node("header", "panel-top"), header = node("div", "header"), tools = node("div", "header-tools");
    const brand = node("h2"); brand.append(node("span", "brand-dot"), document.createTextNode("Magazine Reader"));
    settingsButton = button("Aa", () => toggleSettings(), "icon-button");
    settingsButton.setAttribute("aria-label", "Reading settings"); settingsButton.title = "Typeface, size, spacing, width, theme";
    const closeButton = button("×", close, "icon-button close"); closeButton.setAttribute("aria-label", "Close reader");
    const libraryButton = button("Library", () => void ask({ type: "library" }).catch(() => {}), "icon-button");
    libraryButton.title = "Browse saved captures in a new tab";
    tools.append(libraryButton, settingsButton, closeButton); header.append(brand, tools);
    const tabs = node("div", "style-tabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Summary style or questions");
    tabButtons = Object.entries(TABS).map(([key, [label, description]], index) => {
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
    askNode = node("section", "ask"); askNode.setAttribute("aria-label", "Ask about this page");
    threadNode = node("div", "thread summary"); threadNode.setAttribute("aria-live", "polite");
    suggestionsNode = node("div", "suggestions");
    for (const text of SUGGESTIONS) suggestionsNode.append(button(text, () => askQuestion(text), "chip"));
    const composer = node("div", "composer");
    askInput = node("textarea", "ask-input"); askInput.rows = 2; askInput.maxLength = 2000; askInput.setAttribute("aria-label", "Question about this page");
    const fit = () => { askInput.style.height = "auto"; askInput.style.height = `${Math.min(askInput.scrollHeight + 2, 180)}px`; };
    askInput.addEventListener("input", () => { fit(); askButton.disabled = busy || !askInput.value.trim() || !ocrText.trim(); });
    askInput.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      event.preventDefault(); askQuestion(askInput.value); fit();
    });
    askButton = button("Ask", () => { askQuestion(askInput.value); fit(); }, "primary ask-send");
    const composerFoot = node("div", "composer-foot");
    clearButton = button("Clear conversation", () => { thread.length = 0; renderThread(); updateBusy(false); askInput.focus(); }, "link");
    composerFoot.append(node("span", "", "Enter to ask · Shift+Enter for a new line · uses this page's Japanese text"), clearButton);
    composer.append(askInput, askButton);
    askNode.append(threadNode, suggestionsNode, composer, composerFoot); body.append(askNode);
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
      const entry = current();
      const text = activeStyle === "ask"
        ? thread.filter(turn => turn.answer).map(turn => `Q: ${turn.question}\n\n${turn.answer}`).join("\n\n---\n\n")
        : entry && globalThis.magazineSummary.copyText(entry.text).split("\n").map(line => {
          // Copy vocabulary as "語句 (reading) — meaning" rather than the pipe format.
          const row = activeStyle === "glossary" && line.match(/^[-*•]\s+(.+)$/) && globalThis.magazineSummary.term(line.replace(/^[-*•]\s+/, ""));
          return row ? `- ${row.term}${row.reading ? ` (${row.reading})` : ""} — ${row.meaning}` : line;
        }).join("\n");
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text); event.target.textContent = "Copied";
        setTimeout(() => { event.target.textContent = "Copy"; }, 1600);
      } catch { setStatus("Clipboard access failed. Select and copy the summary text manually.", true); }
    });
    cancelButton = button("Cancel", () => {
      void ask({ type: "cancel" }).catch(() => {});
      const asking = jobStyle === "ask"; jobId = null; jobStyle = null; updateBusy(false);
      if (asking) failQuestion("Cancelled."); else setStatus("Cancelled. Recognized text is retained.");
    });
    actions.append(button("New capture", standby), node("span", "spacer"), cancelButton, copyButton, summarizeButton);
    archiveNode = node("span", "archive-status"); archiveNode.setAttribute("role", "status"); updateArchive(archiveInfo);
    const footnote = node("div", "footnote"); footnote.append(archiveNode, node("span", "", "Summaries and questions send text to DeepSeek. Images stay on this Mac."));
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
        cropped = canvas.toDataURL("image/png"); ocrText = ""; summaries.clear(); thread.length = 0; vocab.clear(); activeStyle = settings.style;
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
      capture = message; region = null; ocrText = ""; summaries.clear(); thread.length = 0; vocab.clear(); cropped = ""; jobId = null; jobStyle = null; busy = false; archiveInfo = null;
      activeStyle = settings.style; settingsOpen = false;
      image = new Image(); image.src = capture.image; await image.decode(); selectionUI(); return { ok: true };
    }
    if (message.type === "error") { await settingsReady; showPanel(); updateBusy(false); setStatus(message.error, true); return { ok: true }; }
    if (message.type !== "progress" || message.token !== capture?.token || !busy || message.id !== jobId) return { ok: true };
    if (message.archive) updateArchive(message.archive);
    if (typeof message.text === "string") { ocrText = message.text; textArea.value = ocrText; }
    if (message.stage === "recognizing") setStatus("Reading Japanese text locally…");
    if (message.stage === "recognized") setStatus("Japanese text recognized.");
    if (message.stage === "summarizing" && jobStyle && jobStyle !== "ask") setStatus(`Creating ${STYLES[jobStyle][2].toLowerCase()} with DeepSeek…`);
    if (message.done) {
      const style = jobStyle;
      jobId = null; jobStyle = null;
      if (style === "ask") {
        if (!message.ok || typeof message.answer !== "string") { failQuestion(message.error || "DeepSeek did not answer."); return { ok: true }; }
        Object.assign(thread.at(-1), { answer: message.answer, truncated: Boolean(message.truncated) });
        updateBusy(false); renderThread(); askInput.focus({ preventScroll: true });
        return { ok: true };
      }
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
    if (host.style.display === "none" || event.isComposing) return;
    if (event.key === "Escape") {
      if (isReader() && settingsOpen) toggleSettings(false); else close();
      event.stopPropagation(); return;
    }
    const modal = ui?.className === "selection" || (isReader() && settings.layout === "center");
    if (event.key === "Tab") { if (modal) trapFocus(event); return; }
    // Docked reading leaves the page usable; only shortcuts typed while focus is in the panel are ours.
    if (!isReader() || (!modal && !root.activeElement) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (root.activeElement?.matches("textarea, input, select")) return;
    const styleKeys = Object.keys(TABS);
    if (event.key === "+" || event.key === "=") saveSettings({ size: settings.size + 1 });
    else if (event.key === "-" || event.key === "_") saveSettings({ size: settings.size - 1 });
    else if (/^[1-9]$/.test(event.key) && styleKeys[event.key - 1]) chooseStyle(styleKeys[event.key - 1]);
    else return;
    event.preventDefault(); event.stopPropagation();
  }, true);
  window.addEventListener("resize", () => { if (ui?.className === "selection") { close(); } });
})();
