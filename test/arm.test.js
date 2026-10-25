// Robot arm lesson tests: the simulators follow the rules the lesson text and quizzes teach.
const assert = require("assert");
const A = require("../public/js/arm.js");
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected about ${b}`);

// reach and forward kinematics
const r = A.reach();
assert.strictEqual(r.max, 32, "18 cm + 14 cm links reach 32 cm (quiz)"); assert.strictEqual(r.min, 4, "and no closer than 4 cm");
let f = A.forward(0, 0); near(f.hand.x, 32, 1e-9, "arm straight out to the right"); near(f.hand.y, 0, 1e-9, "on the table line");
f = A.forward(90, 0); near(f.hand.x, 0, 1e-9, "arm straight up"); near(f.hand.y, 32, 1e-9, "32 cm up");
f = A.forward(90, -90); near(f.hand.x, 14, 1e-9, "elbow bent 90° clockwise points the forearm right"); near(f.hand.y, 18, 1e-9, "at elbow height");

// the blocks in the simulator: green and blue reachable, red out of reach
const blk = Object.fromEntries(A.BLOCKS.map((b) => [b.id, b]));
for (const id of ["green", "blue"]) {
  const b = blk[id], d = Math.hypot(b.x, b.y);
  assert(d > r.min && d < r.max, `${id} should be inside the arm's reach`);
  const sol = A.inverse(b.x, b.y, true) || A.inverse(b.x, b.y, false);
  assert(sol, `${id} should be reachable inside the joint limits`);
  const h = A.forward(sol.shoulder, sol.elbow).hand; near(Math.hypot(h.x - b.x, h.y - b.y), 0, 1e-6, `inverse kinematics should land on the ${id} block`);
}
const red = blk.red; assert(Math.hypot(red.x, red.y) > r.max, "red should be farther than 32 cm");
assert.strictEqual(A.inverse(red.x, red.y, true), null, "no joint angles reach the red block"); assert.strictEqual(A.inverse(red.x, red.y, false), null, "either way");
// two solutions (elbow up and elbow down) for the blue block, the lesson's inverse kinematics example
const up = A.inverse(blk.blue.x, blk.blue.y, true), down = A.inverse(blk.blue.x, blk.blue.y, false);
assert(up && down && Math.abs(up.elbow - down.elbow) > 10, "the blue block can be reached elbow up and elbow down");
assert(A.forward(up.shoulder, up.elbow).elbow.y > A.forward(down.shoulder, down.elbow).elbow.y, "elbow up really puts the elbow higher");

// holding torque (the arm strength lesson)
const small = A.SERVOS[0].kgcm, std = A.SERVOS[1].kgcm;
near(0.2 * 10, small, 1e-9, "quiz: a 2 kg·cm servo holds 200 g at 10 cm (ignoring the arm)");
near(A.holdTorque(0.1, 20, 0) / A.holdTorque(0.1, 10, 0), 2, 1e-9, "twice as far out needs twice the torque");
assert(A.holdTorque(0.2, 30, 0) > small, "the small servo can't hold 200 g straight out on the 30 cm arm");
assert(A.holdTorque(0.2, 30, 0) <= std, "the standard servo can");
assert(A.holdTorque(0.2, 30, 70) > small && A.holdTorque(0.2, 30, 75) <= small, "raising the arm to 75° lets the small servo hold it (70° isn't enough)");
near(A.holdTorque(0.2, 30, 90), 0, 1e-9, "straight up, the weight is right over the joint: no torque");
assert(A.holdTorque(0.05, 10, 0) <= small, "the lightest block on the shortest arm is easy for the small servo");

console.log("Arm tests passed");
