// Hill-climbs the Custom brain's numbers so rule quality matters: good rules > default rules > no rules > bad rules.
// Prints the result; it does not edit files. Usage: node test/tune-brain.js [iterations]
// test/tune.js balances the parts with Custom on its default rules; this one sets how much each move is worth.
const E = require("../public/js/engine.js");
const BR = E.PARTS.brain.find((b) => b.custom), CUSTOM = E.PARTS.brain.indexOf(BR);
const all = [];
for (let body = 0; body < E.PARTS.body.length; body++) for (let sensor = 0; sensor < E.PARTS.sensor.length; sensor++)
  for (let brain = 0; brain < E.PARTS.brain.length; brain++) for (let tool = 0; tool < E.PARTS.tool.length; tool++) {
    const b = { name: "B", body, sensor, brain, tool, color: 0 }; if (E.statsOf(b).wt <= E.MAXW) all.push(b);
  }
const field = all.filter((b) => b.brain !== CUSTOM), mine = all.filter((b) => b.brain === CUSTOM);
const P = (s) => s.split(",").filter(Boolean).map((t) => ({ c: +t[0], v: +t[1], a: +t[2] }));
// rule sets (codes as in parseCode: condition, number, move) and the win rate each should land in against the other brains
const STRATS = [
  ["no rules", P(""), 0.42, 0.46],
  ["defaults", E.RULES.defaults, 0.48, 0.51],
  ["always power", P("001"), 0.48, 0.54],
  ["aim<40, else power", P("322,001"), 0.50, 0.55],
  ["hp<50 shield, else power", P("113,001"), 0.51, 0.56],
  ["enemy shield: power, aim<40, hp<50 shield", P("401,322,113"), 0.50, 0.58],
  ["aim<40, hp<50 shield, else power", P("322,113,001"), 0.52, 0.58],
  ["always aim", P("002"), 0, 0.30],
  ["aim<80", P("302"), 0, 0.40],
];
function rate(rules) {
  let w = 0, g = 0, seed = 7;
  for (const m of mine) { const a = { ...m, rules }; for (const o of field) for (let k = 0; k < 2; k++) {
    const flip = k === 1, r = E.simulate(flip ? o : a, flip ? a : o, seed++);
    w += (flip ? r.winner === 1 : r.winner === 0) ? 1 : 0; g++;
  } }
  return w / g;
}
const KNOBS = [["atk", 0, 3, 1], ["def", 0, 4, 1], ["aim", 0, 2, 1], ["powerDmg", 2, 12, 1], ["powerAcc", 5, 25, 1], ["aimAcc", 20, 70, 2], ["aimDmg", 0, 8, 1], ["counter", 0, 16, 1]];
function score() {
  const rs = STRATS.map(([, rules, lo, hi]) => { const r = rate(rules); return [r, r < lo ? lo - r : r > hi ? r - hi : 0]; });
  return { err: rs.reduce((a, [, d]) => a + d * d, 0), rs };
}
const iters = process.argv[2] ? +process.argv[2] : 60; // 0 just reports the current numbers
const snap = () => JSON.stringify(Object.fromEntries(KNOBS.map(([k]) => [k, BR[k] || 0])));
const show = (s) => STRATS.map(([n], i) => `  ${(s.rs[i][0] * 100).toFixed(1)}% ${s.rs[i][1] ? "x" : " "} ${n}`).join("\n");
let best = score();
console.log("start", best.err.toFixed(5), snap()); console.log(show(best));
for (let it = 0; it < iters && best.err > 0; it++) {
  const [k, lo, hi, st] = KNOBS[Math.floor(Math.random() * KNOBS.length)];
  const old = BR[k] || 0, nv = Math.min(hi, Math.max(lo, old + (Math.random() < 0.5 ? -st : st) * (1 + Math.floor(Math.random() * 2))));
  if (nv === old) continue;
  BR[k] = nv;
  const s = score();
  if (s.err < best.err) { best = s; console.log(it, "best", s.err.toFixed(5), k, nv); } else BR[k] = old;
}
console.log("Suggested Custom brain numbers (x = outside its target):", snap());
console.log(show(best));
