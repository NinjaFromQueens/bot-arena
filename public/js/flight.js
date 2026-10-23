/*
 * Flying Car Lab physics — shared by the browser and Node tests.
 * Units: meters, seconds, kilograms, newtons. Fully deterministic (no randomness).
 *
 * A design is:
 * { material, tanks, lift, push, flip, computer, gear, people, speed (km/h), ramp (0-2), reserve (% of air), flipOn }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Flight = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const G = 9.81;
  const CAR_LEN = 4.5, CAR_H = 1.3, HALF = 2.2;

  // ---------------- parts ----------------
  const BASE = { kg: 550, cost: 60000 }; // frame, wheels, motors, battery, seats
  const MATERIALS = [
    { n: "Plastic", kg: 180, cost: 5000, str: 0.5, d: "Cheap and light, but cracks on hard landings" },
    { n: "Aluminum", kg: 320, cost: 25000, str: 2, d: "Light metal with medium strength" },
    { n: "Steel", kg: 650, cost: 12000, str: 3.5, d: "Super strong and cheap, but very heavy" },
    { n: "Carbon fiber", kg: 170, cost: 80000, str: 2.5, d: "Super light and strong, but expensive" },
  ];
  const TANK = { kg: 40, air: 12, liters: 60, cost: 8000, max: 8 }; // kg includes the air inside
  const NOZZLE = { kg: 4, cost: 3000, thrust: 1600, flow: 4, flipFlow: 2 }; // flow = kg of air per second while firing
  const LIMITS = { lift: 16, push: 4, flip: 4 };
  const COMPUTERS = [
    { n: "None", kg: 0, cost: 0, d: "No sensors. Nobody keeps the car level." },
    { n: "Stabilizer", kg: 5, cost: 8000, d: "Gyro sensor keeps the car level and fires a landing cushion." },
    { n: "Pro computer", kg: 8, cost: 25000, d: "Everything the stabilizer does, plus flips and perfect cushion timing." },
  ];
  const GEARS = [
    { n: "Standard", kg: 0, cost: 0, absorb: 7, stroke: 0.3, d: "Normal car springs" },
    { n: "Sport", kg: 30, cost: 10000, absorb: 9.5, stroke: 0.6, d: "Stiffer, longer suspension" },
    { n: "Racing", kg: 60, cost: 25000, absorb: 12, stroke: 1.0, d: "Long-travel shocks for big drops" },
  ];
  const PERSON_KG = 80;
  const RAMPS = [{ n: "Low", deg: 10 }, { n: "Medium", deg: 18 }, { n: "Steep", deg: 25 }];
  const RAMP_LEN = 5;
  const FLIP_ARM = 1.8;

  // ---------------- obstacles ----------------
  // kind is used for drawing; h = height (m), w = length (m)
  const VEH = {
    sedan: { kind: "sedan", h: 1.45, w: 4.7, label: "Sedan" },
    suv: { kind: "suv", h: 1.7, w: 4.8, label: "SUV" },
    pickup: { kind: "pickup", h: 1.9, w: 5.7, label: "Pickup truck" },
    cab: { kind: "cab", h: 1.5, w: 4.3, label: "Robotaxi" },
    tractor: { kind: "tractor", h: 4.0, w: 7.0, label: "Semi truck" },
    semi: { kind: "semi", h: 4.0, w: 20.0, label: "Semi truck with trailer" },
  };
  function row(list, start = 8, gap = 0.8) {
    let x = start;
    return list.map((k) => { const v = { ...VEH[k], x }; x += v.w + gap; return v; });
  }

  // ---------------- missions ----------------
  // need: requirements beyond "land safely". stars: [complete, smooth landing, efficiency goal]
  const MISSIONS = [
    { id: "hop", n: "First Flight", goal: "Use your thrusters to stay in the air for at least 2 seconds, then land safely.",
      obstacles: [], need: { airtime: 2 }, eff: { kind: "kg", max: 1100, text: "Car weighs under 1,100 kg" } },
    { id: "car", n: "Car Hop", goal: "Jump over a parked car and land safely on the other side.",
      obstacles: row(["sedan"], 20), need: {}, eff: { kind: "cost", max: 120000, text: "Costs under $120,000" } },
    { id: "semi", n: "Semi Jump", goal: "Clear a semi truck with its trailer. It's 4 meters tall and 20 meters long.",
      obstacles: row(["semi"], 14), need: {}, eff: { kind: "kg", max: 1250, text: "Car weighs under 1,250 kg" } },
    { id: "flip", n: "Backflip", goal: "Do a full backflip in the air and land on your wheels.",
      obstacles: [], need: { flip: true }, eff: { kind: "cost", max: 190000, text: "Costs under $190,000" } },
    { id: "five", n: "Five in a Row", goal: "Like the real demo: hop over five vehicles parked in a line, including a semi truck.",
      obstacles: row(["cab", "pickup", "tractor", "suv", "sedan"], 12, 1.2), need: {}, eff: { kind: "kg", max: 1200, text: "Car weighs under 1,200 kg" } },
    { id: "semiflip", n: "Semi Flip", goal: "Clear the semi truck AND do a backflip on the way over.",
      obstacles: row(["semi"], 14), need: { flip: true }, eff: { kind: "cost", max: 230000, text: "Costs under $230,000" } },
    { id: "people", n: "Passenger Safety", goal: "Carry 2 passengers over the semi truck. The landing must be gentle: under 6 g.",
      obstacles: row(["semi"], 14), need: { people: 2, maxG: 6 }, eff: { kind: "cost", max: 220000, text: "Costs under $220,000" } },
    { id: "budget", n: "Budget Engineer", goal: "Clear the semi truck while spending less than $150,000. Every dollar counts.",
      obstacles: row(["semi"], 14), need: { budget: 150000 }, eff: { kind: "kg", max: 1150, text: "Car weighs under 1,150 kg" } },
  ];
  const ZONE_END = 85; // landing zone ends here (m past the ramp)

  const DEFAULT_DESIGN = { material: 2, tanks: 3, lift: 6, push: 0, flip: 0, computer: 0, gear: 0, people: 1, speed: 50, ramp: 1, reserve: 0, flipOn: false };

  function clampDesign(d) {
    const c = (v, a, b, def) => { v = Math.round(+v); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : def; };
    const D = DEFAULT_DESIGN;
    return {
      material: c(d.material, 0, 3, D.material), tanks: c(d.tanks, 0, TANK.max, D.tanks),
      lift: c(d.lift, 0, LIMITS.lift, D.lift), push: c(d.push, 0, LIMITS.push, D.push), flip: c(d.flip, 0, LIMITS.flip, D.flip),
      computer: c(d.computer, 0, 2, D.computer), gear: c(d.gear, 0, 2, D.gear), people: c(d.people, 0, 2, D.people),
      speed: c(d.speed, 20, 60, D.speed), ramp: c(d.ramp, 0, 2, D.ramp), reserve: [0, 15, 30, 45].includes(+d.reserve) ? +d.reserve : 0,
      flipOn: !!d.flipOn,
    };
  }

  // ---------------- design sheet ----------------
  function sheet(d) {
    const M = MATERIALS[d.material], C = COMPUTERS[d.computer], R = GEARS[d.gear];
    const nozzles = d.lift + d.push + d.flip;
    const parts = [
      ["Frame, wheels, motors", BASE.kg, BASE.cost],
      [`${M.n} body`, M.kg, M.cost],
      [`${d.tanks} air tank${d.tanks === 1 ? "" : "s"}`, d.tanks * TANK.kg, d.tanks * TANK.cost],
      [`${nozzles} nozzle${nozzles === 1 ? "" : "s"}`, nozzles * NOZZLE.kg, nozzles * NOZZLE.cost],
      [`${C.n === "None" ? "No" : C.n} flight computer`, C.kg, C.cost],
      [`${R.n} landing gear`, R.kg, R.cost],
      [`${d.people} passenger${d.people === 1 ? "" : "s"}`, d.people * PERSON_KG, 0],
    ];
    const kg = parts.reduce((a, p) => a + p[1], 0), cost = parts.reduce((a, p) => a + p[2], 0);
    const weight = kg * G, lift = d.lift * NOZZLE.thrust, push = d.push * NOZZLE.thrust;
    const air = d.tanks * TANK.air, flowAll = (d.lift + d.push) * NOZZLE.flow;
    const useAir = air * (1 - d.reserve / 100);
    const burn = flowAll ? useAir / flowAll : 0;
    const tw = weight ? lift / weight : 0;
    const strength = R.absorb + M.str;
    const inertia = kg * (CAR_LEN * CAR_LEN + CAR_H * CAR_H) / 12;
    const flipAlpha = d.flip ? (d.flip * NOZZLE.thrust * FLIP_ARM) / inertia : 0;
    const flipTime = flipAlpha ? 2 * Math.sqrt((2 * Math.PI) / flipAlpha) : Infinity;
    return { parts, kg, cost, weight, lift, push, air, burn, tw, strength, inertia, flipAlpha, flipTime, liters: d.tanks * TANK.liters };
  }

  // ---------------- simulation ----------------
  function simulate(design, mission) {
    const d = clampDesign(design), S = sheet(d), M = mission || MISSIONS[0];
    const obs = M.obstacles;
    const th = (RAMPS[d.ramp].deg * Math.PI) / 180, v0 = d.speed / 3.6;
    let x = 0, y = RAMP_LEN * Math.sin(th), vx = v0 * Math.cos(th), vy = v0 * Math.sin(th);
    let p = th, w = 0, m = S.kg, air = S.air;
    const reserveAir = S.air * (d.reserve / 100);
    const ctrl = d.computer > 0 && d.lift >= 2; // stabilizer needs lift nozzles to steer with
    const wantFlip = d.flipOn && d.computer === 2 && d.flip >= 2;
    if (d.computer === 0) w = -0.5; // front wheels leave the ramp first: nose starts dropping
    const dt = 1 / 240, frames = [];
    let t = 0, maxY = y, maxYx = x, liftOff = false, burnEnd = null, cushionUsed = 0, cushionStart = null;
    let flipTarget = 2 * Math.PI, flipDone = false, flipAngle = 0, startP = p, minAbove = Infinity, result = null;
    let airOutT = null, flipAirOut = false, flipStartT = null;
    // the Pro computer keeps enough air to finish the flip, and climbs with the rest first
    const flipAirNeed = wantFlip && Number.isFinite(S.flipTime) ? d.flip * NOZZLE.flipFlow * S.flipTime * 1.1 : 0;
    const y0 = y;
    while (t < 14) {
      const up = { x: -Math.sin(p), y: Math.cos(p) }, fwd = { x: Math.cos(p), y: Math.sin(p) };
      const upright = Math.cos(p) > 0.3;
      // --- what fires this step ---
      let liftOn = false, pushOn = false, flipF = 0, cushion = false;
      const mainAir = air > reserveAir + (wantFlip && !flipDone ? flipAirNeed : 0) + 1e-9;
      const flipping = wantFlip && !flipDone && t > 0.12 && (!mainAir || !(d.lift || d.push));
      const aligned = Math.cos(p) > 0.85; // mid-flip the computer only fires when the car points the right way
      if (mainAir && (d.lift || d.push)) {
        liftOn = d.lift > 0 && (!ctrl || (flipping ? aligned : upright));
        pushOn = d.push > 0 && (!flipping || aligned);
      }
      if (!mainAir && burnEnd == null && (d.lift || d.push)) burnEnd = t;
      // landing cushion: needs a computer, saved air, and the car coming down
      if (!liftOn && ctrl && air > 1e-9 && vy < 0 && upright && d.lift) {
        const a = (d.lift * NOZZLE.thrust) / m - G, v = -vy;
        let trig = 2.5; // the Stabilizer always fires at 2.5 m
        if (d.computer === 2) { // the Pro computer times it so the air lasts until touchdown
          const tAir = air / (d.lift * NOZZLE.flow);
          if (a <= 0) trig = v * tAir - 0.5 * a * tAir * tAir;
          else trig = a * tAir >= v ? (v * v) / (2 * a) + 0.2 : v * tAir - 0.5 * a * tAir * tAir;
        }
        if (y <= trig) { cushion = true; liftOn = true; }
      }
      // flip control (Pro computer)
      if (flipping && air > 1e-9) {
        if (flipStartT == null) flipStartT = t;
        const rem = flipTarget - p, stop = (w * w) / (2 * Math.max(S.flipAlpha, 1e-6));
        if (rem > 0.06 || Math.abs(w) > 0.4) flipF = rem > stop ? 1 : -1;
        else flipDone = true;
      }
      if (wantFlip && !flipDone && air <= 1e-9) flipAirOut = true;
      // --- forces ---
      let ax = 0, ay = -G, flow = 0;
      // with a computer the lift nozzles are aimed straight down (thrust vectoring); without one they follow the car's tilt
      const liftDir = ctrl && !flipping ? { x: 0, y: 1 } : up;
      if (liftOn) { const F = d.lift * NOZZLE.thrust; ax += (F * liftDir.x) / m; ay += (F * liftDir.y) / m; flow += d.lift * NOZZLE.flow; liftOff = true; if (cushion) { cushionUsed += d.lift * NOZZLE.flow * dt; if (cushionStart == null) cushionStart = t; } }
      if (pushOn) { const F = d.push * NOZZLE.thrust; ax += (F * fwd.x) / m; ay += (F * fwd.y) / m; flow += d.push * NOZZLE.flow; }
      if (flipF) flow += d.flip * NOZZLE.flipFlow;
      // --- rotation ---
      let alpha = 0;
      if (flipF) alpha = flipF * S.flipAlpha;
      else if (ctrl && !flipping) {
        const target = wantFlip && (flipDone || flipStartT != null) ? flipTarget : 0;
        alpha = -16 * (p - target) - 7 * w;
      } else if (!ctrl && liftOn) alpha = 0.12 * d.lift; // uneven thrust nobody corrects
      // --- integrate ---
      vx += ax * dt; vy += ay * dt; x += vx * dt; y += vy * dt;
      w += alpha * dt; p += w * dt;
      if (flow) { const used = Math.min(air, flow * dt); air -= used; m -= used; if (air <= 1e-9 && airOutT == null) airOutT = t; }
      t += dt;
      if (y > maxY) { maxY = y; maxYx = x; }
      // obstacle clearance + collisions
      for (const o of obs) {
        if (x + HALF > o.x && x - HALF < o.x + o.w) {
          minAbove = Math.min(minAbove, y - o.h);
          if (y < o.h) {
            const fromAbove = y - vy * dt >= o.h - 0.05;
            result = { type: fromAbove ? "crash_top" : "crash_side", obstacle: o };
          }
        }
      }
      if (frames.length === 0 || t - frames[frames.length - 1].t >= 1 / 60 - 1e-9) {
        frames.push({ t, x, y, p, lift: liftOn, push: pushOn, flip: flipF, cushion, air: air / Math.max(S.air, 1e-9), vy, vx });
      }
      if (result) break;
      if (y <= 0 && t > 0.03) break;
    }
    frames.push({ t, x, y: Math.max(y, result ? y : 0), p, lift: false, push: false, flip: 0, cushion: false, air: air / Math.max(S.air, 1e-9), vy, vx, end: true });
    const flightTime = t;
    const vImp = Math.max(0, -vy);
    const pitchDeg = ((((p * 180) / Math.PI) % 360) + 540) % 360 - 180; // -180..180
    flipAngle = ((p - startP) * 180) / Math.PI;
    const R = GEARS[d.gear];
    const gForce = (vImp * vImp) / (2 * R.stroke) / G;
    let outcome;
    if (result) outcome = result.type;
    else if (Math.abs(pitchDeg) > 25) outcome = Math.abs(pitchDeg) > 120 ? "crash_upside" : "crash_angle";
    else if (vImp > S.strength) outcome = "crash_hard";
    else if (x > ZONE_END) outcome = "overshoot";
    else if (obs.length && x - HALF < Math.max(...obs.map((o) => o.x + o.w))) outcome = "short";
    else outcome = "landed";
    const landing = outcome === "landed" ? (vImp > S.strength * 0.75 ? "hard" : "smooth") : null;
    return {
      design: d, sheet: S, mission: M, frames, outcome, landing, obstacle: result && result.obstacle,
      flightTime, landX: x, maxY, maxYx, vImp, gForce, pitchDeg, flipAngle, burnEnd, airOutT, liftOff,
      cushionUsed, cushionStart, reserveAir, minAbove, wantFlip, flipAirOut, ctrl, y0, flipStartT, flipAirNeed,
      vx0: v0 * Math.cos(th), vy0: v0 * Math.sin(th),
    };
  }
  function groundBelow(x, obs) {
    let g = 0;
    for (const o of obs) if (x + HALF > o.x && x - HALF < o.x + o.w) g = Math.max(g, o.h);
    return g;
  }

  // ---------------- grading ----------------
  function grade(r) {
    const M = r.mission, d = r.design, S = r.sheet, need = M.need || {};
    const fails = [];
    if (need.people && d.people < need.people) fails.push("people");
    if (need.budget && S.cost > need.budget) fails.push("budget");
    if (r.outcome !== "landed") fails.push("outcome");
    if (need.airtime && r.flightTime < need.airtime) fails.push("airtime");
    const flipped = Math.abs(r.flipAngle) >= 330;
    if (need.flip && !flipped) fails.push("flip");
    if (need.maxG && r.outcome === "landed" && r.gForce > need.maxG) fails.push("gforce");
    const complete = fails.length === 0;
    const smooth = complete && r.landing === "smooth";
    const eff = M.eff, effVal = eff.kind === "kg" ? S.kg : S.cost;
    const effOk = complete && effVal <= eff.max;
    return { complete, fails, flipped, stars: [complete, smooth, effOk], effVal };
  }

  // ---------------- explanations ----------------
  const fmt = (n, dp = 1) => Number(n).toFixed(dp).replace(/\.0$/, "");
  const kN = (n) => fmt(n / 1000) + " kN";
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const kg = (n) => Math.round(n).toLocaleString("en-US") + " kg";

  function explain(r, g) {
    const d = r.design, S = r.sheet, M = r.mission, out = [];
    const item = (tone, title, text) => out.push({ tone, title, text });
    // headline
    let headline;
    if (g.complete) headline = { tone: "good", text: g.stars.every(Boolean) ? "Mission complete with all 3 stars!" : "Mission complete!" };
    else headline = { tone: "bad", text: "Not yet. Here's what happened and why." };

    // budget / people gates
    if (g.fails.includes("budget")) item("bad", "Over budget", `Your car costs ${money(S.cost)}, but this mission's budget is ${money(M.need.budget)}. The most expensive parts are carbon fiber (${money(MATERIALS[3].cost)}), the Pro computer, racing gear and extra tanks.`);
    if (g.fails.includes("people")) item("bad", "Missing passengers", `This mission needs ${M.need.people} passengers, but your car has ${d.people}. Passengers add ${PERSON_KG} kg each, so you'll need more thrust.`);

    // thrust vs weight
    if (d.lift === 0) item("bad", "No lift thrusters", "Your car has no nozzles pointing down, so nothing pushes it up. The ramp alone gave it a short hop.");
    else if (S.tw < 1) item("bad", "Thrust is less than weight", `Your lift thrust is ${kN(S.lift)}, but gravity pulls on your ${kg(S.kg)} car with ${kN(S.weight)}. Thrust-to-weight is ${fmt(S.tw, 2)}. Below 1.0 the nozzles can't lift the car by themselves. The ramp threw it up, and the thrust only slowed its fall.`);
    else item(S.tw >= 1.3 ? "good" : "info", "Thrust beat weight", `Lift thrust ${kN(S.lift)} vs weight ${kN(S.weight)}: thrust-to-weight ${fmt(S.tw, 2)}. Above 1.0 means the nozzles can push the car up. Higher means it climbs faster.`);

    // air supply
    if (d.tanks === 0 && d.lift + d.push + d.flip > 0) item("bad", "No air tanks", "The nozzles had no air to blow out. Cold-gas thrusters need compressed air from tanks.");
    else if (d.lift + d.push > 0 && S.tw >= 1) {
      const t = r.burnEnd != null ? r.burnEnd : S.burn;
      item("info", "Air supply", `Your ${S.liters} L of air (${d.tanks} tank${d.tanks === 1 ? "" : "s"}) ran the thrusters for ${fmt(t)} s${d.reserve ? `, keeping ${d.reserve}% for the landing` : ""}. When the air runs out, the push stops and gravity takes over. More tanks = longer push, but each tank adds ${TANK.kg} kg.`);
    }

    // height & distance vs obstacles
    const obs = M.obstacles;
    if (obs.length) {
      const tallest = Math.max(...obs.map((o) => o.h)), end = Math.max(...obs.map((o) => o.x + o.w));
      if (r.outcome === "crash_side") item("bad", `Hit the side of the ${r.obstacle.label.toLowerCase()}`, `The car only got ${fmt(Math.max(0, r.maxY))} m high, but the ${r.obstacle.label.toLowerCase()} is ${fmt(r.obstacle.h)} m tall. You need more height: more thrust, a lighter car, or more air.`);
      else if (r.outcome === "crash_top") item("bad", `Came down on top of the ${r.obstacle.label.toLowerCase()}`, `You got high enough (${fmt(r.maxY)} m) but ran out of distance. The car came down at ${fmt(r.landX)} m and the vehicles end at ${fmt(end)} m. Go faster up the ramp, add push nozzles, or stay in the air longer.`);
      else if (r.outcome !== "short") item("good", "Cleared the vehicles", `Peak height ${fmt(r.maxY)} m over a ${fmt(tallest)} m obstacle, with ${fmt(Math.max(0, r.minAbove))} m to spare at the closest point.`);
    } else {
      item("info", "Flight", `Peak height ${fmt(r.maxY)} m, ${fmt(r.flightTime)} s in the air, landed ${fmt(r.landX)} m from the ramp.`);
      if (g.fails.includes("airtime")) item("bad", "Not enough air time", `You were airborne for ${fmt(r.flightTime)} s. The goal is ${M.need.airtime} s. Stronger thrust or more air keeps you up longer.`);
    }
    if (r.outcome === "short") item("bad", "Landed before the vehicles", `The car came down at ${fmt(r.landX)} m, but the vehicles start at ${fmt(obs[0].x)} m and end at ${fmt(Math.max(...obs.map((o) => o.x + o.w)))} m. It has to fly all the way over them. Add thrust and air, or go faster.`);
    if (r.outcome === "overshoot") item("bad", "Flew past the landing zone", `You landed at ${fmt(r.landX)} m, but the safe landing zone ends at ${ZONE_END} m. Slow down on the ramp or use fewer push nozzles.`);

    // stability / computer
    if (!r.ctrl && (r.outcome === "crash_angle" || r.outcome === "crash_upside")) {
      item("bad", "The car tipped over in the air", `It landed tilted ${fmt(Math.abs(r.pitchDeg), 0)}° (more than 25° crashes). ${d.computer === 0 ? "Without a flight computer nobody keeps the car level." : "The flight computer needs at least 2 lift nozzles to steer with."} A flight computer uses a gyro sensor (Sense), decides how to correct (Think), and fires nozzles (Act). That's Sense, Think, Act!`);
    } else if (r.ctrl) item("good", "Flight computer kept it level", "The gyro sensed the tilt and the computer fired the nozzles to correct it. Sense, Think, Act.");
    else if (d.computer === 0 && r.flightTime > 1.2 && r.outcome === "landed") item("info", "Lucky landing", `Without a flight computer the car tilted ${fmt(Math.abs(r.pitchDeg), 0)}° by landing. A longer flight would tip it over.`);

    // flip
    if (d.flipOn || M.need.flip) {
      if (d.computer !== 2) item("bad", "No flip", "Only the Pro computer can do flips. It has to spin the car and stop it at exactly one full turn.");
      else if (d.flip < 2) item("bad", "No flip thrusters", "Add at least 2 flip nozzles. They push the front and back in opposite directions to spin the car.");
      else if (!d.flipOn) item("bad", "Flip was turned off", "Turn on Backflip in the flight plan.");
      else if (g.flipped && r.outcome === "landed") item("good", "Backflip landed!", `The car turned ${fmt(Math.abs(r.flipAngle), 0)}° in ${fmt(S.flipTime)} s. Flip speed depends on thrust and weight: heavier cars are harder to spin (more inertia).`);
      else {
        const why = S.flipTime > r.flightTime
          ? `A full flip needs about ${fmt(S.flipTime)} s with your ${d.flip} flip nozzles and ${kg(S.kg)} car, but you were only in the air ${fmt(r.flightTime)} s.`
          : r.flipAirOut ? "The tanks ran out of air in the middle of the flip, so the computer couldn't stop the spin." : "The flip wasn't finished when the car touched down.";
        item("bad", `Flip only got to ${fmt(Math.abs(r.flipAngle), 0)}°`, `${why} More flip nozzles spin faster, a lighter car is easier to spin, and more air time gives the flip time to finish.`);
      }
    }

    // too high = hard landing
    const tallest = obs.length ? Math.max(...obs.map((o) => o.h)) : 0;
    const needH = obs.length ? tallest + 1.2 : 2;
    if ((r.outcome === "crash_hard" || r.landing === "hard") && r.maxY > needH + 2) {
      item("info", "Higher isn't always better", `You peaked at ${fmt(r.maxY)} m${obs.length ? `, but you only needed about ${fmt(needH)} m to clear the ${fmt(tallest)} m vehicles` : ""}. The higher you go, the faster you fall: from ${fmt(r.maxY)} m a car hits the ground at about ${fmt(Math.sqrt(2 * G * r.maxY))} m/s. Engineers use just enough power, not the most.`);
    }
    if (r.flipStartT != null && r.flipAirNeed > 0) item("info", "Flight plan", `The Pro computer climbed first, then started the flip at ${fmt(r.flipStartT)} s. It kept ${fmt(r.flipAirNeed, 0)} kg of air for the flip${d.reserve ? " plus your saved landing air" : ""}.`);

    // landing
    if (r.outcome === "crash_hard") item("bad", "Landing was too hard", `The car hit the ground at ${fmt(r.vImp)} m/s. Your ${GEARS[d.gear].n.toLowerCase()} gear + ${MATERIALS[d.material].n.toLowerCase()} body can take ${fmt(S.strength)} m/s. Fixes: stronger gear or body, or save air for a landing cushion (needs a flight computer).`);
    else if (r.outcome === "landed") {
      const pct = Math.round((r.vImp / S.strength) * 100);
      item(r.landing === "smooth" ? "good" : "info", r.landing === "smooth" ? "Smooth landing" : "Hard landing (but it survived)", `Touched down at ${fmt(r.vImp)} m/s. Your car can take ${fmt(S.strength)} m/s, so that used ${pct}% of its strength.${d.people ? ` Passengers felt ${fmt(r.gForce)} g.` : ""}`);
      if (g.fails.includes("gforce")) item("bad", "Too rough for passengers", `Passengers felt ${fmt(r.gForce)} g, but the limit is ${M.need.maxG} g. Longer suspension (Sport or Racing) spreads the stop out, and a landing cushion slows you before touchdown.`);
    }
    if (r.cushionUsed > 0.5) item("good", "Landing cushion fired", `The computer used ${fmt(r.cushionUsed, 0)} kg of saved air to slow the fall right before touchdown.`);
    else if (d.reserve > 0 && !r.ctrl) item("info", "Saved air was wasted", "You saved air for the landing, but without a working flight computer nothing fired it at the right moment.");

    return { headline, items: out, tip: tipFor(r, g) };
  }

  // the single most useful thing to try next
  function tipFor(r, g) {
    const d = r.design, S = r.sheet, M = r.mission;
    const needN = Math.ceil((S.weight * 1.4) / NOZZLE.thrust);
    const heavier = d.material === 2 ? "Steel is heavy: try aluminum or carbon fiber" : "Make the car lighter";
    if (g.fails.includes("budget")) return "Swap to cheaper parts: steel or aluminum instead of carbon fiber, fewer tanks, or the Stabilizer instead of the Pro computer.";
    if (g.fails.includes("people")) return `Set passengers to ${M.need.people}, then add lift nozzles to carry the extra weight.`;
    if (r.outcome === "crash_angle" || r.outcome === "crash_upside") {
      if (d.computer === 0) return "Add a flight computer. Without one, nothing keeps the car level and it tips over.";
      if (d.lift < 2) return "Add at least 2 lift nozzles so the flight computer can steer.";
      return "Give the flip more time: more flip nozzles, a lighter car, or more air time.";
    }
    if (r.outcome === "crash_side") {
      if (d.lift === 0) return "Add lift nozzles. Try 10 to start.";
      if (d.tanks === 0) return "Add air tanks. Your thrusters need air to push.";
      if (S.tw < 1.3) return `Climb faster: you need thrust-to-weight around 1.4 or more. Add lift nozzles (about ${needN}) or ${heavier.toLowerCase()}.`;
      return "You climb fast enough but not for long enough. Add an air tank, save less air for landing, or use a steeper ramp.";
    }
    if (r.outcome === "crash_top") return S.tw < 1 ? `Your thrust is less than your weight, so the car can't stay up long enough to get over. Add lift nozzles (about ${needN}) or ${heavier.toLowerCase()}.` : "You need more distance: raise the ramp speed, add a push nozzle, or add an air tank to stay up longer.";
    if (r.outcome === "short") return S.tw < 1.2 ? `Add lift nozzles (about ${needN}) and air so the car can fly over, not just hop.` : "Go faster up the ramp and add an air tank so you stay up long enough to get past.";
    if (r.outcome === "overshoot") return "Slow down on the ramp or remove push nozzles.";
    const tallestT = M.obstacles.length ? Math.max(...M.obstacles.map((o) => o.h)) : 0;
    if (r.outcome === "crash_hard" && r.maxY > (M.obstacles.length ? tallestT + 1.2 : 2) + 2) return `You flew ${fmt(r.maxY)} m high, which is more than you need. Use fewer lift nozzles or tanks so you don't fall as far, or upgrade the landing gear.`;
    if (r.outcome === "crash_hard") return d.computer > 0
      ? (d.reserve ? "Save more air for the cushion, or upgrade the landing gear. The Pro computer times the cushion best." : "Save 20% of your air for a landing cushion, or upgrade the landing gear.")
      : "Upgrade the landing gear, or add a flight computer and save some air for a landing cushion.";
    if (g.fails.includes("flip")) {
      if (d.computer !== 2) return "Pick the Pro computer, add 2 or more flip nozzles, and turn on Backflip.";
      if (d.flip < 2) return "Add at least 2 flip nozzles.";
      if (!d.flipOn) return "Turn on Backflip in the flight plan.";
      return S.flipTime > r.flightTime ? "Make the flip faster (more flip nozzles, lighter car) or stay up longer (more air, more lift)." : "Add an air tank so the computer has air left to finish the flip.";
    }
    if (g.fails.includes("airtime")) return S.tw < 1 ? `Add lift nozzles (about ${needN}) or ${heavier.toLowerCase()} so the thrust can hold the car up.` : "Add an air tank or more lift nozzles to stay up longer.";
    if (g.fails.includes("gforce")) return "Use Sport or Racing gear and save air for a cushion with the Pro computer.";
    if (!g.stars[1]) return "For a smooth landing, save some air for a cushion or use stronger landing gear.";
    if (!g.stars[2]) return `For the third star: ${M.eff.text.toLowerCase()}. You're at ${M.eff.kind === "kg" ? kg(S.kg) : money(S.cost)}.`;
    return "Perfect run! Try the next mission.";
  }

  return { G, CAR_LEN, CAR_H, HALF, BASE, MATERIALS, TANK, NOZZLE, LIMITS, COMPUTERS, GEARS, PERSON_KG, RAMPS, RAMP_LEN, VEH, MISSIONS, ZONE_END,
    DEFAULT_DESIGN, clampDesign, sheet, simulate, grade, explain, fmt, money, kg, kN };
});
