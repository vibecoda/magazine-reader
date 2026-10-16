# Magazine Reader verification map

This directory is the maintained source for verifying Magazine Reader's user-facing behavior. Read this index before driving anything, then use the matching feature file as the recipe. `mrv` means `node .claude/skills/verify/scripts/mr-verify.mjs`.

## Baseline preconditions

- Run `mrv launch` to start a fresh instance, then require `mrv doctor` to exit 0.
- The sandbox `data/` holds exactly the two seed captures: `Seed: a four-day week trial` (Overview; its text contains `二百人`) and `半導体からAI・データセンターへ広がる業界マップ。` (OCR only).
- Kotoba is off unless the run was launched with `--kotoba`.
- Never drive the user's own Chrome, their installed native host, or the repo's `data/`.

## Driving conventions

- Click, drag and type with `mrv click|drag|type|key`, never with `eval` setters.
- Query overlay state through `root` (the closed shadow root) and page state through `doc`.
- Wait for a state with `mrv wait`, not a fixed sleep. The fixture replies after about 250 ms, and Kotoba mocks after 400 ms.
- One fixture tab is one overlay session. Open a fresh `mrv open fixture` to start a recipe from scratch.

## Proof and skip reporting

- Proof includes a screenshot of the state before and after the action, plus an `eval` that prints the text which proves it.
- For host or archive features, proof also includes `evidence/host-*.json` and a listing of the sandbox data folder.
- Record which surface carried each proof: the real extension, the fixture (mocked `chrome.runtime`), or the host. A fixture run is not proof of `background.js` or of the Rakuten site.
- Report every entry point you did not drive, with its reason. The toolbar button on a real Rakuten `/read/` page is never drivable here.

## Feature entry contract

Each feature file starts with an H1 and one paragraph, then four H2s in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with mr-verify`, `Gotchas`.

## Features

- [Library](./library.md) covers browsing, searching, opening and keyboard navigation of saved captures. This is the real extension with the sandboxed host.
- [Capture overlay](./capture-overlay.md) covers drawing boxes, Whole viewport, Undo, and OCR only / Summarize selection, in the fixture.
- [Articles in parts](./articles-in-parts.md) covers + Add part, Capture page and Add to article, in the fixture.
- [Reader and Ask](./reader-and-ask.md) covers style tabs, reading settings, keyboard shortcuts and the Ask conversation, in the fixture.
- [Native host OCR and archive](./native-host-ocr.md) covers real Live Text OCR, multi-box parts and archive files, through the host.

Not yet mapped: the Vocabulary tab with Kotoba badges and cards (the fixture mocks Kotoba as 負担/両立/試験), the Stocks tab and its Monex links, and Copy. The real toolbar capture on Rakuten can't be driven at all.
