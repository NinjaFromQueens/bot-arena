/*
 * Robot arm math for the Robot Lessons simulators — shared by the browser and Node tests.
 * Centimeters and degrees; angles count counterclockwise from pointing right, with y pointing up.
 * The lesson text and quizzes rely on these rules:
 * - A 2-link arm reaches anywhere from |L1 - L2| to L1 + L2 from its shoulder (inside its joint limits).
 * - Forward kinematics: joint angles -> where the hand is. Inverse kinematics: target -> joint angles,
 *   usually two ways (elbow up or elbow down).
 * - Holding torque = weight x horizontal distance. Hobby servos are rated in kg·cm.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Arm = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const RAD = Math.PI / 180;

  // ---------------- links and joints ----------------
  const ARM = { l1: 18, l2: 14 }; // upper arm and forearm, cm
  const LIMITS = { shoulder: [0, 180], elbow: [-150, 150] };
  const BLOCKS = [
    { id: "green", n: "green block", color: "#4fd18b", x: 22, y: 8 },
    { id: "blue", n: "blue block", color: "#38a7f0", x: -10, y: 24 },
    { id: "red", n: "red block", color: "#ff5d5d", x: 34, y: 18 }, // out of reach on purpose
  ];
  const reach = () => ({ min: Math.abs(ARM.l1 - ARM.l2), max: ARM.l1 + ARM.l2 });
  // Forward kinematics: where the elbow and hand end up for these joint angles.
  function forward(shoulder, elbow) {
    const a = shoulder * RAD, b = (shoulder + elbow) * RAD;
    const ex = ARM.l1 * Math.cos(a), ey = ARM.l1 * Math.sin(a);
    return { elbow: { x: ex, y: ey }, hand: { x: ex + ARM.l2 * Math.cos(b), y: ey + ARM.l2 * Math.sin(b) } };
  }
  // Inverse kinematics: joint angles that put the hand on (x, y), or null if it can't (too far, too close, or past a joint limit).
  // Most spots can be reached two ways; "elbow up" is the one with the higher elbow.
  function inverse(x, y, elbowUp = true) {
    const d2 = x * x + y * y, c = (d2 - ARM.l1 ** 2 - ARM.l2 ** 2) / (2 * ARM.l1 * ARM.l2);
    if (c < -1 || c > 1) return null;
    const both = [1, -1].map((sign) => {
      const e = sign * Math.acos(c), s = Math.atan2(y, x) - Math.atan2(ARM.l2 * Math.sin(e), ARM.l1 + ARM.l2 * Math.cos(e));
      return { shoulder: s / RAD, elbow: e / RAD, elbowY: ARM.l1 * Math.sin(s) };
    }).sort((p, q) => q.elbowY - p.elbowY);
    const pick = both[elbowUp ? 0 : 1];
    if (pick.shoulder < LIMITS.shoulder[0] - 1e-9 || pick.shoulder > LIMITS.shoulder[1] + 1e-9 || Math.abs(pick.elbow) > LIMITS.elbow[1]) return null;
    return { shoulder: pick.shoulder, elbow: pick.elbow };
  }

  // ---------------- holding torque ----------------
  const SERVOS = [{ n: "Small servo", kgcm: 2 }, { n: "Standard servo", kgcm: 10 }]; // typical hobby ratings
  const ARM_KG = 0.04; // the link itself weighs 40 g, and its weight acts at its middle
  const WEIGHTS = [0.05, 0.1, 0.2], LENGTHS = [10, 20, 30]; // kg, cm
  // Torque the shoulder servo needs (kg·cm) to hold a block at the end of an arm raised angleDeg above level.
  function holdTorque(blockKg, lengthCm, angleDeg) {
    const d = lengthCm * Math.cos(angleDeg * RAD); // only the sideways distance counts
    return (blockKg + ARM_KG / 2) * d;
  }

  return { ARM, LIMITS, BLOCKS, reach, forward, inverse, SERVOS, ARM_KG, WEIGHTS, LENGTHS, holdTorque };
});
