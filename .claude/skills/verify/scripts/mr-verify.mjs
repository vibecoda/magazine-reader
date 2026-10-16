#!/usr/bin/env node
/**
 * Verification driver for Magazine Reader. Zero dependencies: Node 22+ (global WebSocket) and a
 * Chrome for Testing build (branded Chrome ignores --load-extension).
 *
 * Every run lives in <repo>/.verify/<run>/:
 *   instance/  disposable: Chrome profile, a staged copy of host/ with its own data/, launcher, state.json
 *   evidence/  kept by cleanup: screenshots, host transcripts, log.txt of every driver command
 * <repo>/.verify/current names the run the other commands use by default (override with --run <name>).
 */
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const VERIFY = join(REPO, ".verify");
const HOST_NAME = "io.github.vibecoda.magazine_reader";
const { extensionId } = await import(pathToFileURL(join(REPO, "host", "paths.mjs")).href);
const { decodeMessages, encodeMessage } = await import(pathToFileURL(join(REPO, "host", "protocol.mjs")).href);
const EXT_ID = extensionId();

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const bool = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const fail = message => { console.error(`mr-verify: ${message}`); process.exit(1); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const runName = flag("--run") ?? (existsSync(join(VERIFY, "current")) ? readFileSync(join(VERIFY, "current"), "utf8").trim() : null);
const paths = run => ({ dir: join(VERIFY, run), instance: join(VERIFY, run, "instance"), evidence: join(VERIFY, run, "evidence"),
  state: join(VERIFY, run, "instance", "state.json") });
const state = () => {
  if (!runName) fail("no run. Start one with: launch");
  const p = paths(runName);
  if (!existsSync(p.state)) fail(`run ${runName} has no live instance (${p.state} missing). Launch again.`);
  return { ...JSON.parse(readFileSync(p.state, "utf8")), ...p };
};
const log = (p, line) => { mkdirSync(p.evidence, { recursive: true }); appendFileSync(join(p.evidence, "log.txt"), `${new Date().toISOString()} ${line}\n`); };

function findChrome() {
  if (process.env.MR_VERIFY_CHROME) return process.env.MR_VERIFY_CHROME;
  const cache = join(homedir(), "Library", "Caches", "ms-playwright");
  const builds = existsSync(cache) ? readdirSync(cache).filter(n => /^chromium-\d+$/.test(n)).sort((a, b) => b.split("-")[1] - a.split("-")[1]) : [];
  for (const build of builds) for (const arch of ["chrome-mac-arm64", "chrome-mac", "chrome-mac-x64"]) {
    const bin = join(cache, build, arch, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
    if (existsSync(bin)) return bin;
  }
  fail("no Chrome for Testing found. Run: npx playwright install chromium   (or set MR_VERIFY_CHROME)");
}

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); s.on("error", rej); });
const json = async (port, path, method = "GET") => (await fetch(`http://127.0.0.1:${port}${path}`, { method })).json();
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const commandOf = pid => { try { return execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).trim(); } catch { return ""; } };

/** Copies host/ and the manifest so the host's ROOT, and with it data/, is inside the run. */
async function stageHost(instance, { kotoba }) {
  const root = join(instance, "root");
  cpSync(join(REPO, "host"), join(root, "host"), { recursive: true });
  mkdirSync(join(root, "chrome"), { recursive: true });
  copyFileSync(join(REPO, "chrome", "manifest.json"), join(root, "chrome", "manifest.json"));
  if (!existsSync(join(REPO, "bin", "ocr"))) fail("bin/ocr is missing. Run: node host/install.mjs");
  mkdirSync(join(root, "bin")); symlinkSync(join(REPO, "bin", "ocr"), join(root, "bin", "ocr"));
  const launcher = join(instance, "host-launcher"), q = s => `'${s.replace(/'/g, "'\\''")}'`;
  writeFileSync(launcher, ["#!/bin/sh", `MAGAZINE_OCR_BINARY=${q(join(root, "bin", "ocr"))}`, "export MAGAZINE_OCR_BINARY",
    ...(kotoba ? [`KOTOBA_REPO=${q(kotoba)}`, "export KOTOBA_REPO"] : []),
    `exec ${q(process.execPath)} --disable-warning=ExperimentalWarning ${q(join(root, "host", "host.mjs"))} "$@"`, ""].join("\n"));
  chmodSync(launcher, 0o700);
  // Seed two captures through the staged archive module, so the files match what the host writes.
  const { createArchive } = await import(pathToFileURL(join(root, "host", "archive.mjs")).href);
  const data = join(root, "data"), url = "https://magazine.rakuten.co.jp/read/verify-seed";
  const one = createArchive({ id: "seed-one", type: "capture", mode: "summary", style: "overview",
    source: { url, capturedAt: "2026-01-02T09:00:00.000Z", captureId: "seed-capture-one" },
    text: "ある企業は週四日の勤務制度を三か月間試験的に導入した。参加した社員は二百人。" }, { root: data, now: new Date("2026-01-02T09:00:05.000Z") });
  one.complete({ summary: "Seed: a four-day week trial\n\nA company tested a four-day week with **200 employees**.\n\nKey points\n• Less commuting.\n• More pressure to finish work.", model: "seed", truncated: false });
  createArchive({ id: "seed-two", type: "capture", mode: "ocr", source: { url, capturedAt: "2026-01-01T08:00:00.000Z", captureId: "seed-capture-two" },
    text: "半導体からAI・データセンターへ広がる業界マップ。" }, { root: data, now: new Date("2026-01-01T08:00:05.000Z") });
  return { root, launcher, data };
}

async function launch() {
  const run = flag("--name") ?? new Date().toISOString().replace(/[:.]/g, "-");
  const p = paths(run);
  if (existsSync(p.state)) fail(`run ${run} already has an instance. Clean it up first.`);
  const kotoba = flag("--kotoba"), headed = bool("--headed");
  mkdirSync(p.instance, { recursive: true }); mkdirSync(p.evidence, { recursive: true });
  const host = await stageHost(p.instance, { kotoba: kotoba && resolve(kotoba) });
  const profile = join(p.instance, "profile");
  // Chromium reads per-profile native messaging manifests from <user-data-dir>/NativeMessagingHosts.
  mkdirSync(join(profile, "NativeMessagingHosts"), { recursive: true });
  writeFileSync(join(profile, "NativeMessagingHosts", `${HOST_NAME}.json`), JSON.stringify({ name: HOST_NAME,
    description: "Magazine Reader (verification sandbox)", path: host.launcher, type: "stdio", allowed_origins: [`chrome-extension://${EXT_ID}/`] }, null, 2));
  const chrome = findChrome(), port = await freePort();
  const child = spawn(chrome, [...(headed ? [] : ["--headless=new"]), `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
    "--no-first-run", "--no-default-browser-check", "--disable-search-engine-choice-screen", "--window-size=1400,1000",
    `--load-extension=${join(REPO, "chrome")}`, "about:blank"], { detached: true, stdio: ["ignore", "ignore", "ignore"] });
  child.unref();
  const ready = Date.now() + 20_000;
  let worker = null;
  while (Date.now() < ready && !worker) {
    await sleep(250);
    try { worker = (await json(port, "/json/list")).find(t => t.type === "service_worker" && t.url === `chrome-extension://${EXT_ID}/background.js`); } catch { /* not up yet */ }
  }
  const st = { run, pid: child.pid, port, chrome, profile, hostRoot: host.root, data: host.data, launcher: host.launcher, kotoba: kotoba ?? null,
    manifestVersion: JSON.parse(readFileSync(join(REPO, "chrome", "manifest.json"), "utf8")).version, startedAt: new Date().toISOString() };
  writeFileSync(p.state, JSON.stringify(st, null, 2));
  writeFileSync(join(VERIFY, "current"), run);
  if (!worker) { console.error("Chrome started but the extension's service worker never appeared."); process.exitCode = 1; }
  log(p, `launch pid=${child.pid} port=${port}`);
  console.log(JSON.stringify({ run, port, pid: child.pid, extensionId: EXT_ID, evidence: p.evidence, data: host.data, ready: Boolean(worker) }, null, 2));
}

async function doctor() {
  const st = state(), checks = {};
  checks.process = alive(st.pid) && commandOf(st.pid).includes(st.profile) ? "ok" : `not running (pid ${st.pid})`;
  try { checks.cdp = (await json(st.port, "/json/version")).Browser; } catch { checks.cdp = "no answer"; }
  try {
    const targets = await json(st.port, "/json/list");
    checks.extension = targets.some(t => t.url === `chrome-extension://${EXT_ID}/background.js`) ? `ok (${EXT_ID})` : "service worker not listed (may be idle; open the library page to wake it)";
    checks.pages = targets.filter(t => t.type === "page").map(t => `${t.id} ${t.url}`);
  } catch { checks.extension = "unknown"; }
  const repoVersion = JSON.parse(readFileSync(join(REPO, "chrome", "manifest.json"), "utf8")).version;
  checks.version = repoVersion === st.manifestVersion ? `ok (${repoVersion})` : `repo is ${repoVersion}, instance launched with ${st.manifestVersion}: relaunch`;
  try { const r = await hostRequest(st, { id: "doctor", type: "library", action: "list", query: "" }); checks.host = r.at(-1)?.ok ? `ok (${r.at(-1).total} captures in sandbox data/)` : `error: ${r.at(-1)?.error}`; }
  catch (e) { checks.host = `error: ${e.message}`; }
  console.log(JSON.stringify({ run: st.run, ...checks, data: st.data, evidence: st.evidence }, null, 2));
  if (Object.values(checks).some(v => typeof v === "string" && !/^ok|^Chrome|^HeadlessChrome/.test(v) && !v.startsWith("service worker"))) process.exitCode = 1;
}

function hostRequest(st, message, timeout = 130_000) {
  return new Promise((res, rej) => {
    const child = spawn(st.launcher, [`chrome-extension://${EXT_ID}/`], { stdio: ["pipe", "pipe", "pipe"] });
    let buffer = Buffer.alloc(0), stderr = "";
    const events = [], timer = setTimeout(() => { child.kill(); rej(new Error("host timed out")); }, timeout);
    child.stderr.on("data", d => { stderr += d; });
    child.stdout.on("data", chunk => {
      const decoded = decodeMessages(Buffer.concat([buffer, chunk])); buffer = decoded.rest;
      for (const m of decoded.messages) { events.push(m); if (m.done) { clearTimeout(timer); child.stdin.end(); } }
    });
    child.on("close", code => { clearTimeout(timer); events.at(-1)?.done ? res(events) : rej(new Error(`host exited ${code} without a final reply. ${stderr.trim()}`)); });
    child.stdin.write(encodeMessage(message));
  });
}

async function host() {
  const st = state(), allowNetwork = bool("--allow-network");
  const raw = args.shift(); if (!raw) fail("usage: host '<json message>' [--image file.png ...] [--allow-network]");
  const message = JSON.parse(raw);
  const images = []; let f; while ((f = flag("--image"))) images.push(`data:image/png;base64,${readFileSync(f).toString("base64")}`);
  if (images.length) message.images = images;
  message.id ??= `verify-${Date.now()}`;
  const local = message.type === "library" || (message.type === "capture" && message.mode === "ocr") || (message.type === "kotoba" && message.action === "lookup");
  if (!local && !allowNetwork) fail("this request calls DeepSeek or Kotoba (costs money or writes remotely). Re-run with --allow-network only if the user asked for it.");
  const events = await hostRequest(st, message);
  const out = join(st.evidence, `host-${message.type}-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify({ request: { ...message, images: message.images?.map(i => `<png ${i.length} chars>`) }, events }, null, 2));
  log(st, `host ${message.type}${message.action ? `/${message.action}` : ""}${message.mode ? `/${message.mode}` : ""} -> ${out}`);
  console.log(JSON.stringify(events, null, 2));
}

/** One CDP session on a page target. */
async function session(st, targetId) {
  const target = (await json(st.port, "/json/list")).find(t => t.id === targetId);
  if (!target) fail(`no page ${targetId}. List pages with: doctor`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP connect failed")); });
  let next = 0; const pending = new Map();
  ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++next; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  /** The overlay lives in a closed shadow root; DOM.getDocument with pierce reaches it. */
  async function scope() {
    const { root } = await send("DOM.getDocument", { depth: -1, pierce: true });
    let shadow = null;
    (function walk(n) { if (shadow) return; for (const s of n.shadowRoots ?? []) if (s.shadowRootType === "closed") { shadow = s; return; } for (const c of [...(n.children ?? []), ...(n.contentDocument ? [n.contentDocument] : [])]) walk(c); })(root);
    const { object } = shadow ? await send("DOM.resolveNode", { nodeId: shadow.nodeId }) : await send("Runtime.evaluate", { expression: "document" }).then(r => ({ object: r.result }));
    return object.objectId;
  }
  /** Evaluates `body` with `root` (overlay shadow root, else document) and `doc` in scope. */
  async function run(body) {
    const objectId = await scope();
    const r = await send("Runtime.callFunctionOn", { objectId, awaitPromise: true, returnByValue: true,
      functionDeclaration: `async function () { const root = this, doc = document; return (${body}); }` });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  return { send, run, close: () => ws.close() };
}

/** Finds a visible element by css:<selector>, or by exact text / aria-label / title of a control, in the overlay then the document. */
const FIND = `(q => { const scopes = [root, doc].filter((s, i, a) => a.indexOf(s) === i);
  const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  for (const s of scopes) {
    const all = q.startsWith("css:") ? [...s.querySelectorAll(q.slice(4))]
      : [...s.querySelectorAll("button,a,[role=tab],[role=radio],summary,label,.item,.chip,input,textarea,select")].filter(e =>
        [e.textContent.trim(), e.getAttribute("aria-label"), e.title].includes(q));
    const e = all.find(visible); if (e) return e;
  } return null; })`;

async function page() {
  const st = state(), cmd = args.shift(), targetId = args.shift();
  if (!targetId) fail(`usage: ${cmd} <pageId> ...`);
  const s = await session(st, targetId);
  try {
    if (cmd === "eval") {
      const value = await s.run(args.join(" "));
      log(st, `eval ${targetId} ${args.join(" ").slice(0, 300)}`);
      console.log(JSON.stringify(value, null, 2));
    } else if (cmd === "wait") {
      const [expr, ms = "15000"] = args, until = Date.now() + Number(ms);
      let value;
      while (!(value = await s.run(expr).catch(() => null)) && Date.now() < until) await sleep(200);
      log(st, `wait ${targetId} ${expr} -> ${value ? "ok" : "TIMEOUT"}`);
      if (!value) fail(`timed out after ${ms} ms waiting for: ${expr}`);
      console.log(JSON.stringify(value));
    } else if (cmd === "click") {
      const q = args.join(" ");
      const box = await s.run(`(() => { const e = ${FIND}(${JSON.stringify(q)}); if (!e) return null; e.scrollIntoView({ block: "center" });
        const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: Boolean(e.disabled) }; })()`);
      if (!box) fail(`no visible element matching ${JSON.stringify(q)}`);
      if (box.disabled) fail(`${JSON.stringify(q)} is disabled`);
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"])
        await s.send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
      log(st, `click ${targetId} ${q} @${Math.round(box.x)},${Math.round(box.y)}`);
      console.log(`clicked ${q}`);
    } else if (cmd === "drag") {
      const [x1, y1, x2, y2] = args.map(Number);
      await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1, y: y1 });
      await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 8; i++) await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + (x2 - x1) * i / 8, y: y1 + (y2 - y1) * i / 8, button: "left", buttons: 1 });
      await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", buttons: 0, clickCount: 1 });
      log(st, `drag ${targetId} ${x1},${y1} -> ${x2},${y2}`);
      console.log("dragged");
    } else if (cmd === "type") {
      await s.send("Input.insertText", { text: args.join(" ") });
      log(st, `type ${targetId} ${args.join(" ")}`);
      console.log("typed");
    } else if (cmd === "key") {
      const key = args[0], named = { Enter: [13, "\r"], Escape: [27, ""], Tab: [9, ""], Backspace: [8, ""] }[key];
      const [code, text] = named ?? [key.toUpperCase().charCodeAt(0), key];
      await s.send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: code, text: text || undefined });
      await s.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code });
      log(st, `key ${targetId} ${key}`);
      console.log(`pressed ${key}`);
    } else if (cmd === "shot") {
      const name = (args[0] ?? `shot-${Date.now()}`).replace(/[^\w.-]/g, "_").replace(/(\.png)?$/, ".png");
      const { data } = await s.send("Page.captureScreenshot", { format: "png" });
      const out = join(st.evidence, name); writeFileSync(out, Buffer.from(data, "base64"));
      log(st, `shot ${targetId} -> ${out}`);
      console.log(out);
    } else fail(`unknown command ${cmd}`);
  } finally { s.close(); }
}

const SHORTCUTS = { library: () => `chrome-extension://${EXT_ID}/library.html`,
  fixture: () => pathToFileURL(join(REPO, "tests", "preview.html")).href,
  "library-fixture": () => pathToFileURL(join(REPO, "tests", "library-preview.html")).href };

async function open() {
  const st = state(), target = args.shift() ?? "about:blank";
  const url = SHORTCUTS[target]?.() ?? target;
  const t = await json(st.port, `/json/new?${encodeURI(url)}`, "PUT");
  log(st, `open ${t.id} ${url}`);
  console.log(JSON.stringify({ id: t.id, url }));
}

async function closePage() {
  const st = state(), id = args.shift();
  await fetch(`http://127.0.0.1:${st.port}/json/close/${id}`);
  log(st, `close ${id}`);
  console.log(`closed ${id}`);
}

function cleanup() {
  const st = state();
  if (alive(st.pid)) {
    if (!commandOf(st.pid).includes(st.profile)) fail(`pid ${st.pid} is no longer our Chrome (command changed); not killing it. Remove ${st.instance} by hand.`);
    process.kill(st.pid, "SIGTERM");
  }
  log(st, `cleanup pid=${st.pid}`);
  for (let i = 0; i < 40 && alive(st.pid); i++) execFileSync("sleep", ["0.1"]);
  if (alive(st.pid)) process.kill(st.pid, "SIGKILL");
  rmSync(st.instance, { recursive: true, force: true });
  if (existsSync(join(VERIFY, "current")) && readFileSync(join(VERIFY, "current"), "utf8").trim() === st.run) rmSync(join(VERIFY, "current"));
  console.log(JSON.stringify({ stopped: st.pid, removed: st.instance, evidence: st.evidence, files: readdirSync(st.evidence) }, null, 2));
}

const cmd = args[0];
const commands = { launch, doctor, host, open, close: closePage, cleanup, eval: page, wait: page, click: page, drag: page, type: page, key: page, shot: page };
if (!commands[cmd]) {
  console.log(`usage: node .claude/skills/verify/scripts/mr-verify.mjs <command> [--run <name>]
  launch [--name N] [--headed] [--kotoba /path/to/kotoba]   start an isolated instance
  doctor                                                    is this instance worth driving?
  open <url|library|fixture|library-fixture>                new tab; prints its page id
  close <pageId>
  click <pageId> <text|css:selector>                        real mouse click at the element's center
  drag <pageId> x1 y1 x2 y2                                 pointer drag (draw a selection box)
  type <pageId> <text>   key <pageId> <Enter|Escape|/|j|...>
  wait <pageId> <js-expr> [ms]                              poll until truthy (root = overlay shadow root or document)
  eval <pageId> <js-expr>                                   print the JSON value
  shot <pageId> [name]                                      screenshot into evidence/
  host '<json>' [--image f.png ...] [--allow-network]       one framed request to the sandboxed native host
  cleanup                                                   stop our Chrome, delete instance/, keep evidence/`);
  process.exit(cmd ? 1 : 0);
}
if (cmd !== "launch" && cmd !== "host" && cmd !== "open" && cmd !== "close" && cmd !== "doctor" && cmd !== "cleanup") await commands[cmd]();
else { args.shift(); await commands[cmd](); }
