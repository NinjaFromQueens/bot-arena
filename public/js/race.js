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

  // ---------------- tracks ----------------
  // k: curvature (1/radius, + is a right turn), slope: rise per meter. Changes are eased over ~10 m.
  // Every track climbs as much as it drops, so the lap joins up. keys name the sections the lap report talks about.
  // Each track rewards a different setup (test/race.test.js checks it): that's the lesson. par is the computer driver's
  // best lap there (any setup), kept here so pages don't drive 36 laps to show medals; the test says if it's out of date.
  const DEFS = [
    { id: 0, n: "Garage Circuit", theme: "dusk", par: 62.96, about: "A steep hill after a hairpin, then a long straight. A middle gear fits best.",
      keys: { straight: "Long straight", hill: "Big Hill", corner: "Hairpin" }, sections: [
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
      ] },
    { id: 1, n: "Desert Speedway", theme: "desert", par: 53.73, about: "Long, flat straights and wide turns. Top speed is everything.",
      keys: { straight: "Back straight", hill: "Dune", corner: "Chicane" }, sections: [
        { n: "Start straight", len: 120 },
        { n: "Turn 1", len: 70, k: 1 / 40 },
        { n: "Back straight", len: 170 },
        { n: "Turn 2", len: 60, k: 1 / 45 },
        { n: "Dune", len: 40, slope: 0.08 },
        { n: "Dune drop", len: 40, slope: -0.08 },
        { n: "Chicane", len: 20, k: -1 / 28 }, { n: "Chicane", len: 20, k: 1 / 28 },
        { n: "Turn 3", len: 60, k: 1 / 40 },
        { n: "Home straight", len: 110 },
      ] },
    { id: 2, n: "Neon Peaks", theme: "night", par: 76.11, about: "Steep climbs and tight switchbacks at night. Pushing force matters most.",
      keys: { straight: "Ridge", hill: "First climb", corner: "Switchback" }, sections: [
        { n: "Start straight", len: 30 },
        { n: "First climb", len: 70, slope: 0.4 },
        { n: "Switchback", len: 24, k: -1 / 8 },
        { n: "Second climb", len: 70, slope: 0.4 },
        { n: "Switchback", len: 24, k: 1 / 8 },
        { n: "Ridge", len: 20 },
        { n: "Descent", len: 90, slope: -0.4 },
        { n: "Valley hairpin", len: 26, k: -1 / 9 },
        { n: "Last climb", len: 50, slope: 0.32 },
        { n: "Summit", len: 12 },
        { n: "Drop", len: 90, slope: -0.4 },
        { n: "Home straight", len: 30 },
      ] },
  ];
  function makeTrack(def) {
    const segs = [];
    def.sections.forEach((sec, si) => { for (let i = 0; i < sec.len / SEG; i++) segs.push({ k: sec.k || 0, slope: sec.slope || 0, sec: si }); });
    { // ease curvature and slope between sections (a 5-segment moving average)
      const k = segs.map((x) => x.k), sl = segs.map((x) => x.slope), n = segs.length;
      segs.forEach((x, i) => { let a = 0, b = 0; for (let j = -2; j <= 2; j++) { a += k[(i + j + n) % n]; b += sl[(i + j + n) % n]; } x.k = a / 5; x.slope = b / 5; });
      let y = 0; segs.forEach((x) => { x.y = y; y += x.slope * SEG; });
    }
    const LENGTH = segs.length * SEG;
    const segAt = (z) => segs[Math.floor(((z % LENGTH) + LENGTH) % LENGTH / SEG)];
    const steep = Math.max(...def.sections.map((x) => x.slope || 0)), tight = Math.max(...segs.map((x) => Math.abs(x.k)));
    return { ...def, SECTIONS: def.sections, segs, SEG, LENGTH, ROAD, WALL, segAt, steep, tight };
  }
  const TRACKS = DEFS.map(makeTrack), TRACK = TRACKS[0];
  const trackOf = (t) => (typeof t === "object" && t ? t : TRACKS[t] || TRACK);
  // Test benches: short point-to-point strips that each hold one idea, for missions. They're not in TRACKS, so the
  // track picker, class boards and Race Day never list them; missions name them by id. New strips go at the end.
  // open: the road doesn't loop (racedraw keeps it flat past both ends instead of joining the end to the start).
  const STRIPS = [
    { id: "strip-hill-22", n: "Torque's test hill", theme: "dusk", open: true, about: "A short run-up, then 40 m up a 21.8° hill, as steep as the climbs at Neon Peaks.",
      keys: { straight: "Run-up", hill: "Hill", corner: "" }, sections: [{ n: "Run-up", len: 10 }, { n: "Hill", len: 40, slope: 0.4 }, { n: "Top", len: 10 }] },
    { id: "strip-flat-150", n: "Torque's straight", theme: "dusk", open: true, about: "150 m of flat, straight road: long enough to reach top speed.",
      keys: { straight: "Straight", hill: "", corner: "" }, sections: [{ n: "Straight", len: 150 }] },
    { id: "strip-hill17-flat", n: "Hill, then straight", theme: "dusk", open: true, about: "40 m up a 16.7° hill, then 120 m of flat road.",
      keys: { straight: "Straight", hill: "Hill", corner: "" }, sections: [{ n: "Run-up", len: 10 }, { n: "Hill", len: 40, slope: 0.3 }, { n: "Straight", len: 120 }] },
  ].map(makeTrack);
  const stripOf = (id) => STRIPS.find((s) => s.id === id);

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
  function step(car, setup, input, track = TRACK) {
    const T = TIRES[setup.tire], gear = GEARS[setup.gear], m = CAR.kg, seg = track.segAt(car.z);
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
  function lap(setup, inputs, track) {
    setup = clampSetup(setup); track = trackOf(track);
    const { LENGTH, segAt } = track, car = newCar(), samples = [[0, 0]], sec = track.SECTIONS.map(() => ({ vMin: Infinity, vMax: 0 }));
    let prevZ = 0;
    for (let i = 0; i < inputs.length && i < MAX_STEPS; i++) {
      const inp = decode(inputs[i]); if (!inp) return { finished: false, bad: true };
      prevZ = car.z; step(car, setup, inp, track);
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
  function autopilot(car, setup, care = 0.92, track = TRACK) {
    const T = TIRES[setup.tire], brakeA = T.mu * G * 0.9, segAt = track.segAt;
    let want = Infinity;
    for (let d = 0; d < 80; d += SEG) {
      const k = Math.abs(segAt(car.z + d).k);
      if (k > 1e-4) want = Math.min(want, Math.sqrt(Math.sqrt((T.mu * G * care) ** 2 / (k * k)) + 2 * brakeA * d * 0.8));
    }
    const seg = segAt(car.z), demand = (car.v * car.v * seg.k) / (T.mu * G), aim = demand - car.x * 0.35;
    return { steer: aim > 0.3 ? 1 : aim < -0.3 ? -1 : 0, gas: car.v < want - 0.2 ? 1 : 0, brake: car.v > want + 0.6 ? 1 : 0 };
  }
  function autoLap(setup, care, track) {
    setup = clampSetup(setup); track = trackOf(track);
    const car = newCar(); let s = "";
    while (car.z < track.LENGTH && car.t < MAX_STEPS) { const i = autopilot(car, setup, care, track); s += encode(i); step(car, setup, i, track); }
    return s;
  }

  // ---------------- what the setup can do (the garage card) ----------------
  function setupStats(setup, track) {
    setup = clampSetup(setup); track = trackOf(track);
    const T = TIRES[setup.tire], gear = GEARS[setup.gear], m = CAR.kg;
    const balance = (slope) => { // the steady speed where the motor's push matches everything slowing you down
      let lo = 0, hi = 40;
      for (let i = 0; i < 50; i++) { const v = (lo + hi) / 2, f = Math.min(T.mu * m * G, motorForce(v, gear).F) - T.crr * m * G - 0.5 * CAR.rho * CAR.cdA * v * v - (m * G * slope) / Math.sqrt(1 + slope * slope); f > 0 ? (lo = v) : (hi = v); }
      return lo;
    };
    // seconds from a standstill to 8 m/s (or the top speed, if that is lower) on flat ground
    const to = Math.min(8, balance(0)) * 0.98; let v = 0, t10 = 0;
    while (v < to && t10 < 30) { v += (Math.min(T.mu * m * G, motorForce(v, gear).F) - T.crr * m * G - 0.5 * CAR.rho * CAR.cdA * v * v) / m * DT; t10 += DT; }
    return { top: balance(0), hill: balance(track.steep), push: Math.round(Math.min(T.mu * m * G, motorForce(0, gear).F)), accel: Math.round(t10 * 10) / 10, accelTo: Math.min(8, balance(0)), corner: Math.sqrt((T.mu * G) / track.tight), gear, tire: T.n };
  }

  // the steady speed a setup can hold up a slope (about 0 means it stalls): the hill profile colors climbs with it
  function climbSpeed(setup, slope) {
    setup = clampSetup(setup);
    const T = TIRES[setup.tire], gear = GEARS[setup.gear], m = CAR.kg;
    let lo = 0, hi = 40;
    for (let i = 0; i < 50; i++) { const v = (lo + hi) / 2, f = Math.min(T.mu * m * G, motorForce(v, gear).F) - T.crr * m * G - 0.5 * CAR.rho * CAR.cdA * v * v - (m * G * slope) / Math.sqrt(1 + slope * slope); f > 0 ? (lo = v) : (hi = v); }
    return lo;
  }

  // medals: gold matches the computer driver's best lap on the track (its par), silver and bronze are within 10% and 25%
  function medals(track) {
    const best = trackOf(track).par;
    return { gold: Math.round(best * 100) / 100, silver: Math.ceil(best * 110) / 100, bronze: Math.ceil(best * 125) / 100 };
  }
  function medalOf(time, track) { // compared in hundredths, the way times are shown
    if (time == null) return null;
    const m = medals(track), t = Math.round(time * 100);
    return t <= Math.round(m.gold * 100) ? "gold" : t <= Math.round(m.silver * 100) ? "silver" : t <= Math.round(m.bronze * 100) ? "bronze" : null;
  }

  // ---------------- car looks (the paint shop) ----------------
  // Looks only: nothing here changes how a car drives. Each value is a choice number (racedraw.js has the names and
  // colors); the server checks looks with cleanLook so classmates see each other's cars in Race Day.
  const LOOK = { body: 5, c1: 12, c2: 12, liv: 7, num: 100, rim: 3, trail: 7, head: 5 };
  const LOOK0 = { body: 0, c1: 0, c2: 6, liv: 1, num: 7, rim: 0, trail: 0, head: 0 };
  function cleanLook(l) {
    const out = {};
    for (const k in LOOK) { const v = l && l[k] !== "" && l[k] != null ? Number(l[k]) : NaN; out[k] = Number.isInteger(v) && v >= 0 && v < LOOK[k] ? v : LOOK0[k]; }
    return out;
  }

  // ---------------- the lap report ----------------
  const kmh = (v) => Math.round(v * 3.6);
  // the computer driver's lap for every setup, worked out once: tips only suggest a change that really is faster
  const autoCache = {};
  function autoTimes(track) {
    track = trackOf(track);
    return (autoCache[track.id] = autoCache[track.id] || GEARS.map((_, g) => TIRES.map((_, t) => { const r = lap({ gear: g, tire: t }, autoLap({ gear: g, tire: t }, undefined, track), track); return r.finished ? r.time : Infinity; }))); // a lap that never finishes is the slowest of all
  }
  function explain(setup, r, track) {
    setup = clampSetup(setup); track = trackOf(track);
    const st = setupStats(setup, track), gear = GEARS[setup.gear], T = TIRES[setup.tire], out = [], K = track.keys;
    const all = GEARS.map((_, g) => setupStats({ gear: g, tire: setup.tire }, track));
    const bestTop = Math.max(...all.map((x) => x.top)), bestHill = Math.max(...all.map((x) => x.hill));
    const part = (name) => track.SECTIONS.map((x, i) => [x, r.sec[i]]).filter(([x, v]) => x.n === name && v.vMin !== Infinity).map(([, v]) => v);
    const straight = part(K.straight).pop(), hill = part(K.hill);
    if (straight) {
      const atTop = straight.vMax >= st.top * 0.95;
      out.push({ tone: st.top >= bestTop * 0.95 ? "good" : st.top < bestTop * 0.6 ? "bad" : "info", title: `${K.straight}: top ${kmh(straight.vMax)} km/h`,
        text: (atTop ? `That's the top speed with a ${gear}:1 gear: the motor was at its max rpm, so it couldn't push any faster.` : `Your car can reach ${kmh(st.top)} km/h here. Stay on the gas the whole straight.`) +
          (atTop && st.top < bestTop * 0.95 ? " Less gearing (fewer motor turns for each wheel turn) gives a higher top speed." : "") });
    }
    if (hill.length) {
      const vMin = Math.min(...hill.map((x) => x.vMin)), weak = st.hill < bestHill * 0.7;
      out.push({ tone: weak ? "bad" : "good", title: vMin < 0.3 ? `${K.hill}: stalled` : `${K.hill}: slowest ${kmh(vMin)} km/h`,
        text: weak ? `Climbing is hard work. With a ${gear}:1 gear the motor doesn't have enough pushing force (torque) for the steep part, so it ${vMin < 0.3 ? "stalled: it stopped and couldn't move" : "slows to a crawl"}. More gearing pushes harder up hills.` : `The ${gear}:1 gear gives the motor enough torque to climb at up to ${kmh(st.hill)} km/h.` });
    }
    if (r.off > 0.5) out.push({ tone: "bad", title: `Off the road for ${r.off.toFixed(1)} s`, text: `Corners push your car outward. ${T.n} tires can hold the ${K.corner} at about ${kmh(st.corner)} km/h; faster than that, you slide onto the grass. Brake before the turn${setup.tire < TIRES.length - 1 ? ", or try grippier tires" : ""}.` });
    else out.push({ tone: "good", title: "Clean driving", text: "You stayed on the road: you took the corners at speeds your tires could hold." });
    // one tip, for the biggest problem
    const at = autoTimes(track), mine = at[setup.gear][setup.tire];
    const lower = setup.gear > 0 ? at[setup.gear - 1][setup.tire] : Infinity, higher = setup.gear < GEARS.length - 1 ? at[setup.gear + 1][setup.tire] : Infinity;
    const tireBest = at[setup.gear].indexOf(Math.min(...at[setup.gear]));
    // the brake tip only when it's true: the careful computer lap with this setup beat this lap (sliding can be faster)
    const slidFaster = r.finished && r.time <= mine;
    const tip = r.off > 2 && !slidFaster ? "Brake before the corners. Sliding onto the grass costs more time than slowing down." :
      lower < mine - 0.3 && lower <= higher ? `Try less gearing (${GEARS[setup.gear - 1]}:1) for more top speed on the straights.` :
      higher < mine - 0.3 ? `Try more gearing (${GEARS[setup.gear + 1]}:1) to climb the ${K.hill} faster. Your top speed will drop a little.` :
      at[setup.gear][tireBest] < mine - 0.3 ? `Try ${TIRES[tireBest].n} tires: ${tireBest > setup.tire ? "they hold the corners at higher speeds" : "they roll more easily on the straights"}.` :
      "Your setup fits this track. Now find time with smoother driving: get back on the gas earlier out of every corner.";
    return { items: out, tip, stats: st };
  }

  // ---------------- missions ----------------
  // What Racer missions (public/data/missions, read by missions.js) can ask about and aim for. Every answer comes from
  // driving the strip here with the computer driver, never from the mission file, so a retune can't make one wrong.
  const autoRuns = {};
  function driven(strip, setup) { // the computer driver's run: { r, inputs }
    setup = clampSetup(setup);
    const k = `${strip.id}:${setup.gear}:${setup.tire}`;
    if (!autoRuns[k]) { const inputs = autoLap(setup, undefined, strip); autoRuns[k] = { r: lap(setup, inputs, strip), inputs }; }
    return autoRuns[k];
  }
  const hillMin = (strip, r) => Math.min(...strip.SECTIONS.map((s, i) => (s.slope > 0 ? r.sec[i].vMin : Infinity)));
  // speed along a run, for the explain card's graph: [z, v] every few steps, ending a second after the car stops for good
  function trace(setup, inputs, track, every = 4) {
    setup = clampSetup(setup); track = trackOf(track);
    const car = newCar(), out = [[0, 0]];
    let still = 0;
    for (let i = 0; i < inputs.length && car.z < track.LENGTH && still < 60; i++) {
      step(car, setup, decode(inputs[i]) || { steer: 0, gas: 0, brake: 0 }, track);
      still = car.v === 0 && car.z > 0 ? still + 1 : 0;
      if (car.t % every === 0) out.push([car.z, car.v]);
    }
    return out;
  }
  const degOf = (slope) => `${(Math.atan(slope) * 180 / Math.PI).toFixed(1)}°`;
  // the allowed gears' computer-driver runs on a strip, for answers and tips: [{ gi, r, top }] (top: its fastest moment)
  const gearRuns = (mission, setup) => (mission.allow.gear || [setup.gear]).slice().sort((a, b) => a - b).map((gi) => {
    const r = driven(stripOf(mission.setting), { ...setup, gear: gi }).r;
    return { gi, r, time: r.finished ? r.time : Infinity, top: Math.max(...r.sec.map((s) => s.vMax)) };
  });
  const best = (runs, key, sign) => runs.slice().sort((a, b) => sign * (a[key] - b[key]))[0];
  // too close to call when the runner-up is within 3% of the winner (a retune could swap them)
  const near = (runs, key, sign) => { const s = runs.slice().sort((a, b) => sign * (a[key] - b[key])); return s.length > 1 && Math.abs(s[1][key] - s[0][key]) < 0.03 * Math.abs(s[0][key]); };
  const gearOptions = (mission) => (mission.allow.gear || []).map((gi) => ({ value: gi, label: `${GEARS[gi]}:1` }));
  const MISSION = {
    setting: stripOf,
    clamp: clampSetup,
    // the student's own inputs when they drove it, otherwise the computer drives (Cadets: "Torque drives")
    run(mission, setup, run) {
      const strip = stripOf(mission.setting);
      return run && typeof run.inputs === "string" ? lap(setup, run.inputs, strip) : driven(strip, setup).r;
    },
    predict: {
      reachTop: {
        options: () => [{ value: "top", label: "It makes it to the top", pic: "car-top" }, { value: "stuck", label: "It gets stuck on the hill", pic: "car-stuck" }],
        answer: (mission, setup) => (driven(stripOf(mission.setting), setup).r.finished ? "top" : "stuck"),
        // too close to call: a car that only just makes it (nearly stops on the hill), or one that only just can't
        close(mission, setup) {
          const strip = stripOf(mission.setting), r = driven(strip, setup).r;
          return r.finished ? hillMin(strip, r) < 0.5 : climbSpeed(setup, strip.steep) > 0.2;
        },
      },
      // which allowed gear reaches the highest speed (asked once: it compares every gear, not the one picked)
      topGear: {
        once: true,
        options: gearOptions,
        answer: (mission, setup) => best(gearRuns(mission, setup), "top", -1).gi,
        close: (mission, setup) => near(gearRuns(mission, setup), "top", -1),
      },
      // which allowed gear gets to the end first (asked once)
      firstHome: {
        once: true,
        options: gearOptions,
        answer: (mission, setup) => best(gearRuns(mission, setup), "time", 1).gi,
        close: (mission, setup) => near(gearRuns(mission, setup).filter((o) => o.time < Infinity), "time", 1),
      },
    },
    goal: {
      reachEnd: { met: (mission, r) => !!r.finished },
      // finish with the fastest allowed gear (the one the computer driver gets to the end soonest)
      bestGear: { met: (mission, r, setup) => !!r.finished && setup.gear === best(gearRuns(mission, setup), "time", 1).gi },
    },
    // The explain card: findings from this run's real numbers (the hill, the straight), one tip that moves one gear step
    // the computer driver shows is better (it reaches the end, or gets there sooner), and the speed along the road.
    explain(mission, setup, run) {
      setup = clampSetup(setup);
      const strip = stripOf(mission.setting), own = run && typeof run.inputs === "string", inputs = own ? run.inputs : driven(strip, setup).inputs;
      const r = lap(setup, inputs, strip), tr = trace(setup, inputs, strip), g = GEARS[setup.gear], deg = degOf(strip.steep), st = setupStats(setup, strip);
      const S = strip.SECTIONS, hi = S.findIndex((s) => s.slope > 0), fi = S.findIndex((s) => !s.slope && s.len >= 60);
      const hillStart = hi < 0 ? 0 : S.slice(0, hi).reduce((a, s) => a + s.len, 0), place = fi < 0 && hi >= 0 ? "the top" : "the end";
      const runs = gearRuns(mission, setup), can = driven(strip, setup).r.finished, kmh = (v) => Math.round(v * 3.6);
      const items = [];
      let headline;
      if (r.finished) {
        headline = { tone: "good", text: place === "the top" ? `Made it to the top in ${r.time.toFixed(1)} s.` : `Finished in ${r.time.toFixed(1)} s.` };
        if (hi >= 0 && hillMin(strip, r) < 3) items.push({ tone: "bad", title: `Crawled up the hill: ${kmh(hillMin(strip, r))} km/h`, terms: ["gear-ratio", "torque"],
          text: `With ${g}:1 gears the motor turns only ${g} times for every turn of the wheels, so there's little torque (twisting strength) at the wheels. It made it, but it crawled up the ${deg} hill.` });
        else if (hi >= 0) items.push({ tone: "good", title: `Slowest on the hill: ${kmh(hillMin(strip, r))} km/h`, terms: ["gear-ratio", "torque"],
          text: `With ${g}:1 gears the motor turns ${g} times for every turn of the wheels. That trades speed for torque (twisting strength): enough push to keep climbing a ${deg} hill.` });
        if (fi >= 0) {
          const v = r.sec[fi].vMax;
          items.push({ tone: "info", title: `On the straight: ${kmh(v)} km/h`, terms: ["rpm", "gearing"], text: v >= st.top * 0.95
            ? `That's the top speed with ${g}:1: the motor reached its top rpm, so it couldn't turn the wheels any faster. Less gearing gives a higher top speed; more gearing gives more push.`
            : `It was still speeding up at the end. With ${g}:1 the car can reach ${kmh(st.top)} km/h on flat ground.` });
        } else if (setup.gear === runs[runs.length - 1].gi && runs.some((o) => o.time < r.time - 0.3))
          items.push({ tone: "info", title: "Strong, but slow on the flat", terms: ["rpm"], text: `${g}:1 tops out at ${kmh(st.top)} km/h, because the motor reaches its top rpm while the wheels still turn slowly.` });
      } else {
        const stopAt = Math.max(0, Math.round(tr[tr.length - 1][0] - hillStart));
        if (can) {
          headline = { tone: "bad", text: hi >= 0 ? "Stopped on the hill." : "Stopped before the end." };
          items.push({ tone: "bad", title: "This gear can do it", terms: ["gear-ratio"], text: `Your car can get to ${place} with ${g}:1 (the computer driver did), but this run stopped. Keep the gas pressed all the way.` });
        } else {
          headline = { tone: "bad", text: `It got stuck ${stopAt} m up the hill.` };
          items.push({ tone: "bad", title: "Stalled on the hill", terms: ["torque", "stall"],
            text: `With ${g}:1 gears the motor couldn't push hard enough. Its torque (twisting strength) at the wheels was less than gravity pulling the car back down the ${deg} hill, so it slowed until it stopped: a stall.` });
        }
      }
      const mine = r.finished ? r.time : Infinity, i = runs.findIndex((o) => o.gi === setup.gear);
      const step = [runs[i - 1], runs[i + 1]].filter((o) => o && o.time < mine - 0.3).sort((a, b) => a.time - b.time)[0];
      let tip;
      if (!r.finished && can) tip = { text: `Run it again and hold the gas until you reach ${place}.` };
      else if (step && step.gi > setup.gear) tip = { change: { gear: step.gi }, text: !r.finished ? `Try more gearing (${GEARS[step.gi]}:1). The wheels turn slower, but they push harder.` : `Try more gearing (${GEARS[step.gi]}:1). It pushes harder up the hill, so it climbs faster.` };
      else if (step) tip = { change: { gear: step.gi }, text: `Try less gearing (${GEARS[step.gi]}:1). Its higher top speed gets you there sooner.` };
      else tip = { text: r.finished ? "That's the fastest gear for this test. Can you explain why it wins?" : "No allowed gear gets up this hill." };
      const graph = { kind: "speedDistance", length: strip.LENGTH, profile: strip.segs.map((s, k) => [k * SEG, s.y]).concat([[strip.LENGTH, strip.segs[strip.segs.length - 1].y]]),
        speed: tr, slow: hi >= 0 ? 3 : null, stop: r.finished ? null : tr[tr.length - 1][0] };
      return { headline, items, tip, graph, result: r };
    },
  };

  return { G, DT, SEG, CAR, MOTOR, GEARS, TIRES, TRACK, TRACKS, trackOf, STRIPS, stripOf, MISSION, ROAD, WALL, clampSetup, newCar, motorForce, step, encode, decode, lap, trace, autopilot, autoLap, autoTimes, setupStats, explain, MAX_STEPS, climbSpeed, medals, medalOf, LOOK, cleanLook };
});
