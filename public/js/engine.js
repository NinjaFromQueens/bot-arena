/*
 * Bot Arena engine — shared by the server (Node) and the browser.
 * - Part data, bot codes, stats
 * - Deterministic battle simulation (seeded), so the server decides the
 *   winner and the host screen replays the exact same fight.
 * - Browser-only: robot drawing, particle effects, sound.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const isBrowser = typeof window !== "undefined";
  const RM = isBrowser && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

  // ---------------- data ----------------
  const COLORS = ["#f46524", "#38a7f0", "#4fd18b", "#c58cff", "#ffd23f", "#ff5d8f"];
  const BRAIN_COL = ["#ff5d5d", "#4fd18b", "#c58cff"];
  // Battle numbers live here so balance can be tuned in one place (see test/balance.js).
  //   dodge: harder to hit   burst: chance of a speed-burst bonus attack   heavy: can't be grabbed
  //   acc: hit-chance bonus  swings: attacks per turn   mult: damage per swing   grab: chance to stall the enemy
  //   low: can't be flipped   glance: damage kept from spinning weapons   track: share of the enemy's dodge it ignores
  //   spin: a spinning weapon   flip: chance to flip the enemy (loses a turn)   pierce: share of the enemy's armor it ignores
  //   tip: one line shown to students explaining the part's strength and weakness
  const PARTS = {
    body: [
      { n: "Wheels", d: "Fast, may strike twice", tip: "Fast and sometimes attacks twice, but it has no armor.", wt: 25, spd: 9, def: 0, dodge: 1, burst: 0.25 },
      { n: "Treads", d: "Tank armor, can't be grabbed", tip: "Heavy armor and too heavy to grab, but slow and easy to hit.", wt: 40, spd: 1, def: 8, dodge: 0, heavy: true },
      { n: "Legs", d: "Hard to hit", tip: "Dodges well, with medium armor.", wt: 30, spd: 5, def: 5, dodge: 8 },
      { n: "Wedge", d: "Can't be flipped, deflects spinners", tip: "Low and slanted: it can't be flipped and spinner hits glance off, but it's slow.", wt: 30, spd: 2, def: 4, dodge: 3, low: true, glance: 0.5 },
    ],
    sensor: [
      { n: "Camera", d: "Best aim", tip: "Sees the target clearly, so it hits more often.", wt: 10, aim: 7 },
      { n: "Ultrasonic", d: "Senses distance, dodges", tip: "Measures distance, so it aims okay and dodges better.", wt: 6, aim: 5, dodge: 8 },
      { n: "Touch", d: "Feels hits, extra armor", tip: "Weak aim, but it feels hits coming and braces for them.", wt: 2, aim: 4, def: 3 },
      { n: "Lidar", d: "Tracks dodgers", tip: "Its laser maps the enemy exactly, so dodging barely works against it. The heaviest sensor.", wt: 12, aim: 5, track: 0.65 },
    ],
    brain: [
      { n: "Aggressive", d: "Always attacks", tip: "Hits harder, but forgets to protect itself.", wt: 0, atk: 2, def: -4 },
      { n: "Defensive", d: "Blocks when hurt", tip: "Raises a shield when it gets hurt, then hits back.", wt: 0, def: 3, shieldAt: 55, shieldP: 0.6, counter: 5 },
      { n: "Smart", d: "Waits for a big hit", tip: "Waits for a clear shot when its aim is low.", wt: 0, atk: 0, aim: 0, waitP: 0.4, waitAim: 22 },
      { n: "Custom", d: "Follows your rules", tip: "Does what your if-then rules say, checked top to bottom every turn. Good rules make it strong.", wt: 0, def: 1, custom: true, powerDmg: 8, powerAcc: 16, aimAcc: 50, aimDmg: 1, counter: 14 },
    ],
    tool: [
      { n: "Gripper", d: "Accurate, grabs to stall", tip: "Rarely misses and can grab the enemy so it loses a turn. Can't grab treads.", wt: 10, atk: 6, acc: 12, swings: 1, mult: 1, grab: 0.25 },
      { n: "Hammer", d: "Huge hits, often misses", tip: "Huge hits that smash through armor, but slow swings miss a lot.", wt: 30, atk: 11, acc: -20, swings: 1, mult: 1 },
      { n: "Spinner", d: "Two hits, all-rounder", tip: "Two quick hits every turn. A steady all-rounder, but its hits glance off a Wedge.", wt: 20, atk: 7, acc: 0, swings: 2, mult: 0.74, spin: true },
      { n: "Flipper", d: "Flips the enemy, even Treads", tip: "Can flip the enemy over so it loses a turn, even heavy Treads. It can't get under a low Wedge.", wt: 15, atk: 6, acc: 10, swings: 1, mult: 1, flip: 0.3 },
      { n: "Drill", d: "Drills through armor", tip: "Drills through half of the enemy's armor, but it misses more than a Gripper.", wt: 20, atk: 7, acc: -2, swings: 1, mult: 1, pierce: 0.5 },
    ],
  };
  const TUNE = { k: 2.9, base: 52 }; // attack points -> damage, base hit chance
  // Custom brain: up to 3 rules, checked top to bottom at the start of each turn. The first true one picks the move; if none, it attacks.
  //   power attack: more damage, misses more, smashes through a shield (full damage, no counter)
  //   aim first: skip this attack, the next one is much more accurate
  //   shield: skip this attack, the next hit does half damage, then it counterattacks (it can't shield again until it has)
  const RULES = {
    IF: [
      { n: "always" },
      { n: "my health is below", v: [75, 50, 25] },
      { n: "the enemy's health is below", v: [75, 50, 25] },
      { n: "my hit chance is below", v: [80, 60, 40], pct: true },
      { n: "the enemy's shield is up" },
    ],
    DO: ["attack", "power attack", "aim first", "shield"],
    max: 3,
    defaults: [{ c: 3, v: 2, a: 2 }, { c: 1, v: 1, a: 3 }], // aim when the shot is hard, shield when hurt
  };
  function chooseRule(rules, s) {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i], cond = RULES.IF[r.c], v = cond.v ? cond.v[r.v] : 0;
      const yes = r.c === 0 ? true : r.c === 1 ? s.mine < v : r.c === 2 ? s.theirs < v : r.c === 3 ? s.chance < v : s.shield;
      if (yes) return { i, a: r.a };
    }
    return null;
  }
  const REACTIONS = ["👏", "🔥", "😮", "😂", "💪", "🤖"]; // the only reactions students can send to the board
  const MAXW = 75;
  // the host picks one per game; balance is tuned at 75 kg, and Open adds only a few heavy builds
  const WEIGHT_CLASSES = [{ kg: 50, n: "Lightweight" }, { kg: 75, n: "Standard" }, { kg: 100, n: "Open" }];
  const SLOTS = ["body", "sensor", "brain", "tool"];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function statsOf(b) {
    const s = { atk: 0, def: 0, spd: 0, aim: 0, wt: 0 };
    SLOTS.forEach((k) => { const p = PARTS[k][b[k]]; for (const f in s) s[f] += p[f] || 0; });
    return s;
  }
  function cleanName(n, max = 10) {
    return String(n || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, max);
  }
  // Validate anything that arrives from a client.
  function sanitizeBot(b, maxw = MAXW) {
    if (!b || typeof b !== "object") return null;
    const out = { name: cleanName(b.name) || "BOT" };
    for (const k of SLOTS) { const v = +b[k]; if (!Number.isInteger(v) || v < 0 || v >= PARTS[k].length) return null; out[k] = v; }
    const c = +b.color; if (!Number.isInteger(c) || c < 0 || c >= COLORS.length) return null; out.color = c;
    if (statsOf(out).wt > maxw) return null;
    if (PARTS.brain[out.brain].custom) {
      const rules = Array.isArray(b.rules) ? b.rules : RULES.defaults;
      if (rules.length > RULES.max) return null;
      out.rules = [];
      for (const r of rules) {
        const c = +(r && r.c), v = +(r && r.v), a = +(r && r.a), cond = RULES.IF[c];
        if (!cond || !Number.isInteger(c) || !Number.isInteger(a) || a < 0 || a >= RULES.DO.length || !Number.isInteger(v) || v < 0 || v >= (cond.v ? cond.v.length : 1)) return null;
        out.rules.push({ c, v, a });
      }
    }
    return out;
  }
  // NAME-bsbtc, plus -RRR for each Custom brain rule (condition, value, move). No rules is written as 000: "always attack".
  const codeOf = (b) => `${b.name || "BOT"}-${b.body}${b.sensor}${b.brain}${b.tool}${b.color}` + (b.rules ? "-" + (b.rules.map((r) => `${r.c}${r.v}${r.a}`).join("") || "000") : "");
  function parseCode(c) {
    const m = String(c).trim().toUpperCase().replace(/\s+/g, "").match(/^([A-Z0-9]{1,10})-?([0-9])([0-9])([0-9])([0-9])([0-5])(?:-([0-9]{3}|[0-9]{6}|[0-9]{9}))?$/);
    if (!m) return null;
    const rules = m[7] ? m[7].match(/.../g).map((t) => ({ c: +t[0], v: +t[1], a: +t[2] })) : undefined;
    return sanitizeBot({ name: m[1], body: +m[2], sensor: +m[3], brain: +m[4], tool: +m[5], color: +m[6], rules });
  }

  // ---------------- deterministic battle ----------------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function simulate(a, b, seed) {
    const rnd = rng(seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed);
    const S = [statsOf(a), statsOf(b)], bots = [a, b], H = [100, 100], ev = [];
    const brace = [false, false], stall = [false, false], stallBy = [null, null], aimed = [false, false];
    const push = (e) => ev.push({ ...e, hp: [...H], brace: [...brace] });
    let turn = S[0].spd + rnd() * 3 >= S[1].spd + rnd() * 3 ? 0 : 1;
    const dodgeOf = (b, s) => (PARTS.body[b.body].dodge || 0) + (PARTS.sensor[b.sensor].dodge || 0) + s.spd;
    // one attack: returns true if the target was knocked out
    function attack(me, op, burst) {
      const m = bots[me], o = bots[op], T = PARTS.tool[m.tool], OB = PARTS.body[o.body];
      const track = PARTS.sensor[m.sensor].track || 0; // lidar: the enemy's dodging only half works
      let chance = clamp(TUNE.base + S[me].aim * 4 + (T.acc || 0) - dodgeOf(o, S[op]) * (1 - track), 20, 95);
      let bonus = 0, power = false;
      if (!burst) {
        push({ me, kind: "sense", txt: `'s ${PARTS.sensor[m.sensor].n.toLowerCase()} spots the enemy (${Math.round(chance)}% chance to hit).` });
        const BR = PARTS.brain[m.brain];
        if (BR.custom) {
          const pick = chooseRule(m.rules || RULES.defaults, { mine: H[me], theirs: H[op], chance, shield: brace[op] });
          const a = pick ? pick.a : 0, rule = pick ? pick.i + 1 : 0, tag = pick ? `RULE ${rule}: ` : "", why = pick ? ` follows rule ${rule}:` : " has no rule that fits, so";
          if (a === 3 && !brace[me] && !counter[me]) { brace[me] = true; push({ me, kind: "think", act: "shield", rule, txt: `${why} it raises its shield.`, bubble: tag + "SHIELD" }); return false; }
          if (a === 2 && !aimed[me]) { aimed[me] = true; push({ me, kind: "think", act: "aim", rule, txt: `${why} it lines up a careful shot.`, bubble: tag + "AIM" }); return false; }
          const fire = aimed[me];
          if (fire) { aimed[me] = false; chance = Math.min(95, chance + BR.aimAcc); bonus += BR.aimDmg; }
          if (counter[me]) bonus += BR.counter;
          if (a === 1) { power = true; chance = Math.max(20, chance - BR.powerAcc); bonus += BR.powerDmg; push({ me, kind: "think", act: "power", rule, txt: `${why} power attack!`, bubble: tag + "POWER" }); }
          else if (a === 3 && counter[me]) push({ me, kind: "think", act: "counter", rule, txt: `${why} its shield blocked a hit, so it counterattacks!`, bubble: tag + "COUNTER" });
          else push({ me, kind: "think", act: "attack", rule, txt: fire ? `${why} it fires its aimed shot.` : a === 3 ? `${why} its shield is already up, so it attacks.` : `${why} it attacks.`, bubble: tag + (fire ? "FIRE" : "ATTACK") });
          counter[me] = false;
        } else {
        if (BR.shieldAt && H[me] < BR.shieldAt && !brace[me] && !shieldUsed[me] && rnd() < BR.shieldP) {
          brace[me] = true; shieldUsed[me] = true;
          push({ me, kind: "think", txt: " is hurt, so it raises its shield.", bubble: "SHIELD!" });
          return false;
        }
        if (BR.waitP && chance < 70 && rnd() < BR.waitP) { chance = Math.min(95, chance + BR.waitAim); bonus = 3; push({ me, kind: "think", txt: " waits for a clear shot. Aim goes up!", bubble: "AIMING..." }); }
        else if (BR.counter && counter[me]) { bonus = BR.counter; shieldUsed[me] = false; push({ me, kind: "think", txt: " blocked that hit, so it counterattacks!", bubble: "COUNTER!" }); }
        else if (m.brain === 0) push({ me, kind: "think", txt: " decides: ATTACK!", bubble: "ATTACK!" });
        else push({ me, kind: "think", txt: " decides to attack.", bubble: "GO!" });
        counter[me] = false;
        }
      }
      let total = 0, hits = 0;
      for (let k = 0; k < T.swings; k++) {
        if (rnd() * 100 < chance) {
          let dmg = (S[me].atk * TUNE.k + bonus + Math.floor(rnd() * 6)) * T.mult - S[op].def * (1 - (T.pierce || 0));
          if (T.spin && OB.glance) dmg *= OB.glance; // spinner hits glance off a wedge
          if (brace[op] && !power) dmg /= 2;
          total += Math.max(2, Math.round(dmg)); hits++;
        }
      }
      const smash = !!(power && brace[op] && hits); // a power attack breaks the shield: no counter
      if (brace[op] && hits) { brace[op] = false; counter[op] = !power; }
      H[op] = Math.max(0, H[op] - total);
      const tool = T.n.toLowerCase();
      let grab = false, flip = false;
      if (hits && T.grab && H[op] > 0) {
        if (OB.heavy) grab = "heavy";
        else if (rnd() < T.grab) { stall[op] = true; stallBy[op] = "grab"; grab = true; }
      }
      if (hits && T.flip && H[op] > 0) {
        if (OB.low) flip = "low";
        else if (rnd() < T.flip) { stall[op] = true; stallBy[op] = "flip"; flip = true; }
      }
      let txt = hits ? `'s ${tool} hits${T.swings > 1 ? ` ${hits}x` : ""} for ${total} damage!` : ` swings the ${tool}... and misses!`;
      if (burst) txt = " speeds in for a bonus attack!" + (hits ? ` ${total} damage!` : " Missed!");
      if (grab === true) txt += " It grabs the enemy!";
      if (grab === "heavy") txt += " Too heavy to grab!";
      if (flip === true) txt += " It flips the enemy over!";
      if (flip === "low") txt += " The wedge is too low to flip!";
      if (smash) txt += " It smashes through the shield!";
      push({ me, kind: "act", hits, swings: T.swings, dmg: total, grab: grab === true, heavy: grab === "heavy", flip: flip === true, low: flip === "low",
        smash, glance: !!(hits && T.spin && OB.glance), pierce: !!(hits && T.pierce && S[op].def > 0), track: track > 0 && dodgeOf(o, S[op]) >= 7, crit: total >= 22, burst: !!burst, txt });
      return H[op] <= 0;
    }
    const counter = [false, false], shieldUsed = [false, false];
    for (let round = 0; round < 40 && H[0] > 0 && H[1] > 0; round++) {
      const me = turn, op = 1 - turn, m = bots[me];
      turn = op;
      if (stall[me]) { stall[me] = false; push({ me, kind: "stall", flip: stallBy[me] === "flip", txt: stallBy[me] === "flip" ? " is flipped over and loses a turn!" : " is stuck in the gripper and loses a turn!" }); continue; }
      if (attack(me, op, false)) break;
      const B = PARTS.body[m.body];
      if (B.burst && !brace[me] && !aimed[me] && rnd() < B.burst) { if (attack(me, op, true)) break; }
    }
    const w = H[0] === H[1] ? (rnd() < 0.5 ? 0 : 1) : H[0] > H[1] ? 0 : 1;
    push({ me: w, kind: "win", txt: " WINS!" });
    return { events: ev, winner: w };
  }


  // ---------------- why did it win? ----------------
  // Looks at what actually happened in the fight and returns plain-language reasons
  // for each side: { winner, sides: [{ won, headline, reasons[], tip }, …] }
  // parts no legal robot can use under this weight limit (Lightweight rules out Treads and the Hammer)
  function partsTooHeavy(maxw) {
    const lightest = (slot) => Math.min(...PARTS[slot].map((p) => p.wt || 0));
    const out = [];
    for (const slot of SLOTS) PARTS[slot].forEach((p) => { if ((p.wt || 0) + SLOTS.filter((k) => k !== slot).reduce((s, k) => s + lightest(k), 0) > maxw) out.push(p.n); });
    return out;
  }
  function explainBattle(a, b, sim, maxw = MAXW) {
    const bots = [a, b], w = sim.winner, l = 1 - w;
    const st = [0, 1].map(() => ({ swings: 0, hits: 0, dmg: 0, maxHit: 0, grabs: 0, stalled: 0, shields: 0, counters: 0, bursts: 0, aims: 0, heavyFail: 0, flips: 0, lowFail: 0, glanced: 0, pierced: 0, tracked: 0, powers: 0, smashes: 0 }));
    let endHp = [100, 100], first = null;
    for (const e of sim.events) {
      if (first == null && (e.kind === "sense" || e.kind === "act")) first = e.me;
      const s = st[e.me];
      if (e.kind === "act") {
        s.swings += e.swings || 1; s.hits += e.hits; s.dmg += e.dmg; s.maxHit = Math.max(s.maxHit, e.dmg);
        if (e.grab) s.grabs++; if (e.burst) s.bursts++; if (e.heavy) s.heavyFail++;
        if (e.flip) s.flips++; if (e.low) s.lowFail++; if (e.glance) s.glanced++; if (e.pierce) s.pierced++; if (e.track && e.hits) s.tracked++; if (e.smash) s.smashes++;
      }
      if (e.kind === "stall") s.stalled++;
      if (e.kind === "think") { if (e.bubble === "SHIELD!" || e.act === "shield") s.shields++; if (e.bubble === "COUNTER!" || e.act === "counter") s.counters++; if (e.bubble === "AIMING..." || e.act === "aim") s.aims++; if (e.act === "power") s.powers++; }
      endHp = e.hp;
    }
    const acc = (k) => (st[k].swings ? st[k].hits / st[k].swings : 0);
    const avg = (k) => (st[k].hits ? st[k].dmg / st[k].hits : 0);
    const pct = (x) => Math.round(x * 100) + "%";
    const N = (k) => bots[k].name, part = (k, slot) => PARTS[slot][bots[k][slot]].n;
    const W = bots[w], L = bots[l];
    const R = []; // [score, text, key]
    const dAcc = acc(w) - acc(l);
    if (dAcc >= 0.12 && st[l].swings >= 3) {
      let why = "";
      if (L.tool === 1) why = " Hammers swing slowly and miss a lot.";
      else if (W.body === 2) why = ` ${N(w)}'s legs made it hard to hit.`;
      else if (W.sensor === 1) why = ` ${N(w)}'s ultrasonic sensor helped it dodge.`;
      else if (L.sensor === 2) why = ` ${N(l)}'s touch sensor has weak aim.`;
      else if (W.sensor === 0) why = ` ${N(w)}'s camera aimed well.`;
      R.push([dAcc * 10, `${N(w)} hit ${pct(acc(w))} of its attacks, but ${N(l)} only hit ${pct(acc(l))}.${why}`, "acc"]);
    }
    const dAvg = avg(w) - avg(l);
    if (dAvg >= 4 && st[w].hits) {
      let why = W.tool === 1 ? " The hammer hits huge." : PARTS.body[W.body].def >= 6 ? ` ${N(w)}'s thick treads armor blocked a lot of each hit.` : W.brain === 0 ? " Its aggressive brain hits harder." : "";
      const vs = st[l].hits ? `, vs ${Math.round(avg(l))} for ${N(l)}` : `, and ${N(l)} never landed a hit`;
      R.push([dAvg / 3, `${N(w)} hit harder: about ${Math.round(avg(w))} damage per hit${vs}.${why}`, "dmg"]);
    }
    const ratio = st[w].swings / Math.max(1, st[l].swings);
    if (ratio >= 1.5 && st[w].swings - st[l].swings >= 3) {
      const why = [W.tool === 2 ? "the spinner hits twice every turn" : "", st[w].bursts ? `its wheels got ${st[w].bursts} bonus speed attack${st[w].bursts === 1 ? "" : "s"}` : ""].filter(Boolean);
      R.push([(ratio - 1) * 1.6, `${N(w)} got ${st[w].swings} attacks to ${N(l)}'s ${st[l].swings}${why.length ? ": " + why.join(" and ") : ""}.`, "attacks"]);
    }
    if (first === w && st[l].swings <= 3 && sim.events.length < 18) R.push([1.3, `${N(w)} was faster, so it attacked first and ${N(l)} barely got a turn.`, "first"]);
    if (st[w].grabs >= 1) R.push([1.2 + st[w].grabs, `${N(w)}'s gripper grabbed ${N(l)} ${st[w].grabs} time${st[w].grabs === 1 ? "" : "s"}, so ${N(l)} lost ${st[w].grabs === 1 ? "a turn" : st[w].grabs + " turns"}.`, "grab"]);
    if (st[l].heavyFail >= 1) R.push([1.5 + st[l].heavyFail * 0.5, `${N(l)}'s gripper couldn't grab ${N(w)}. Treads are too heavy to grab.`, "heavy"]);
    if (st[w].flips >= 1) R.push([1.3 + st[w].flips, `${N(w)}'s flipper flipped ${N(l)} ${st[w].flips} time${st[w].flips === 1 ? "" : "s"}, so ${N(l)} lost ${st[w].flips === 1 ? "a turn" : st[w].flips + " turns"}.`, "flip"]);
    if (st[l].lowFail >= 1) R.push([1.5 + st[l].lowFail * 0.5, `${N(l)}'s flipper couldn't get under ${N(w)}'s low wedge.`, "low"]);
    if (st[l].glanced >= 2) R.push([1.2 + st[l].glanced * 0.15, `${N(l)}'s spinner hits glanced off ${N(w)}'s slanted wedge.`, "glance"]);
    if (st[w].pierced >= 2 && PARTS.body[L.body].def >= 4) R.push([1.1 + st[w].pierced * 0.15, `${N(w)}'s drill went right through ${N(l)}'s armor.`, "pierce"]);
    if (st[w].tracked >= 2) R.push([1 + st[w].tracked * 0.15, `${N(w)}'s lidar tracked ${N(l)}, so dodging didn't help much.`, "track"]);
    if (st[w].bursts >= 1) R.push([1 + st[w].bursts * 0.8, `${N(w)}'s wheels got ${st[w].bursts} bonus speed attack${st[w].bursts === 1 ? "" : "s"}.`, "burst"]);
    if (W.brain === 3) {
      const did = [st[w].aims && `aimed first ${st[w].aims} time${st[w].aims === 1 ? "" : "s"}`, st[w].shields && `raised its shield ${st[w].shields} time${st[w].shields === 1 ? "" : "s"}`, st[w].powers && `used ${st[w].powers} power attack${st[w].powers === 1 ? "" : "s"}`, st[w].smashes && `smashed ${st[w].smashes === 1 ? "a shield" : st[w].smashes + " shields"}`].filter(Boolean);
      if (did.length) R.push([1.3 + did.length * 0.3, `${N(w)}'s rules worked: it ${did.join(" and ")}.`, "rules"]);
    } else {
      if (st[w].shields >= 1) R.push([1.4 + st[w].counters * 0.6, `${N(w)}'s defensive brain raised a shield${st[w].counters ? " and hit back" : ""} when it got hurt.`, "shield"]);
      if (st[w].aims >= 2) R.push([0.9 + st[w].aims * 0.3, `${N(w)}'s smart brain waited for clear shots ${st[w].aims} times.`, "aim"]);
    }
    if (W.body === 1 && L.tool === 2 && R.every((r) => r[2] !== "dmg")) R.push([1.1, `${N(w)}'s thick treads armor blocked a lot of each small spinner hit.`, "armor"]);
    if (R.some((r) => r[2] === "attacks") && st[w].bursts) R.splice(R.findIndex((r) => r[2] === "burst"), 1); // already said
    R.sort((x, y) => y[0] - x[0]);
    let reasons = R.slice(0, 3).map((r) => r[1]);
    const close = endHp[w] <= 25, even = !R.length || R[0][0] < 1.1;
    if (even) reasons = [`It was almost even. Both robots hit about the same, so a few lucky hits decided it. A rematch could go the other way!`, ...reasons].slice(0, 3);
    const top = R.length ? R[0][2] : "luck";

    const has = (slot, i) => L[slot] === i;
    const loserTip = ({
      acc: () => has("tool", 1) ? "Your Hammer missed a lot. A Gripper or Spinner hits more often." : !has("sensor", 0) ? `A Camera aims better than your ${part(l, "sensor")} sensor.` : !has("brain", 2) ? "The Smart brain waits for clear shots, so it misses less." : "Legs or an Ultrasonic sensor help you dodge.",
      dmg: () => W.body === 1 && !has("tool", 1) && !has("tool", 4) ? "Against Treads, a Hammer or Drill gets through the armor." : !has("tool", 1) ? "A Hammer hits much harder." : !has("brain", 0) ? "The Aggressive brain adds hitting power." : "Add armor: Treads or the Touch sensor block damage.",
      attacks: () => !has("tool", 2) ? "A Spinner hits twice every turn, so you get more attacks." : !has("body", 0) ? "Wheels are fast and sometimes attack twice." : "Add armor so you survive long enough to hit back.",
      first: () => !has("body", 0) ? "Wheels are the fastest body, so they usually attack first." : "Add armor so you can survive the first hits.",
      grab: () => !has("body", 1) ? "Treads can't be grabbed. They're a good counter to Grippers." : "Finish fights faster with a Hammer before the gripper gets you.",
      heavy: () => "Grippers can't grab Treads. Against Treads, try a Hammer or Drill. A Flipper can even flip them.",
      flip: () => !has("body", 3) ? "A Wedge body is too low to flip." : "Finish fights faster so the flipper gets fewer tries.",
      low: () => "Flippers can't get under a Wedge. Against a Wedge, try a Drill or Hammer.",
      glance: () => "Spinner hits glance off a Wedge. A Drill or Hammer works better against it.",
      pierce: () => !has("body", 2) ? "Armor doesn't stop a Drill, but dodging does. Try Legs." : "Armor doesn't stop a Drill. An Ultrasonic sensor helps you dodge it too.",
      track: () => "Lidar sees through dodging. Against Lidar, armor like Treads works better.",
      burst: () => has("tool", 1) || has("tool", 4) ? `Your ${part(l, "tool")} struggles to hit fast Wheels. A Spinner hits more often.` : !has("tool", 2) ? "Wheels have no armor, so a Spinner's quick hits all count." : "Wheels are fast. Treads armor helps you outlast them.",
      shield: () => !has("tool", 1) ? "Defensive robots get tough when hurt. Finish them fast with a Hammer." : "Defensive robots get tough when hurt. The Aggressive brain hits harder through shields.",
      aim: () => !has("body", 2) ? "Legs make you harder to hit, even for a Smart brain." : "Add armor so the clear shots hurt less.",
      armor: () => "Thick armor blocks a lot of each small spinner hit. Against Treads, a Hammer or Drill hits harder.",
      luck: () => "Your robot was a good match. Ask for a rematch!",
      rules: () => L.brain === 3 ? "Their rules fit this fight better. Try changing what your rules do, or their order." : "Their rules fit the fight. Try writing rules of your own with the Custom brain.",
    }[top] || (() => "Every robot has a counter. Try a different part!"))();
    // a losing Custom brain gets advice about its own rules first
    const lr = L.rules || RULES.defaults;
    const ruleTip = L.brain !== 3 ? null
      : !lr.length ? "Your Custom brain has no rules, so it only does plain attacks. Add a rule, like a power attack."
      : st[w].smashes && st[l].shields >= 2 ? "Their power attacks smashed through your shield. Against a power attacker, attack instead of shielding."
      : st[l].aims >= 3 && lr.some((r) => r.a === 2 && !(r.c === 3 && r.v === 2)) ? `Your rules aimed ${st[l].aims} times, and each aim skips an attack. Try aiming only when your hit chance is below 40%.`
      : st[l].powers >= 3 && acc(l) < 0.5 ? "Power attacks miss more. Use them when your hit chance is high, or after aiming first."
      : null;
    const counter = W.body === 1 ? "Hammers and Drills beat Treads." : W.body === 0 ? "Spinners shred light Wheels, and Treads can take their hits." : W.body === 2 ? "Accurate Grippers can still catch Legs." : W.body === 3 ? "Drills and Hammers beat Wedges." : "Every robot has a counter.";
    const headline = (k) => k === w
      ? (close ? `Close one! ${N(w)} won with ${endHp[w]} HP left.` : endHp[w] >= 70 ? `${N(w)} won easily!` : `${N(w)} won!`)
      : `Why ${N(w)} beat ${N(l)}`;
    // a tip may not suggest a part this game's weight class rules out
    const heavy = partsTooHeavy(maxw), usable = (t) => !heavy.some((n) => new RegExp(`\\b${n}s?\\b`).test(t));
    return {
      winner: w,
      sides: [0, 1].map((k) => ({ won: k === w, headline: headline(k), reasons, tip: k === w ? (usable(counter) ? `Keep it up! Watch out: ${counter}` : "Keep it up! Every robot has a counter, so keep testing new matchups.") : usable(ruleTip || loserTip) ? ruleTip || loserTip : "Every robot has a counter. Try a different part!" })),
      stats: st,
    };
  }

  // ---------------- browser-only: drawing, effects, sound ----------------
  function fit(c) {
    const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => clamp(Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt), 0, 255);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  const ease = { out: (t) => 1 - Math.pow(1 - t, 3), back: (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };
  function bigText(ctx, lbl, x, y, size, color, scale = 1, alpha = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
    ctx.font = `700 ${Math.round(size)}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(4, size * 0.08); ctx.lineJoin = "round"; ctx.strokeStyle = "#141316"; ctx.strokeText(lbl, 0, 0);
    ctx.fillStyle = color; ctx.fillText(lbl, 0, 0); ctx.restore();
  }

  class FX {
    constructor() { this.p = []; this.txt = []; this.rings = []; this.shake = 0; }
    // an expanding circle: the shock of an impact, or a shield taking a hit
    ring(x, y, r, color, life = 0.35, width = 4) { this.rings.push({ x, y, r, color, life: 0, max: life, width }); }
    burst(x, y, n, o = {}) {
      if (RM) n = Math.ceil(n / 3);
      for (let i = 0; i < n; i++) {
        const a = (o.angle ?? 0) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2), sp = (o.speed ?? 200) * (0.4 + Math.random() * 0.8);
        const cols = o.colors || ["#ffd23f"];
        this.p.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: (o.life ?? 0.6) * (0.6 + Math.random() * 0.6),
          size: (o.size ?? 4) * (0.6 + Math.random() * 0.8), color: cols[(Math.random() * cols.length) | 0], g: o.g ?? 400,
          kind: o.kind || "spark", rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, drag: o.drag ?? 0.9 });
      }
    }
    text(x, y, s, color, size = 28) { this.txt.push({ x, y, s, color, size, life: 0, max: 1.1 }); }
    update(dt) {
      this.shake = Math.max(0, this.shake - dt * 30);
      this.p = this.p.filter((q) => (q.life += dt) < q.max);
      for (const q of this.p) {
        const d = Math.pow(q.drag, dt * 10); q.vx *= d; q.vy = q.vy * d + q.g * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      }
      this.txt = this.txt.filter((t) => (t.life += dt) < t.max);
      this.rings = this.rings.filter((r) => (r.life += dt) < r.max);
    }
    draw(ctx) {
      for (const r of this.rings) {
        const k = r.life / r.max;
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - k * 0.6);
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.25 + 0.75 * ease.out(k)), 0, 7); ctx.stroke();
      }
      for (const q of this.p) {
        const k = 1 - q.life / q.max, soft = q.kind === "smoke" || q.kind === "dust";
        ctx.globalAlpha = soft ? k * 0.55 : Math.min(1, k * 1.6);
        ctx.fillStyle = q.color;
        if (q.kind === "spark") { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.atan2(q.vy, q.vx)); ctx.fillRect(-q.size * 1.6, -q.size / 3, q.size * 3.2, q.size / 1.5); ctx.restore(); }
        else if (q.kind === "confetti") { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-q.size, -q.size / 2, q.size * 2, q.size); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (soft ? 1 + q.life * 2.5 : 1), 0, 7); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      for (const t of this.txt) {
        const k = t.life / t.max, sc = k < 0.15 ? ease.back(k / 0.15) : 1;
        bigText(ctx, t.s, t.x, t.y - k * 50, t.size, t.color, sc, k > 0.7 ? (1 - k) / 0.3 : 1);
      }
    }
  }

  // x = center, gy = ground y, s = unit size, dir 1 faces right.
  // o: lunge 0..1 (simple attack), hurt 0..1, tilt (rad), shield, bob,
  //    and for battles: reach 0..1 (arm out), hammer (swing angle), clamp (gripper, 1 = shut), spinA (spinner angle),
  //    flipA (flipper angle), damage 0..1 (scratches, cracked visor, flickering eye), pose "win" (arm pumping)
  // ---------------- part art (optional) ----------------
  // An art pack maps parts to pictures: parts["body.0"] = { img, box: [x, y, w, h] in robot sizes, tint, pivot }.
  // Frames: body from the ground under the robot (y up is negative), sensor from the middle of the head,
  // tool from the hand, pointing along the arm. drawBot uses a picture when one has loaded, and code otherwise.
  // tint: the picture is a gray template colored with the robot's color. See public/art-sample/README.md.
  let art = null;
  const ART_KEY = /^(body|sensor|tool)\.\d$/, TORSO_Y = [-0.48, -0.5, -0.74, -0.48], tinted = new Map();
  const setArt = (pack) => { art = pack; tinted.clear(); };
  function artReady(key) { const p = art && art.parts && art.parts[key]; return p && p.img && p.img.complete && p.img.naturalWidth ? p : null; }
  function artPart(ctx, key, s, col) {
    const p = artReady(key); if (!p) return false;
    let src = p.img;
    if (p.tint) { // multiply the color in, then keep only the picture's own shape
      src = tinted.get(key + col);
      if (!src) {
        src = document.createElement("canvas"); src.width = p.img.naturalWidth; src.height = p.img.naturalHeight;
        const c = src.getContext("2d"); c.drawImage(p.img, 0, 0); c.globalCompositeOperation = "multiply"; c.fillStyle = col; c.fillRect(0, 0, src.width, src.height);
        c.globalCompositeOperation = "destination-in"; c.drawImage(p.img, 0, 0); tinted.set(key + col, src);
      }
    }
    ctx.drawImage(src, p.box[0] * s, p.box[1] * s, p.box[2] * s, p.box[3] * s);
    return true;
  }
  // load /art/manifest.json (if the school added one) plus any extra parts (a student's own pictures, practice mode only)
  function loadArt(url, extra = {}) {
    if (!isBrowser || typeof fetch === "undefined") return Promise.resolve(null);
    const base = url.replace(/[^/]*$/, "");
    return fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((m) => {
      const parts = {};
      for (const [k, p] of Object.entries({ ...((m && m.parts) || {}), ...extra })) {
        if (!ART_KEY.test(k) || !p || typeof p.src !== "string" || !Array.isArray(p.box) || p.box.length !== 4 || !p.box.every(Number.isFinite)) continue;
        const img = new Image();
        parts[k] = { img, box: p.box, tint: !!p.tint, pivot: Array.isArray(p.pivot) ? p.pivot : null, ready: new Promise((ok) => { img.onload = img.onerror = ok; }) };
        img.src = /^(data:|https?:|\/)/.test(p.src) ? p.src : base + p.src;
      }
      const pack = Object.keys(parts).length ? { name: (m && m.name) || "", parts } : null;
      setArt(pack);
      // resolves once every picture has loaded (or failed), so a page can redraw its robot portraits
      return Promise.all(Object.values(parts).map((p) => p.ready)).then(() => { tinted.clear(); return pack; });
    });
  }

  function drawBot(ctx, b, x, gy, s, dir, t, o = {}) {
    const col = COLORS[b.color], ink = "#141316", metal = "#8f8b98", metalHi = "#c9c5d1";
    const lw = Math.max(1.5, s * 0.05);
    ctx.save(); ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath();
    ctx.ellipse(x, gy + 2, s * 1.05 * (o.tilt ? 1.3 : 1), s * 0.14, 0, 0, 7); ctx.fill(); ctx.restore();

    ctx.save(); ctx.translate(x, gy);
    if (o.tilt) ctx.rotate(o.tilt * dir);
    ctx.scale(dir, 1);
    const bob = o.bob ?? Math.sin(t * 3 + b.color) * s * 0.025;
    ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = ink;

    let torsoBottom;
    if (artPart(ctx, "body." + b.body, s, col)) torsoBottom = TORSO_Y[b.body] * s;
    else if (b.body === 0) {
      [-0.55, 0.55].forEach((wx) => {
        ctx.fillStyle = "#222126"; ctx.beginPath(); ctx.arc(wx * s, -0.32 * s, 0.32 * s, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(wx * s, -0.32 * s, 0.14 * s, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = metalHi; ctx.lineWidth = lw * 0.8;
        for (let k = 0; k < 3; k++) { const a = t * 5 + k * 2.09; ctx.beginPath(); ctx.moveTo(wx * s + Math.cos(a) * 0.16 * s, -0.32 * s + Math.sin(a) * 0.16 * s); ctx.lineTo(wx * s + Math.cos(a) * 0.27 * s, -0.32 * s + Math.sin(a) * 0.27 * s); ctx.stroke(); }
        ctx.strokeStyle = ink; ctx.lineWidth = lw;
      });
      ctx.fillStyle = metal; rr(ctx, -0.6 * s, -0.5 * s, 1.2 * s, 0.14 * s, 0.05 * s); ctx.fill(); ctx.stroke();
      torsoBottom = -0.48 * s;
    } else if (b.body === 1) {
      ctx.fillStyle = "#222126"; rr(ctx, -0.98 * s, -0.52 * s, 1.96 * s, 0.52 * s, 0.26 * s); ctx.fill(); ctx.stroke();
      ctx.save(); rr(ctx, -0.98 * s, -0.52 * s, 1.96 * s, 0.52 * s, 0.26 * s); ctx.clip();
      ctx.fillStyle = "#3a3940"; const off = (t * 40) % (0.2 * s);
      for (let k = -1; k < 12; k++) ctx.fillRect(-0.98 * s + k * 0.2 * s + off, -0.52 * s, 0.08 * s, 0.07 * s);
      ctx.restore();
      for (let k = 0; k < 5; k++) { ctx.fillStyle = metal; ctx.beginPath(); ctx.arc((-0.68 + k * 0.34) * s, -0.26 * s, 0.11 * s, 0, 7); ctx.fill(); ctx.stroke(); }
      torsoBottom = -0.5 * s;
    } else if (b.body === 2) {
      const st = Math.sin(t * 5) * 0.1 * s;
      [[-0.38, st], [0.38, -st]].forEach(([lx, sv]) => {
        ctx.strokeStyle = ink; ctx.lineWidth = s * 0.17;
        ctx.beginPath(); ctx.moveTo(lx * s, -0.78 * s); ctx.lineTo(lx * s + sv, -0.4 * s); ctx.lineTo(lx * s, -0.06 * s); ctx.stroke();
        ctx.strokeStyle = metal; ctx.lineWidth = s * 0.11;
        ctx.beginPath(); ctx.moveTo(lx * s, -0.78 * s); ctx.lineTo(lx * s + sv, -0.4 * s); ctx.lineTo(lx * s, -0.06 * s); ctx.stroke();
        ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(lx * s + sv, -0.4 * s, 0.07 * s, 0, 7); ctx.fill();
        ctx.fillStyle = "#222126"; rr(ctx, lx * s - 0.22 * s, -0.1 * s, 0.44 * s, 0.1 * s, 0.04 * s); ctx.fill();
      });
      ctx.strokeStyle = ink; ctx.lineWidth = lw;
      torsoBottom = -0.74 * s;
    } else {
      // wedge: a low slanted ramp with the wheels tucked underneath
      ctx.fillStyle = "#222126";
      [-0.62, 0.3].forEach((wx) => { ctx.beginPath(); ctx.arc(wx * s, -0.12 * s, 0.12 * s, 0, 7); ctx.fill(); ctx.stroke(); });
      const wg = ctx.createLinearGradient(0, -0.55 * s, 0, 0); wg.addColorStop(0, "#77737f"); wg.addColorStop(1, "#3a3940");
      ctx.fillStyle = wg; ctx.beginPath();
      ctx.moveTo(-0.95 * s, -0.5 * s); ctx.lineTo(0.62 * s, -0.5 * s); ctx.lineTo(1.25 * s, -0.07 * s); ctx.lineTo(1.25 * s, -0.02 * s); ctx.lineTo(-0.95 * s, -0.14 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = lw * 1.3; ctx.setLineDash([0.09 * s, 0.07 * s]);
      ctx.beginPath(); ctx.moveTo(0.66 * s, -0.45 * s); ctx.lineTo(1.18 * s, -0.1 * s); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = ink; ctx.lineWidth = lw;
      torsoBottom = -0.48 * s;
    }
    ctx.translate(0, bob);

    const tw = 1.3 * s, th = 0.95 * s, ty = torsoBottom - th;
    const g = ctx.createLinearGradient(0, ty, 0, ty + th);
    g.addColorStop(0, shade(col, 0.28)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.3));
    ctx.fillStyle = g; rr(ctx, -tw / 2, ty, tw, th, 0.16 * s); ctx.fill(); ctx.stroke();
    if (o.hurt) { ctx.globalAlpha = o.hurt * 0.8; ctx.fillStyle = "#fff"; rr(ctx, -tw / 2, ty, tw, th, 0.16 * s); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, -tw / 2 + 0.14 * s, ty + 0.42 * th, tw - 0.28 * s, 0.4 * th, 0.07 * s); ctx.fill();
    for (let k = 0; k < 3; k++) {
      const on = (Math.floor(t * 3) + k) % 3 === 0;
      ctx.fillStyle = on ? BRAIN_COL[b.brain] : "rgba(255,255,255,.18)";
      ctx.beginPath(); ctx.arc(-0.3 * s + k * 0.2 * s, ty + 0.62 * th, 0.055 * s, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,.35)"; rr(ctx, -tw / 2 + 0.1 * s, ty + 0.08 * s, tw * 0.45, 0.07 * s, 0.03 * s); ctx.fill();
    ctx.fillStyle = ink; [-1, 1].forEach((sx) => { ctx.beginPath(); ctx.arc(sx * (tw / 2 - 0.1 * s), ty + 0.24 * s, 0.03 * s, 0, 7); ctx.fill(); });
    const dmg = o.damage || 0;
    if (dmg > 0.15) {
      // battle scars: the same spots every frame (seeded by the parts), more of them as health drops
      let seed = b.body * 7 + b.sensor * 13 + b.tool * 17 + b.color * 31 + 1;
      const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      const n = Math.min(7, Math.floor((dmg - 0.1) * 9));
      ctx.save(); rr(ctx, -tw / 2, ty, tw, th, 0.16 * s); ctx.clip();
      for (let k = 0; k < n; k++) {
        const cx = -tw / 2 + (0.15 + rand() * 0.7) * tw, cy = ty + (0.12 + rand() * 0.76) * th, a = rand() * Math.PI, L = (0.12 + rand() * 0.16) * s;
        if (k % 3 === 2) { ctx.fillStyle = "rgba(20,19,22,.35)"; ctx.beginPath(); ctx.ellipse(cx, cy, 0.09 * s, 0.06 * s, a, 0, 7); ctx.fill(); }
        else { ctx.strokeStyle = "rgba(20,19,22,.55)"; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * L / 2, cy - Math.sin(a) * L / 2); ctx.lineTo(cx + Math.cos(a) * L / 2, cy + Math.sin(a) * L / 2); ctx.stroke(); }
      }
      ctx.restore(); ctx.strokeStyle = ink; ctx.lineWidth = lw;
    }

    const hw = 0.82 * s, hh = 0.56 * s, hy = ty - hh - 0.1 * s;
    ctx.fillStyle = metal; rr(ctx, -0.1 * s, ty - 0.13 * s, 0.2 * s, 0.16 * s, 0.03 * s); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(0, hy + hh / 2); const headArt = artPart(ctx, "sensor." + b.sensor, s, col); ctx.restore();
    if (!headArt) { const hg = ctx.createLinearGradient(0, hy, 0, hy + hh); hg.addColorStop(0, "#ece8f0"); hg.addColorStop(1, "#a9a5b2"); ctx.fillStyle = hg; rr(ctx, -hw / 2, hy, hw, hh, 0.14 * s); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-0.18 * s, hy); ctx.lineTo(-0.24 * s, hy - 0.22 * s); ctx.stroke();
    ctx.save(); ctx.shadowColor = BRAIN_COL[b.brain]; ctx.shadowBlur = 10 + 6 * Math.sin(t * 5);
    ctx.fillStyle = BRAIN_COL[b.brain]; ctx.beginPath(); ctx.arc(-0.24 * s, hy - 0.26 * s, 0.07 * s, 0, 7); ctx.fill(); ctx.restore();
    const blink = (t % 3.7) < 0.12 || (dmg > 0.82 && (t * 11) % 1 < 0.35) ? 0.15 : 1; // nearly knocked out: the eye flickers
    if (headArt) { /* the picture is the head and its sensor */ } else if (b.sensor === 0) {
      ctx.fillStyle = "#222126"; ctx.beginPath(); ctx.arc(0.12 * s, hy + hh / 2, 0.2 * s, 0, 7); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(0.12 * s, hy + hh / 2); ctx.scale(1, blink);
      const eg = ctx.createRadialGradient(-0.03 * s, -0.03 * s, 0, 0, 0, 0.11 * s); eg.addColorStop(0, "#bfe6ff"); eg.addColorStop(1, "#1d7fc4");
      ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(0, 0, 0.11 * s, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-0.04 * s, -0.04 * s, 0.03 * s, 0, 7); ctx.fill(); ctx.restore();
    } else if (b.sensor === 1) {
      [-0.1, 0.22].forEach((ex) => {
        ctx.fillStyle = "#c9c5d1"; ctx.beginPath(); ctx.arc(ex * s, hy + hh / 2, 0.15 * s, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#222126"; ctx.beginPath(); ctx.arc(ex * s, hy + hh / 2, 0.1 * s, 0, 7); ctx.fill();
        ctx.strokeStyle = "#555"; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.arc(ex * s, hy + hh / 2, 0.06 * s, 0, 7); ctx.stroke();
        ctx.strokeStyle = ink; ctx.lineWidth = lw;
      });
    } else if (b.sensor === 2) {
      ctx.save(); ctx.translate(0.12 * s, hy + hh * 0.42); ctx.scale(1, blink);
      ctx.fillStyle = "#222126"; ctx.beginPath(); ctx.arc(0, 0, 0.075 * s, 0, 7); ctx.fill(); ctx.restore();
      ctx.lineWidth = lw * 0.8;
      [-0.22, 0, 0.22].forEach((a, k) => {
        const wig = Math.sin(t * 6 + k) * 0.04 * s;
        ctx.beginPath(); ctx.moveTo(hw / 2 - 0.02 * s, hy + hh * 0.66); ctx.quadraticCurveTo(hw / 2 + 0.2 * s, hy + hh * 0.66 + a * s * 0.5 + wig, hw / 2 + 0.38 * s, hy + hh * 0.66 + a * s + wig); ctx.stroke();
      });
      ctx.lineWidth = lw;
    } else {
      // lidar: a dark visor with a scanning laser dot, and a spinning turret on top
      ctx.fillStyle = "#222126"; rr(ctx, -hw / 2 + 0.08 * s, hy + hh * 0.3, hw - 0.16 * s, hh * 0.34, 0.08 * s); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.shadowColor = "#ff5d5d"; ctx.shadowBlur = 8; ctx.fillStyle = blink < 1 ? "#7a2b2b" : "#ff5d5d";
      ctx.beginPath(); ctx.arc(Math.sin(t * 3) * (hw / 2 - 0.17 * s), hy + hh * 0.47, 0.05 * s, 0, 7); ctx.fill(); ctx.restore();
      ctx.fillStyle = "#3a3940"; rr(ctx, 0.04 * s, hy - 0.17 * s, 0.28 * s, 0.17 * s, 0.05 * s); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c9c5d1"; ctx.fillRect(0.07 * s + ((t * 5) % 1) * 0.2 * s, hy - 0.15 * s, 0.03 * s, 0.13 * s);
    }
    if (!headArt) { ctx.fillStyle = "rgba(255,255,255,.5)"; rr(ctx, -hw / 2 + 0.08 * s, hy + 0.06 * s, hw * 0.35, 0.05 * s, 0.02 * s); ctx.fill(); }
    if (dmg > 0.6) { // cracked visor
      ctx.strokeStyle = "rgba(20,19,22,.7)"; ctx.lineWidth = lw * 0.7; ctx.beginPath();
      ctx.moveTo(-hw / 2 + 0.1 * s, hy + 0.08 * s); ctx.lineTo(-hw / 2 + 0.2 * s, hy + 0.2 * s); ctx.lineTo(-hw / 2 + 0.16 * s, hy + 0.28 * s); ctx.lineTo(-hw / 2 + 0.27 * s, hy + 0.4 * s); ctx.stroke();
      ctx.strokeStyle = ink; ctx.lineWidth = lw;
    }

    const l = o.lunge || 0, reach = (o.reach ?? Math.sin(l * Math.PI)) * 0.5 * s;
    const armA = o.pose === "win" ? -1.05 + Math.sin(t * 8) * 0.2 : 0.11; // a winner pumps its tool in the air
    const sx = tw / 2 - 0.06 * s, sy = ty + 0.32 * th, len = 0.45 * s + reach, ex = sx + Math.cos(armA) * len, ey = sy + Math.sin(armA) * len;
    ctx.strokeStyle = ink; ctx.lineWidth = s * 0.16; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = metal; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(sx, sy, 0.07 * s, 0, 7); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = lw;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(armA - 0.11); // tools are drawn from the hand, facing along the arm
    const toolArt = artReady("tool." + b.tool);
    if (toolArt) { // a picture moves like the drawn tool: the hammer swings, the spinner spins, the flipper snaps up, the gripper squeezes
      const pv = toolArt.pivot || [toolArt.box[0] + toolArt.box[2] / 2, toolArt.box[1] + toolArt.box[3] / 2];
      if (b.tool === 0) ctx.scale(1, 1 - 0.25 * (o.clamp ?? Math.sin(l * Math.PI)));
      else if (b.tool === 1) ctx.rotate(o.hammer ?? -0.5 + Math.sin(l * Math.PI) * 1.1);
      else if (b.tool === 2) { ctx.translate(pv[0] * s, pv[1] * s); ctx.rotate(o.spinA ?? t * (l > 0 ? 40 : 9)); ctx.translate(-pv[0] * s, -pv[1] * s); }
      else if (b.tool === 3) ctx.rotate(o.flipA ?? 0.3 - Math.sin(l * Math.PI) * 1.4);
      else if (o.spinA !== undefined && !RM) ctx.translate(0, Math.sin(o.spinA * 3) * 0.01 * s); // a drill can't spin in a flat picture, so it buzzes
      artPart(ctx, "tool." + b.tool, s, col);
    } else if (b.tool === 0) {
      const open = (0.18 - 0.14 * (o.clamp ?? Math.sin(l * Math.PI))) * s;
      ctx.lineWidth = s * 0.1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.24 * s, -open); ctx.lineTo(0.4 * s, -0.03 * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.24 * s, open); ctx.lineTo(0.4 * s, 0.03 * s); ctx.stroke();
      ctx.lineWidth = lw;
    } else if (b.tool === 1) {
      ctx.rotate(o.hammer ?? -0.5 + Math.sin(l * Math.PI) * 1.1);
      ctx.fillStyle = "#6b4a2f"; rr(ctx, 0, -0.05 * s, 0.28 * s, 0.1 * s, 0.03 * s); ctx.fill(); ctx.stroke();
      const hg2 = ctx.createLinearGradient(0.24 * s, 0, 0.52 * s, 0); hg2.addColorStop(0, "#5c5a63"); hg2.addColorStop(1, "#2a292e");
      ctx.fillStyle = hg2; rr(ctx, 0.24 * s, -0.3 * s, 0.28 * s, 0.6 * s, 0.06 * s); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.18)"; rr(ctx, 0.28 * s, -0.26 * s, 0.06 * s, 0.52 * s, 0.03 * s); ctx.fill();
    } else if (b.tool === 2) {
      ctx.translate(0.24 * s, 0);
      const fast = o.spinA !== undefined && o.spinFast;
      if (fast) { ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = "#e9e6ee"; ctx.beginPath(); ctx.arc(0, 0, 0.37 * s, 0, 7); ctx.fill(); ctx.restore(); } // motion blur
      ctx.rotate(o.spinA ?? t * (l > 0 ? 40 : 9));
      ctx.fillStyle = "#3a3940"; ctx.beginPath(); ctx.arc(0, 0, 0.28 * s, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e9e6ee";
      for (let k = 0; k < 3; k++) { ctx.rotate(2.094); ctx.beginPath(); ctx.moveTo(0.1 * s, -0.06 * s); ctx.lineTo(0.36 * s, -0.02 * s); ctx.lineTo(0.3 * s, 0.07 * s); ctx.lineTo(0.1 * s, 0.06 * s); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(0, 0, 0.07 * s, 0, 7); ctx.fill();
    } else if (b.tool === 3) {
      // flipper: a flat plate hinged at the hand that snaps upward
      ctx.rotate(o.flipA ?? 0.3 - Math.sin(l * Math.PI) * 1.4);
      ctx.fillStyle = "#8f8b98"; ctx.beginPath(); ctx.moveTo(0, -0.06 * s); ctx.lineTo(0.56 * s, -0.03 * s); ctx.lineTo(0.64 * s, 0.05 * s); ctx.lineTo(0, 0.07 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffd23f"; ctx.fillRect(0.34 * s, -0.025 * s, 0.2 * s, 0.045 * s);
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(0, 0.005 * s, 0.065 * s, 0, 7); ctx.fill();
    } else {
      // drill: a steel cone whose spiral bands slide along as it spins
      ctx.fillStyle = "#55535c"; rr(ctx, 0, -0.1 * s, 0.17 * s, 0.2 * s, 0.03 * s); ctx.fill(); ctx.stroke();
      const cone = () => { ctx.beginPath(); ctx.moveTo(0.17 * s, -0.13 * s); ctx.lineTo(0.64 * s, 0); ctx.lineTo(0.17 * s, 0.13 * s); ctx.closePath(); };
      const dg = ctx.createLinearGradient(0, -0.13 * s, 0, 0.13 * s); dg.addColorStop(0, "#eeeaf2"); dg.addColorStop(1, "#8f8b98");
      ctx.fillStyle = dg; cone(); ctx.fill(); ctx.stroke();
      const off = (((o.spinA ?? t * (l > 0 ? 40 : 6)) * 0.04) % 0.12 + 0.12) % 0.12;
      ctx.save(); cone(); ctx.clip(); ctx.strokeStyle = "rgba(20,19,22,.45)"; ctx.lineWidth = lw * 0.7;
      for (let k = -1; k < 5; k++) { const x = (0.19 + k * 0.12 + off) * s; ctx.beginPath(); ctx.moveTo(x, -0.15 * s); ctx.lineTo(x + 0.08 * s, 0.15 * s); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
    if (o.shield) {
      ctx.save(); ctx.globalAlpha = 0.22 + 0.1 * Math.sin(t * 8);
      ctx.fillStyle = "#4fd18b"; ctx.strokeStyle = "#4fd18b"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, (hy + torsoBottom) / 2 - 0.05 * s, 1.2 * s, 1.25 * s, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    return { headX: x + dir * 0.12 * s, headY: gy + hy + bob + hh / 2 };
  }

  // Small static portrait of a bot on a canvas element (lobby cards, roster rows).
  function portrait(canvas, b, bg = "#2b2a30", dir = 1, scale = 1) {
    const ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg; rr(ctx, 0, 0, w, h, w * 0.18); ctx.fill();
    const s = Math.min(w, h) * 0.27 * scale;
    drawBot(ctx, b, w * (dir === 1 ? 0.43 : 0.57), h * 0.92, s, dir, 0, { bob: 0 });
  }

  // ---------------- sound effects (off until turned on) ----------------
  // 8-bit style, like the music: pulse waves at three duty cycles, a triangle, and NES-style shift-register noise.
  // Effects are scheduled from "now" (no timers), so Sound.render can play one into a buffer for the sound test page.
  const Sound = (() => {
    let ctx = null, chip = null, out = null, on = false;
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    function makeChip(c) { // the same chip as music.js, kept here so each file works on its own
      const wave = (d) => {
        const n = 64, re = new Float32Array(n), im = new Float32Array(n);
        for (let k = 1; k < n; k++) { re[k] = Math.sin(2 * Math.PI * k * d) / (Math.PI * k); im[k] = (1 - Math.cos(2 * Math.PI * k * d)) / (Math.PI * k); }
        return c.createPeriodicWave(re, im);
      };
      const lfsr = (short) => {
        const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
        let r = 1; for (let i = 0; i < d.length; i++) { const fb = (r ^ (r >> (short ? 6 : 1))) & 1; r = (r >> 1) | (fb << 14); d[i] = r & 1 ? -0.8 : 0.8; }
        return buf;
      };
      return { 0.125: wave(0.125), 0.25: wave(0.25), 0.5: wave(0.5), noise: lfsr(false), metal: lfsr(true) };
    }
    function env(t, v, dur, sustain) {
      const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, t + dur * sustain); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(out); return g;
    }
    // one note: o.duty (0.125 thin, 0.25, 0.5 round) or o.tri, o.to slides to that frequency, o.at starts it later (seconds), o.vib wobbles it
    function note(f, dur, o = {}) {
      const t = ctx.currentTime + (o.at || 0), g = env(t, o.vol ?? 0.06, dur, o.sustain ?? 0.6), osc = ctx.createOscillator();
      if (o.tri) osc.type = "triangle"; else osc.setPeriodicWave(chip[o.duty || 0.5]);
      osc.frequency.setValueAtTime(f, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      if (o.vib) { const lfo = ctx.createOscillator(), d = ctx.createGain(); lfo.frequency.value = 12; d.gain.value = f * 0.03; lfo.connect(d).connect(osc.frequency); lfo.start(t); lfo.stop(t + dur); }
      osc.connect(g); osc.start(t); osc.stop(t + dur + 0.02);
    }
    // noise: o.rate is the brightness (1 bright hiss, 0.1 a low rumble), o.to the rate at the end, o.metal the buzzy short mode
    function hiss(dur, o = {}) {
      const t = ctx.currentTime + (o.at || 0), g = env(t, o.vol ?? 0.1, dur, o.sustain ?? 0.1), src = ctx.createBufferSource();
      src.buffer = o.metal ? chip.metal : chip.noise; src.loop = true; src.playbackRate.setValueAtTime(o.rate || 1, t);
      if (o.to) src.playbackRate.exponentialRampToValueAtTime(o.to, t + dur);
      src.connect(g); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    }
    // a short tune: [midi note (0 = rest), length in steps] pairs
    function tune(list, step, o = {}) { let at = o.at || 0; for (const [m, n] of list) { if (m) note(mtof(m), n * step * 0.92, { ...o, at }); at += n * step; } }
    const fx = {
      click: () => note(mtof(91), 0.035, { duty: 0.125, vol: 0.045 }), // menu blip
      beep: () => note(mtof(81), 0.09, { duty: 0.5, vol: 0.055 }), // countdown
      go: () => tune([[72, 1], [76, 1], [79, 1], [84, 3]], 0.045, { duty: 0.25, vol: 0.06 }), // a rising "start!"
      join: () => tune([[79, 1], [83, 1], [86, 1], [91, 1], [95, 1], [98, 2]], 0.035, { duty: 0.25, vol: 0.05 }), // a power-up run
      scan: () => { note(1400, 0.08, { duty: 0.125, vol: 0.03, to: 2600 }); note(1400, 0.08, { duty: 0.125, vol: 0.025, to: 2600, at: 0.1 }); },
      think: () => { note(mtof(78), 0.05, { duty: 0.125, vol: 0.04 }); note(mtof(83), 0.06, { duty: 0.125, vol: 0.04, at: 0.07 }); },
      hit: () => { hiss(0.14, { rate: 0.5, to: 0.2, vol: 0.18 }); note(240, 0.12, { duty: 0.5, vol: 0.07, to: 55 }); },
      miss: () => { note(1000, 0.14, { duty: 0.125, vol: 0.04, to: 240 }); hiss(0.08, { rate: 1, vol: 0.035 }); },
      ko: () => { // an explosion: a long rumble, two more bursts, and a falling tone
        hiss(0.7, { rate: 0.4, to: 0.08, vol: 0.2, sustain: 0.3 }); hiss(0.25, { rate: 0.6, to: 0.2, vol: 0.12, at: 0.18 }); hiss(0.25, { rate: 0.5, to: 0.15, vol: 0.1, at: 0.36 });
        note(330, 0.6, { duty: 0.5, vol: 0.06, to: 40 });
      },
      win: () => { // a short "stage clear" jingle
        tune([[84, 1], [88, 1], [91, 1], [96, 2], [91, 1], [96, 4]], 0.075, { duty: 0.25, vol: 0.06 });
        tune([[60, 4], [55, 2], [60, 4]], 0.075, { tri: true, vol: 0.14 });
      },
      whoosh: () => hiss(1.1, { rate: 2.2, to: 0.5, vol: 0.07, sustain: 0.4 }),
      thud: () => { note(110, 0.2, { tri: true, vol: 0.22, to: 40 }); hiss(0.12, { rate: 0.25, vol: 0.1 }); },
      fanfare: () => { // the champion: lead, a harmony a third or fourth below, and a triangle bass
        const step = 0.07;
        tune([[67, 2], [72, 2], [76, 2], [79, 4], [76, 2], [79, 8], [81, 2], [79, 2], [76, 2], [84, 10]], step, { duty: 0.25, vol: 0.06 });
        tune([[64, 2], [67, 2], [72, 2], [76, 4], [72, 2], [76, 8], [77, 2], [76, 2], [72, 2], [79, 10]], step, { duty: 0.125, vol: 0.035 });
        tune([[48, 6], [55, 4], [48, 10], [53, 4], [55, 2], [48, 10]], step, { tri: true, vol: 0.14 });
      },
    };
    return {
      names: Object.keys(fx),
      get on() { return on; },
      toggle() {
        on = !on;
        if (on && !ctx) {
          try { ctx = new (window.AudioContext || window.webkitAudioContext)(); out = ctx.createGain(); out.connect(ctx.destination); chip = makeChip(ctx); }
          catch { on = false; ctx = null; }
        }
        if (on) { ctx.resume(); fx.go(); }
        return on;
      },
      play(name) { if (!on || !ctx) return; try { fx[name] && fx[name](); } catch {} },
      // render one effect without playing it (sound test page and level checks): resolves to an AudioBuffer
      render(name, seconds = 3) {
        const keep = [ctx, chip, out], off = new OfflineAudioContext(1, Math.ceil(seconds * 44100), 44100);
        ctx = off; chip = makeChip(off); out = off.destination;
        try { fx[name](); } finally { [ctx, chip, out] = keep; }
        return off.startRendering();
      },
    };
  })();

  return { setArt, loadArt, TUNE, RULES, REACTIONS, COLORS, BRAIN_COL, PARTS, MAXW, WEIGHT_CLASSES, partsTooHeavy, SLOTS, clamp, statsOf, cleanName, sanitizeBot, codeOf, parseCode, rng, simulate, explainBattle,
    fit, rr, shade, ease, bigText, FX, drawBot, portrait, Sound, RM };
});
