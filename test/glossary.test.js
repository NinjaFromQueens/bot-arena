// The glossary (public/data/glossary.json): one word for each idea across lessons and games (rule L5 of the game standard).
const assert = require("assert");
const fs = require("fs"), path = require("path");
const Tier = require("../public/js/tiers.js");
const pub = path.join(__dirname, "../public");
const G = JSON.parse(fs.readFileSync(path.join(pub, "data/glossary.json"), "utf8"));
const index = JSON.parse(fs.readFileSync(path.join(pub, "data/lessons/index.json"), "utf8"));
const lessonText = {};
for (const id of index) {
  const L = JSON.parse(fs.readFileSync(path.join(pub, `data/lessons/${id}.json`), "utf8"));
  lessonText[id] = JSON.stringify(L.steps).replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/\\n|\s+/g, " ");
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (w) => new RegExp(`(?<![a-z])${esc(w)}(?![a-z])`, "i");

assert(Array.isArray(G) && G.length, "the glossary is a list of terms");
const ids = new Set(), forms = new Map();
for (const g of G) {
  const at = `glossary ${g.id}`;
  assert(/^[a-z][a-z0-9-]*$/.test(g.id) && !ids.has(g.id), `${at}: ids are unique lowercase words with dashes`); ids.add(g.id);
  assert(typeof g.term === "string" && g.term.trim() && Array.isArray(g.forms), `${at}: needs a term and a forms list`);
  for (const t of Tier.LEVELS) assert(typeof Tier.text(g.def, t) === "string" && Tier.text(g.def, t).trim().length > 10, `${at}: needs a definition for ${t}`);
  for (const f of [g.term, ...g.forms]) {
    const k = f.toLowerCase();
    assert(!forms.has(k), `${at}: "${f}" is already a form of ${forms.get(k)}, so its tooltip would be ambiguous`); forms.set(k, g.id);
  }
  if (g.lesson === null) assert(typeof g.planned === "string" && g.planned, `${at}: a term no lesson teaches yet names the planned lesson`);
  else {
    assert(index.includes(g.lesson), `${at}: no lesson called ${g.lesson}`);
    assert([g.term, ...g.forms].some((f) => word(f).test(lessonText[g.lesson])), `${at}: the ${g.lesson} lesson never says "${g.term}" (or its forms)`);
  }
}
// words to avoid never appear on any page, script or lesson (for example "low gear": always "more gearing")
const sources = [
  ...fs.readdirSync(path.join(pub, "js")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f),
  ...fs.readdirSync(pub).filter((f) => f.endsWith(".html")),
  ...index.map((id) => `data/lessons/${id}.json`),
  // blog posts (content/blog, outside public/), drafts too: the blog uses the same words as the lessons
  ...(fs.existsSync(path.join(pub, "../content/blog")) ? fs.readdirSync(path.join(pub, "../content/blog")).filter((f) => f.endsWith(".md")).map((f) => "../content/blog/" + f) : []),
];
const defs = G.map((g) => Tier.LEVELS.map((t) => Tier.text(g.def, t)).join(" ")).join(" ");
for (const g of G) for (const bad of g.avoid || []) {
  assert(!word(bad).test(defs), `the glossary itself says "${bad}"; use "${g.term}"`);
  for (const f of sources) assert(!word(bad).test(fs.readFileSync(path.join(pub, f), "utf8")), `${f} says "${bad}"; the glossary's word is "${g.term}"`);
}
console.log(`Glossary tests passed (${G.length} terms, ${sources.length} files checked for words to avoid)`);
