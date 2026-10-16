# Reader and Ask

The reader shows the result over the dimmed page. It has eight style tabs (results are cached and marked with a dot), reading settings behind **Aa**, keyboard shortcuts, and an **Ask** tab that holds a conversation about the page.

## Sub-features

- `reader-tabs`: clicking a tab, or pressing `1`–`8`, switches style. A tab not generated yet requests that style, and a generated one gets the `.cached` dot.
- `reader-regenerate`: **Regenerate** asks for a fresh version of the current style.
- `reader-settings`: **Aa** (aria-label `Reading settings`) opens typeface, size, spacing, width, theme, position and alignment. Settings persist.
- `reader-keys`: `+` / `-` change text size, and Escape closes settings and then the reader.
- `ask-send`: type a question and press Enter (Shift+Enter adds a line). The answer appears in `.thread`.
- `ask-history`: later questions carry up to 8 earlier turns.

## How to get to it (user POV)

- Any finished capture opens the reader. **Ask** is the last tab.

## Driving it with mr-verify

Preconditions:

- A fixture tab with the reader open. Run [capture-overlay](./capture-overlay.md) through **OCR only** or **Summarize**.

- **Switch tab.** Run `mrv click $F "css:.style-tab:nth-child(5)"` (Translation), then wait for `root.querySelector(".summary h3")?.textContent === "New ways of working at companies"`. The Translation tab has `aria-selected="true"`.
- **Settings.** Run `mrv click $F "Reading settings"`, then `mrv click $F "Night"` (the theme segment). `mrv eval $F 'root.querySelector(".panel").dataset.theme'` prints `"night"`. Run `mrv shot $F reader-night.png`. Then `mrv key $F Escape` closes the settings: `root.querySelector(".settings").hidden` becomes `true`. The element stays in the DOM, so don't test for its presence. The segment labels are `Serif Sans Humanist Mono · Compact Normal Airy · Narrow Medium Wide · Paper Sepia Night · Centered Dock left Dock right · Ragged Justified`.
- **Ask.** Run `mrv click $F "css:.style-tab:last-child"`, `mrv click $F "css:.ask-input"`, `mrv type $F "What is the main finding?"` and then `mrv key $F Enter`. Wait for `root.querySelector(".thread .answer:not(.pending)")`. Its text starts `You asked: "What is the main finding?" (0 earlier turns).` A second question reports `(1 earlier turns)`. Run `mrv shot $F overlay-ask.png`.

## Gotchas

- `Ask` is both a tab label and the send button's label. Use `css:.style-tab:last-child` for the tab and `css:.ask-send` for the button.
- Settings are saved to the fixture's `localStorage` (`fixture-readerSettings`), which outlives the tab. Reset them, or expect them in later tabs of the same run.
- Fixture answers and summaries are canned. They prove rendering and flow, not DeepSeek output. A live DeepSeek check needs the user's consent and `mrv host … --allow-network`.
