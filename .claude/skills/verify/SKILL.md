---
name: verify
description: Drive the Magazine Reader Chrome extension and its native host the way a user does, in an isolated Chrome for Testing profile with a sandboxed host and data/, and capture proof (screenshots, host transcripts). Use to prove a change to chrome/ (overlay, Library page) or host/ (OCR, archive, Library reads) works, to reproduce a UI bug, or before claiming an extension change is done.
---

# Verify Magazine Reader

One script does everything: `node .claude/skills/verify/scripts/mr-verify.mjs <command>` (below: `mrv`). Run it from the repo root; it has no dependencies beyond Node 22+ and a Chrome for Testing build.

```bash
alias mrv='node .claude/skills/verify/scripts/mr-verify.mjs'   # or type the full path each time
```

## What can be driven, and what can't

| Surface | Code under test | How |
|---|---|---|
| Library page (`library.html`) | real `chrome/library.js`, real background-free `sendNativeMessage`, real `host/library.mjs` | the **real unpacked extension** in an isolated profile, talking to a **sandboxed copy of the native host** |
| Reader overlay (capture, boxes, tabs, settings, parts, Ask, Vocabulary) | real `chrome/content.js` + `chrome/summary.js`; `chrome.runtime` is **mocked** by `tests/preview.js` | `tests/preview.html` fixture opened in the same isolated browser |
| Native host (OCR, archive, Library reads, Kotoba lookup) | real `host/*.mjs` and the real `bin/ocr` Live Text helper | framed native-messaging requests to the sandboxed host (`mrv host`) |
| Toolbar click on a real `magazine.rakuten.co.jp/read/…` page (`background.js` `captureReader`, `activeTab`, `captureVisibleTab`) | — | **not drivable**: a toolbar click (the only `activeTab` grant) can't be synthesized, and the site needs the user's subscription login. Say so in the report; ask the user to try it by hand. `tests/background.test.mjs` covers the request validation. |

The fixture does not run `background.js`. A change to `background.js` is not proven by the overlay fixture. Prove it with `node --test tests/background.test.mjs` plus a manual check by the user on Rakuten, and state which you did.

## Launch

```bash
mrv launch                 # or: mrv launch --name my-run   (--headed to watch; --kotoba /path/to/kotoba to enable lookups)
```

It does four things:

1. It creates `.verify/<run>/instance/` (git-ignored) and stages a copy of `host/` and `chrome/manifest.json` there with `bin/ocr` symlinked. The host's `data/` is then `.verify/<run>/instance/root/data`, never the user's `data/`.
2. It seeds two captures: **"Seed: a four-day week trial"** (Overview summary, text contains `二百人`) and an OCR-only capture **"半導体からAI・データセンターへ広がる業界マップ。"**.
3. It writes a per-profile native messaging manifest (`<profile>/NativeMessagingHosts/io.github.vibecoda.magazine_reader.json`) that points at the sandbox launcher. The user's installed host isn't used.
4. It starts headless Chrome for Testing with `--load-extension=<repo>/chrome` and a free debugging port, and records the pid and port in `instance/state.json`.

**Ready** means the JSON it prints has `"ready": true`, which means the extension's service worker `chrome-extension://bchilcmoklaelegfndjimjmibgkddehd/background.js` is running. The run becomes `.verify/current`, so later commands need no `--run`.

Without Kotoba, the sandbox launcher sets no `KOTOBA_REPO`, so Kotoba requests fail with "Kotoba is not connected". `--kotoba` makes lookups read the user's local Kotoba library. Those reads are read-only.

Isolation: every run has its own profile, port, host copy and data, so two runs can coexist. Drive only a run you launched. Never attach to the user's own Chrome.

## Doctor

```bash
mrv doctor
```

This is read-only. It checks that our pid is alive and owns our profile, that CDP answers, that the extension is loaded with the pinned ID, and that the repo's `manifest.json` version matches the launched one. A mismatch means extension code changed after the launch: relaunch. It also sends a real `library/list` to the sandbox host. The command exits non-zero if anything is off. It also lists open page IDs. Run it first whenever something looks wrong.

## Drive

`open` prints `{ "id": "<pageId>" }`. Every other page command takes that id.

```bash
P=$(mrv open library | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')   # also: fixture, library-fixture, or any URL
mrv click $P "Whole viewport"            # exact text, aria-label or title of a control; or css:<selector>
mrv click $P "css:.search"
mrv drag  $P 300 200 900 500             # pointer drag in viewport px (draws a selection box)
mrv type  $P "二百人"                     # inserts into the focused field
mrv key   $P Enter                       # Enter, Escape, Tab, Backspace, or a single char like / j k + -
mrv wait  $P 'root.querySelector(".panel") && "reader open"' 15000
mrv eval  $P '[...doc.querySelectorAll(".item-title")].map(e => e.textContent)'
mrv shot  $P library-open.png            # into .verify/<run>/evidence/
mrv close $P
```

- `click`, `drag` and `key` dispatch real CDP input events at the element's on-screen center, the way a user would. Don't use `eval` to call `.click()` or set state.
- In `eval` and `wait`, `root` is the overlay's **closed** shadow root when the page has one (the reader overlay), otherwise `document`; `doc` is always `document`. The overlay can't be reached through `document.querySelector`. Use `root`.
- `click` searches `root` first, then `doc`, and picks the first visible match. When a label appears twice (the reader's `Ask` tab vs. an `Ask` button), use `css:` with a stable class from the feature file.
- Stable handles: overlay classes `.selection .toolbar .rect .standby .panel .style-tab[role=tab] .ask-input .ask-send .thread .answer .settings`, buttons by their visible label. Library: `.search .count .item .item-title [role=tab] .summary .path`.

**Native host directly** (local requests only by default):

```bash
mrv host '{"type":"library","action":"list","query":"二百人"}'
mrv host '{"type":"capture","mode":"ocr","source":{"url":"https://magazine.rakuten.co.jp/read/verify","captureId":"v1"}}' --image page.png [--image col2.png]
```

It prints every framed event (`recognizing`, `recognized`, `archived`, then `done`) and saves the transcript to `evidence/host-*.json`. `summarize`, `ask`, `capture` with `mode:"summary"`, and Kotoba `draft`/`register` call DeepSeek (which is billed) or write to the Kotoba site. They are refused unless you pass `--allow-network`, and you pass that only when the user asked for a live call.

## Evidence

Everything goes in `.verify/<run>/evidence/`, which cleanup keeps:
- `log.txt` has a timestamped line for every driver command (the actions).
- Screenshots come from `shot`.
- `host-*.json` holds the request and every host event.

Proof standards:
- Drive the user path. Click the controls; don't call internals. The fixture's mocked `chrome.runtime` is the one sanctioned mock: it stands where the production boundary (background worker plus native host) already isolates the overlay.
- Capture the action **and** the resulting state: a screenshot before and after, plus an `eval` of the text that proves it.
- Verify side effects as well as the screen. For host work, list the sandbox data folder named in the `archived` event, and read `ocr.txt` and `metadata.json` there. For the Library page, the `.path` shown must be inside `.verify/<run>/instance/root/data`.
- Report anything not driven, such as the toolbar flow on Rakuten or any live DeepSeek call, as **not verified**, with the reason. Don't relabel a fixture run as a real-site run.

## Cleanup

```bash
mrv cleanup
```

It stops only the Chrome whose pid is in `state.json`, and only after confirming that process still uses our profile. It never kills by name. It then deletes `instance/` (profile, host copy, sandbox data) and keeps `evidence/`, and prints the evidence files that remain. Run it after every run, failed ones included. A run whose Chrome already died still needs `cleanup` to remove `instance/`.

## Setup prerequisites

- **Chrome for Testing.** The script finds the newest `~/Library/Caches/ms-playwright/chromium-*/…/Google Chrome for Testing`. If none exists, run `npx playwright install chromium`, or set `MR_VERIFY_CHROME`. Branded Google Chrome ignores `--load-extension` and won't work.
- **`bin/ocr`** must exist (`node host/install.mjs` builds it). Live Text OCR needs macOS 13+.

## Feature map

`features/README.md` indexes the user-facing features and how to prove each. Use the matching file as the recipe. Keep the map current with `/maintain-verification-skill`.
