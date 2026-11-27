// Echo Lab (public/js/echoes.js, ECHO-1): every case file is well-formed and decides real or altered from its evidence
// alone; each practice case is proved by the check it teaches; the rules lesson I1 states are the rules the model uses
// (the timeline's years, one light, most copies win, the record only for Operatives); a verdict counts as checked only
// after a clue that shows it; the explanations say what the model found; and every picture is in the asset list.
const assert = require("assert");
const fs = require("fs"), path = require("path");
const Echoes = require("../public/js/echoes.js");

const dir = path.join(__dirname, "../public/data/echoes");
const json = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const index = json("index.json"), sets = json("sets.json");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !["index.json", "sets.json"].includes(f)).map((f) => f.slice(0, -5));
assert.deepStrictEqual([...files].sort(), [...index].sort(), "echoes/index.json lists every case file exactly once");
const cases = index.map((id) => json(`${id}.json`));
Echoes.use(cases, sets);
const C = (id) => Echoes.caseOf(id);
const assets = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/assets/story-assets.json"), "utf8")).assets;

// every case: well-formed, its id matches its file, its pictures are listed assets
for (const c of cases) {
  assert.deepStrictEqual(Echoes.check(c), [], `case ${c.id} has problems`);
  assert.strictEqual(c.id, index[cases.indexOf(c)], `case ${c.id}: the id matches the file name`);
  for (const pic of [c.picture, ...(c.copies || []).map((k) => k.picture)]) assert(assets[pic] && assets[pic].kind === "image", `case ${c.id}: ${pic} is an image in story-assets.json`);
}
for (const [id, s] of Object.entries(sets)) for (const cid of s.cases) assert(C(cid), `set ${id}: there's no case ${cid}`);

// the verdicts, worked out from the evidence (never stored in a case)
const verdicts = Object.fromEntries(cases.map((c) => [c.id, Echoes.proofs(c).map((p) => p.tell).sort().join("+") || "real"]));
assert.deepStrictEqual(verdicts, {
  "festival-2034": "date", "park-2038": "shadow", "play-2035": "copies+record", "harbor-2035": "date", "market-2039": "date+date+shadow", // the Warden and the maglev on the arches are both too new, and the Warden's shadow is wrong
  "graduation-2033": "real", "christmas-2045": "real", "festival-2034-real": "real",
}, "each case's proofs");
for (const c of cases) assert(!("altered" in c) && !("answer" in c) && !("real" in c), `case ${c.id} never stores its answer`);
// each practice case is proved by the check it teaches, so the practice teaches what it says
for (const c of cases.filter((x) => x.teaches)) assert(Echoes.proofs(c).some((p) => p.tell === c.teaches), `case ${c.id} teaches ${c.teaches}`);
// the park picnic: its brief says everything in it existed then, so the date check can't decide it (only the light can)
assert(!Echoes.proofs(C("park-2038")).some((p) => p.tell === "date") && Echoes.TIMELINE.omni.year <= C("park-2038").year, "park-2038: everything in it existed in 2038");
// the archive set: two of five altered (the mission asks how many)
assert.strictEqual(Echoes.MISSION.predict.howManyAltered.answer({ setting: "archive-1" }), 2, "two of the Archive's last five were altered");

// the rules the lesson states (its Recruit and Operative text quote these years and rules)
const lesson = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/data/lessons/real-or-altered.json"), "utf8"));
const said = JSON.stringify(lesson);
assert.strictEqual(Echoes.TIMELINE.omni.year, 2036, "OMNI was switched on in 2036 (the bible, and lesson I1)");
assert(/switched on in 2036/.test(said) && /OMNI 2036, risk ratings 2042, Wardens 2046/.test(said), "the lesson's years are the timeline's");
assert.deepStrictEqual([Echoes.TIMELINE.risk.year, Echoes.TIMELINE.warden.year, Echoes.TIMELINE.seal.year], [2042, 2046, 2047], "the bible's other dated facts");
assert(/after 2046/.test(said) && Echoes.DAY_OF_SILENCE === 2046, "the record's warning sign is an edit after 2046");
// a date that can't be right: newer than the Echo's date, not the same year
const probe = (o) => Echoes.proofs({ id: "probe", year: 2036, light: 90, items: [{ id: "x", name: "x", x: 1, y: 1, r: 1, ...o }] });
assert.strictEqual(probe({ thing: "omni" }).length, 0, "a thing from the Echo's own year is fine");
assert.strictEqual(probe({ thing: "risk" }).length, 1, "a thing newer than the Echo's date proves an edit");
// a shadow that doesn't match: up to the slack is the same light, past it is pasted in (both ways round the circle)
assert.strictEqual(probe({ shadow: 90 + Echoes.SHADOW_SLACK }).length, 0, "a shadow within the slack matches");
assert.strictEqual(probe({ shadow: 90 + Echoes.SHADOW_SLACK + 5 }).length, 1, "a shadow past the slack doesn't");
assert.strictEqual(Echoes.apart(350, 10), 20, "directions are compared round the circle");
// copies that disagree: most copies win; a tie proves nothing
const copies = (shows, checks) => ({ id: "probe", year: 2035, items: [{ id: "x", name: "x", x: 1, y: 1, r: 1 }], checks, copies: shows.map((s, i) => ({ id: "abcd"[i], server: "s", saved: 2035, picture: "p", shows: { seats: s } })) });
assert.strictEqual(Echoes.proofs(copies(["full", "full", "empty"], "c")).length, 1, "the odd one out was edited");
assert.strictEqual(Echoes.proofs(copies(["full", "full", "empty"], "a")).length, 0, "a copy that matches most is fine");
assert.strictEqual(Echoes.proofs(copies(["full", "empty"], "b")).length, 0, "two copies can't outvote each other");
assert.strictEqual(Echoes.proofs(copies(["full", "full", "empty", "empty"], "c")).length, 0, "a tie proves nothing");
// the file record: only Operatives see it, so it's never the only proof
assert(Echoes.check({ ...copies(["a", "a"], "a"), record: [{ who: "OMNI's archive", when: 2051, what: "edited" }] }).some((s) => /only the file record/.test(s)), "a case proved only by the record is refused");
assert(!Echoes.clues(C("play-2035"), "recruit").includes("record") && Echoes.clues(C("play-2035"), "operative").includes("record"), "the record is an Operative clue");

// checked before deciding: an altered verdict needs the clue that proves it; a real one needs at least one look
const fest = C("festival-2034");
assert(Echoes.judge(fest, 1, ["item:banner"]).right && Echoes.judge(fest, 1, ["item:banner"]).backed, "altered, after tapping the banner: right and checked");
assert(Echoes.judge(fest, 1, ["item:lanterns"]).right && !Echoes.judge(fest, 1, ["item:lanterns"]).backed, "altered, after only the lanterns: right, but a guess");
assert(!Echoes.judge(fest, 0, ["item:banner"]).right, "real is wrong");
assert(Echoes.judge(C("park-2038"), 1, ["light"]).backed && !Echoes.judge(C("park-2038"), 1, ["item:helper"]).backed, "the park needs the light shown, not just the robot tapped");
assert(Echoes.judge(C("play-2035"), 1, ["copies"]).backed, "the play needs the copies compared");
assert(Echoes.judge(C("graduation-2033"), 0, ["item:caps"]).backed && !Echoes.judge(C("graduation-2033"), 0, []).backed, "real needs one look");
assert.strictEqual(Echoes.judge(fest, 1, ["item:banner", "nope", 7, "item:banner"]).checked, 1, "unknown and repeated clues are ignored (the server sends what the page did)");
assert(Echoes.judge(fest, 1).backed, "no list means a careful checker who looked at everything (the mission test's run)");

// the explain card says what the model found, in the lesson's words, at every level
for (const c of cases) for (const t of ["cadet", "recruit", "operative"]) for (const v of [0, 1]) {
  const e = Echoes.explain(c, v, Echoes.clues(c, t), t), truth = Echoes.altered(c) ? 1 : 0;
  assert.strictEqual(e.headline.tone === "good", v === truth, `case ${c.id} ${t} ${v}: the headline matches the verdict`);
  assert(e.items.length >= 2 && e.tip && e.tip.text, `case ${c.id} ${t}: findings and a tip`);
  if (truth) for (const p of Echoes.proofs(c).filter((x) => x.tell !== "record" || t === "operative")) assert(e.items.some((it) => it.text === Echoes.proofText(c, p, t)), `case ${c.id} ${t}: every proof is explained`);
}
assert(/2036/.test(Echoes.proofText(fest, Echoes.proofs(fest)[0], "recruit")) && /2034/.test(Echoes.proofText(fest, Echoes.proofs(fest)[0], "recruit")), "the festival's explanation gives both years");
assert(/2 of 3 copies/.test(Echoes.proofText(C("play-2035"), Echoes.proofs(C("play-2035")).find((p) => p.tell === "copies"), "recruit")), "the play's explanation counts the copies");
assert(!Echoes.explain(C("play-2035"), 1, ["copies"], "recruit").items.some((it) => /file record/i.test(it.title)), "Recruits never read about the record");
// clue text gives the evidence, never the verdict, and states the timeline's facts
for (const c of cases) for (const t of ["cadet", "recruit", "operative"]) for (const clue of Echoes.clues(c, t)) {
  const s = Echoes.clueText(c, clue, t);
  assert(s && !/\b(altered|real|changed|edited|fake)\b/i.test(s.replace(/OMNI's archive after 2046/, "")), `case ${c.id} ${t} ${clue}: the clue text gives evidence, not the verdict ("${s}")`);
}
assert(/2036/.test(Echoes.clueText(fest, "item:banner", "cadet")) && /switched on in 2036/.test(Echoes.clueText(fest, "item:banner", "recruit")), "tapping the banner gives OMNI's year");
console.log(`Echo Lab tests passed (${cases.length} cases, ${Object.keys(sets).length} set)`);
