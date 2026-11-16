// Flying Car Lab tests: every mission stays solvable, the sim is deterministic, and loopholes stay closed.
const assert = require("assert");
const F = require("../public/js/flight.js");
// a design that earns the mission, per mission (missions.test.js uses them too)
const SOLUTIONS = require("./lab-solutions.json");
for (const m of F.MISSIONS) {
  const d = SOLUTIONS[m.id];
  assert(d, `no saved solution for ${m.id}`);
  const r = F.simulate(d, m), g = F.grade(r);
  assert(g.complete, `${m.id} should be solvable (got ${r.outcome}, fails: ${g.fails.join(",")})`);
  const r2 = F.simulate(d, m);
  assert.strictEqual(r2.landX, r.landX, "deterministic");
  const e = F.explain(r, g);
  assert(e.items.length > 0 && e.tip, "report has findings and a tip");
}
// the starting car must fail every obstacle mission (so students have something to fix)
for (const m of F.MISSIONS.filter((x) => x.obstacles.length)) assert(!F.grade(F.simulate(F.DEFAULT_DESIGN, m)).complete, `default car should not beat ${m.id}`);
// no thrusters, max ramp speed: can't clear the semi
const semi = F.MISSIONS.find((m) => m.id === "semi");
assert(!F.grade(F.simulate({ ...F.DEFAULT_DESIGN, lift: 0, push: 0, tanks: 0, speed: 60, ramp: 2 }, semi)).complete, "ramp alone must not clear the semi");
// landing before the vehicles is not a pass
const short = F.simulate({ ...F.DEFAULT_DESIGN, lift: 0, push: 0, tanks: 0, speed: 20, ramp: 0, computer: 1 }, semi);
assert.strictEqual(short.outcome, "short");
console.log("Lab tests passed");
