/* Shared by the content script and its UI fixture. No HTML is parsed. */
(() => {
  function inline(text) {
    return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).filter(Boolean).map(part =>
      part.startsWith("**") && part.endsWith("**") ? { type: "strong", text: part.slice(2, -2) }
        : part.startsWith("*") && part.endsWith("*") ? { type: "em", text: part.slice(1, -1) }
          : { type: "text", text: part });
  }
  function parse(text) {
    const blocks = [];
    let paragraph = [], list = null, note = false;
    const flush = () => {
      if (paragraph.length) {
        blocks.push({ type: note ? "note" : "paragraph", text: paragraph.join(" ") }); paragraph = [];
      }
      list = null;
    };
    for (const raw of String(text || "").replace(/\r/g, "").trim().split("\n")) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      const inlineNote = line.match(/^(?:limitations(?: note)?|caveats|uncertainties):\s+(.+)$/i);
      if (inlineNote) { flush(); note = true; paragraph.push(inlineNote[1]); continue; }
      const plain = line.replace(/^#{1,6}\s+/, "").replace(/^\*\*(.*?)\*\*:?$/, "$1").replace(/:$/, "");
      const section = /^(overview|key points|main points|limitations(?: note)?|caveats|uncertainties)$/i.test(plain);
      if (/^#{1,6}\s/.test(line) || section) {
        flush(); note = /^(limitations(?: note)?|caveats|uncertainties)$/i.test(plain);
        if (!note) blocks.push({ type: blocks.length ? "heading" : "title", text: plain });
        continue;
      }
      const bullet = line.match(/^(?:([-*•])\s+|(\d+)[.)]\s+)(.+)$/);
      if (bullet) {
        if (paragraph.length) flush();
        const ordered = Boolean(bullet[2]);
        if (!list || list.ordered !== ordered) { list = { type: "list", ordered, items: [] }; blocks.push(list); }
        list.items.push(bullet[3]); continue;
      }
      if (!blocks.length && !paragraph.length && line.length <= 120 && (/^Title:\s*/i.test(line) || !/[.!?。]$/.test(line))) {
        blocks.push({ type: "title", text: line.replace(/^Title:\s*/i, "").replace(/^\*\*(.*?)\*\*$/, "$1") });
        continue;
      }
      // A wrapped bullet belongs to its preceding item until a blank line.
      if (list) { list.items[list.items.length - 1] += ` ${line}`; continue; }
      paragraph.push(line);
    }
    flush();
    return blocks;
  }
  globalThis.magazineSummary = { parse, inline };
})();
