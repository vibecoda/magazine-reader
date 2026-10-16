# Custom commands

A reader registers a named command (a prompt plus an output length) in the overlay; it is stored in `chrome.storage.local` under `readerCommands`. Commands join the capture bar's **Summary style** menu and a **Custom command…** menu beside **Summarize**, run against the captured text through the same host path as a built-in style, and render under the command's name. The Library lists a tab per command from the archived `command:{id,name}`.

## Sub-features

- `command-register` opens **Commands…**, adds a command (name, prompt, output length), and persists it.
- `command-edit` renames a command; the reader's reading label follows the new name without re-running.
- `command-delete` removes a command behind a two-step confirm; the reader picker drops it.
- `command-capture-dropdown` selects a command in the capture bar's **Summary style** menu and runs it.
- `command-run` runs a command from the reader's **Custom command…** menu while the Ask tab is showing, and shows the loading skeleton rather than the Ask composer.
- `command-library` shows an archived command output as a tab named after the command.

## How to get to it (user POV)

- Toolbar click on a `magazine.rakuten.co.jp/read/…` page. Not drivable here.
- Fixture: **Preview capture overlay** on `tests/preview.html`, then **Commands…** on the capture bar.
- Library fixture: the real extension plus sandboxed host, with a seeded command archive folder.

## Driving it with mr-verify

Preconditions: `mrv launch`, `mrv doctor` exits 0, and a fresh fixture tab `F=$(mrv open fixture | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')`.

- **Register.** `mrv click $F "Preview capture overlay"`, wait for `.selection`, `mrv click $F "Commands…"`, wait for `.commands`, `mrv click $F "Add command"`, wait for `.command-form`, click `css:.command-name`, `mrv type $F "Timeline"`, click `css:.command-prompt`, `mrv type $F "List the events in order."`, `mrv click $F "Add command"`, wait for `.command-row`. `mrv eval $F '[...root.querySelectorAll(".command-row .name")].map(e=>e.textContent)'` prints `["Timeline"]`.
- **Capture dropdown.** `mrv click $F "Done"`, `mrv eval $F '[...root.querySelector(".toolbar select").options].map(o=>o.textContent)'` includes `Timeline` and `Manage commands…`. Select it with a dispatched `change` on the option whose text is `Timeline`, then **Whole viewport** and **Summarize selection**. Wait for `.summary h3` containing `Command:`.
- **Reader run while Ask shows.** In the reader, `mrv click $F "Ask"`, then dispatch `change` on `.command-picker` for the command option. Immediately `mrv eval $F 'JSON.stringify({ask:root.querySelector(".ask").hidden,skeleton:root.querySelector(".skeleton").hidden,btn:root.querySelector(".panel-bottom .primary").textContent})'` prints `{"ask":true,"skeleton":false,"btn":"Run"}`.
- **Rename.** Open **Reading settings**, **Commands…**, **Edit**, append to `css:.command-name`, **Save command**, **Done**. The `.reading-label` shows the new name.
- **Library.** Seed `.verify/<run>/instance/root/data/2026-10-16/<folder>/` with `ocr.txt`, `summary.md`, and a `metadata.json` carrying `"style":null` and `"command":{"id":"cmd-investor","name":"Investor view"}`. `mrv host '{"type":"library","action":"list"}'` shows the command. Open `library`, `mrv click $P "css:.item"`, wait for `.tabs`; the tab and reading label read `Investor view`.

## Gotchas

- Native `<select>` elements are not driven by `mrv click`; set `select.value` and dispatch `new Event("change",{bubbles:true})` in `mrv eval`, and say so in the report.
- The Library auto-opens a capture only from `location.hash`; with no hash, click `css:.item` first.
- `.item` matches by class because the item button's text includes the title, snippet and time, so an exact-text click finds nothing.
