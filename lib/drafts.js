// Story drafts on this computer (EP1-3): STORY_DRAFTS=<a draft folder> (for example ../bot-arena-v2/art-work/story/ep1)
// serves a private draft episode under /drafts/ and its animatic at /animatic, so a locked script can be watched with the
// story player, the browser's voice, the art that already exists and placeholders for the rest, before anything is paid
// for (docs/story-media-plan.md, production step 4). Never on Render: drafts are spoilers and stay off the live site and
// out of the public repo. Files are read on every request, so an edited scene shows on the next refresh.
const fs = require("fs"), path = require("path");
const Story = require("../public/js/story.js");

module.exports = function drafts({ app, express, pub, env = process.env }) {
  if (!env.STORY_DRAFTS || env.RENDER) return false;
  const root = path.resolve(env.STORY_DRAFTS), story = path.dirname(root); // the draft folder, and the story folder that holds its art
  const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  const draft = () => read(path.join(root, "draft.json"));
  const scenes = () => Object.fromEntries(fs.readdirSync(path.join(root, "scenes")).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), read(path.join(root, "scenes", f))]));
  const characters = () => ({ ...read(path.join(pub, "data/characters.json")), ...(draft().characters || {}) });
  const exists = (p) => (p.startsWith("/drafts/art/") ? fs.existsSync(path.join(story, decodeURIComponent(p.slice(12)))) : fs.existsSync(path.join(pub, p)));
  // the asset list with the draft's entries; art generated already (a source file in the story folder) plays from there
  function assets() {
    const a = { ...read(path.join(pub, "assets/story-assets.json")).assets };
    for (const [id, d] of Object.entries(draft().assets || {})) {
      a[id] = { ...(a[id] || {}), ...d };
      if (!a[id].made && d.source && fs.existsSync(path.join(story, d.source))) a[id] = { ...a[id], made: true, file: "/drafts/art/" + d.source.split("/").map(encodeURIComponent).join("/"), draftArt: true };
    }
    return a;
  }
  const send = (fn) => (_req, res) => { try { res.json(fn()); } catch (e) { res.status(500).json({ error: e.message }); } };
  app.get("/drafts/episode.json", send(() => draft().episode));
  app.get("/drafts/characters.json", send(characters));
  app.get("/drafts/assets.json", send(() => ({ assets: assets() })));
  app.get("/drafts/check.json", send(() => ({ problems: Story.check({ episodes: [], scenes: scenes(), characters: characters(), rewards: [] }, { lessons: [], missions: {}, exists, assets: assets() }) })));
  app.get("/drafts/scenes/:id.json", (req, res) => {
    const f = path.join(root, "scenes", req.params.id + ".json");
    if (!/^[a-z0-9-]+$/.test(req.params.id) || !fs.existsSync(f)) return res.status(404).json({ error: "no such draft scene" });
    res.json(read(f));
  });
  // only pictures from the story folder (the bible and outlines live there too, and aren't served)
  app.use("/drafts/art", (req, res, next) => (/\.(png|jpe?g|webp)$/i.test(req.path) ? next() : res.status(404).end()), express.static(story, { index: false, dotfiles: "deny", fallthrough: false }));
  app.get("/animatic", (_req, res) => res.sendFile(path.join(__dirname, "animatic.html")));
  return true;
};
