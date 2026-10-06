/* Only this test page loads the mock. It is not part of the extension. */
const listeners = [];
let fixtureTimer = null;
const text = "ある企業は週四日の勤務制度を三か月間試験的に導入した。参加した社員は二百人。通勤時間が減り、仕事と生活の両立がしやすくなった一方、短い時間で同じ量の仕事を終える負担も報告された。";
const summaries = {
  overview: "A trial of a four-day working week\n\nA company tested a four-day week with **200 employees** over three months. The excerpt describes benefits alongside pressure to complete the same workload in less time.\n\nKey points\n• Employees reported less commuting and an easier balance between work and home life.\n• Some employees experienced a heavier workload within the shorter schedule.\n• The trial does not establish that the arrangement suits every company.\n\nLimitations\nThe excerpt provides no detailed productivity measurements.",
  bullets: "Four-day week trial\n\n• A company trialled a four-day week with **200 employees** for three months.\n• Staff reported less commuting and better work–life balance.\n• Some felt more pressure to finish the same work in less time.\n• The results do not show it suits every company.",
  prose: "A trial of a four-day working week\n\nA company introduced a four-day working week on a trial basis for three months, involving **200 employees**. According to the survey, commuting time fell and participants found it easier to balance work and private life.\n\nAt the same time, some employees felt a heavier burden because they had to finish the same amount of work in less time. The article cautions that these results alone cannot show that the same system would suit every company.",
  detailed: "A trial of a four-day working week\n\nA three-month company trial of a four-day week produced mixed but mostly positive reports.\n\n## The trial\n• Introduced on a trial basis by one company.\n• **200 employees** took part over **three months**.\n\n## Reported benefits\n• Less time spent commuting.\n• An easier balance between work and private life.\n\n## Reported drawbacks\n• Pressure to finish the same workload in fewer hours.\n\n## Conclusion\n• The article says the results do not prove the system suits all companies.",
  translation: "New ways of working at companies\n\nOne company introduced a four-day working week on a trial basis. Two hundred employees took part, and the trial ran for three months.\n\nIn a survey, participants reported that commuting time decreased and that it became easier to balance work and private life.\n\nOn the other hand, some employees felt their burden had increased, because they needed to finish the same amount of work in a shorter time.\n\nFrom these results alone, it cannot be concluded that the same system is suitable for every company.",
  glossary: "- 勤務制度 | きんむせいど | working-hours system\n- 試験的に | しけんてきに | on a trial basis\n- 導入する | どうにゅうする | to introduce, adopt\n- 通勤時間 | つうきんじかん | commuting time\n- 両立 | りょうりつ | balancing two things at once\n- 負担 | ふたん | burden, load\n- 判断する | はんだんする | to judge, conclude",
};
const continuation = ["調査を実施した研究所は、制度を続けるかどうかを来年判断するとしている。", "別の企業でも同様の試みが始まっている。"];
// Mirrors joinParts in host/deepseek.mjs: one box as is, otherwise numbered parts.
const recognized = ({ images, firstPart = 1 }) => images.length === 1 && firstPart === 1 ? text
  : images.map((_, index) => `――― Part ${firstPart + index} ―――\n${firstPart + index === 1 ? text : continuation[(firstPart + index) % 2]}`).join("\n\n");
const deliver = message => new Promise(resolve => listeners[0]({ channel: "magazine-reader", ...message }, {}, resolve));
summaries.stocks = "Companies in a four-day week debate\n\nThe excerpt names two listed firms trialling shorter weeks and one unlisted consultancy.\n\nStocks\n- 7203 | トヨタ自動車 | Toyota Motor | stated | Cited as considering a four-day pilot\n- 160A | アズーム | Azoom | inferred | Mentioned as an early adopter\n\nOther companies\n- ---- | 働き方研究所 | Work Style Institute | stated | Ran the employee survey";
const storage = { local: {
  get: async key => { try { return { [key]: JSON.parse(localStorage.getItem(`fixture-${key}`)) }; } catch { return {}; } },
  set: async values => { for (const [key, value] of Object.entries(values)) localStorage.setItem(`fixture-${key}`, JSON.stringify(value)); },
} };
window.chrome = { storage, runtime: {
  onMessage: { addListener: fn => listeners.push(fn) },
  sendMessage: async message => {
    if (message.type === "cancel") { clearTimeout(fixtureTimer); return { ok: true }; }
    if (message.type === "reset") { await startCapture(); return { ok: true }; }
    if (message.type === "kotoba") return kotobaFixture(message);
    if (message.type === "capture") {
      let link = document.getElementById("download-crop");
      if (!link) { link = document.createElement("a"); link.id = "download-crop"; link.textContent = "Download synthetic crop"; document.querySelector("header").append(link); }
      link.href = message.images[0]; link.download = "magazine-reader-synthetic.png";
    }
    fixtureTimer = setTimeout(() => {
      void deliver({ type: "progress", token: message.token, id: message.id, done: true, ok: true,
        archive: { directory: "/synthetic-preview/archive", textPath: "/synthetic-preview/archive/ocr.txt",
          summaryPath: message.mode === "ocr" ? null : "/synthetic-preview/archive/summary.md" },
        text: message.type === "capture" ? recognized(message) : message.text,
        ...(message.type === "ask" ? { answer: `You asked: "${message.question}" (${message.history.length} earlier turns).\n\nThe article describes a **three-month** trial with **200 employees**. It reports:\n- less commuting and better work–life balance\n- more pressure to finish the same work in less time\n\nIt does not give productivity figures, so the overall effect on output is not stated in the article.`, model: "deepseek-flash (UI fixture)" }
          : message.mode === "ocr" ? {} : { summary: summaries[message.style || "overview"], style: message.style, model: "deepseek-flash (UI fixture)" }) });
    }, Number(new URLSearchParams(location.search).get("delay")) || 250);
    return { ok: true, id: message.id };
  },
} };
const kotobaWords = {
  負担: { term: "負担", reading: "ふたん", meaning: "burden; charge", match: "term", source: "backup", tags: ["JLPT N1"],
    examples: [{ japanese: "費用（ひよう）は会社（かいしゃ）が負担（ふたん）する。", english: "The company bears the cost." }],
    studyGuide: "**負担（ふたん）** — a load you carry, whether cost, work or worry.\n\n**The kanji story:** 負 is to bear on your back; 担 is to shoulder.\n\n**The phrases that make it stick:**\n- 負担が大きい — a heavy burden\n- 費用を負担する — to bear the cost\n\n**Hook:** what you shoulder, you 負担." },
  両立: { term: "両立", reading: "りょうりつ", meaning: "balancing two things", match: "term", source: "backup", tags: ["JLPT N1"],
    examples: [{ japanese: "仕事（しごと）と育児（いくじ）を両立（りょうりつ）する。", english: "To balance work and childcare." }], studyGuide: null },
  試験: { term: "試験", reading: "しけん", meaning: "exam; test", match: "term", source: "backup", tags: ["JLPT N4"], examples: [], studyGuide: null },
};
async function kotobaFixture(message) {
  await new Promise(resolve => setTimeout(resolve, 400));
  if (message.action === "lookup") return { ok: true, results: message.terms.map(({ term }) => {
    const lemma = term.replace(/に$/, "").replace(/的$/, "");
    const word = kotobaWords[term] || kotobaWords[lemma];
    return { term, lemma: term.replace(/に$/, ""), exact: Boolean(kotobaWords[term]), words: word ? [word] : [] };
  }) };
  if (message.action === "draft") return { ok: true, model: "deepseek-flash (UI fixture)", ms: 4800, card: {
    term: message.lemma || message.term, reading: message.reading, meaning: "drafted meaning (fixture)",
    examples: [{ japanese: "新（あたら）しい制度（せいど）を導入（どうにゅう）する。", english: "To introduce a new system." },
      { japanese: "会社（かいしゃ）は在宅（ざいたく）勤務（きんむ）を導入（どうにゅう）した。", english: "The company introduced remote work." }],
    studyGuide: `**${message.lemma || message.term}（${message.reading}）** — fixture guide.\n\n**Hook:** remember it.` } };
  return { ok: true, remote: { status: "added", guideSaved: true }, localId: 99999, label: "Web reading" };
}
async function startCapture() {
  await deliver({ type: "prepare" });
  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth * 2; canvas.height = window.innerHeight * 2;
  const ctx = canvas.getContext("2d"); ctx.scale(2, 2);
  ctx.fillStyle = "#36464d"; ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  const x = Math.max(24, (window.innerWidth - 850) / 2), w = Math.min(850, window.innerWidth - 48);
  ctx.fillStyle = "#faf8f2"; ctx.fillRect(x, 55, w, window.innerHeight - 100);
  ctx.fillStyle = "#222"; ctx.font = "bold 30px serif"; ctx.fillText("企業の新しい働き方", x + 35, 125);
  ctx.font = "18px sans-serif";
  const lines = ["週四日の勤務制度を試験的に導入した。", "参加した社員は二百人、期間は三か月だった。",
    "通勤時間が減り、仕事と生活の両立がしやすくなった。", "短い時間で同じ量の仕事を終える負担も報告された。",
    "すべての企業に適しているとは判断できない。"];
  lines.forEach((line, i) => ctx.fillText(line, x + 35, 190 + i * 48));
  await deliver({ type: "select", image: canvas.toDataURL("image/png"), token: crypto.randomUUID(), capturedAt: new Date().toISOString() });
}
document.getElementById("activate").addEventListener("click", startCapture);
