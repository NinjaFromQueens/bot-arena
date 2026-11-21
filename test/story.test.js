// Story mode (docs/platform-flow-spec.md): every episode, scene, character and reward file is well-formed and every
// link between them and the lessons and missions exists; Volt doesn't speak before Episode 2's end; and the step rules
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

// every file and every link
assert.deepStrictEqual(Story.check({ episodes, scenes, characters, rewards }, { lessons, missions, exists }), [], "the story files have problems");
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
  if (sc.lines.some((l) => l.who === "volt")) assert(sceneEpisode[id] >= 3 || (sceneEpisode[id] === 2 && sc.voltFirstWords), `scene ${id}: Volt doesn't speak before Episode 2's end`);
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

// the pilot's Mission really is the bridge Lab mission, and the lesson lists it
assert.strictEqual(m.mission.mission, "lab-bridge");
assert(json("lessons/thrust.json").missions.includes("lab-bridge"), "the thrust lesson lists the bridge mission");
console.log(`Story tests passed (${episodes.length} episode${episodes.length === 1 ? "" : "s"}, ${Object.keys(scenes).length} scenes, ${rewards.length} reward${rewards.length === 1 ? "" : "s"})`);
