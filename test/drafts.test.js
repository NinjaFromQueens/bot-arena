// The local drafts route (lib/drafts.js, EP1-3): with STORY_DRAFTS it serves a draft episode, its scenes, characters and
// asset list (art generated already plays from the story folder), the scene check and the animatic page; it serves only
// pictures from the story folder, refuses odd scene names, and stays off without STORY_DRAFTS or on Render.
const assert = require("assert");
const path = require("path"), http = require("http");
const express = require("express");
const drafts = require("../lib/drafts.js");

const pub = path.join(__dirname, "../public"), dir = path.join(__dirname, "fixtures/story/draft");
const serve = (env) => new Promise((ok) => { const app = express(); const on = drafts({ app, express, pub, env }); const s = http.createServer(app).listen(0, () => ok({ s, on, base: `http://127.0.0.1:${s.address().port}` })); });

(async () => {
  const off = await serve({});
  assert.strictEqual(off.on, false, "off without STORY_DRAFTS");
  assert.strictEqual((await fetch(off.base + "/animatic")).status, 404, "no animatic without drafts");
  off.s.close();
  const render = await serve({ STORY_DRAFTS: dir, RENDER: "true" });
  assert.strictEqual(render.on, false, "never on Render, even with STORY_DRAFTS");
  render.s.close();

  const { s, on, base } = await serve({ STORY_DRAFTS: dir });
  try {
    assert.strictEqual(on, true, "on with STORY_DRAFTS");
    const json = async (p) => { const r = await fetch(base + p); assert.strictEqual(r.status, 200, p + " answers"); return r.json(); };
    assert.strictEqual((await json("/drafts/episode.json")).id, "ep9", "the draft's episode");
    const ch = await json("/drafts/characters.json");
    assert(ch.tester && ch.sparrow, "the draft's characters on top of the site's");
    const a = (await json("/drafts/assets.json")).assets;
    assert(a.bg_test_place.made && a.bg_test_place.file === "/drafts/art/sample-art.png" && a.bg_test_place.draftArt, "art generated already plays from the story folder");
    assert(!a.char_tester_pose.made, "art not made yet stays a placeholder");
    assert.strictEqual(a.boss_sentinel_intro.kind, "video", "a draft's fields join a listed asset's entry");
    assert.deepStrictEqual((await json("/drafts/check.json")).problems, [], "the scene check runs on the draft");
    assert.strictEqual((await json("/drafts/scenes/ep9-a-brief.json")).id, "ep9-a-brief", "a draft scene");
    for (const bad of ["/drafts/scenes/nope.json", "/drafts/scenes/Ep9.json", "/drafts/scenes/..%2Fdraft.json"]) assert.strictEqual((await fetch(base + bad)).status, 404, "refused: " + bad);
    const img = await fetch(base + "/drafts/art/sample-art.png");
    assert(img.status === 200 && /image\/png/.test(img.headers.get("content-type")), "a picture from the story folder");
    for (const bad of ["/drafts/art/scene-v2.json", "/drafts/art/draft/draft.json", "/drafts/art/../../../package.json", "/drafts/art/%2e%2e/%2e%2e/blog/x.png"]) assert.notStrictEqual((await fetch(base + bad)).status, 200, "only pictures, only from the story folder: " + bad);
    const page = await fetch(base + "/animatic");
    assert(page.status === 200 && /Animatic/.test(await page.text()), "the animatic page");
    console.log("Drafts route tests passed");
  } finally { s.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
