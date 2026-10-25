/* Robot Racer page: the garage, one lap on a pseudo-3D track, the lap report, ghost cars and the class leaderboard.
   The physics is race.js (shared with the server). The lap runs in fixed 1/60 s steps and records one letter per
   step, so the report, the ghost and the server's check all drive exactly the same lap again. */
(function () {
  const E = window.Engine, R = window.Race;
  const { clamp, bigText, rr, Sound, RM, FX } = E;
  const $ = (id) => document.getElementById(id);
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const T = R.TRACK, N = T.segs.length, L = T.LENGTH, SEG = T.SEG;
  const kmh = (v) => Math.round(v * 3.6);
  const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
  const nameOf = (su) => `${R.GEARS[su.gear]}:1 · ${R.TIRES[su.tire].n}`;

  let setup = R.clampSetup(ls.get("race-setup", { gear: 1, tire: 1 }));
  let best = ls.get("race-best", null); // { time, setup, inputs }: drive it again in case the physics changed
  if (best) { const r = best.inputs && R.lap(best.setup, best.inputs); if (r && r.finished) best.time = r.time; else best = null; }
  const saved = ls.get("ba-bot", null) || ls.get("rba-bot", null);
  const carColor = E.COLORS[(saved && saved.color) | 0] || E.COLORS[0];

  // ---------------- garage ----------------
  const all = R.GEARS.map((_, g) => R.TIRES.map((_, t) => R.setupStats({ gear: g, tire: t })));
  const flat = all.flat(), top = (k) => Math.max(...flat.map((s) => s[k]));
  const scale = { top: top("top"), hill: top("hill"), push: top("push"), corner: top("corner") };
  function renderGarage() {
    const busy = state === "countdown" || state === "race";
    const opts = (el, list, key, label, sub, tip) => {
      $(el).innerHTML = "";
      list.forEach((item, i) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "opt"; b.disabled = busy;
        b.setAttribute("aria-pressed", setup[key] === i); b.innerHTML = "<b></b><span></span>";
        b.firstChild.textContent = label(item, i); b.lastChild.textContent = sub(item, i); b.setAttribute("data-tip", tip(item, i));
        b.onclick = () => { setup[key] = i; ls.set("race-setup", setup); Sound.play("click"); renderGarage(); };
        $(el).appendChild(b);
      });
    };
    opts("o-gear", R.GEARS, "gear", (g) => `${g}:1`, (g, i) => `${kmh(all[i][setup.tire].top)} km/h`,
      (g, i) => `${g}:1 gear: the motor turns ${g} times per wheel turn. Top speed ${kmh(all[i][setup.tire].top)} km/h, climbs the Big Hill at ${kmh(all[i][setup.tire].hill)} km/h.`);
    opts("o-tire", R.TIRES, "tire", (t) => t.n, (t) => `grip ${t.mu}`, (t) => `${t.n} tires: ${t.d}.`);
    const g = R.GEARS[setup.gear], st = all[setup.gear][setup.tire];
    $("d-gear").textContent = `${g}:1 means the motor turns ${g} times for every turn of the wheels. ${setup.gear === 0 ? "The fastest on straights, but the weakest on hills." : setup.gear === R.GEARS.length - 1 ? "The strongest push, but a low top speed." : "A balance of speed and pushing force."}`;
    $("d-tire").textContent = R.TIRES[setup.tire].d + ".";
    const rows = [
      ["Top speed", st.top, scale.top, kmh(st.top) + " km/h", "var(--blue)", "The fastest the car goes on flat ground: where the motor reaches its top rpm."],
      ["Big Hill", st.hill, scale.hill, kmh(st.hill) + " km/h", "var(--good)", "The steady speed the car can hold up the 30% Big Hill. Low gears run out of torque here."],
      ["Push", st.push, scale.push, st.push + " N", "var(--orange)", "How hard the wheels push when starting from a stop (the motor's torque times the gear ratio, up to what the tires can grip)."],
      ["Hairpin", st.corner, scale.corner, kmh(st.corner) + " km/h", "var(--purple)", "The fastest the tires can hold the tight Hairpin. Any faster and the car slides onto the grass."],
    ];
    $("gstats").innerHTML = rows.map(([l, v, mx, txt, c, tip]) => `<span class="hastip" tabindex="0" data-tip="${tip}">${l}</span><div class="bar"><i style="width:${clamp((v / mx) * 100, 4, 100)}%;background:${c}"></i></div><span class="n">${txt}</span>`).join("");
    $("bestline").innerHTML = best ? `Your best lap: <b>${fmtTime(best.time)}</b> (${nameOf(best.setup)})` : "No laps yet. Your best lap becomes your ghost car.";
  }

  // ---------------- the race ----------------
  let state = "garage"; // garage | countdown | race | done
  let car = R.newCar(), inputs = "", acc = 0, cd = 0, doneT = 0, lastLap = null;
  let ghost = null, ghostSrc = null, ghostLabel = "your best", wallT = 0, secShown = -1, toast = { text: "", t: 0 };
  const fx = new FX();
  const keys = { left: false, right: false, gas: false, brake: false };
  const input = () => ({ steer: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), gas: keys.gas ? 1 : 0, brake: keys.brake ? 1 : 0 });
  // a ghost is a lap driven again: its position at every step
  function makeGhost(src) {
    if (!src || !src.inputs) return null;
    const su = R.clampSetup(src.setup), c = R.newCar(), pos = [];
    for (const ch of src.inputs) { const i = R.decode(ch); if (!i) break; R.step(c, su, i); pos.push(c.z, c.x); if (c.z >= L) break; }
    return { pos, steps: pos.length / 2, time: src.time };
  }
  function start() {
    if (state === "countdown" || state === "race") return;
    car = R.newCar(); inputs = ""; acc = 0; cd = 3; secShown = -1; fx.p = []; fx.txt = [];
    ghost = $("ghost").checked ? makeGhost(ghostSrc || best) : null;
    state = "countdown"; $("report").innerHTML = ""; $("go").disabled = true; $("quit").disabled = false;
    renderGarage(); Sound.play("beep");
    try { $("road").scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "nearest" }); } catch {}
  }
  function stop() { state = "garage"; car = R.newCar(); inputs = ""; $("go").disabled = false; $("go").textContent = "Start race"; $("quit").disabled = true; renderGarage(); }
  function finish() {
    state = "done"; doneT = 0;
    const r = R.lap(setup, inputs); // the recorded lap, driven again: the same numbers the server would get
    lastLap = { setup: { ...setup }, inputs, time: r.time };
    const isBest = r.finished && (!best || r.time < best.time);
    if (isBest) { best = { time: r.time, setup: { ...setup }, inputs }; ls.set("race-best", best); }
    Sound.play(isBest ? "fanfare" : "win");
    showReport(r, isBest);
    $("go").disabled = false; $("go").textContent = "Race again"; $("quit").disabled = true; renderGarage();
  }
  $("go").onclick = start;
  $("quit").onclick = () => { Sound.play("click"); stop(); };

  function showReport(r, isBest) {
    const e = R.explain(setup, r), rep = $("report"); rep.innerHTML = "";
    const hd = document.createElement("div"); hd.className = "headline" + (isBest ? " good" : "");
    hd.textContent = `Lap time ${fmtTime(r.time)}${isBest ? "  · New best lap!" : best ? `  · best ${fmtTime(best.time)}` : ""}`;
    rep.appendChild(hd);
    const vTop = Math.max(...r.sec.map((s) => s.vMax));
    const nums = document.createElement("div"); nums.className = "nums";
    nums.innerHTML = `<div><b>${fmtTime(r.time)}</b><span>lap time</span></div><div><b>${kmh(vTop)} km/h</b><span>fastest moment</span></div><div><b>${r.off.toFixed(1)} s</b><span>on the grass</span></div><div><b>${nameOf(setup)}</b><span>setup</span></div>`;
    rep.appendChild(nums);
    e.items.forEach((it, i) => {
      const d = document.createElement("div"); d.className = "finding " + it.tone; d.style.animationDelay = i * 0.06 + "s";
      d.innerHTML = `<span class="ic">${it.tone === "good" ? "✓" : it.tone === "bad" ? "✗" : "i"}</span><div><h4></h4><p></p></div>`;
      d.querySelector("h4").textContent = it.title; d.querySelector("p").textContent = it.text;
      rep.appendChild(d);
    });
    const tip = document.createElement("div"); tip.className = "tipbox"; tip.innerHTML = "<b>Try this next</b><span></span>"; tip.lastChild.textContent = e.tip;
    rep.appendChild(tip);
    const ctl = document.createElement("div"); ctl.className = "repctl";
    const again = document.createElement("button"); again.type = "button"; again.className = "btn"; again.textContent = "Race again"; again.setAttribute("data-tip", "Line up and race another lap.");
    again.onclick = start; ctl.appendChild(again);
    if (cls.on) {
      const send = document.createElement("button"); send.type = "button"; send.className = "btn ghost"; send.textContent = "Send to the class leaderboard";
      send.setAttribute("data-tip", "Send this lap to your class's game. The server drives it again to check the time, and keeps your fastest.");
      const msg = document.createElement("span"); msg.className = "small";
      send.onclick = () => cls.submit(lastLap, (m) => { msg.textContent = m; send.disabled = true; });
      ctl.append(send, msg);
    }
    rep.appendChild(ctl);
  }

  // ---------------- controls ----------------
  const KEYS = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "gas", KeyW: "gas", ArrowDown: "brake", KeyS: "brake" };
  addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    const k = KEYS[e.code];
    if (k) { keys[k] = true; if (state === "race" || state === "countdown") e.preventDefault(); }
    if (e.key === "Enter" && (state === "garage" || state === "done") && !(e.target.closest && e.target.closest("button, a"))) start();
  });
  addEventListener("keyup", (e) => { const k = KEYS[e.code]; if (k) keys[k] = false; });
  addEventListener("blur", () => Object.keys(keys).forEach((k) => (keys[k] = false)));
  document.querySelectorAll("#touch button").forEach((b) => {
    const k = b.dataset.k, set = (v) => (e) => { e.preventDefault(); keys[k] = v; b.classList.toggle("on", v); };
    b.addEventListener("pointerdown", set(true));
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, set(false)));
  });
  $("touch").hidden = !matchMedia("(pointer: coarse)").matches;
  $("road").addEventListener("touchstart", () => ($("touch").hidden = false), { passive: true });
  $("sound").onclick = () => { const on = Sound.toggle(); $("sound").textContent = "Sound: " + (on ? "on" : "off"); $("sound").setAttribute("aria-pressed", on); };

  // ---------------- class leaderboard ----------------
  // In a class game (saved game pass), laps go to the game's leaderboard. The server re-drives each lap to check it.
  const cls = (() => {
    const socket = window.baSocket; let who = null, board = [];
    try { const s = JSON.parse(localStorage.getItem("ba-session")); if (s && s.code && s.playerId && s.token) who = { code: s.code, playerId: s.playerId, token: s.token }; } catch {}
    if (!socket || !who) return { on: false, submit() {} };
    function render() {
      $("classp").hidden = false;
      $("classmsg").textContent = board.length ? "The fastest lap from each student in your class's game. Press Ghost to race against one." : "No class laps yet. Finish a lap and send it in!";
      $("board").innerHTML = "";
      board.forEach((b, i) => {
        const li = document.createElement("li"); if (b.id === who.playerId) li.className = "me";
        li.innerHTML = `<span class="rk">#${i + 1}</span><span class="nm"></span><span class="tm">${fmtTime(b.time)}</span><button class="btn ghost" type="button" data-tip="Race against this lap as your ghost car.">Ghost</button>`;
        const nm = li.querySelector(".nm"); nm.textContent = b.builder; const sm = document.createElement("small"); sm.textContent = nameOf(b.setup); nm.appendChild(sm);
        li.querySelector("button").onclick = () => socket.emit("race:ghost", { who, id: b.id }, (r) => {
          if (!r || !r.ok) return;
          ghostSrc = { setup: r.setup, inputs: r.inputs, time: r.time }; ghostLabel = b.id === who.playerId ? "your class lap" : b.builder;
          $("ghost").checked = true; Sound.play("click");
          $("classmsg").textContent = `Next race: the ghost car drives ${ghostLabel === "your class lap" ? "your class lap" : `${b.builder}'s lap`} (${fmtTime(b.time)}).`;
        });
        $("board").appendChild(li);
      });
    }
    socket.on("connect", () => socket.emit("race:check", { who }, (r) => { if (r && r.ok) { board = r.board; render(); } }));
    socket.on("race:board", (b) => { board = b; render(); });
    return {
      on: true,
      submit(lap, done) {
        socket.emit("race:submit", { who, setup: lap.setup, inputs: lap.inputs }, (r) => done(r && r.ok ? (r.kept ? `Sent! You're #${r.rank} in your class.` : `Checked: ${fmtTime(r.time)}. Your class best (${fmtTime(r.best)}) is still faster.`) : (r && r.error) || "Couldn't send it. Try again."));
      },
    };
  })();

  // ---------------- drawing ----------------
  const CAM_H = 1.7, CAM_BACK = 4.4, DRAW = 150, DEPTH = 1 / Math.tan((96 / 2) * Math.PI / 180), BEND = 0.65;
  function roadY(z) { const zz = ((z % L) + L) % L, i = Math.floor(zz / SEG), f = zz / SEG - i; return T.segs[i].y + (T.segs[(i + 1) % N].y - T.segs[i].y) * f; }
  const scenery = (() => { // trees, signs and cones, fixed for the track (seeded, so it's the same every time)
    const rnd = E.rng(11), out = T.segs.map(() => []);
    T.segs.forEach((_, i) => {
      if (i % 3 === 0) out[i].push({ k: "tree", x: (rnd() < 0.5 ? -1 : 1) * (R.WALL + 2 + rnd() * 10), s: 0.8 + rnd() * 0.7 });
      if (i % 9 === 4) out[i].push({ k: "tree", x: -(R.WALL + 2 + rnd() * 6), s: 0.7 + rnd() * 0.5 }, { k: "tree", x: R.WALL + 2 + rnd() * 6, s: 0.7 + rnd() * 0.5 });
    });
    T.SECTIONS.forEach((sec, si) => {
      const first = T.segs.findIndex((s) => s.sec === si), prev = T.SECTIONS[si - 1];
      if (sec.k && Math.abs(sec.k) >= 1 / 20 && !(prev && prev.n === sec.n)) for (let j = 1; j <= 4; j++) out[(first - j * 2 + N) % N].push({ k: "chevron", x: (sec.k > 0 ? -1 : 1) * (R.ROAD + 1.3), dir: sec.k > 0 ? 1 : -1 });
      if (sec.n === "Big Hill") out[(first - 10 + N) % N].push({ k: "sign", x: R.ROAD + 1.6, text: "BIG HILL 30%" });
      if (sec.n === "Hairpin") for (let j = 0; j < sec.len / SEG; j += 2) out[(first + j) % N].push({ k: "cone", x: (sec.k > 0 ? 1 : -1) * (R.ROAD + 0.4) });
    });
    out[2].push({ k: "gantry" });
    return out;
  })();
  let bgX = 0;
  function P(x, y, z, camX, camY, half, horizon) { const s = DEPTH / z, ppm = s * half; return { sx: half + (x - camX) * ppm, sy: horizon + (camY - y) * ppm, ppm }; }
  function quad(ctx, c, x1, y1, x2, y2, x3, y3, x4, y4) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill(); }

  function draw(t, dt) {
    const c = $("road"); if (!c.offsetParent) return;
    const { ctx, w, h } = E.fit(c), half = w / 2, horizon = h * 0.43;
    const camZ = car.z - CAM_BACK, camX = car.x * 0.7, camY = roadY(car.z) + CAM_H;
    fx.update(dt);
    // sky, sun, far hills and a skyline that slide sideways in the corners
    const sky = ctx.createLinearGradient(0, 0, 0, horizon); sky.addColorStop(0, "#151330"); sky.addColorStop(0.65, "#4a2f57"); sky.addColorStop(1, "#d2683d");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffd88a"; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(w * 0.72 - (bgX * 0.2) % w, horizon * 0.62, h * 0.06, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    hills(ctx, w, horizon, h, bgX * 0.15, "#2c2140", 0.11, 1.7);
    hills(ctx, w, horizon, h, bgX * 0.35, "#221a30", 0.07, 2.9);
    // the road, near to far; a hill crest hides what's behind it
    const cz = ((camZ % L) + L) % L, base = Math.floor(cz / SEG), pct = (cz % SEG) / SEG;
    let x = 0, dx = -T.segs[base].k * SEG * SEG * BEND * pct, maxy = h;
    const proj = new Array(DRAW);
    for (let n = 0; n < DRAW; n++) {
      const i = (base + n) % N, s = T.segs[i], z1 = (n - pct) * SEG, z2 = z1 + SEG;
      const y1 = s.y, y2 = T.segs[(i + 1) % N].y;
      const p1 = z1 > 0.3 ? P(x, y1, z1, camX, camY, half, horizon) : null, p2 = P(x + dx, y2, z2, camX, camY, half, horizon);
      proj[n] = p1 && { i, ...p1, clip: maxy };
      x += dx; dx += s.k * SEG * SEG * BEND;
      if (!p1 || p2.sy >= p1.sy || p2.sy >= maxy) continue;
      const alt = Math.floor(i / 3) % 2;
      ctx.fillStyle = alt ? "#2f6b3c" : "#2a6236"; ctx.fillRect(0, p2.sy, w, p1.sy - p2.sy + 1);
      const r1 = R.ROAD * p1.ppm, r2 = R.ROAD * p2.ppm, u1 = 0.55 * p1.ppm, u2 = 0.55 * p2.ppm;
      quad(ctx, alt ? "#f4f1ea" : "#f46524", p1.sx - r1 - u1, p1.sy, p1.sx - r1, p1.sy, p2.sx - r2, p2.sy, p2.sx - r2 - u2, p2.sy);
      quad(ctx, alt ? "#f4f1ea" : "#f46524", p1.sx + r1, p1.sy, p1.sx + r1 + u1, p1.sy, p2.sx + r2 + u2, p2.sy, p2.sx + r2, p2.sy);
      quad(ctx, alt ? "#4b4753" : "#46424e", p1.sx - r1, p1.sy, p1.sx + r1, p1.sy, p2.sx + r2, p2.sy, p2.sx - r2, p2.sy);
      if (alt) { const l1 = 0.1 * p1.ppm, l2 = 0.1 * p2.ppm; quad(ctx, "#e9e3d4", p1.sx - l1, p1.sy, p1.sx + l1, p1.sy, p2.sx + l2, p2.sy, p2.sx - l2, p2.sy); }
      if (i === 0 || i === N - 1) { // checkered start/finish line
        const cells = 10; for (let k = 0; k < cells; k++) for (let rI = 0; rI < 2; rI++) {
          const a = -1 + (k / cells) * 2, b = -1 + ((k + 1) / cells) * 2, ya = p1.sy + (p2.sy - p1.sy) * (rI / 2), yb = p1.sy + (p2.sy - p1.sy) * ((rI + 1) / 2);
          const xa = p1.sx + (p2.sx - p1.sx) * (rI / 2), xb = p1.sx + (p2.sx - p1.sx) * ((rI + 1) / 2), ra = r1 + (r2 - r1) * (rI / 2), rb = r1 + (r2 - r1) * ((rI + 1) / 2);
          quad(ctx, (k + rI) % 2 ? "#141316" : "#f4f1ea", xa + a * ra, ya, xa + b * ra, ya, xb + b * rb, yb, xb + a * rb, yb);
        }
      }
      // low walls at the edge of the grass
      const wh1 = 0.7 * p1.ppm, wh2 = 0.7 * p2.ppm, wa = R.WALL * p1.ppm, wb = R.WALL * p2.ppm;
      quad(ctx, alt ? "#6d6875" : "#5c5864", p1.sx - wa, p1.sy, p1.sx - wa, p1.sy - wh1, p2.sx - wb, p2.sy - wh2, p2.sx - wb, p2.sy);
      quad(ctx, alt ? "#6d6875" : "#5c5864", p1.sx + wa, p1.sy, p1.sx + wa, p1.sy - wh1, p2.sx + wb, p2.sy - wh2, p2.sx + wb, p2.sy);
      maxy = p2.sy;
    }
    // scenery and the ghost car, far to near
    const gp = ghostPos();
    let gn = -1, gf = 0;
    if (gp) { const d = gp.z - camZ; if (d > 1 && d < (DRAW - 2) * SEG) { gn = Math.floor(d / SEG + pct); gf = d / SEG + pct - gn; } }
    for (let n = DRAW - 2; n >= 1; n--) {
      const pr = proj[n]; if (!pr) continue;
      for (const sp of scenery[pr.i]) sprite(ctx, sp, pr, w);
      if (n === gn && proj[n + 1]) {
        const a = pr, b = proj[n + 1], sx = a.sx + (b.sx - a.sx) * gf, sy = a.sy + (b.sy - a.sy) * gf, ppm = a.ppm + (b.ppm - a.ppm) * gf;
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, a.clip); ctx.clip();
        kart(ctx, sx + gp.x * ppm, sy, 1.5 * ppm, "#9fd8ff", { alpha: 0.45 });
        ctx.restore();
      }
    }
    // your car
    const s0 = DEPTH / CAM_BACK, cx = half + (car.x - camX) * s0 * half, cy = horizon + CAM_H * s0 * half;
    const off = Math.abs(car.x) > R.ROAD && car.v > 1, inp = state === "race" ? input() : { steer: 0, brake: 0 };
    const bump = off && !RM ? Math.sin(t * 40) * 2 : 0;
    if (off && !RM && Math.random() < 0.5) fx.burst(cx + (Math.random() - 0.5) * 30, cy, 1, { colors: ["#7a5a3a", "#a1825e"], kind: "dust", speed: 60, g: -20, life: 0.8, size: 6, angle: -Math.PI / 2, spread: 1.2 });
    if (car.wall && state === "race" && Math.abs(car.x) >= R.WALL - 0.01 && car.v > 2 && t - wallT > 0.35) { wallT = t; Sound.play("hit"); if (!RM) fx.burst(cx + Math.sign(car.x) * 40, cy - 10, 8, { colors: ["#ffd23f", "#fff6c8"], speed: 200, g: 300, life: 0.4, size: 3 }); }
    kart(ctx, cx, cy + bump, 1.5 * s0 * half, carColor, { steer: inp.steer, brake: inp.brake || state === "done" });
    fx.draw(ctx);
    hud(ctx, w, h, t, dt);
    if (state === "race" || state === "done") bgX += segAtCar().k * car.v * dt * 900;
  }
  const segAtCar = () => T.segAt(car.z);
  function hills(ctx, w, horizon, h, off, col, amp, seed) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, horizon + 1);
    const step = w / 12, o = ((off % w) + w) % w;
    for (let k = -1; k <= 13; k++) { const xx = k * step - (o % step), id = k + Math.floor(o / step); ctx.lineTo(xx, horizon - h * amp * (0.35 + 0.65 * Math.abs(Math.sin(id * seed)))); }
    ctx.lineTo(w, horizon + 1); ctx.closePath(); ctx.fill();
  }
  function sprite(ctx, sp, pr, w) {
    const sx = pr.sx + (sp.x || 0) * pr.ppm, sy = pr.sy, m = pr.ppm;
    if (sx < -200 || sx > w + 200 || m < 0.4) return;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, pr.clip); ctx.clip();
    if (sp.k === "tree") {
      const s = sp.s * m;
      ctx.fillStyle = "#4a3324"; ctx.fillRect(sx - 0.18 * s, sy - 1.2 * s, 0.36 * s, 1.2 * s);
      ctx.fillStyle = "#1f4d2c"; for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(sx, sy - (4.6 - j * 1.1) * s); ctx.lineTo(sx + (1.5 - j * 0.15) * s, sy - (1.6 - j * 0.2) * s - j * 0.9 * s); ctx.lineTo(sx - (1.5 - j * 0.15) * s, sy - (1.6 - j * 0.2) * s - j * 0.9 * s); ctx.closePath(); ctx.fill(); }
    } else if (sp.k === "cone") {
      ctx.fillStyle = "#f46524"; ctx.beginPath(); ctx.moveTo(sx, sy - 0.6 * m); ctx.lineTo(sx + 0.2 * m, sy); ctx.lineTo(sx - 0.2 * m, sy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#f4f1ea"; ctx.fillRect(sx - 0.1 * m, sy - 0.34 * m, 0.2 * m, 0.08 * m);
    } else if (sp.k === "chevron") {
      ctx.fillStyle = "#3a3842"; ctx.fillRect(sx - 0.05 * m, sy - 1.2 * m, 0.1 * m, 1.2 * m);
      ctx.fillStyle = "#ffd23f"; rr(ctx, sx - 0.6 * m, sy - 1.9 * m, 1.2 * m, 0.8 * m, 0.08 * m); ctx.fill();
      ctx.strokeStyle = "#141316"; ctx.lineWidth = Math.max(1.5, 0.12 * m); ctx.beginPath();
      for (const o of [-0.22, 0.12]) { ctx.moveTo(sx + (o - 0.1 * sp.dir) * m, sy - 1.75 * m); ctx.lineTo(sx + (o + 0.12 * sp.dir) * m, sy - 1.5 * m); ctx.lineTo(sx + (o - 0.1 * sp.dir) * m, sy - 1.25 * m); }
      ctx.stroke();
    } else if (sp.k === "sign") {
      ctx.fillStyle = "#3a3842"; ctx.fillRect(sx - 0.06 * m, sy - 1.6 * m, 0.12 * m, 1.6 * m);
      ctx.fillStyle = "#f4f1ea"; rr(ctx, sx - 1.5 * m, sy - 2.5 * m, 3 * m, 1 * m, 0.1 * m); ctx.fill();
      ctx.fillStyle = "#c84a12"; ctx.font = `700 ${Math.max(6, 0.5 * m)}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(sp.text, sx, sy - 2 * m);
    } else if (sp.k === "gantry") {
      const lx = pr.sx - (R.ROAD + 1) * m, rx = pr.sx + (R.ROAD + 1) * m;
      ctx.fillStyle = "#2b2a30"; ctx.fillRect(lx - 0.15 * m, sy - 4.2 * m, 0.3 * m, 4.2 * m); ctx.fillRect(rx - 0.15 * m, sy - 4.2 * m, 0.3 * m, 4.2 * m);
      ctx.fillStyle = "#f46524"; ctx.fillRect(lx, sy - 4.6 * m, rx - lx, 0.9 * m);
      ctx.fillStyle = "#141316"; ctx.font = `700 ${Math.max(6, 0.55 * m)}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("FALL ROBOTICS ACADEMY · ROBOT RACER", pr.sx, sy - 4.15 * m);
    }
    ctx.restore(); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  }
  // a robot kart seen from behind; x, y is the middle of the ground under it, size is its width in pixels
  function kart(ctx, x, y, size, color, o = {}) {
    ctx.save(); ctx.globalAlpha = o.alpha == null ? 1 : o.alpha; ctx.translate(x, y); ctx.rotate((o.steer || 0) * 0.05);
    const s = size;
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.62, s * 0.1, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#1b1a1e"; rr(ctx, -s * 0.56, -s * 0.42, s * 0.26, s * 0.42, s * 0.06); ctx.fill(); rr(ctx, s * 0.3, -s * 0.42, s * 0.26, s * 0.42, s * 0.06); ctx.fill();
    ctx.fillStyle = "#3a3842"; ctx.fillRect(-s * 0.5, -s * 0.3, s * 0.14, s * 0.05); ctx.fillRect(s * 0.36, -s * 0.3, s * 0.14, s * 0.05);
    ctx.fillStyle = color; ctx.strokeStyle = "#141316"; ctx.lineWidth = Math.max(1.5, s * 0.025);
    ctx.beginPath(); ctx.moveTo(-s * 0.34, -s * 0.08); ctx.lineTo(s * 0.34, -s * 0.08); ctx.lineTo(s * 0.28, -s * 0.44); ctx.lineTo(-s * 0.28, -s * 0.44); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = o.brake ? "#ff3b3b" : "#8a1f1f"; ctx.fillRect(-s * 0.26, -s * 0.2, s * 0.12, s * 0.06); ctx.fillRect(s * 0.14, -s * 0.2, s * 0.12, s * 0.06);
    if (o.brake && !o.alpha) { ctx.fillStyle = "rgba(255,60,60,.25)"; ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.17, s * 0.12, 0, 7); ctx.arc(s * 0.2, -s * 0.17, s * 0.12, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#d9d5de"; rr(ctx, -s * 0.16, -s * 0.72, s * 0.32, s * 0.28, s * 0.05); ctx.fill(); ctx.stroke(); // robot head, from behind
    ctx.fillStyle = "#8a8692"; for (let k = 0; k < 3; k++) ctx.fillRect(-s * 0.1, -s * 0.66 + k * s * 0.07, s * 0.2, s * 0.025);
    ctx.strokeStyle = "#d9d5de"; ctx.beginPath(); ctx.moveTo(0, -s * 0.72); ctx.lineTo(0, -s * 0.86); ctx.stroke();
    ctx.fillStyle = "#ff5d5d"; ctx.beginPath(); ctx.arc(0, -s * 0.88, s * 0.03, 0, 7); ctx.fill();
    ctx.fillStyle = "#141316"; ctx.fillRect(-s * 0.36, -s * 0.5, s * 0.72, s * 0.05); // rear wing
    ctx.restore();
  }
  function ghostPos() {
    if (!ghost) return null;
    const k = state === "race" || state === "done" ? Math.min(inputs.length, ghost.steps) - 1 : -1;
    if (k < 0) return state === "countdown" ? { z: 0, x: 0 } : null;
    if (inputs.length > ghost.steps) return null; // it already finished
    return { z: ghost.pos[2 * k], x: ghost.pos[2 * k + 1] };
  }
  function hud(ctx, w, h, t, dt) {
    const fs = Math.max(12, Math.round(h * 0.04));
    const panel = (x, y, ww, hh) => { ctx.fillStyle = "rgba(20,19,22,.62)"; rr(ctx, x, y, ww, hh, 10); ctx.fill(); };
    const time = state === "race" ? inputs.length * R.DT : state === "done" && lastLap ? lastLap.time || 0 : 0;
    // time
    panel(12, 12, fs * 7.6, fs * 2.9);
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.font = `600 ${Math.round(fs * 0.55)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0"; ctx.fillText("LAP", 22, 12 + fs * 0.85);
    ctx.font = `700 ${Math.round(fs * 1.2)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#fff"; ctx.fillText(fmtTime(time), 22, 12 + fs * 2.05);
    ctx.font = `600 ${Math.round(fs * 0.55)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#ffd23f"; ctx.fillText(best ? "BEST " + fmtTime(best.time) : "NO BEST YET", 22, 12 + fs * 2.65);
    // speed and motor
    const rpmF = clamp(car.rpm / R.MOTOR.rpm, 0, 1.2), bw = fs * 8.6, bx = w - 12 - bw;
    panel(bx, 12, bw, fs * 3.4);
    ctx.textAlign = "right"; ctx.font = `700 ${Math.round(fs * 1.25)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#fff"; ctx.fillText(kmh(car.v) + " km/h", w - 22, 12 + fs * 1.35);
    ctx.fillStyle = "#26252b"; rr(ctx, bx + 10, 12 + fs * 1.8, bw - 20, fs * 0.5, 4); ctx.fill();
    ctx.fillStyle = rpmF >= 0.97 ? "#ff5d5d" : rpmF > 0.8 ? "#ffd23f" : "#4fd18b"; rr(ctx, bx + 10, 12 + fs * 1.8, (bw - 20) * Math.min(1, rpmF), fs * 0.5, 4); ctx.fill();
    ctx.font = `600 ${Math.round(fs * 0.5)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0";
    ctx.textAlign = "left"; ctx.fillText(`MOTOR ${rpmF >= 0.97 ? "MAX RPM" : Math.round(car.rpm).toLocaleString("en-US") + " rpm"}`, bx + 10, 12 + fs * 2.95);
    ctx.textAlign = "right"; ctx.fillStyle = "#f4f1ea"; ctx.fillText(`${R.GEARS[setup.gear]}:1`, w - 22, 12 + fs * 2.95);
    // lap progress, with the ghost
    const px = w * 0.3, pw = w * 0.4, py = 18;
    ctx.fillStyle = "rgba(20,19,22,.62)"; rr(ctx, px - 6, py - 6, pw + 12, fs * 0.9, 8); ctx.fill();
    ctx.fillStyle = "#3a3842"; ctx.fillRect(px, py + fs * 0.2, pw, 3);
    T.SECTIONS.forEach((s, si) => { if (s.n === "Big Hill" || s.n === "Hairpin") { const a = T.segs.findIndex((g) => g.sec === si) * SEG / L; ctx.fillStyle = s.n === "Big Hill" ? "#4fd18b" : "#c58cff"; ctx.fillRect(px + a * pw, py + fs * 0.2 - 2, (s.len / L) * pw, 7); } });
    const gp = ghostPos();
    if (gp) { ctx.fillStyle = "#9fd8ff"; ctx.beginPath(); ctx.arc(px + clamp(gp.z / L, 0, 1) * pw, py + fs * 0.25, fs * 0.22, 0, 7); ctx.fill(); }
    ctx.fillStyle = carColor; ctx.strokeStyle = "#141316"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px + clamp(car.z / L, 0, 1) * pw, py + fs * 0.25, fs * 0.26, 0, 7); ctx.fill(); ctx.stroke();
    if (gp && state === "race") {
      const d = gp.z - car.z;
      ctx.font = `600 ${Math.round(fs * 0.5)}px "JetBrains Mono", monospace`; ctx.textAlign = "center"; ctx.fillStyle = "#9fd8ff";
      ctx.fillText(`GHOST (${ghostLabel}) ${Math.abs(d) < 1 ? "side by side" : `${Math.round(Math.abs(d))} m ${d > 0 ? "ahead" : "behind"}`}`, w / 2, py + fs * 1.3);
    }
    // section names as you reach them
    const sec = segAtCar().sec;
    if ((state === "race") && sec !== secShown) { const nm = T.SECTIONS[sec].n; if (secShown < 0 || T.SECTIONS[secShown].n !== nm) toast = { text: nm.toUpperCase(), t: 2 }; secShown = sec; }
    if (toast.t > 0) { toast.t -= dt; bigText(ctx, toast.text, w / 2, h * 0.27, h * 0.06, "#ffd23f", 1, clamp(toast.t, 0, 1)); }
    if (state === "race" && Math.abs(car.x) > R.ROAD && car.v > 1) bigText(ctx, "ON THE GRASS!", w / 2, h * 0.36, h * 0.045, "#ff8a50");
    if (state === "countdown") {
      const n = Math.ceil(cd);
      bigText(ctx, n > 0 ? String(n) : "GO!", w / 2, h * 0.32, h * 0.18, n > 0 ? "#f4f1ea" : "#4fd18b", 1 + (cd % 1) * 0.25);
    }
    if (state === "garage") bigText(ctx, "PICK YOUR SETUP, THEN START RACE", w / 2, h * 0.3, h * 0.05, "rgba(255,255,255,.8)");
    if (state === "done" && lastLap) bigText(ctx, lastLap.time != null ? "FINISH! " + fmtTime(lastLap.time) : "FINISH!", w / 2, h * 0.3, h * 0.085, "#4fd18b", Math.min(1, 0.6 + doneT * 2));
    ctx.textAlign = "left";
  }

  // ---------------- loop ----------------
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (state === "countdown") {
      const before = Math.ceil(cd); cd -= dt; const after = Math.ceil(cd);
      if (after !== before && after > 0) Sound.play("beep");
      if (cd <= 0) { state = "race"; acc = 0; Sound.play("go"); }
    } else if (state === "race") {
      acc += dt; let n = 0;
      while (acc >= R.DT && n++ < 8) {
        const i = input(); inputs += R.encode(i); R.step(car, setup, i); acc -= R.DT;
        if (car.z >= L) { finish(); break; }
        if (inputs.length >= R.MAX_STEPS) { stop(); $("report").innerHTML = '<p class="tipbox"><b>Out of time</b><span>A lap has to finish within 3 minutes. Try a different setup.</span></p>'; break; }
      }
    } else if (state === "done") {
      doneT += dt; acc += dt;
      while (acc >= R.DT) { R.step(car, setup, { steer: 0, gas: 0, brake: 1 }); acc -= R.DT; } // roll to a stop past the line
    }
    try { draw(now / 1000, dt); } catch (err) { console.error(err); }
    requestAnimationFrame(loop);
  })(last);
  renderGarage();
  window.__race = { get state() { return state; }, get car() { return car; }, get inputs() { return inputs; }, start, keys, setSetup(s) { setup = R.clampSetup(s); renderGarage(); } };
})();
