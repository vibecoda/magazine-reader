/* Only the Library test page loads this mock: synthetic saved captures, no native host. */
const url = "https://magazine.rakuten.co.jp/read/synthetic";
const text = "ある企業は週四日の勤務制度を三か月間試験的に導入した。参加した社員は二百人。通勤時間が減り、仕事と生活の両立がしやすくなった。";
const edited = text.replace("二百人", "二百五十人");
const entry = (capture, n, style, summary, textIndex = 0, minutes = n) => ({ capture, style, textIndex, summary,
  id: `2026-10-0${capture.day}/0${capture.hour}-${String(minutes).padStart(2, "0")}-00.000-fixt${n}`,
  savedAt: `2026-10-0${capture.day}T0${capture.hour}:${String(minutes).padStart(2, "0")}:00.000Z` });
const one = { key: "capture-one", day: 6, hour: 9, title: "A trial of a four-day working week", texts: [text, edited] };
const two = { key: "capture-two", day: 6, hour: 8, title: "Chip makers in an AI build-out", texts: ["半導体からAI・データセンターへ広がる業界マップ。●安川電機（6506）●ファナック（6954）"] };
const three = { key: "capture-three", day: 5, hour: 7, title: null, texts: ["勤務制度 試験的 導入"] };
const entries = [
  entry(one, 1, "overview", "A trial of a four-day working week\n\nA company tested a four-day week with **200 employees** over three months.\n\nKey points\n• Less commuting.\n• More pressure to finish work.\n\nLimitations\nNo productivity figures."),
  entry(one, 2, "overview", "A trial of a four-day working week\n\nA second take: **250 employees** took part after the text was corrected.\n\nKey points\n• Better work–life balance.", 1),
  entry(one, 3, "ask", "## Question\n\nWhat is this article mainly about?\n\n## Answer\n\nA **three-month** trial of a four-day week.\n"),
  entry(one, 4, "ask", "## Question\n\nWere there downsides?\n\n## Answer\n\nYes:\n- more pressure\n- same workload in fewer hours\n"),
  entry(one, 5, "glossary", "- 勤務制度 | きんむせいど | working-hours system\n- 試験的に | しけんてきに | on a trial basis\n- 両立 | りょうりつ | balancing two things"),
  entry(two, 6, "stocks", "Chip makers in an AI build-out\n\nStocks\n- 6506 | 安川電機 | Yaskawa Electric | stated | Robotics\n- 6954 | ファナック | Fanuc | inferred | Factory automation"),
  entry(three, 7, null, null),
];
const captures = [one, two, three].map(c => ({ key: c.key, url, title: c.title, capturedAt: `2026-10-0${c.day}T0${c.hour}:00:00.000Z`,
  snippet: c.texts.at(-1).slice(0, 120), entries: entries.filter(e => e.capture === c).map(e => ({ id: e.id, style: e.style, savedAt: e.savedAt })) }));
const local = {};
window.chrome = {
  storage: { local: { get: async key => ({ [key]: local[key] }), set: async values => Object.assign(local, values) }, onChanged: { addListener() {} } },
  runtime: { lastError: null, sendNativeMessage(_host, message, reply) {
    setTimeout(() => {
      if (message.action === "list") {
        const q = message.query.toLowerCase();
        const found = captures.filter(c => !q || c.title?.toLowerCase().includes(q) || c.snippet.includes(q)
          || entries.some(e => e.capture.key === c.key && e.summary?.toLowerCase().includes(q)));
        reply({ ok: true, total: found.length, captures: found });
      } else {
        const picked = entries.filter(e => message.ids.includes(e.id));
        reply({ ok: true, texts: picked[0].capture.texts, omitted: 0, entries: picked.map(e => ({ ...e, capture: undefined,
          directory: `/synthetic-preview/data/${e.id}`, model: "deepseek-flash (UI fixture)", truncated: false, source: { url } })) });
      }
    }, 120);
  } },
};
