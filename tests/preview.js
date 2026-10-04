/* Only this test page loads the mock. It is not part of the extension. */
const listeners = [];
let fixtureTimer = null;
const text = "ある企業は週四日の勤務制度を三か月間試験的に導入した。参加した社員は二百人。通勤時間が減り、仕事と生活の両立がしやすくなった一方、短い時間で同じ量の仕事を終える負担も報告された。";
const summary = "A trial of a four-day working week\n\nA company tested a four-day week with **200 employees** over three months. The excerpt describes benefits alongside pressure to complete the same workload in less time.\n\nKey points\n• Employees reported less commuting and an easier balance between work and home life.\n• Some employees experienced a heavier workload within the shorter schedule.\n• The trial does not establish that the arrangement suits every company.\n\nLimitations\nThe excerpt provides no detailed productivity measurements.";
const deliver = message => new Promise(resolve => listeners[0]({ channel: "magazine-reader", ...message }, {}, resolve));
window.chrome = { runtime: {
  onMessage: { addListener: fn => listeners.push(fn) },
  sendMessage: async message => {
    if (message.type === "cancel") { clearTimeout(fixtureTimer); return { ok: true }; }
    if (message.type === "capture") {
      let link = document.getElementById("download-crop");
      if (!link) { link = document.createElement("a"); link.id = "download-crop"; link.textContent = "Download synthetic crop"; document.querySelector("header").append(link); }
      link.href = message.image; link.download = "magazine-reader-synthetic.png";
    }
    fixtureTimer = setTimeout(() => {
      void deliver({ type: "progress", token: message.token, id: message.id, done: true, ok: true,
        text: message.type === "capture" ? text : message.text,
        ...(message.mode === "ocr" ? {} : { summary, model: "deepseek-flash (UI fixture)" }) });
    }, Number(new URLSearchParams(location.search).get("delay")) || 250);
    return { ok: true, id: message.id };
  },
} };
document.getElementById("activate").addEventListener("click", async () => {
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
  await deliver({ type: "select", image: canvas.toDataURL("image/png"), token: "fixture", capturedAt: new Date().toISOString() });
});
