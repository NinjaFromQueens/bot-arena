#!/usr/bin/env node
/* The blog (F-52, docs/blog-plan.md): a learning library for teachers that search engines and AI assistants can read.
 *
 *   npm run blog                       build public/blog/ from content/blog/ (published posts only)
 *   node scripts/build-blog.js --content <dir> --out <dir> --drafts     a preview of other posts (fixtures, drafts)
 *
 * Posts are content/blog/<slug>.md: a JSON header between two "---" lines, then Markdown. Settings (topics, the author,
 * the facts sentence, featured posts, the key pages for llms.txt) are content/blog/blog.json. The output is plain HTML,
 * readable with JavaScript off: /blog/ (a featured post, two featured cards, a row per topic), /blog/<slug>,
 * /blog/topic/<id>, /blog/feed.xml, a 1200x630 share picture per post (/img/blog/og/<slug>.jpg, made with ffmpeg when
 * the post's picture is newer), the blog part of sitemap.xml, and /llms.txt. It's committed like the offline copies;
 * test/blog.test.js fails if it's out of date. With no published posts, no blog pages are written. */
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const { marked } = require("marked");
const ROOT = path.join(__dirname, ".."), PUB = path.join(ROOT, "public");

// ---------------- loading and checking ----------------
const HEADER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
function load(dir) {
  const config = JSON.parse(fs.readFileSync(path.join(dir, "blog.json"), "utf8"));
  const posts = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => {
    const text = fs.readFileSync(path.join(dir, f), "utf8"), m = text.match(HEADER);
    if (!m) return { file: f, broken: "no JSON header between --- lines" };
    let head; try { head = JSON.parse(m[1]); } catch (e) { return { file: f, broken: "the header isn't valid JSON: " + e.message }; }
    return { file: f, ...head, body: m[2].trim() };
  });
  return { config, posts };
}
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const lessonIds = () => JSON.parse(fs.readFileSync(path.join(PUB, "data/lessons/index.json"), "utf8"));
const lessonOf = (id) => JSON.parse(fs.readFileSync(path.join(PUB, `data/lessons/${id}.json`), "utf8"));
const missionIds = () => JSON.parse(fs.readFileSync(path.join(PUB, "data/missions/index.json"), "utf8"));
const missionOf = (id) => JSON.parse(fs.readFileSync(path.join(PUB, `data/missions/${id}.json`), "utf8"));
const recruit = (v) => (v && typeof v === "object" ? v.recruit : v);
// the games a post can send readers to
const GAMES = {
  practice: { href: "/practice", name: "Bot Arena", about: "Build a robot from parts that sense, think and act, then battle it." },
  challenges: { href: "/practice#challenges", name: "Brain Challenges", about: "Program a robot's brain with if-then rules and beat the bosses." },
  race: { href: "/race", name: "Robot Racer", about: "Pick the gear ratio and tires for each track, then race the clock." },
  lab: { href: "/lab", name: "Flying Car Lab", about: "Design a flying car and fly missions about thrust, weight and landing." },
  speedrun: { href: "/lab#speedrun", name: "Speed Run", about: "Solve flying car math problems against the clock." },
  map: { href: "/map", name: "The story map", about: "Play the story's missions, episode by episode." },
  host: { href: "/host", name: "Host a class game", about: "Put the board on the projector and run a class game with a join code." },
};
const MISSION_PAGE = { racer: (id) => `/race?mission=${id}`, lab: (id) => `/lab?mission=${id}`, challenge: (id) => `/practice?mission=${id}#challenges` };
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/, DATE = /^\d{4}-\d{2}-\d{2}$/;

function check({ config, posts }) {
  const problems = [], topics = new Set(config.topics.map((t) => t.id)), slugs = new Set(), lessons = new Set(lessonIds()), missions = new Set(missionIds());
  for (const p of posts) {
    const at = p.file;
    if (p.broken) { problems.push(`${at}: ${p.broken}`); continue; }
    const need = ["slug", "title", "answer", "summary", "topic", "date", "updated", "image", "alt", "status"];
    for (const k of need) if (!p[k]) problems.push(`${at}: missing "${k}"`);
    if (p.slug && !SLUG.test(p.slug)) problems.push(`${at}: the slug "${p.slug}" should be lowercase words joined by hyphens`);
    if (p.slug && p.file !== p.slug + ".md") problems.push(`${at}: the file should be named ${p.slug}.md`);
    if (slugs.has(p.slug)) problems.push(`${at}: the slug "${p.slug}" is used twice`); slugs.add(p.slug);
    if (p.topic && !topics.has(p.topic)) problems.push(`${at}: unknown topic "${p.topic}"`);
    if (!["draft", "published"].includes(p.status)) problems.push(`${at}: status must be draft or published`);
    for (const k of ["date", "updated"]) if (p[k] && !DATE.test(p[k])) problems.push(`${at}: ${k} must look like 2026-12-01`);
    if (p.date && p.updated && p.updated < p.date) problems.push(`${at}: updated is before date`);
    const aw = words(p.answer); if (p.answer && (aw < 40 || aw > 60)) problems.push(`${at}: the quick answer is ${aw} words (40-60)`);
    if (p.summary && p.summary.length > 155) problems.push(`${at}: the summary is ${p.summary.length} characters (up to 155)`);
    if (p.title && p.title.length > 70) problems.push(`${at}: the title is ${p.title.length} characters (up to 70, so search results show it whole)`);
    if (p.image && !fs.existsSync(path.join(PUB, p.image))) problems.push(`${at}: the picture ${p.image} doesn't exist`);
    const t = p.try || {};
    if (!t.lesson && !t.game && !t.mission) problems.push(`${at}: "try" needs a lesson, game or mission`);
    for (const id of [].concat(t.lesson || [])) if (!lessons.has(id)) problems.push(`${at}: no lesson "${id}"`);
    for (const id of [].concat(t.game || [])) if (!GAMES[id]) problems.push(`${at}: no game "${id}" (known: ${Object.keys(GAMES).join(", ")})`);
    for (const id of [].concat(t.mission || [])) if (!missions.has(id)) problems.push(`${at}: no mission "${id}"`);
    if (!Array.isArray(p.faq) || p.faq.length < 3 || p.faq.length > 6 || p.faq.some((x) => !x.q || !x.a)) problems.push(`${at}: faq needs 3-6 items, each with q and a`);
    if (!Array.isArray(p.facts)) problems.push(`${at}: "facts" lists each number in the post with its source (an empty list if none)`);
    else for (const f of p.facts) if (!f.claim || !f.source) problems.push(`${at}: each fact needs a claim and a source`);
    if (!p.body || words(p.body) < 150) problems.push(`${at}: the body is too short (${words(p.body)} words)`);
    if (/^#\s/m.test(p.body || "")) problems.push(`${at}: the body shouldn't have its own top heading (# ...): the title is the heading`);
  }
  for (const p of posts) for (const r of p.related || []) if (!slugs.has(r)) problems.push(`${p.file}: related post "${r}" doesn't exist`);
  for (const s of config.featured || []) if (!slugs.has(s)) problems.push(`blog.json: featured post "${s}" doesn't exist`);
  return problems;
}

// ---------------- pieces ----------------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const nice = (d) => { const [y, m, day] = d.split("-").map(Number); return `${MONTHS[m - 1]} ${day}, ${y}`; };
const rfc822 = (d) => new Date(d + "T12:00:00Z").toUTCString();
const ld = (o) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2).replace(/</g, "\\u003c")}\n</script>`;
const postUrl = (site, p) => `${site}/blog/${p.slug}`;
const ogPath = (p) => `/img/blog/og/${p.slug}.jpg`;
const minutes = (p) => Math.max(1, Math.round((words(p.body) + words(p.answer) + p.faq.reduce((n, x) => n + words(x.q) + words(x.a), 0)) / 200));

function org(config) {
  return { "@type": "Organization", "@id": `${config.site}/#org`, name: "Circuit Rebels", url: `${config.site}/`, logo: `${config.site}/img/logo.svg`, email: "hello@circuitrebels.org", description: config.facts,
    founder: { "@type": "Person", name: config.author.name },
    sameAs: ["https://www.linkedin.com/company/circuit-rebels/", "https://www.facebook.com/circuitrebels1", "https://www.instagram.com/circuitrebels/"] };
}
function page(config, o) {
  o.year = o.year || (config.latest || "2026").slice(0, 4); // from the newest post, so the output doesn't change with the clock
  return `<!doctype html>
<html lang="en" class="hp-html">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${o.canonical}">
<meta property="og:type" content="${o.ogType || "website"}">
<meta property="og:site_name" content="Circuit Rebels">
<meta property="og:url" content="${o.canonical}">
<meta property="og:title" content="${esc(o.ogTitle || o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:image" content="${o.ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(o.ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1b1a1e">
${o.extraHead || ""}<link rel="icon" href="/img/logo.svg">
<link rel="alternate" type="application/rss+xml" title="${esc(config.name)}" href="/blog/feed.xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap">
<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="/css/home.css">
<link rel="stylesheet" href="/css/blog.css">
${ld(o.jsonld)}
</head>
<body data-page="blog" class="hp">
<a class="hp-skip" href="#main">Skip to the page</a>
<header class="hp-nav">
  <div class="hp-in hp-nav-in">
    <a class="hp-brand" href="/"><img src="/img/logo.svg" width="36" height="36" alt="">Circuit Rebels</a>
    <nav class="hp-links" aria-label="Site">
      <a href="/map" data-tip="The Neo Harbor story map: play the story's missions, episode by episode.">Story</a>
      <a href="/learn" data-tip="Short lessons you can do on your own. Each one has something to try.">Learn</a>
      <a href="/#games" data-tip="Bot Arena, Robot Racer and the Flying Car Lab.">Games</a>
      <a href="/#schools" data-tip="For teachers and program leaders: how it runs in class, hosting a game, and the spring pilot.">For Schools</a>
      <a href="/blog/"${o.here === "blog" ? ' aria-current="page"' : ""} data-tip="Articles for teachers about how robots sense, think and act, and how to teach it.">Blog</a>
      <a href="/#about" data-tip="Who makes Circuit Rebels, and how to reach us.">About</a>
    </nav>
    <a class="btn" href="/#joinform" data-tip="Type the code from your teacher's board to join the class game.">Join a game</a>
  </div>
</header>
<main id="main" class="bl">
${o.body}
</main>
<section class="bl-cta" aria-label="Try Circuit Rebels">
  <div class="hp-in">
    <div><p class="hp-kicker">Free for every class</p><h2>Try it with your students</h2><p class="hp-soft">${esc(config.facts)}</p></div>
    <div class="bl-ctabtns"><a class="btn big" href="/host" data-tip="Opens the teacher's board with a join code.">Host a class</a><a class="btn big ghost" href="/learn" data-tip="Open the free lessons. Each one takes about 5 minutes.">See the lessons</a></div>
  </div>
</section>
<footer class="hp-foot" id="about">
  <div class="hp-in">
    <div class="hp-footcols">
      <div>
        <b>Circuit Rebels</b>
        <p>Circuit Rebels is a free, browser-based robotics program for grades 5 to 8. It is made in New York City by Duron Epps, a CUNY York College alumnus who teaches robotics on Saturdays.</p>
        <p><a href="mailto:hello@circuitrebels.org" data-tip="Opens an email to hello@circuitrebels.org.">hello@circuitrebels.org</a></p>
      </div>
      <div>
        <h3>Play</h3>
        <a href="/#joinform">Join a game</a>
        <a href="/host">Host a game</a>
        <a href="/practice">Bot Arena</a>
        <a href="/race">Robot Racer</a>
        <a href="/lab">Flying Car Lab</a>
      </div>
      <div>
        <h3>Learn</h3>
        <a href="/learn">Lessons</a>
        <a href="/blog/">Blog</a>
        <a href="/map">Story map</a>
        <a href="/tour">The trailer</a>
      </div>
      <div>
        <h3>Schools</h3>
        <a href="/#schools">For schools</a>
        <a href="/#pilot">Founding Programs</a>
        <a href="/host">Host on the board</a>
      </div>
      <div>
        <h3>Follow</h3>
        <a href="https://www.linkedin.com/company/circuit-rebels/" target="_blank" rel="noopener" data-tip="Follow Circuit Rebels on LinkedIn. Opens in a new tab.">LinkedIn</a>
        <a href="https://www.facebook.com/circuitrebels1" target="_blank" rel="noopener" data-tip="Follow Circuit Rebels on Facebook. Opens in a new tab.">Facebook</a>
        <a href="https://www.instagram.com/circuitrebels/" target="_blank" rel="noopener" data-tip="Follow Circuit Rebels on Instagram. Opens in a new tab.">Instagram</a>
        <a href="/blog/feed.xml" data-tip="New posts in your feed reader (RSS).">RSS feed</a>
      </div>
    </div>
    <div class="hp-fine">
      <span>© ${o.year} Circuit Rebels. Made in New York City.</span>
      <span>Story mode and the new labs are in development and may change before launch.</span>
    </div>
  </div>
</footer>
<script src="/js/tips.js"></script>
</body>
</html>
`;
}
const byline = (config, p) => `By ${esc(config.author.name)} | ${nice(p.date)}`;
function card(config, p, o = {}) {
  const img = `<a class="bl-pic" href="/blog/${p.slug}" tabindex="-1" aria-hidden="true"><img src="${p.image}" alt="" loading="${o.eager ? "eager" : "lazy"}" decoding="async" width="1200" height="675"></a>`;
  return `<article class="bl-card${o.big ? " big" : ""}">${img}<h3><a href="/blog/${p.slug}">${esc(p.title)}</a></h3>${o.summary ? `<p class="bl-sum">${esc(p.summary)}</p>` : ""}<p class="bl-by">${byline(config, p)}</p></article>`;
}
function tryCard(p) {
  const t = p.try || {}, items = [];
  for (const id of [].concat(t.lesson || [])) { const l = lessonOf(id); items.push({ href: `/learn#lesson-${id}`, kind: "Lesson", name: recruit(l.title), about: recruit(l.about) }); }
  for (const id of [].concat(t.mission || [])) { const m = missionOf(id); items.push({ href: MISSION_PAGE[m.game](id), kind: "Mission", name: recruit(m.title), about: recruit((m.tiers && m.tiers.recruit && m.tiers.recruit.question) || "") }); }
  for (const id of [].concat(t.game || [])) { const g = GAMES[id]; items.push({ href: g.href, kind: "Game", name: g.name, about: g.about }); }
  return `<aside class="bl-try" aria-label="Try it free"><p class="hp-kicker">Try it free</p><div class="bl-tries">${items.map((i) => `<a class="bl-tryitem" href="${i.href}" data-tip="${esc(i.kind + ": " + i.name)}"><span class="k">${i.kind}</span><b>${esc(i.name)}</b>${i.about ? `<span class="a">${esc(i.about)}</span>` : ""}</a>`).join("")}</div></aside>`;
}

// ---------------- the pages ----------------
function postPage(config, p, all) {
  const url = postUrl(config.site, p), topic = config.topics.find((t) => t.id === p.topic);
  const related = (p.related || []).map((s) => all.find((x) => x.slug === s)).filter(Boolean)
    .concat(all.filter((x) => x.slug !== p.slug && x.topic === p.topic && !(p.related || []).includes(x.slug))).slice(0, 3);
  const body = `<article class="hp-in bl-post">
  <nav class="bl-crumb" aria-label="Breadcrumb"><a href="/blog/">Blog</a> <span aria-hidden="true">›</span> <a href="/blog/topic/${topic.id}">${esc(topic.name)}</a></nav>
  <h1>${esc(p.title)}</h1>
  <p class="bl-by">By <a href="#author">${esc(config.author.name)}</a> · <time datetime="${p.date}">${nice(p.date)}</time>${p.updated !== p.date ? ` · Updated <time datetime="${p.updated}">${nice(p.updated)}</time>` : ""} · ${minutes(p)} min read</p>
  <img class="bl-hero-img" src="${p.image}" alt="${esc(p.alt)}" width="1200" height="675" decoding="async">
  <div class="bl-answer"><p class="hp-kicker">Quick answer</p><p>${esc(p.answer)}</p></div>
  <div class="bl-body">
${marked.parse(p.body)}
  </div>
  ${tryCard(p)}
  <section class="bl-faq" aria-labelledby="faq-h"><h2 id="faq-h">Questions and answers</h2>
${p.faq.map((x) => `    <h3>${esc(x.q)}</h3>\n    <p>${esc(x.a)}</p>`).join("\n")}
  </section>
  <aside class="bl-author" id="author"><img src="/img/logo.svg" width="56" height="56" alt=""><div><b>${esc(config.author.name)}</b><span>${esc(config.author.role)}</span><p>${esc(config.author.bio)}</p></div></aside>
</article>
${related.length ? `<section class="hp-in bl-sec" aria-labelledby="more-h"><h2 class="bl-h" id="more-h">Keep reading</h2><div class="bl-three">${related.map((r) => card(config, r)).join("")}</div></section>` : ""}`;
  const jsonld = { "@context": "https://schema.org", "@graph": [
    { "@type": "BlogPosting", "@id": `${url}#post`, headline: p.title, description: p.summary, abstract: p.answer, image: [`${config.site}${ogPath(p)}`],
      datePublished: p.date, dateModified: p.updated, inLanguage: "en", articleSection: topic.name, wordCount: words(p.body),
      author: { "@type": "Person", name: config.author.name, url: `${config.site}/#about`, jobTitle: config.author.role }, publisher: { "@id": `${config.site}/#org` }, mainEntityOfPage: url },
    { "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: p.faq.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Blog", item: `${config.site}/blog/` },
      { "@type": "ListItem", position: 2, name: topic.name, item: `${config.site}/blog/topic/${topic.id}` },
      { "@type": "ListItem", position: 3, name: p.title, item: url }] },
    org(config)] };
  return page(config, { title: `${p.title} | Circuit Rebels`, ogTitle: p.title, description: p.summary, canonical: url, ogType: "article", ogImage: `${config.site}${ogPath(p)}`, ogAlt: p.alt, jsonld, body,
    extraHead: `<meta property="article:published_time" content="${p.date}">\n<meta property="article:modified_time" content="${p.updated}">\n<meta property="article:section" content="${esc(topic.name)}">\n<meta name="author" content="${esc(config.author.name)}">\n` });
}
function indexPage(config, posts) {
  const pinned = (config.featured || []).map((s) => posts.find((p) => p.slug === s)).filter(Boolean);
  const order = pinned.concat(posts.filter((p) => !pinned.includes(p))), hero = order[0], two = order.slice(1, 3);
  const rows = config.topics.map((t) => ({ t, list: posts.filter((p) => p.topic === t.id) })).filter((r) => r.list.length);
  const body = `<section class="bl-hero" aria-label="Featured post">
  <img src="${hero.image}" alt="" width="1200" height="675" fetchpriority="high">
  <div class="hp-in"><div class="bl-hero-text">
    <p class="hp-kicker gold">${esc(config.topics.find((t) => t.id === hero.topic).name)}</p>
    <h1><a href="/blog/${hero.slug}">${esc(hero.title)}</a></h1>
    <p>${esc(hero.summary)}</p>
    <a class="btn big" href="/blog/${hero.slug}" data-tip="Read the featured post.">Read now</a>
  </div></div>
</section>
<div class="hp-in">
${two.length ? `  <section class="bl-sec" aria-labelledby="feat-h"><h2 class="bl-h" id="feat-h">Featured posts</h2><div class="bl-two">${two.map((p) => card(config, p, { summary: true, big: true, eager: true })).join("")}</div></section>` : ""}
${rows.map(({ t, list }) => `  <section class="bl-sec" aria-labelledby="t-${t.id}"><div class="bl-rowhead"><h2 class="bl-h" id="t-${t.id}">${esc(t.name)}</h2>${list.length > 3 ? `<a class="hp-more" href="/blog/topic/${t.id}" data-tip="Every post in ${esc(t.name)}.">See all</a>` : ""}</div><p class="bl-blurb">${esc(t.blurb)}</p><div class="bl-three">${list.slice(0, 3).map((p) => card(config, p)).join("")}</div></section>`).join("\n")}
</div>`;
  const jsonld = { "@context": "https://schema.org", "@graph": [
    { "@type": "Blog", "@id": `${config.site}/blog/#blog`, name: config.name, description: config.description, url: `${config.site}/blog/`, publisher: { "@id": `${config.site}/#org` },
      blogPost: posts.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: postUrl(config.site, p), datePublished: p.date, dateModified: p.updated })) },
    org(config)] };
  return page(config, { title: `${config.name}: teaching robotics with free lessons and games`, description: config.description, canonical: `${config.site}/blog/`, ogImage: `${config.site}${ogPath(hero)}`, ogAlt: hero.alt, jsonld, body, here: "blog" });
}
function topicPage(config, t, posts) {
  const list = posts.filter((p) => p.topic === t.id), url = `${config.site}/blog/topic/${t.id}`;
  const body = `<div class="hp-in bl-topic">
  <nav class="bl-crumb" aria-label="Breadcrumb"><a href="/blog/">Blog</a> <span aria-hidden="true">›</span> ${esc(t.name)}</nav>
  <h1>${esc(t.name)}</h1><p class="bl-blurb">${esc(t.blurb)}</p>
  <div class="bl-three">${list.map((p) => card(config, p, { summary: true })).join("")}</div>
</div>`;
  const jsonld = { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", "@id": `${url}#page`, name: `${t.name} | ${config.name}`, description: t.blurb, url, isPartOf: { "@id": `${config.site}/blog/#blog` } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Blog", item: `${config.site}/blog/` }, { "@type": "ListItem", position: 2, name: t.name, item: url }] },
    org(config)] };
  return page(config, { title: `${t.name} | ${config.name}`, description: t.blurb, canonical: url, ogImage: `${config.site}${ogPath(list[0])}`, ogAlt: list[0].alt, jsonld, body, here: "blog" });
}
function feed(config, posts) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(config.name)}</title>
  <link>${config.site}/blog/</link>
  <atom:link href="${config.site}/blog/feed.xml" rel="self" type="application/rss+xml"/>
  <description>${esc(config.description)}</description>
  <language>en</language>
  <lastBuildDate>${rfc822(posts.map((p) => p.updated).sort().pop())}</lastBuildDate>
${posts.map((p) => `  <item>
    <title>${esc(p.title)}</title>
    <link>${postUrl(config.site, p)}</link>
    <guid isPermaLink="true">${postUrl(config.site, p)}</guid>
    <pubDate>${rfc822(p.date)}</pubDate>
    <category>${esc(config.topics.find((t) => t.id === p.topic).name)}</category>
    <description>${esc(p.answer)}</description>
  </item>`).join("\n")}
</channel>
</rss>
`;
}
function llms(config, posts) {
  const n = lessonIds().length, line = (name, url, about) => `- [${name}](${url}): ${about}`;
  return `# Circuit Rebels

> ${config.facts}

## Key pages

${config.pages.map((p) => line(p.name, config.site + p.path, p.about.replace("{lessons}", n))).join("\n")}
${posts.length ? `\n## Blog\n\n${line(config.name, `${config.site}/blog/`, config.description)}\n${posts.map((p) => line(p.title, postUrl(config.site, p), p.summary)).join("\n")}\n` : ""}
## Contact

- Email: hello@circuitrebels.org
`;
}
function sitemapWith(config, posts, current) {
  const START = "  <!-- blog: written by npm run blog -->", END = "  <!-- /blog -->";
  const lines = posts.length ? [`  <url><loc>${config.site}/blog/</loc><lastmod>${posts.map((p) => p.updated).sort().pop()}</lastmod></url>`,
    ...config.topics.filter((t) => posts.some((p) => p.topic === t.id)).map((t) => `  <url><loc>${config.site}/blog/topic/${t.id}</loc></url>`),
    ...posts.map((p) => `  <url><loc>${postUrl(config.site, p)}</loc><lastmod>${p.updated}</lastmod></url>`)] : [];
  const block = [START, ...lines, END].join("\n");
  const s = current.replace(/\r\n/g, "\n");
  if (s.includes(START)) return s.replace(new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), block);
  return s.replace("</urlset>", block + "\n</urlset>");
}

// ---------------- building ----------------
// everything the blog writes, as { "path under the out folder": text }; share pictures are listed in `pictures`
function render({ content = path.join(ROOT, "content/blog"), drafts = false } = {}) {
  const data = load(content), problems = check(data);
  const posts = data.posts.filter((p) => !p.broken && (drafts || p.status === "published")).sort((a, b) => (b.date + b.slug).localeCompare(a.date + a.slug));
  const files = {}, config = { ...data.config, latest: posts.map((p) => p.updated).sort().pop() };
  if (posts.length && !problems.length) {
    files["blog/index.html"] = indexPage(config, posts);
    for (const p of posts) files[`blog/${p.slug}.html`] = postPage(config, p, posts);
    for (const t of config.topics) if (posts.some((p) => p.topic === t.id)) files[`blog/topic/${t.id}.html`] = topicPage(config, t, posts);
    files["blog/feed.xml"] = feed(config, posts);
  }
  files["llms.txt"] = llms(config, problems.length ? [] : posts);
  return { files, posts, problems, config, pictures: posts.map((p) => ({ from: p.image, to: ogPath(p) })) };
}
function sharePicture(out, from, to) { // 1200x630, the post's picture cropped to fill, as JPEG (every platform reads it)
  const src = path.join(PUB, from), dst = path.join(out, to);
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) return "kept";
  const FF = require("./media.js").FF;
  if (!FF) return "no ffmpeg";
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const r = spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vf", "scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630", "-q:v", "3", dst]);
  return r.status === 0 ? "made" : "failed";
}
function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const content = arg("--content") ? path.resolve(arg("--content")) : path.join(ROOT, "content/blog"), out = arg("--out") ? path.resolve(arg("--out")) : PUB;
  const r = render({ content, drafts: argv.includes("--drafts") });
  if (r.problems.length) { console.log("The blog has problems, so nothing was written:\n  " + r.problems.join("\n  ")); return 1; }
  fs.rmSync(path.join(out, "blog"), { recursive: true, force: true }); // the build owns /blog
  for (const [rel, text] of Object.entries(r.files)) { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
  if (out === PUB) {
    const sm = path.join(PUB, "sitemap.xml"); fs.writeFileSync(sm, sitemapWith(r.config, r.posts, fs.readFileSync(sm, "utf8")));
    const keep = new Set(r.pictures.map((p) => path.basename(p.to))), ogDir = path.join(PUB, "img/blog/og");
    if (fs.existsSync(ogDir)) for (const f of fs.readdirSync(ogDir)) if (!keep.has(f)) fs.unlinkSync(path.join(ogDir, f));
    if (fs.existsSync(ogDir) && !fs.readdirSync(ogDir).length) fs.rmdirSync(ogDir); // only the share pictures' folder: post pictures live in img/blog too
  }
  const made = r.pictures.map((p) => `${p.to} (${sharePicture(out, p.from, p.to)})`);
  console.log(`${r.posts.length} post${r.posts.length === 1 ? "" : "s"}${out === PUB ? "" : " (preview in " + out + ")"}: ${Object.keys(r.files).length} files${made.length ? "; share pictures: " + made.join(", ") : ""}`);
  return 0;
}
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { load, check, render, sitemapWith, GAMES };
