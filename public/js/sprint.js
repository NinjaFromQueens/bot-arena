/*
 * Problem sets for Speed Run and the math lessons (shared-parts-spec section 8, docs/speed-run-plan.md). Shared by the
 * browser, the server and the tests. A set turns (seed, tier) into a problem: the text for that reading level, the
 * numbers and picture data, the answer with its tolerance, the worked steps and the common mistakes. Every number comes
 * from the game's own model (rule L14): the Thrust set builds a car from the seed and reads it with Flight.sheet, so an
 * answer always matches what the Flying Car Lab does. The same seed and tier always give the same problem, and every
 * tier in a round gets the same car, because the board shows one car to the class. The server sends students
 * forStudent(problem) (no answer, steps or mistakes) and checks answers itself with check(). test/sprint.test.js
 * checks every rule over 1,000 seeds per tier.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./flight.js"));
  else root.Sprint = factory(root.Flight);
})(typeof self !== "undefined" ? self : this, function (F) {
  const TIERS = ["cadet", "recruit", "operative"];
  const G10 = 10, THRUST = F.NOZZLE.thrust, NOZ_KG = F.NOZZLE.kg, FLOW = F.NOZZLE.flow, AIR = F.TANK.air, MAXN = F.LIMITS.lift;

  // seeded random numbers (mulberry32), so the same seed always gives the same problem
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const mix = (...ns) => ns.reduce((h, n) => (Math.imul(h ^ (n >>> 0), 0x9e3779b1) + 0x7f4a7c15) >>> 0, 0x2545f491);
  const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  // numbers as students read them: 14,240 and 0.7
  const fmt = (n, dp = 0) => { const [i, f] = Math.abs(n).toFixed(dp).split("."); return (n < 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : ""); };
  const r1 = (x) => Math.round(x * 10) / 10;
  const nearHalf = (x) => Math.abs((x * 10) % 1 - 0.5) < 0.02; // rounding to one decimal would be a coin toss: pick another car
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // ---------------- the Thrust set ----------------
  const sheet = (d) => F.sheet(d);
  const withLift = (d, n) => ({ ...d, lift: n });
  // a car the Lab could build: any body, 1-6 tanks, 4-14 lift nozzles, sometimes push nozzles
  function carFrom(r) {
    return F.clampDesign({ material: int(r, 0, 3), tanks: int(r, 1, 6), lift: int(r, 4, 14), push: r() < 0.4 ? int(r, 1, 2) : 0, flip: 0,
      computer: int(r, 0, 2), gear: int(r, 0, 2), people: int(r, 0, 2), speed: 50, ramp: 1, reserve: 0, flipOn: false });
  }
  const pushText = (car) => (car.push ? ` and ${plural(car.push, "push nozzle")}` : "");
  // keep the mistakes whose value differs from the answer and from each other (so a typed value means one thing)
  function distinct(answer, list) {
    const tolOf = (m) => (m.tol != null ? m.tol : answer.tol); // check() uses the answer's tolerance for a mistake without its own
    const out = [];
    for (const m of list) {
      if (!Number.isFinite(m.value) || Math.abs(m.value - answer.value) <= answer.tol + tolOf(m) + 1e-9) continue;
      if (out.some((o) => Math.abs(o.value - m.value) <= tolOf(o) + tolOf(m) + 1e-9)) continue;
      out.push(m);
    }
    return out;
  }

  const KINDS = [
    // ---- Cadet: pictures and small counts ----
    { tier: "cadet", id: "liftOrNot", make(car) {
      const s = sheet(car);
      if (Math.abs(s.tw - 1) < 0.15) return null; // the arrows must look clearly different
      const yes = s.tw > 1, label = { yes: "Yes, it lifts off", no: "No, it stays down" };
      return {
        text: "The orange arrow is the thrusters pushing up. The blue arrow is the car's weight pulling down. Can the thrusters lift the car on their own?",
        pic: { kind: "forceArrows", up: s.lift, down: Math.round(s.weight) },
        input: { kind: "choice", options: [{ value: "yes", label: label.yes }, { value: "no", label: label.no }] },
        answer: { value: yes ? "yes" : "no", tol: 0 },
        steps: [`Look at the arrows. The orange push arrow is ${yes ? "longer" : "shorter"} than the blue weight arrow.`,
          yes ? "The push up is bigger than the weight, so the thrusters win." : "The weight is bigger than the push up, so the car can't climb on its own.",
          yes ? label.yes : label.no],
        mistakes: [{ value: yes ? "no" : "yes", why: yes ? "The push arrow is longer than the weight arrow, so the thrusters can lift the car." : "The weight arrow is longer. The car needs more nozzles or less weight to lift off." }],
      };
    } },
    { tier: "cadet", id: "enoughNozzles", make(car, r) {
      // the same car with two nozzle counts: exactly one can lift off (each nozzle's 4 kg included)
      const tw = (n) => sheet(withLift(car, n)).tw;
      let need = 0; for (let n = 1; n <= MAXN && !need; n++) if (tw(n) > 1) need = n;
      if (!need) return null;
      const few = need - int(r, 2, 4), many = need + int(r, 0, 2);
      if (few < 1 || many > MAXN || tw(few) > 0.92 || tw(many) < 1.05) return null;
      const order = r() < 0.5 ? [few, many] : [many, few];
      return {
        text: "These two cars are the same except for their lift nozzles. Which car can lift off on its own?",
        pic: { kind: "twoCars", nozzles: order },
        input: { kind: "choice", options: order.map((n) => ({ value: n, label: `The car with ${n} nozzles` })) },
        answer: { value: many, tol: 0 },
        steps: [`More nozzles push harder: ${many} nozzles push more than ${few}.`, "Each nozzle is light, so both cars weigh about the same.", `The car with ${many} nozzles`],
        mistakes: [{ value: few, why: `${few} nozzles don't push as hard as the car's weight pulls. More nozzles, more push.` }],
      };
    } },

    // ---- Recruit: g = 10, friendly numbers; g = 10 and the Lab's 9.81 must agree ----
    { tier: "recruit", id: "weight", make(car) {
      const m = sheet(car).kg, ans = m * G10;
      const answer = { value: ans, tol: 0 };
      return {
        text: `The car's mass is ${fmt(m)} kg. Use g = 10 N per kg. What is its weight in newtons?`,
        input: { kind: "number", unit: "N" }, answer,
        steps: ["Weight = mass × g", `${fmt(m)} × 10 = ${fmt(ans)}`, `${fmt(ans)} N`],
        mistakes: distinct(answer, [
          { value: m, why: "That's the mass in kilograms. Weight is a force: multiply the mass by g." },
          { value: ans / 1000, tol: 0.005, why: `That's in kilonewtons. 1 kN is 1,000 N, so the weight is ${fmt(ans)} N.` },
        ]),
      };
    } },
    { tier: "recruit", id: "nozzlesNeeded", make(car) {
      const W = Math.round((sheet(car).kg * G10) / 100) * 100;
      if (W % THRUST === 0) return null; // "more than" would need an exact tie
      const n = Math.floor(W / THRUST) + 1;
      // the Lab, with g = 9.81 and each nozzle's own mass, must say the same number
      if (n < 2 || n > MAXN || !(sheet(withLift(car, n)).tw > 1) || sheet(withLift(car, n - 1)).tw > 1) return null;
      const answer = { value: n, tol: 0 };
      return {
        text: `Each lift nozzle pushes 1,600 N up. The car weighs about ${fmt(W)} N. How many lift nozzles does it need to lift off on its own?`,
        input: { kind: "number", unit: "nozzles" }, answer,
        steps: ["To lift off, the push up must be more than the weight.", `${fmt(W)} ÷ 1,600 = ${fmt(W / THRUST, 2)}`,
          `${n - 1} nozzles push ${fmt((n - 1) * THRUST)} N: not enough. ${n} push ${fmt(n * THRUST)} N.`, `${n} nozzles`],
        mistakes: distinct(answer, [
          { value: n - 1, why: `Rounded down: ${n - 1} nozzles push ${fmt((n - 1) * THRUST)} N, less than the weight.` },
          { value: Math.round((W / THRUST) * 100) / 100, tol: 0.01, why: "A car can't have part of a nozzle. Round up to the next whole nozzle." },
        ]),
      };
    } },
    { tier: "recruit", id: "thrustToWeight", make(car) {
      const s = sheet(car), U = car.lift * THRUST, W = Math.round((s.kg * G10) / 1000) * 1000, q = U / W;
      if (Math.abs(q - 1) < 0.1 || nearHalf(q) || r1(q) !== r1(s.tw) || q > 1 !== s.tw > 1) return null;
      const answer = { value: r1(q), tol: 0.05 }, list = [{ value: r1(W / U), why: "That's weight ÷ thrust. Put the push on top: thrust ÷ weight." }];
      if (car.push) list.push({ value: r1(((car.lift + car.push) * THRUST) / W), why: "Push nozzles point backward. They push the car forward, not up, so only the lift nozzles count." });
      const mistakes = distinct(answer, list);
      if (!mistakes.length) return null;
      return {
        text: `The car has ${plural(car.lift, "lift nozzle")}${pushText(car)}. Each nozzle pushes 1,600 N. The car weighs about ${fmt(W)} N. What is the lift nozzles' push ÷ the weight, to one decimal place?`,
        input: { kind: "number", unit: "" }, answer,
        steps: [`Push up = ${car.lift} × 1,600 = ${fmt(U)} N${car.push ? " (push nozzles point back, so they don't lift)" : ""}`,
          `${fmt(U)} ÷ ${fmt(W)} = ${fmt(q, 3)}`, `To one decimal: ${fmt(answer.value, 1)}`],
        mistakes,
      };
    } },

    // ---- Operative: g = 9.81 and the Lab's exact numbers ----
    { tier: "operative", id: "weight", make(car) {
      const s = sheet(car), ans = Math.round(s.weight), answer = { value: ans, tol: 1 };
      return {
        text: `The car's mass is ${fmt(s.kg)} kg. With g = 9.81 m/s², what is its weight, to the nearest newton?`,
        input: { kind: "number", unit: "N" }, answer,
        steps: ["Weight = mass × g", `${fmt(s.kg)} × 9.81 = ${fmt(s.weight, 2)}`, `To the nearest newton: ${fmt(ans)} N`],
        mistakes: distinct(answer, [
          { value: s.kg, why: "That's the mass in kilograms. Weight is a force: multiply the mass by g." },
          { value: s.kg * G10, why: "That uses g = 10. Close, but this problem asks for 9.81." },
          { value: Math.round(s.weight / 10) / 100, tol: 0.005, why: `That's in kilonewtons. 1 kN is 1,000 N, so the weight is ${fmt(ans)} N.` },
        ]),
      };
    } },
    { tier: "operative", id: "nozzlesForMargin", make(car, r) {
      const R = [1.1, 1.2, 1.3, 1.5][int(r, 0, 3)], M0 = sheet(withLift(car, 0)).kg, tw = (n) => sheet(withLift(car, n)).tw;
      let n = 0; for (let k = 1; k <= MAXN && !n; k++) if (tw(k) >= R) n = k;
      if (n < 2 || Math.abs(tw(n) - R) < 0.005) return null;
      // n × 1,600 ≥ R × (M0 + 4n) × 9.81, so n ≥ R·M0·g ÷ (1,600 − 4·R·g)
      const top = R * M0 * F.G, bottom = THRUST - NOZ_KG * R * F.G, exact = top / bottom;
      if (Math.ceil(exact) !== n) return null;
      const answer = { value: n, tol: 0 };
      return {
        text: `Without lift nozzles, the car's mass is ${fmt(M0)} kg. Each lift nozzle adds 4 kg and pushes 1,600 N up. With g = 9.81 m/s², what is the fewest lift nozzles that give thrust ÷ weight of at least ${R}?`,
        input: { kind: "number", unit: "nozzles" }, answer,
        steps: [`Thrust ÷ weight ≥ ${R} means n × 1,600 ≥ ${R} × (${fmt(M0)} + 4n) × 9.81`, `n × (1,600 − 4 × ${R} × 9.81) ≥ ${R} × ${fmt(M0)} × 9.81`,
          `n ≥ ${fmt(top, 1)} ÷ ${fmt(bottom, 2)} = ${fmt(exact, 2)}`, `Round up: ${n} nozzles`],
        mistakes: distinct(answer, [
          { value: Math.ceil(top / THRUST), why: "Forgot the nozzles' own mass: each one adds 4 kg, so the car gets heavier as you add them." },
          { value: n - 1, why: `Rounded down: ${n - 1} nozzles give thrust ÷ weight of ${fmt(tw(n - 1), 2)}, under ${R}.` },
          { value: Math.ceil((R * M0 * G10) / (THRUST - NOZ_KG * R * G10)), why: "That uses g = 10. This problem asks for 9.81." },
        ]),
      };
    } },
    { tier: "operative", id: "netForce", make(car) {
      const s = sheet(car), U = car.lift * THRUST;
      if (s.tw < 1.05) return null;
      const ans = Math.round(U - s.weight), answer = { value: ans, tol: 1 }, list = [
        { value: U, why: "That's the push alone. The net force subtracts the weight pulling down." },
        { value: Math.round(U - s.kg), why: "That subtracts the mass in kilograms. Subtract the weight in newtons: mass × 9.81." },
      ];
      if (car.push) list.push({ value: Math.round((car.lift + car.push) * THRUST - s.weight), why: "Push nozzles point backward, so they don't push the car up." });
      return {
        text: `The car has ${plural(car.lift, "lift nozzle")}${pushText(car)} (1,600 N each) and a mass of ${fmt(s.kg)} kg, nozzles included. With g = 9.81 m/s², what is the net upward force at lift-off, to the nearest newton?`,
        input: { kind: "number", unit: "N" }, answer,
        steps: [`Push up = ${car.lift} × 1,600 = ${fmt(U)} N`, `Weight = ${fmt(s.kg)} × 9.81 = ${fmt(s.weight, 2)} N`, `Net force = ${fmt(U)} − ${fmt(s.weight, 2)} = ${fmt(ans)} N`],
        mistakes: distinct(answer, list),
      };
    } },
    { tier: "operative", id: "acceleration", make(car) {
      const s = sheet(car), U = car.lift * THRUST, net = U - s.weight, a = net / s.kg;
      if (s.tw < 1.05 || nearHalf(a)) return null;
      const answer = { value: r1(a), tol: 0.05 };
      const mistakes = distinct(answer, [
        { value: r1(U / s.kg), why: "That uses the whole push. Part of it only holds the car up against its weight: use the net force." },
        { value: r1(net / s.weight), why: "That divides by the weight. Acceleration is force ÷ mass, in kilograms." },
      ]);
      if (!mistakes.length) return null;
      return {
        text: `The car has ${plural(car.lift, "lift nozzle")}${pushText(car)} (1,600 N each) and a mass of ${fmt(s.kg)} kg, nozzles included. With g = 9.81 m/s², what is its upward acceleration at lift-off, in m/s² to one decimal place?`,
        input: { kind: "number", unit: "m/s²" }, answer,
        steps: [`Push up = ${car.lift} × 1,600 = ${fmt(U)} N`, `Weight = ${fmt(s.kg)} × 9.81 = ${fmt(s.weight, 2)} N`, `Net force = ${fmt(net, 2)} N`,
          `a = F ÷ m = ${fmt(net, 2)} ÷ ${fmt(s.kg)} = ${fmt(a, 3)}`, `To one decimal: ${fmt(answer.value, 1)} m/s²`],
        mistakes,
      };
    } },
    { tier: "operative", id: "burnTime", make(car) {
      const s = sheet(car), firing = car.lift + car.push, burn = s.burn;
      if (!(burn > 0) || nearHalf(burn)) return null;
      const answer = { value: r1(burn), tol: 0.05 }, list = [
        { value: r1(s.air / FLOW), why: "That's one nozzle's time. Every firing nozzle uses 4 kg a second." },
        { value: r1((firing * FLOW) / s.air), why: "That's divided the wrong way: time = air ÷ air used per second." },
      ];
      if (car.push) list.push({ value: r1(s.air / (car.lift * FLOW)), why: "The push nozzles fire too, so they use air as well." });
      const mistakes = distinct(answer, list);
      if (!mistakes.length) return null;
      return {
        text: `The car has ${plural(car.tanks, "air tank")}, each holding 12 kg of air. It has ${plural(car.lift, "lift nozzle")}${pushText(car)}, and each firing nozzle uses 4 kg of air a second. How long can the nozzles fire, in seconds to one decimal place?`,
        input: { kind: "number", unit: "s" }, answer,
        steps: [`Air = ${car.tanks} × 12 = ${s.air} kg`, `Air used each second = ${firing} × 4 = ${firing * FLOW} kg/s`, `Time = ${s.air} ÷ ${firing * FLOW} = ${fmt(burn, 3)}`, `To one decimal: ${fmt(answer.value, 1)} s`],
        mistakes,
      };
    } },
  ];

  // The round's car: the first one from this seed that gives every tier a problem. Each tier's kind is picked from the
  // seed too, so a class sees a mix of kinds from round to round.
  function round(seed) {
    seed = Math.abs(Math.floor(+seed || 0)) % 2147483647;
    for (let k = 0; k < 500; k++) {
      const car = carFrom(rng(mix(seed, k))), per = {};
      for (const [t, tier] of TIERS.entries()) {
        const kinds = KINDS.filter((x) => x.tier === tier), start = Math.floor(rng(mix(seed, 9973, t))() * kinds.length);
        for (let j = 0; j < kinds.length && !per[tier]; j++) {
          const kind = kinds[(start + j) % kinds.length], body = kind.make(car, rng(mix(seed, k, t, j)));
          if (body) per[tier] = { id: `thrust:${seed}:${tier}`, set: "thrust", seed, tier, kind: kind.id, car, ...body };
        }
        if (!per[tier]) break;
      }
      if (TIERS.every((t) => per[t])) return per;
    }
    throw new Error("No Thrust problem for seed " + seed); // never happens: the test runs thousands of seeds
  }

  const SETS = [{ id: "thrust", name: "Thrust", game: "lab", lesson: "thrust", tiers: TIERS,
    kinds: Object.fromEntries(TIERS.map((t) => [t, KINDS.filter((k) => k.tier === t).map((k) => k.id)])),
    make: (seed, tier) => round(seed)[TIERS.includes(tier) ? tier : "recruit"] }];
  const set = (id) => SETS.find((s) => s.id === id) || null;

  // is this answer right, and if not, is it one of the common mistakes? (mistake: its index, or -1)
  function check(p, value) {
    if (p.input.kind === "choice") {
      const v = String(value);
      return { correct: v === String(p.answer.value), mistake: p.mistakes.findIndex((m) => String(m.value) === v) };
    }
    const v = Number(String(value == null ? "" : value).replace(/[,\s]/g, ""));
    if (String(value).trim() === "" || !Number.isFinite(v)) return { correct: false, mistake: -1 };
    if (Math.abs(v - p.answer.value) <= p.answer.tol + 1e-9) return { correct: true, mistake: -1 };
    return { correct: false, mistake: p.mistakes.findIndex((m) => Math.abs(v - m.value) <= (m.tol != null ? m.tol : p.answer.tol) + 1e-9) };
  }
  // what a student's device gets: the question only (no answer, steps, mistakes, or the car: the board shows the car)
  function forStudent(p) {
    const { answer, steps, mistakes, car, ...rest } = p;
    return rest;
  }

  return { TIERS, SETS, set, check, forStudent, fmt };
});
