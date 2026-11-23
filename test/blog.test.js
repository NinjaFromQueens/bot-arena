// The blog (F-52, scripts/build-blog.js): the real posts pass every check and the committed pages are up to date; the
// engine builds every page type with its parts from the sample posts in test/fixtures/blog; and the checks catch the
// mistakes they're meant to catch. Spoilers are checked against docs/blog-spoilers.txt when it's there (it's private).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Blog = require("../scripts/build-blog.js");
const ROOT = path.join(__dirname, ".."), PUB = path.join(ROOT, "public");
const norm = (s) => s.replace(/\r\n/g, "\n");

// 1. the real blog: no problems, and what's on disk is exactly what the posts build
const real = Blog.render();
assert.deepStrictEqual(real.problems, [], "the blog's posts have problems:\n  " + real.problems.join("\n  "));
for (const [rel, text] of Object.entries(real.files)) {
  const f = path.join(PUB, rel);
  assert(fs.existsSync(f) && norm(fs.readFileSync(f, "utf8")) === text, `public/${rel} is out of date: run npm run blog`);
}
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
if (fs.existsSync(path.join(PUB, "blog"))) for (const f of walk(path.join(PUB, "blog"))) {
  const rel = path.relative(PUB, f).replace(/\\/g, "/");
  assert(rel in real.files, `public/${rel} isn't made by any post: run npm run blog`);
}
const sitemap = norm(fs.readFileSync(path.join(PUB, "sitemap.xml"), "utf8"));
assert.strictEqual(sitemap, Blog.sitemapWith(real.config, real.posts, sitemap), "sitemap.xml's blog section is out of date: run npm run blog");
for (const p of real.posts) assert(sitemap.includes(`${real.config.site}/blog/${p.slug}<`), `the sitemap lists ${p.slug}`);
for (const p of real.pictures) assert(fs.existsSync(path.join(PUB, p.to)), `the share picture ${p.to} exists (npm run blog makes it with ffmpeg)`);

// spoilers (all posts, drafts too)
const spoilerFile = path.join(ROOT, "docs/blog-spoilers.txt");
const all = Blog.load(path.join(ROOT, "content/blog")).posts.filter((p) => !p.broken);
if (fs.existsSync(spoilerFile)) {
  const phrases = fs.readFileSync(spoilerFile, "utf8").split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#"));
  for (const p of all) {
    const text = [p.title, p.answer, p.summary, p.alt, p.body, ...(p.faq || []).flatMap((x) => [x.q, x.a])].join("\n").toLowerCase();
    for (const s of phrases) assert(!new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text), `${p.file} gives away a story spoiler: "${s}"`);
  }
}

// 2. the engine, on the sample posts
const fx = Blog.render({ content: path.join(__dirname, "fixtures/blog"), drafts: true });
assert.deepStrictEqual(fx.problems, [], "the sample posts pass the checks");
const F = fx.files, idx = F["blog/index.html"];
const lds = (html) => [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)].map((m) => JSON.parse(m[1]));
assert(idx && /class="bl-hero"/.test(idx), "the front page opens with the featured post");
assert.strictEqual((idx.match(/class="bl-card big"/g) || []).length, 2, "then two featured cards");
const withPosts = fx.config.topics.filter((t) => fx.posts.some((p) => p.topic === t.id));
assert.strictEqual((idx.match(/id="t-[a-z-]+"/g) || []).length, withPosts.length, "then a row for each topic that has posts");
assert(/<link rel="canonical" href="https:\/\/circuitrebels\.org\/blog\/">/.test(idx) && lds(idx)[0]["@graph"].some((g) => g["@type"] === "Blog"), "the front page has its canonical address and Blog markup");
for (const p of fx.posts) {
  const html = F[`blog/${p.slug}.html`];
  assert(html, `${p.slug} has a page`);
  assert(html.includes(`<h1>${p.title.replace(/&/g, "&amp;")}</h1>`), `${p.slug}: the title is the heading`);
  assert(html.includes(`<link rel="canonical" href="https://circuitrebels.org/blog/${p.slug}">`), `${p.slug}: canonical address`);
  assert(html.includes(`content="https://circuitrebels.org/img/blog/og/${p.slug}.jpg"`), `${p.slug}: its share picture`);
  assert(/class="bl-answer"/.test(html) && html.indexOf("bl-answer") < html.indexOf("bl-body"), `${p.slug}: the quick answer comes before the body`);
  assert(/class="bl-try"/.test(html) && /class="bl-tryitem" href="\//.test(html), `${p.slug}: a Try it free card with links`);
  const graph = lds(html)[0]["@graph"], faq = graph.find((g) => g["@type"] === "FAQPage");
  assert(graph.find((g) => g["@type"] === "BlogPosting" && g.headline === p.title && g.author.name === fx.config.author.name), `${p.slug}: BlogPosting markup with the author`);
  assert(graph.find((g) => g["@type"] === "BreadcrumbList"), `${p.slug}: breadcrumb markup`);
  const shown = [...html.matchAll(/<h3>(.*?)<\/h3>\n\s*<p>(.*?)<\/p>/g)].map((m) => [m[1], m[2]]);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  assert.deepStrictEqual(shown, faq.mainEntity.map((q) => [esc(q.name), esc(q.acceptedAnswer.text)]), `${p.slug}: the questions shown match the FAQ markup word for word`);
}
assert(fx.posts.every((p) => F["blog/feed.xml"].includes(`<link>https://circuitrebels.org/blog/${p.slug}</link>`)), "the feed lists every post");
assert(F["llms.txt"].startsWith("# Circuit Rebels\n\n> " + fx.config.facts) && /## Blog/.test(F["llms.txt"]), "llms.txt starts with the facts and lists the blog");
assert(/\d+ five-minute lessons/.test(F["llms.txt"]), "llms.txt counts the lessons from the lesson files");
const mission = F["blog/gear-ratios-robot-race.html"];
assert(mission.includes('href="/race?mission=gear-hill"') && mission.includes('href="/learn#lesson-dcmotor"'), "a mission and a lesson link to their pages");

// 3. the checks catch mistakes
const bad = Blog.load(path.join(__dirname, "fixtures/blog"));
const p0 = bad.posts[0];
Object.assign(p0, { answer: "Too short.", summary: "x".repeat(200), try: { lesson: "no-such-lesson" }, related: ["no-such-post"], faq: [{ q: "Only one?" }], body: "# A heading\n\nshort" });
const found = Blog.check(bad).join("\n");
for (const want of ["quick answer is 2 words", "summary is 200 characters", 'no lesson "no-such-lesson"', 'related post "no-such-post"', "faq needs 3-6 items", "body is too short", "own top heading"])
  assert(found.includes(want), `the checks catch: ${want}`);

console.log(`Blog tests passed (${real.posts.length} published post${real.posts.length === 1 ? "" : "s"}; engine checked on ${fx.posts.length} samples${fs.existsSync(spoilerFile) ? "; spoilers checked" : ""})`);
