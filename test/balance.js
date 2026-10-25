// Balance report: every legal build fights every other build N times.
// Run: node test/balance.js
const E = require("../public/js/engine.js");
const N = +process.argv[2] || 30;

const builds = [];
for (let body = 0; body < E.PARTS.body.length; body++) for (let sensor = 0; sensor < E.PARTS.sensor.length; sensor++)
  for (let brain = 0; brain < E.PARTS.brain.length; brain++) for (let tool = 0; tool < E.PARTS.tool.length; tool++) {
    const b = { name: "B", body, sensor, brain, tool, color: 0 };
    if (E.statsOf(b).wt <= E.MAXW) builds.push(b);
  }
const wins = builds.map(() => 0), games = builds.map(() => 0);
let seed = +process.argv[3] || 1, rounds = 0;
for (let i = 0; i < builds.length; i++) for (let j = i + 1; j < builds.length; j++) {
  for (let k = 0; k < N; k++) {
    const flip = k % 2 === 1;
    const r = E.simulate(flip ? builds[j] : builds[i], flip ? builds[i] : builds[j], seed++);
    rounds += r.events.filter((e) => e.kind === "act").length;
    const iWon = flip ? r.winner === 1 : r.winner === 0;
    wins[iWon ? i : j]++; games[i]++; games[j]++;
  }
}
const label = (b) => `${E.PARTS.body[b.body].n}/${E.PARTS.sensor[b.sensor].n}/${E.PARTS.brain[b.brain].n}/${E.PARTS.tool[b.tool].n}`;
const rows = builds.map((b, i) => ({ b, wr: wins[i] / games[i] })).sort((a, b) => b.wr - a.wr);
console.log(`${builds.length} legal builds. Avg attacks per fight: ${(rounds / (games.reduce((a, b) => a + b) / 2)).toFixed(1)}`);
console.log("Top 6:"); rows.slice(0, 6).forEach((r) => console.log("  " + (r.wr * 100).toFixed(1) + "%  " + label(r.b)));
console.log("Bottom 6:"); rows.slice(-6).forEach((r) => console.log("  " + (r.wr * 100).toFixed(1) + "%  " + label(r.b)));
for (const slot of E.SLOTS) {
  const parts = E.PARTS[slot].map((p, idx) => {
    const sel = rows.filter((r) => r.b[slot] === idx);
    return `${p.n} ${sel.length ? ((sel.reduce((a, r) => a + r.wr, 0) / sel.length) * 100).toFixed(1) : "--"}% (${sel.length} builds)`;
  });
  console.log(slot.padEnd(7) + parts.join("  |  "));
}
const spread = rows[0].wr - rows[rows.length - 1].wr;
console.log(`Spread best-worst: ${(spread * 100).toFixed(1)} pts. Builds within 40-60%: ${rows.filter((r) => r.wr >= 0.4 && r.wr <= 0.6).length}/${rows.length}`);
