// Motor lesson tests: the simulators follow the rules the lesson text and quizzes teach.
const assert = require("assert");
const M = require("../public/js/motors.js");
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected about ${b}`);

// DC motors and gears (the DC lesson and its simulator tasks)
for (const v of M.VOLTS) {
  for (const r of [10, 25]) assert(M.drive(1, r, v).stalled, `no gearbox should stall on the ${r}° ramp at ${v} V`);
  assert(M.drive(5, 25, v).stalled, `5:1 should stall on the 25° ramp at ${v} V`);
  assert(!M.drive(20, 25, v).stalled && !M.drive(50, 25, v).stalled, `20:1 and 50:1 should climb the 25° ramp at ${v} V`);
  assert.strictEqual(M.bestGear(10, v), 20, `20:1 should be the fastest gear on the 10° ramp at ${v} V`);
}
assert.strictEqual(M.bestGear(25, 3), 50, "at 3 V the 25° ramp needs the most gearing to go fastest");
assert.strictEqual(M.bestGear(25, 6), 20, "at 6 V 20:1 is fastest on the 25° ramp");
assert(!M.drive(1, 0, 6).stalled && M.drive(1, 0, 3).stalled, "with no gearbox it rolls on flat ground at 6 V but not at 3 V");
// more gearing = slower but stronger; more volts = faster
for (const r of M.RAMPS) for (let i = 1; i < M.GEARS.length; i++) {
  const lo = M.drive(M.GEARS[i - 1], r, 6), hi = M.drive(M.GEARS[i], r, 6);
  assert(hi.have > lo.have, `more gearing should give more torque (${M.GEARS[i]}:1 on ${r}°)`);
  if (!lo.stalled && lo.speed > 0.95) assert(hi.speed < lo.speed, `more gearing should be slower when the motor isn't straining (${M.GEARS[i]}:1 on ${r}°)`);
}
for (const g of [20, 50]) for (const r of M.RAMPS) assert(M.drive(g, r, 6).speed > M.drive(g, r, 3).speed, `6 V should be faster than 3 V (${g}:1, ${r}°)`);
// a gearbox divides speed by its ratio
const d = M.drive(20, 10, 6); near(d.motorRpm / d.wheelRpm, 20, 1e-9, "20:1 gearbox: motor turns 20 times per wheel turn");
near(6000 / 20, 300, 0, "quiz: 6000 rpm through 20:1 is 300 rpm");

// servo
assert.strictEqual(M.servoAngle(1.0), 0); assert.strictEqual(M.servoAngle(1.5), 90); assert.strictEqual(M.servoAngle(2.0), 180);
assert.strictEqual(M.servoAngle(1.25), 45); assert.strictEqual(M.servoAngle(1.75), 135);
near(M.servoPulse(45), 1.25, 1e-9, "45° target is a 1.25 ms pulse"); near(M.servoPulse(135), 1.75, 1e-9, "135° target is a 1.75 ms pulse");
let a = 30; for (let i = 0; i < 120; i++) a = M.servoStep(a, 135, 1 / 60);
near(a, 135, 0.01, "servo reaches its target within 2 seconds");
a = 135 + 50; for (let i = 0; i < 120; i++) a = M.servoStep(a, 135, 1 / 60);
near(a, 135, 0.01, "servo pushes itself back after being pushed");
assert.strictEqual(M.SERVO.periodMs, 20, "the lesson says a pulse every 20 ms");

// stepper
assert.strictEqual(M.STEPPER.stepsPerRev, 200, "the lesson says 200 steps per turn");
near(360 / M.STEPPER.stepsPerRev, 1.8, 1e-9, "1.8° per step");
const q = M.stepperRun(50, 400, "light"); assert(q.moved === 50 && q.realDeg === 90, "50 steps at a gentle rate is exactly a quarter turn");
const full = M.stepperRun(200, 250, "heavy"); assert(full.moved === 200 && full.realDeg === 360, "200 steps at its max rate under a heavy load is one full turn");
const slip = M.stepperRun(200, 1000, "heavy"); assert(slip.moved < 200 && slip.thinksDeg === 360 && slip.realDeg < 360, "too fast under a heavy load skips steps, but the controller still thinks it turned 360°");
assert(M.stepperRun(200, 800, "light").moved === 200 && M.stepperRun(200, 1000, "light").moved < 200, "a light load can go faster before slipping");

console.log("Motor tests passed");
