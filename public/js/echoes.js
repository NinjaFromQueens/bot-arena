/*
 * Echo Lab's model (ECHO-1, docs/echo-lab-plan.md): is a recovered Echo real, or did OMNI alter it? A case is a picture
 * plus its evidence: the things in it (each with where it is in the picture), the year it says it's from, its copies on
 * other servers, the direction of the light, and (for Operatives) its file record. proofs() finds every sign of an edit
 * with the same three checks lesson I1 teaches (a date that can't be right, a shadow that doesn't match, copies that
 * disagree) plus the file record, so a verdict can't disagree with the lesson, and a case never stores its answer.
 * UMD: the Echo Lab page, the server (it re-checks class verdicts) and test/echoes.test.js all load it.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Echoes = factory();
})(typeof self !== "undefined" ? self : this, function () {
  // the first year each thing could be in a picture, from the bible's timeline (the Spire, the maglev and the Grid's
  // years were added to the bible on Nov 27, 2026, decision 7 of the plan)
  const TIMELINE = {
    omni: { name: "OMNI's hexagon", year: 2036, why: "OMNI was switched on in 2036" },
    spire: { name: "the Spire on Spire Island", year: 2036, why: "OMNI's tower went up with OMNI, in 2036" },
    maglev: { name: "a maglev train", year: 2040, why: "OMNI's maglev opened in 2040" },
    risk: { name: "a risk rating", year: 2042, why: "OMNI started giving people risk ratings in 2042" },
    warden: { name: "a Warden", year: 2046, why: "Wardens came into the streets on the Day of Silence, in 2046" },
    grid: { name: "the Grid's white towers", year: 2047, why: "the Grid was built after the Day of Silence, from 2047" },
    seal: { name: "a hexagon lock on a church door", year: 2047, why: "OMNI sealed every church in 2047" },
  };
  const SHADOW_SLACK = 30; // degrees: shadows in one photo can differ a little, never this much
  const DAY_OF_SILENCE = 2046; // after it, OMNI's archive is the only one saving anything
  const TELLS = ["date", "shadow", "copies", "record"];
  const LEVELS = ["cadet", "recruit", "operative"];
  const T = (v, t) => (v && typeof v === "object" ? (v[t] != null ? v[t] : v.recruit) : v);

  // the cases and sets the page or server loaded (public/data/echoes): use(cases, sets)
  const CASES = {}, SETS = {};
  function use(cases, sets) { for (const c of cases || []) CASES[c.id] = c; Object.assign(SETS, sets || {}); }
  const caseOf = (id) => CASES[id] || null;
  const setOf = (id) => (SETS[id] ? { id, cases: SETS[id].cases.map(caseOf), title: SETS[id].title } : null);

  // how far apart two directions are, in degrees (0 to 180)
  const apart = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
  const copyOf = (c) => (c.copies || []).find((k) => k.id === c.checks) || null;
  const thingOf = (it) => (it.thing && TIMELINE[it.thing]) || null;

  // every sign this Echo was altered (none means it's real), and the clue that shows each one
  function proofs(c) {
    const out = [];
    for (const it of c.items || []) {
      const th = thingOf(it);
      if (th && th.year > c.year) out.push({ tell: "date", item: it.id, clue: "item:" + it.id, year: th.year });
      if (it.shadow != null && c.light != null && apart(it.shadow, c.light) > SHADOW_SLACK) out.push({ tell: "shadow", item: it.id, clue: "light" });
    }
    // copies: on each detail they disagree about, the version most copies share is the original; the checked copy
    // showing anything else was edited (a tie proves nothing)
    const mine = copyOf(c), copies = c.copies || [];
    if (mine && copies.length >= 3) for (const key of Object.keys(mine.shows || {})) {
      const n = {}; for (const k of copies) n[k.shows[key]] = (n[k.shows[key]] || 0) + 1;
      const top = Object.entries(n).sort((a, b) => b[1] - a[1]);
      if (top[0][0] !== mine.shows[key] && top[0][1] > (top[1] ? top[1][1] : 0)) out.push({ tell: "copies", detail: key, clue: "copies", most: top[0][0], mine: mine.shows[key] });
    }
    for (const [i, r] of (c.record || []).entries()) if (r.what === "edited" && r.when > DAY_OF_SILENCE) out.push({ tell: "record", entry: i, clue: "record", when: r.when });
    return out;
  }
  const altered = (c) => proofs(c).length > 0;

  // what a student can check on a case at a level: each thing in the picture, the light, the copies, the record
  function clues(c, tier = "recruit") {
    const out = (c.items || []).map((it) => "item:" + it.id);
    if ((c.items || []).some((it) => it.shadow != null)) out.push("light");
    if ((c.copies || []).length >= 2) out.push("copies");
    if ((c.record || []).length && tier === "operative") out.push("record");
    return out;
  }
  // a verdict counts as checked when the student looked at a clue that proves it (altered), or at least one clue (real)
  function backed(c, checked) {
    const p = proofs(c);
    return p.length ? p.some((x) => checked.includes(x.clue)) : checked.length > 0;
  }
  const cleanChecked = (c, list) => (Array.isArray(list) ? [...new Set(list.filter((x) => typeof x === "string" && clues(c, "operative").includes(x)))] : clues(c, "operative"));

  // one case judged: the student's verdict (0 real, 1 altered) and the clues they checked (none given: a careful checker
  // who looked at everything, like the Racer's computer driver)
  function judge(c, verdict, checked) {
    const truth = altered(c) ? 1 : 0, ch = cleanChecked(c, checked);
    return { truth, verdict, right: verdict === truth, backed: backed(c, ch), checked: ch.length };
  }

  // the mission engine's view (missions.js): a mission's setting is a case or a set of cases; the choice is the verdict
  // (or one verdict per case, v1..vN, for a set); the run carries the clues checked
  const MISSION = {
    setting: (id) => caseOf(id) || setOf(id),
    clamp: (c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v) === 1 ? 1 : 0])),
    run: (m, ch, run) => {
      const s = setOf(m.setting);
      if (!s) return judge(caseOf(m.setting), ch.verdict, run && run.checked);
      const each = s.cases.map((c, i) => judge(c, ch["v" + (i + 1)], run && Array.isArray(run.checked) ? run.checked[i] : undefined));
      return { each, right: each.filter((r) => r.right).length, all: each.length };
    },
    predict: {
      realOrAltered: {
        options: (m, tier) => [{ value: 0, label: tier === "cadet" ? "Real" : "Real" }, { value: 1, label: tier === "cadet" ? "Changed" : "Altered" }],
        answer: (m) => (altered(caseOf(m.setting)) ? 1 : 0),
      },
      howManyAltered: {
        options: (m) => setOf(m.setting).cases.map((_, i) => i).concat(setOf(m.setting).cases.length).map((n) => ({ value: n, label: n === 0 ? "None" : n === setOf(m.setting).cases.length ? `All ${n}` : String(n) })),
        answer: (m) => setOf(m.setting).cases.filter(altered).length,
      },
    },
    goal: {
      verdictRight: { met: (m, r) => r.right && r.backed },
      allRight: { met: (m, r) => r.each.every((x) => x.right && x.backed) },
    },
  };

  // the words for one proof, at a reading level (the lesson's words; tested in test/echoes.test.js)
  function proofText(c, p, tier) {
    const it = (c.items || []).find((x) => x.id === p.item), name = it ? T(it.name, tier) : "";
    if (p.tell === "date") {
      const th = TIMELINE[it.thing];
      return tier === "cadet" ? `${name} wasn't made yet in ${c.year}. Someone added it later.`
        : tier === "operative" ? `${name} shows ${th.name}. ${th.why[0].toUpperCase() + th.why.slice(1)}, ${th.year - c.year} years after this Echo's date (${c.year}). It can't be in the picture.`
        : `${name} shows ${th.name}, and ${th.why}. This Echo says ${c.year}, so it can't be in the picture.`;
    }
    if (p.tell === "shadow") return tier === "cadet" ? `${name}'s shadow points the wrong way. It was stuck in later.` : `${name}'s shadow points a different way from every other shadow. In one photo, every shadow points away from the same light, so it was pasted in.`;
    if (p.tell === "copies") {
      const n = (c.copies || []).filter((k) => k.shows[p.detail] === p.most).length;
      return tier === "cadet" ? `The other copies don't match this one. This one was changed.` : `${n} of ${c.copies.length} copies show ${p.most}; this copy shows ${p.mine}. When copies disagree, trust what most of them agree on.`;
    }
    const r = c.record[p.entry];
    return `The file record says ${r.who} edited this copy in ${r.when}, after the Day of Silence. Only OMNI's archive was saving anything then.`;
  }

  // what a student reads when they check a clue: the evidence itself, never the verdict (they draw the conclusion)
  function clueText(c, clue, tier = "recruit") {
    const say = (cadet, recruit, operative) => T({ cadet, recruit, operative: operative || recruit }, tier);
    if (clue.startsWith("item:")) {
      const it = (c.items || []).find((x) => "item:" + x.id === clue); if (!it) return "";
      const name = T(it.name, tier), th = thingOf(it);
      if (!th) return say(`${name}. Nothing about it is new: people had these long ago.`, `${name}. Nothing about it is newer than the Echo's date.`, `${name}. Nothing in it dates it later than the Echo's date.`);
      return say(`${name}. That's ${th.name}. It was first made in ${th.year}.`, `${name}. That's ${th.name}: ${th.why}.`, `${name}. That's ${th.name}, first seen in ${th.year} (${th.why}).`);
    }
    if (clue === "light") return say("The arrows show which way each shadow points. Do they all point the same way?", "The arrows show which way each shadow points. In one photo, every shadow points away from the same light.", "Each arrow is a shadow's direction. One light source means every shadow points the same way, give or take a little.");
    if (clue === "copies") return say("Here are the other copies. Do they match this one?", "The copies side by side, with what each one shows. When copies disagree, trust what most of them agree on.", "Every copy, its server and when it was saved. Independent copies that agree outweigh the odd one out.");
    if (clue === "record") return "The file record: who saved this copy, and when. An edit by OMNI's archive after 2046 is a warning sign.";
    return "";
  }

  // the explain card (cards.js): the verdict, why, whether the call came after a clue that shows it, and the check to try
  function explain(c, verdict, checked, tier = "recruit") {
    const p = proofs(c), truth = p.length ? 1 : 0, ch = cleanChecked(c, checked), right = verdict === truth, isBacked = backed(c, ch);
    const say = (cadet, recruit, operative) => T({ cadet, recruit, operative: operative || recruit }, tier);
    const items = [];
    if (truth) p.filter((x) => x.tell !== "record" || tier === "operative").forEach((x) => items.push({ tone: "bad", title: { date: say("Too new", "A date that can't be right"), shadow: say("Wrong shadow", "A shadow that doesn't match"), copies: say("Copies don't match", "Copies that disagree"), record: "The file record" }[x.tell], text: proofText(c, x, tier), terms: ["altered", "evidence"] }));
    else items.push({ tone: "good", title: say("Nothing changed", "Every check came back clean"), text: say(`Nothing in it is newer than ${c.year}, and nothing looks stuck in.`, `Nothing in it is newer than ${c.year}${(c.items || []).some((it) => it.shadow != null) ? ", every shadow points away from the same light" : ""}${(c.copies || []).length >= 2 ? ", and the copies agree" : ""}.`), terms: ["evidence"] });
    items.push(isBacked
      ? { tone: "good", title: say("You checked first", "You checked before you decided"), text: truth ? say("You found the clue before you chose.", `You looked at the clue that proves it before deciding.`) : say("You looked before you chose.", "You looked at the evidence before deciding, and none of it showed an edit.") }
      : { tone: "info", title: say("Check first next time", "Decide after you check"), text: truth ? say("You chose before finding the clue. Look first!", "You decided before checking the clue that proves it. A right guess isn't proof.") : say("You chose before looking. Look first!", "You decided before checking any evidence. A right guess isn't proof.") });
    const first = p.find((x) => x.tell !== "record");
    const tip = truth
      ? { date: say("Tap the things in a picture and check when they were made.", "Check the things in a picture against its date first: anything newer than the date is proof."), shadow: say("Press Show the light and look at every shadow.", "Press Show the light: every shadow in a real photo points away from the same light."), copies: say("Look at the other copies.", "Compare copies: the one that doesn't match the others is the edited one.") }[first.tell]
      : say("Real ones pass every check. Try another Echo!", "Real Echoes pass every check. Keep checking each one before it leaves the Archive.");
    return { headline: { tone: right ? "good" : "bad", text: right ? (truth ? say("Right! It was changed.", "Right: altered.") : say("Right! It's real.", "Right: real.")) : (truth ? say("Not quite. It was changed.", "Not quite: this one was altered.") : say("Not quite. It's real.", "Not quite: this one is real.")) }, items, tip: { text: tip }, right, backed: isBacked };
  }

  // problems with a case file, as sentences (an empty list means fine)
  function check(c) {
    const p = [], at = `case ${c && c.id}`;
    if (!c || !/^[a-z][a-z0-9-]*$/.test(c.id || "")) return ["a case needs an id of lowercase words with dashes"];
    if (!Number.isInteger(c.year) || c.year < 2000 || c.year > 2060) p.push(`${at}: year must be the year it says it's from`);
    if (!c.title || !T(c.title, "recruit")) p.push(`${at}: it needs a title`);
    if (!c.picture) p.push(`${at}: it needs a picture (an asset ID)`);
    if (!Array.isArray(c.items) || !c.items.length) p.push(`${at}: it needs things in the picture to check`);
    const ids = new Set();
    for (const it of c.items || []) {
      if (!it.id || ids.has(it.id)) p.push(`${at}: every thing needs its own id`); ids.add(it.id);
      if (!T(it.name, "recruit")) p.push(`${at} ${it.id}: it needs a name`);
      if (!(it.x >= 0 && it.x <= 100 && it.y >= 0 && it.y <= 100 && it.r > 0 && it.r <= 30)) p.push(`${at} ${it.id}: x, y and r are percents of the picture`);
      if (it.thing != null && !TIMELINE[it.thing]) p.push(`${at} ${it.id}: there's no ${it.thing} in the timeline`);
      if (it.shadow != null && !(it.shadow >= 0 && it.shadow < 360)) p.push(`${at} ${it.id}: shadow is a direction in degrees`);
    }
    if ((c.items || []).some((it) => it.shadow != null) && !(c.light >= 0 && c.light < 360)) p.push(`${at}: a case with shadows needs the light's direction`);
    if (c.copies != null) {
      if (!Array.isArray(c.copies) || c.copies.length < 2) p.push(`${at}: copies are a list of at least two`);
      else {
        if (!copyOf(c)) p.push(`${at}: checks must name the copy the student is looking at`);
        const keys = JSON.stringify(Object.keys(c.copies[0].shows || {}).sort());
        for (const k of c.copies) if (!k.id || !k.server || !Number.isInteger(k.saved) || !k.picture || JSON.stringify(Object.keys(k.shows || {}).sort()) !== keys) p.push(`${at}: every copy needs an id, server, saved year, picture, and the same details`);
      }
    }
    const pr = c.items ? proofs(c) : [];
    if (pr.length && pr.every((x) => x.tell === "record")) p.push(`${at}: only the file record shows the edit, which Cadets and Recruits never see`);
    if (c.teaches && !pr.some((x) => x.tell === c.teaches)) p.push(`${at}: it teaches ${c.teaches}, but no ${c.teaches} check proves an edit`);
    if (c.teaches && !TELLS.includes(c.teaches)) p.push(`${at}: teaches is one of ${TELLS.join(", ")}`);
    for (const t of LEVELS) if (c.tiers && c.tiers[t] && typeof c.tiers[t] !== "object") p.push(`${at}: tiers.${t} is an object`);
    return p;
  }

  return { TIMELINE, TELLS, SHADOW_SLACK, DAY_OF_SILENCE, use, caseOf, setOf, proofs, altered, clues, backed, judge, MISSION, proofText, clueText, explain, check, apart };
});
