<img src="chrome/icons/icon-128.png" width="72" alt="" align="right">

# Magazine Reader

A Chrome extension for reading Japanese magazines on the
[Rakuten Magazine](https://magazine.rakuten.co.jp/) web reader in English.
Select part of a page, and it recognizes the Japanese text **locally** with macOS
Live Text, then uses DeepSeek to summarize, translate, list the stocks mentioned,
or answer your questions — in a reader overlay on top of the magazine.

```
toolbar button → screenshot of the visible page → you select a region
              → native host on your Mac ─┬─ OCR with macOS Live Text (stays on your Mac)
                                         └─ DeepSeek API (text only) → reader overlay
```

There are no npm dependencies, build steps for the extension, or LLM SDKs:
plain JavaScript in Chrome, a small Node.js native-messaging host, and a 40-line
Swift OCR helper that the installer compiles for you.

## Requirements

- **macOS 13 (Ventura) or newer** — OCR uses the built-in Live Text engine.
- **Xcode Command Line Tools** for `swiftc`: `xcode-select --install`
  (skip if `xcrun swiftc --version` already works).
- **Node.js 22 or newer** (`node --version`).
- **Google Chrome 116 or newer**.
- A **DeepSeek API key** from <https://platform.deepseek.com/api_keys>.
  Normal DeepSeek API billing applies; OCR-only use needs no key.
- A Rakuten Magazine subscription — the extension only runs on
  `https://magazine.rakuten.co.jp/read/…` pages.

## Install

```bash
git clone git@github.com:vibecoda/magazine-reader.git
cd magazine-reader
node host/install.mjs
```

The installer:

1. builds the OCR helper into `bin/ocr` (from `ocr/ocr.swift`),
2. registers the native messaging host `io.github.vibecoda.magazine_reader` with
   Chrome, allowed to talk **only** to this extension, and
3. asks for your DeepSeek API key (input is hidden; press Enter to skip).

Then load the extension:

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose this repository's **`chrome/`** folder.
3. Optionally pin **Magazine Reader** from the puzzle-piece menu.

The extension ID is always `bchilcmoklaelegfndjimjmibgkddehd` (pinned by the public
key in `chrome/manifest.json`), which is what the native host trusts.

Check the setup at any time:

```bash
node host/install.mjs --check
```

### Connecting Kotoba (optional)

The Vocabulary tab can look words up in, and add cards to, [Kotoba](https://goi.benkyo.workers.dev/),
using the Kotoba repository's own reader host (`extension/host/`). Set that up first as its
`extension/README.md` describes: its local library (`build-library.mjs`) and, for adding cards, its
`KOTOBA_INGEST_TOKEN`. Then point the installer at the repository once; it is remembered on re-install:

```bash
node host/install.mjs --kotoba /path/to/kotoba
```

`node host/install.mjs --check` shows the library and whether the ingest token was found. Drafting
uses this extension's DeepSeek key.

### DeepSeek API key

```bash
node host/install.mjs --set-key             # prompt (hidden input)
pbpaste | node host/install.mjs --set-key   # or pipe it in, e.g. from the clipboard
node host/install.mjs --remove-key
```

The key is stored in `~/Library/Application Support/Magazine Reader/deepseek-api-key`
with owner-only permissions and is read by the native host for each request, so
changes apply without reloading anything. It is never copied into the extension
or this repository.

The host looks for a key in this order and uses the first it finds:

1. `DEEPSEEK_API_KEY` in the host's environment (Chrome-launched hosts usually
   don't inherit your shell's variables, so this is mainly for command-line tests),
2. the key file above,
3. a `DEEPSEEK_API_KEY=…` line in `~/.env2` (read as text, never executed).

## Using it

1. Open a magazine at `https://magazine.rakuten.co.jp/read/…` and zoom until the
   text is comfortably readable. Exit the reader's fullscreen mode first.
2. Click the **Magazine Reader** toolbar button. The page freezes into a screenshot
   with a control bar at the side (**Move to left/right** switches sides). Choose a
   **Summary style** there.
3. Drag a rectangle around a page, article, or text column, or click **Whole viewport**.
   For columns, sidebars or boxes, draw several rectangles: they are numbered and read in
   the order you draw them (up to 12). **Undo box** removes the last one.
4. **Summarize selection** runs OCR on your Mac and sends only the recognized text to
   DeepSeek. **OCR only** stops after recognition and sends nothing anywhere.
5. The result opens in a reader over the dimmed page. Tabs across the top switch
   between output styles:

   | Tab | Output |
   |---|---|
   | Key points | A title and 3–5 one-sentence bullets |
   | Overview | An overview paragraph plus 3–6 key points (default) |
   | Prose | A literal summary in flowing paragraphs, in the article's order |
   | Detailed | Section-by-section headings and bullets, keeping figures and quotes |
   | Translation | A full English translation rather than a summary |
   | Vocabulary | 10–25 Japanese words and phrases, each with its reading and meaning, checked against your Kotoba library |
   | Stocks | Each company named, with its Tokyo securities code linked to Monex |
   | Ask | A conversation: ask DeepSeek anything about the page |

   A tab you haven't generated yet sends the same text again in that style; results
   are kept for the capture (marked with a dot) and switch instantly.
   **Regenerate** asks for a fresh version.
6. To turn the page, click **New capture**. The overlay shrinks to a small bar so you
   can use the magazine normally; click **Capture page** when you're on the page you
   want, or **Back** to return to the last result.
7. When an article continues on another page or in another box, click **+ Add part**
   instead. Turn the page, click **Capture page**, select the continuation, and click
   **Add to article**. Repeat as needed. **Add to article** only reads the text on
   your Mac; summarize from the reader once the article is complete.

**Articles in several parts** — each box or page becomes a part, headed in the Japanese
text by a line such as `――― Part 2 ―――`. DeepSeek is told these are pieces of one
article in reading order. Delete or reorder parts by editing the text. Adding a part clears
the results of the shorter article (they're still in `data/`) but keeps the Ask conversation.
The parts are kept only while the magazine tab is open; **New capture** or closing the
reader starts over.

**Stocks** — click a code to open its page on Monex's IFIS company data
(`monex.ifis.co.jp/index.php?sa=find&ta=n&wd=<code>`) in a new tab; it may ask you
to log in to Monex. Codes printed in the article are linked directly; codes the
model supplied from its own knowledge carry a **verify code** badge, and companies
it isn't sure about get no link.

**Ask** — type a question (or pick a suggestion) and press Enter; Shift+Enter adds a
line. DeepSeek gets the page's Japanese text and up to 8 earlier questions and
answers, and is told to answer from the article and clearly label any outside
background knowledge. **Copy** copies the conversation; **Clear conversation**
starts over.

**Vocabulary and Kotoba** — if Kotoba is connected (see below), every word in the
Vocabulary tab is checked against your local Kotoba library and gets a badge: **In Kotoba**,
**Related** (Kotoba has only parts of it, e.g. 試験 for 試験的に), or **+ Card**. Click the badge:

- **In Kotoba** shows the full card: reading, meaning, labels, examples with furigana, and the
  study guide.
- **+ Card** offers **Generate card with DeepSeek**, which drafts a card the way Kotoba Reader
  does, from the word and the sentence it appeared in (the sentence only picks the sense; the
  examples are always original, since magazines are copyrighted). Edit anything, then
  **Add to Kotoba**: the card goes to the Kotoba site through its ingest API, labelled
  `Web reading`, and into the local library, so the next lookup finds it.

Lookups stay on your Mac. Nothing is drafted or added until you click.

**Reading settings** — the **Aa** button: typeface (serif, sans, humanist, mono),
text size, line spacing, width, theme (paper, sepia, night), position (centered, or
docked left/right so the magazine stays usable), and ragged or justified text.
Settings are remembered.

**Keyboard** (while the reader has focus) — `+` / `-` text size, `1`–`8` switch tabs,
Escape closes settings, then the reader.

**Fixing OCR** — open **Japanese text · review or edit** to correct the recognized
text, then **Summarize** / **Regenerate** (or ask again). **Copy** copies a summary
without its final "limitations" note.

## Your data

Every request is saved automatically in this repository's `data/` folder
(git-ignored), one folder per request: `data/YYYY-MM-DD/<time>-<id>/` (UTC dates).

- `ocr.txt` — the Japanese text that was used, including your edits.
- `summary.md` — the English output; for **Ask**, the question and answer.
- `metadata.json` — page URL, capture time and ID, output style (`ask` for
  questions), model, whether the output was cut off, and, for an article in several
  parts, when each part was captured (`parts`).

The text is saved **before** DeepSeek is called, so it survives failed or cancelled
requests. Retries and other styles get their own folders; the shared capture ID in
`metadata.json` groups them. Screenshots are never saved.

**What leaves your Mac:** only the recognized text (plus your questions) goes to
`https://api.deepseek.com/chat/completions`, using the `deepseek-flash` model with
thinking disabled. **Generate card** sends one word and its sentence there too, and
**Add to Kotoba** sends the edited card to the Kotoba site; Kotoba lookups are local. Screenshots and images stay local; the OCR helper works on a
private temporary file that is deleted afterwards. Keys and article text are never
logged, and provider error bodies are never shown.

**Chrome permissions:**
- `activeTab` + `scripting` — take the screenshot and show the overlay only after you
  click the button, and only on Rakuten's `/read/` pages. No content scripts run
  automatically and there are no site-wide host permissions.
- `nativeMessaging` — talk to the local host. No web server or open port is involved.
- `storage` — short-lived capture details (so selection survives Chrome suspending
  the background worker) and your reading settings. No images or text.

Use within the terms of your magazine subscription.

## Limits

- It reads **what is visible** in the tab, not a whole issue or scrolling page.
- OCR is macOS Live Text's transcript; dense vertical columns, tiny print, tables and
  mixed sidebars may need smaller selections or manual fixes in the Japanese text.
- Summaries can only cover the selected text and flag unclear or incomplete excerpts;
  they can't recover missing content. Very long selections can hit output limits —
  the reader tells you when that happens.

## Troubleshooting

| Message or symptom | Fix |
|---|---|
| "Install the Magazine Reader native host…" | Run `node host/install.mjs`, then reload the extension. |
| "No DeepSeek API key…" | `node host/install.mjs --set-key` |
| "DeepSeek rejected the API key" / "no balance left" | Check the key and balance at platform.deepseek.com. |
| "Could not build bin/ocr" | `xcode-select --install`, then re-run the installer. |
| "No readable text" | Zoom the magazine in and select a tighter region. |
| "Open a Rakuten Magazine reader tab…" | The extension only works on `magazine.rakuten.co.jp/read/…`. |
| "Exit reader fullscreen…" | Leave the magazine's fullscreen mode, then click again. |
| Nothing happens after moving the repo or upgrading Node | Re-run `node host/install.mjs`. |
| "Kotoba is not connected" | `node host/install.mjs --kotoba /path/to/kotoba` |
| "No local library at …" | In the Kotoba repository: `node extension/host/build-library.mjs` |
| "No ingest token" when adding a card | Put `KOTOBA_INGEST_TOKEN` in the Kotoba repository's `.env`. |

`node host/install.mjs --check` shows what's installed and where the key was found.
To test OCR (and optionally DeepSeek) without Chrome:

```bash
node host/check-image.mjs /path/to/page.png             # OCR only
node host/check-image.mjs /path/to/page.png --summarize  # also calls DeepSeek
```

## Development

```
chrome/   the extension: background worker, overlay (content.js), summary parser, icons
host/     native messaging host (Node.js): OCR, DeepSeek, archive, Kotoba bridge, installer
ocr/      Swift source of the OCR helper (built to bin/ocr)
tests/    node:test suites and a browser UI fixture
```

```bash
node --test tests/*.test.mjs
node --check chrome/content.js && node --check chrome/background.js
```

`tests/preview.html` exercises the overlay with synthetic Japanese text and mocked
Chrome / DeepSeek responses — no extension install or API calls. Serve the
repository root (e.g. `python3 -m http.server 8765`) and open
`http://localhost:8765/tests/preview.html`.

After changing extension code, reload it at `chrome://extensions` and refresh the
magazine tab. Host changes apply on the next request.

The icon's sources are `chrome/icons/icon.svg` (32/48/128 px) and the simplified
`icon-16.svg`; re-render the PNGs with `rsvg-convert` (`brew install librsvg`):

```bash
cd chrome/icons
for n in 32 48 128; do rsvg-convert -w $n -h $n icon.svg -o icon-$n.png; done
rsvg-convert -w 16 -h 16 icon-16.svg -o icon-16.png
```

## Uninstall

1. Remove the extension at `chrome://extensions`.
2. Delete `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/io.github.vibecoda.magazine_reader.json`.
3. Delete `~/Library/Application Support/Magazine Reader/` (the host launcher and your key).
4. Delete this repository; `data/` holds your saved summaries.
