/*
 * The mission engine, shared by the browser, the server and the tests. Mission files (public/data/missions/<id>.json)
 * say what a student may change, what they predict and what counts as done; they never hold an answer. Each game's
 * model (race.js today) has a MISSION object that works out the right answer and checks the goal by running its own
 * physics, so a retune can't make a mission wrong. test/missions.test.js runs every mission with every allowed choice.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Missions = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const games = {};
  const register = (game, model) => { games[game] = model; };
  const model = (m) => games[m.game];

  // the choices for a run: the mission's start, with each allowed value the student picked (anything else is ignored)
  function choice(m, c) {
    const out = Object.assign({}, m.start);
    for (const k in m.allow) { const v = c == null ? NaN : Number(c[k]); if (m.allow[k].includes(v)) out[k] = v; }
    return model(m).clamp(out);
  }
  // what the prediction is about: the student's choice, or a fixed setup the mission names
  const about = (m, c) => (m.predict.with && m.predict.with !== "choice" ? model(m).clamp(m.predict.with) : choice(m, c));
  const kind = (m) => model(m).predict[m.predict.kind];

  // problems with a mission file, as sentences (an empty list means it's fine)
  function check(m, lessons) {
    const p = [], g = m && games[m.game];
    if (!m || typeof m.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(m.id)) p.push("the id must be lowercase words with dashes");
    if (!g) return p.concat(`there's no game called ${m && m.game}`);
    if (lessons && !lessons.includes(m.lesson)) p.push(`there's no lesson called ${m.lesson}`);
    if (!g.setting(m.setting)) p.push(`the ${m.game} model has no setting called ${m.setting}`);
    if (!m.allow || typeof m.allow !== "object" || !Object.keys(m.allow).length) p.push("allow needs at least one choice");
    else for (const k in m.allow) {
      if (!Array.isArray(m.allow[k]) || !m.allow[k].length) p.push(`allow.${k} needs a list of values`);
      else if (!m.start || !m.allow[k].includes(m.start[k])) p.push(`start.${k} must be one of the allowed values`);
    }
    if (!m.predict || !g.predict[m.predict.kind]) p.push(`the ${m.game} model has no prediction called ${m.predict && m.predict.kind}`);
    if (!m.goal || !g.goal[m.goal.kind]) p.push(`the ${m.game} model has no goal called ${m.goal && m.goal.kind}`);
    if (!m.tiers || !m.tiers.recruit || !m.tiers.recruit.brief || !m.tiers.recruit.question) p.push("it needs Recruit text: a brief and a question");
    if ("answer" in m || (m.predict && "answer" in m.predict)) p.push("a mission never stores its answer: the model works it out");
    return p;
  }

  const options = (m, tier) => kind(m).options(m, tier);
  const answer = (m, c) => kind(m).answer(m, about(m, c));
  // the answer is too close to the line between two options to ask about (a small retune could flip it)
  const close = (m, c) => !!(kind(m).close && kind(m).close(m, about(m, c)));
  // run it (with the student's inputs when they drove), and whether it met the goal
  function result(m, c, run) {
    const r = model(m).run(m, choice(m, c), run);
    return { result: r, goal: !!model(m).goal[m.goal.kind].met(m, r) };
  }
  // mission text for a reading level, falling back to the Recruit text
  const text = (m, field, tier) => { const t = m.tiers[tier]; return t && t[field] != null ? t[field] : m.tiers.recruit[field]; };
  // which allowed choices changed between two tries (the one-change tracker)
  function changes(m, before, after) {
    const a = choice(m, before), b = choice(m, after), keys = Object.keys(m.allow).filter((k) => a[k] !== b[k]);
    return { n: keys.length, keys };
  }
  // every combination of the allowed choices
  const allChoices = (m) => Object.keys(m.allow).reduce((list, k) => list.flatMap((c) => m.allow[k].map((v) => Object.assign({}, c, { [k]: v }))), [{}]);

  return { register, check, choice, options, answer, close, result, text, changes, allChoices };
});
