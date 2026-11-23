/*
 * Story mode's rules (docs/platform-flow-spec.md), shared by the browser, the server and the tests. The story is the
 * spine: an episode holds missions, and every mission runs the same five steps. Each step's "done" is read from what
 * the activity pages already save on the device, so the pages themselves don't change:
 *   saved = { lessons: learn-progress, missions: cr-missions, record: cr-record }
 * cr-record holds only what nothing else saves: briefings and debriefs watched, steps the class moved past, rewards,
 * finished missions and where the student was. Everything here is a pure function of the files and `saved`.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Story = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const STEPS = ["briefing", "discover", "build", "mission", "reward"];
  const STEP_NAME = { briefing: "Briefing", discover: "Discover", build: "Build", mission: "Mission", reward: "Reward" };
  const emptyRecord = () => ({ v: 1, missions: {}, rewards: {}, last: null });
  const recOf = (saved, id) => ((saved.record && saved.record.missions) || {})[id] || {};
  const goal = (saved, mid) => !!((saved.missions || {})[mid] || {}).goal;

  // find a mission in the episodes: { episode, mission, index } or null
  function find(episodes, id) {
    for (const episode of episodes) { const index = episode.missions.findIndex((m) => m.id === id); if (index >= 0) return { episode, mission: episode.missions[index], index }; }
    return null;
  }
  // is this step of this mission done? (a step the class moved past counts: the record keeps it)
  function stepDone(m, step, saved) {
    const r = recOf(saved, m.id);
    if (r[step]) return true;
    if (step === "discover") return !!((saved.lessons || {})[m.discover.lesson] || {}).done;
    if (step === "build") return m.build.missions.filter((id) => goal(saved, id)).length >= (m.build.need || 1);
    if (step === "mission") return !!m.mission.mission && goal(saved, m.mission.mission);
    return false; // briefing and reward: only the record says so
  }
  // the first step not done yet, or null when the mission is finished
  const nextStep = (m, saved) => (missionDone(m, saved) ? null : STEPS.find((s) => !stepDone(m, s, saved)) || "reward");
  const missionDone = (m, saved) => !!recOf(saved, m.id).done;
  // can the student open this step? Steps open in order; one already done can always be revisited
  function stepOpen(m, step, saved) {
    const k = STEPS.indexOf(step);
    return stepDone(m, step, saved) || STEPS.slice(0, k).every((s) => stepDone(m, s, saved));
  }
  // an episode opens when every core mission of the one before it is done, or when it's marked open (a pilot)
  function episodeUnlocked(ep, episodes, saved) {
    if (ep.open) return true;
    const prev = episodes.find((e) => e.num === ep.num - 1);
    return !!prev && prev.missions.filter((m) => m.core).every((m) => missionDone(m, saved));
  }
  // a mission opens when the one before it in its episode is done
  function missionUnlocked(episodes, id, saved) {
    const f = find(episodes, id); if (!f) return false;
    if (!episodeUnlocked(f.episode, episodes, saved)) return false;
    return f.index === 0 || missionDone(f.episode.missions[f.index - 1], saved);
  }
  // the mission after this one: the next in its episode, or the first of the next episode
  function nextMission(episodes, id) {
    const f = find(episodes, id); if (!f) return null;
    if (f.index + 1 < f.episode.missions.length) return f.episode.missions[f.index + 1];
    const next = episodes.find((e) => e.num === f.episode.num + 1);
    return next && next.missions[0] ? next.missions[0] : null;
  }

  // In class (PF-3): what the class's progress gives this student, applied to their record. cls = { now, finished }:
  // now = the class's mission and step (steps the class moved past count: the briefing, the lesson, and the mission when
  // it's a class event); finished = missions the class finished with this student in it (the reward and done). Returns
  // { record, changed } so a page only writes when something is new.
  function applyClass(record, cls, episodes, t) {
    const rec = record && record.missions ? record : emptyRecord();
    rec.rewards = rec.rewards || {};
    let changed = false;
    const now = cls && cls.now, f = now && find(episodes, now.mission);
    if (f) {
      const m = f.mission, k = STEPS.indexOf(now.step), r = (rec.missions[m.id] = rec.missions[m.id] || {});
      for (const s of ["briefing", "discover"].concat(m.mission.event ? ["mission"] : [])) if (STEPS.indexOf(s) < k && !r[s]) { r[s] = t; changed = true; }
      if (rec.last !== m.id) { rec.last = m.id; changed = true; }
    }
    for (const id of (cls && cls.finished) || []) {
      const g = find(episodes, id); if (!g) continue;
      const r = (rec.missions[id] = rec.missions[id] || {});
      if (r.done) continue;
      r.reward = r.reward || t; r.done = t;
      for (const x of g.mission.rewards || []) rec.rewards[x] = rec.rewards[x] || t;
      changed = true;
    }
    return { record: rec, changed };
  }
  // the missions the class finished with this player in it, from the server's { missionId: [playerIds] }
  const finishedFor = (done, playerId) => Object.keys(done || {}).filter((id) => (done[id] || []).includes(playerId));

  // problems with the story files, as sentences (an empty list means fine). `known` = { lessons: [ids],
  // missions: { id: { game, lesson } }, exists(path), assets: story-assets.json's assets } so the same check runs in
  // the tests and the browser
  function check(data, known) {
    const p = [], ids = new Set(), sceneIds = new Set(Object.keys(data.scenes)), rewardIds = new Set(data.rewards.map((r) => r.id)), lineIds = new Set();
    const idOk = (s) => typeof s === "string" && /^[a-z][a-z0-9-]*$/.test(s);
    const path = (where, v) => { if (v != null && (typeof v !== "string" || !v.startsWith("/assets/") || (known.exists && !known.exists(v)))) p.push(`${where}: ${v} isn't a picture or sound under /assets/ that exists`); };
    // art and sound in scenes: a path under /assets/, or an asset ID from the asset list (made or not yet) of the right kind
    const an = (w) => (/^[aeiou]/.test(w) ? "an " : "a ") + w;
    const ref = (where, v, kind) => {
      if (v == null) return;
      if (typeof v === "string" && v.startsWith("/")) return path(where, v);
      if (typeof v !== "string" || !/^[a-z][a-z0-9_]*$/.test(v)) return p.push(`${where}: ${JSON.stringify(v)} isn't a path under /assets/ or an asset ID`);
      if (!known.assets) return;
      const a = known.assets[v];
      if (!a) p.push(`${where}: there's no asset ${v} in story-assets.json`);
      else if (a.kind !== kind) p.push(`${where}: asset ${v} is ${an(a.kind)}, not ${an(kind)}`);
      else if (a.made && known.exists && !known.exists(a.file)) p.push(`${where}: asset ${v} says it's made, but ${a.file} doesn't exist`);
    };
    const nums = new Set();
    for (const ep of data.episodes) {
      if (!/^ep\d+$/.test(ep.id) || ep.id !== "ep" + ep.num) p.push(`episode ${ep.id}: the id must be ep + its number`);
      if (nums.has(ep.num)) p.push(`episode ${ep.id}: two episodes have number ${ep.num}`); nums.add(ep.num);
      if (!ep.title) p.push(`episode ${ep.id}: it needs a title`);
      if (!ep.map || !(ep.map.x >= 0 && ep.map.x <= 100 && ep.map.y >= 0 && ep.map.y <= 100)) p.push(`episode ${ep.id}: map x and y are percents of the map picture`);
      path(`episode ${ep.id}`, ep.art);
      if (!Array.isArray(ep.missions) || !ep.missions.length) p.push(`episode ${ep.id}: it needs missions`);
      for (const m of ep.missions || []) {
        const at = `mission ${m.id}`;
        if (!idOk(m.id) || !m.id.startsWith(ep.id + "-")) p.push(`${at}: the id must start with ${ep.id}-`);
        if (ids.has(m.id)) p.push(`${at}: the id is used twice`); ids.add(m.id);
        if (!m.title) p.push(`${at}: it needs a title`);
        if (!sceneIds.has(m.briefing)) p.push(`${at}: there's no briefing scene ${m.briefing}`);
        if (m.debrief != null && !sceneIds.has(m.debrief)) p.push(`${at}: there's no debrief scene ${m.debrief}`);
        if (!m.discover || !known.lessons.includes(m.discover.lesson)) p.push(`${at}: there's no lesson ${m.discover && m.discover.lesson}`);
        const b = m.build || {};
        if (!Array.isArray(b.missions) || !b.missions.length) p.push(`${at}: Build needs at least one mission`);
        for (const id of b.missions || []) {
          const mi = known.missions[id];
          if (!mi) p.push(`${at}: Build names a mission that doesn't exist: ${id}`);
          else if (m.discover && mi.lesson !== m.discover.lesson) p.push(`${at}: Build mission ${id} belongs to lesson ${mi.lesson}, not ${m.discover.lesson}`);
        }
        if (b.need != null && !(Number.isInteger(b.need) && b.need >= 1 && b.need <= (b.missions || []).length)) p.push(`${at}: Build's need must be between 1 and its number of missions`);
        const mm = m.mission || {};
        if (!!mm.mission === !!mm.event) p.push(`${at}: Mission is either a mission or a class event`);
        if (mm.mission && !known.missions[mm.mission]) p.push(`${at}: there's no mission ${mm.mission}`);
        if (mm.event && !EVENTS.includes(mm.event)) p.push(`${at}: there's no class event ${mm.event}`);
        for (const r of m.rewards || []) if (!rewardIds.has(r)) p.push(`${at}: there's no reward ${r}`);
      }
    }
    for (const [id, sc] of Object.entries(data.scenes)) {
      if (sc.id !== id) p.push(`scene ${id}: the id must match the file name`);
      if (sc.bg != null && sc.shots != null) p.push(`scene ${id}: use shots or bg, not both`);
      ref(`scene ${id}`, sc.bg, "image"); ref(`scene ${id} music`, sc.music, "music"); ref(`scene ${id} ambience`, sc.ambience, "ambience");
      const shots = Array.isArray(sc.shots) ? sc.shots : [];
      if (sc.shots != null && !shots.length) p.push(`scene ${id}: shots must be a list of at least one shot`);
      for (const [k, s] of shots.entries()) {
        const at = `scene ${id} shot ${k}`;
        if (!SHOT_KINDS.includes(s.kind)) p.push(`${at}: the kind must be ${SHOT_KINDS.join(" or ")}`);
        if (!s.art) p.push(`${at}: it needs art`);
        ref(at, s.art, s.kind === "video" ? "video" : "image");
        if (s.kind === "video") ref(`${at} poster`, s.poster, "image");
        else if (s.poster != null || s.loop != null) p.push(`${at}: only a video has a poster or loops`);
        if (s.move != null && (s.kind === "video" || !MOVES.includes(s.move))) p.push(`${at}: a still's move is ${MOVES.join(", ")} (a video has none)`);
        if (s.secs != null && !(s.secs > 0)) p.push(`${at}: secs is how long the move takes, in seconds`);
        if (s.look != null && !LOOKS.includes(s.look)) p.push(`${at}: the look must be ${LOOKS.join(" or ")}`);
        if (s.layers != null) { if (!Array.isArray(s.layers) || s.kind === "video") p.push(`${at}: layers are a list of pictures on a still`); else for (const l of s.layers) ref(`${at} layer`, l, "image"); }
      }
      const nShots = shots.length || (sc.bg ? 1 : 0);
      if (!Array.isArray(sc.lines) || !sc.lines.length) p.push(`scene ${id}: it needs lines`);
      for (const [k, ln] of (sc.lines || []).entries()) {
        const at = `scene ${id} line ${k + 1}`, kind = ln.kind == null ? "line" : ln.kind;
        if (!LINE_KINDS.includes(kind)) p.push(`${at}: the kind must be ${LINE_KINDS.join(", ")}`);
        if (kind === "narration") { if (ln.who != null || ln.face != null) p.push(`${at}: narration has no speaker or face`); }
        else {
          const c = data.characters[ln.who];
          if (!c) p.push(`${at}: there's no character ${ln.who}`);
          else if (ln.face != null && !c.faces[ln.face]) p.push(`${at}: ${ln.who} has no face ${ln.face}`); // no face: a voice with no picture
        }
        if (kind === "beeps" && ln.who !== "volt") p.push(`${at}: only Volt beeps`);
        if (ln.feel != null && (kind !== "beeps" || !FEELS.includes(ln.feel))) p.push(`${at}: feel is for Volt's beeps: ${FEELS.join(", ")}`);
        if (!ln.text || (typeof ln.text === "object" && !ln.text.recruit)) p.push(`${at}: it needs text (Recruit at least)`);
        if (ln.id != null) { if (!idOk(ln.id)) p.push(`${at}: the line id must be lowercase words with dashes`); else if (lineIds.has(ln.id)) p.push(`${at}: the line id ${ln.id} is used twice`); lineIds.add(ln.id); }
        if (ln.shot != null && !(Number.isInteger(ln.shot) && ln.shot >= 0 && ln.shot < nShots)) p.push(`${at}: shot is a place in the scene's shots, 0 to ${nShots - 1}`);
        if (ln.voice != null && typeof ln.voice === "object") for (const [t, v] of Object.entries(ln.voice)) { if (!LEVELS.includes(t)) p.push(`${at}: voice levels are ${LEVELS.join(", ")}`); ref(`${at} voice`, v, "voice"); }
        else ref(`${at} voice`, ln.voice, "voice");
        if (ln.sfx != null) { if (!Array.isArray(ln.sfx)) p.push(`${at}: sfx is a list of sounds`); else for (const s of ln.sfx) ref(`${at} sound`, s, "sfx"); }
        if ("music" in ln) ref(`${at} music`, ln.music, "music");
      }
    }
    for (const [id, c] of Object.entries(data.characters)) { if (!c.name) p.push(`character ${id}: it needs a name`); for (const f of Object.values(c.faces || {})) path(`character ${id}`, f); }
    for (const r of data.rewards) {
      if (!idOk(r.id)) p.push(`reward ${r.id}: the id must be lowercase words with dashes`);
      if (!REWARD_KINDS.includes(r.kind)) p.push(`reward ${r.id}: the kind must be ${REWARD_KINDS.join(", ")}`);
      if (!r.title || !r.text) p.push(`reward ${r.id}: it needs a title and text`);
      path(`reward ${r.id}`, r.art);
    }
    return p;
  }
  const EVENTS = ["labchallenge", "raceday", "speedrun", "tournament"]; // class events a Mission step can be (PF-3)
  const REWARD_KINDS = ["echo", "volt", "file", "access"];
  // the scene format the story player plays (storyplayer.js, ST-2)
  const SHOT_KINDS = ["still", "video"], MOVES = ["push", "pull", "pan-left", "pan-right", "drift"], LOOKS = ["camera"];
  const LINE_KINDS = ["line", "narration", "beeps"], FEELS = ["happy", "sad", "curious", "scared", "excited", "thinking"];
  const LEVELS = ["cadet", "recruit", "operative"];

  return { STEPS, STEP_NAME, EVENTS, REWARD_KINDS, SHOT_KINDS, MOVES, LOOKS, LINE_KINDS, FEELS, emptyRecord, find, stepDone, stepOpen, nextStep, missionDone, episodeUnlocked, missionUnlocked, nextMission, applyClass, finishedFor, check };
});
