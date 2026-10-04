# Magazine Reader · 0.5.1

A small Chrome extension for the Rakuten Magazine web reader. Click the extension,
select a region of the visible spread, and read an English summary in an overlay.
It follows the native messaging / direct DeepSeek design in
the sibling `anki` repo's `extension/`, with **no npm dependencies, aichat, or LLM SDK**.

```
extension button → visible-tab PNG → region selection → native host
                                                      ├─ local VisionKit ocr
                                                      └─ DeepSeek text summary → overlay
```

## Setup on this Mac

Requires Node 22+ and the existing `ocr` binary built from `dot_home/utils/japanese_ocr/ocr.swift`.
The key lookup matches Kotoba Reader: `DEEPSEEK_API_KEY` from the host's environment,
then `~/.env2`. The native host reads that file without executing it. No key is
copied into the extension or repository. The current shell's exported variables
are not automatically inherited by Chrome: use `~/.env2` for that setup.

From this repository (`~/dev/gitlab/magazine-reader`):

```bash
node host/install.mjs --check
node host/install.mjs
# If ocr is not on PATH:
# node host/install.mjs --ocr "$HOME/.local/bin/ocr"
```

In Chrome, open `chrome://extensions`, enable Developer mode, and **Load unpacked**
from this repository's `chrome/` folder. The public manifest key pins the extension ID
to `bchilcmoklaelegfndjimjmibgkddehd`. Pin its toolbar button if desired.
The installer registers `com.dot_home.magazine_reader` (a name kept from when this
lived in dot_home) for only that extension;
it does not change Kotoba Reader. Re-run it after moving the repository or
upgrading Node / relocating the OCR executable, and reload the extension after
editing its JavaScript.

## Reading

1. Open a magazine at `https://magazine.rakuten.co.jp/read/…` and zoom until the
   text is readable. Exit the reader's fullscreen mode before capturing.
2. Click **Magazine Reader**. The overlay shows a frozen screenshot of the spread.
   Controls sit in a narrow bar at the right edge, leaving the center clear.
   **Move to left/right** switches that bar's side. Pick a **Summary style** there.
3. Drag around a page, article, or text column. **Whole viewport** selects everything
   visible; this also includes reader controls and margins.
4. **Summarize selection** performs OCR locally, then sends the transcript to DeepSeek.
   **OCR only** stops after recognition and sends nothing to DeepSeek.
5. Results open in a **centered reader** over a dimmed page, with a loading
   placeholder while OCR and DeepSeek run. Tabs across the top switch style:

   | Tab | Output |
   |---|---|
   | Key points | A title and 3–5 one-sentence bullets |
   | Overview | An overview paragraph plus 3–6 key points (default) |
   | Prose | A literal summary in flowing paragraphs, in the article's order |
   | Detailed | Section-by-section headings and bullets, keeping figures and quotes |
   | Translation | A full English translation rather than a summary |
   | Vocabulary | The gist plus 8–15 Japanese words with readings and meanings |
   | Stocks | Each company named, with its Tokyo securities code linked to Monex |

   In **Stocks**, click a code to open `monex.ifis.co.jp/index.php?sa=find&ta=n&wd=<code>`
   in a new tab. Codes the model supplied itself, rather than found in the article,
   carry a **verify code** badge; uncertain or unlisted companies get no link.

   The last tab, **Ask**, is a conversation about the page. Type any question (or
   pick a suggestion) and press Enter; Shift+Enter adds a line. DeepSeek receives
   the page's Japanese text plus up to 8 earlier questions and answers, and is told
   to answer from the article and to label any outside background knowledge.
   Edits to the Japanese text apply to the next question. **Copy** copies the whole
   conversation and **Clear conversation** starts over; a new capture also clears it.

   Choosing a tab you haven't generated yet sends the same OCR text again in that
   style; generated styles are kept for the capture (marked with a dot) and switch
   instantly. **Regenerate** asks for a fresh version of the current style.
6. **Aa** opens reading settings: typeface (serif, sans, humanist, mono), text size,
   line spacing, width, theme (paper, sepia, night), position (centered, or docked
   left/right so the magazine stays usable), and ragged or justified alignment.
   Settings and the last style are remembered in `chrome.storage.local`.
   Keys while the reader has focus: `+` / `-` text size, `1`–`8` tab, Escape
   closes settings, then the reader. A thin bar under the header shows reading progress.
   Review or edit **Japanese text**, then **Summarize** / **Regenerate** to retry with
   corrections. **Copy** copies the title and main text without its final
   limitations or disclaimer note. The full output remains visible and saved.
7. Click **New capture** (in the reader or the selection bar). The overlay steps
   aside to a small bar so you can turn the magazine page with its normal controls
   and keys. Click **Capture page** when ready: this hides the bar, takes a fresh
   screenshot, and opens region selection. **Back** returns to the last result.
   Any running request is cancelled. It also works when the previous capture has
   expired, and the saved files remain on disk.

After changing extension code, reload it at `chrome://extensions` and refresh the
Rakuten reader tab so the updated overlay is injected.

The preview thumbnail and capture time identify the snapshot the summary describes.
Turning a reader page does not turn the old summary into a summary of the new page:
use **New capture** or click the extension again. OCR output stays available if DeepSeek
fails. Closing/cancelling disconnects the native host and aborts its pending work.

## Data and permissions

Every OCR / summary request is archived automatically under
`data/YYYY-MM-DD/<time>-<unique-id>/` in this repository (UTC dates):

- `ocr.txt`: recognized Japanese text, or the edited transcript submitted for a retry.
- `summary.md`: English summary, or for **Ask** the question and answer, when the LLM call succeeds.
- `metadata.json`: request ID, capture URL/time/ID, save time, summary style (`ask` for questions), and model/status.

OCR is written **before** calling DeepSeek, so a failed or cancelled summary still
leaves the transcript on disk. Each retry creates a new folder and preserves the
earlier version; matching capture IDs link them. The panel confirms saving and
shows the folder path when you hover over the confirmation. Archive folders/files
are created with owner-only permissions, and this directory is Git-ignored.
Screenshots are not archived. If local saving fails, the panel reports the error.

- `activeTab` and `scripting`: capture and inject the overlay after you click.
  The worker permits only Rakuten's `/read/` pages. There are no persistent host
  permissions or automatically running content scripts.
- `nativeMessaging`: connect to this Mac's OCR / summary host. No localhost web
  service, remote debugging, or browser cookies are needed.
- `storage`: short-lived capture metadata in Chrome's session storage so region
  selection survives service-worker suspension, plus reading settings in local
  storage. Images and text are not stored there.

The host uses a private temporary PNG and deletes it after OCR, including on errors.
The screenshot never goes to DeepSeek. Only the transcript goes to
`https://api.deepseek.com/chat/completions`, using `deepseek-flash` with thinking
disabled. Each style has its own output budget; Detailed and Translation allow
longer answers and wait up to 90 seconds. Normal DeepSeek API billing applies.
There is no automatic provider fallback, automatic retry, or logging of keys / article text. In-memory images and
text are released when the reader tab is unloaded; saved archives remain on disk.
Use within the permissions granted by your content provider.

## Limits

This first version captures **the visible region**, not a whole magazine or a
scrolling page. It reuses the existing VisionKit transcript rather than reconstructing
article reading order. Dense vertical columns, small print, tables, and mixed
sidebars may need separate crops or text corrections. The LLM prompt flags unclear
OCR and incomplete excerpts; it cannot restore missing content reliably.

Summary output is bounded, timeouts are explicit, and the native protocol caps
input/output sizes. Provider errors never relay raw API response bodies. Displayed
OCR and summary text are rendered as text inside a closed shadow root, not HTML.

## Icon

`chrome/icons/icon.svg` is the source for the 32/48/128 px PNGs; `icon-16.svg` is a
simplified toolbar version (magazine and two crop corners). After editing, re-render:

```bash
cd chrome/icons
for n in 32 48 128; do rsvg-convert -w $n -h $n icon.svg -o icon-$n.png; done
rsvg-convert -w 16 -h 16 icon-16.svg -o icon-16.png
```

## Checks

```bash
node --test tests/*.test.mjs
node --check chrome/content.js
node --check chrome/background.js
node host/check-image.mjs /path/to/small-test.png
# Include --summarize to also send the recognized text to DeepSeek.
```

`tests/preview.html` is a standalone UI fixture with synthetic Japanese text and
mocked Chrome / DeepSeek responses. It is not loaded by the extension. Serve this
directory locally and open `/tests/preview.html` to exercise the overlay without
installing or making an API call. Native host tests cover split message frames,
input limits, origin checks, cancellation setup, OCR cleanup, and API errors.

To remove the installation, remove the extension in Chrome and delete just
`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.dot_home.magazine_reader.json`
and `~/Library/Application Support/Magazine Reader/magazine-reader-host`.
