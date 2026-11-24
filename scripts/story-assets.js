#!/usr/bin/env node
/* The story asset tool (ST-3; docs/story-media-plan.md, "The asset list"): reads every scene file and lists, per
 * episode, the art, clips, music, ambience, sound effects and voice lines still to make, what's reused, and an
 * estimate of the credits. Production tool only: not used by the site.
 *
 *   npm run story:assets                          every episode (and the opening)
 *   npm run story:assets -- ep1                   one episode; "opening" is the opening's scenes
 *     --tier cadet|recruit|operative              which reading level's voice lines to count (Recruit first)
 *     --batch <file>                              also write the next Higgsfield batch as JSON, for a quote
 *     --drafts <dir>                              add a private draft episode (EP1-2): <dir>/draft.json (episode,
 *                                                 characters, assets, rewards) and <dir>/scenes/*.json; checks its scenes
 *     --script <file>                             write the chosen episodes' scenes as a readable script (Markdown)
 *
 * Art and sound in scenes are paths (already made) or asset IDs from public/assets/story-assets.json. An ID's entry
 * can carry what the batch needs: prompt, aspect, refs (asset IDs or Higgsfield job ids for image_references), from
 * (a clip's keyframe ID), secs (a clip's or a track's length), credits (overrides the estimate). Voice lines are the
 * speaking lines without a voice at that level (a level hears the Recruit recording where its words are the same, as
 * the player does); "voice": false keeps a line silent on purpose. Prices are the Nov 15 quotes: every batch is quoted
 * again with get_cost and approved by Duron before anything is spent. An entry with a job but made: false is art that
 * was generated and only needs its web copy (npm run media, free).
 *
 * Drafts stay out of the public repo until their episode ships (story spoilers, and asset names that give the season
 * away), so they live with the story files in the private art folder and are merged here only for the report.
 */
const fs = require("fs"), path = require("path");
const Story = require("../public/js/story.js");
const ROOT = path.resolve(__dirname, ".."), PUB = path.join(ROOT, "public"), DATA = path.join(PUB, "data");
const LEVELS = ["cadet", "recruit", "operative"];

// estimates from the Higgsfield quotes of Nov 15, 2026 (docs/story-media-plan.md, Prices)
const PRICE = {
  keyframe: 2.75, // gpt_image_2_6, high quality 2K
  layer: 2.75, // a keyframe made to be cut out (remove_background is a little extra)
  portrait: 0.5, // gpt_image_2_6, medium quality, square: one expression
  clip: 7.5, // kling3_0 standard, silent, per 5 seconds
  music: 3.84, // elevenlabs_music_v2, per 60 seconds of loop
  ambience: 3.84, // the same model, per 60 seconds
  sfx: 0.75, // mirelo_text_to_audio, about 3 seconds
  seedVoice: 0.5, // seed_audio, one line (the teen cast)
  ttsVoice: (chars) => Math.max(0.15, 0.1 + 0.0035 * chars), // text2speech_v2: 0.15 for 3 words, 0.45 for about 100 characters
};
const REDO = 1.2; // about 1 in 5 voice lines is redone (production step 6)
const NAMES = { keyframe: "keyframes", layer: "layers", clip: "clips", portrait: "portraits", music: "music", ambience: "ambience", sfx: "sound effects", voice: "voice lines" };
const ORDER = ["keyframe", "layer", "portrait", "clip", "music", "ambience", "sfx", "voice"];
const KIND = { keyframe: "image", layer: "image", portrait: "image", clip: "video", music: "music", ambience: "ambience", sfx: "sfx", voice: "voice" };

const textAt = (v, t) => (v && typeof v === "object" ? (v[t] != null ? v[t] : v.recruit) : v);
const round = (n) => Math.round(n * 100) / 100;

function load(dir = DATA, pub = PUB) {
  const json = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const episodes = json("episodes/index.json").map((id) => json(`episodes/${id}.json`));
  const scenes = Object.fromEntries(fs.readdirSync(path.join(dir, "scenes")).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), json(`scenes/${f}`)]));
  const season = json("season.json"), characters = json("characters.json");
  const assets = JSON.parse(fs.readFileSync(path.join(pub, "assets/story-assets.json"), "utf8")).assets;
  return { episodes, scenes, season, characters, assets, exists: (p) => fs.existsSync(path.join(pub, p)) };
}

// a draft episode merged in: its scenes, new characters and asset entries (fields added to a listed asset's entry),
// and its episode file for grouping. Returns the merged data and the draft's own scenes, for checking
function withDraft(d, dir) {
  const draft = JSON.parse(fs.readFileSync(path.join(dir, "draft.json"), "utf8")), sdir = path.join(dir, "scenes");
  const scenes = Object.fromEntries(fs.readdirSync(sdir).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(sdir, f), "utf8"))]));
  const assets = { ...d.assets }; for (const [id, a] of Object.entries(draft.assets || {})) assets[id] = { ...(assets[id] || {}), ...a };
  const episodes = draft.episode ? [...d.episodes.filter((e) => e.id !== draft.episode.id), draft.episode].sort((a, b) => a.num - b.num) : d.episodes;
  return { data: { ...d, episodes, scenes: { ...d.scenes, ...scenes }, characters: { ...d.characters, ...(draft.characters || {}) }, assets }, draft, scenes };
}
// the scene check (story.js) on a draft's scenes, against the merged characters and assets
function checkDraft(merged, scenes) {
  return Story.check({ episodes: [], scenes, characters: merged.characters, rewards: [] }, { lessons: [], missions: {}, exists: merged.exists, assets: merged.assets });
}

// which episode each scene belongs to: its missions' briefings and debriefs, and the opening's Cadet version
function sceneGroups(d) {
  const of = {};
  for (const ep of d.episodes) for (const m of ep.missions) for (const s of [m.briefing, m.debrief]) if (s) of[s] = ep.id;
  if (d.season && d.season.opening && d.season.opening.cadet) of[d.season.opening.cadet] = "opening";
  for (const id of Object.keys(d.scenes)) if (!of[id]) of[id] = "unused";
  return of;
}

// every piece of art and sound a scene names, with what it's for and where
function refsOf(sc, characters) {
  const out = [], add = (ref, use, where) => { if (typeof ref === "string" && ref) out.push({ ref, use, where }); };
  const shots = Array.isArray(sc.shots) && sc.shots.length ? sc.shots : sc.bg ? [{ kind: "still", art: sc.bg }] : [];
  shots.forEach((s, k) => {
    if (s.kind === "video") { add(s.art, "clip", `shot ${k}`); add(s.poster, "keyframe", `shot ${k} poster`); }
    else { add(s.art, "keyframe", `shot ${k}`); (s.layers || []).forEach((l) => add(l, "layer", `shot ${k} layer`)); }
  });
  add(sc.music, "music", "scene"); add(sc.ambience, "ambience", "scene");
  (sc.lines || []).forEach((ln, k) => {
    const where = `line ${k + 1}`;
    for (const s of ln.sfx || []) add(s, "sfx", where);
    if (typeof ln.music === "string") add(ln.music, "music", where);
    if (typeof ln.ambience === "string") add(ln.ambience, "ambience", where);
    const c = ln.who && characters[ln.who];
    if (c && ln.face != null) add(c.faces[ln.face], "portrait", `${where} (${ln.who} ${ln.face})`);
  });
  return out;
}

// the speaking lines that still need a voice at this level (beeps and the student's replies have none); out.recorded
// counts the ones that have it
function voiceNeeds(sc, d, tier) {
  const out = []; out.recorded = 0;
  (sc.lines || []).forEach((ln, k) => {
    const kind = ln.kind || "line";
    if (kind === "beeps" || kind === "reply" || ln.voice === false) return;
    const v = typeof ln.voice === "string" ? { recruit: ln.voice } : ln.voice || {};
    const made = (r) => r && (r.startsWith("/") ? d.exists(r) : !!(d.assets[r] && d.assets[r].made));
    const words = textAt(ln.text, tier), same = words === textAt(ln.text, "recruit");
    const ref = v[tier] || (same ? v.recruit : null);
    if (made(ref)) { out.recorded++; return; }
    if (tier !== "recruit" && same) return; // this level hears the Recruit recording, counted at the Recruit level
    out.push({ line: k + 1, id: ln.id || null, who: kind === "narration" ? "narrator" : ln.who, text: String(words || ""), ref: ref || null });
  });
  return out;
}

function priceOf(use, a, line, cast) {
  if (a && a.credits != null) return a.credits;
  if (use === "clip") return PRICE.clip * Math.max(1, Math.ceil(((a && a.secs) || 5) / 5));
  if (use === "music" || use === "ambience") return PRICE[use] * Math.max(1, Math.ceil(((a && a.secs) || 60) / 60));
  if (use === "voice") { const c = cast && cast[line.who]; return REDO * (c && c.model === "text2speech_v2" ? PRICE.ttsVoice(line.text.length) : PRICE.seedVoice); }
  return PRICE[use];
}

// the report for some episodes: what's to make (each asset once, however many scenes use it), what's reused,
// the voice lines, and problems to fix before a batch
function report(d, { only = null, tier = "recruit", cast = null } = {}) {
  const group = sceneGroups(d), eps = {};
  const order = [...d.episodes.map((e) => e.id), "opening", "unused"];
  for (const [sid, sc] of Object.entries(d.scenes)) {
    const g = group[sid]; if (only && !only.includes(g)) continue;
    const e = eps[g] || (eps[g] = { id: g, title: g === "opening" ? "The opening" : g === "unused" ? "Scenes no mission uses" : (d.episodes.find((x) => x.id === g) || {}).title, scenes: [], make: new Map(), copies: new Map(), reused: new Map(), unlisted: [], missingFiles: [], voices: [], noId: [], feels: new Set(), recorded: 0 });
    e.scenes.push(sid);
    for (const r of refsOf(sc, d.characters)) {
      const at = `${sid} ${r.where}`;
      if (r.ref.startsWith("/")) { if (d.exists(r.ref)) e.reused.set(r.ref, r.use); else e.missingFiles.push(`${r.ref} (${at})`); continue; }
      const a = d.assets[r.ref];
      if (!a) { e.unlisted.push(`${r.ref} (${at})`); continue; }
      if (a.made) { e.reused.set(r.ref, r.use); continue; }
      if (a.job) { e.copies.set(r.ref, r.use); continue; } // generated already: only its web copy is missing
      const m = e.make.get(r.ref) || { id: r.ref, use: r.use, asset: a, where: [] };
      m.where.push(at); e.make.set(r.ref, m);
    }
    const vn = voiceNeeds(sc, d, tier); e.recorded += vn.recorded;
    for (const v of vn) { e.voices.push({ scene: sid, ...v }); if (!v.id) e.noId.push(`${sid} line ${v.line}`); }
    for (const ln of sc.lines || []) if (ln.kind === "beeps" && !(ln.sfx && ln.sfx.length)) e.feels.add(ln.feel || "curious");
  }
  const out = order.filter((g) => eps[g]).map((g) => {
    const e = eps[g], rows = {};
    for (const m of e.make.values()) { m.credits = round(priceOf(m.use, m.asset, null, cast)); (rows[m.use] = rows[m.use] || { count: 0, credits: 0 }); rows[m.use].count++; rows[m.use].credits += m.credits; }
    for (const v of e.voices) { v.credits = round(priceOf("voice", null, v, cast)); (rows.voice = rows.voice || { count: 0, credits: 0 }); rows.voice.count++; rows.voice.credits += v.credits; }
    const reused = {}; for (const use of e.reused.values()) reused[use] = (reused[use] || 0) + 1;
    if (e.recorded) reused.voice = e.recorded;
    const noPrompt = [...e.make.values()].filter((m) => !m.asset.prompt).map((m) => m.id);
    const total = round(Object.values(rows).reduce((s, r) => s + r.credits, 0));
    for (const r of Object.values(rows)) r.credits = round(r.credits);
    return { id: e.id, title: e.title, scenes: e.scenes, rows, total, make: [...e.make.values()], copies: [...e.copies.keys()], voices: e.voices, reused, unlisted: e.unlisted, missingFiles: e.missingFiles, noPrompt, noId: e.noId, feels: [...e.feels] };
  });
  return { tier, episodes: out, total: round(out.reduce((s, e) => s + e.total, 0)) };
}

// the next Higgsfield batch: every item with its prompt, the style and its reference pictures, the file it becomes,
// and the estimate. For a get_cost quote; nothing here spends credits.
function batch(rep, d, { style = null, cast = null, today = new Date().toISOString().slice(0, 10) } = {}) {
  const b = { made: today, tier: rep.tier, episodes: rep.episodes.map((e) => e.id),
    note: "Estimates from the Nov 15, 2026 prices. Quote every item with get_cost first; Duron approves the quote before anything is submitted.",
    style, images: [], clips: [], audio: [], voices: [], missingPrompts: [], total: rep.total };
  for (const e of rep.episodes) {
    for (const m of e.make) {
      const a = m.asset, item = { id: m.id, use: m.use, file: a.file || null, prompt: a.prompt || null, credits: m.credits, usedIn: m.where };
      if (!a.prompt) b.missingPrompts.push(m.id);
      if (KIND[m.use] === "image") b.images.push({ ...item, aspect: a.aspect || (m.use === "portrait" ? "1:1" : "16:9"), refs: a.refs || [] });
      else if (m.use === "clip") b.clips.push({ ...item, from: a.from || null, secs: a.secs || 5 });
      else b.audio.push({ ...item, secs: a.secs || (m.use === "sfx" ? 3 : 60) });
    }
    for (const v of e.voices) {
      const name = v.id || `${v.scene}-${v.line}`, suffix = rep.tier === "recruit" ? "" : `-${rep.tier}`;
      b.voices.push({ scene: v.scene, line: v.line, id: v.id, who: v.who, text: v.text, file: `/assets/story/${e.id}/voice/${name}${suffix}.mp3`, voice: (cast && cast[v.who]) || null, credits: v.credits });
    }
  }
  return b;
}

// STYLE.md's prefix, its "always add" line and its reference pictures (job ids), when the private art folder is here
function readStyle(file) {
  if (!file || !fs.existsSync(file)) return null;
  const s = fs.readFileSync(file, "utf8");
  const prefix = ((s.match(/## Style prefix[^\n]*\n+((?:>.*\n?)+)/) || [])[1] || "").replace(/^>\s?/gm, "").replace(/\s+/g, " ").trim();
  const always = ((s.match(/\*\*Always add:\*\*\s*(.+)/) || [])[1] || "").trim();
  const references = [...s.matchAll(/^\|\s*([^|]+?)\s*\|\s*([\w.-]+\.png)\s*\|\s*([0-9a-f-]{36})\s*\|/gm)].map((m) => ({ use: m[1], file: m[2], job: m[3] }));
  return { from: path.basename(file), prefix, always, references };
}

function print(rep, w = console.log) {
  const pad = (s, n) => String(s).padEnd(n), num = (n) => n.toFixed(2).padStart(9);
  w(`Story assets, voice lines at the ${rep.tier[0].toUpperCase() + rep.tier.slice(1)} level (estimates from the Nov 15 prices; quote with get_cost first)\n`);
  for (const e of rep.episodes) {
    w(`${e.id === "opening" || e.id === "unused" ? e.title : `${e.id} · ${e.title}`} (${e.scenes.length} scene${e.scenes.length === 1 ? "" : "s"})`);
    const uses = ORDER.filter((u) => e.rows[u]);
    if (!uses.length) w("  Nothing to make.");
    else {
      w(`  ${pad("To make", 26)}${"count".padStart(6)}${"credits".padStart(9)}`);
      for (const u of uses) w(`    ${pad(NAMES[u], 24)}${String(e.rows[u].count).padStart(6)}${num(e.rows[u].credits)}${u === "voice" ? "  (1 in 5 redone)" : ""}`);
      w(`    ${pad("total", 24)}${"".padStart(6)}${num(e.total)}`);
      for (const m of e.make) w(`      ${pad(m.id, 34)} ${pad(NAMES[m.use], 14)} ${num(m.credits)}   ${m.where.slice(0, 2).join(", ")}${m.where.length > 2 ? ` +${m.where.length - 2}` : ""}`);
      const byWho = {}; for (const v of e.voices) byWho[v.who] = (byWho[v.who] || 0) + 1;
      if (e.voices.length) w(`      voice lines by speaker: ${Object.entries(byWho).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    }
    if (e.copies.length) w(`  Web copies to make (the art exists; free with npm run media): ${e.copies.join(", ")}`);
    const re = Object.entries(e.reused);
    if (re.length) w(`  Reused (already made): ${re.map(([u, n]) => `${n} ${n === 1 ? NAMES[u].replace(/s$/, "") : NAMES[u]}`).join(", ")}`);
    if (e.feels.length) w(`  Volt's feelings used: ${e.feels.join(", ")} (synthesized beeps until the sound library's feelings exist)`);
    if (e.unlisted.length) w(`  NOT IN THE ASSET LIST (add them, made: false): ${e.unlisted.join("; ")}`);
    if (e.missingFiles.length) w(`  MISSING FILES: ${e.missingFiles.join("; ")}`);
    if (e.noPrompt.length) w(`  No prompt yet (add "prompt" to the entry before the batch): ${e.noPrompt.join(", ")}`);
    if (e.noId.length) w(`  Lines without an id (voice files are named by line id): ${e.noId.join(", ")}`);
    w("");
  }
  w(`All: about ${rep.total.toFixed(2)} credits to make.`);
}

// the scenes as a script to read and lock (production step 2): shots as stage directions, every line with its speaker,
// the other levels' words under the Recruit's, replies as choices
function script(d, ids, title) {
  const out = [`# ${title}`, "", `Made by \`npm run story:assets -- --script\` from the scene files. Recruit words first; Cadet (C) and Operative (O) where they differ.`, ""];
  const group = sceneGroups(d), name = (who) => (d.characters[who] && d.characters[who].name) || who;
  const ref = (r) => (typeof r !== "string" ? "" : r.startsWith("/") ? r.split("/").pop() : r);
  for (const ep of d.episodes.filter((e) => ids.includes(e.id))) {
    out.push(`## Episode ${ep.num}: ${textAt(ep.title, "recruit")}`, "");
    for (const m of ep.missions) for (const [kind, sid] of [["Briefing", m.briefing], ["Debrief", m.debrief]]) {
      const sc = d.scenes[sid]; if (!sc || group[sid] !== ep.id) continue;
      out.push(`### ${textAt(m.title, "recruit")}: ${kind} (\`${sid}\`)`, "");
      const shots = Array.isArray(sc.shots) ? sc.shots : sc.bg ? [{ kind: "still", art: sc.bg }] : [];
      const sound = [sc.music && `music ${ref(sc.music)}`, sc.ambience && `ambience ${ref(sc.ambience)}`].filter(Boolean).join(", ");
      if (sound) out.push(`*Sound: ${sound}.*`, "");
      let shot = -1;
      sc.lines.forEach((ln, k) => {
        const s = ln.shot != null ? ln.shot : k === 0 ? 0 : shot;
        if (s !== shot && shots[s]) { shot = s; const x = shots[s]; out.push(`> **Shot ${s}:** ${x.kind === "video" ? "clip" : "still"} ${ref(x.art)}${x.move ? `, ${x.move}` : ""}${x.look ? `, ${x.look} look` : ""}${x.note ? `. ${textAt(x.note, "recruit")}` : ""}`, ""); }
        const extra = [ln.sfx && ln.sfx.length && `sound: ${ln.sfx.map(ref).join(", ")}`, "music" in ln && `music: ${ln.music ? ref(ln.music) : "stops"}`, "ambience" in ln && `ambience: ${ln.ambience ? ref(ln.ambience) : "stops"}`].filter(Boolean);
        if (extra.length) out.push(`*(${extra.join("; ")})*`, "");
        const kind = ln.kind || "line";
        if (kind === "reply") {
          out.push(`**YOU (reply):**`);
          ln.replies.forEach((r, j) => { out.push(`${j + 1}. ${textAt(r.text, "recruit")}`); for (const t of ["cadet", "operative"]) if (r.text && typeof r.text === "object" && r.text[t] && r.text[t] !== r.text.recruit) out.push(`   - ${t[0].toUpperCase()}: ${r.text[t]}`); });
          out.push("");
          return;
        }
        const who = kind === "narration" ? "*Narration*" : `**${name(ln.who).toUpperCase()}${ln.face ? ` (${ln.face})` : ""}:**`;
        out.push(`${who} ${kind === "beeps" ? "_" + textAt(ln.text, "recruit") + "_" : textAt(ln.text, "recruit")}`);
        for (const t of ["cadet", "operative"]) if (ln.text && typeof ln.text === "object" && ln.text[t] && ln.text[t] !== ln.text.recruit) out.push(`- ${t[0].toUpperCase()}: ${ln.text[t]}`);
        out.push("");
      });
    }
  }
  return out.join("\n");
}

function main(argv) {
  const args = argv.slice(), opt = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const tier = opt("--tier") || "recruit", batchFile = opt("--batch"), styleFile = opt("--style") || path.resolve(ROOT, "../bot-arena-v2/art-work/story/STYLE.md");
  if (!LEVELS.includes(tier)) { console.error(`--tier is ${LEVELS.join(", ")}`); return 2; }
  const castFile = path.join(ROOT, "docs/voice-cast.json"), cast = fs.existsSync(castFile) ? JSON.parse(fs.readFileSync(castFile, "utf8")).cast : null;
  const draftDir = opt("--drafts"), scriptFile = opt("--script");
  let d = load(), drafted = null;
  if (draftDir) {
    drafted = withDraft(d, path.resolve(draftDir)); d = drafted.data;
    const problems = checkDraft(d, drafted.scenes);
    console.log(problems.length ? `Draft scene problems (${problems.length}):\n  ${problems.join("\n  ")}\n` : `Draft ${drafted.draft.episode ? drafted.draft.episode.id : ""}: ${Object.keys(drafted.scenes).length} scenes pass the scene check.\n`);
    if (problems.length) process.exitCode = 1;
  }
  const only = args.length ? args : null;
  if (only) { const known = [...d.episodes.map((e) => e.id), "opening", "unused"]; const bad = only.filter((x) => !known.includes(x)); if (bad.length) { console.error(`No episode ${bad.join(", ")}. Episodes: ${known.join(", ")}`); return 2; } }
  const rep = report(d, { only, tier, cast });
  print(rep);
  if (scriptFile) {
    const ids = only || d.episodes.map((e) => e.id);
    fs.writeFileSync(scriptFile, script(d, ids, `Script: ${ids.join(", ")}`) + "\n");
    console.log(`\nWrote the script to ${scriptFile}.`);
  }
  if (batchFile) {
    const b = batch(rep, d, { style: readStyle(styleFile), cast });
    fs.mkdirSync(path.dirname(path.resolve(batchFile)), { recursive: true });
    fs.writeFileSync(batchFile, JSON.stringify(b, null, 2) + "\n");
    console.log(`\nWrote ${batchFile}: ${b.images.length} images, ${b.clips.length} clips, ${b.audio.length} sounds, ${b.voices.length} voice lines${b.style ? "" : " (STYLE.md not found: no style prefix)"}${b.missingPrompts.length ? `; ${b.missingPrompts.length} without a prompt` : ""}.`);
  }
  return rep.episodes.some((e) => e.unlisted.length || e.missingFiles.length) || process.exitCode === 1 ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { PRICE, REDO, load, withDraft, checkDraft, sceneGroups, refsOf, voiceNeeds, report, batch, readStyle, print, script };
