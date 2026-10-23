// Flying Car Lab tests: every mission stays solvable, the sim is deterministic, and loopholes stay closed.
const assert = require("assert");
const F = require("../public/js/flight.js");
const SOLUTIONS = {
  "hop": {
    "material": 3,
    "tanks": 5,
    "lift": 3,
    "push": 2,
    "flip": 3,
    "computer": 1,
    "gear": 0,
    "people": 1,
    "speed": 55,
    "ramp": 1,
    "reserve": 30,
    "flipOn": false
  },
  "car": {
    "material": 3,
    "tanks": 4,
    "lift": 15,
    "push": 1,
    "flip": 3,
    "computer": 2,
    "gear": 1,
    "people": 0,
    "speed": 55,
    "ramp": 2,
    "reserve": 45,
    "flipOn": false
  },
  "semi": {
    "material": 3,
    "tanks": 4,
    "lift": 2,
    "push": 2,
    "flip": 4,
    "computer": 1,
    "gear": 2,
    "people": 0,
    "speed": 60,
    "ramp": 2,
    "reserve": 15,
    "flipOn": false
  },
  "flip": {
    "material": 0,
    "tanks": 5,
    "lift": 14,
    "push": 2,
    "flip": 4,
    "computer": 2,
    "gear": 0,
    "people": 1,
    "speed": 40,
    "ramp": 2,
    "reserve": 45,
    "flipOn": true
  },
  "five": {
    "material": 3,
    "tanks": 6,
    "lift": 8,
    "push": 0,
    "flip": 4,
    "computer": 2,
    "gear": 0,
    "people": 1,
    "speed": 55,
    "ramp": 0,
    "reserve": 45,
    "flipOn": false
  },
  "semiflip": {
    "material": 0,
    "tanks": 8,
    "lift": 15,
    "push": 2,
    "flip": 3,
    "computer": 2,
    "gear": 0,
    "people": 0,
    "speed": 60,
    "ramp": 0,
    "reserve": 45,
    "flipOn": true
  },
  "people": {
    "material": 0,
    "tanks": 6,
    "lift": 12,
    "push": 1,
    "flip": 0,
    "computer": 2,
    "gear": 2,
    "people": 2,
    "speed": 45,
    "ramp": 0,
    "reserve": 30,
    "flipOn": false
  },
  "budget": {
    "material": 0,
    "tanks": 3,
    "lift": 5,
    "push": 4,
    "flip": 0,
    "computer": 1,
    "gear": 2,
    "people": 1,
    "speed": 55,
    "ramp": 2,
    "reserve": 30,
    "flipOn": false
  }
};
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
