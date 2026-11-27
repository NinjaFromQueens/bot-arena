// Missions (public/data/missions): every mission, run with every choice it allows, has a right answer the model can
// work out, isn't too close to call, and agrees with what the run shows. Change a number in a model and this says
// which mission broke.
const assert = require("assert");
const fs = require("fs"), path = require("path");
const Missions = require("../public/js/missions.js");
const Race = require("../public/js/race.js");
Missions.register("racer", Race.MISSION);
const Flight = require("../public/js/flight.js");
Missions.register("lab", Flight.MISSION);
const Challenges = require("../public/js/challenges.js");
Missions.register("challenge", Challenges.MISSION);
const Echoes = require("../public/js/echoes.js");
Echoes.use(JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../public/data/echoes/index.json"), "utf8")).map((id) => require(`../public/data/echoes/${id}.json`)), require("../public/data/echoes/sets.json"));
Missions.register("echo", Echoes.MISSION);
// a Lab design has billions of combinations, so Lab missions run on a sample: the default car, a design that earns the
// mission (test/lab-solutions.json, shared with lab.test.js), and that design with each setting at its lowest and highest
const SOLUTIONS = require("./lab-solutions.json");
// Brain Challenges: no rules, the answer, every naive set, and the answer with each rule taken out
function challengeSamples(m) {
  const ch = Challenges.LIST.find((x) => x.id === m.setting), codes = [ch.answer, ...ch.naive], out = codes.map((c) => Challenges.choiceOf(Challenges.rulesOf(c)));
  const rules = Challenges.rulesOf(ch.answer);
  rules.forEach((_, k) => out.push(Challenges.choiceOf(rules.filter((__, j) => j !== k))));
  return out;
}
function labSamples(m) {
  const sol = SOLUTIONS[m.setting], out = [{ ...Flight.DEFAULT_DESIGN, flipOn: 0 }, { ...sol, flipOn: sol.flipOn ? 1 : 0 }];
  for (const k of Object.keys(m.allow)) for (const v of [m.allow[k][0], m.allow[k][m.allow[k].length - 1]]) out.push({ ...out[1], [k]: v });
  return out;
}
const pub = path.join(__dirname, "../public/data");
const index = JSON.parse(fs.readFileSync(path.join(pub, "missions/index.json"), "utf8"));
const lessons = JSON.parse(fs.readFileSync(path.join(pub, "lessons/index.json"), "utf8"));
const glossary = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(pub, "glossary.json"), "utf8")).map((g) => [g.id, g]));
const files = fs.readdirSync(path.join(pub, "missions")).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5));
assert.deepStrictEqual([...files].sort(), [...index].sort(), "missions/index.json must list every mission file exactly once");
assert.strictEqual(new Set(index).size, index.length, "mission ids must be unique");
const M = {};
let runs = 0;

for (const id of index) {
  const m = (M[id] = JSON.parse(fs.readFileSync(path.join(pub, `missions/${id}.json`), "utf8")));
  assert.strictEqual(m.id, id, `mission ${id}: the id must match the file name`);
  assert.deepStrictEqual(Missions.check(m, lessons), [], `mission ${id} has problems`);
  for (const t of ["cadet", "recruit", "operative"]) for (const f of ["brief", "question"]) assert(Missions.text(m, f, t).trim(), `mission ${id}: ${t} ${f} is empty`);
  const values = Missions.options(m, "recruit").map((o) => o.value);
  let met = 0;
  const all = m.game === "lab" ? labSamples(m) : m.game === "challenge" ? challengeSamples(m) : Missions.allChoices(m);
  runs += all.length;
  for (const c of all) {
    const at = `mission ${id} with ${JSON.stringify(c)}`;
    const ans = Missions.answer(m, c), run = Missions.result(m, c);
    assert(values.includes(ans), `${at}: the answer ${ans} isn't one of the options`);
    assert(!Missions.close(m, c), `${at}: the answer is too close to call, so a small retune could flip it. Change the setting or the allowed choices`);
    if (m.predict.kind === "willClear" && m.goal.kind === "complete") assert.strictEqual(ans === "yes", run.goal, `${at}: the answer must match the flight`);
    if (m.predict.kind === "winsOfTen") assert.strictEqual(run.result.wins, Challenges.run(Challenges.LIST.find((x) => x.id === m.setting), Challenges.rulesFromChoice(Missions.choice(m, c))).wins, `${at}: the run must be the ten fights`);
    if (m.predict.kind === "reachTop" && m.goal.kind === "reachEnd") assert.strictEqual(ans === "top", run.goal, `${at}: the answer must match the computer driver's run`);
    if (run.goal) met++;
    if (Missions.once(m)) assert.deepStrictEqual(ans, Missions.answer(m, all[0]), `${at}: a question asked once compares every choice, so its answer can't depend on the one picked`);
    if (m.predict.kind === "firstHome" && m.goal.kind === "bestGear") assert.strictEqual(run.goal, c.gear === ans, `${at}: only the gear that finishes first meets the goal`);
    // the explain card: findings and a tip, and a tip's change really is better (it reaches the goal, or gets there faster)
    const model = { racer: Race.MISSION, lab: Flight.MISSION, challenge: Challenges.MISSION, echo: Echoes.MISSION }[m.game];
    if (!model.explain) continue; // the Lab keeps its own flight report (Flight.explain)
    const e = model.explain(m, Missions.choice(m, c));
    assert(e.headline && e.headline.text && e.items.length && e.tip && e.tip.text, `${at}: the explain card needs a headline, findings and a tip`);
    assert.strictEqual(e.headline.tone === "good", !!run.result.finished, `${at}: the headline must match the run`);
    assert(e.graph && e.graph.speed.length > 2 && e.graph.profile.length > 2 && (e.graph.stop == null) === !!run.result.finished, `${at}: the graph needs the speed, the hill, and a stop mark only when it stopped`);
    for (const it of e.items) for (const t of it.terms || []) assert(glossary[t], `${at}: the finding "${it.title}" names a term the glossary doesn't have: ${t}`);
    if (e.tip.change) {
      const next = Missions.result(m, { ...Missions.choice(m, c), ...e.tip.change });
      assert(Missions.changes(m, c, { ...Missions.choice(m, c), ...e.tip.change }).n === 1, `${at}: a tip changes exactly one thing`);
      assert((next.result.finished && !run.result.finished) || (next.result.finished && run.result.finished && next.result.time < run.result.time), `${at}: the tip "${e.tip.text}" doesn't make the run better`);
    }
  }
  assert(met > 0, `mission ${id}: no allowed choice meets the goal`);
  if (m.game === "lab") assert.strictEqual(Missions.answer(m, all[1]), "yes", `mission ${id}: the saved solution must complete it`);
  if (m.game === "lab") assert.strictEqual(id, "lab-" + m.setting, `mission ${id}: the Lab page opens lab-<its Lab mission id>`);
  assert(met < all.length, `mission ${id}: every allowed choice meets the goal, so there's nothing to find out`);
  // lessons and missions link both ways (game standard L4)
  const L = JSON.parse(fs.readFileSync(path.join(pub, `lessons/${m.lesson}.json`), "utf8"));
  assert(L.missions.includes(id), `mission ${id}: its lesson ${m.lesson} must list it in missions`);
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
// lesson 7's other two claims: on a flat straight, the least gearing (4:1) has the highest top speed; with a hill and then
// a straight, the middle gear (6:1) gets there first, because 4:1 crawls up the hill and 8:1 and 12:1 are slow on the flat
assert.strictEqual(Missions.answer(M["gear-straight"], {}), 0, "4:1 has the highest top speed on the straight");
assert.strictEqual(Missions.answer(M["hill-straight"], {}), 1, "6:1 finishes first on the hill, then straight");
// a run the student drove themselves is re-driven from its inputs (what the server will check)
const inputs = Race.autoLap({ gear: 2, tire: 1 }, undefined, Race.stripOf(gh.setting));
assert(Missions.result(gh, { gear: 2, tire: 1 }, { inputs }).goal, "8:1 driven well reaches the top");
assert(!Missions.result(gh, { gear: 2, tire: 1 }, { inputs: "a".repeat(600) }).goal, "a run that never presses the gas doesn't");
console.log(`Mission tests passed (${index.length} mission${index.length === 1 ? "" : "s"}, ${runs} choices run)`);
