# Capture overlay

After the toolbar click, the page freezes into a screenshot with a control bar. The user draws up to 12 numbered boxes (or picks Whole viewport), then either runs OCR only, which stays on the Mac, or Summarize selection, which sends the recognized text to DeepSeek.

## Sub-features

- `capture-boxes` draws boxes by dragging; boxes are numbered once there are two, and boxes under 12 px are ignored.
- `capture-whole` uses the **Whole viewport** button to select the entire screenshot.
- `capture-undo` uses **Undo box** to remove the last box. The action buttons are disabled when no box remains.
- `capture-ocr` uses **OCR only** to open the reader with the recognized text and `OCR saved locally`.
- `capture-summarize` uses **Summarize selection** to open the reader on the chosen style's summary.
- `capture-side` uses **Move to left** / **Move to right** to move the control bar.

## How to get to it (user POV)

- Click the Magazine Reader toolbar button on a `magazine.rakuten.co.jp/read/…` page. This is **not drivable** here.
- Fixture: click **Preview capture overlay** on `tests/preview.html`. This runs the real `content.js` against a mocked `chrome.runtime`.

## Driving it with mr-verify

Preconditions:

- A fresh fixture tab: `F=$(mrv open fixture | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')`.

- **Start.** Run `mrv click $F "Preview capture overlay"`, then `mrv wait $F 'root.querySelector(".selection") && "up"'`.
- **Draw two boxes.** Run `mrv drag $F 300 200 900 500` and then `mrv drag $F 300 550 900 750`. `mrv eval $F 'root.querySelectorAll(".rect").length'` prints `2`, and the `.toolbar` text includes `2 boxes, read in the numbered order.` Run `mrv shot $F overlay-boxes.png`.
- **Undo.** Run `mrv click $F "Undo box"`. One `.rect` remains.
- **OCR only.** Run `mrv click $F "OCR only"`, then `mrv wait $F 'root.querySelector(".panel") && root.querySelector(".panel").innerText.includes("OCR saved locally")'`. Read the text with `mrv eval $F '[...root.querySelectorAll("textarea")].map(t => t.value).join("\n")'`. It holds the fixture's Japanese, starting `ある企業は週四日`, and with two boxes it holds `――― Part 1 ―――` / `――― Part 2 ―――` too.
- **Summarize.** In a fresh tab, click `Whole viewport` and then `Summarize selection`. Wait for `root.querySelector(".summary h3")`. The Overview heading is `A trial of a four-day working week`, and the `Overview` tab has `aria-selected="true"`. Run `mrv shot $F overlay-summary.png`.

## Gotchas

- The Japanese text sits in a collapsed `<details>` textarea, so `innerText` of the panel doesn't include it. Read `textarea.value`.
- Drag coordinates are viewport pixels in a 1400×1000 window, and the control bar covers the right edge (x > 1150). Start drags left of it.
- The fixture's "OCR" is canned text, not a reading of the boxes. To prove real OCR, use [native-host-ocr](./native-host-ocr.md).
- The fixture does not run `background.js`'s validation (expiry, document checks, size limits). That is covered by `tests/background.test.mjs` only.
