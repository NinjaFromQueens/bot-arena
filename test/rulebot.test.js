// The robot vacuum lesson: what the cards and experiments say has to be what the simulator does.
const assert = require("assert");
const R = require("../public/js/rulebot.js");
const P = (s) => s.split(",").filter(Boolean).map((t) => ({ c: +t[0], a: +t[1] }));

// the starting rule drives into the wall and keeps bumping
const start = R.run(R.START);
assert(start.bumps >= 1 && start.loop && !start.fell && !start.allClean, "the starting rule should keep bumping the wall");
// a wall rule under "IF always" never runs: same result as before
const wrongOrder = R.run(P("00,11"));
assert.deepStrictEqual(wrongOrder.frames, start.frames, "a rule below IF always must never run");
assert.deepStrictEqual(R.unreachable(P("00,11")), [1]);
// wall rule on top: it turns at the wall, then falls down the stairs
const walls = R.run(P("11,00"));
assert(walls.wallTurn && walls.fell, "with only a wall rule it should turn at walls and then fall down the stairs");
// stairs rule too: no fall, but it drives past the dirt
const safe = R.run(P("21,11,00"));
assert(!safe.fell && safe.metStairs && safe.bumps === 0 && !safe.allClean && safe.loop, "stairs + wall rules: safe, but the dirt stays and it goes in circles");
// the full program cleans every spot without falling
const full = R.run(P("33,21,11,00"));
assert(full.allClean && !full.fell && full.bumps === 0, "the full program should clean the room");
// cleaning under "always" never happens
assert(!R.run(P("21,11,00,33")).allClean, "a clean rule at the bottom never runs");
// the dirt rule works anywhere above "always", even under the other two
assert(R.run(P("21,11,33,00")).allClean, "clean rule above always should work");
// turning left at the stairs gets it stuck between the stairs and the wall: safe but it can't finish
const left = R.run(P("33,22,11,00"));
assert(!left.fell && !left.allClean && left.loop, "turning left at the stairs should leave dirt behind");
assert(full.frames.length < 30 && R.run(P("21,11,00")).frames.length < 30, "runs stay short enough to watch");
console.log("Rulebot tests passed");
