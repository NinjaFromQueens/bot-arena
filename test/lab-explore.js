// Explore the Flying Car Lab design space: is every mission solvable, and how hard is it?
// Run: node test/lab-explore.js [samples]
const F = require("../public/js/flight.js");
const N = +process.argv[2] || 6000;
let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
function randomDesign(m) {
  return F.clampDesign({
    material: pick([0, 1, 2, 3]), tanks: Math.floor(rnd() * 9), lift: Math.floor(rnd() * 17), push: pick([0, 0, 1, 2, 3, 4]),
    flip: pick([0, 0, 2, 3, 4]), computer: pick([0, 1, 2]), gear: pick([0, 1, 2]), people: m.need.people || pick([0, 1, 2]),
    speed: pick([30, 40, 50, 60, 70, 80, 90, 100]), ramp: pick([0, 1, 2]), reserve: pick([0, 15, 30, 45]), flipOn: m.need.flip ? true : rnd() < 0.2,
  });
}
const label = (d) => `${F.MATERIALS[d.material].n}, ${d.tanks}T, lift${d.lift} push${d.push} flip${d.flip}, ${F.COMPUTERS[d.computer].n}, ${F.GEARS[d.gear].n}, ${d.people}p, ${d.speed}km/h ${F.RAMPS[d.ramp].n}, res${d.reserve}${d.flipOn ? " FLIP" : ""}`;
for (const m of F.MISSIONS) {
  const def = F.simulate(F.DEFAULT_DESIGN, m), dg = F.grade(def);
  let ok = 0, s2 = 0, s3 = 0; const outcomes = {}; let bestKg = null, bestCost = null; const sample = [];
  for (let i = 0; i < N; i++) {
    const d = randomDesign(m), r = F.simulate(d, m), g = F.grade(r);
    outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
    if (g.complete) { ok++; if (sample.length < 2) sample.push(d); if (!bestKg || r.sheet.kg < bestKg.kg) bestKg = { kg: r.sheet.kg, d }; if (!bestCost || r.sheet.cost < bestCost.cost) bestCost = { cost: r.sheet.cost, d }; }
    if (g.stars[1]) s2++; if (g.stars[2]) s3++;
  }
  console.log(`\n${m.n}: complete ${(100 * ok / N).toFixed(1)}%  smooth ${(100 * s2 / N).toFixed(1)}%  eff ${(100 * s3 / N).toFixed(1)}%`);
  console.log("  default ->", def.outcome, "maxY", def.maxY.toFixed(1), "t", def.flightTime.toFixed(1), "| tip:", F.explain(def, dg).tip);
  console.log("  outcomes:", JSON.stringify(outcomes));
  if (bestKg) console.log("  lightest:", bestKg.kg, "kg ::", label(bestKg.d));
  if (bestCost) console.log("  cheapest:", F.money(bestCost.cost), "::", label(bestCost.d));
}
