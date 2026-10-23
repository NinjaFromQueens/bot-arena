// Reference designs a student could reasonably reach. Run: node test/lab-refs.js
const F = require("../public/js/flight.js");
const M = Object.fromEntries(F.MISSIONS.map((m) => [m.id, m]));
const D = (o) => ({ ...F.DEFAULT_DESIGN, ...o });
const refs = [
  ["semi", "ramp only, max speed", D({ lift: 0, push: 0, tanks: 0, speed: 60, ramp: 2 })],
  ["hop", "default + stabilizer", D({ computer: 1 })],
  ["hop", "alu 10 lift stab", D({ material: 1, lift: 10, computer: 1 })],
  ["car", "alu 10 lift stab", D({ material: 1, lift: 10, computer: 1 })],
  ["semi", "alu 10 lift stab", D({ material: 1, lift: 10, computer: 1 })],
  ["semi", "alu 12 lift 4T stab sport res20", D({ material: 1, lift: 12, tanks: 4, computer: 1, gear: 1, reserve: 15 })],
  ["semi", "alu 12 lift 4T pro res20 push1", D({ material: 1, lift: 12, tanks: 4, computer: 2, gear: 1, reserve: 15, push: 1 })],
  ["semi", "cf 12 lift 4T pro res20 push1 steep", D({ material: 3, lift: 12, tanks: 4, computer: 2, gear: 1, reserve: 15, push: 1, ramp: 2, people: 0 })],
  ["flip", "alu 10 lift 3T pro flip2", D({ material: 1, lift: 10, tanks: 3, computer: 2, flip: 2, flipOn: true })],
  ["flip", "cf 10 lift 4T pro flip4 sport res20", D({ material: 3, lift: 10, tanks: 4, computer: 2, flip: 4, flipOn: true, gear: 1, reserve: 15 })],
  ["five", "alu 12 lift 4T pro res20 push2", D({ material: 1, lift: 12, tanks: 4, computer: 2, gear: 1, reserve: 15, push: 2 })],
  ["semiflip", "cf 14 lift 5T pro flip4 push1 res20 racing", D({ material: 3, lift: 14, tanks: 5, computer: 2, flip: 4, flipOn: true, push: 1, reserve: 15, gear: 2, people: 0 })],
  ["people", "cf 16 lift 5T pro racing 2p res30 push1", D({ material: 3, lift: 16, tanks: 5, computer: 2, gear: 2, people: 2, reserve: 30, push: 1 })],
  ["people", "alu 16 lift 6T pro racing 2p res30 push1 steep", D({ material: 1, lift: 16, tanks: 6, computer: 2, gear: 2, people: 2, reserve: 30, push: 1, ramp: 2 })],
  ["budget", "steel 14 lift 4T stab res20", D({ material: 2, lift: 14, tanks: 4, computer: 1, reserve: 15 })],
  ["budget", "alu 12 lift 4T stab res20 push1", D({ material: 1, lift: 12, tanks: 4, computer: 1, reserve: 15, push: 1 })],
];
for (const [mid, name, d] of refs) {
  const r = F.simulate(d, M[mid]), g = F.grade(r), S = r.sheet;
  console.log(`${mid.padEnd(8)} ${name.padEnd(44)} ${r.outcome.padEnd(12)} ${g.stars.map((x) => (x ? "*" : ".")).join("")} kg${Math.round(S.kg)} $${Math.round(S.cost / 1000)}k tw${S.tw.toFixed(2)} burn${S.burn.toFixed(1)} maxY${r.maxY.toFixed(1)} t${r.flightTime.toFixed(1)} land${r.landX.toFixed(0)} v${r.vImp.toFixed(1)}/${S.strength} g${r.gForce.toFixed(1)} flip${Math.round(r.flipAngle)} | ${F.explain(r, g).tip}`);
}
