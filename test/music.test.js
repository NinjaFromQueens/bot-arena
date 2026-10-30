// Music tests: every track is well-formed (16 steps a bar, known tokens, parts that fit the chord loop),
// so a typo can't silently shift the beat, and every sound effect the pages ask for exists.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { TRACKS } = require("../public/js/music.js");
const E = require("../public/js/engine.js");
const INS = ["pulse", "tri", "arp", "drums"];
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, ACC = { "#": 1, b: -1, "": 0 };
const midi = (tok) => { const [, l, a, o] = /^([A-G])([#b]?)(\d)$/.exec(tok); return 12 * (+o + 1) + NAMES[l] + ACC[a]; };

for (const scene of ["garage", "hype", "fight", "champion"]) assert(TRACKS[scene], `host.js plays "${scene}", so it needs a track`);
for (const [name, tr] of Object.entries(TRACKS)) {
  assert(tr.bpm >= 60 && tr.bpm <= 200, `${name}: bpm ${tr.bpm} is out of range`);
  tr.chords.forEach((c) => assert(/^[A-G][#b]?m?$/.test(c), `${name}: unknown chord "${c}"`));
  tr.parts.forEach((p, k) => {
    const part = `${name} part ${k + 1} (${p.ins})`;
    assert(INS.includes(p.ins), `${part}: unknown instrument`);
    assert(tr.chords.length % p.rows.length === 0, `${part}: ${p.rows.length} patterns don't fit evenly into ${tr.chords.length} bars, so it would drift out of step`);
    if (p.duty !== undefined) assert([0.125, 0.25, 0.5].includes(p.duty), `${part}: duty must be 0.125, 0.25 or 0.5`);
    if (p.echo) assert(p.echo.length === 2 && p.echo[0] >= 1 && p.echo[0] <= 8 && p.echo[1] > 0 && p.echo[1] < 1, `${part}: echo is [steps 1-8, level under 1]`);
    if (p.gate !== undefined) assert(p.gate > 0 && p.gate <= 1, `${part}: gate is a fraction of the note`);
    assert(p.vol > 0 && p.vol <= 0.6, `${part}: volume out of range`);
    p.rows.forEach((row, b) => {
      if (!row) return;
      const at = `${part} pattern ${b + 1}`;
      assert.strictEqual(row.length, 16, `${at}: has ${row.length} steps, needs 16`);
      assert.notStrictEqual(row[0], "-", `${at}: starts with a hold, which plays nothing`);
      row.forEach((tok) => {
        const ok = tok === "." || tok === "-" || (p.ins === "drums" ? /^[kshoxt]+$/.test(tok) : tok === "c" || /^[0-5]$/.test(tok) || /^[A-G][#b]?\d$/.test(tok));
        assert(ok, `${at}: unknown token "${tok}"`);
        if (/^[A-G]/.test(tok)) { const m = midi(tok) + (p.oct || 0); assert(m >= 36 && m <= 96, `${at}: ${tok} is too low or too high to sound good`); }
      });
    });
  });
}
// every Sound.play("name") in the pages has a sound behind it
const used = new Set();
for (const f of fs.readdirSync(path.join(__dirname, "../public/js"))) for (const m of fs.readFileSync(path.join(__dirname, "../public/js", f), "utf8").matchAll(/Sound\.play\("([a-z]+)"\)/g)) used.add(m[1]);
for (const n of used) assert(E.Sound.names.includes(n), `pages play the sound "${n}", but engine.js has no such sound`);
console.log(`Music tests passed (${Object.keys(TRACKS).length} tracks, ${E.Sound.names.length} sound effects)`);
