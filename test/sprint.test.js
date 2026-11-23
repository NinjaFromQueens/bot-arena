// Problem sets (sprint.js): over 1,000 seeds per tier, every Thrust problem's answer is what the Flying Car Lab's own
// model gives for that car (worked out again here from Flight, not taken from the generator), Recruit's g = 10 agrees
// with the Lab's 9.81, nozzle counts include each nozzle's 4 kg, Cadet numbers stay small, every problem has worked
// steps that end in the answer and named mistakes with their own values, check() tells them apart, the same seed always
// gives the same problem and every tier gets the same car, and students' copies hold no answer.
const assert = require("assert");
const F = require("../public/js/flight.js");
const Sprint = require("../public/js/sprint.js");

const SEEDS = 1000, set = Sprint.set("thrust");
assert(set && set.game === "lab" && set.lesson === "thrust", "the Thrust set belongs to the Lab and the thrust lesson");
const lessons = require("../public/data/lessons/index.json");
assert(lessons.includes(set.lesson), "its lesson exists");

const r1 = (x) => Math.round(x * 10) / 10;
const tw = (car, n) => F.sheet({ ...car, lift: n }).tw;
const counts = {};
for (let seed = 1; seed <= SEEDS; seed++) {
  const round = Sprint.TIERS.map((t) => set.make(seed, t));
  assert.deepStrictEqual(round, Sprint.TIERS.map((t) => set.make(seed, t)), `seed ${seed}: the same seed gives the same problems`);
  assert(round.every((p) => JSON.stringify(p.car) === JSON.stringify(round[0].car)), `seed ${seed}: every tier gets the same car (the board shows one)`);
  for (const p of round) {
    const at = `seed ${seed} ${p.tier} ${p.kind}`, car = p.car, s = F.sheet(car), num = p.input.kind === "number";
    counts[p.tier + ":" + p.kind] = (counts[p.tier + ":" + p.kind] || 0) + 1;
    assert.deepStrictEqual(F.clampDesign(car), car, `${at}: a car the Lab can build`);
    assert(p.text && !/undefined|NaN|Infinity/.test(p.text + JSON.stringify(p.steps) + JSON.stringify(p.mistakes)), `${at}: no broken text`);
    assert(set.kinds[p.tier].includes(p.kind), `${at}: a kind of this tier`);

    // the answer is what the Lab's model says
    const a = p.answer.value;
    if (p.kind === "liftOrNot") assert.strictEqual(a, s.tw > 1 ? "yes" : "no", `${at}: lifts off exactly when thrust ÷ weight is over 1`);
    if (p.kind === "enoughNozzles") {
      const other = p.pic.nozzles.find((n) => n !== a);
      assert(tw(car, a) > 1 && tw(car, other) < 1, `${at}: only the chosen car lifts off, nozzle mass included`);
    }
    if (p.tier === "recruit" && p.kind === "weight") assert.strictEqual(a, s.kg * 10, `${at}: mass × 10`);
    if (p.kind === "nozzlesNeeded") {
      assert(tw(car, a) > 1 && tw(car, a - 1) <= 1, `${at}: the Lab (g = 9.81, each nozzle's 4 kg) needs exactly ${a}`);
      const W = +p.text.match(/weighs about ([\d,]+) N/)[1].replace(/,/g, "");
      assert(a * 1600 > W && (a - 1) * 1600 <= W, `${at}: g = 10 gives the same count`);
    }
    if (p.kind === "thrustToWeight") {
      const W = +p.text.match(/weighs about ([\d,]+) N/)[1].replace(/,/g, "");
      assert.strictEqual(a, r1(s.tw), `${at}: the Lab's thrust ÷ weight, to one decimal`);
      assert.strictEqual((car.lift * 1600) / W > 1, s.tw > 1, `${at}: g = 10 and 9.81 agree on lift-off`);
    }
    if (p.tier === "operative" && p.kind === "weight") assert(Math.abs(a - s.weight) <= 0.5, `${at}: mass × 9.81`);
    if (p.kind === "nozzlesForMargin") {
      const R = +p.text.match(/at least ([\d.]+)\?/)[1];
      assert(tw(car, a) >= R && tw(car, a - 1) < R, `${at}: the Lab's fewest nozzles for ${R}, each nozzle's 4 kg included`);
    }
    if (p.kind === "netForce") assert(Math.abs(a - (car.lift * 1600 - s.weight)) <= 0.5 && a > 0, `${at}: lift thrust − weight`);
    if (p.kind === "acceleration") assert.strictEqual(a, r1((car.lift * 1600 - s.weight) / s.kg), `${at}: net force ÷ mass`);
    if (p.kind === "burnTime") assert.strictEqual(a, r1(s.burn), `${at}: the Lab's push time`);

    // Cadets: pictures and counts up to 20; no big numbers in their text
    if (p.tier === "cadet") {
      assert.strictEqual(p.input.kind, "choice", `${at}: Cadets pick, they don't type`);
      assert(!(p.text + p.steps.join(" ") + p.mistakes.map((m) => m.why).join(" ")).match(/\d+/g)?.some((n) => +n > 20), `${at}: no number over 20`);
    }
    // steps end in the answer
    assert(p.steps.length >= 2, `${at}: worked steps`);
    const last = p.steps[p.steps.length - 1];
    if (num) assert(last.includes(Sprint.fmt(a, Number.isInteger(a) ? 0 : 1)), `${at}: the last step ends in the answer (${last})`);
    else assert(last === p.input.options.find((o) => o.value === a).label, `${at}: the last step is the answer`);

    // mistakes: at least one, each with its own value and reason, and check() tells them apart
    assert(p.mistakes.length >= 1 && p.mistakes.every((m) => m.why && m.why.length > 20), `${at}: named mistakes with reasons`);
    assert.deepStrictEqual(Sprint.check(p, a), { correct: true, mistake: -1 }, `${at}: the answer is right`);
    p.mistakes.forEach((m, i) => assert.deepStrictEqual(Sprint.check(p, m.value), { correct: false, mistake: i }, `${at}: mistake ${i} (${m.value}) is recognized as itself`));
    if (num) {
      assert.deepStrictEqual(Sprint.check(p, Sprint.fmt(a, Number.isInteger(a) ? 0 : 1)), { correct: true, mistake: -1 }, `${at}: "14,240" with a comma counts`);
      assert.strictEqual(Sprint.check(p, "").correct, false, `${at}: a blank answer is wrong`);
      assert.strictEqual(Sprint.check(p, "abc").mistake, -1, `${at}: nonsense isn't a named mistake`);
    }

    // students' copy: no answer, steps, mistakes or car
    const st = Sprint.forStudent(p);
    assert(!("answer" in st) && !("steps" in st) && !("mistakes" in st) && !("car" in st) && !("seed" in st) && !("id" in st) && st.text === p.text && st.input, `${at}: the student's copy is the question only (no seed: it would give the answer away)`);
  }
}
// every kind shows up often enough that a class sees a mix
for (const t of Sprint.TIERS) for (const k of set.kinds[t]) assert((counts[t + ":" + k] || 0) >= SEEDS * 0.05, `${t} ${k} comes up in at least 5% of rounds (${counts[t + ":" + k] || 0} of ${SEEDS})`);

// the plan's worked examples hold for the default car (steel, 3 tanks, 6 lift nozzles, 1 passenger)
const D = F.clampDesign(F.DEFAULT_DESIGN), sd = F.sheet(D);
assert.strictEqual(sd.kg, 1424); assert.strictEqual(Math.round(sd.weight), 13969); assert.strictEqual(sd.lift, 9600);
assert(tw(D, 9) > 1 && tw(D, 8) < 1 && Math.abs(tw(D, 9) - 1.02) < 0.005, "9 nozzles lift the default car (1.02), 8 don't");
assert.strictEqual(Math.round(16000 - F.sheet({ ...D, lift: 10 }).weight), 1874, "10 nozzles: net 1,874 N");
assert.strictEqual(F.sheet({ ...D, lift: 9 }).burn, 1, "3 tanks, 9 nozzles: 1.0 s");
// an unknown tier gets Recruit; a bad seed still works
assert.strictEqual(set.make(5, "grade5").tier, "recruit");
assert(set.make("x", "cadet").text);

const mix = Sprint.TIERS.map((t) => `${t}: ${set.kinds[t].map((k) => `${k} ${counts[t + ":" + k] || 0}`).join(", ")}`).join(" | ");
// the solo Speed Run's rules (S-02, solorun.js): only a clean run sets a best, splits compare against the best's
{
  const Solo = require("../public/js/solorun.js");
  const run = (time, splits, right = splits.length) => ({ time, splits, right });
  let st = {}, r = Solo.record(st, "thrust", "recruit", 5, run(50000, [9000, 20000, 30000, 40000, 50000]), 1);
  assert(r.best && r.store.thrust["recruit-5"].time === 50000, "solo: the first clean run is the best");
  st = r.store;
  assert(!Solo.record(st, "thrust", "recruit", 5, run(60000, [1, 2, 3, 4, 60000]), 2).best, "solo: a slower run isn't");
  assert(!Solo.record(st, "thrust", "recruit", 5, run(10000, [1000, 2000, 3000, 4000], 4), 2).best, "solo: a run with a miss never sets a best, however fast");
  r = Solo.record(st, "thrust", "recruit", 5, run(45000, [8000, 19000, 31000, 39000, 45000]), 3);
  assert(r.best && r.store.thrust["recruit-5"].time === 45000, "solo: a faster clean run replaces the best");
  assert(!Solo.bestOf(r.store, "thrust", "recruit", 10) && !Solo.bestOf(r.store, "thrust", "cadet", 5), "solo: bests are kept per reading level and length");
  assert.deepStrictEqual(Solo.deltas([8000, 21000, null], st.thrust["recruit-5"]), [-1000, 1000, null], "solo: splits below the best's are ahead, above are behind");
  assert.deepStrictEqual(Solo.deltas([5000], null), [null], "solo: no best, nothing to compare");
  assert.strictEqual(Solo.clock(83456), "1:23.4"); assert.strictEqual(Solo.clock(9999), "0:09.9"); assert.strictEqual(Solo.delta(-1250), "−1.3");
  const cadet = Sprint.set("thrust").make(7, "cadet"), rec = Sprint.set("thrust").make(7, "recruit");
  assert.strictEqual(Solo.triesFor(cadet), cadet.input.kind === "choice" ? cadet.input.options.length - 1 : 3, "solo: choices give one fewer try than options");
  assert.strictEqual(Solo.triesFor(rec), 3, "solo: number answers get 3 tries");
}

console.log(`Problem set tests passed (Thrust, ${SEEDS} seeds per tier: ${mix})`);
