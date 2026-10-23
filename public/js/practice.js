/* Practice mode (one device): build bots, battle them, and the Flying Car Lab.
   Uses the same engine as the tournament, so the rules match. */
(function () {
  const E = window.Engine;
  const { fit, rr, ease, clamp, bigText, FX, RM, COLORS, PARTS, statsOf, MAXW, codeOf, parseCode } = E;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ---------------- BUILD ----------------
  const builder = Builder.mount({
    bot: store.get("rba-bot", null) || undefined,
    onChange(bot, over) {
      store.set("rba-bot", bot);
      $("code").textContent = codeOf(bot);
      $("save").disabled = over; $("copy").disabled = over;
    },
  });
  let toastT;
  function toast(msg) { $("toast").textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => ($("toast").textContent = ""), 3500); }
  $("copy").onclick = async () => {
    try { await navigator.clipboard.writeText(codeOf(builder.bot)); toast("Copied!"); }
    catch { const r = document.createRange(); r.selectNodeContents($("code")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("Code selected. Press Ctrl+C to copy."); }
  };
  $("save").onclick = () => {
    if (builder.overweight()) return;
    addToRoster(builder.bot, false); E.Sound.play("win"); builder.celebrate();
    toast(`${builder.bot.name} joined the Arena roster!`);
  };

  // ---------------- ROSTER ----------------
  const SAMPLES = ["CRUSHER-12011", "ZIPZAP-00222", "SPIDEY-22113"];
  let roster = store.get("rba-roster", null);
  if (!Array.isArray(roster) || !roster.length) roster = SAMPLES.map((c) => ({ ...parseCode(c), sample: true, w: 0, l: 0 }));
  roster = roster.filter((r) => E.sanitizeBot(r)); // drop bots made under old rules that are now invalid
  if (roster.length < 2) roster = SAMPLES.map((c) => ({ ...parseCode(c), sample: true, w: 0, l: 0 }));
  let pick = [0, Math.min(1, roster.length - 1)], activeCorner = 0, busy = false;

  function addToRoster(b, isSample) {
    const code = codeOf(b), i = roster.findIndex((r) => codeOf(r) === code);
    if (i >= 0) return i;
    roster.push({ ...b, sample: !!isSample, w: 0, l: 0 }); store.set("rba-roster", roster); renderRoster();
    return roster.length - 1;
  }
  function setCorner(k) { activeCorner = k; $("cornerA").setAttribute("aria-pressed", k === 0); $("cornerB").setAttribute("aria-pressed", k === 1); }
  $("cornerA").onclick = () => { E.Sound.play("click"); setCorner(0); };
  $("cornerB").onclick = () => { E.Sound.play("click"); setCorner(1); };
  function renderRoster() {
    pick = pick.map((p) => clamp(p, 0, roster.length - 1));
    const el = $("roster"); el.innerHTML = "";
    roster.forEach((r, i) => {
      const row = document.createElement("button"); row.type = "button";
      row.className = "rbot" + (pick[0] === i ? " in-a" : "") + (pick[1] === i ? " in-b" : "");
      row.innerHTML = `<canvas width="80" height="80" aria-hidden="true"></canvas><div style="min-width:0"><div class="nm"></div><div class="meta"></div></div><div class="rec"></div>`;
      const nm = row.querySelector(".nm"); nm.textContent = r.name;
      if (r.sample) { const t = document.createElement("span"); t.className = "tag"; t.textContent = "sample"; nm.appendChild(t); }
      row.querySelector(".meta").textContent = `${PARTS.body[r.body].n} · ${PARTS.sensor[r.sensor].n} · ${PARTS.tool[r.tool].n}`;
      row.querySelector(".rec").innerHTML = `${r.w}W<br>${r.l}L`;
      row.setAttribute("aria-label", `${r.name}: put in the active corner`);
      E.portrait(row.querySelector("canvas"), r, "#2b2a30");
      row.onclick = () => { if (busy) return; E.Sound.play("click"); pick[activeCorner] = i; setCorner(1 - activeCorner); renderRoster(); resetFight(); };
      el.appendChild(row);
    });
    $("cna").textContent = roster[pick[0]]?.name || "—"; $("cnb").textContent = roster[pick[1]]?.name || "—";
  }
  $("add").onclick = () => {
    const b = parseCode($("addcode").value);
    if (!b) { $("addmsg").textContent = "That code doesn't look right. It should look like ZAP-21013."; return; }
    if (statsOf(b).wt > MAXW) { $("addmsg").textContent = "That bot is over 75 kg, so it can't fight."; return; }
    if (busy) return;
    $("addmsg").textContent = ""; $("addcode").value = "";
    const i = addToRoster(b, false); pick[activeCorner] = i; setCorner(1 - activeCorner); renderRoster(); resetFight(); E.Sound.play("go");
  };
  $("addcode").addEventListener("keydown", (e) => { if (e.key === "Enter") $("add").click(); });
  $("randmatch").onclick = () => {
    if (busy || roster.length < 2) return;
    const a = (Math.random() * roster.length) | 0; let b; do { b = (Math.random() * roster.length) | 0; } while (b === a);
    pick = [a, b]; renderRoster(); resetFight(); E.Sound.play("go");
  };

  // ---------------- BATTLE ----------------
  const stage = new BattleStage($("arena"), {
    onHP(hp, instant) {
      [["ba", "ga", 0], ["bb", "gb", 1]].forEach(([m, g, k]) => {
        if (instant) { $(g).style.transition = "none"; $(m).style.transition = "none"; }
        $(m).style.width = hp[k] + "%"; $(g).style.width = hp[k] + "%";
        if (instant) { void $(m).offsetWidth; $(g).style.transition = ""; $(m).style.transition = ""; }
      });
      $("ha").textContent = Math.round(hp[0]); $("hb").textContent = Math.round(hp[1]);
    },
    onLog(e, bot) {
      const d = document.createElement("div"), labels = { sense: "SENSE", think: "THINK", act: "ACT", win: "WINNER", stall: "STUCK" };
      d.innerHTML = `<span class="chip c-${e.kind === "stall" ? "act" : e.kind}">${labels[e.kind]}</span><span><span class="${e.me === 0 ? "a" : "b"}"></span><span></span></span>`;
      const p = d.lastElementChild.children; p[0].textContent = bot.name; p[1].textContent = e.txt;
      $("log").appendChild(d); $("log").scrollTop = $("log").scrollHeight;
    },
    onDone(w) {
      busy = false; $("skip").disabled = true; $("fight").disabled = false; $("fight").textContent = "Rematch";
      if (pick[0] !== pick[1]) { roster[pick[w]].w++; roster[pick[1 - w]].l++; store.set("rba-roster", roster); renderRoster(); }
    },
  });
  function resetFight() {
    busy = false; $("log").innerHTML = ""; $("skip").disabled = true; $("fight").disabled = false; $("fight").textContent = "Fight!";
    const a = roster[pick[0]], b = roster[pick[1]];
    $("na").textContent = a?.name || "—"; $("nb").textContent = b?.name || "—";
    stage.setBots(a, b);
  }
  $("fight").onclick = () => {
    const a = roster[pick[0]], b = roster[pick[1]]; if (!a || !b) return;
    resetFight(); busy = true; $("fight").disabled = true; $("skip").disabled = false;
    stage.play(E.simulate(a, b).events);
  };
  $("skip").onclick = () => stage.skip();
  [["sp1", 1], ["sp2", 2]].forEach(([id, v]) => ($(id).onclick = () => { stage.speed = v; $("sp1").setAttribute("aria-pressed", v === 1); $("sp2").setAttribute("aria-pressed", v === 2); }));

  // ---------------- LAB ----------------
  const MATS = [
    { n: "Steel", d: "Strong, heavy", kg: 1700 },
    { n: "Aluminum", d: "Lighter metal", kg: 1250 },
    { n: "Carbon fiber", d: "Super light", kg: 900 },
  ];
  const G = 9.81, NOZ = 2600, VE = 300, TANK_KG_PER_L = 0.55, AIR_KG_PER_L = 0.36;
  let lab = store.get("rba-lab", { n: 6, t: 300, p: 1, m: 0 });
  let best = store.get("rba-best", 0);
  ["n", "t", "p"].forEach((k) => ($("s" + k).value = lab[k]));
  const MISSIONS = [
    { txt: "Lift off the ground", ok: (r) => r.h > 0.05 },
    { txt: "Clear the parked cars (2 m)", ok: (r) => r.h >= 2 },
    { txt: "Stay in the air for 3 seconds", ok: (r) => r.air >= 3 },
    { txt: "Lift off with 2 people inside", ok: (r) => r.h > 0.05 && r.p === 2 },
  ];
  let done = store.get("rba-missions", [false, false, false, false]);
  let justDone = [];
  function physics() {
    const mass = MATS[lab.m].kg + lab.t * (TANK_KG_PER_L + AIR_KG_PER_L) + lab.p * 80;
    const thrust = lab.n * NOZ, weight = mass * G, air = lab.t * AIR_KG_PER_L, burn = air / (thrust / VE), a = thrust / mass - G;
    let h = 0, airT = 0;
    if (a > 0) { const v = a * burn; h = 0.5 * a * burn * burn + (v * v) / (2 * G); airT = burn + v / G + Math.sqrt((2 * h) / G); }
    return { mass, thrust, weight, burn, h, air: airT, a, n: lab.n, p: lab.p };
  }
  function setRangeFill(el) { const p = ((el.value - el.min) / (el.max - el.min)) * 100; el.style.setProperty("--p", p + "%"); }
  function renderLabUI() {
    $("vn").textContent = lab.n; $("vt").textContent = lab.t + " L"; $("vp").textContent = lab.p;
    ["sn", "st", "sp"].forEach((id) => setRangeFill($(id)));
    const el = $("c-mat"); el.innerHTML = "";
    MATS.forEach((m, i) => {
      const b = document.createElement("button"); b.className = "choice"; b.type = "button"; b.setAttribute("aria-pressed", lab.m === i);
      b.innerHTML = `<b></b><span></span><em>${m.kg} kg</em>`;
      b.querySelector("b").textContent = m.n; b.querySelector("span").textContent = m.d;
      b.onclick = () => { lab.m = i; E.Sound.play("click"); labChanged(); };
      el.appendChild(b);
    });
    const r = physics(), max = Math.max(r.thrust, r.weight);
    $("ft").style.width = (r.thrust / max) * 100 + "%"; $("fw").style.width = (r.weight / max) * 100 + "%";
    $("ftn").textContent = (r.thrust / 1000).toFixed(1) + " kN"; $("fwn").textContent = (r.weight / 1000).toFixed(1) + " kN";
    $("verdict").innerHTML = r.a > 0
      ? `<b style="color:var(--good)">Thrust beats weight.</b> Ready for lift-off! Mass: ${Math.round(r.mass).toLocaleString()} kg.`
      : `<b style="color:var(--bad)">Too heavy.</b> Weight is bigger than thrust, so it can't leave the ground. Add nozzles or make it lighter. Mass: ${Math.round(r.mass).toLocaleString()} kg.`;
    $("missions").innerHTML = MISSIONS.map((m, i) => `<div class="mission${done[i] ? " done" : ""}${justDone.includes(i) ? " pop" : ""}"><span class="box">${done[i] ? "✓" : ""}</span><span>${m.txt}</span></div>`).join("");
    $("rbest").textContent = best > 0.05 ? best.toFixed(1) + " m" : "–";
  }
  let flight = null;
  function labChanged() {
    lab.n = +$("sn").value; lab.t = +$("st").value; lab.p = +$("sp").value;
    store.set("rba-lab", lab); justDone = [];
    if (flight && flight.done) flight = null;
    renderLabUI();
    if (!flight) { ["rh", "rt", "rb"].forEach((id) => ($(id).textContent = "–")); $("launchnote").textContent = ""; }
  }
  ["sn", "st", "sp"].forEach((id) => $(id).addEventListener("input", labChanged));
  const labFx = new FX();
  $("launch").onclick = () => {
    if (flight && !flight.done) return;
    flight = { r: physics(), t: -1.8, lastCount: -1, landed: false, done: false, trail: [] };
    $("launch").disabled = true; $("launchnote").textContent = "";
  };
  function finishFlight() {
    const r = flight.r; flight.done = true; $("launch").disabled = false;
    $("rh").textContent = r.h.toFixed(1) + " m"; $("rt").textContent = r.air.toFixed(1) + " s"; $("rb").textContent = r.burn.toFixed(1) + " s";
    justDone = [];
    MISSIONS.forEach((m, i) => { if (!done[i] && m.ok(r)) { done[i] = true; justDone.push(i); } });
    let note = "";
    if (r.a <= 0) note = "Not enough thrust. Try more nozzles or a lighter body.";
    else if (r.h < 2) note = "It flew, but not high enough to clear the cars.";
    if (r.h > best && r.h > 0.05) { best = r.h; store.set("rba-best", best); note = "New best height!"; }
    $("launchnote").textContent = note;
    store.set("rba-missions", done); renderLabUI();
    if (justDone.length) E.Sound.play("win");
  }
  function heightAt(r, t) {
    if (r.a <= 0 || t <= 0) return 0;
    if (t < r.burn) return 0.5 * r.a * t * t;
    const v = r.a * r.burn, tc = t - r.burn;
    return Math.max(0, 0.5 * r.a * r.burn * r.burn + v * tc - 0.5 * G * tc * tc);
  }
  const stars = Array.from({ length: 60 }, () => [Math.random(), Math.random() * 0.5, Math.random() * 1.2 + 0.4]);
  function drawLab(t, dt) {
    const c = $("lab"); if (!c.offsetParent) return;
    const { ctx, w, h } = fit(c);
    labFx.update(dt);
    ctx.save();
    if (labFx.shake && !RM) ctx.translate((Math.random() - 0.5) * labFx.shake, (Math.random() - 0.5) * labFx.shake);
    const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#14122a"); sky.addColorStop(0.55, "#3b2a4f"); sky.addColorStop(0.82, "#b8573a");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    for (const [sx, sy, sz] of stars) { ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + sx * 30); ctx.fillRect(sx * w, sy * h, sz, sz); }
    ctx.globalAlpha = 1;
    const gy = h * 0.83;
    ctx.fillStyle = "#2a1f33";
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(0, gy - h * 0.12); ctx.lineTo(w * 0.08, gy - h * 0.14); ctx.lineTo(w * 0.2, gy - h * 0.14); ctx.lineTo(w * 0.26, gy - h * 0.07);
    ctx.lineTo(w * 0.55, gy - h * 0.06); ctx.lineTo(w * 0.62, gy - h * 0.17); ctx.lineTo(w * 0.8, gy - h * 0.17); ctx.lineTo(w * 0.86, gy - h * 0.09); ctx.lineTo(w, gy - h * 0.1); ctx.lineTo(w, gy); ctx.fill();
    const top = Math.max(10, flight ? flight.r.h * 1.2 : best * 1.2);
    const pxPerM = (gy - h * 0.1) / top;
    const stepM = top > 60 ? 20 : top > 30 ? 10 : top > 15 ? 5 : 2;
    ctx.font = `600 ${Math.max(10, Math.round(h * 0.03))}px "JetBrains Mono", monospace`; ctx.lineWidth = 1;
    for (let m = stepM; m < top; m += stepM) {
      const y = gy - m * pxPerM; ctx.strokeStyle = "#ffffff1c"; ctx.setLineDash([3, 6]);
      ctx.beginPath(); ctx.moveTo(46, y); ctx.lineTo(w, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#ffffff8c"; ctx.fillText(m + " m", 8, y + 4);
    }
    if (best > 0.05) {
      const y = gy - best * pxPerM; ctx.strokeStyle = "#4fd18b99"; ctx.setLineDash([8, 5]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(46, y); ctx.lineTo(w, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#4fd18b"; ctx.textAlign = "right"; ctx.fillText("BEST " + best.toFixed(1) + " m", w - 8, y - 5); ctx.textAlign = "left";
    }
    ctx.fillStyle = "#3a3540"; ctx.fillRect(0, gy, w, h - gy);
    ctx.fillStyle = "#4a4550"; ctx.fillRect(0, gy, w, 3);
    ctx.fillStyle = "#e9d27a"; for (let x = 8; x < w; x += 46) ctx.fillRect(x, gy + (h - gy) * 0.55, 24, 3);
    const carH = Math.max(8, 1.6 * pxPerM), carW = Math.min(w * 0.075, carH * 2.8), gap = carW * 0.18, rowW = carW * 5 + gap * 4, rx = w * 0.5 - rowW / 2;
    const parkCols = ["#5d5a66", "#6e6a78", "#4f4c58", "#77727f", "#5a5663"];
    for (let k = 0; k < 5; k++) drawParked(ctx, rx + k * (carW + gap), gy, carW, carH, parkCols[k]);

    let x = w * 0.1, alt = 0, burning = false, sputter = false, squash = 0, countdown = null;
    const L = Math.min(w * 0.17, 150);
    if (flight) {
      const r = flight.r, prevT = flight.t;
      flight.t += dt;
      const ft = flight.t;
      if (ft < 0) {
        const n = Math.floor((ft + 1.8) / 0.6);
        if (n !== flight.lastCount) { flight.lastCount = n; E.Sound.play("beep"); }
        sputter = true; countdown = { n, f: ((ft + 1.8) % 0.6) / 0.6 };
      } else if (r.a > 0) {
        if (prevT < 0) { E.Sound.play("whoosh"); labFx.burst(x, gy, 30, { colors: ["#c9a98a", "#a88a70"], kind: "dust", speed: 160, g: -20, life: 1.2, size: 6, angle: -Math.PI / 2, spread: Math.PI }); labFx.shake = 6; }
        const prog = clamp(ft / r.air, 0, 1);
        x = w * 0.1 + w * 0.8 * prog; alt = heightAt(r, ft); burning = ft < r.burn;
        if (!flight.landed && alt > 0) flight.trail.push([x, gy - alt * pxPerM]);
        if (ft >= r.air && !flight.landed) {
          flight.landed = true; E.Sound.play("thud"); labFx.shake = 10;
          labFx.burst(w * 0.9, gy, 36, { colors: ["#c9a98a", "#a88a70"], kind: "dust", speed: 200, g: -10, life: 1.3, size: 7, angle: -Math.PI / 2, spread: Math.PI });
        }
        if (flight.landed) { squash = Math.max(0, 1 - (ft - r.air) * 4); x = w * 0.9; alt = 0; }
        if (ft > r.air + 0.6 && !flight.done) finishFlight();
      } else {
        sputter = ft < 2.4;
        if (ft > 0 && prevT <= 0) { labFx.text(w / 2, h * 0.32, "NOT ENOUGH THRUST", "#ff5d5d", Math.round(h * 0.07)); E.Sound.play("miss"); }
        if (ft > 2.4 && !flight.done) finishFlight();
      }
    }
    if (flight && flight.trail.length) {
      ctx.fillStyle = "#ff8a50";
      flight.trail.forEach(([tx, ty], i) => { if (i % 3 === 0) { ctx.globalAlpha = 0.2 + 0.5 * (i / flight.trail.length); ctx.beginPath(); ctx.arc(tx, ty, 2, 0, 7); ctx.fill(); } });
      ctx.globalAlpha = 1;
    }
    const y = gy - alt * pxPerM;
    const shk = sputter ? (Math.random() - 0.5) * 3 : 0;
    if (burning || sputter) {
      const n = lab.n, weak = sputter && !burning;
      for (let i = 0; i < n; i++) {
        const nx = x - L * 0.42 + (i * L * 0.84) / Math.max(1, n - 1);
        if ((!weak || Math.random() < 0.35) && (!RM || Math.random() < 0.3)) labFx.p.push({ x: nx, y: y - 2, vx: (Math.random() - 0.5) * 30, vy: (weak ? 60 : 240) + Math.random() * 120, life: 0, max: weak ? 0.25 : 0.4,
          size: weak ? 2 : 3 + Math.random() * 2, color: Math.random() < 0.5 ? "#bfe6ff" : "#38a7f0", g: 0, kind: "dot", rot: 0, vr: 0, drag: 0.85 });
      }
      if (burning && alt * pxPerM < 30 && Math.random() < 0.5) labFx.burst(x + (Math.random() - 0.5) * L, gy, 2, { colors: ["#c9a98a"], kind: "dust", speed: 120, g: -10, life: 0.9, size: 5, angle: Math.random() < 0.5 ? 0 : Math.PI, spread: 0.6 });
    }
    labFx.draw(ctx);
    drawRoadster(ctx, x + shk, y, L, t, flight && flight.t > 0 && !flight.landed, squash);
    if (alt > 0.2) {
      const lbl = alt.toFixed(1) + " m";
      ctx.font = `700 ${Math.max(11, Math.round(h * 0.035))}px "JetBrains Mono", monospace`;
      const tw = ctx.measureText(lbl).width + 14, ty = y - L * 0.4;
      ctx.fillStyle = "#141316cc"; rr(ctx, x - tw / 2, ty - 18, tw, 24, 6); ctx.fill();
      ctx.fillStyle = "#ffd23f"; ctx.textAlign = "center"; ctx.fillText(lbl, x, ty - 1); ctx.textAlign = "left";
    }
    if (countdown) {
      const { n, f } = countdown;
      bigText(ctx, String(3 - n), w / 2, h * 0.32, h * 0.24, "#f4f1ea", 0.6 + ease.back(Math.min(1, f * 2.2)) * 0.5, f > 0.75 ? (1 - f) / 0.25 : 1);
    }
    ctx.restore();
  }
  function drawParked(ctx, x, gy, w, h, col) {
    ctx.fillStyle = col; ctx.strokeStyle = "#141316"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, gy - h * 0.25); ctx.lineTo(x + w * 0.08, gy - h * 0.6); ctx.lineTo(x + w * 0.3, gy - h * 0.62);
    ctx.lineTo(x + w * 0.42, gy - h); ctx.lineTo(x + w * 0.8, gy - h); ctx.lineTo(x + w * 0.92, gy - h * 0.6); ctx.lineTo(x + w, gy - h * 0.5); ctx.lineTo(x + w, gy - h * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(159,196,221,.35)"; ctx.beginPath(); ctx.moveTo(x + w * 0.46, gy - h * 0.92); ctx.lineTo(x + w * 0.78, gy - h * 0.92); ctx.lineTo(x + w * 0.86, gy - h * 0.62); ctx.lineTo(x + w * 0.38, gy - h * 0.62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#141316"; [0.24, 0.78].forEach((k) => { ctx.beginPath(); ctx.arc(x + w * k, gy - h * 0.18, h * 0.2, 0, 7); ctx.fill(); });
  }
  function drawRoadster(ctx, x, y, L, t, flying, squash) {
    const H = L * 0.24;
    ctx.save(); ctx.translate(x, y); ctx.scale(1 + squash * 0.08, 1 - squash * 0.12);
    const g = ctx.createLinearGradient(0, -H * 1.3, 0, 0); g.addColorStop(0, "#ff8a50"); g.addColorStop(0.6, "#f46524"); g.addColorStop(1, "#a93d0c");
    ctx.fillStyle = g; ctx.strokeStyle = "#141316"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-L / 2, -L * 0.06);
    ctx.quadraticCurveTo(-L / 2, -H * 0.72, -L * 0.24, -H * 0.78);
    ctx.quadraticCurveTo(-L * 0.04, -H * 1.42, L * 0.2, -H * 0.84);
    ctx.quadraticCurveTo(L / 2, -H * 0.66, L / 2 + L * 0.02, -L * 0.08);
    ctx.lineTo(L / 2, -L * 0.035); ctx.lineTo(-L / 2, -L * 0.035); ctx.closePath(); ctx.fill(); ctx.stroke();
    const wg = ctx.createLinearGradient(0, -H * 1.25, 0, -H * 0.8); wg.addColorStop(0, "#9fd3f5"); wg.addColorStop(1, "#1d3550");
    ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(-L * 0.17, -H * 0.82); ctx.quadraticCurveTo(-L * 0.02, -H * 1.28, L * 0.14, -H * 0.86); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(-L * 0.42, -H * 0.55, L * 0.75, 2);
    ctx.fillStyle = "#141316"; for (let i = 0; i < 6; i++) ctx.fillRect(-L * 0.4 + i * L * 0.16, -L * 0.045, L * 0.05, 3);
    ctx.save(); ctx.shadowColor = "#fff6c0"; ctx.shadowBlur = 14; ctx.fillStyle = "#fff6c0"; rr(ctx, L * 0.42, -H * 0.62, L * 0.06, H * 0.12, 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#ff3030"; rr(ctx, -L * 0.5, -H * 0.62, L * 0.04, H * 0.12, 2); ctx.fill();
    [-0.3, 0.3].forEach((k) => {
      ctx.fillStyle = "#141316"; ctx.beginPath(); ctx.arc(L * k, -L * 0.035, L * 0.085, 0, 7); ctx.fill();
      ctx.fillStyle = "#9a96a3"; ctx.beginPath(); ctx.arc(L * k, -L * 0.035, L * 0.04, 0, 7); ctx.fill();
      ctx.strokeStyle = "#141316"; ctx.lineWidth = 1.5; const a = flying ? t * 12 : 0;
      ctx.beginPath(); ctx.moveTo(L * k, -L * 0.035); ctx.lineTo(L * k + Math.cos(a) * L * 0.04, -L * 0.035 + Math.sin(a) * L * 0.04); ctx.stroke();
    });
    ctx.restore();
  }


  // ---------------- tabs + loop ----------------
  function show(bay) {
    ["build", "arena", "lab"].forEach((k) => { $("bay-" + k).hidden = k !== bay; $("tab-" + k).setAttribute("aria-selected", k === bay); });
    try { history.replaceState(null, "", "#" + bay); } catch {}
  }
  document.querySelectorAll(".tab[data-bay]").forEach((t) => (t.onclick = () => { E.Sound.play("click"); show(t.dataset.bay); }));
  const start = (location.hash || "").replace("#", "");
  show(["build", "arena", "lab"].includes(start) ? start : "build");
  $("sound").onclick = () => { const on = E.Sound.toggle(); $("sound").textContent = "Sound: " + (on ? "on" : "off"); $("sound").setAttribute("aria-pressed", on); };

  renderRoster(); resetFight(); renderLabUI();
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { drawLab(now / 1000, dt); } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  })(last);
})();
