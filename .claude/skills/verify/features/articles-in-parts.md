# Articles in parts

An article that continues in another box or on another page is built up part by part. The user captures the continuation and adds it, and the Japanese text gains `――― Part N ―――` headings. Adding a part only reads text on the Mac. The user summarizes from the reader once the article is complete.

## Sub-features

- `parts-standby` uses **+ Add part** to shrink the overlay to a standby bar with **Capture page**, **Back** and **×**.
- `parts-capture` uses **Capture page** to open a new selection in adding mode, with **Add to article**, **Whole viewport**, **Undo box** and **Back to article**.
- `parts-append` uses **Add to article** to append numbered parts to the text and change the header to `Article in N parts`.
- `parts-back` uses **Back to article** / **Back** to return to the reader without adding anything.

## How to get to it (user POV)

- From the reader after any capture, click **+ Add part**, turn the magazine page, and click **Capture page**.

## Driving it with mr-verify

Preconditions:

- A fixture tab where [capture-overlay](./capture-overlay.md) has completed **OCR only** with two boxes, so the reader shows `Article in 2 parts`.

- **Standby.** Run `mrv click $F "+ Add part"`, then `mrv wait $F 'root.querySelector(".standby") && "standby"'`.
- **Capture the continuation.** Run `mrv click $F "Capture page"`, then `mrv wait $F 'root.querySelector(".selection") && "selection"'`. The toolbar shows `Add to article`.
- **Add it.** Run `mrv click $F "Whole viewport"` and then `mrv click $F "Add to article"`. Wait for `[...root.querySelectorAll("textarea")].some(t => t.value.includes("――― Part 3 ―――"))`. The panel text includes `Article in 3 parts`. Run `mrv shot $F parts-3.png`.
- **Back without adding.** Click `+ Add part`, then `Back`. The reader returns with the text unchanged, still 3 parts.

## Gotchas

- Part numbers continue from the existing text. Undoing boxes in adding mode renumbers only the new ones.
- **New capture** or closing the reader starts over, and the parts are lost by design.
- The fixture's continuation text alternates between two canned sentences. Assert the `Part N` headings, not the wording.
