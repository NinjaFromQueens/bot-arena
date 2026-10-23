// Music tests: every track pattern is well-formed (16 steps a bar, known tokens), so a typo can't silently shift the beat.
const assert = require("assert");
const { TRACKS } = require("../public/js/music.js");
const INS = ["bass", "lead", "arp", "pad", "drums"];

for (const [name, tr] of Object.entries(TRACKS)) {
  assert(tr.bpm >= 60 && tr.bpm <= 200, `${name}: bpm ${tr.bpm} is out of range`);
  tr.chords.forEach((c) => assert(/^[A-G][#b]?m?$/.test(c), `${name}: unknown chord "${c}"`));
  tr.parts.forEach((p, k) => {
    assert(INS.includes(p.ins), `${name} part ${k + 1}: unknown instrument "${p.ins}"`);
    p.rows.forEach((row, b) => {
      if (!row) return;
      const at = `${name} ${p.ins} pattern ${b + 1}`;
      assert.strictEqual(row.length, 16, `${at}: has ${row.length} steps, needs 16`);
      assert.notStrictEqual(row[0], "-", `${at}: starts with a hold, which plays nothing`);
      row.forEach((tok) => {
        const ok = tok === "." || tok === "-" || (p.ins === "drums" ? /^[ksh]+$/.test(tok) : tok === "c" || /^[0-5]$/.test(tok) || /^[A-G][#b]?\d$/.test(tok));
        assert(ok, `${at}: unknown token "${tok}"`);
      });
    });
  });
}
console.log("Music tests passed");
