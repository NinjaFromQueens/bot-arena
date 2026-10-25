/*
 * The robot vacuum in the "Think: if-then rules" lesson — shared by the browser and Node tests.
 * A grid room. Every turn the vacuum checks its rules top to bottom and does the first one that's true;
 * if none fit, it waits. A run stops when the vacuum is back in a spot, heading and dirt count it has been in before:
 * the rules always pick the same thing there, so it would go around forever.
 * The lesson text relies on what happens here (the starting rule bumps the wall, a rule under "IF always" never runs,
 * the full program cleans the room without falling), and test/rulebot.test.js checks it.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Rulebot = factory();
})(typeof self !== "undefined" ? self : this, function () {
  // x to the right, y down; d: 0 east, 1 south, 2 west, 3 north
  const ROOM = { w: 7, h: 5, start: { x: 0, y: 0, d: 0 }, stairs: [[2, 4], [3, 4]], dirt: [[2, 0], [6, 2], [4, 2]] };
  const IF = ["always", "a wall is ahead", "stairs are ahead", "there's dirt here"];
  const DO = ["drive forward", "turn right", "turn left", "clean"];
  const MAX = 4, TURNS = 60, START = [{ c: 0, a: 0 }];
  const STEP = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const key = (x, y) => x + "," + y;

  function run(rules, room = ROOM) {
    let { x, y, d } = room.start;
    const stairs = new Set(room.stairs.map(([a, b]) => key(a, b))), dirt = new Set(room.dirt.map(([a, b]) => key(a, b)));
    const frames = [];
    let bumps = 0, fell = false, wallTurn = false, metStairs = false, loop = false;
    const seen = new Set([[x, y, d, dirt.size].join()]);
    for (let t = 0; t < TURNS && !fell && dirt.size; t++) {
      const nx = x + STEP[d][0], ny = y + STEP[d][1];
      const wall = nx < 0 || ny < 0 || nx >= room.w || ny >= room.h, onStairs = stairs.has(key(nx, ny));
      const sense = [true, wall, onStairs, dirt.has(key(x, y))];
      if (onStairs) metStairs = true;
      const rule = rules.findIndex((r) => sense[r.c]), a = rule < 0 ? -1 : rules[rule].a;
      let what = "wait";
      if (a === 0) {
        if (wall) { what = "bump"; bumps++; }
        else { x = nx; y = ny; what = onStairs ? "fall" : "move"; fell = onStairs; }
      } else if (a === 1 || a === 2) { d = (d + (a === 1 ? 1 : 3)) % 4; what = "turn"; if (wall) wallTurn = true; }
      else if (a === 3) { what = sense[3] ? "clean" : "nothing to clean"; dirt.delete(key(x, y)); }
      frames.push({ x, y, d, rule, what, dirt: [...dirt] });
      const now = [x, y, d, dirt.size].join();
      if (seen.has(now) && !fell) { loop = true; break; }
      seen.add(now);
    }
    return { frames, bumps, fell, loop, wallTurn, metStairs, cleaned: room.dirt.length - dirt.size, allClean: dirt.size === 0 };
  }
  // rules that can never run because an "always" rule above them is true every turn
  function unreachable(rules) {
    const first = rules.findIndex((r) => r.c === 0);
    return first < 0 ? [] : rules.map((_, i) => i).filter((i) => i > first);
  }
  return { ROOM, IF, DO, MAX, TURNS, START, run, unreachable };
});
