# Library

The Library page lists every saved capture newest first, grouped by day. It searches the Japanese text and the English output, and opens a capture to show each saved style as a tab along with its folder path. It reads `data/` through the native host, read-only.

## Sub-features

- `library-list` lists the captures grouped by day, with a title, snippet, time and style pills.
- `library-search` filters the list by text in `ocr.txt` or `summary.md`. The count reads `N saved capture(s) matching “q”`.
- `library-open` shows the capture's style tabs, the rendered summary, the Japanese text (collapsed), Copy, and the folder path.
- `library-keys` uses `/` to focus search and `j` / `k` to move to the next or previous capture.
- `library-theme` switches the page theme with the `Theme` button.

## How to get to it (user POV)

- Click **Library** (aria-label `Browse saved captures in a new tab`) in the reader overlay's header.
- Right-click the toolbar button and choose **Options**. That opens `chrome-extension://bchilcmoklaelegfndjimjmibgkddehd/library.html`.

## Driving it with mr-verify

Preconditions:

- Baseline seed data. `mrv doctor` reports `host: ok (2 captures in sandbox data/)`.

- **Open.** Run `P=$(mrv open library | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')`. Then `mrv wait $P 'doc.querySelector(".count").textContent !== "Loading…" && doc.querySelector(".count").textContent'` prints `"2 saved captures"`.
- **List.** `mrv eval $P '[...doc.querySelectorAll(".item .item-title")].map(e => e.textContent)'` prints `["Seed: a four-day week trial", "半導体からAI・データセンターへ広がる業界マップ。"]`, newest first.
- **Search.** Run `mrv click $P "css:.search"` and then `mrv type $P 二百人`. The `.count` text becomes `1 saved capture matching “二百人”`. Run `mrv shot $P library-search.png`.
- **Open a capture.** Run `mrv click $P "css:.item"`, then `mrv wait $P 'doc.querySelector("main .summary") && doc.querySelector("main").innerText'`. The output shows `Overview`, `Seed: a four-day week trial`, `200 employees` and `KEY POINTS`. Run `mrv shot $P library-open.png`.
- **Side effect check.** `mrv eval $P 'doc.querySelector("main .path").textContent'` must print a path under `.verify/<run>/instance/root/data/2026-01-02/`. That shows the page read the sandbox through the real host, not the user's data.
- **Keyboard.** In a fresh library tab (no query), run `mrv click $P "css:main"` and then `mrv key $P j`. `mrv wait $P 'doc.querySelector(".item[aria-current=true] .item-title")?.textContent'` prints the first capture. A second `j` prints the second capture, and `k` goes back to the first. `j` on the last capture stays there.

## Gotchas

- The real page calls `chrome.runtime.sendNativeMessage` directly, with no background worker in between. A "host not found" error means the per-profile native messaging manifest or the launcher is broken. Run `mrv doctor`.
- The OCR-only seed has no summary, so its title is the snippet, and opening it shows Japanese text only.
- Times show in the browser's local time zone, so seed captures dated 09:00Z show as 06:00 PM in JST.
- `tests/library-preview.html` (`mrv open library-fixture`) is a mocked copy. Use it only for layout work. It doesn't prove host reads.
