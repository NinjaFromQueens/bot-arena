// Plays many random brackets to make sure every size finishes with one champion
// and the battle sim is deterministic for a given seed.
const assert = require("assert");
const T = require("../lib/tournament.js");
const Engine = require("../public/js/engine.js");

for (let n = 2; n <= 40; n++) {
  const ids = Array.from({ length: n }, (_, i) => "p" + i);
  const br = T.createBracket(ids);
  let played = 0, nm;
  while ((nm = T.nextMatch(br))) {
    assert(nm.match.a && nm.match.b, "match has two players");
    T.setWinner(br, nm.r, nm.m, Math.random() < 0.5 ? nm.match.a : nm.match.b);
    played++;
  }
  const champ = T.champion(br);
  assert(champ && ids.includes(champ), `champion exists for n=${n}`);
  // every real match knocks out exactly one player
  assert.strictEqual(played, n - 1, `n=${n} should play ${n - 1} matches`);
}

const a = { name: "A", body: 1, sensor: 2, brain: 0, tool: 1, color: 0 };
const b = { name: "B", body: 0, sensor: 0, brain: 2, tool: 2, color: 1 };
for (let s = 0; s < 200; s++) {
  const x = Engine.simulate(a, b, s), y = Engine.simulate(a, b, s);
  assert.strictEqual(x.winner, y.winner); assert.strictEqual(x.events.length, y.events.length);
}
assert.strictEqual(Engine.sanitizeBot({ name: "x", body: 1, sensor: 0, brain: 0, tool: 1, color: 0 }), null, "overweight bot rejected");
// bot codes: old codes still work; Custom brain rules ride along as -RRR (condition, number, move) and are validated
assert.deepStrictEqual(Engine.parseCode("zap-21013"), { name: "ZAP", body: 2, sensor: 1, brain: 0, tool: 1, color: 3 }, "old code");
const ruled = Engine.parseCode("RULEZ-20304-401322113");
assert.deepStrictEqual(ruled.rules, [{ c: 4, v: 0, a: 1 }, { c: 3, v: 2, a: 2 }, { c: 1, v: 1, a: 3 }], "rules parsed");
assert.strictEqual(Engine.codeOf(ruled), "RULEZ-20304-401322113", "code round trip");
assert.deepStrictEqual(Engine.parseCode("RULEZ-20304").rules, Engine.RULES.defaults, "Custom brain without rules gets the defaults");
assert.strictEqual(Engine.codeOf({ ...ruled, rules: [] }), "RULEZ-20304-000", "no rules is written as always attack");
for (const bad of ["RULEZ-20304-999", "RULEZ-20304-35", "RULEZ-20304-0010010010012", "RULEZ-20304-302-"]) assert.strictEqual(Engine.parseCode(bad), null, "bad rules code " + bad);
assert.strictEqual(Engine.parseCode("ZAP-21013-001").rules, undefined, "rules are dropped for other brains");
assert.strictEqual(Engine.sanitizeBot({ ...ruled, rules: [{ c: 1, v: 3, a: 0 }] }), null, "number out of range");
assert.strictEqual(Engine.sanitizeBot({ ...ruled, rules: Array(4).fill({ c: 0, v: 0, a: 1 }) }), null, "at most 3 rules");
for (let s = 1; s <= 50; s++) { const x = Engine.simulate(ruled, Engine.parseCode("ZAP-21013"), s), y = Engine.simulate(ruled, Engine.parseCode("ZAP-21013"), s); assert.strictEqual(x.winner, y.winner); assert.deepStrictEqual(x.events, y.events); }
console.log("All tests passed");
