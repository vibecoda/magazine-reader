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
    if (message.type === "capture") {
      let link = document.getElementById("download-crop");
      if (!link) { link = document.createElement("a"); link.id = "download-crop"; link.textContent = "Download synthetic crop"; document.querySelector("header").append(link); }
      link.href = message.image; link.download = "magazine-reader-synthetic.png";
    }
    fixtureTimer = setTimeout(() => {
      void deliver({ type: "progress", token: message.token, id: message.id, done: true, ok: true,
        archive: { directory: "/synthetic-preview/archive", textPath: "/synthetic-preview/archive/ocr.txt",
          summaryPath: message.mode === "ocr" ? null : "/synthetic-preview/archive/summary.md" },
        text: message.type === "capture" ? text : message.text,
        ...(message.type === "ask" ? { answer: `You asked: "${message.question}" (${message.history.length} earlier turns).\n\nThe article describes a **three-month** trial with **200 employees**. It reports:\n- less commuting and better work–life balance\n- more pressure to finish the same work in less time\n\nIt does not give productivity figures, so the overall effect on output is not stated in the article.`, model: "deepseek-flash (UI fixture)" }
          : message.mode === "ocr" ? {} : { summary: summaries[message.style || "overview"], style: message.style, model: "deepseek-flash (UI fixture)" }) });
    }, Number(new URLSearchParams(location.search).get("delay")) || 250);
    return { ok: true, id: message.id };
  },
} };
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
