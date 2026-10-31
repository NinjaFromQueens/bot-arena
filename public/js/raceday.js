/* The board's Race Day page: the teacher runs a Grand Prix of up to 3 races, and the whole class races at once, each
   on their own device (race.html). The server keeps the state (room.gp, sent in room:state) and shares everyone's
   position 5 times a second (gp:live). This page shows it like a TV broadcast: a camera on the leader, a timing tower,
   a track map, then results, standings and a podium. Results come from the server, which drives every lap again. */
(function () {
  const E = window.Engine, R = window.Race, D = window.RaceDraw, M = window.Music;
  const { clamp, bigText, rr, Sound, RM, FX } = E;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
  const kmh = (v) => Math.round(v * 3.6);
  const setupName = (s) => (s ? `${R.GEARS[s.gear]}:1 · ${R.TIRES[s.tire].n}` : "");
  const socket = window.baSocket;
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem("ba-host")); } catch {}

  let ready = false, st = null, g = null, offset = 0, picks = [0, 1, 2];
  let live = { prev: null, cur: null }, follow = null, autoCam = null, camT = 0, finished = new Map(), bgX = 0;
  let toast = { text: "", sub: "", t: 0 }, skeleton = "", lastPhase = "", confettiT = 0, lastLight = -1;
  const fx = new FX();

  // the computer driver's fastest setup on a track (the same driver the tests and the lap report use)
  const bestCache = {};
  function bestSetup(tr) {
    if (bestCache[tr.id]) return bestCache[tr.id];
    let b = { gear: 1, tire: 1, time: Infinity };
    R.autoTimes(tr).forEach((row, gear) => row.forEach((time, tire) => { if (time < b.time) b = { gear, tire, time }; }));
    return (bestCache[tr.id] = b);
  }
  // between races a computer car drives the track, so the board always shows something moving
  const demo = { track: null, car: null, su: null, acc: 0 };
  function demoOn(tr) { if (demo.track !== tr) { demo.track = tr; demo.su = bestSetup(tr); demo.car = R.newCar(); demo.acc = 0; } }
  function demoStep(dt) {
    demo.acc += dt;
    while (demo.acc >= R.DT) {
      R.step(demo.car, demo.su, R.autopilot(demo.car, demo.su, 0.9, demo.track), demo.track); demo.acc -= R.DT;
      if (demo.car.z >= demo.track.LENGTH) demo.car.z -= demo.track.LENGTH; // keep going round
    }
  }

  const racers = () => new Map(((g && g.racers) || []).map((r) => [r.id, r]));
  const trackNow = () => R.TRACKS[g ? g.track : picks[0] || 0];
  const clock = () => Date.now() + offset;

  // ---------------- the live race ----------------
  // cars a fifth of a second behind live, so they move smoothly between the server's updates
  function cars(now) {
    const { prev, cur } = live; if (!cur || !g) return [];
    const f = prev ? clamp((now - 200 - prev.at) / Math.max(1, cur.at - prev.at), 0, 1) : 1;
    const old = new Map(prev ? prev.cars.map((c) => [c[0], c]) : []), rs = racers();
    return cur.cars.filter((c) => rs.has(c[0])).map((c) => {
      const p = old.get(c[0]) || c, r = rs.get(c[0]);
      return { id: c[0], z: p[1] + (c[1] - p[1]) * f, x: p[2] + (c[2] - p[2]) * f, v: p[3] + (c[3] - p[3]) * f, steer: clamp((c[2] - p[2]) * 1.5, -1, 1), done: !!c[4], color: r.color, name: r.builder };
    });
  }
  // finishers in the order they crossed the line, then everyone else by how far round they are
  function order(list) {
    return list.slice().sort((a, b) => (finished.has(a.id) ? finished.get(a.id).k : 1e9) - (finished.has(b.id) ? finished.get(b.id).k : 1e9) || b.z - a.z);
  }
  function camCar(list, ordered, now) {
    if (follow) { const c = list.find((x) => x.id === follow); if (c) return c; follow = null; }
    const leader = ordered.find((c) => !c.done) || ordered[ordered.length - 1];
    const cur = list.find((x) => x.id === autoCam);
    if (!cur || cur.done || (leader && leader.id !== autoCam && now - camT > 2500)) { autoCam = leader && leader.id; camT = now; }
    return list.find((x) => x.id === autoCam);
  }
  function onLive(snap) {
    live = { prev: live.cur, cur: { ...snap, at: performance.now() } };
    renderLive();
    if (!g || g.phase !== "racing") return;
    const rs = racers();
    for (const c of snap.cars) if (c[4] && !finished.has(c[0]) && rs.has(c[0])) {
      const k = finished.size + 1, name = rs.get(c[0]).builder;
      finished.set(c[0], { k, t: (clock() - g.startAt) / 1000 });
      toast = { text: `${name.toUpperCase()} FINISHES!`, sub: `${k === 1 ? "First" : `#${k}`} across the line`, t: 2.4 };
      Sound.play(k === 1 ? "win" : "join");
      if (!RM) fx.burst(innerWidth * 0.3, 80, k === 1 ? 40 : 14, { colors: E.COLORS, kind: "confetti", speed: 260, g: 260, life: 1.6, size: 6, angle: Math.PI / 2, spread: 2.4 });
    }
  }

  // ---------------- the side panel ----------------
  function act(ev, data) { if (ready) socket.emit(ev, data || {}, (r) => { if (r && r.ok === false && r.error) $("status").textContent = r.error; }); }
  function render() {
    const phase = !ready ? "off" : g ? g.phase : "setup", key = `${phase}:${g ? g.i : ""}`;
    $("status").textContent = !ready ? $("status").textContent : g ? `Race ${g.i + 1} of ${g.n} · ${phase === "done" ? "finished" : phase}` : "Ready";
    if (key !== skeleton) { skeleton = key; build(phase); }
    fill(phase);
    if (phase !== lastPhase) { onPhase(phase); lastPhase = phase; }
  }
  function build(phase) {
    const side = $("side"), T = trackNow(), next = g && g.i + 1 < g.n ? R.TRACKS[g.tracks[g.i + 1]] : null;
    const head = (title, tag, sub) => `<div class="panel"><h2>${esc(title)} <span class="tag">${tag}</span></h2>${sub ? `<p class="sub">${sub}</p>` : ""}</div>`;
    if (phase === "off") {
      side.innerHTML = head("Race Day", "GRAND PRIX", saved ? "Connecting to your game..." : "Open the board first (Host on the home page), then press <b>Race Day</b> in the lobby.");
    } else if (phase === "setup") {
      side.innerHTML = head("Race Day", "GRAND PRIX", "The whole class races at the same time, each on their own device. Points for every finish; the most points after the last race wins.") +
        `<div class="panel"><h3>Pick the tracks, in race order</h3><div class="tpick" id="tpick"></div></div>
        <div class="panel"><h3 id="cnt"></h3><ul class="racers" id="racers"></ul><p class="sub">Students: open <b>Robot Racer</b> from your game page.</p></div>
        <div class="actions"><button class="btn huge" id="gpstart" type="button" data-primary data-tip="Start Race Day with these tracks. Students' Robot Racer pages switch to the first track's garage. Shortcut: Space.">Start Race Day</button></div>`;
      $("gpstart").onclick = () => { Sound.play("click"); act("host:gp", { tracks: picks }); };
    } else if (phase === "garage") {
      side.innerHTML = head(`Race ${g.i + 1} of ${g.n}: ${T.n}`, "GARAGE", `${esc(T.about)} Students: pick your gear and tires now.`) +
        `<div class="panel"><h3 data-tip="Each student's gear and tires, live, as they pick them on their device.">What the class picked</h3><div class="chart" id="chart"></div></div>
        <div class="panel"><h3 id="cnt"></h3><ul class="racers" id="racers"></ul></div>
        <div class="actions"><button class="btn huge" id="go" type="button" data-primary data-tip="Lock the garage and start the lights. Everyone on Robot Racer races at once. Shortcut: Space.">Start race</button>
        <button class="btn ghost" id="close" type="button" data-tip="Stop Race Day for everyone. The results so far are lost.">End Race Day</button></div>`;
      $("go").onclick = () => { Sound.play("click"); act("host:gpGo"); };
      $("close").onclick = () => act("host:gpClose");
    } else if (phase === "countdown" || phase === "racing") {
      side.innerHTML = head(`Race ${g.i + 1}: ${T.n}`, "LIVE", "Click a name to follow that car with the camera.") +
        `<div class="panel"><ol class="live" id="live"></ol><p class="sub" id="nolive"></p></div>
        <div class="actions"><button class="btn ghost" id="cam" type="button" data-tip="Let the camera follow whoever is leading.">Camera: follow the leader</button>
        <button class="btn ghost" id="end" type="button" data-tip="Finish the race now. Anyone who hasn't crossed the line gets a DNF (did not finish).">End race now</button></div>`;
      $("live").onpointerdown = (e) => { const li = e.target.closest("li"); if (li) { follow = li.dataset.id; Sound.play("click"); renderLive(); } };
      $("cam").onclick = () => { follow = null; renderLive(); };
      $("end").onclick = () => act("host:gpEndRace");
    } else if (phase === "results") {
      side.innerHTML = `<div class="panel"><h2>Race ${g.i + 1} results <span class="tag">${esc(T.n.toUpperCase())}</span></h2><table class="res" id="res"></table></div>
        <div class="lesson" id="lesson"></div>
        <div class="panel"><h3>Standings after ${g.i + 1} race${g.i ? "s" : ""}</h3><table class="res" id="stand"></table></div>
        <div class="actions"><button class="btn huge" id="next" type="button" data-primary data-tip="${next ? `Open the garage for ${next.n}. Students can change their setup.` : "Show the final standings, the podium and the awards."} Shortcut: Space.">${next ? `Next race: ${esc(next.n)}` : "Final results"}</button></div>`;
      $("next").onclick = () => { Sound.play("click"); act("host:gpNext"); };
    } else if (phase === "done") {
      side.innerHTML = head("Race Day results", "PODIUM", "") +
        `<div class="panel"><h3>Awards</h3><div class="awards" id="awards"></div></div>
        <div class="panel"><h3>Final standings</h3><table class="res" id="stand"></table></div>
        <div class="actions"><button class="btn" id="again" type="button" data-tip="Run Race Day again on the same tracks, starting from zero points.">Race Day again</button>
        <button class="btn ghost" id="close" type="button" data-tip="Close Race Day. Students' Robot Racer pages go back to free practice.">Close Race Day</button></div>`;
      $("again").onclick = () => act("host:gp", { tracks: g.tracks });
      $("close").onclick = () => act("host:gpClose");
    }
  }
  function fill(phase) {
    const rs = (g && g.racers) || (st ? st.players.filter((p) => !p.out).map((p) => ({ id: p.id, builder: p.builder, color: E.COLORS[(p.bot && p.bot.color) | 0] })) : []);
    if (phase === "setup") {
      const box = $("tpick"); box.innerHTML = "";
      R.TRACKS.forEach((tr) => {
        const b = document.createElement("button"), k = picks.indexOf(tr.id); b.type = "button"; b.setAttribute("aria-pressed", k >= 0);
        b.setAttribute("data-tip", `${tr.n}: ${tr.about} Click to add it to Race Day or take it out.`);
        b.innerHTML = `<canvas width="128" height="128" aria-hidden="true"></canvas><span><b></b><small></small></span>${k >= 0 ? `<span class="ord">${k + 1}</span>` : ""}`;
        b.querySelector("b").textContent = tr.n; b.querySelector("small").textContent = tr.about;
        const c = b.querySelector("canvas").getContext("2d"); c.scale(2, 2); D.minimap(c, 0, 0, 64, tr, []);
        b.onclick = () => { if (k >= 0) { if (picks.length > 1) picks.splice(k, 1); } else picks.push(tr.id); Sound.play("click"); demoOn(R.TRACKS[picks[0]]); fill("setup"); };
        box.appendChild(b);
      });
      $("cnt").textContent = `${rs.length} student${rs.length === 1 ? "" : "s"} in the game`;
      chips(rs, () => true);
    } else if (phase === "garage") {
      const set = new Map(g.setups.map((s) => [s.id, s]));
      $("cnt").textContent = `${set.size} of ${rs.length} on Robot Racer`;
      chips(rs, (r) => set.has(r.id));
      const n = Math.max(1, set.size), count = (k, v) => g.setups.filter((s) => s[k] === v).length;
      $("chart").innerHTML = R.GEARS.map((gr, i) => [`${gr}:1`, count("gear", i)]).concat(R.TIRES.map((t, i) => [t.n, count("tire", i)])) // no hint which is best: that comes after the race
        .map(([l, c], i) => `${i === R.GEARS.length ? '<span style="grid-column:1/-1;height:4px"></span>' : ""}<span>${l}</span><div class="bar"><i style="width:${(c / n) * 100}%"></i></div><span class="n">${c}</span>`).join("");
    } else if (phase === "results" || phase === "done") {
      const res = g.results[g.i] || [];
      if ($("res")) $("res").innerHTML = `<tr><th>#</th><th>Racer</th><th class="num">Time</th><th class="num">Pts</th></tr>` + (res.length ? res.map((r, k) => `<tr><td>${r.time == null ? "-" : k + 1}</td><td>${esc(r.builder)}<small>${setupName(r.setup)}</small></td><td class="num">${r.time == null ? `DNF · ${Math.round(r.dist * 100)}%` : fmtTime(r.time)}</td><td class="num pts">+${r.pts}</td></tr>`).join("") : `<tr><td colspan="4">Nobody raced this time.</td></tr>`);
      if ($("lesson")) $("lesson").innerHTML = lessonText(res);
      $("stand").innerHTML = `<tr><th>#</th><th>Racer</th><th class="num">Points</th><th class="num">Best lap</th></tr>` + g.standings.map((s, k) => `<tr><td>${k + 1}</td><td>${esc(s.builder)}</td><td class="num pts">${s.pts}</td><td class="num">${s.best ? fmtTime(s.best) : "-"}</td></tr>`).join("");
      if ($("awards")) {
        const ic = { champ: "🏆", fast: "⏱️", clean: "✨", up: "📈" };
        $("awards").innerHTML = g.awards.length ? g.awards.map((a) => `<div class="award"><span class="ic">${ic[a.key] || "★"}</span><div><b>${esc(a.title)}</b><span>${esc(a.builder)}</span> <small>${esc(a.detail)}</small></div></div>`).join("") : '<p class="sub">No finishes, so no awards this time.</p>';
      }
    }
    if (phase === "countdown" || phase === "racing") renderLive();
  }
  function chips(rs, isIn) {
    const ul = $("racers"); if (!ul) return;
    ul.innerHTML = rs.map((r) => `<li class="${isIn(r) ? "in" : ""}"><i style="background:${r.color}"></i>${esc(r.builder)}${isIn(r) && g ? " ✓" : ""}</li>`).join("") || '<li>Nobody yet</li>';
  }
  // what this race showed about gears: the class's best lap with each gear, next to the computer driver's best setup
  function lessonText(res) {
    const T = trackNow(), best = bestSetup(T), byGear = R.GEARS.map(() => null);
    res.forEach((r) => { if (r.setup && r.time != null && (byGear[r.setup.gear] == null || r.time < byGear[r.setup.gear])) byGear[r.setup.gear] = r.time; });
    const used = R.GEARS.map((gr, i) => ({ gr, t: byGear[i], n: res.filter((r) => r.setup && r.setup.gear === i).length })).filter((x) => x.n);
    const fastest = used.filter((x) => x.t != null).sort((a, b) => a.t - b.t)[0];
    return `<b>What the gears did</b>${used.length ? used.map((x) => `${x.gr}:1 ${x.t != null ? fmtTime(x.t) : "no finish"}`).join(" · ") : "No laps to compare."}
      ${fastest ? `<br>Fastest gear in class today: <b style="display:inline;font-size:inherit">${fastest.gr}:1</b>.` : ""}
      <br>The computer driver's fastest setup on ${esc(T.n)}: ${setupName(best)} (${fmtTime(best.time)}).`;
  }
  function renderLive() {
    const ol = $("live"); if (!ol || !g) return;
    const list = order(cars(performance.now())), T = trackNow();
    $("nolive").textContent = list.length ? "" : "Waiting for racers. Students need Robot Racer open on their device.";
    const cam = follow || autoCam;
    ol.innerHTML = list.map((c, k) => {
      const f = finished.get(c.id);
      return `<li data-id="${esc(c.id)}" class="${c.id === cam ? "cam" : ""} ${c.done ? "done" : ""}"><span class="rk">P${k + 1}</span><span class="nm">${esc(c.name)}</span><span class="st">${c.done ? (f ? fmtTime(f.t) : "FINISHED") : `${kmh(c.v)} km/h`}</span><span class="prog"><i style="width:${clamp((c.z / T.LENGTH) * 100, 0, 100)}%;background:${c.color}"></i></span></li>`;
    }).join("");
  }
  function onPhase(phase) {
    toast.t = 0; fx.p = [];
    if (phase === "countdown") { finished = new Map(); follow = null; autoCam = null; live = { prev: null, cur: null }; lastLight = -1; }
    if (phase === "results") Sound.play("whoosh");
    if (phase === "done") { Sound.play("fanfare"); M.play(null); setTimeout(() => M.play("champion"), 1500); confettiT = 0; } // like the tournament: fanfare, then the victory song
    else M.play({ off: "garage", setup: "garage", garage: "garage", countdown: null, racing: "fight", results: "garage" }[phase]); // silence for the start lights
  }

  // ---------------- the TV picture ----------------
  const lightsFor = (rem) => (rem <= 0 ? "go" : rem > 3 ? 0 : Math.min(5, Math.floor((3 - rem) / 0.6) + 1));
  const panel = (ctx, x, y, w, h) => { ctx.fillStyle = "rgba(20,19,22,.72)"; rr(ctx, x, y, w, h, 10); ctx.fill(); };
  const font = (ctx, wt, px, fam) => (ctx.font = `${wt} ${Math.round(px)}px ${fam === "mono" ? '"JetBrains Mono", monospace' : fam === "body" ? '"Barlow Semi Condensed", Arial, sans-serif' : '"Chakra Petch", Arial, sans-serif'}`);
  function titleCard(ctx, w, h, big, small, line) {
    const g2 = ctx.createLinearGradient(0, h * 0.62, 0, h); g2.addColorStop(0, "rgba(10,9,14,0)"); g2.addColorStop(1, "rgba(10,9,14,.85)");
    ctx.fillStyle = g2; ctx.fillRect(0, h * 0.62, w, h * 0.38);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    font(ctx, 700, h * 0.03, "mono"); ctx.fillStyle = "#f46524"; ctx.fillText(small, w * 0.04, h * 0.8);
    font(ctx, 700, h * 0.085, "display"); ctx.fillStyle = "#fff"; ctx.fillText(big, w * 0.04, h * 0.89);
    if (line) { font(ctx, 600, h * 0.034, "body"); ctx.fillStyle = "#d9d5de"; ctx.fillText(line, w * 0.04, h * 0.95); }
  }
  function podium(ctx, w, h, t, rows, title, sub) {
    ctx.fillStyle = "rgba(12,11,16,.62)"; ctx.fillRect(0, 0, w, h);
    bigText(ctx, title, w / 2, h * 0.1, h * 0.07, "#ffd23f");
    if (sub) { font(ctx, 600, h * 0.034, "body"); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#d9d5de"; ctx.fillText(sub, w / 2, h * 0.18); }
    const bw = Math.min(w * 0.22, h * 0.36), base = h * 0.97, H = [h * 0.3, h * 0.21, h * 0.14], X = [w / 2, w / 2 - bw * 1.08, w / 2 + bw * 1.08];
    [2, 1, 0].forEach((k) => {
      const r = rows[k]; if (!r) return;
      const x = X[k], top = base - H[k], ks = bw * 0.6, bob = RM ? 0 : Math.abs(Math.sin(t * 3 + k)) * -4 * (k === 0 ? 1.5 : 1);
      const gr = ctx.createLinearGradient(0, top, 0, base); gr.addColorStop(0, ["#ffd23f", "#d9d5de", "#e0975a"][k]); gr.addColorStop(1, "#2b2a30");
      ctx.fillStyle = gr; rr(ctx, x - bw / 2, top, bw, H[k] + 20, 10); ctx.fill();
      bigText(ctx, String(k + 1), x, top + H[k] * 0.45, H[k] * 0.5, "#fff");
      D.kart(ctx, x, top - 2, ks, { color: r.color, t, v: 0, bob });
      const ny = top - ks * 1.12 - h * 0.05;
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      font(ctx, 700, h * (k ? 0.04 : 0.052), "display"); ctx.fillStyle = "#fff"; ctx.fillText(r.name, x, ny);
      font(ctx, 600, h * 0.026, "mono"); ctx.fillStyle = "#ffd23f"; ctx.fillText(r.line, x, ny + h * 0.04);
    });
  }
  function draw(t, dt, now) {
    const c = $("tv"), { ctx, w, h } = E.fit(c);
    const phase = !ready ? "off" : g ? g.phase : "setup", T = trackNow(), rs = racers();
    fx.update(dt);
    if (phase === "countdown" || phase === "racing") {
      const list = cars(now), ordered = order(list);
      if (phase === "countdown") { // the starting grid, two by two, seen from behind
        const grid = (list.length ? list : [...rs.values()].filter((r) => g.setups.some((s) => s.id === r.id)).map((r) => ({ id: r.id, color: r.color, name: r.builder })))
          .map((cc, k) => ({ ...cc, z: -Math.floor(k / 2) * 10 - (k % 2) * 5, x: k % 2 ? 1.6 : -1.6, v: 0 })); // staggered, so name tags don't overlap
        const back = grid.length ? Math.min(...grid.map((q) => q.z)) : 0, rem = (g.startAt - clock()) / 1000, L = lightsFor(rem);
        if (L !== lastLight) { if (typeof L === "number" && L > 0) Sound.play("beep"); if (L === "go") Sound.play("go"); lastLight = L; }
        D.world(ctx, w, h, T, { z: back - 1.5, x: 0 }, grid, { t, bgX, lights: L });
        bigText(ctx, rem > 3 ? "ON THE GRID" : rem > 0 ? String(Math.ceil(rem)) : "GO!", w / 2, h * 0.3, h * (rem > 3 ? 0.09 : 0.18), rem > 0 ? "#f4f1ea" : "#4fd18b");
        titleCard(ctx, w, h, T.n, `RACE ${g.i + 1} OF ${g.n}`, `${grid.length} racer${grid.length === 1 ? "" : "s"} on the grid`);
      } else {
        const cam = camCar(list, ordered, now), elapsed = clamp((clock() - g.startAt) / 1000, 0, g.limit);
        if (cam) {
          const seg = T.segAt(cam.z);
          const pos = D.world(ctx, w, h, T, cam, list.filter((q) => q.id !== cam.id), { t, bgX, lights: elapsed < 1.5 ? "go" : 0 });
          D.kart(ctx, pos.x, pos.y, pos.size, { color: cam.color, steer: cam.steer, t, v: cam.v });
          D.speedLines(ctx, w, h, pos.horizon, cam.v);
          bgX += seg.k * cam.v * dt * 900;
          // who the camera is on
          const k = ordered.indexOf(cam) + 1, bw = Math.min(w * 0.5, h * 0.9), by = h - h * 0.12;
          panel(ctx, w / 2 - bw / 2, by, bw, h * 0.085); ctx.fillStyle = cam.color; ctx.fillRect(w / 2 - bw / 2, by, h * 0.012, h * 0.085);
          ctx.textBaseline = "middle"; ctx.textAlign = "left"; font(ctx, 700, h * 0.045, "display"); ctx.fillStyle = "#fff"; ctx.fillText(cam.name, w / 2 - bw / 2 + h * 0.035, by + h * 0.044);
          ctx.textAlign = "right"; font(ctx, 700, h * 0.032, "mono"); ctx.fillStyle = "#ffd23f";
          ctx.fillText(cam.done ? "FINISHED" : `P${k} · ${kmh(cam.v)} km/h`, w / 2 + bw / 2 - h * 0.03, by + h * 0.044);
        } else {
          demoOn(T); demoStep(dt); D.world(ctx, w, h, T, demo.car, [], { t, bgX });
          bigText(ctx, "WAITING FOR RACERS", w / 2, h * 0.32, h * 0.06, "#fff");
        }
        // race clock
        panel(ctx, 14, 14, h * 0.36, h * 0.13); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
        font(ctx, 700, h * 0.024, "mono"); ctx.fillStyle = "#aaa6b0"; ctx.fillText(`RACE ${g.i + 1} · ${T.n.toUpperCase()}`, 26, 14 + h * 0.04);
        font(ctx, 700, h * 0.06, "mono"); ctx.fillStyle = "#fff"; ctx.fillText(fmtTime(elapsed), 26, 14 + h * 0.105);
        // timing tower, TV style
        const top = ordered.slice(0, 8), rh = h * 0.05, tw = h * 0.42, tx = w - tw - 14;
        panel(ctx, tx, 14, tw, rh * (top.length + 1) + 8);
        font(ctx, 700, h * 0.022, "mono"); ctx.fillStyle = "#f46524"; ctx.fillText("LIVE", tx + 12, 14 + rh * 0.7);
        ctx.textAlign = "right"; ctx.fillStyle = "#aaa6b0"; ctx.fillText(`${finished.size}/${list.length} HOME`, tx + tw - 12, 14 + rh * 0.7); ctx.textAlign = "left";
        top.forEach((q, k) => {
          const y = 14 + rh * (k + 1) + 4, lead = ordered[0], f = finished.get(q.id);
          if (cam && q.id === cam.id) { ctx.fillStyle = "rgba(244,101,36,.28)"; ctx.fillRect(tx + 4, y, tw - 8, rh - 2); }
          ctx.fillStyle = q.color; ctx.fillRect(tx + 8, y + rh * 0.2, 4, rh * 0.6);
          ctx.textBaseline = "middle"; font(ctx, 700, h * 0.026, "mono"); ctx.fillStyle = "#aaa6b0"; ctx.fillText(String(k + 1), tx + 18, y + rh / 2);
          font(ctx, 700, h * 0.03, "display"); ctx.fillStyle = "#fff"; ctx.fillText(q.name.slice(0, 12), tx + 18 + h * 0.04, y + rh / 2);
          ctx.textAlign = "right"; font(ctx, 600, h * 0.024, "mono");
          ctx.fillStyle = f ? "#4fd18b" : "#d9d5de"; ctx.fillText(f ? fmtTime(f.t) : k === 0 ? "LEADER" : lead && !lead.done ? `+${Math.round(lead.z - q.z)} m` : `${Math.round((q.z / T.LENGTH) * 100)}%`, tx + tw - 12, y + rh / 2);
          ctx.textAlign = "left";
        });
        const ms = Math.round(h * 0.3);
        D.minimap(ctx, 14, h - ms - 14, ms, T, list.map((q) => ({ z: q.z, color: q.color, me: cam && q.id === cam.id })));
      }
    } else if (phase === "results" || phase === "done") {
      demoOn(T); demoStep(dt);
      D.world(ctx, w, h, T, demo.car, [], { t, bgX: (bgX += dt * 6) });
      const src = phase === "done" ? g.standings : (g.results[g.i] || []).filter((r) => r.time != null);
      const rows = src.slice(0, 3).map((r) => ({ name: r.builder, color: (rs.get(r.id) || {}).color || "#9fd8ff", line: phase === "done" ? `${r.pts} pts` : fmtTime(r.time) }));
      if (phase === "done") {
        podium(ctx, w, h, t, rows, "RACE DAY CHAMPIONS", g.awards.length ? `Fastest lap: ${g.awards.find((a) => a.key === "fast") ? g.awards.find((a) => a.key === "fast").builder : "-"}` : "");
        confettiT -= dt;
        if (confettiT <= 0 && (!RM || confettiT > -0.1)) { confettiT = RM ? 1e9 : 0.3; fx.burst(Math.random() * w, -10, RM ? 30 : 10, { colors: E.COLORS.concat("#fff"), kind: "confetti", speed: 60, g: 90, life: 3.2, size: 6, angle: Math.PI / 2, spread: 1.2, drag: 0.98 }); }
      } else podium(ctx, w, h, t, rows, `RACE ${g.i + 1}: ${T.n.toUpperCase()}`, rows.length ? "Fastest laps, checked by the server" : "Nobody finished this race");
    } else { // setup, garage, or not connected yet: the computer car shows off the track
      demoOn(T); demoStep(dt);
      const seg = T.segAt(demo.car.z), pos = D.world(ctx, w, h, T, demo.car, [], { t, bgX });
      D.kart(ctx, pos.x, pos.y, pos.size, { color: "#f46524", t, v: demo.car.v });
      bgX += seg.k * demo.car.v * dt * 900;
      const ms = Math.round(h * 0.3); D.minimap(ctx, w - ms - 14, 14, ms, T, [{ z: demo.car.z, color: "#f46524", me: true }]);
      if (phase === "garage") titleCard(ctx, w, h, T.n, `RACE ${g.i + 1} OF ${g.n} · GARAGE OPEN`, `${g.setups.length} racer${g.setups.length === 1 ? "" : "s"} choosing gears and tires`);
      else titleCard(ctx, w, h, "RACE DAY", "ROBOT RACER GRAND PRIX", phase === "setup" ? `${picks.length} race${picks.length === 1 ? "" : "s"}: ${picks.map((p) => R.TRACKS[p].n).join(", ")}` : "");
    }
    fx.draw(ctx);
    if (toast.t > 0) {
      toast.t -= dt; const a = clamp(toast.t, 0, 1);
      bigText(ctx, toast.text, w / 2, h * 0.24, h * 0.07, "#ffd23f", 1, a);
      ctx.globalAlpha = a; font(ctx, 600, h * 0.034, "body"); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#fff"; ctx.fillText(toast.sub, w / 2, h * 0.31); ctx.globalAlpha = 1;
    }
  }
  // click the picture: follow the next car
  $("tv").onclick = () => {
    if (!g || g.phase !== "racing") return;
    const list = order(cars(performance.now())); if (!list.length) return;
    const k = list.findIndex((q) => q.id === (follow || autoCam));
    follow = list[(k + 1) % list.length].id; Sound.play("click"); renderLive();
  };

  // ---------------- controls ----------------
  $("music").onclick = () => { const on = M.toggle(); $("music").textContent = "Music: " + (on ? "on" : "off"); $("music").setAttribute("aria-pressed", on); };
  $("sound").onclick = () => { const on = Sound.toggle(); $("sound").textContent = "Sound: " + (on ? "on" : "off"); $("sound").setAttribute("aria-pressed", on); };
  addEventListener("keydown", (e) => { // presentation clickers: Space / → / PageDown press the main button
    if (!(e.key === " " || e.key === "ArrowRight" || e.key === "PageDown")) return;
    if (e.target.closest && e.target.closest("input, select, textarea, button, a")) return;
    const b = document.querySelector("[data-primary]"); if (b && !b.disabled) { e.preventDefault(); b.click(); }
  });

  // ---------------- connection ----------------
  if (!socket || !saved) { $("status").textContent = "No game in this tab"; render(); }
  else {
    socket.on("connect", () => socket.emit("host:resume", saved, (r) => {
      ready = !!(r && r.ok); $("status").textContent = ready ? "Connected" : "That game has ended";
      render();
    }));
    socket.on("disconnect", () => { ready = false; $("status").textContent = "Reconnecting..."; render(); });
    socket.on("room:state", (s) => {
      st = s; const was = g; g = s.gp;
      if (g) { offset = g.now - Date.now(); if (!was || was.tracks.join() !== g.tracks.join()) picks = g.tracks.slice(); }
      render();
    });
    socket.on("gp:live", onLive);
  }

  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    try { draw(now / 1000, dt, now); } catch (err) { console.error(err); }
    requestAnimationFrame(loop);
  })(last);
  window.__rd = { get g() { return g; }, get follow() { return follow; }, get autoCam() { return autoCam; }, get finished() { return finished; }, get picks() { return picks; } };
})();
