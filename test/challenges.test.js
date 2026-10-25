// Brain challenges: every answer the hints give must win, naive rules must lose, and no single rule beats the final boss.
const assert = require("assert");
const E = require("../public/js/engine.js");
const C = require("../public/js/challenges.js");

for (const ch of C.LIST) {
  const [you, boss] = C.bots(ch, []);
  assert(you && boss, `${ch.id}: robot codes must be legal`);
  assert(you.brain === E.PARTS.brain.findIndex((b) => b.custom), `${ch.id}: the student's robot needs the Custom brain`);
  const ans = C.run(ch, C.rulesOf(ch.answer));
  assert(ans.passed, `${ch.id}: the answer (${ch.answer}) only wins ${ans.wins}/${C.FIGHTS}`);
  for (const n of ch.naive) {
    const r = C.run(ch, C.rulesOf(n));
    assert(!r.passed, `${ch.id}: naive rules "${n || "none"}" win ${r.wins}/${C.FIGHTS}, so the challenge is too easy`);
  }
  assert(ch.hints.length >= 2 && ch.intro && ch.lesson, `${ch.id}: needs an intro, hints and a lesson`);
}
// the final boss needs more than one rule
const mega = C.LIST.find((c) => c.id === "mega");
E.RULES.IF.forEach((cond, c) => (cond.v || [0]).forEach((_, v) => E.RULES.DO.forEach((_, a) => {
  assert(!C.run(mega, [{ c, v, a }]).passed, `mega: a single rule (${c}${v}${a}) beats the final boss`);
})));
// claims in the challenge text
const hitChance = (a, b) => E.simulate(a, b, 1).events.find((e) => e.kind === "sense" && e.me === 0).txt.match(/(\d+)% chance/)[1] / 100;
const ghost = C.LIST.find((c) => c.id === "ghost");
const gc = hitChance(...C.bots(ghost, []));
assert(gc > 0.2 && gc < 0.3, `ghost: "your Hammer only hits about 1 swing in 4" (${gc})`);
const bruiser = C.LIST.find((c) => c.id === "bruiser");
assert(hitChance(...C.bots(bruiser, [])) >= 0.85, "bruiser: \"you hit about 9 times out of 10\"");
const mc = hitChance(...C.bots(mega, []));
assert(mc < 0.4, `mega: the hit-chance hint needs your chance below 40% (${mc})`);
const smasher = C.LIST.find((c) => c.id === "smasher"), [sy, sb] = C.bots(smasher, []);
assert(hitChance(sb, sy) < 0.4, "smasher: \"it misses a lot\"");
const sHits = []; for (let s = 1; s < 200; s++) E.simulate(sy, sb, s).events.forEach((e) => e.kind === "act" && e.me === 1 && e.hits && sHits.push(e.dmg));
const avg = sHits.reduce((x, y) => x + y, 0) / sHits.length;
assert(avg > 28 && avg < 40, `smasher: "one hit takes about a third of your health" (average hit ${avg.toFixed(1)})`);
assert(E.PARTS.body[C.bots(mega, [])[0].body].low && E.PARTS.tool[C.bots(mega, [])[1].tool].flip, "mega: \"your Wedge is too low to flip\"");
console.log(`Challenge tests passed (${C.LIST.length} challenges)`);
