// Robot Racer: laps are deterministic and checkable, the gear and tire trade-offs are real, and the report tells the truth.
const assert = require("assert");
const R = require("../public/js/race.js");

// inputs round-trip through the lap letters
for (const steer of [-1, 0, 1]) for (const gas of [0, 1]) for (const brake of [0, 1]) assert.deepStrictEqual(R.decode(R.encode({ steer, gas, brake })), { steer, gas, brake });
// the same inputs always give the same lap (the server re-drives submitted laps)
const su = { gear: 1, tire: 1 }, inputs = R.autoLap(su);
const a = R.lap(su, inputs), b = R.lap(su, inputs);
assert(a.finished && a.time === b.time && a.time > 30 && a.time < 90, "a finished, repeatable lap " + a.time);
assert(!R.lap(su, inputs.slice(0, 600)).finished, "a lap cut short doesn't finish");
assert(R.lap(su, inputs.slice(0, 50) + "z").bad, "unknown letters are rejected");
assert(!R.lap(su, "c".repeat(R.MAX_STEPS + 10)).finished || R.lap(su, "c".repeat(R.MAX_STEPS + 10)).time <= R.MAX_STEPS * R.DT, "laps are capped at 3 minutes");
assert.deepStrictEqual(R.clampSetup({ gear: 9, tire: -1 }), { gear: 1, tire: 1 }, "bad setups fall back to the middle");

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

// the track fits the middle gear: 6:1 is fastest for the computer driver, 4:1 close behind, then 8:1, then 12:1
const best = R.GEARS.map((_, g) => Math.min(...R.TIRES.map((_, t) => R.lap({ gear: g, tire: t }, R.autoLap({ gear: g, tire: t })).time)));
assert(best[1] < best[0] && best[0] < best[2] && best[2] < best[3], "gear order on this track: " + best.map((x) => x.toFixed(1)).join(" "));
assert(best[0] - best[1] < 4, "4:1 should stay close (fast straights, slow hill)");

// the report: what it says must match the lap
const four = { gear: 0, tire: 1 }, r4 = R.lap(four, R.autoLap(four)), e4 = R.explain(four, r4);
assert(e4.items.find((i) => /Big Hill/.test(i.title)).tone === "bad" && /torque/.test(e4.items.find((i) => /Big Hill/.test(i.title)).text), "4:1: the hill finding blames torque");
const twelve = { gear: 3, tire: 1 }, e12 = R.explain(twelve, R.lap(twelve, R.autoLap(twelve)));
assert(/top speed/.test(e12.items[0].text) && /lower gear/.test(e12.tip), "12:1: the straight is limited by top speed, tip says lower gear: " + e12.tip);
// a wild driver who never brakes slides off, and the report says so
let wild = ""; { const car = R.newCar(); while (car.z < R.TRACK.LENGTH && car.t < R.MAX_STEPS) { const i = { steer: 0, gas: 1, brake: 0 }; wild += R.encode(i); R.step(car, four, i); } }
const rw = R.lap(four, wild), ew = R.explain(four, rw);
assert(rw.off > 2 && ew.items.some((i) => /Off the road/.test(i.title)) && /Brake/.test(ew.tip), "never braking: off the road, tip says brake");
console.log(`Race tests passed (computer driver: ${best.map((x, g) => `${R.GEARS[g]}:1 ${x.toFixed(1)} s`).join(", ")})`);
