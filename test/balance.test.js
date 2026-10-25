// Balance test: every legal build fights every other build (fixed seeds, so it's repeatable).
// Fails if any part's average win rate leaves 45–55%, fights get too short or long, or too many builds are lopsided.
// For the full report while tuning, run: npm run balance
const assert = require("assert");
const E = require("../public/js/engine.js");
const N = 8; // fights per pair, alternating sides

const builds = [];
for (let body = 0; body < E.PARTS.body.length; body++) for (let sensor = 0; sensor < E.PARTS.sensor.length; sensor++)
  for (let brain = 0; brain < E.PARTS.brain.length; brain++) for (let tool = 0; tool < E.PARTS.tool.length; tool++) {
    const b = { name: "B", body, sensor, brain, tool, color: 0 };
    if (E.statsOf(b).wt <= E.MAXW) builds.push(b);
  }
const wins = builds.map(() => 0), games = builds.map(() => 0);
let seed = 1, acts = 0, fights = 0;
for (let i = 0; i < builds.length; i++) for (let j = i + 1; j < builds.length; j++) for (let k = 0; k < N; k++) {
  const flip = k % 2 === 1, r = E.simulate(flip ? builds[j] : builds[i], flip ? builds[i] : builds[j], seed++);
  acts += r.events.reduce((a, e) => a + (e.kind === "act"), 0); fights++;
  const iWon = flip ? r.winner === 1 : r.winner === 0;
  wins[iWon ? i : j]++; games[i]++; games[j]++;
}
const wr = wins.map((w, i) => w / games[i]);
for (const slot of E.SLOTS) E.PARTS[slot].forEach((p, idx) => {
  const sel = wr.filter((_, i) => builds[i][slot] === idx);
  const avg = sel.reduce((a, b) => a + b, 0) / sel.length;
  assert(avg >= 0.45 && avg <= 0.55, `${p.n} wins ${(avg * 100).toFixed(1)}% of its fights; every part should stay between 45% and 55% (run npm run balance)`);
});
const len = acts / fights;
assert(len >= 10 && len <= 15, `fights average ${len.toFixed(1)} attacks; keep it around 11–14`);
const fair = wr.filter((w) => w >= 0.4 && w <= 0.6).length / wr.length;
assert(fair >= 0.7, `only ${(fair * 100).toFixed(0)}% of builds win 40–60% of the time; most should`);
// Counter claims that students read in part tips and "Why ___ won" tips (engine.js). Keep them true.
const idx = (slot, name) => E.PARTS[slot].findIndex((p) => p.n === name);
const has = (slot, name) => (b) => b[slot] === idx(slot, name);
function rate(fa, fb) { // win rate of builds matching fa against builds matching fb
  let w = 0, g = 0, s = 99;
  for (const a of builds.filter(fa)) for (const b of builds.filter(fb)) for (let k = 0; k < 4; k++) {
    const flip = k % 2 === 1, r = E.simulate(flip ? b : a, flip ? a : b, s++);
    w += (flip ? r.winner === 1 : r.winner === 0) ? 1 : 0; g++;
  }
  return w / g;
}
const claims = [
  ["Hammers beat Treads", has("tool", "Hammer"), has("body", "Treads"), true],
  ["Drills beat Treads", has("tool", "Drill"), has("body", "Treads"), true],
  ["Treads counter Grippers", has("body", "Treads"), has("tool", "Gripper"), true],
  ["Spinners shred Wheels", has("tool", "Spinner"), has("body", "Wheels"), true],
  ["Treads can take Wheels' hits", has("body", "Treads"), has("body", "Wheels"), true],
  ["Hammers struggle to hit Wheels", has("tool", "Hammer"), has("body", "Wheels"), false],
  ["Drills and Hammers beat Wedges (Drill)", has("tool", "Drill"), has("body", "Wedge"), true],
  ["Drills and Hammers beat Wedges (Hammer)", has("tool", "Hammer"), has("body", "Wedge"), true],
  ["Spinner hits glance off a Wedge", has("tool", "Spinner"), has("body", "Wedge"), false],
  ["Flippers can't get under a Wedge", has("tool", "Flipper"), has("body", "Wedge"), false],
  ["Dodging beats a Drill (Legs)", has("body", "Legs"), has("tool", "Drill"), true],
  ["Armor beats Lidar (Treads)", has("body", "Treads"), has("sensor", "Lidar"), true],
];
for (const [name, a, b, wins] of claims) {
  const r = rate(a, b);
  assert(wins ? r > 0.5 : r < 0.5, `tip claim "${name}" isn't true anymore: ${(r * 100).toFixed(1)}% (fix the numbers or the tip text in engine.js)`);
}
// Custom brain: "Good rules make it strong" (its tip) and the rule tips in explainBattle. Custom builds use RULES.defaults above.
const CUSTOM = E.PARTS.brain.findIndex((b) => b.custom);
const P = (str) => str.split(",").filter(Boolean).map((t) => ({ c: +t[0], v: +t[1], a: +t[2] }));
const pct = (r) => (r * 100).toFixed(1) + "%";
const customs = builds.filter((b) => b.brain === CUSTOM), others = builds.filter((b) => b.brain !== CUSTOM);
function rulesRate(rules, vs = others, vsRules) { // Custom builds with these rules against vs (given vsRules if they're Custom too)
  let w = 0, g = 0, s = 7;
  for (const m of customs) for (const o of vs) for (let k = 0; k < 2; k++) {
    const a = { ...m, rules }, b = vsRules ? { ...o, rules: vsRules } : o, flip = k === 1, r = E.simulate(flip ? b : a, flip ? a : b, s++);
    w += (flip ? r.winner === 1 : r.winner === 0) ? 1 : 0; g++;
  }
  return w / g;
}
const good = rulesRate(P("322,001")), dflt = rulesRate(E.RULES.defaults), none = rulesRate([]);
assert(good > dflt + 0.02 && dflt > none + 0.02, `rules should matter: good rules ${pct(good)}, default rules ${pct(dflt)}, no rules ${pct(none)}`);
assert(good < 0.6, `good rules win ${pct(good)}; keep them under 60% so the other brains stay worth picking`);
assert(rulesRate(P("322")) > rulesRate(P("302")), "aiming only when the hit chance is below 40% should beat aiming below 80%");
assert(rulesRate(P("001"), customs, P("003")) > 0.5, "power attacks should beat shields (they smash through)");
assert(rulesRate([], customs, P("001")) > rulesRate(P("003"), customs, P("001")), "against a power attacker, attacking should beat shielding");
console.log(`Balance tests passed (${builds.length} builds, ${len.toFixed(1)} attacks per fight, ${(fair * 100).toFixed(0)}% of builds within 40–60%)`);
