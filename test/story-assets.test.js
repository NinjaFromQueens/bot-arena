// The story asset tool (scripts/story-assets.js, ST-3): on the sample scene it finds what's to make (a picture and a
// clip not made yet, each counted once), what's reused, the voice lines each level needs (a Cadet hears the Recruit
// recording where the words are the same), Volt's feelings, IDs missing from the list and lines without an id, and
// prices them; the batch carries prompts, the style and each speaker's voice. On the real files it runs clean.
const assert = require("assert");
const fs = require("fs"), path = require("path");
const A = require("../scripts/story-assets.js");

const real = A.load();
const pub = path.join(__dirname, "../public");
const demo = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/story/scene-v2.json"), "utf8"));
demo.shots.push({ kind: "still", art: "bg_blast_door" }); // the same picture used twice is made once
const assets = { ...real.assets, key_demo_not_made: { file: "/assets/scenes/demo.webp", kind: "image", made: false, prompt: "The Archive's sealed door at night", refs: ["e7e2083d-c27f-48f7-b416-73414a56d230"] } };
const d = { ...real, episodes: [], season: {}, scenes: { "demo-v2": demo }, assets };

const rep = A.report(d), e = rep.episodes[0];
assert.strictEqual(e.id, "unused", "a scene no mission uses is grouped as unused");
assert.deepStrictEqual(e.make.map((m) => m.id).sort(), ["cut_ch02", "key_demo_not_made"], "to make: the picture and the clip not made yet");
assert.strictEqual(e.make.find((m) => m.id === "cut_ch02").credits, 7.5, "a 5 s clip: 7.5");
assert.strictEqual(e.make.find((m) => m.id === "key_demo_not_made").credits, 2.75, "a keyframe: 2.75");
assert(e.reused.keyframe >= 3 && e.reused.clip === 1 && e.reused.music === 2 && e.reused.ambience === 1 && e.reused.sfx === 1 && e.reused.voice === 1, "reused: paths and made IDs, once each " + JSON.stringify(e.reused));
assert.deepStrictEqual(e.voices.map((v) => v.id), ["demo-01", "demo-04", "demo-05", "demo-06", "demo-07"], "voice lines: every speaking line without a recording (not Volt's beeps)");
assert.strictEqual(e.voices[0].who, "narrator", "narration is the narrator's");
assert.deepStrictEqual(e.feels, ["curious"], "Volt's feelings used");
assert.deepStrictEqual(e.noPrompt, ["cut_ch02"], "the clip has no prompt yet");
assert.strictEqual(e.rows.voice.credits, 3, "5 Seed Audio lines at 0.5, with 1 in 5 redone: 3");
assert.strictEqual(e.total, 13.25, "total: 2.75 + 7.5 + 3");

// a Cadet: only lines whose Cadet words differ need their own recording
const cadet = A.report(d, { tier: "cadet" }).episodes[0];
assert.deepStrictEqual(cadet.voices.map((v) => v.id), ["demo-01"], "Cadet: only the line with Cadet words of its own");
assert.strictEqual(cadet.voices[0].text, "The tunnels were dark.", "in the Cadet words");

// a priced cast: text-to-speech lines cost by length
const cast = { omni: { model: "text2speech_v2" } };
const omni = A.report(d, { cast }).episodes[0].voices.find((v) => v.who === "omni");
assert.strictEqual(omni.credits, Math.round(1.2 * 0.15 * 100) / 100, "a short OMNI line: 0.15, with redos");

// problems: an ID missing from the list, a missing file, a line without an id; "voice": false is never asked for
const bad = JSON.parse(JSON.stringify(demo));
bad.shots[0].art = "key_nope"; bad.music = "/assets/audio/music/nope.mp3"; delete bad.lines[3].id; bad.lines[4].voice = false;
const be = A.report({ ...d, scenes: { "demo-v2": bad } }).episodes[0];
assert(be.unlisted.some((s) => /^key_nope/.test(s)) && be.missingFiles.some((s) => /nope\.mp3/.test(s)), "it reports IDs not in the list and missing files");
assert.deepStrictEqual(be.noId, ["demo-v2 line 4"], "and lines without an id");
assert(!be.voices.some((v) => v.line === 5), "a line with voice: false isn't asked for");

// the batch: prompts, aspect, references, the style, each speaker's voice, and the file each becomes
const style = A.readStyle(path.join(__dirname, "fixtures/story/style-sample.md"));
assert(style && /Hand-drawn/.test(style.prefix) && /no weapons/.test(style.always) && style.references.length === 2, "STYLE.md's prefix, its always-add line and its references");
const b = A.batch(rep, d, { style, cast: { sparrow: { model: "seed_audio" } }, today: "2026-11-23" });
const img = b.images.find((x) => x.id === "key_demo_not_made");
assert(img && img.prompt && img.aspect === "16:9" && img.refs.length === 1 && img.file === "/assets/scenes/demo.webp", "an image item carries its prompt, aspect, references and file");
assert.deepStrictEqual(b.missingPrompts, ["cut_ch02"], "the batch lists what has no prompt");
assert(b.voices.every((v) => /^\/assets\/story\/unused\/voice\/demo-0\d\.mp3$/.test(v.file)), "voice files are named by line id");
assert.strictEqual(b.style.prefix, style.prefix, "the batch carries the style");

// the real files: every scene's assets are listed or exist (story.test checks the same), and the opening is all made
const r = A.report(real);
assert(r.episodes.every((x) => !x.unlisted.length && !x.missingFiles.length), "the real scenes name only listed assets and files that exist");
const op = r.episodes.find((x) => x.id === "opening");
assert(op && op.total === 0 && op.reused.voice > 0, "the opening has nothing left to make");
assert(r.episodes.every((x) => !x.noId.length), "every real line that needs a voice has an id");
console.log(`Story asset tool tests passed (${r.episodes.length} groups, about ${r.total} credits to make)`);
