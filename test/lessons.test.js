// Lesson files (public/data/lessons): every lesson the page can load is complete and consistent, in every reading level.
const assert = require("assert");
const fs = require("fs"), path = require("path");
const Tier = require("../public/js/tiers.js");
const dir = path.join(__dirname, "../public/data/lessons");
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

const index = read("index.json");
const missions = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/data/missions/index.json"), "utf8"));
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5));
assert.deepStrictEqual([...files].sort(), [...index].sort(), "index.json must list every lesson file exactly once");
assert.strictEqual(new Set(index).size, index.length, "lesson ids must be unique");

// the simulators learn.js knows: `kind(card) {` inside INTERACTIVES
const learn = fs.readFileSync(path.join(__dirname, "../public/js/learn.js"), "utf8");
const KINDS = new Set([...learn.matchAll(/^ {4}(\w+)\(card\) \{/gm)].map((m) => m[1]));
const TRACKS = ["robotics", "programming", "physics", "engineering", "power", "ai", "math", "info"]; // info: information literacy (I1, I2)
const filled = (v) => (Array.isArray(v) ? v.length > 0 && v.every((x) => typeof x === "string" && x.trim()) : typeof v === "string" && v.trim().length > 0);

for (const id of index) {
  const L = read(id + ".json"), at = `lesson ${id}`;
  assert.strictEqual(L.id, id, `${at}: the id must match the file name`);
  assert(/^[a-z][a-z0-9-]*$/.test(id), `${at}: ids are lowercase words with dashes, starting with a letter (so #lesson-7 still means a number)`);
  assert(TRACKS.includes(L.track), `${at}: unknown track ${L.track}`);
  assert(Number.isInteger(L.episode) && L.episode >= 1, `${at}: episode must be a number`);
  assert.strictEqual(typeof L.core, "boolean", `${at}: core must be true or false`);
  assert(L.minutes > 0 && Array.isArray(L.standards) && Array.isArray(L.missions), `${at}: minutes, standards and missions are required`);
  assert(Array.isArray(L.steps) && L.steps.length, `${at}: needs steps`);
  assert(L.next && (L.next.href || L.next.mission), `${at}: the last card needs a link (href, or a mission once missions exist)`);
  assert(!L.next.href || L.next.href.startsWith("/"), `${at}: next.href must be a site path`);
  for (const mid of L.missions.concat(L.next.mission ? [L.next.mission] : [])) {
    assert(missions.includes(mid), `${at}: there's no mission called ${mid}`);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(__dirname, `../public/data/missions/${mid}.json`), "utf8")).lesson, id, `${at}: mission ${mid} belongs to another lesson`);
  }
  if (L.next.mission) assert.strictEqual(L.next.game, JSON.parse(fs.readFileSync(path.join(__dirname, `../public/data/missions/${L.next.mission}.json`), "utf8")).game, `${at}: next.game must be the mission's game, so the button opens the right page`);
  assert(!L.next.mission || L.missions[0] === L.next.mission, `${at}: the last button opens the first of its missions`);
  for (const tier of Tier.LEVELS) {
    const T = (v) => Tier.text(v, tier), where = `${at} (${tier})`;
    assert(filled(T(L.title)) && filled(T(L.about)) && filled(T(L.next.label)), `${where}: title, about and next.label can't be empty`);
    const steps = L.steps.filter((s) => !s.only || s.only.includes(tier));
    assert(steps.some((s) => s.type === "quiz"), `${where}: every lesson ends with at least one quiz`);
    steps.forEach((s, k) => {
      const here = `${where} step ${k}`;
      if (s.only) assert(s.only.every((t) => Tier.LEVELS.includes(t)), `${here}: unknown tier in only`);
      if (s.type === "read") assert(filled(T(s.html)), `${here}: a read card needs html`);
      else if (s.type === "quiz") {
        const opts = T(s.options), ans = T(s.answer);
        assert(filled(T(s.q)) && filled(T(s.explain)), `${here}: a quiz needs a question and an explanation`);
        assert(Array.isArray(opts) && opts.length >= 2 && filled(opts), `${here}: a quiz needs at least 2 options`);
        assert(Number.isInteger(ans) && ans >= 0 && ans < opts.length, `${here}: the answer must point at one of the options`);
        assert.strictEqual(new Set(opts).size, opts.length, `${here}: options must be different`);
      } else if (s.type === "interactive") assert(KINDS.has(s.kind), `${here}: learn.js has no simulator called ${s.kind}`);
      else assert.fail(`${here}: unknown step type ${s.type}`);
    });
  }
}
// the tier rule the files rely on
assert.strictEqual(Tier.text("same", "cadet"), "same");
assert.strictEqual(Tier.text({ recruit: "r", cadet: "c" }, "cadet"), "c");
assert.strictEqual(Tier.text({ recruit: "r" }, "operative"), "r", "a tier that isn't written falls back to recruit");
assert.deepStrictEqual(Tier.text(["a", "b"], "cadet"), ["a", "b"], "a list is the same for every tier");
console.log(`Lesson tests passed (${index.length} lessons, ${KINDS.size} simulators)`);
