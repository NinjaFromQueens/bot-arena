/* Flying Car Lab: build a car, pick a mission, launch, and read the flight report. */
(function () {
  const E = window.Engine, F = window.Flight;
  const { clamp, ease, bigText, rr, FX, Sound, RM } = E;
  const $ = (id) => document.getElementById(id);
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  let design = F.clampDesign(ls.get("fcl-design", F.DEFAULT_DESIGN));
  let mIdx = clamp(ls.get("fcl-mission", 0) | 0, 0, F.MISSIONS.length - 1);
  let stars = ls.get("fcl-stars", {});
  let run = null, lastResult = null, prevResult = null;
  const fx = new FX();
  const mission = () => F.MISSIONS[mIdx];

  // ---------------- missions ----------------
  function starStr(arr) { return arr.map((s) => (s ? "<b>★</b>" : "☆")).join(""); }
  function renderMissions() {
    const el = $("missions"); el.innerHTML = "";
    F.MISSIONS.forEach((m, i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "mcard"; b.setAttribute("aria-pressed", i === mIdx);
      b.innerHTML = `<span class="num">MISSION ${i + 1}</span><span class="nm"></span><span class="stars">${starStr(stars[m.id] || [false, false, false])}</span>`;
      b.querySelector(".nm").textContent = m.n;
      b.onclick = () => { mIdx = i; ls.set("fcl-mission", i); Sound.play("click"); stopRun(); renderMissions(); renderGoal(); renderSheet(); $("report").innerHTML = ""; prevResult = null; lastResult = null; $("replay").disabled = true; };
      el.appendChild(b);
    });
    const cur = el.children[mIdx]; if (cur && cur.scrollIntoView) try { cur.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch {}
  }
  function renderGoal() {
    const m = mission(), got = stars[m.id] || [];
    $("goal").innerHTML = `<b>${m.n}</b><span></span>`; $("goal").lastChild.textContent = m.goal;
    const crit = ["Complete the mission", "Smooth landing", m.eff.text];
    $("crit").innerHTML = crit.map((c, i) => `<span class="${got[i] ? "got" : ""}">${got[i] ? "★" : "☆"} ${c}</span>`).join("");
  }

  // ---------------- builder ----------------
  function opt(container, list, key, extra) {
    const el = $(container); el.innerHTML = "";
    list.forEach((o, i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "opt"; b.setAttribute("aria-pressed", design[key] === i);
      b.innerHTML = `<b></b><span></span><em></em>`;
      b.querySelector("b").textContent = o.n; b.querySelector("span").textContent = o.d;
      b.querySelector("em").textContent = extra(o);
      b.onclick = () => { design[key] = i; changed(); };
      el.appendChild(b);
    });
  }
  function seg(container, labels, key, values) {
    const el = $(container); el.innerHTML = "";
    labels.forEach((l, i) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = l; b.setAttribute("aria-pressed", design[key] === values[i]);
      b.onclick = () => { design[key] = values[i]; changed(); };
      el.appendChild(b);
    });
  }
  function stepper(container, rows) {
    const el = $(container); el.innerHTML = "";
    rows.forEach(([key, title, sub, max]) => {
      const row = document.createElement("div"); row.className = "steprow";
      row.innerHTML = `<div><b></b><span></span></div><div class="stepper"><button type="button" aria-label="Fewer">−</button><output></output><button type="button" aria-label="More">+</button></div>`;
      row.querySelector("b").textContent = title; row.querySelector("span").textContent = sub;
      const [minus, plus] = row.querySelectorAll("button");
      row.querySelector("output").textContent = design[key];
      minus.disabled = design[key] <= 0; plus.disabled = design[key] >= max;
      minus.onclick = () => { design[key] = Math.max(0, design[key] - 1); changed(); };
      plus.onclick = () => { design[key] = Math.min(max, design[key] + 1); changed(); };
      minus.setAttribute("aria-label", "Fewer " + title.toLowerCase()); plus.setAttribute("aria-label", "More " + title.toLowerCase());
      el.appendChild(row);
    });
  }
  const k$ = (n) => "$" + Math.round(n / 1000) + "k";
  function renderBuilder() {
    opt("o-material", F.MATERIALS, "material", (o) => `${o.kg} kg · ${k$(o.cost)} · strength +${o.str}`);
    stepper("steppers1", [
      ["tanks", "Air tanks", `${F.TANK.liters} L of air each · ${F.TANK.kg} kg · ${k$(F.TANK.cost)}`, F.TANK.max],
      ["lift", "Lift nozzles (point down)", `Push the car UP · ${F.fmt(F.NOZZLE.thrust / 1000)} kN each`, F.LIMITS.lift],
      ["push", "Push nozzles (point back)", "Push the car FORWARD", F.LIMITS.push],
      ["flip", "Flip nozzles (front + back)", "Spin the car for flips", F.LIMITS.flip],
    ]);
    opt("o-computer", F.COMPUTERS, "computer", (o) => `${o.kg} kg · ${k$(o.cost)}`);
    opt("o-gear", F.GEARS, "gear", (o) => `takes ${o.absorb} m/s · ${o.kg} kg · ${k$(o.cost)}`);
    stepper("steppers2", [["people", "Passengers", `${F.PERSON_KG} kg each`, 2]]);
    $("i-speed").value = design.speed; $("v-speed").textContent = design.speed + " km/h";
    const sp = $("i-speed"); sp.style.setProperty("--p", ((design.speed - 20) / 40) * 100 + "%");
    seg("o-ramp", F.RAMPS.map((r) => `${r.n} ${r.deg}°`), "ramp", [0, 1, 2]);
    seg("o-reserve", ["0%", "15%", "30%", "45%"], "reserve", [0, 15, 30, 45]);
    const canFlip = design.computer === 2 && design.flip >= 2;
    $("i-flip").disabled = !canFlip; $("i-flip").checked = design.flipOn && canFlip;
    $("flipbox").classList.toggle("off", !canFlip);
    $("fliphelp").textContent = canFlip ? "The Pro computer climbs first, then spins the car one full turn." : design.computer !== 2 ? "Needs the Pro computer." : "Needs at least 2 flip nozzles.";
  }
  $("i-speed").addEventListener("input", () => { design.speed = +$("i-speed").value; changed(); });
  $("i-flip").addEventListener("change", () => { design.flipOn = $("i-flip").checked; changed(); });
  $("resetdesign").onclick = () => { design = { ...F.DEFAULT_DESIGN }; changed(); };

  function renderSheet() {
    const S = F.sheet(design), m = mission();
    const max = Math.max(S.lift, S.weight, 1);
    $("m-lift").style.width = (S.lift / max) * 100 + "%"; $("m-weight").style.width = (S.weight / max) * 100 + "%";
    $("n-lift").textContent = F.kN(S.lift); $("n-weight").textContent = F.kN(S.weight);
    $("s-tw").textContent = S.tw.toFixed(2); $("s-tw").style.color = S.tw >= 1 ? "var(--good)" : "var(--bad)";
    $("s-kg").textContent = F.kg(S.kg);
    $("s-burn").textContent = (design.lift + design.push ? F.fmt(S.burn) : "0") + " s";
    const budget = m.need.budget;
    $("s-cost").textContent = k$(S.cost); $("s-costlbl").textContent = budget ? `budget ${k$(budget)}` : "cost";
    $("s-costbox").classList.toggle("over", !!budget && S.cost > budget);
    $("sheetcost").textContent = `strength ${F.fmt(S.strength)} m/s`;
    $("mb-tw").textContent = S.tw.toFixed(2); $("mb-tw").style.color = S.tw >= 1 ? "var(--good)" : "var(--bad)";
    $("mb-kg").textContent = F.kg(S.kg); $("mb-cost").textContent = k$(S.cost);
    $("mb-cost").style.color = budget && S.cost > budget ? "var(--bad)" : "";
    const w = [];
    if (design.lift === 0) w.push(["bad", "No lift nozzles: nothing pushes the car up."]);
    else if (S.tw < 1) w.push(["bad", `Thrust is less than weight (${S.tw.toFixed(2)}). The car can't climb on its own.`]);
    if (design.tanks === 0 && design.lift + design.push + design.flip) w.push(["bad", "No air tanks: the nozzles have nothing to blow."]);
    if (design.computer > 0 && design.lift < 2) w.push(["", "The flight computer needs 2+ lift nozzles to steer."]);
    if (design.reserve && design.computer === 0) w.push(["", "Saved landing air needs a flight computer to fire it."]);
    if (budget && S.cost > budget) w.push(["bad", `Over budget by ${k$(S.cost - budget)}.`]);
    if (m.need.people && design.people < m.need.people) w.push(["bad", `This mission needs ${m.need.people} passengers.`]);
    if (m.need.flip && !(design.computer === 2 && design.flip >= 2 && design.flipOn)) w.push(["", "This mission needs a backflip: Pro computer, 2+ flip nozzles, Backflip on."]);
    $("warns").innerHTML = "";
    w.forEach(([c, t]) => { const p = document.createElement("p"); p.className = c; p.textContent = t; $("warns").appendChild(p); });
  }
  function changed() {
    design = F.clampDesign(design); ls.set("fcl-design", design);
    Sound.play("click"); renderBuilder(); renderSheet();
  }

  // ---------------- run ----------------
  function stopRun() { run = null; }
  function launch(result) {
    const r = result || F.simulate(design, mission());
    const th = (F.RAMPS[r.design.ramp].deg * Math.PI) / 180, v = r.design.speed / 3.6;
    const rampBase = -F.RAMP_LEN * Math.cos(th);
    run = { r, phase: "approach", t: 0, startX: rampBase - 16, rampBase, th, v, trail: [], approachDur: 16 / v + F.RAMP_LEN / v, after: 0, roll: 0, reported: !!result, landedFx: false };
    fx.p = []; fx.txt = [];
    Sound.play("go");
    if (!result) { prevResult = lastResult; lastResult = r; }
    $("replay").disabled = false;
    if (!result) $("report").innerHTML = "";
  }
  $("launch").onclick = () => launch();
  $("mb-launch").onclick = () => { try { $("track").scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" }); } catch {} launch(); };
  $("replay").onclick = () => { if (lastResult) launch(lastResult); };

  function carState() {
    if (!run) return { x: -12, y: 0, p: 0, idle: true };
    const r = run.r;
    if (run.phase === "approach") {
      const d = run.t * run.v, flat = 16;
      if (d < flat) return { x: run.startX + d, y: 0, p: 0 };
      const u = Math.min(d - flat, F.RAMP_LEN);
      return { x: run.rampBase + u * Math.cos(run.th), y: u * Math.sin(run.th), p: run.th };
    }
    const fr = r.frames;
    if (run.phase === "fly") {
      let i = Math.min(fr.length - 1, Math.floor(run.t * 60));
      const a = fr[i], b = fr[Math.min(fr.length - 1, i + 1)], k = clamp(run.t * 60 - i, 0, 1);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, p: a.p + (b.p - a.p) * k, f: a };
    }
    // after landing
    const last = fr[fr.length - 1], o = r.outcome;
    let x = last.x, y = Math.max(0, last.y), p = last.p;
    const T = run.after;
    if (o === "landed" || o === "overshoot" || o === "short") {
      const v0 = last.vx, dec = 6, tt = Math.min(T, v0 / dec);
      x += v0 * tt - 0.5 * dec * tt * tt; y = 0;
      p = last.p - Math.round(last.p / (2 * Math.PI)) * 2 * Math.PI; p *= Math.max(0, 1 - T * 6);
    } else if (o === "crash_side") { x -= Math.min(T, 0.4) * 3; p = last.p + Math.min(T, 0.5) * 1.2; y = Math.max(0, y - T * 6); }
    else if (o === "crash_top") { p = last.p * Math.max(0, 1 - T * 4); }
    else if (o === "crash_angle" || o === "crash_upside") {
      const target = Math.round(last.p / Math.PI) * Math.PI; p = last.p + (target - last.p) * ease.out(Math.min(1, T * 2)); y = 0;
      x += Math.min(T, 0.6) * last.vx * 0.3;
    } else if (o === "crash_hard") { y = 0; p = last.p - Math.round(last.p / (2 * Math.PI)) * 2 * Math.PI; }
    return { x, y, p, after: true };
  }

  // ---------------- drawing ----------------
  const cam = { left: -12, ppm: 18 };
  const stars2 = Array.from({ length: 70 }, () => [Math.random(), Math.random() * 0.5, Math.random() * 1.3 + 0.4]);
  function obstaclesEnd(m) { return m.obstacles.length ? Math.max(...m.obstacles.map((o) => o.x + o.w)) : 0; }

  function draw(t, dt) {
    const c = $("track"); if (!c.offsetParent) return;
    const { ctx, w, h } = E.fit(c);
    const m = run ? run.r.mission : mission();
    const gy = h * 0.86;
    fx.update(dt);

    // camera
    const car = carState();
    let tLeft, tPpm;
    const obsEnd = obstaclesEnd(m), tallest = m.obstacles.length ? Math.max(...m.obstacles.map((o) => o.h)) : 2;
    if (!run || car.idle) {
      const L = -20, R = Math.max(obsEnd + 8, 26);
      tPpm = Math.min(w / (R - L), (gy * 0.85) / (tallest + 7)); tLeft = L;
    } else {
      const peak = run.r.maxY;
      tPpm = clamp(Math.min(w / 42, (gy * 0.8) / (peak + 3)), w / 140, w / 22);
      tLeft = car.x - (w * 0.38) / tPpm;
    }
    const s = run ? Math.min(1, dt * 4) : 1;
    cam.ppm += (tPpm - cam.ppm) * s; cam.left += (tLeft - cam.left) * s;
    const ppm = cam.ppm, X = (wx) => (wx - cam.left) * ppm, Y = (wy) => gy - wy * ppm;

    ctx.save();
    if (fx.shake && !RM) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, "#14122a"); sky.addColorStop(0.6, "#3b2a4f"); sky.addColorStop(1, "#b8573a");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    for (const [sx, sy, sz] of stars2) { ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 2 + sx * 40); ctx.fillRect(sx * w, sy * gy, sz, sz); }
    ctx.globalAlpha = 1;
    // mesas (parallax)
    const par = -cam.left * ppm * 0.15;
    ctx.fillStyle = "#2a1f33";
    ctx.beginPath(); ctx.moveTo(0, gy);
    for (let i = -1; i < 8; i++) {
      const bx = ((i * w * 0.32 + par) % (w * 2.56) + w * 2.56) % (w * 2.56) - w * 0.32;
      ctx.lineTo(bx, gy - h * 0.06); ctx.lineTo(bx + w * 0.04, gy - h * (0.13 + (i % 3) * 0.03)); ctx.lineTo(bx + w * 0.2, gy - h * (0.13 + (i % 3) * 0.03)); ctx.lineTo(bx + w * 0.24, gy - h * 0.06);
    }
    ctx.lineTo(w, gy); ctx.fill();

    // height ruler
    const top = (gy - 10) / ppm, stepM = top > 40 ? 10 : top > 20 ? 5 : 2;
    ctx.font = `600 ${Math.max(10, Math.round(h * 0.028))}px "JetBrains Mono", monospace`; ctx.lineWidth = 1;
    for (let mm = stepM; mm < top; mm += stepM) {
      const y = Y(mm); ctx.strokeStyle = "rgba(255,255,255,.09)"; ctx.setLineDash([3, 7]);
      ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(w, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText(mm + " m", 6, y + 4);
    }

    // ground, landing zone
    ctx.fillStyle = "#3a3540"; ctx.fillRect(0, gy, w, h - gy);
    const zs = X(m.obstacles.length ? obsEnd + F.HALF : 4), ze = X(F.ZONE_END);
    ctx.fillStyle = "rgba(79,209,139,.16)"; ctx.fillRect(zs, gy, ze - zs, h - gy);
    ctx.fillStyle = "#4a4550"; ctx.fillRect(0, gy, w, 3);
    ctx.fillStyle = "#e9d27a";
    for (let wx = Math.floor(cam.left / 4) * 4; X(wx) < w; wx += 4) ctx.fillRect(X(wx), gy + (h - gy) * 0.5, 2 * ppm, 3);
    // finish flag
    if (ze < w + 20) {
      ctx.strokeStyle = "#f4f1ea"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ze, gy); ctx.lineTo(ze, gy - 3 * ppm); ctx.stroke();
      ctx.fillStyle = "#ff5d5d"; ctx.beginPath(); ctx.moveTo(ze, gy - 3 * ppm); ctx.lineTo(ze + 1.4 * ppm, gy - 2.6 * ppm); ctx.lineTo(ze, gy - 2.2 * ppm); ctx.fill();
    }
    ctx.font = `700 ${Math.max(10, Math.round(h * 0.026))}px "JetBrains Mono", monospace`; ctx.fillStyle = "rgba(79,209,139,.85)";
    if (ze - zs > 120) { ctx.textAlign = "center"; ctx.fillText("SAFE LANDING ZONE", (Math.max(zs, 0) + Math.min(ze, w)) / 2, gy + (h - gy) * 0.85); ctx.textAlign = "left"; }

    // ramp
    const th = run ? run.th : (F.RAMPS[design.ramp].deg * Math.PI) / 180;
    const rb = -F.RAMP_LEN * Math.cos(th), rh = F.RAMP_LEN * Math.sin(th);
    ctx.fillStyle = "#6b6370"; ctx.strokeStyle = "#141316"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(rb), Y(0)); ctx.lineTo(X(0), Y(rh)); ctx.lineTo(X(0), Y(0)); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#f46524"; for (let k = 0.15; k < 1; k += 0.25) { ctx.fillRect(X(rb + (0 - rb) * k), Y(rh * k) - 2, 0.35 * ppm, 3); }

    // obstacles
    for (const o of m.obstacles) drawVehicle(ctx, o, X, Y, ppm);
    if (m.obstacles.length) {
      ctx.strokeStyle = "rgba(255,210,63,.45)"; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
      for (const o of m.obstacles) { ctx.beginPath(); ctx.moveTo(X(o.x), Y(o.h)); ctx.lineTo(X(o.x + o.w), Y(o.h)); ctx.stroke(); }
      ctx.setLineDash([]);
    }

    // ghost of previous flight
    if (prevResult && prevResult.mission.id === m.id) {
      ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.setLineDash([4, 6]); ctx.lineWidth = 2; ctx.beginPath();
      prevResult.frames.forEach((f, i) => { const px = X(f.x), py = Y(f.y + F.CAR_H / 2); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    // current trail
    if (run && run.phase !== "approach") {
      const fr = run.r.frames, upto = run.phase === "fly" ? Math.floor(run.t * 60) : fr.length;
      ctx.fillStyle = "#ff8a50";
      for (let i = 0; i < upto; i += 3) { ctx.globalAlpha = 0.3 + 0.6 * (i / Math.max(1, upto)); ctx.beginPath(); ctx.arc(X(fr[i].x), Y(fr[i].y + F.CAR_H / 2), 2, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      // peak marker
      if (upto >= fr.length - 1 || run.phase === "after") {
        const px = X(run.r.maxYx), py = Y(run.r.maxY + F.CAR_H + 0.4);
        ctx.font = `700 ${Math.max(11, Math.round(h * 0.03))}px "JetBrains Mono", monospace`; ctx.textAlign = "center"; ctx.fillStyle = "#ffd23f";
        ctx.fillText(`PEAK ${F.fmt(run.r.maxY)} m`, px, py); ctx.textAlign = "left";
      }
    }

    // car
    const d = run ? run.r.design : design;
    const f = car.f || {};
    const jets = { lift: !!f.lift, push: !!f.push, flip: f.flip || 0, cushion: !!f.cushion, vector: run ? run.r.ctrl && !(f.flip) : false };
    if (run && run.phase === "fly" && (f.lift || f.push)) { if (!run.whoosh) { run.whoosh = true; Sound.play("whoosh"); } }
    // dust under jets
    if (jets.lift && car.y < 4 && !RM && Math.random() < 0.6) fx.burst(X(car.x + (Math.random() - 0.5) * 4), gy, 2, { colors: ["#c9a98a", "#a88a70"], kind: "dust", speed: 90, g: -10, life: 1, size: 5, angle: Math.random() < 0.5 ? 0 : Math.PI, spread: 0.6 });
    let squash = 0;
    if (run && run.phase === "after" && (run.r.outcome === "landed" || run.r.outcome === "crash_hard" || run.r.outcome === "overshoot" || run.r.outcome === "short")) squash = Math.max(0, 1 - run.after * 4) * (run.r.outcome === "crash_hard" ? 1.6 : 1);
    drawCar(ctx, X(car.x), Y(car.y), ppm, car.p, d, jets, t, squash, run && run.phase === "after" && run.r.outcome.startsWith("crash"));
    fx.draw(ctx);

    // forces
    if ($("forces").checked && (!run || run.phase !== "after")) drawForces(ctx, X(car.x), Y(car.y + F.CAR_H / 2), ppm, d, jets, car.idle || (run && run.phase === "approach"));

    // HUD
    if (run && run.phase !== "approach") {
      const air = f.air != null ? f.air : (run.phase === "after" ? run.r.frames[run.r.frames.length - 1].air : 1);
      const spd = Math.hypot(f.vx || 0, f.vy || 0) * 3.6;
      hud(ctx, w, h, [["ALT", F.fmt(Math.max(0, car.y)) + " m"], ["SPEED", Math.round(spd) + " km/h"], ["TILT", Math.round(Math.abs(((car.p * 180) / Math.PI + 540) % 360 - 180)) + "°"]], air);
    } else if (!run) {
      ctx.font = `700 ${Math.max(12, Math.round(h * 0.035))}px "Chakra Petch", Arial, sans-serif`; ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.textAlign = "center";
      ctx.fillText("Build your car, then press Launch", w / 2, h * 0.12); ctx.textAlign = "left";
    }

    // phase logic + effects
    if (run) step(dt, X, Y, gy, w, h, ctx);
    ctx.restore();
  }

  function step(dt, X, Y, gy, w, h, ctx) {
    const sp = $("slowmo").checked ? 0.35 : 1;
    run.t += dt * sp;
    if (run.phase === "approach" && run.t >= run.approachDur) { run.phase = "fly"; run.t = 0; }
    else if (run.phase === "fly" && run.t * 60 >= run.r.frames.length - 1) { run.phase = "after"; run.after = 0; landFx(X, Y, gy); }
    else if (run.phase === "after") {
      run.after += dt;
      const r = run.r, o = r.outcome;
      const label = { landed: r.landing === "smooth" ? "SMOOTH LANDING!" : "LANDED!", crash_hard: "TOO HARD!", crash_side: "CRASH!", crash_top: "CRASH!", crash_angle: "TIPPED OVER!", crash_upside: "UPSIDE DOWN!", overshoot: "TOO FAR!", short: "TOO SHORT!" }[o];
      const good = o === "landed";
      const k = ease.back(clamp((run.after - 0.15) / 0.35, 0, 1));
      if (run.after > 0.15) bigText(ctx, label, w / 2, h * 0.22, h * 0.1, good ? (r.landing === "smooth" ? "#4fd18b" : "#ffd23f") : "#ff5d5d", k);
      if (o.startsWith("crash") && Math.random() < 0.35 && !RM) { const c = carState(); fx.burst(X(c.x), Y(c.y + 0.8), 1, { colors: ["#55535c", "#7a7782"], kind: "smoke", speed: 25, g: -50, life: 1.8, size: 9, drag: 0.95, angle: -Math.PI / 2, spread: 1 }); }
      if (!run.reported && run.after > 0.7) { run.reported = true; showReport(r); }
    }
  }
  function landFx(X, Y, gy) {
    const r = run.r, c = carState(), o = r.outcome;
    if (o.startsWith("crash")) {
      Sound.play("ko"); fx.shake = 16;
      fx.burst(X(c.x), Y(c.y + 0.5), 40, { colors: ["#ffd23f", "#fff", "#ff8a50"], speed: 360, g: 500, life: 0.7, size: 4 });
    } else {
      Sound.play("thud"); fx.shake = r.landing === "smooth" ? 4 : 9;
    }
    fx.burst(X(c.x), gy, 30, { colors: ["#c9a98a", "#a88a70"], kind: "dust", speed: 180, g: -10, life: 1.2, size: 7, angle: -Math.PI / 2, spread: Math.PI });
  }

  function hud(ctx, w, h, rows, air) {
    const fs = Math.max(11, Math.round(h * 0.032)), pad = 8;
    ctx.font = `700 ${fs}px "JetBrains Mono", monospace`;
    const bw = fs * 9.5, bh = (rows.length + 1) * fs * 1.45 + pad;
    ctx.fillStyle = "rgba(20,19,22,.72)"; rr(ctx, w - bw - 10, 10, bw, bh, 8); ctx.fill();
    rows.forEach(([k, v], i) => {
      const y = 10 + pad + (i + 0.8) * fs * 1.45;
      ctx.fillStyle = "#aaa6b0"; ctx.fillText(k, w - bw, y);
      ctx.fillStyle = "#f4f1ea"; ctx.textAlign = "right"; ctx.fillText(v, w - 18, y); ctx.textAlign = "left";
    });
    const y = 10 + pad + (rows.length + 0.35) * fs * 1.45;
    ctx.fillStyle = "#aaa6b0"; ctx.fillText("AIR", w - bw, y + fs * 0.45);
    const bx = w - bw + fs * 2.6, barW = bw - fs * 2.6 - 18;
    ctx.fillStyle = "#1b1a1e"; rr(ctx, bx, y - fs * 0.25, barW, fs * 0.8, 4); ctx.fill();
    ctx.fillStyle = air > 0.25 ? "#38a7f0" : "#ff5d5d"; rr(ctx, bx, y - fs * 0.25, Math.max(0, barW * air), fs * 0.8, 4); ctx.fill();
  }

  function drawForces(ctx, sx, sy, ppm, d, jets, idle) {
    const S = F.sheet(d), base = 2.4 * ppm;
    const wl = base, tl = base * (S.lift / Math.max(1, S.weight));
    const firing = idle || jets.lift;
    const fs = Math.max(11, Math.round(ppm * 0.55));
    ctx.save(); ctx.lineWidth = Math.max(3, ppm * 0.16); ctx.lineCap = "round"; ctx.font = `700 ${fs}px "JetBrains Mono", monospace`;
    arrow(ctx, sx + ppm * 0.9, sy, sx + ppm * 0.9, sy + wl, "#38a7f0");
    ctx.fillStyle = "#38a7f0"; ctx.fillText(`WEIGHT ${F.kN(S.weight)}`, sx + ppm * 1.3, sy + wl);
    if (d.lift && firing) {
      ctx.globalAlpha = idle ? 0.75 : 1;
      arrow(ctx, sx - ppm * 0.9, sy, sx - ppm * 0.9, sy - tl, "#ff8a50");
      ctx.fillStyle = "#ff8a50"; ctx.textAlign = "right"; ctx.fillText(`THRUST ${F.kN(S.lift)}`, sx - ppm * 1.3, sy - tl + fs); ctx.textAlign = "left";
    }
    ctx.restore();
  }
  function arrow(ctx, x1, y1, x2, y2, col) {
    const a = Math.atan2(y2 - y1, x2 - x1), hl = Math.max(8, ctx.lineWidth * 2.6);
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(a) * hl * 0.6, y2 - Math.sin(a) * hl * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - Math.cos(a - 0.45) * hl, y2 - Math.sin(a - 0.45) * hl); ctx.lineTo(x2 - Math.cos(a + 0.45) * hl, y2 - Math.sin(a + 0.45) * hl); ctx.closePath(); ctx.fill();
  }

  // car: (sx, sy) = screen point under the middle of the car; p = pitch (radians, nose up +)
  function drawCar(ctx, sx, sy, ppm, p, d, jets, t, squash, wrecked) {
    const L = F.CAR_LEN * ppm, H = F.CAR_H * ppm;
    ctx.save();
    ctx.translate(sx, sy - H / 2); ctx.rotate(-p);
    ctx.scale(1 + squash * 0.06, 1 - squash * 0.14);
    // jets (drawn first, behind the body)
    const jet = (x, y, ang, len, col) => {
      const g = ctx.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.addColorStop(0, col); g.addColorStop(1, "rgba(56,167,240,0)");
      ctx.fillStyle = g; ctx.beginPath();
      const wdt = Math.max(2, ppm * 0.12), nx = -Math.sin(ang) * wdt, ny = Math.cos(ang) * wdt;
      ctx.moveTo(x + nx * 0.6, y + ny * 0.6); ctx.lineTo(x - nx * 0.6, y - ny * 0.6);
      ctx.lineTo(x + Math.cos(ang) * len - nx * 2.2, y + Math.sin(ang) * len - ny * 2.2); ctx.lineTo(x + Math.cos(ang) * len + nx * 2.2, y + Math.sin(ang) * len + ny * 2.2);
      ctx.fill();
    };
    if (jets.lift && d.lift) {
      const n = d.lift, down = jets.vector ? Math.PI / 2 + p : Math.PI / 2; // vectored jets point straight down in the world
      for (let i = 0; i < n; i++) {
        const x = -L * 0.4 + (i * L * 0.8) / Math.max(1, n - 1);
        jet(x, H * 0.45, down, ppm * (1.1 + Math.random() * 0.7) * (jets.cushion ? 1.3 : 1), jets.cushion ? "rgba(255,210,63,.9)" : "rgba(191,230,255,.95)");
      }
    }
    if (jets.push && d.push) for (let i = 0; i < d.push; i++) jet(-L * 0.5, -H * 0.05 + (i - (d.push - 1) / 2) * H * 0.14, Math.PI, ppm * (1 + Math.random() * 0.6), "rgba(191,230,255,.95)");
    if (jets.flip && d.flip) {
      const dir = jets.flip;
      jet(L * 0.45, dir > 0 ? H * 0.4 : -H * 0.4, dir > 0 ? Math.PI / 2 : -Math.PI / 2, ppm * 1.2, "rgba(197,140,255,.95)");
      jet(-L * 0.45, dir > 0 ? -H * 0.4 : H * 0.4, dir > 0 ? -Math.PI / 2 : Math.PI / 2, ppm * 1.2, "rgba(197,140,255,.95)");
    }
    // body
    const mat = d.material, bodyCol = ["#e9e6ee", "#c7ccd4", "#7f8794", "#2c2c34"][mat];
    const g = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
    g.addColorStop(0, "#ff8a50"); g.addColorStop(0.55, "#f46524"); g.addColorStop(1, "#a93d0c");
    ctx.fillStyle = g; ctx.strokeStyle = "#141316"; ctx.lineWidth = Math.max(1.5, ppm * 0.07);
    ctx.beginPath();
    ctx.moveTo(-L / 2, H * 0.3);
    ctx.quadraticCurveTo(-L / 2, -H * 0.15, -L * 0.25, -H * 0.18);
    ctx.quadraticCurveTo(-L * 0.04, -H * 0.62, L * 0.2, -H * 0.24);
    ctx.quadraticCurveTo(L / 2, -H * 0.12, L / 2 + L * 0.02, H * 0.22);
    ctx.lineTo(L / 2, H * 0.32); ctx.lineTo(-L / 2, H * 0.32); ctx.closePath(); ctx.fill(); ctx.stroke();
    // material stripe (shows what it's made of)
    ctx.fillStyle = bodyCol; ctx.fillRect(-L * 0.46, H * 0.06, L * 0.9, H * 0.1);
    if (mat === 3) { ctx.strokeStyle = "rgba(255,255,255,.15)"; ctx.lineWidth = 1; for (let k = -L * 0.46; k < L * 0.44; k += ppm * 0.18) { ctx.beginPath(); ctx.moveTo(k, H * 0.06); ctx.lineTo(k + ppm * 0.1, H * 0.16); ctx.stroke(); } }
    // window
    const wg = ctx.createLinearGradient(0, -H * 0.55, 0, -H * 0.2); wg.addColorStop(0, "#9fd3f5"); wg.addColorStop(1, "#1d3550");
    ctx.fillStyle = wg; ctx.strokeStyle = "#141316"; ctx.lineWidth = Math.max(1.5, ppm * 0.06);
    ctx.beginPath(); ctx.moveTo(-L * 0.17, -H * 0.2); ctx.quadraticCurveTo(-L * 0.02, -H * 0.56, L * 0.14, -H * 0.24); ctx.closePath(); ctx.fill(); ctx.stroke();
    // passengers
    for (let i = 0; i < d.people; i++) { ctx.fillStyle = "#141316"; ctx.beginPath(); ctx.arc(-L * 0.06 + i * L * 0.11, -H * 0.3, H * 0.08, 0, 7); ctx.fill(); }
    // tanks hint (dots along the bottom)
    ctx.fillStyle = "#38a7f0"; for (let i = 0; i < d.tanks; i++) ctx.fillRect(-L * 0.3 + i * L * 0.075, H * 0.2, L * 0.05, H * 0.07);
    // lights
    ctx.save(); ctx.shadowColor = "#fff6c0"; ctx.shadowBlur = 12; ctx.fillStyle = "#fff6c0"; rr(ctx, L * 0.43, -H * 0.06, L * 0.06, H * 0.1, 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#ff3030"; rr(ctx, -L * 0.5, -H * 0.06, L * 0.04, H * 0.1, 2); ctx.fill();
    // wheels
    [-0.3, 0.3].forEach((k) => {
      ctx.fillStyle = "#141316"; ctx.beginPath(); ctx.arc(L * k, H * 0.36, H * 0.24, 0, 7); ctx.fill();
      ctx.fillStyle = "#9a96a3"; ctx.beginPath(); ctx.arc(L * k, H * 0.36, H * 0.11, 0, 7); ctx.fill();
    });
    if (wrecked) { ctx.strokeStyle = "#141316"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-L * 0.1, -H * 0.1); ctx.lineTo(L * 0.02, H * 0.05); ctx.lineTo(-L * 0.04, H * 0.2); ctx.stroke(); }
    ctx.restore();
  }

  function drawVehicle(ctx, o, X, Y, ppm) {
    const x0 = X(o.x), x1 = X(o.x + o.w), base = Y(0), top = Y(o.h), W = x1 - x0, Hh = base - top;
    ctx.save(); ctx.strokeStyle = "#141316"; ctx.lineWidth = Math.max(1.5, ppm * 0.06);
    const wheel = (cx, r) => { ctx.fillStyle = "#141316"; ctx.beginPath(); ctx.arc(cx, base - r, r, 0, 7); ctx.fill(); ctx.fillStyle = "#6f6b77"; ctx.beginPath(); ctx.arc(cx, base - r, r * 0.45, 0, 7); ctx.fill(); };
    const glass = "rgba(159,196,221,.45)";
    if (o.kind === "semi" || o.kind === "tractor") {
      const cabW = Math.min(W, 6.5 * ppm), cabX = o.kind === "semi" ? x0 + W - cabW : x0;
      if (o.kind === "semi") { // trailer
        ctx.fillStyle = "#c9ccd3"; ctx.fillRect(x0, top, W - cabW - 0.3 * ppm, Hh * 0.82); ctx.strokeRect(x0, top, W - cabW - 0.3 * ppm, Hh * 0.82);
        ctx.fillStyle = "rgba(0,0,0,.08)"; for (let k = 1; k < 8; k++) ctx.fillRect(x0 + ((W - cabW) * k) / 8, top, 2, Hh * 0.82);
        ctx.fillStyle = "#3a3842"; ctx.fillRect(x0, top + Hh * 0.82, W - cabW, Hh * 0.05);
        wheel(x0 + 1.2 * ppm, Hh * 0.13); wheel(x0 + 2.6 * ppm, Hh * 0.13);
      }
      ctx.fillStyle = "#e7e9ee";
      ctx.beginPath(); ctx.moveTo(cabX, base - Hh * 0.15); ctx.lineTo(cabX, top + Hh * 0.08); ctx.quadraticCurveTo(cabX + cabW * 0.1, top, cabX + cabW * 0.45, top);
      ctx.lineTo(cabX + cabW * 0.8, top + Hh * 0.1); ctx.quadraticCurveTo(cabX + cabW, top + Hh * 0.35, cabX + cabW, base - Hh * 0.15); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = glass; ctx.beginPath(); ctx.moveTo(cabX + cabW * 0.62, top + Hh * 0.1); ctx.lineTo(cabX + cabW * 0.8, top + Hh * 0.13); ctx.quadraticCurveTo(cabX + cabW * 0.95, top + Hh * 0.33, cabX + cabW * 0.97, top + Hh * 0.45); ctx.lineTo(cabX + cabW * 0.62, top + Hh * 0.45); ctx.closePath(); ctx.fill();
      wheel(cabX + cabW * 0.22, Hh * 0.13); wheel(cabX + cabW * 0.78, Hh * 0.13);
    } else {
      const col = { sedan: "#5d6b82", suv: "#6e5a7a", pickup: "#7a6a52", cab: "#d9dbe0" }[o.kind] || "#666";
      ctx.fillStyle = col;
      const roofStart = o.kind === "pickup" ? 0.42 : o.kind === "cab" ? 0.12 : 0.28, roofEnd = o.kind === "pickup" ? 0.75 : o.kind === "cab" ? 0.88 : o.kind === "suv" ? 0.88 : 0.72;
      const belt = o.kind === "cab" ? 0.5 : 0.55;
      ctx.beginPath(); ctx.moveTo(x0, base - Hh * 0.18); ctx.lineTo(x0 + W * 0.02, top + Hh * belt);
      if (o.kind === "pickup") { ctx.lineTo(x0 + W * roofStart - W * 0.02, top + Hh * belt); ctx.lineTo(x0 + W * roofStart, top + Hh * 0.05); }
      else ctx.lineTo(x0 + W * roofStart, top + Hh * (o.kind === "cab" ? 0.05 : 0.08));
      ctx.quadraticCurveTo(x0 + W * (roofStart + roofEnd) / 2, top - Hh * 0.04, x0 + W * roofEnd, top + Hh * 0.06);
      ctx.lineTo(x0 + W * 0.97, top + Hh * belt); ctx.lineTo(x1, base - Hh * 0.18); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = glass; ctx.beginPath();
      ctx.moveTo(x0 + W * (roofStart + 0.04), top + Hh * belt - 2); ctx.lineTo(x0 + W * (roofStart + 0.05), top + Hh * 0.16); ctx.lineTo(x0 + W * (roofEnd - 0.04), top + Hh * 0.16); ctx.lineTo(x0 + W * (roofEnd + 0.02), top + Hh * belt - 2); ctx.closePath(); ctx.fill();
      wheel(x0 + W * 0.2, Hh * 0.2); wheel(x0 + W * 0.8, Hh * 0.2);
    }
    // label
    const fs = Math.max(10, Math.round(Math.min(ppm * 0.62, 16)));
    ctx.font = `700 ${fs}px "JetBrains Mono", monospace`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,210,63,.9)";
    ctx.fillText(`${o.label.toUpperCase()} · ${F.fmt(o.h)} m`, (x0 + x1) / 2, top - fs * 0.6);
    ctx.restore();
  }

  // ---------------- report ----------------
  function showReport(r) {
    const g = F.grade(r), e = F.explain(r, g), m = r.mission;
    const best = stars[m.id] || [false, false, false];
    const merged = best.map((b, i) => b || g.stars[i]);
    const newStar = merged.some((b, i) => b && !best[i]);
    stars[m.id] = merged; ls.set("fcl-stars", stars);
    renderMissions(); renderGoal();
    if (g.complete) { Sound.play("win"); fx.burst($("track").getBoundingClientRect().width / 2, 30, 80, { colors: E.COLORS, kind: "confetti", speed: 380, g: 320, life: 2.2, size: 6, drag: 0.93 }); }

    const P = prevResult && prevResult.mission.id === m.id ? prevResult : null;
    const cmp = (a, b, better, dp = 1) => {
      if (!P) return "";
      const diff = a - b; if (Math.abs(diff) < 0.05) return `<i>same as last</i>`;
      const good = better === "up" ? diff > 0 : diff < 0;
      return `<i class="${good ? "up" : "down"}">${diff > 0 ? "+" : ""}${F.fmt(diff, dp)} vs last</i>`;
    };
    const rep = $("report"); rep.innerHTML = "";
    const hd = document.createElement("div"); hd.className = "headline " + e.headline.tone;
    hd.innerHTML = `<span></span><span class="stars">${starStr(g.stars)}</span>`; hd.firstChild.textContent = e.headline.text + (newStar ? "  New star!" : "");
    rep.appendChild(hd);
    const nums = document.createElement("div"); nums.className = "nums";
    nums.innerHTML = `
      <div><b>${F.fmt(r.maxY)} m</b><span>peak height</span> ${cmp(r.maxY, P && P.maxY, "up")}</div>
      <div><b>${F.fmt(r.flightTime)} s</b><span>air time</span> ${cmp(r.flightTime, P && P.flightTime, "up")}</div>
      <div><b>${F.fmt(r.landX, 0)} m</b><span>distance</span> ${cmp(r.landX, P && P.landX, "up", 0)}</div>
      <div><b>${F.fmt(r.vImp)} m/s</b><span>landing speed (max ${F.fmt(r.sheet.strength)})</span> ${cmp(r.vImp, P && P.vImp, "down")}</div>`;
    rep.appendChild(nums);
    e.items.forEach((it, i) => {
      const d = document.createElement("div"); d.className = "finding " + it.tone; d.style.animationDelay = i * 0.06 + "s";
      d.innerHTML = `<span class="ic">${it.tone === "good" ? "✓" : it.tone === "bad" ? "✗" : "i"}</span><div><h4></h4><p></p></div>`;
      d.querySelector("h4").textContent = it.title; d.querySelector("p").textContent = it.text;
      rep.appendChild(d);
    });
    const tip = document.createElement("div"); tip.className = "tipbox"; tip.innerHTML = "<b>Try this next</b><span></span>"; tip.lastChild.textContent = e.tip;
    rep.appendChild(tip);
    if (g.complete && mIdx < F.MISSIONS.length - 1) {
      const nb = document.createElement("button"); nb.type = "button"; nb.className = "btn"; nb.textContent = `Next mission: ${F.MISSIONS[mIdx + 1].n}`;
      nb.onclick = () => { $("missions").children[mIdx + 1].click(); window.scrollTo({ top: 0, behavior: RM ? "auto" : "smooth" }); };
      rep.appendChild(nb);
    }
  }

  // ---------------- boot ----------------
  $("sound").onclick = () => { const on = Sound.toggle(); $("sound").textContent = "Sound: " + (on ? "on" : "off"); $("sound").setAttribute("aria-pressed", on); };
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === document.body) launch(); });
  renderMissions(); renderGoal(); renderBuilder(); renderSheet();
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { draw(now / 1000, dt); } catch (err) { console.error(err); }
    requestAnimationFrame(loop);
  })(last);
  window.__lab = { get design() { return design; }, setDesign(d) { design = F.clampDesign({ ...design, ...d }); changed(); }, launch, get run() { return run; } };
})();
