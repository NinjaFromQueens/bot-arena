// Robot Racer: laps are deterministic and checkable, the gear and tire trade-offs are real, each track rewards a
// different setup, and the report tells the truth.
const assert = require("assert");
const R = require("../public/js/race.js");

// inputs round-trip through the lap letters
for (const steer of [-1, 0, 1]) for (const gas of [0, 1]) for (const brake of [0, 1]) assert.deepStrictEqual(R.decode(R.encode({ steer, gas, brake })), { steer, gas, brake });
assert.deepStrictEqual(R.clampSetup({ gear: 9, tire: -1 }), { gear: 1, tire: 1 }, "bad setups fall back to the middle");
assert.strictEqual(R.trackOf(1), R.TRACKS[1]); assert.strictEqual(R.trackOf(99), R.TRACK, "unknown tracks fall back to the first");

for (const tr of R.TRACKS) {
  const last = tr.segs[tr.segs.length - 1];
  assert(Math.abs(last.y + last.slope * R.SEG) < 0.01, `${tr.n}: the lap must end at the height it starts`);
  for (const k of Object.values(tr.keys)) assert(tr.SECTIONS.some((s) => s.n === k), `${tr.n}: the report talks about "${k}", which isn't a section`);
  // the same inputs always give the same lap (the server re-drives submitted laps)
  const su = { gear: 1, tire: 1 }, inputs = R.autoLap(su, undefined, tr);
  const a = R.lap(su, inputs, tr), b = R.lap(su, inputs, tr.id);
  assert(a.finished && a.time === b.time && a.time > 30 && a.time < 100, `${tr.n}: a finished, repeatable lap (${a.time})`);
  assert(!R.lap(su, inputs.slice(0, 600), tr).finished, `${tr.n}: a lap cut short doesn't finish`);
}
assert(R.lap({ gear: 1, tire: 1 }, R.autoLap({ gear: 1, tire: 1 }).slice(0, 50) + "z").bad, "unknown letters are rejected");

// gears: the motors lesson's trade-off
const st = R.GEARS.map((_, g) => R.setupStats({ gear: g, tire: 1 }));
for (let g = 1; g < st.length; g++) {
  assert(st[g].top < st[g - 1].top, "more gearing means a lower top speed");
  assert(st[g].push >= st[g - 1].push, "more gearing means more pushing force");
}
assert(st[0].hill < st[1].hill && st[0].hill * 3.6 < 10, "4:1 nearly stalls on the Big Hill; 6:1 climbs it faster");
// tires: grip for corners, rolling resistance on straights
const ti = R.TIRES.map((_, t) => R.setupStats({ gear: 1, tire: t }));
for (let t = 1; t < ti.length; t++) assert(ti[t].corner > ti[t - 1].corner && ti[t].top < ti[t - 1].top, "grippier tires corner faster but have a lower top speed");

// each track rewards a different gear (the computer driver's best lap with each gear)
const bestGear = (tr) => R.autoTimes(tr).map((row) => Math.min(...row));
const [g0, g1, g2] = R.TRACKS.map(bestGear), fmt = (b) => b.map((x, g) => `${R.GEARS[g]}:1 ${x === Infinity ? "DNF" : x.toFixed(1)}`).join(", ");
assert(g0[1] < g0[0] && g0[0] < g0[2] && g0[2] < g0[3] && g0[0] - g0[1] < 4, "Garage Circuit fits 6:1, with 4:1 close behind: " + fmt(g0));
assert(g1[0] < g1[1] && g1[1] < g1[2] && g1[2] < g1[3], "Desert Speedway fits 4:1 (top speed): " + fmt(g1));
assert(g2[2] < g2[1] && g2[1] < g2[3] && g2[0] === Infinity, "Neon Peaks fits 8:1 and stalls 4:1: " + fmt(g2));

// the report: what it says must match the lap
const four = { gear: 0, tire: 1 }, e4 = R.explain(four, R.lap(four, R.autoLap(four)));
const hill4 = e4.items.find((i) => /Big Hill/.test(i.title));
assert(hill4.tone === "bad" && /torque/.test(hill4.text), "4:1 on Garage Circuit: the hill finding blames torque");
const twelve = { gear: 3, tire: 1 }, e12 = R.explain(twelve, R.lap(twelve, R.autoLap(twelve)));
assert(/top speed/.test(e12.items[0].text) && /lower gear/.test(e12.tip), "12:1: the straight is limited by top speed, tip says lower gear: " + e12.tip);
const peaks = R.TRACKS[2], stall = R.lap(four, R.autoLap(four, undefined, peaks), peaks), es = R.explain(four, stall, peaks);
assert(!stall.finished && /stalled/.test(es.items.find((i) => /First climb/.test(i.title)).title) && /more gearing/i.test(es.tip), "4:1 on Neon Peaks: stalls, and the tip says more gearing: " + es.tip);
const six = { gear: 1, tire: 1 }, e6p = R.explain(six, R.lap(six, R.autoLap(six, undefined, peaks), peaks), peaks);
assert(!/lower gear/.test(e6p.tip), "6:1 on Neon Peaks: never suggest the gear that stalls: " + e6p.tip);
const speed6 = R.explain(six, R.lap(six, R.autoLap(six, undefined, R.TRACKS[1]), R.TRACKS[1]), R.TRACKS[1]);
assert(/lower gear/.test(speed6.tip), "6:1 on Desert Speedway: the tip says a lower gear: " + speed6.tip);
// a wild driver who never brakes slides off, and the report says so
let wild = ""; { const car = R.newCar(); while (car.z < R.TRACK.LENGTH && car.t < R.MAX_STEPS) { const i = { steer: 0, gas: 1, brake: 0 }; wild += R.encode(i); R.step(car, four, i); } }
const rw = R.lap(four, wild), ew = R.explain(four, rw);
assert(rw.off > 2 && ew.items.some((i) => /Off the road/.test(i.title)) && /Brake/.test(ew.tip), "never braking: off the road, tip says brake");
// the hill profile's climb speeds agree with the garage numbers (4:1 stalls on Neon Peaks' climbs, 8:1 doesn't)
assert(Math.abs(R.climbSpeed({ gear: 1, tire: 1 }, 0.3) - R.setupStats({ gear: 1, tire: 1 }).hill) < 1e-9, "climbSpeed matches the garage's hill speed");
assert(R.climbSpeed(four, peaks.steep) < 0.3 && R.climbSpeed({ gear: 2, tire: 1 }, peaks.steep) > 1, "4:1 stalls on a 40% climb, 8:1 climbs it");
// medals: in order, and the computer driver's best lap earns gold
for (const tr of R.TRACKS) {
  const m = R.medals(tr), at = R.autoTimes(tr), best = Math.min(...at.flat());
  assert(m.gold < m.silver && m.silver < m.bronze, `${tr.n}: medal times in order`);
  assert(R.medalOf(best, tr) === "gold" && R.medalOf(m.silver, tr) === "silver" && R.medalOf(m.bronze + 0.01, tr) === null && R.medalOf(null, tr) === null, `${tr.n}: medals match the times`);
}
// looks: anything odd falls back to the default, good values (also as strings) are kept
assert.deepStrictEqual(R.cleanLook({ body: 4, c1: "11", c2: 3, liv: 6, num: 99, rim: 2, trail: 6, head: 4 }), { body: 4, c1: 11, c2: 3, liv: 6, num: 99, rim: 2, trail: 6, head: 4 });
assert.deepStrictEqual(R.cleanLook({ body: 9, c1: -1, c2: 1.5, liv: "x", num: 100, rim: null, trail: {}, head: "" }), R.cleanLook(null), "bad look values fall back to the defaults");
console.log(`Race tests passed (${R.TRACKS.map((t, i) => `${t.n}: ${fmt([g0, g1, g2][i])}`).join(" | ")})`);
