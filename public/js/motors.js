/*
 * Motor physics for the Robot Lessons simulators — shared by the browser and Node tests.
 * Simplified, but true to how real hobby motors behave. The lesson text and quizzes rely on these rules:
 * - DC motor: free speed and stall torque both grow with voltage; torque falls in a straight line from stall (stopped)
 *   to zero at free speed. A gearbox multiplies torque and divides speed, and loses a little to friction.
 * - Servo: a pulse every 20 ms; its width picks the angle (1.0 ms = 0°, 1.5 ms = 90°, 2.0 ms = 180° on a typical servo).
 *   A sensor inside checks the angle, so it fixes itself when pushed.
 * - Stepper: 200 steps per turn (1.8° each). It counts steps without a sensor, so too much speed for the load skips steps
 *   and nobody notices.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Motors = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const G = 9.81;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rpmOf = (radPerSec) => (radPerSec * 60) / (2 * Math.PI);

  // ---------------- DC motor + gearbox ----------------
  const DC = { volts: 6, freeRpm: 8000, stallTorque: 0.012 }; // a small hobby motor, measured at 6 V (torque in N·m)
  const CART = { kg: 1.2, wheelR: 0.03, motors: 2, crr: 0.05 }; // the robot in the simulator: two driven wheels, 3 cm radius
  const GEARS = [1, 5, 20, 50], RAMPS = [0, 10, 25], VOLTS = [3, 6]; // small hobby motors are made for about 3–6 V
  const EFF = 0.8; // a gearbox loses some power to friction

  // How the robot does on a ramp with this gear ratio and battery. Torques are per wheel.
  function drive(gear, rampDeg, volts) {
    const k = volts / DC.volts, freeW = ((DC.freeRpm * 2 * Math.PI) / 60) * k, stall = DC.stallTorque * k;
    const th = (rampDeg * Math.PI) / 180, eff = gear > 1 ? EFF : 1;
    const force = CART.kg * G * (CART.crr * Math.cos(th) + Math.sin(th)); // rolling resistance plus gravity pulling it back down
    const need = (force * CART.wheelR) / CART.motors; // twisting force each wheel needs
    const have = stall * gear * eff; // the most each wheel can get through the gearbox
    if (need >= have) return { stalled: true, need, have, motorRpm: 0, wheelRpm: 0, speed: 0 };
    const wheelW = (freeW / gear) * (1 - need / have);
    return { stalled: false, need, have, motorRpm: rpmOf(wheelW * gear), wheelRpm: rpmOf(wheelW), speed: wheelW * CART.wheelR };
  }
  // The fastest gear that still climbs this ramp at this voltage (null if none can).
  function bestGear(rampDeg, volts) {
    let best = null;
    for (const g of GEARS) { const r = drive(g, rampDeg, volts); if (!r.stalled && (!best || r.speed > best.speed)) best = { gear: g, speed: r.speed }; }
    return best && best.gear;
  }

  // ---------------- servo ----------------
  const SERVO = { periodMs: 20, minMs: 1.0, maxMs: 2.0, range: 180, maxSpeed: 600 }; // maxSpeed in °/s (about 0.1 s per 60°)
  const servoAngle = (ms) => clamp((ms - SERVO.minMs) / (SERVO.maxMs - SERVO.minMs), 0, 1) * SERVO.range;
  const servoPulse = (deg) => SERVO.minMs + (clamp(deg, 0, SERVO.range) / SERVO.range) * (SERVO.maxMs - SERVO.minMs);
  // One moment of the servo's feedback loop: sense the angle, compare it with the target, drive the motor toward it.
  function servoStep(angle, target, dt) {
    const err = target - angle;
    if (Math.abs(err) < 0.2) return target;
    return angle + clamp(err * 12, -SERVO.maxSpeed, SERVO.maxSpeed) * dt;
  }

  // ---------------- stepper ----------------
  const STEPPER = { stepsPerRev: 200, maxRate: { light: 800, heavy: 250 } }; // fastest step rate (steps/s) it can follow for each load
  const COILS = ["A", "B", "A'", "B'"]; // full-step order: each step turns on the next coil
  // Send some steps at a rate under a load. Past the rate it can follow, a share of the steps slip (1 - maxRate / rate).
  function stepperRun(steps, rate, load) {
    const max = STEPPER.maxRate[load], slip = rate > max ? 1 - max / rate : 0;
    let moved = 0, acc = 0;
    for (let i = 0; i < steps; i++) { acc += slip; if (acc >= 1) acc -= 1; else moved++; }
    return { sent: steps, moved, thinksDeg: (steps * 360) / STEPPER.stepsPerRev, realDeg: (moved * 360) / STEPPER.stepsPerRev };
  }

  return { G, DC, CART, GEARS, RAMPS, VOLTS, EFF, drive, bestGear, SERVO, servoAngle, servoPulse, servoStep, STEPPER, COILS, stepperRun };
});
