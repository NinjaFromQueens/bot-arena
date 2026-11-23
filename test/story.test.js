// Story mode (docs/platform-flow-spec.md): every episode, scene, character and reward file is well-formed and every
// link between them and the lessons and missions exists (art and sound by path or by asset ID, in the story player's
// scene format, with a sample scene that uses all of it); Volt only beeps before Episode 2's end; and the step rules
// say the right thing for sample saved data (nothing done, a lesson finished last week, one Build goal, the mission's
// goal, the class moving past a step, a finished mission unlocking the next).
const assert = require("assert");
const fs = require("fs"), path = require("path");
const Story = require("../public/js/story.js");

const pub = path.join(__dirname, "../public"), data = path.join(pub, "data");
const json = (f) => JSON.parse(fs.readFileSync(path.join(data, f), "utf8"));
const epIndex = json("episodes/index.json");
const epFiles = fs.readdirSync(path.join(data, "episodes")).filter((f) => f !== "index.json").map((f) => f.slice(0, -5));
assert.deepStrictEqual([...epFiles].sort(), [...epIndex].sort(), "episodes/index.json must list every episode file exactly once");
const episodes = epIndex.map((id) => json(`episodes/${id}.json`));
assert.deepStrictEqual(episodes.map((e) => e.num), [...episodes.map((e) => e.num)].sort((a, b) => a - b), "episodes are listed in story order");
const scenes = Object.fromEntries(fs.readdirSync(path.join(data, "scenes")).map((f) => [f.slice(0, -5), json(`scenes/${f}`)]));
const characters = json("characters.json"), rewards = json("rewards.json");
const lessons = json("lessons/index.json");
const missions = Object.fromEntries(json("missions/index.json").map((id) => { const m = json(`missions/${id}.json`); return [id, { game: m.game, lesson: m.lesson }]; }));
const exists = (p) => fs.existsSync(path.join(pub, p));
const assets = JSON.parse(fs.readFileSync(path.join(pub, "assets/story-assets.json"), "utf8")).assets;

// every file and every link
assert.deepStrictEqual(Story.check({ episodes, scenes, characters, rewards }, { lessons, missions, exists, assets }), [], "the story files have problems");
// the sample scene uses every part of the scene format (shots, moves, layers, the camera look, clips made and not,
// asset IDs, narration, Volt's beeps, voice per level, cues, music changes) and passes
const demoAssets = { ...assets, key_demo_not_made: { file: "/assets/scenes/demo.webp", kind: "image", made: false } }; // a picture in the list that isn't made yet
const demo = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/story/scene-v2.json"), "utf8"));
assert.deepStrictEqual(Story.check({ episodes: [], scenes: { "demo-v2": demo }, characters, rewards: [] }, { lessons, missions, exists, assets: demoAssets }), [], "the sample scene passes");
const bad = JSON.parse(JSON.stringify(demo));
bad.shots[0].move = "spin"; bad.shots[1].art = "bg_nope"; bad.shots[2].kind = "gif"; bad.shots[4].art = "bg_workshop"; bad.shots[3].layers = "x";
bad.lines[0].who = "sparrow"; bad.lines[1].kind = "beeps"; bad.lines[2].feel = "angry"; bad.lines[3].shot = 6; bad.lines[4].id = "demo-01";
bad.lines[5].voice = { teacher: "/assets/audio/voice2/L01.mp3" }; bad.lines[6].sfx = "/assets/audio/sfx/beep.mp3"; bad.bg = "/assets/scenes/arena.webp";
const caught = Story.check({ episodes: [], scenes: { "demo-v2": bad }, characters, rewards: [] }, { lessons, missions, exists, assets: demoAssets });
for (const want of [/move is push/, /no asset bg_nope/, /kind must be still or video/, /bg_workshop is an image, not a video/, /layers are a list/, /narration has no speaker/,
  /only Volt beeps/, /feel is for Volt/, /0 to 5/, /demo-01 is used twice/, /voice levels/, /sfx is a list/, /shots or bg, not both/]) assert(caught.some((s) => want.test(s)), "the scene check catches: " + want);
// the check really catches mistakes
const broken = JSON.parse(JSON.stringify({ episodes, scenes, characters, rewards }));
broken.episodes[0].missions[0].discover.lesson = "nope"; broken.episodes[0].missions[0].build.missions.push("race-nope");
broken.scenes[Object.keys(broken.scenes)[0]].lines[0].who = "nobody"; broken.rewards[0].kind = "power";
const found = Story.check(broken, { lessons, missions, exists });
for (const want of [/no lesson nope/, /doesn't exist: race-nope/, /no character nobody/, /kind must be/]) assert(found.some((s) => want.test(s)), "the check catches: " + want);

// Volt has no lines before Episode 2's first-words scene (the bible: its first sentence ends Episode 2)
const sceneEpisode = {};
for (const ep of episodes) for (const m of ep.missions) for (const s of [m.briefing, m.debrief]) if (s) sceneEpisode[s] = ep.num;
for (const [id, sc] of Object.entries(scenes)) {
  assert(sceneEpisode[id], `scene ${id} isn't used by any mission`);
  if (sc.lines.some((l) => l.who === "volt" && l.kind !== "beeps")) assert(sceneEpisode[id] >= 3 || (sceneEpisode[id] === 2 && sc.voltFirstWords), `scene ${id}: Volt only beeps before Episode 2's end`);
}

// the season (the map): every episode number once, a place on the map picture, and built episodes agree with it
const season = json("season.json");
assert(exists(season.map), "the season map picture exists");
assert.deepStrictEqual(season.episodes.map((e) => e.num), season.episodes.map((_, i) => i + 1), "the season lists episodes 1, 2, 3... once each, in order");
for (const e of season.episodes) assert(e.title && e.place && e.map.x >= 0 && e.map.x <= 100 && e.map.y >= 0 && e.map.y <= 100, `season episode ${e.num}: title, place, and a map position in percent`);
for (const ep of episodes) {
  const s = season.episodes.find((e) => e.num === ep.num);
  assert(s, `episode ${ep.id} isn't in the season`);
  assert.strictEqual(ep.title, s.title, `episode ${ep.id}: the same title as the season file`);
  assert.deepStrictEqual(ep.map, s.map, `episode ${ep.id}: the same map position as the season file`);
}

// the step rules, on the pilot
const ep5 = episodes.find((e) => e.id === "ep5"), m = ep5.missions[0];
const S = (lessonsDone = {}, goals = {}, rec = {}) => ({ lessons: lessonsDone, missions: goals, record: { v: 1, missions: rec, rewards: {}, last: null } });
let saved = S();
assert.strictEqual(Story.nextStep(m, saved), "briefing", "a new student starts with the briefing");
assert(Story.stepOpen(m, "briefing", saved) && !Story.stepOpen(m, "discover", saved), "steps open in order");
assert(Story.missionUnlocked(episodes, m.id, saved), "the pilot's first mission is open (the episode is marked open)");
saved = S({ thrust: { done: true } });
assert(Story.stepDone(m, "discover", saved) && Story.nextStep(m, saved) === "briefing", "a lesson finished last week counts, but the briefing still comes first");
assert(Story.stepOpen(m, "discover", saved), "a step already done can be revisited");
saved = S({ thrust: { done: true } }, { "lab-car": { tries: 3, goal: false } }, { [m.id]: { briefing: 1 } });
assert.strictEqual(Story.nextStep(m, saved), "build", "tries without the goal don't finish Build");
saved = S({ thrust: { done: true } }, { "lab-car": { tries: 4, goal: true } }, { [m.id]: { briefing: 1 } });
assert.strictEqual(Story.nextStep(m, saved), "mission", `one Build goal is enough (need ${m.build.need})`);
saved = S({ thrust: { done: true } }, { "lab-car": { goal: true }, "lab-bridge": { goal: true } }, { [m.id]: { briefing: 1 } });
assert.strictEqual(Story.nextStep(m, saved), "reward", "the mission's goal opens the Reward");
assert(!Story.missionDone(m, saved), "not done until the reward is shown");
saved = S({}, {}, { [m.id]: { briefing: 1, discover: 1, build: 1, mission: 1 } });
assert.strictEqual(Story.nextStep(m, saved), "reward", "steps the class moved past count (the record keeps them)");
saved = S({}, {}, { [m.id]: { briefing: 1, reward: 1, done: 1 } });
assert(Story.missionDone(m, saved) && Story.nextStep(m, saved) === null, "a finished mission has no next step");
assert.strictEqual(Story.nextMission(episodes, m.id), ep5.missions[1] || null, "the next mission is the next in the episode, or the next episode's first");
assert.strictEqual(Story.find(episodes, "nope"), null);
assert(!Story.missionUnlocked(episodes, "nope", saved));
// a closed episode opens only when the one before it is done
const fake = [{ ...ep5, id: "ep4", num: 4, open: false, missions: [{ ...m, id: "ep4-a" }] }, { ...ep5, open: false, missions: [{ ...m, id: "ep5-a" }] }];
assert(!Story.episodeUnlocked(fake[0], fake, S()) && !Story.missionUnlocked(fake, "ep5-a", S()), "no previous episode file, not open: locked");
assert(Story.missionUnlocked(fake, "ep5-a", S({}, {}, { "ep4-a": { done: 1 } })), "the previous episode's core missions done: open");

// the class's progress on a student's record (PF-3): the one rule the game page and the mission bar both use
let out = Story.applyClass(null, { now: { mission: m.id, step: "build" }, finished: [] }, episodes, 5);
const r5 = out.record.missions[m.id];
assert(out.changed && r5.briefing === 5 && r5.discover === 5 && !r5.build && out.record.last === m.id, "the class moved past the briefing and the lesson; Build comes from the student's own runs");
assert(!Story.applyClass(out.record, { now: { mission: m.id, step: "build" }, finished: [] }, episodes, 9).changed, "nothing new the second time");
out = Story.applyClass(out.record, { now: null, finished: [m.id] }, episodes, 7);
assert(out.changed && out.record.missions[m.id].done === 7 && out.record.missions[m.id].reward === 7 && out.record.rewards["echo-bridge-lights"] === 7, "the class finished it: the reward and done");
assert(Story.missionDone(m, { record: out.record }) && Story.nextStep(m, { record: out.record }) === null, "the mission counts as done");
assert(!Story.applyClass(out.record, { now: null, finished: [m.id] }, episodes, 8).changed, "a reward is given once");
assert(!Story.applyClass(null, { now: { mission: "nope", step: "build" }, finished: ["nope"] }, episodes, 1).changed, "unknown missions change nothing");
const evEps = [{ ...ep5, missions: [{ ...m, mission: { event: "raceday" } }] }];
assert.strictEqual(Story.applyClass(null, { now: { mission: m.id, step: "reward" } }, evEps, 3).record.missions[m.id].mission, 3, "a class event in the Mission step counts once the class moves past it");
assert.deepStrictEqual(Story.finishedFor({ a: ["p1", "p2"], b: ["p2"] }, "p1"), ["a"]);
assert.deepStrictEqual(Story.finishedFor(undefined, "p1"), []);

// the pilot's Mission really is the bridge Lab mission, and the lesson lists it
assert.strictEqual(m.mission.mission, "lab-bridge");
assert(json("lessons/thrust.json").missions.includes("lab-bridge"), "the thrust lesson lists the bridge mission");
console.log(`Story tests passed (${episodes.length} episode${episodes.length === 1 ? "" : "s"}, ${Object.keys(scenes).length} scenes, ${rewards.length} reward${rewards.length === 1 ? "" : "s"})`);
