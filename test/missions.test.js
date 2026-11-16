// Missions (public/data/missions): every mission, run with every choice it allows, has a right answer the model can
// work out, isn't too close to call, and agrees with what the run shows. Change a number in a model and this says
// which mission broke.
const assert = require("assert");
const fs = require("fs"), path = require("path");
const Missions = require("../public/js/missions.js");
const Race = require("../public/js/race.js");
Missions.register("racer", Race.MISSION);
const pub = path.join(__dirname, "../public/data");
const index = JSON.parse(fs.readFileSync(path.join(pub, "missions/index.json"), "utf8"));
const lessons = JSON.parse(fs.readFileSync(path.join(pub, "lessons/index.json"), "utf8"));
const files = fs.readdirSync(path.join(pub, "missions")).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5));
assert.deepStrictEqual([...files].sort(), [...index].sort(), "missions/index.json must list every mission file exactly once");
assert.strictEqual(new Set(index).size, index.length, "mission ids must be unique");
const M = {};

for (const id of index) {
  const m = (M[id] = JSON.parse(fs.readFileSync(path.join(pub, `missions/${id}.json`), "utf8")));
  assert.strictEqual(m.id, id, `mission ${id}: the id must match the file name`);
  assert.deepStrictEqual(Missions.check(m, lessons), [], `mission ${id} has problems`);
  for (const t of ["cadet", "recruit", "operative"]) for (const f of ["brief", "question"]) assert(Missions.text(m, f, t).trim(), `mission ${id}: ${t} ${f} is empty`);
  const values = Missions.options(m, "recruit").map((o) => o.value);
  let met = 0;
  const all = Missions.allChoices(m);
  for (const c of all) {
    const at = `mission ${id} with ${JSON.stringify(c)}`;
    const ans = Missions.answer(m, c), run = Missions.result(m, c);
    assert(values.includes(ans), `${at}: the answer ${ans} isn't one of the options`);
    assert(!Missions.close(m, c), `${at}: the answer is too close to call, so a small retune could flip it. Change the setting or the allowed choices`);
    if (m.predict.kind === "reachTop" && m.goal.kind === "reachEnd") assert.strictEqual(ans === "top", run.goal, `${at}: the answer must match the computer driver's run`);
    if (run.goal) met++;
  }
  assert(met > 0, `mission ${id}: no allowed choice meets the goal`);
  assert(met < all.length, `mission ${id}: every allowed choice meets the goal, so there's nothing to find out`);
}

// choices outside the mission's list are ignored, so a doctored payload can't pick a hidden setup
const gh = M["gear-hill"];
assert.deepStrictEqual(Missions.choice(gh, { gear: 9, tire: 0 }), { gear: 0, tire: 1 });
assert.deepStrictEqual(Missions.choice(gh, null), { gear: 0, tire: 1 });
assert.deepStrictEqual(Missions.changes(gh, { gear: 0, tire: 1 }, { gear: 2, tire: 1 }), { n: 1, keys: ["gear"] });
assert.deepStrictEqual(Missions.changes(gh, { gear: 2 }, { gear: 2, tire: 2 }), { n: 0, keys: [] }, "a change to a fixed choice doesn't count");
// what the gear-hill text and lesson 7 rely on: a 40 m hill at 21.8°, where 4:1 stalls and more gearing climbs
const hill = Race.stripOf(gh.setting).SECTIONS.find((s) => s.slope > 0);
assert.strictEqual(hill.len, 40); assert.strictEqual((Math.atan(hill.slope) * 180 / Math.PI).toFixed(1), "21.8");
assert.deepStrictEqual([0, 1, 2, 3].map((g) => Missions.answer(gh, { gear: g, tire: 1 })), ["stuck", "top", "top", "top"], "4:1 gets stuck; 6:1, 8:1 and 12:1 make it");
// a run the student drove themselves is re-driven from its inputs (what the server will check)
const inputs = Race.autoLap({ gear: 2, tire: 1 }, undefined, Race.stripOf(gh.setting));
assert(Missions.result(gh, { gear: 2, tire: 1 }, { inputs }).goal, "8:1 driven well reaches the top");
assert(!Missions.result(gh, { gear: 2, tire: 1 }, { inputs: "a".repeat(600) }).goal, "a run that never presses the gas doesn't");
console.log(`Mission tests passed (${index.length} mission${index.length === 1 ? "" : "s"}, ${Object.values(M).reduce((n, m) => n + Missions.allChoices(m).length, 0)} choices run)`);
