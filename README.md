# Magazine Reader

A small Chrome extension for the Rakuten Magazine web reader. Click the extension,
select a region of the visible spread, and read an English summary in an overlay.
It follows the native messaging / direct DeepSeek design in
`anki/extension/`, with **no npm dependencies, aichat, or LLM SDK**.

```
extension button → visible-tab PNG → region selection → native host
                                                      ├─ local VisionKit ocr
                                                      └─ DeepSeek text summary → overlay
```

## Setup on this Mac

Requires Node 22+ and the existing `ocr` binary from `utils/japanese_ocr/ocr.swift`.
The key lookup matches Kotoba Reader: `DEEPSEEK_API_KEY` from the host's environment,
then `~/.env2`. The native host reads that file without executing it. No key is
copied into the extension or repository. The current shell's exported variables
are not automatically inherited by Chrome: use `~/.env2` for that setup.

From `dot_home`:

```bash
node utils/magazine-reader/host/install.mjs --check
node utils/magazine-reader/host/install.mjs
# If ocr is not on PATH:
# node utils/magazine-reader/host/install.mjs --ocr "$HOME/.local/bin/ocr"
```

In Chrome, open `chrome://extensions`, enable Developer mode, and **Load unpacked**
from `utils/magazine-reader/chrome`. The public manifest key pins the extension ID
to `bchilcmoklaelegfndjimjmibgkddehd`. Pin its toolbar button if desired.
The installer registers `com.dot_home.magazine_reader` for only that extension;
it does not change Kotoba Reader. Re-run it after moving the repository or
upgrading Node / relocating the OCR executable, and reload the extension after
editing its JavaScript.

## Reading

1. Open a magazine at `https://magazine.rakuten.co.jp/read/…` and zoom until the
   text is readable. Exit the reader's fullscreen mode before capturing.
2. Click **Magazine Reader**. The overlay shows a frozen screenshot of the spread.
   Controls sit in a narrow bar at the right edge, leaving the center clear.
   **Move to left/right** switches sides; the summary uses the same side.
3. Drag around a page, article, or text column. **Whole viewport** selects everything
   visible; this also includes reader controls and margins.
4. **Summarize selection** performs OCR locally, then sends the transcript to DeepSeek.
   **OCR only** stops after recognition and sends nothing to DeepSeek.
5. The results open in a wider reading panel after OCR or summarization completes.
   **Expand / Collapse** changes the width at any time, and a manual choice is
   respected when processing finishes. New captures start with the compact strip.
   English summaries have a clear title, spacious paragraphs and bullets, and
   highlighted limitations; Japanese text and the captured image sit in drawers.
6. Review or edit **Japanese text**, then **Summarize text** to retry with corrections.
  **Copy summary**, **Cancel**, close, and Escape are available in the overlay.

After changing extension code, reload it at `chrome://extensions` and refresh the
Rakuten reader tab so the updated overlay is injected.

The preview thumbnail and capture time identify the snapshot the summary describes.
Turning a reader page does not turn the old summary into a summary of the new page:
click the extension again for a new capture. OCR output stays available if DeepSeek
fails. Closing/cancelling disconnects the native host and aborts its pending work.

## Data and permissions

- `activeTab` and `scripting`: capture and inject the overlay after you click.
  The worker permits only Rakuten's `/read/` pages. There are no persistent host
  permissions or automatically running content scripts.
- `nativeMessaging`: connect to this Mac's OCR / summary host. No localhost web
  service, remote debugging, or browser cookies are needed.
- `storage`: short-lived capture metadata in Chrome's session storage so region
  selection survives service-worker suspension. Images and text are not stored there.

The host uses a private temporary PNG and deletes it after OCR, including on errors.
The screenshot never goes to DeepSeek. Only the transcript goes to
`https://api.deepseek.com/chat/completions`, using `deepseek-flash` with thinking
disabled. Normal DeepSeek API billing applies. There is no automatic provider
fallback, retry, permanent archive, or logging of keys / article text. Local
in-memory images and text are released when the reader tab is unloaded.
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

## Checks

```bash
node --test utils/magazine-reader/tests/*.test.mjs
node --check utils/magazine-reader/chrome/content.js
node --check utils/magazine-reader/chrome/background.js
node utils/magazine-reader/host/check-image.mjs /path/to/small-test.png
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
