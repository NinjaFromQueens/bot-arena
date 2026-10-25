// Hill-climbing balance tuner. Prints a PARTS patch; it does not edit files.
// Run: node test/tune.js [iterations]
const E = require("../public/js/engine.js");
const ITER = +process.argv[2] || 150, N = 10;

// [path, min, max, step]
const KNOBS = [
  ["body.0.def", 0, 6, 1], ["body.0.spd", 4, 10, 1], ["body.0.dodge", 0, 10, 1], ["body.0.burst", 0.05, 0.45, 0.05],
  ["body.1.def", 5, 12, 1], ["body.1.spd", 0, 5, 1],
  ["body.2.def", 2, 8, 1], ["body.2.spd", 2, 8, 1], ["body.2.dodge", 3, 14, 1],
  ["sensor.0.aim", 5, 12, 1], ["sensor.1.aim", 2, 9, 1], ["sensor.1.dodge", 0, 10, 1], ["sensor.2.aim", 0, 5, 1], ["sensor.2.def", 0, 6, 1],
  ["brain.0.atk", 1, 5, 1], ["brain.0.def", -4, 0, 1],
  ["brain.1.def", 0, 5, 1], ["brain.1.shieldAt", 40, 80, 5], ["brain.1.shieldP", 0.4, 1, 0.1], ["brain.1.counter", 0, 12, 1],
  ["brain.2.atk", 0, 3, 1], ["brain.2.aim", 0, 4, 1], ["brain.2.waitP", 0.2, 0.8, 0.1], ["brain.2.waitAim", 8, 30, 2],
  ["tool.0.atk", 3, 9, 1], ["tool.0.acc", 0, 25, 2], ["tool.0.grab", 0.1, 0.5, 0.05],
  ["tool.1.atk", 8, 16, 1], ["tool.1.acc", -30, -5, 2],
  ["tool.2.atk", 4, 10, 1], ["tool.2.mult", 0.45, 0.85, 0.03], ["tool.2.acc", -5, 15, 2],
  ["body.3.def", 1, 8, 1], ["body.3.spd", 0, 4, 1], ["body.3.dodge", 0, 8, 1], ["body.3.glance", 0.3, 0.9, 0.05],
  ["sensor.3.aim", 1, 9, 1], ["sensor.3.track", 0.2, 0.8, 0.05],
  ["tool.3.atk", 3, 10, 1], ["tool.3.acc", -10, 20, 2], ["tool.3.flip", 0.1, 0.55, 0.05],
  ["tool.4.atk", 4, 11, 1], ["tool.4.acc", -15, 10, 2], ["tool.4.pierce", 0.3, 1, 0.05],
];
// keep each part's identity
const ORDER = [
  ["body.1.def", ">", "body.2.def"], ["body.2.def", ">=", "body.0.def"],
  ["body.0.spd", ">", "body.2.spd"], ["body.2.spd", ">", "body.1.spd"],
  ["sensor.0.aim", ">", "sensor.1.aim"], ["sensor.1.aim", ">", "sensor.2.aim"],
  ["tool.1.atk", ">", "tool.2.atk"], ["tool.2.atk", ">=", "tool.0.atk"],
  ["tool.0.acc", ">", "tool.2.acc"], ["tool.2.acc", ">", "tool.1.acc"],
  // new parts keep what their tips promise
  ["sensor.0.aim", ">", "sensor.3.aim"], ["body.1.def", ">", "body.3.def"], ["body.2.spd", ">", "body.3.spd"],
  ["tool.0.acc", ">", "tool.4.acc"], ["tool.1.atk", ">", "tool.4.atk"],
];
const get = (p) => p.split(".").reduce((o, k) => o[k], E.PARTS);
const set = (p, v) => { const ks = p.split("."), last = ks.pop(); ks.reduce((o, k) => o[k], E.PARTS)[last] = v; };
const ok = () => ORDER.every(([a, op, b]) => (op === ">" ? get(a) > get(b) : get(a) >= get(b)));

const builds = [];
for (let body = 0; body < E.PARTS.body.length; body++) for (let sensor = 0; sensor < E.PARTS.sensor.length; sensor++)
  for (let brain = 0; brain < E.PARTS.brain.length; brain++) for (let tool = 0; tool < E.PARTS.tool.length; tool++) {
    const b = { name: "B", body, sensor, brain, tool, color: 0 };
    if (E.statsOf(b).wt <= E.MAXW) builds.push(b);
  }

function evaluate(n = N) {
  const wins = builds.map(() => 0), games = builds.map(() => 0);
  let seed = 7, acts = 0, fights = 0;
  for (let i = 0; i < builds.length; i++) for (let j = i + 1; j < builds.length; j++) for (let k = 0; k < n; k++) {
    const flip = k % 2 === 1, r = E.simulate(flip ? builds[j] : builds[i], flip ? builds[i] : builds[j], seed++);
    acts += r.events.reduce((a, e) => a + (e.kind === "act"), 0); fights++;
    const iWon = flip ? r.winner === 1 : r.winner === 0;
    wins[iWon ? i : j]++; games[i]++; games[j]++;
  }
  const wr = wins.map((w, i) => w / games[i]);
  let partErr = 0;
  for (const slot of E.SLOTS) for (let p = 0; p < E.PARTS[slot].length; p++) {
    const sel = wr.filter((_, i) => builds[i][slot] === p);
    partErr += (sel.reduce((a, b) => a + b, 0) / sel.length - 0.5) ** 2;
  }
  const buildVar = wr.reduce((a, w) => a + (w - 0.5) ** 2, 0) / wr.length;
  const extreme = wr.filter((w) => w > 0.72 || w < 0.28).length / wr.length;
  const len = acts / fights, lenPen = len < 10 ? (10 - len) ** 2 : len > 14 ? (len - 14) ** 2 : 0;
  return { score: partErr * 4 + buildVar + extreme * 0.2 + lenPen * 0.01, partErr, buildVar, len, wr };
}

let best = evaluate(), cur = best.score;
const snap = () => Object.fromEntries(KNOBS.map(([p]) => [p, get(p)]));
let bestParams = snap();
console.log("start", best.score.toFixed(4), "len", best.len.toFixed(1));
let temp = 0.004;
for (let it = 0; it < ITER; it++) {
  const changes = [];
  const nchg = 1 + Math.floor(Math.random() * 3);
  for (let c = 0; c < nchg; c++) {
    const [p, lo, hi, st] = KNOBS[Math.floor(Math.random() * KNOBS.length)];
    const old = get(p), nv = +Math.min(hi, Math.max(lo, old + (Math.random() < 0.5 ? -st : st))).toFixed(3);
    if (nv !== old) { changes.push([p, old]); set(p, nv); }
  }
  if (!changes.length || !ok()) { changes.reverse().forEach(([p, o]) => set(p, o)); continue; }
  const r = evaluate();
  if (r.score < cur || Math.random() < Math.exp((cur - r.score) / temp)) {
    cur = r.score; if (r.score < best.score) { best = r; bestParams = snap(); console.log(it, "best", r.score.toFixed(4), "len", r.len.toFixed(1)); }
  } else changes.reverse().forEach(([p, o]) => set(p, o));
  temp *= 0.985;
}
console.log(JSON.stringify(bestParams));
