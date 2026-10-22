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
console.log("All tests passed");
