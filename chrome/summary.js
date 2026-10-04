/* Shared by the content script and its UI fixture. No HTML is parsed. */
(() => {
  const noteLabel = /^(limitations(?: note)?|disclaimer|caveats|uncertainties|limits of (?:this|the) excerpt|note)$/i;
  const sectionLabel = /^(overview|key points|main points|summary|vocabulary|key vocabulary|glossary|key terms|stocks|other companies)$/i;
  const plainLine = line => line.trim().replace(/^#{1,6}\s+/, "").replace(/^\*\*(.+?)\*\*/, "$1");
  const noteLine = line => noteLabel.test(plainLine(line).split(":", 1)[0].trim());
  function copyText(text) {
    const lines = String(text || "").trim().split(/\r?\n/);
    // Keep original title, paragraphs and bullets; omit only the final note section.
    for (let index = lines.length - 1; index >= 0; index--) {
      const line = lines[index];
      if (noteLine(line)) return lines.slice(0, index).join("\n").trimEnd();
      if (/^#{1,6}\s+/.test(line.trim()) || sectionLabel.test(plainLine(line).replace(/:$/, ""))) break;
    }
    // Older summaries sometimes ended with an unlabelled, standalone disclaimer.
    const paragraphs = lines.join("\n").split(/\n\s*\n/);
    const last = paragraphs.at(-1)?.trim() || "";
    if (/^(?:(?:this|the) summary (?:is|was) (?:based on|limited to)|(?:this|the|the provided|the supplied) excerpt (?:is (?:incomplete|unclear)|provides no\b|does not (?:provide|include|contain))|due to (?:OCR|an incomplete excerpt|the incomplete excerpt))/i.test(last))
      return paragraphs.slice(0, -1).join("\n\n").trimEnd();
    return lines.join("\n");
  }
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
      const normalized = plainLine(line);
      const colon = normalized.indexOf(":");
      const inlineNote = colon >= 0 && noteLabel.test(normalized.slice(0, colon).trim()) ? normalized.slice(colon + 1).trim() : "";
      if (inlineNote) { flush(); note = true; paragraph.push(inlineNote); continue; }
      const plain = line.replace(/^#{1,6}\s+/, "").replace(/^\*\*(.*?)\*\*:?$/, "$1").replace(/:$/, "");
      const section = sectionLabel.test(plain) || noteLabel.test(plain);
      if (/^#{1,6}\s/.test(line) || section) {
        flush(); note = noteLabel.test(plain);
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
  // Tokyo securities codes: four characters, letters allowed in the 2nd and 4th places (e.g. 7203, 160A).
  const stockCode = /^[1-9][0-9A-Z][0-9][0-9A-Z]$/;
  /** One "CODE | 日本語名 | English name | stated/inferred | note" bullet from the stocks style, or null. */
  function stock(item) {
    const parts = String(item).split("|").map(part => part.trim());
    if (parts.length < 3) return null;
    const [code, ja, en, ...rest] = parts;
    const source = /^(stated|inferred)$/i.test(rest[0] || "") ? rest.shift().toLowerCase() : null;
    const clean = code.replace(/[*`[\]]/g, "").toUpperCase();
    return { code: stockCode.test(clean) ? clean : null, ja, en, source, note: rest.join(" | ") };
  }
  const stockUrl = code => stockCode.test(code)
    ? `https://monex.ifis.co.jp/index.php?sa=find&ta=n&wd=${encodeURIComponent(code)}` : null;
  globalThis.magazineSummary = { parse, inline, copyText, stock, stockUrl };
})();
