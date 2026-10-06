import os
M = '/Users/ss/dev/gitlab/magazine-reader/'

def sub(p, a, b):
    s = open(M + p).read(); assert s.count(a) == 1, (p, a); open(M + p, 'w').write(s.replace(a, b, 1))

sub('host/host.mjs', 'import { library } from "./library.mjs";\n', '')
sub('host/host.mjs', 'vocab = kotoba, books = library, signal }', 'vocab = kotoba, signal }')
sub('host/host.mjs', '  // The Library page: read-only, and nothing leaves the Mac.\n  if (message.type === "library") return books(message);\n', '')
sub('chrome/manifest.json', '"version": "0.9.0"', '"version": "0.8.0"')
sub('chrome/manifest.json', '  "options_page": "library.html",\n', '')
sub('chrome/background.js', '''  if (message.type === "library") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("library.html"), index: sender.tab.index + 1, openerTabId: tabId });
    return { ok: true };
  }
''', '')
sub('chrome/content.js', '''    const libraryButton = button("Library", () => void ask({ type: "library" }).catch(() => {}), "icon-button");
    libraryButton.title = "Browse saved captures in a new tab";
    tools.append(libraryButton, settingsButton, closeButton);''', '    tools.append(settingsButton, closeButton);')
sub('tests/preview.js', '    if (message.type === "library") { window.open("library-preview.html"); return { ok: true }; }\n', '')
sub('README.md', '''**Library** — browse everything saved here without opening the files: click **Library** in the
reader's header, or right-click the toolbar button and choose **Options**. Captures are listed
newest first, grouped by day, and the search box looks through both the Japanese text and the
English output. Opening one shows each style it was summarized in as a tab (with older versions of
a regenerated style one click away), Ask questions as a conversation, and the Japanese text that
was used. It reads `data/` through the native host, read-only, and sends nothing anywhere. Keys:
`/` search, `j` / `k` next and previous capture.

''', '')
sub('README.md', '''chrome/   the extension: background worker, overlay (content.js), Library page, summary parser, icons
host/     native messaging host (Node.js): OCR, DeepSeek, archive and Library, Kotoba bridge, installer''', '''chrome/   the extension: background worker, overlay (content.js), summary parser, icons
host/     native messaging host (Node.js): OCR, DeepSeek, archive, Kotoba bridge, installer''')
sub('README.md', '''`http://localhost:8765/tests/preview.html`. `tests/library-preview.html` does the same for the
Library page with synthetic saved captures.''', '`http://localhost:8765/tests/preview.html`.')
for f in ['chrome/library.css', 'chrome/library.html', 'chrome/library.js', 'host/library.mjs',
          'tests/library-preview.html', 'tests/library-preview.js', 'tests/library.test.mjs']:
    os.remove(M + f)
with open(M + '.git/info/exclude', 'a') as f:
    f.write('.claude/worktrees/\n')
print('reverted')
