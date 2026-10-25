/*
 * Robot Racer physics — shared by the race page, the server (it re-drives submitted laps) and Node tests.
 * Fully deterministic: fixed 1/60 s steps, digital inputs (steer left/none/right, gas, brake).
 * A lap is stored as one letter per step, so the server can drive it again and check the time.
 *
 * The lesson is the motors unit's: a DC motor pushes hardest when slow and not at all at its top rpm,
 * and the gear ratio trades top speed for pushing force. Tires trade corner grip for rolling resistance.
 * Units: meters, seconds, kilograms, newtons.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Race = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const G = 9.81, DT = 1 / 60, SEG = 2;
  const CAR = { kg: 48, wheelR: 0.15, cdA: 0.25, rho: 1.2 };
  const MOTOR = { rpm: 5000, torque: 6 }; // free speed and stall torque (N·m)
  const GEARS = [4, 6, 8, 12];
  const TIRES = [
    { n: "Slick", mu: 0.55, crr: 0.012, d: "Rolls easily, so it's fast on straights, but slides in corners" },
    { n: "Sport", mu: 0.7, crr: 0.02, d: "In between: decent grip and decent rolling" },
    { n: "Grippy", mu: 0.9, crr: 0.035, d: "Sticks in corners, but the soft rubber slows you on straights" },
  ];
  const ROAD = 4, WALL = 6.5; // road half-width, then grass, then the wall

  // ---------------- track ----------------
  // k: curvature (1/radius, + is a right turn), slope: rise per meter. Changes are eased over ~10 m.
  const SECTIONS = [
    { n: "Start straight", len: 70 },
    { n: "Sweeper", len: 60, k: 1 / 30 },
    { n: "Short straight", len: 30 },
    { n: "Hairpin", len: 32, k: -1 / 10 },
    { n: "Big Hill", len: 60, slope: 0.3 },
    { n: "Hilltop", len: 16 },
    { n: "Downhill", len: 60, slope: -0.3 },
    { n: "S-bends", len: 24, k: 1 / 14 }, { n: "S-bends", len: 24, k: -1 / 14 }, { n: "S-bends", len: 24, k: 1 / 14 },
    { n: "Long straight", len: 110 },
    { n: "Final turn", len: 40, k: -1 / 18 },
    { n: "Home straight", len: 60 },
  ];
  const segs = [];
  SECTIONS.forEach((s, si) => { for (let i = 0; i < s.len / SEG; i++) segs.push({ k: s.k || 0, slope: s.slope || 0, sec: si }); });
  { // ease curvature and slope between sections (a 5-segment moving average)
    const k = segs.map((s) => s.k), sl = segs.map((s) => s.slope), n = segs.length;
    segs.forEach((s, i) => { let a = 0, b = 0; for (let j = -2; j <= 2; j++) { a += k[(i + j + n) % n]; b += sl[(i + j + n) % n]; } s.k = a / 5; s.slope = b / 5; });
    let y = 0; segs.forEach((s) => { s.y = y; y += s.slope * SEG; });
  }
  const LENGTH = segs.length * SEG;
  const segAt = (z) => segs[Math.floor(((z % LENGTH) + LENGTH) % LENGTH / SEG)];
  const TRACK = { segs, SEG, LENGTH, SECTIONS, ROAD, WALL, segAt };

  // ---------------- car ----------------
  function clampSetup(s) {
    const c = (v, n, d) => (Number.isInteger(+v) && +v >= 0 && +v < n ? +v : d);
    return { gear: c(s && s.gear, GEARS.length, 1), tire: c(s && s.tire, TIRES.length, 1) };
  }
  const newCar = () => ({ z: 0, x: 0, v: 0, t: 0, off: 0, wall: 0, rpm: 0 });
  // the motor's push at the wheels for this speed: biggest when stopped, zero at the motor's top rpm
  function motorForce(v, gear) {
    const rpm = (v / (2 * Math.PI * CAR.wheelR)) * 60 * gear;
    return { rpm, F: (MOTOR.torque * (1 - rpm / MOTOR.rpm) * gear) / CAR.wheelR };
  }
  // one 1/60 s step. input: { steer: -1|0|1, gas: 0|1, brake: 0|1 }
  function step(car, setup, input) {
    const T = TIRES[setup.tire], gear = GEARS[setup.gear], m = CAR.kg, seg = segAt(car.z);
    const grip = T.mu * m * G, off = Math.abs(car.x) > ROAD;
    const mf = motorForce(car.v, gear);
    let F = input.gas ? Math.max(-grip, Math.min(grip, mf.F)) : 0;
    if (input.brake && car.v > 0) F -= grip * 0.9;
    const roll = (off ? 0.25 : T.crr) * m * G, drag = 0.5 * CAR.rho * CAR.cdA * car.v * car.v;
    const grav = (m * G * seg.slope) / Math.sqrt(1 + seg.slope * seg.slope);
    car.v = Math.max(0, car.v + ((F - (car.v > 0 ? roll + drag : 0) - grav) / m) * DT);
    car.z += car.v * DT;
    // sideways: steering pulls toward the inside, the corner pushes you outward; past the tires' grip you slide
    const demand = (car.v * car.v * seg.k) / (T.mu * G);
    car.x += 4 * Math.min(1, car.v / 5) * (input.steer - demand) * DT;
    if (Math.abs(car.x) > WALL) { car.x = Math.sign(car.x) * WALL; car.v *= 0.985; car.wall++; }
    if (off) car.off++;
    car.rpm = mf.rpm; car.t++;
    return car;
  }

  // ---------------- laps ----------------
  const LETTERS = "abcdefghijkl"; // (steer + 1) * 4 + gas * 2 + brake
  const encode = (i) => LETTERS[(i.steer + 1) * 4 + (i.gas ? 2 : 0) + (i.brake ? 1 : 0)];
  const decode = (ch) => { const n = LETTERS.indexOf(ch); return n < 0 ? null : { steer: Math.floor(n / 4) - 1, gas: (n >> 1) & 1, brake: n & 1 }; };
  const MAX_STEPS = 180 * 60; // a lap over 3 minutes doesn't count
  // drive a whole lap from a standing start; what the server uses to check a submitted lap
  function lap(setup, inputs) {
    setup = clampSetup(setup);
    const car = newCar(), samples = [[0, 0]], sec = SECTIONS.map(() => ({ vMin: Infinity, vMax: 0 }));
    let prevZ = 0;
    for (let i = 0; i < inputs.length && i < MAX_STEPS; i++) {
      const inp = decode(inputs[i]); if (!inp) return { finished: false, bad: true };
      prevZ = car.z; step(car, setup, inp);
      const s = sec[segAt(car.z).sec]; if (car.z < LENGTH) { s.vMin = Math.min(s.vMin, car.v); s.vMax = Math.max(s.vMax, car.v); s.vEnd = car.v; }
      if (car.t % 6 === 0) samples.push([Math.round(car.z * 10) / 10, Math.round(car.x * 100) / 100]);
      if (car.z >= LENGTH) {
        const time = (car.t - 1 + (LENGTH - prevZ) / (car.z - prevZ)) * DT;
        return { finished: true, time: Math.round(time * 1000) / 1000, steps: car.t, off: car.off * DT, wall: car.wall * DT, samples, sec };
      }
    }
    return { finished: false, time: null, off: car.off * DT, samples, sec };
  }
  // a careful computer driver: brakes for corners it can see coming and steers back to the middle
  function autopilot(car, setup, care = 0.92) {
    const T = TIRES[setup.tire], brakeA = T.mu * G * 0.9;
    let want = Infinity;
    for (let d = 0; d < 80; d += SEG) {
      const k = Math.abs(segAt(car.z + d).k);
      if (k > 1e-4) want = Math.min(want, Math.sqrt(Math.sqrt((T.mu * G * care) ** 2 / (k * k)) + 2 * brakeA * d * 0.8));
    }
    const seg = segAt(car.z), demand = (car.v * car.v * seg.k) / (T.mu * G), aim = demand - car.x * 0.35;
    return { steer: aim > 0.3 ? 1 : aim < -0.3 ? -1 : 0, gas: car.v < want - 0.2 ? 1 : 0, brake: car.v > want + 0.6 ? 1 : 0 };
  }
  function autoLap(setup, care) {
    setup = clampSetup(setup);
    const car = newCar(); let s = "";
    while (car.z < LENGTH && car.t < MAX_STEPS) { const i = autopilot(car, setup, care); s += encode(i); step(car, setup, i); }
    return s;
  }

  // ---------------- what the setup can do (the garage card) ----------------
  function setupStats(setup) {
    setup = clampSetup(setup);
    const T = TIRES[setup.tire], gear = GEARS[setup.gear], m = CAR.kg;
    const balance = (slope) => { // the steady speed where the motor's push matches everything slowing you down
      let lo = 0, hi = 40;
      for (let i = 0; i < 50; i++) { const v = (lo + hi) / 2, f = Math.min(T.mu * m * G, motorForce(v, gear).F) - T.crr * m * G - 0.5 * CAR.rho * CAR.cdA * v * v - (m * G * slope) / Math.sqrt(1 + slope * slope); f > 0 ? (lo = v) : (hi = v); }
      return lo;
    };
    // seconds from a standstill to 8 m/s (or the top speed, if that is lower) on flat ground
    const to = Math.min(8, balance(0)) * 0.98; let v = 0, t10 = 0;
    while (v < to && t10 < 30) { v += (Math.min(T.mu * m * G, motorForce(v, gear).F) - T.crr * m * G - 0.5 * CAR.rho * CAR.cdA * v * v) / m * DT; t10 += DT; }
    const hair = Math.max(...segs.map((s) => Math.abs(s.k)));
    return { top: balance(0), hill: balance(0.3), push: Math.round(Math.min(T.mu * m * G, motorForce(0, gear).F)), accel: Math.round(t10 * 10) / 10, accelTo: Math.min(8, balance(0)), corner: Math.sqrt((T.mu * G) / hair), gear, tire: T.n };
  }

  // ---------------- the lap report ----------------
  const kmh = (v) => Math.round(v * 3.6);
  // the computer driver's lap for every setup, worked out once: tips only suggest a change that really is faster
  let autoCache = null;
  function autoTimes() {
    if (!autoCache) autoCache = GEARS.map((_, g) => TIRES.map((_, t) => lap({ gear: g, tire: t }, autoLap({ gear: g, tire: t })).time));
    return autoCache;
  }
  function explain(setup, r) {
    setup = clampSetup(setup);
    const st = setupStats(setup), gear = GEARS[setup.gear], T = TIRES[setup.tire], out = [];
    const all = GEARS.map((_, g) => setupStats({ gear: g, tire: setup.tire }));
    const bestTop = Math.max(...all.map((x) => x.top)), bestHill = Math.max(...all.map((x) => x.hill));
    const part = (name) => SECTIONS.map((x, i) => [x, r.sec[i]]).filter(([x, v]) => x.n === name && v.vMin !== Infinity).map(([, v]) => v);
    const straight = part("Long straight").pop(), hill = part("Big Hill");
    if (straight) {
      const atTop = straight.vMax >= st.top * 0.95;
      out.push({ tone: st.top >= bestTop * 0.95 ? "good" : st.top < bestTop * 0.6 ? "bad" : "info", title: `Long straight: top ${kmh(straight.vMax)} km/h`,
        text: (atTop ? `That's the top speed with a ${gear}:1 gear: the motor was at its max rpm, so it couldn't push any faster.` : `Your car can reach ${kmh(st.top)} km/h here. Stay on the gas the whole straight.`) +
          (atTop && st.top < bestTop * 0.95 ? " A lower gear (fewer motor turns for each wheel turn) has a higher top speed." : "") });
    }
    if (hill.length) {
      const vMin = Math.min(...hill.map((x) => x.vMin)), weak = st.hill < bestHill * 0.7;
      out.push({ tone: weak ? "bad" : "good", title: `Big Hill: slowest ${kmh(vMin)} km/h`,
        text: weak ? `Climbing is hard work. With a ${gear}:1 gear the motor doesn't have enough pushing force (torque) for the steep part, so it slows to a crawl. More gearing pushes harder up hills.` : `The ${gear}:1 gear gives the motor enough torque to climb at up to ${kmh(st.hill)} km/h.` });
    }
    if (r.off > 0.5) out.push({ tone: "bad", title: `Off the road for ${r.off.toFixed(1)} s`, text: `Corners push your car outward. ${T.n} tires can hold the Hairpin at about ${kmh(st.corner)} km/h; faster than that, you slide onto the grass. Brake before the turn${setup.tire < TIRES.length - 1 ? ", or try grippier tires" : ""}.` });
    else out.push({ tone: "good", title: "Clean driving", text: "You stayed on the road: you took the corners at speeds your tires could hold." });
    // one tip, for the biggest problem
    const at = autoTimes(), mine = at[setup.gear][setup.tire];
    const lower = setup.gear > 0 ? at[setup.gear - 1][setup.tire] : Infinity, higher = setup.gear < GEARS.length - 1 ? at[setup.gear + 1][setup.tire] : Infinity;
    const tireBest = at[setup.gear].indexOf(Math.min(...at[setup.gear]));
    const tip = r.off > 2 ? "Brake before the corners. Sliding onto the grass costs more time than slowing down." :
      lower < mine - 0.3 && lower <= higher ? `Try a lower gear (${GEARS[setup.gear - 1]}:1) for more top speed on the straights.` :
      higher < mine - 0.3 ? `Try more gearing (${GEARS[setup.gear + 1]}:1) to climb the Big Hill faster. Your top speed will drop a little.` :
      at[setup.gear][tireBest] < mine - 0.3 ? `Try ${TIRES[tireBest].n} tires: ${tireBest > setup.tire ? "they hold the corners at higher speeds" : "they roll more easily on the straights"}.` :
      "Your setup fits this track. Now find time with smoother driving: get back on the gas earlier out of every corner.";
    return { items: out, tip, stats: st };
  }

  return { G, DT, SEG, CAR, MOTOR, GEARS, TIRES, TRACK, ROAD, WALL, clampSetup, newCar, motorForce, step, encode, decode, lap, autopilot, autoLap, autoTimes, setupStats, explain, MAX_STEPS };
});
