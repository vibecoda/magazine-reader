# Native host OCR and archive

The native host recognizes Japanese in each selected box with macOS Live Text (`bin/ocr`) and joins multiple boxes into numbered parts. It saves `ocr.txt` and `metadata.json` before any DeepSeek call. This is what the extension calls for **OCR only**, **Add to article** and **Summarize selection**.

## Sub-features

- `host-ocr` turns one PNG into recognized Japanese, through the stages `recognizing` → `recognized` → `archived` → `done`.
- `host-parts` turns several PNGs into `――― Part 1 ―――` … headings. `firstPart` continues the numbering.
- `host-archive` writes `data/YYYY-MM-DD/<time>-<id>/` with `ocr.txt` and `metadata.json` (source URL, captureId, mode `ocr`).
- `host-errors` rejects an empty box with `No readable text…` (or `Box N has no readable text…` for multi-box), and rejects more than 12 boxes.
- `host-library` handles `library/list` and `library/read` for the Library page.

## How to get to it (user POV)

- Indirectly, through every capture in the overlay. Directly, through `node host/check-image.mjs page.png`. That command writes to the **repo's** `data/`, so prefer `mrv host`.

## Driving it with mr-verify

Preconditions:

- A launched run. A PNG with Japanese text, such as a fixture screenshot: `mrv shot $F page.png` after starting the fixture overlay, or any page image the user supplies.

- **OCR one box.** Run `mrv host '{"type":"capture","mode":"ocr","source":{"url":"https://magazine.rakuten.co.jp/read/verify","captureId":"v1"}}' --image .verify/<run>/evidence/page.png`. The `recognized` event text contains `週四日の勤務制度を試験的に導入した` for the fixture image, and the final event has `"ok": true`.
- **Archive side effect.** In the `archived` event, `archive.directory` is under `.verify/<run>/instance/root/data/`. Read it with `cat <dir>/metadata.json`: `mode` is `"ocr"`, `source.url` is the URL sent, and `summaryFile` is `null`.
- **Library sees it.** Run `mrv host '{"type":"library","action":"list","query":"週四日"}'`. The new capture is listed, and the seed is too.
- **Parts.** Pass two `--image` flags. The text has `――― Part 1 ―――` and `――― Part 2 ―――`.

## Gotchas

- `mrv host` refuses `summarize`, `ask`, `capture` with `mode:"summary"`, and Kotoba `draft`/`register` unless you pass `--allow-network`. Those calls cost DeepSeek credit or write to the Kotoba site. Use the flag only when the user asked.
- Live Text reads everything in the image, control-bar text included. Crop to the article for clean assertions.
- `source.url` that is not a `magazine.rakuten.co.jp/read/` URL is stored as `source: null`. That is by design, not a bug.
- The host takes a single request per process. `mrv host` spawns a fresh one each time.
