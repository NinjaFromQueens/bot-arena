/* Robot Racer page: pick a track and a setup, race a lap, read the report; ghost cars and the class leaderboard;
   and Race Day, when the board runs a Grand Prix and the whole class drives at once.
   The physics is race.js (shared with the server). A lap runs in fixed 1/60 s steps and records one letter per step,
   so the report, the ghost and the server's check all drive exactly the same lap again. Drawing is racedraw.js. */
(function () {
  const E = window.Engine, R = window.Race, D = window.RaceDraw;
  const { clamp, bigText, rr, Sound, RM, FX } = E;
  const $ = (id) => document.getElementById(id);
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const kmh = (v) => Math.round(v * 3.6);
  const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
  const nameOf = (su) => `${R.GEARS[su.gear]}:1 · ${R.TIRES[su.tire].n}`;
  const MEDAL = { gold: "🥇", silver: "🥈", bronze: "🥉" }, medalTimes = (tr) => { const m = R.medals(tr); return `Gold ${fmtTime(m.gold)} · Silver ${fmtTime(m.silver)} · Bronze ${fmtTime(m.bronze)}`; };

  let track = R.trackOf(ls.get("race-track", 0)), setup = R.clampSetup(ls.get("race-setup", { gear: 1, tire: 1 }));
  const bests = ls.get("race-bests", {}); // track id -> { time, setup, inputs }
  { const old = ls.get("race-best", null); if (old && !bests[0]) bests[0] = old; } // from before there were several tracks
  for (const id of Object.keys(bests)) { const b = bests[id], r = b && b.inputs && R.lap(b.setup, b.inputs, +id); if (r && r.finished) b.time = r.time; else delete bests[id]; } // drive them again in case the physics changed
  const saved = ls.get("ba-bot", null) || ls.get("rba-bot", null);
  // your car's look (the paint shop): starts in your robot's color with a random race number
  let look = R.cleanLook(ls.get("race-look", null) || { c1: (saved && saved.color) | 0, num: 1 + Math.floor(Math.random() * 99) });
  ls.set("race-look", look);

  // ---------------- class game (a saved game pass): leaderboards, ghosts, and Race Day ----------------
  const socket = window.baSocket;
  let who = null;
  try { const s = JSON.parse(localStorage.getItem("ba-session")); if (s && s.code && s.playerId && s.token) who = { code: s.code, playerId: s.playerId, token: s.token }; } catch {}
  const cls = { on: !!(socket && who), boards: R.TRACKS.map(() => []), gp: null, offset: 0, live: { prev: null, cur: null }, racers: new Map() };
  const inGp = () => !!(cls.gp && cls.gp.phase !== "done");
  // A mission (/race?mission=<id>) runs on a test-bench strip with only the choices it allows. The student predicts
  // before every run; the right answer, the goal and the explanation come from race.js (MISSION, through missions.js).
  const missionId = new URLSearchParams(location.search).get("mission");
  const mis = { on: !!missionId, m: null, card: null, cur: null, prev: null, first: null, next: null, tries: [], still: 0, gloss: {} };
  if (mis.on) { cls.on = false; document.body.classList.add("mission"); } // no class leaderboard or Race Day during a mission

  // ---------------- the race ----------------
  let state = "garage"; // garage | countdown | race | done
  let car = R.newCar(), inputs = "", acc = 0, cd = 0, doneT = 0, lastLap = null, sent = false;
  const view = { w: 800, h: 450 }; // the canvas size last drawn, for effects started outside draw()
  let ghost = null, ghostSrc = null, ghostLabel = "your best", secShown = -1, toast = { text: "", t: 0 }, stall = 0, bgX = 0, wallT = 0;
  const fx = new FX();
  const keys = { left: false, right: false, gas: false, brake: false };
  const input = () => ({ steer: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), gas: keys.gas ? 1 : 0, brake: keys.brake ? 1 : 0 });
  let lastIn = { steer: 0, gas: 0, brake: 0 }; // what the last step really used (the keys, or Torque driving)
  // one step's input: on a Cadet mission the computer driver drives ("Torque drives"), and with steering help on it steers
  // while the student works the gas and brake. Applied inside the fixed steps, so a Cadet's run is the computer's run.
  function stepInput() {
    if (mis.on && mis.m && driveMode() === "auto") return R.autopilot(car, setup, undefined, track);
    const i = input();
    if (mis.on && mis.help) i.steer = R.autopilot(car, setup, undefined, track).steer;
    return i;
  }
  function makeGhost(src) { // a ghost is a lap driven again: its position at every step
    if (!src || !src.inputs) return null;
    const su = R.clampSetup(src.setup), c = R.newCar(), pos = [];
    for (const ch of src.inputs) { const i = R.decode(ch); if (!i) break; R.step(c, su, i, track); pos.push(c.z, c.x); if (c.z >= track.LENGTH) break; }
    return { pos, steps: pos.length / 2 };
  }
  function reset() { car = R.newCar(); inputs = ""; acc = 0; secShown = -1; stall = 0; fx.p = []; fx.txt = []; lastLap = null; sent = false; }
  let low = ls.get("race-low", false); // simple graphics for slower computers
  $("lowgfx").checked = low;
  $("lowgfx").onchange = () => { low = $("lowgfx").checked; ls.set("race-low", low); };
  function start() { // a solo time trial, or a mission run
    if (inGp() || state === "countdown" || state === "race") return;
    if (mis.on) {
      if (!mis.m || state !== "garage" || needPrediction()) return; // predict first, on a fresh try
      const pred = mis.card ? mis.card.value : mis.first;
      if (mis.card) mis.card.lock();
      if (mis.first == null) mis.first = pred;
      mis.cur = { choice: { ...setup }, predicted: pred }; mis.still = 0;
    }
    reset(); cd = 3.4; hideResultCard();
    ghost = !mis.on && $("ghost").checked ? makeGhost(ghostSrc && ghostSrc.track === track.id ? ghostSrc : bests[track.id]) : null;
    state = "countdown"; if (!mis.on) $("report").innerHTML = ""; renderAll(); Sound.play("beep");
    try { $("road").scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "nearest" }); } catch {}
  }
  function stop() { state = "garage"; reset(); renderAll(); }
  function finish() {
    if (mis.on) return missionDone();
    state = "done"; doneT = 0;
    const r = R.lap(setup, inputs, track); // the recorded lap, driven again: the same numbers the server gets
    lastLap = { setup: { ...setup }, inputs, time: r.time, track: track.id };
    const b = bests[track.id], isBest = r.finished && (!b || r.time < b.time);
    if (isBest) { bests[track.id] = { time: r.time, setup: { ...setup }, inputs }; ls.set("race-bests", bests); }
    Sound.play(isBest ? "fanfare" : "win");
    if (!RM && (isBest || inGp())) fx.burst(view.w / 2, view.h * 0.32, 50, { colors: E.COLORS, kind: "confetti", speed: 320, g: 300, life: 1.8, size: 6, angle: -Math.PI / 2, spread: 2.6 });
    if (inGp()) socket.emit("player:gpLap", { setup, inputs }, (res) => { sent = true; lastLap.gp = res; renderGp(); });
    showReport(r, isBest);
    if (!inGp()) showResultCard({ good: r.finished, title: r.finished ? `Finish! ${fmtTime(r.time)}` : "Didn't finish", line: isBest ? "A new best lap!" : bests[track.id] ? `Your best: ${fmtTime(bests[track.id].time)}` : "", next: "Race again", onNext: start, why: "See the lap report" });
    renderAll();
  }
  $("go").onclick = () => (mis.on && state === "done" ? nextTry() : start());
  $("quit").onclick = () => { Sound.play("click"); if (mis.on) nextTry(); else stop(); }; // a stopped mission run needs a fresh prediction

  // ---------------- garage ----------------
  function renderTracks() {
    const busy = state === "countdown" || state === "race" || inGp();
    $("o-track").innerHTML = "";
    R.TRACKS.forEach((tr) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "tcard"; b.disabled = busy && tr.id !== track.id; b.setAttribute("aria-pressed", tr.id === track.id);
      b.innerHTML = '<canvas width="96" height="96" aria-hidden="true"></canvas><span><b></b><small></small></span>';
      const md = bests[tr.id] && R.medalOf(bests[tr.id].time, tr);
      b.querySelector("b").textContent = tr.n + (md ? " " + MEDAL[md] : ""); b.querySelector("small").textContent = tr.about;
      b.setAttribute("data-tip", `${tr.n}: ${tr.about}${bests[tr.id] ? ` Your best: ${fmtTime(bests[tr.id].time)}${md ? ` (${md} medal)` : ""}.` : ""} Medals: ${medalTimes(tr)}.`);
      D.minimap(b.querySelector("canvas").getContext("2d"), 0, 0, 96, tr, []);
      b.onclick = () => { if (busy) return; track = tr; ls.set("race-track", tr.id); Sound.play("click"); stop(); renderBoard(); };
      $("o-track").appendChild(b);
    });
  }
  function renderGarage() {
    const locked = state === "countdown" || state === "race" || (inGp() && cls.gp.phase !== "garage");
    const all = R.GEARS.map((_, g) => R.TIRES.map((_, t) => R.setupStats({ gear: g, tire: t }, track))), flat = all.flat();
    const top = (k) => Math.max(...flat.map((s) => s[k]));
    // on a mission only the allowed choices can change, and nothing hints at the answer before the student predicts
    const fixed = (key, i) => mis.on && !!mis.m && !mis.m.allow[key]?.includes(i);
    const opts = (el, list, key, label, sub, tip) => {
      $(el).innerHTML = "";
      list.forEach((item, i) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "opt"; b.disabled = locked || fixed(key, i) || (mis.on && state === "done");
        b.setAttribute("aria-pressed", setup[key] === i); b.innerHTML = "<b></b><span></span>";
        b.firstChild.textContent = label(item, i); b.lastChild.textContent = sub(item, i);
        b.setAttribute("data-tip", fixed(key, i) ? "Not part of this test. Torque keeps everything else the same, so only one thing changes." : tip(item, i));
        b.onclick = () => { setup[key] = i; if (!mis.on) ls.set("race-setup", setup); Sound.play("click"); if (inGp()) socket.emit("player:gpSetup", setup); renderGarage(); };
        $(el).appendChild(b);
      });
    };
    const K = track.keys;
    opts("o-gear", R.GEARS, "gear", (g) => `${g}:1`, (g, i) => (!mis.on && all[i][setup.tire].hill < 0.3 ? "stalls here" : `${kmh(all[i][setup.tire].top)} km/h`),
      (g, i) => mis.on ? `${g}:1 gear: the motor turns ${g} times for every turn of the wheels. Top speed on flat ground: ${kmh(all[i][setup.tire].top)} km/h.`
        : `${g}:1 gear: the motor turns ${g} times per wheel turn. Top speed ${kmh(all[i][setup.tire].top)} km/h; ${all[i][setup.tire].hill < 0.3 ? `too weak to climb the ${K.hill}` : `climbs the ${K.hill} at ${kmh(all[i][setup.tire].hill)} km/h`}.`);
    opts("o-tire", R.TIRES, "tire", (t) => t.n, (t) => `grip ${t.mu}`, (t) => `${t.n} tires: ${t.d}.`);
    const g = R.GEARS[setup.gear], st = all[setup.gear][setup.tire];
    $("d-gear").textContent = `${g}:1 means the motor turns ${g} times for every turn of the wheels. ${setup.gear === 0 ? "The fastest on straights, but the weakest on hills." : setup.gear === R.GEARS.length - 1 ? "The strongest push, but a low top speed." : "A balance of speed and pushing force."}`;
    $("d-tire").textContent = R.TIRES[setup.tire].d + ".";
    drawGearPic();
    const rows = [
      ["Top speed", st.top, top("top"), kmh(st.top) + " km/h", "var(--blue)", "The fastest the car goes on flat ground: where the motor reaches its top rpm."],
      [K.hill, st.hill, top("hill"), st.hill < 0.3 ? "stalls" : kmh(st.hill) + " km/h", "var(--good)", `The steady speed the car can hold up the ${hillDeg(track)} ${K.hill}. With less gearing, the motor runs out of torque on steep hills.`],
      ["Push", st.push, top("push"), st.push + " N", "var(--orange)", "How hard the wheels push when starting from a stop (the motor's torque times the gear ratio, up to what the tires can grip)."],
      [K.corner, st.corner, top("corner"), kmh(st.corner) + " km/h", "var(--purple)", `The fastest the tires can hold the ${K.corner}. Any faster and the car slides onto the grass.`],
    ];
    if (mis.on) return; // a mission's report explains the numbers after the run instead
    $("gstats").innerHTML = rows.map(([l, v, mx, txt, c, tip]) => `<span class="hastip" tabindex="0" data-tip="${tip}">${l}</span><div class="bar"><i style="width:${clamp((v / mx) * 100, 4, 100)}%;background:${c}"></i></div><span class="n">${txt}</span>`).join("");
    const b = bests[track.id];
    const md = b && R.medalOf(b.time, track);
    $("bestline").innerHTML = (b ? `Your best on ${track.n}: <b>${fmtTime(b.time)}</b> (${nameOf(b.setup)})${md ? ` ${MEDAL[md]}` : ""}` : `No laps on ${track.n} yet. Your best lap becomes your ghost car.`) +
      `<br><span class="hastip" tabindex="0" data-tip="Gold means you matched the computer driver's best lap on this track, with its best setup. Silver is within 10% of it, bronze within 25%.">${medalTimes(track)}</span>`;
  }
  // hills in degrees, the unit lesson 7 uses; Operatives also see the percent grade
  const hillDeg = (tr) => `${(Math.atan(tr.steep) * 180 / Math.PI).toFixed(1)}°${window.Tier && Tier.current() === "operative" ? ` (a ${Math.round(tr.steep * 100)}% grade)` : ""}`;
  // the garage's gearbox picture: the same drawing as lesson 7's simulator (Engine.gearPair)
  function drawGearPic() {
    const c = $("gearpic"); if (!c.offsetParent) return;
    const { ctx, w, h } = E.fit(c), g = R.GEARS[setup.gear], Rg = h * 0.4, wx = w / 2 + Rg * 0.9, wy = h * 0.45;
    ctx.clearRect(0, 0, w, h);
    const gp = E.gearPair(ctx, wx, wy, Rg, g, 0.4);
    ctx.font = `600 ${Math.max(10, Math.round(h * 0.14))}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0"; ctx.textAlign = "center";
    ctx.fillText("wheel", wx, h - 3); ctx.textAlign = "right"; ctx.fillText("motor", gp.left - 4, wy + h * 0.05); // beside its gear: it can be tiny
    ctx.font = `700 ${Math.round(h * 0.26)}px "Chakra Petch", Arial, sans-serif`; ctx.fillStyle = "#ffd23f"; ctx.textAlign = "left";
    ctx.fillText(`${g}:1`, wx + Rg + 14, wy + h * 0.09);
    c.setAttribute("aria-label", `The gearbox at ${g}:1: the motor's small gear turns ${g} times for every turn of the wheel's big gear.`);
  }
  function renderAll() {
    if (!mis.on) renderTracks();
    renderGarage(); renderGp();
    const gp = inGp();
    $("go").hidden = gp; $("quit").hidden = gp;
    $("go").disabled = state === "countdown" || state === "race"; $("go").textContent = state === "done" ? "Race again" : "Start race";
    if (mis.on) {
      $("go").disabled = !mis.m || state === "countdown" || state === "race" || (state === "garage" && needPrediction());
      const auto = !!mis.m && driveMode() === "auto";
      $("go").textContent = state === "done" ? "Next try" : auto ? "Watch Torque drive" : "Run the test";
      $("go").setAttribute("data-tip", state === "done" ? "Set up your next try: change one thing, then predict again." : auto ? "Torque drives the car with your gear. Predict first, then watch what happens." : "Run the test with this gear. Predict first: the button wakes up when you do.");
    }
    $("quit").disabled = !(state === "countdown" || state === "race");
  }

  // ---------------- missions ----------------
  const page = (name) => (window.OFFLINE_PAGES && window.OFFLINE_PAGES[name]) || "/" + name; // the offline copies link to each other
  const lessonHref = (id) => `${page("learn")}#lesson-${encodeURIComponent(id)}`;
  const missionHref = (id) => `${page("race")}?mission=${encodeURIComponent(id)}`;
  const tierNow = () => (window.Tier ? Tier.current() : "recruit");
  const choiceKey = (c) => JSON.stringify(Missions.choice(mis.m, c));
  const untested = () => Missions.allChoices(mis.m).filter((c) => !mis.tries.some((t) => choiceKey(t.choice) === choiceKey(c)));
  const gearName = (c) => `${R.GEARS[c.gear]}:1`;
  // a "which gear wins?" question is asked before the first run only; every other kind before every run
  // how this reading level drives a mission: "auto" (Cadets: Torque drives), "assist" (steering help) or "full"
  const driveMode = () => Missions.text(mis.m, "drive", tierNow()) || "full";
  const LEVELS = [["cadet", "Cadet", "Grades 1 to 3: Torque drives, and you choose and predict."], ["recruit", "Recruit", "Grades 4 to 8: you drive, with steering help you can switch off."], ["operative", "Operative", "Grades 9 to 12: full control and all the numbers."]];
  const needPrediction = () => !(Missions.once(mis.m) && mis.first != null) && (!mis.card || mis.card.value == null);
  function missionLoad() {
    const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(u + " " + r.status))));
    const data = window.MISSION_DATA; // the offline copy has every mission built in
    const mission = (id) => (data ? (data.missions[id] ? Promise.resolve(data.missions[id]) : Promise.reject(new Error(id))) : get(`/data/missions/${encodeURIComponent(id)}.json`));
    const index = data ? Promise.resolve(data.index) : get("/data/missions/index.json").catch(() => []);
    const glossary = window.GLOSSARY_DATA ? Promise.resolve(window.GLOSSARY_DATA) : get("/data/glossary.json").catch(() => []);
    Promise.all([mission(missionId), index, glossary]).then(([m, ids, gl]) => {
      Missions.register("racer", R.MISSION);
      if (m.game !== "racer" || Missions.check(m).length) throw new Error("not a Racer mission");
      mis.m = m; track = R.stripOf(m.setting); setup = Missions.choice(m, m.start); mis.help = driveMode() === "assist";
      for (const g of gl) mis.gloss[g.id] = { term: g.term, forms: g.forms, def: window.Tier ? Tier.text(g.def, tierNow()) : g.def };
      renderMission(); nextTry();
      const nid = ids[ids.indexOf(m.id) + 1]; // the lesson's next mission, offered once this one is done
      if (nid) mission(nid).then((n) => { if (n.lesson === m.lesson) mis.next = n; }, () => {});
    }).catch(() => {
      $("missionp").hidden = false;
      $("missionp").innerHTML = '<h2>That mission didn\'t load</h2><p>Check your connection and refresh the page, or <a href="/race">race in free play</a>.</p>';
    });
  }
  function renderMission() {
    const m = mis.m, box = $("missionp");
    box.hidden = false; box.innerHTML = "";
    const head = document.createElement("div"); head.className = "mhead";
    const h = document.createElement("h2"); h.textContent = `Mission: ${m.title || track.n}`;
    const back = document.createElement("a"); back.className = "btn ghost"; back.href = lessonHref(m.lesson); back.textContent = "Back to the lesson";
    back.setAttribute("data-tip", "Open the lesson this mission tests. You can come back here any time.");
    head.append(h, back);
    const brief = document.createElement("p"); brief.className = "mbrief"; const who = document.createElement("b"); who.textContent = "Torque: ";
    brief.append(who, Missions.text(m, "brief", tierNow()));
    const steps = document.createElement("ol"), auto = driveMode() === "auto"; steps.className = "msteps";
    (Missions.once(m) ? ["Predict", auto ? "Watch every gear" : "Test every gear", "Compare the times", "Find out why"] : ["Pick a gear", "Predict", auto ? "Watch Torque drive" : "Run the test", "Find out why"]).forEach((s) => { const li = document.createElement("li"); li.textContent = s; steps.appendChild(li); });
    // the reading level (this device: cr-tier) and, when the student drives, steering help
    const opts = document.createElement("div"); opts.className = "mopts";
    const lbl = document.createElement("span"); lbl.className = "small"; lbl.textContent = "Reading level:"; opts.appendChild(lbl);
    LEVELS.forEach(([t, name, tip]) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = name; b.setAttribute("aria-pressed", String(tierNow() === t)); b.setAttribute("data-tip", tip);
      b.onclick = () => { if (state === "countdown" || state === "race" || tierNow() === t) return; Tier.set(t); mis.help = driveMode() === "assist"; Sound.play("click"); renderMission(); if (state === "garage") nextTry(); else renderAll(); };
      opts.appendChild(b);
    });
    if (!auto) {
      const help = document.createElement("label"); help.className = "toggle"; help.setAttribute("data-tip", "Steering help keeps the car on the road, so you only work the gas and brake. Switch it off to steer yourself.");
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!mis.help; cb.onchange = () => { mis.help = cb.checked; };
      help.append(cb, " Steering help"); opts.appendChild(help);
    }
    box.append(head, brief, steps, opts);
  }
  // a new try: back to the garage (the choices stay as they were), with a fresh prediction card when one is needed
  function nextTry() {
    state = "garage"; reset(); hideResultCard();
    const m = mis.m, tier = tierNow(), box = $("report");
    box.innerHTML = "";
    if (Missions.once(m) && mis.first != null) {
      mis.card = null;
      const label = (Missions.options(m, tier).find((o) => o.value === mis.first) || {}).label, left = untested();
      const note = document.createElement("div"); note.className = "pcard";
      const k = document.createElement("span"); k.className = "pkick"; k.textContent = "Your prediction";
      const q = document.createElement("p"); q.className = "pq"; q.textContent = `${Missions.text(m, "question", tier)} You said ${label}.`;
      const s = document.createElement("p"); s.className = "pstatus";
      s.textContent = left.length ? `Test every gear to find out. Still to try: ${left.map(gearName).join(", ")}.` : "You've tried every gear. Run any of them again, or go on to the next mission.";
      note.append(k, q, s); box.appendChild(note);
    } else mis.card = Cards.predict(box, { question: Missions.text(m, "question", tier), options: Missions.options(m, tier), onPick: () => renderAll() });
    renderAll();
  }
  function missionDone() {
    state = "done"; doneT = 0;
    const m = mis.m, run = { inputs }, res = Missions.result(m, setup, run), answer = Missions.answer(m, setup);
    const t = { choice: { ...setup }, predicted: mis.cur.predicted, answer, right: mis.cur.predicted === answer, goal: res.goal, finished: !!res.result.finished,
      time: res.result.finished ? res.result.time : null, top: Math.max(...res.result.sec.map((s) => s.vMax)) };
    const prev = mis.prev; mis.tries.push(t); mis.prev = t;
    const prog = ls.get("cr-missions", {}), p = prog[m.id] || { tries: 0, firstRight: null, goal: false }; // this device only
    p.tries++; if (p.firstRight === null) p.firstRight = t.right; p.goal = p.goal || t.goal; prog[m.id] = p; ls.set("cr-missions", prog);
    lastLap = { setup: { ...setup }, inputs, time: t.time, track: track.id, mission: t };
    Sound.play(t.finished ? "win" : "miss");
    // no cheering for the winning gear before every gear has been tried: that would give the answer away
    if (!RM && t.goal && (!Missions.once(m) || !untested().length)) fx.burst(view.w / 2, view.h * 0.32, 40, { colors: E.COLORS, kind: "confetti", speed: 300, g: 300, life: 1.6, size: 6, angle: -Math.PI / 2, spread: 2.6 });
    showMissionReport(t, prev);
    const once = Missions.once(m), left = untested();
    showResultCard({ good: t.finished, title: t.finished ? `Made it! ${t.time.toFixed(1)} s` : "Stuck!",
      line: once && left.length ? `Gears still to try: ${left.map(gearName).join(", ")}` : t.right ? "✓ Your prediction was right." : "✗ Not what you predicted.",
      next: "Next try", onNext: nextTry, why: "See why" });
    renderAll();
  }
  // R-18: the result on the track view, so nobody has to scroll to find out what happened
  let cardShown = false;
  function showResultCard(o) {
    const c = $("rescard"); c.innerHTML = ""; c.className = "rescard " + (o.good ? "good" : "bad");
    const h = document.createElement("b"); h.className = "rtitle"; h.textContent = o.title; c.appendChild(h);
    if (o.line) { const p = document.createElement("p"); p.textContent = o.line; c.appendChild(p); }
    const row = document.createElement("div"); row.className = "rrow";
    const why = document.createElement("button"); why.type = "button"; why.className = "btn ghost"; why.textContent = o.why + " ↓";
    why.setAttribute("data-tip", "Jump to the explanation under the track."); why.onclick = () => $("report").scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" });
    const nx = document.createElement("button"); nx.type = "button"; nx.className = "btn"; nx.textContent = o.next; nx.setAttribute("data-tip", "Go again right away."); nx.onclick = o.onNext;
    row.append(why, nx); c.appendChild(row); c.hidden = false; cardShown = true;
  }
  function hideResultCard() { $("rescard").hidden = true; cardShown = false; }
  // each gear's best result so far; the winner is marked once every gear has been tried
  function timesTable() {
    const m = mis.m, topQ = m.predict.kind === "topGear", done = !untested().length, ans = Missions.answer(m, setup);
    const tbl = document.createElement("table"); tbl.className = "mtimes";
    const cap = document.createElement("caption"); cap.textContent = "Your tests so far"; tbl.appendChild(cap);
    const head = document.createElement("tr"); ["Gear", "Time to the end"].concat(topQ ? ["Top speed"] : []).forEach((x) => { const th = document.createElement("th"); th.textContent = x; head.appendChild(th); });
    tbl.appendChild(head);
    for (const c of Missions.allChoices(m)) {
      const runs = mis.tries.filter((t) => choiceKey(t.choice) === choiceKey(c)), fin = runs.filter((t) => t.finished), row = document.createElement("tr");
      const cells = [gearName(c) + (done && c.gear === ans ? " ★" : ""), !runs.length ? "not tried yet" : fin.length ? `${Math.min(...fin.map((t) => t.time)).toFixed(1)} s` : "stuck"];
      if (topQ) cells.push(runs.length ? `${Math.round(Math.max(...runs.map((t) => t.top)) * 3.6)} km/h` : "–");
      cells.forEach((x) => { const td = document.createElement("td"); td.textContent = x; row.appendChild(td); });
      if (done && c.gear === ans) row.className = "win";
      tbl.appendChild(row);
    }
    return tbl;
  }
  function showMissionReport(t, prev) {
    const m = mis.m, tier = tierNow(), rep = $("report"), opts = Missions.options(m, tier), once = Missions.once(m), done = !untested().length;
    const label = (v) => (opts.find((o) => o.value === v) || {}).label || v;
    const place = track.SECTIONS.some((s) => s.slope > 0) && !track.SECTIONS.some((s) => !s.slope && s.len >= 60) ? "the top" : "the end";
    const e = R.MISSION.explain(m, setup, { inputs });
    const verdict = document.createElement("div"), vb = document.createElement("b");
    if (!once || done) {
      verdict.className = "verdict " + (t.right ? "good" : "bad"); vb.textContent = t.right ? "✓ Your prediction was right." : "✗ Not what you predicted.";
      verdict.append(vb, ` You predicted “${label(t.predicted)}”. The test showed: “${label(t.answer)}”.`);
    } else {
      verdict.className = "verdict"; vb.textContent = "Your prediction:";
      verdict.append(vb, ` “${label(t.predicted)}”. Test every gear, then you'll know. Still to try: ${untested().map(gearName).join(", ")}.`);
    }
    const before = [verdict];
    if (once) before.push(timesTable());
    if (prev) { // the one-change tracker: what changed since the last try, and what that did
      const ch = Missions.changes(m, prev.choice, t.choice), line = document.createElement("p"); line.className = "changeline";
      const fmt = (k, c) => (k === "gear" ? `${R.GEARS[c.gear]}:1` : k === "tire" ? `${R.TIRES[c.tire].n} tires` : String(c[k]));
      const out = prev.finished === t.finished ? (t.finished ? ` It reached ${place} ${Math.abs(prev.time - t.time).toFixed(1)} s ${t.time < prev.time ? "sooner" : "later"}.` : " It still got stuck.")
        : t.finished ? ` This time it made it to ${place}!` : " This time it got stuck.";
      line.textContent = ch.n === 0 ? "Same setup as last time, so the car does the same thing. Change one thing to find out more."
        : ch.n === 1 ? `You changed only the ${ch.keys[0]}, from ${fmt(ch.keys[0], prev.choice)} to ${fmt(ch.keys[0], t.choice)}.${out} One change, so you know it was the ${ch.keys[0]}.`
        : `You changed ${ch.n} things (${ch.keys.join(" and ")}), so you can't tell which one made the difference. Try changing one at a time.`;
      before.push(line);
    }
    rep.innerHTML = "";
    Cards.explain(rep, e, { glossary: mis.gloss, before, onTry: (change) => { Object.assign(setup, Missions.choice(m, { ...setup, ...change })); Sound.play("click"); nextTry(); } });
    const ctl = document.createElement("div"); ctl.className = "repctl";
    const again = document.createElement("button"); again.type = "button"; again.className = "btn"; again.textContent = "Next try";
    again.setAttribute("data-tip", once ? "Pick another gear in the garage and run it." : "Change one thing in the garage, predict again, and run it."); again.onclick = nextTry;
    ctl.appendChild(again);
    if (mis.next && mis.tries.some((x) => x.goal) && (!once || done)) {
      const nx = document.createElement("a"); nx.className = "btn ghost"; nx.href = missionHref(mis.next.id); nx.textContent = `Next mission: ${mis.next.title || "keep going"}`;
      nx.setAttribute("data-tip", "Go on to the lesson's next test."); ctl.appendChild(nx);
    }
    const lesson = document.createElement("a"); lesson.className = "btn ghost"; lesson.href = lessonHref(m.lesson); lesson.textContent = "Back to the lesson";
    lesson.setAttribute("data-tip", "Open the lesson this mission tests.");
    ctl.appendChild(lesson); rep.appendChild(ctl);
  }

  // ---------------- the lap report ----------------
  function showReport(r, isBest) {
    const rep = $("report"); rep.innerHTML = "";
    const e = R.explain(setup, r, track);
    const hd = document.createElement("div"); hd.className = "headline" + (r.finished && isBest ? " good" : "");
    const md = r.finished && R.medalOf(r.time, track);
    hd.textContent = r.finished ? `${track.n}: ${fmtTime(r.time)}${md ? `  ${MEDAL[md]} ${md[0].toUpperCase() + md.slice(1)} medal` : ""}${isBest ? "  · New best lap!" : bests[track.id] ? `  · best ${fmtTime(bests[track.id].time)}` : ""}` : `${track.n}: didn't finish`;
    rep.appendChild(hd);
    const vTop = Math.max(...r.sec.map((s) => s.vMax));
    const nums = document.createElement("div"); nums.className = "nums";
    nums.innerHTML = `<div><b>${r.finished ? fmtTime(r.time) : "DNF"}</b><span>lap time</span></div><div><b>${kmh(vTop)} km/h</b><span>fastest moment</span></div><div><b>${(r.off || 0).toFixed(1)} s</b><span>on the grass</span></div><div><b>${nameOf(setup)}</b><span>setup</span></div>`;
    rep.appendChild(nums);
    e.items.forEach((it, i) => {
      const d = document.createElement("div"); d.className = "finding " + it.tone; d.style.animationDelay = i * 0.06 + "s";
      d.innerHTML = `<span class="ic">${it.tone === "good" ? "✓" : it.tone === "bad" ? "✗" : "i"}</span><div><h4></h4><p></p></div>`;
      d.querySelector("h4").textContent = it.title; d.querySelector("p").textContent = it.text;
      rep.appendChild(d);
    });
    const tip = document.createElement("div"); tip.className = "tipbox"; tip.innerHTML = "<b>Try this next</b><span></span>"; tip.lastChild.textContent = e.tip;
    rep.appendChild(tip);
    if (inGp()) return; // in Race Day the board decides what happens next
    const ctl = document.createElement("div"); ctl.className = "repctl";
    const again = document.createElement("button"); again.type = "button"; again.className = "btn"; again.textContent = "Race again"; again.setAttribute("data-tip", "Line up and race another lap.");
    again.onclick = start; ctl.appendChild(again);
    if (cls.on && r.finished) {
      const send = document.createElement("button"); send.type = "button"; send.className = "btn ghost"; send.textContent = "Send to the class leaderboard";
      send.setAttribute("data-tip", "Send this lap to your class's game. The server drives it again to check the time, and keeps your fastest on each track.");
      const msg = document.createElement("span"); msg.className = "small";
      send.onclick = () => socket.emit("race:submit", { who, setup: lastLap.setup, inputs: lastLap.inputs, track: lastLap.track }, (res) => {
        msg.textContent = res && res.ok ? (res.kept ? `Sent! You're #${res.rank} in your class on ${track.n}.` : `Checked: ${fmtTime(res.time)}. Your class best (${fmtTime(res.best)}) is still faster.`) : (res && res.error) || "Couldn't send it. Try again.";
        send.disabled = true;
      });
      ctl.append(send, msg);
    }
    rep.appendChild(ctl);
  }

  // ---------------- class leaderboard (free practice) ----------------
  function renderBoard() {
    if (!cls.on) return;
    const board = cls.boards[track.id] || [];
    $("classp").hidden = inGp();
    $("classh").textContent = `Class leaderboard: ${track.n}`;
    $("classmsg").textContent = board.length ? "The fastest lap from each student in your class's game. Press Ghost to race against one." : "No class laps on this track yet. Finish a lap and send it in!";
    $("board").innerHTML = "";
    board.forEach((b, i) => {
      const li = document.createElement("li"); if (b.id === who.playerId) li.className = "me";
      li.innerHTML = `<span class="rk">#${i + 1}</span><span class="nm"></span><span class="tm">${fmtTime(b.time)}</span><button class="btn ghost" type="button" data-tip="Race against this lap as your ghost car.">Ghost</button>`;
      const nm = li.querySelector(".nm"); nm.textContent = b.builder; const sm = document.createElement("small"); sm.textContent = nameOf(b.setup); nm.appendChild(sm);
      li.querySelector("button").onclick = () => socket.emit("race:ghost", { who, id: b.id, track: track.id }, (r) => {
        if (!r || !r.ok) return;
        ghostSrc = { setup: r.setup, inputs: r.inputs, time: r.time, track: r.track }; ghostLabel = b.id === who.playerId ? "your class lap" : b.builder;
        $("ghost").checked = true; Sound.play("click");
        $("classmsg").textContent = `Next race: the ghost car drives ${b.id === who.playerId ? "your class lap" : `${b.builder}'s lap`} (${fmtTime(b.time)}).`;
      });
      $("board").appendChild(li);
    });
  }

  // ---------------- Race Day ----------------
  function gpApply(g) {
    const prev = cls.gp; cls.gp = g;
    if (g) { cls.offset = g.now - Date.now(); (g.racers || []).forEach((r) => cls.racers.set(r.id, r)); }
    if (!g) { if (prev) { stop(); $("report").innerHTML = ""; } renderAll(); renderBoard(); return; }
    if (g.phase !== "done") { const t = R.TRACKS[g.track]; if (t !== track) { track = t; stop(); } }
    const fresh = !prev || prev.i !== g.i || prev.phase !== g.phase;
    if (fresh && g.phase === "garage") { reset(); state = "garage"; $("report").innerHTML = ""; socket.emit("player:gpSetup", setup); }
    if (g.phase === "countdown" && state !== "countdown" && state !== "race") { reset(); ghost = null; state = "countdown"; $("report").innerHTML = ""; Sound.play("beep"); }
    if (g.phase === "racing" && state === "garage") { reset(); state = "race"; } // joined late: start now
    if (g.phase === "results" && (state === "race" || state === "countdown")) { state = "done"; doneT = 0; lastLap = { dnf: true, track: track.id }; Sound.play("miss"); }
    if (state === "done" && lastLap && (g.phase === "results" || g.phase === "done")) { // your place, under the finish
      const res = g.phase === "done" ? g.standings : g.results[g.i] || [], k = res.findIndex((r) => r.id === (who && who.playerId)), r = res[k];
      lastLap.place = !r ? "" : g.phase === "done" ? `RACE DAY: #${k + 1} OF ${res.length} · ${r.pts} POINTS` : r.time == null ? "DNF · 0 POINTS" : `P${k + 1} · +${r.pts} POINTS`;
    }
    renderAll(); renderBoard();
  }
  function renderGp() {
    const box = $("gpbox"), g = cls.gp;
    box.hidden = !g;
    if (!g) return;
    const T = R.TRACKS[g.track], me = who && who.playerId;
    const rows = (list, cols) => `<table class="gptable"><tbody>${list.map((r, k) => `<tr class="${r.id === me ? "me" : ""}">${cols(r, k)}</tr>`).join("")}</tbody></table>`;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    let head = "", body = "";
    if (g.phase === "garage") { head = `Race ${g.i + 1} of ${g.n}: ${T.n}`; body = `<p>${esc(T.about)} Pick your gear and tires below. Your teacher starts the race from the board.</p>`; }
    else if (g.phase === "countdown") { head = `Race ${g.i + 1}: get ready!`; body = "<p>Watch the lights. Go on green!</p>"; }
    else if (g.phase === "racing") { head = `Race ${g.i + 1}: ${T.n}`; body = state === "done" ? (sent ? `<p>You're in! ${lastLap && lastLap.gp && lastLap.gp.ok ? `Finished #${lastLap.gp.place} so far.` : ""} Waiting for everyone to finish.</p>` : "<p>Checking your lap...</p>") : "<p>Drive! The fastest lap wins.</p>"; }
    else if (g.phase === "results") {
      const res = g.results[g.i] || [];
      head = `Race ${g.i + 1} results: ${T.n}`;
      body = rows(res, (r, k) => `<td>${r.time == null ? "DNF" : "#" + (k + 1)}</td><td>${esc(r.builder)}</td><td>${r.time == null ? `${Math.round(r.dist * 100)}%` : fmtTime(r.time)}</td><td>+${r.pts}</td>`) + `<p class="small">${g.i + 1 < g.n ? "Next race soon. Read your lap report and think about your setup." : "That was the last race!"}</p>`;
    } else if (g.phase === "done") {
      head = "Race Day results";
      body = rows(g.standings, (s, k) => `<td>#${k + 1}</td><td>${esc(s.builder)}</td><td>${s.pts} pts</td><td>${s.best ? fmtTime(s.best) : ""}</td>`) + (g.awards.length ? `<p class="small">${g.awards.map((a) => `<b>${esc(a.title)}:</b> ${esc(a.builder)} (${esc(a.detail)})`).join(" · ")}</p>` : "");
    }
    box.innerHTML = `<div class="gphead"><span class="gptag">RACE DAY</span><b></b></div>${body}`;
    box.querySelector("b").textContent = head;
  }
  // rivals, drawn a fifth of a second behind live so their movement is smooth
  function rivals(now) {
    const { prev, cur } = cls.live; if (!cur || !inGp()) return [];
    const f = prev ? clamp((now - 200 - prev.at) / Math.max(1, cur.at - prev.at), 0, 1) : 1;
    const old = new Map(prev ? prev.cars.map((c) => [c[0], c]) : []);
    return cur.cars.filter((c) => c[0] !== (who && who.playerId)).map((c) => {
      const p = old.get(c[0]) || c, rc = cls.racers.get(c[0]) || {};
      return { id: c[0], z: p[1] + (c[1] - p[1]) * f, x: p[2] + (c[2] - p[2]) * f, v: c[3], done: !!c[4], color: rc.look ? D.LOOKS.PAINT[rc.look.c1] : rc.color || "#9fd8ff", look: rc.look, name: rc.builder || "" };
    });
  }
  if (cls.on) {
    socket.on("connect", () => socket.emit("race:check", { who, look }, (r) => { if (r && r.ok) { cls.boards = r.boards; gpApply(r.gp); renderBoard(); } }));
    socket.on("race:board", (d) => { cls.boards[d.track] = d.board; renderBoard(); });
    socket.on("gp:state", gpApply);
    socket.on("gp:live", (snap) => { cls.live = { prev: cls.live.cur, cur: { ...snap, at: performance.now() } }; });
    setInterval(() => { if (inGp() && (state === "race" || state === "countdown")) socket.emit("player:gpPos", { z: car.z, x: car.x, v: car.v }); }, 200);
  }

  // ---------------- paint shop (looks only: the gear and tires are the only things that change speed) ----------------
  const LK = D.LOOKS, NAMES = ["orange", "blue", "green", "purple", "gold", "pink", "white", "black", "silver", "lime", "teal", "mustard"];
  function saveLook(next) {
    look = R.cleanLook(next); ls.set("race-look", look); Sound.play("click"); renderPaint();
    if (cls.on) socket.emit("race:look", look); // so classmates see it in Race Day
  }
  function renderPaint() {
    const chips = (el, names, key, tip) => {
      $(el).innerHTML = "";
      names.forEach((n, i) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "pchip"; b.textContent = n;
        b.setAttribute("aria-pressed", look[key] === i); b.setAttribute("data-tip", tip(i)); b.onclick = () => saveLook({ ...look, [key]: i });
        $(el).appendChild(b);
      });
    };
    const swatches = (el, colors, key, tip) => {
      $(el).innerHTML = "";
      colors.forEach((c, i) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "swatch" + (c ? "" : " none"); if (c) b.style.background = c;
        b.setAttribute("aria-pressed", look[key] === i); b.setAttribute("aria-label", tip(i)); b.setAttribute("data-tip", tip(i)); b.onclick = () => saveLook({ ...look, [key]: i });
        $(el).appendChild(b);
      });
    };
    chips("p-body", LK.BODIES, "body", (i) => `${LK.BODIES[i]} body. Just for looks: every body drives the same.`);
    swatches("p-c1", LK.PAINT, "c1", (i) => `Main color: ${NAMES[i]}`);
    swatches("p-c2", LK.PAINT, "c2", (i) => `Second color: ${NAMES[i]}. It's used for the pattern and the wheel trim.`);
    chips("p-liv", LK.LIVERIES, "liv", (i) => (i ? `${LK.LIVERIES[i]} pattern, in your second color.` : "No pattern: one color."));
    chips("p-rim", LK.RIMS, "rim", (i) => [`Classic black tires.`, `A stripe in your second color on each tire.`, `Tires that glow in your second color.`][i]);
    swatches("p-trail", LK.TRAILS, "trail", (i) => (i ? `Exhaust glow: ${NAMES[i - 1]}. It shows when you go fast.` : "No exhaust glow."));
    const mine = saved && Number.isInteger(saved.sensor) ? saved.sensor + 1 : 0;
    chips("p-head", LK.HEADS.map((n, i) => (i && i === mine ? `${n} (your robot)` : n)), "head",
      (i) => (i ? `Your driver has a ${LK.HEADS[i].toLowerCase()} sensor head${i === mine ? ", like your battle robot" : ""}.` : "The standard racer bot driver."));
    $("p-num").value = look.num;
  }
  $("p-num").onchange = () => saveLook({ ...look, num: clamp(Math.round(+$("p-num").value || 0), 0, 99) });
  $("p-minus").onclick = () => saveLook({ ...look, num: (look.num + 99) % 100 });
  $("p-plus").onclick = () => saveLook({ ...look, num: (look.num + 1) % 100 });
  $("p-rand").onclick = () => { const r = (n) => Math.floor(Math.random() * n); saveLook({ body: r(5), c1: r(12), c2: r(12), liv: r(7), num: r(100), rim: r(3), trail: r(7), head: look.head }); };
  function drawPaint(t) { // your car in the garage
    const c = $("paintview"); if (!c.offsetParent) return;
    const { ctx, w, h } = E.fit(c);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#1d1c21"); g.addColorStop(1, "#3a3842"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const sp = ctx.createRadialGradient(w / 2, h * 0.1, 0, w / 2, h * 0.1, h * 1.1); sp.addColorStop(0, "rgba(255,236,190,.22)"); sp.addColorStop(1, "rgba(255,236,190,0)"); ctx.fillStyle = sp; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#26252b"; ctx.fillRect(0, h * 0.86, w, h * 0.14); ctx.fillStyle = "#f46524"; ctx.fillRect(0, h * 0.86, w, 2);
    D.kart(ctx, w / 2, h * 0.88, Math.min(w * 0.42, h * 0.58), { look, t, v: look.trail ? 7 : 0, bob: RM ? 0 : Math.sin(t * 2) * 1.5 });
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
  // Touch pads sit under the track in portrait (CSS) and on its bottom corners in landscape. When they cover the track,
  // `pads` says where, so the HUD can move the map and the hill profile out of their way.
  let pads = null;
  function measurePads() {
    const t = $("touch"), c = $("road");
    if (t.hidden || getComputedStyle(t).position !== "absolute") { pads = null; return; }
    const cr = c.getBoundingClientRect(), [a, b] = t.querySelectorAll(".pad"), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const top = Math.min(ra.top, rb.top) - cr.top;
    pads = top >= cr.height ? null : { left: ra.right - cr.left, right: rb.left - cr.left, top };
  }
  function showTouch(on) { $("touch").hidden = !on; document.body.classList.toggle("touchmode", on); measurePads(); }
  showTouch(matchMedia("(pointer: coarse)").matches);
  $("road").addEventListener("touchstart", () => { if ($("touch").hidden) showTouch(true); }, { passive: true });
  addEventListener("resize", measurePads);
  addEventListener("resize", drawGearPic); // the garage picture is drawn at its size, so redraw it when that changes
  addEventListener("orientationchange", () => setTimeout(measurePads, 250));
  document.addEventListener("fullscreenchange", () => setTimeout(measurePads, 100));
  // full screen: the track (and its touch pads) fill the screen; phones turn sideways where the browser allows it
  $("fullscreen").hidden = !document.fullscreenEnabled;
  $("fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await document.querySelector(".stagebox").requestFullscreen(); try { await screen.orientation.lock("landscape"); } catch {} }
    } catch {}
  };
  // the motor's sound: a chiptune note whose pitch follows the motor's rpm while you race (with Sound on), so you can
  // hear a gear hit its top speed on a straight, or bog down on a hill
  const motor = { ac: null, osc: null, gain: null };
  function motorSound() {
    const want = Sound.on && (state === "race" || state === "countdown") && !document.hidden;
    if (want && !motor.ac) {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)(), n = 32, re = new Float32Array(n), im = new Float32Array(n);
        for (let k = 1; k < n; k++) { re[k] = Math.sin(2 * Math.PI * k * 0.25) / (Math.PI * k); im[k] = (1 - Math.cos(2 * Math.PI * k * 0.25)) / (Math.PI * k); } // a 25% pulse wave
        const osc = ac.createOscillator(), lp = ac.createBiquadFilter(), gain = ac.createGain();
        osc.setPeriodicWave(ac.createPeriodicWave(re, im)); lp.type = "lowpass"; lp.frequency.value = 1400; gain.gain.value = 0;
        osc.connect(lp); lp.connect(gain); gain.connect(ac.destination); osc.start();
        Object.assign(motor, { ac, osc, gain });
      } catch { return; }
    }
    if (!motor.ac) return;
    if (want && motor.ac.state === "suspended") motor.ac.resume();
    const now = motor.ac.currentTime;
    motor.gain.gain.setTargetAtTime(want ? 0.045 : 0, now, 0.06);
    motor.osc.frequency.setTargetAtTime(50 + clamp(car.rpm / R.MOTOR.rpm, 0, 1.3) * 170, now, 0.03);
  }
  $("sound").onclick = () => { const on = Sound.toggle(); $("sound").textContent = "Sound: " + (on ? "on" : "off"); $("sound").setAttribute("aria-pressed", on); };

  // ---------------- drawing ----------------
  const lightsFor = (rem) => (rem <= 0 ? "go" : rem > 3 ? 0 : Math.min(5, Math.floor((3 - rem) / 0.6) + 1)); // five reds, one by one, then green
  function countdownLeft() { return inGp() && cls.gp.startAt ? (cls.gp.startAt - (Date.now() + cls.offset)) / 1000 : cd; }
  function ghostCar() {
    if (!ghost || inGp()) return null;
    const k = state === "race" || state === "done" ? Math.min(inputs.length, ghost.steps) - 1 : -1;
    if (k < 0) return state === "countdown" ? { z: 0, x: 0, ghost: true, color: "#9fd8ff", name: "GHOST" } : null;
    if (inputs.length > ghost.steps) return null; // it already finished
    return { z: ghost.pos[2 * k], x: ghost.pos[2 * k + 1], ghost: true, color: "#9fd8ff", name: "" };
  }
  function draw(t, dt, now) {
    const c = $("road"); if (!c.offsetParent) return;
    const { ctx, w, h } = E.fit(c); view.w = w; view.h = h;
    fx.update(dt);
    const rv = rivals(now), gh = ghostCar(), cars = gh ? [...rv, gh] : rv;
    const rem = countdownLeft(), lights = state === "countdown" ? lightsFor(rem) : state === "race" && inputs.length < 60 ? "go" : 0;
    const pos = D.world(ctx, w, h, track, car, cars, { t, bgX, lights, low });
    const inp = state === "race" ? lastIn : { steer: 0, brake: 0, gas: 0 }, seg = track.segAt(car.z), T = R.TIRES[setup.tire];
    const off = Math.abs(car.x) > R.ROAD && car.v > 1, slide = (car.v * car.v * Math.abs(seg.k)) / (T.mu * R.G) > 1;
    if (!RM && !low && off && Math.random() < 0.5) fx.burst(pos.x + (Math.random() - 0.5) * pos.size, pos.y, 1, { colors: track.theme === "desert" ? ["#c9925a", "#e0b07a"] : ["#7a5a3a", "#a1825e"], kind: "dust", speed: 60, g: -20, life: 0.8, size: 6, angle: -Math.PI / 2, spread: 1.2 });
    if (!RM && !low && slide && state === "race" && Math.random() < 0.6) fx.burst(pos.x + (Math.random() < 0.5 ? -1 : 1) * pos.size * 0.4, pos.y - 4, 1, { colors: ["#d9d5de", "#aaa6b0"], kind: "smoke", speed: 30, g: -40, life: 0.7, size: 8, drag: 0.95, angle: -Math.PI / 2, spread: 1 });
    if (car.wall && state === "race" && Math.abs(car.x) >= R.WALL - 0.01 && car.v > 2 && t - wallT > 0.35) { wallT = t; Sound.play("hit"); if (!RM) fx.burst(pos.x + Math.sign(car.x) * pos.size * 0.6, pos.y - 10, 8, { colors: ["#ffd23f", "#fff6c8"], speed: 200, g: 300, life: 0.4, size: 3 }); }
    D.kart(ctx, pos.x, pos.y + (off && !RM ? Math.sin(t * 40) * 2 : 0), pos.size, { look, steer: inp.steer, brake: inp.brake || state === "done", t, v: car.v });
    if (state === "race" && !low) D.speedLines(ctx, w, h, pos.horizon, car.v);
    fx.draw(ctx);
    hud(ctx, w, h, t, dt, rv, gh, rem);
    if (state === "race" || state === "done") bgX += seg.k * car.v * dt * 900;
  }
  // the hill profile: how high the road is along the lap (the same scale on every track), you and your rivals on it.
  // Climbs your gear can't make are red, slow ones yellow, so changing gear in the garage changes the colors.
  const SPAN = Math.max(...R.TRACKS.map((tr) => { const ys = tr.segs.map((q) => q.y); return Math.max(...ys) - Math.min(...ys); }));
  const climbCache = {};
  function climbColors() {
    if (mis.on) return (climbCache[track.id + ":plain"] = climbCache[track.id + ":plain"] || track.segs.map(() => 0)); // no hints before the prediction
    const key = `${track.id}:${setup.gear}:${setup.tire}`;
    return (climbCache[key] = climbCache[key] || track.segs.map((q) => { if (q.slope < 0.03) return 0; const v = R.climbSpeed(setup, q.slope); return v < 0.3 ? 2 : v < 3 ? 1 : 0; }));
  }
  function hills(ctx, x, y, pw, ph, fs, rv, gh) {
    const segs = track.segs, N = segs.length, ys = segs.map((q) => q.y), y0 = Math.min(...ys), cols = climbColors();
    ctx.fillStyle = "rgba(20,19,22,.62)"; rr(ctx, x, y, pw, ph, 10); ctx.fill();
    const top = y + fs * 0.75, base = y + ph - 5, X = (z) => x + 8 + (z / track.LENGTH) * (pw - 16), Y = (yy) => base - ((yy - y0) / SPAN) * (base - top);
    for (let i = 0; i < N; i++) { ctx.fillStyle = ["rgba(255,255,255,.16)", "rgba(255,210,63,.75)", "rgba(255,93,93,.9)"][cols[i]]; const xa = X(i * R.SEG), xb = X((i + 1) * R.SEG); ctx.fillRect(xa, Y(segs[i].y), xb - xa + 0.6, base - Y(segs[i].y)); }
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); segs.forEach((q, i) => (i ? ctx.lineTo(X(i * R.SEG), Y(q.y)) : ctx.moveTo(X(0), Y(q.y)))); ctx.stroke();
    const dot = (z, col, r) => { const zz = clamp(z, 0, track.LENGTH - 0.01), i = Math.floor(zz / R.SEG); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(zz), Y(segs[i].y), r, 0, 7); ctx.fill(); };
    rv.forEach((r) => dot(r.z, r.color, 3)); if (gh) dot(gh.z, "#9fd8ff", 3);
    dot(car.z, D.LOOKS.PAINT[look.c1], 5); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = `700 ${Math.round(fs * 0.42)}px "JetBrains Mono", monospace`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#aaa6b0"; ctx.fillText("HILLS", x + 8, y + fs * 0.55);
    const worst = Math.max(0, ...cols);
    if (worst) { ctx.textAlign = "right"; ctx.fillStyle = worst === 2 ? "#ff8a8a" : "#ffd23f"; ctx.fillText(worst === 2 ? `RED: TOO STEEP FOR ${R.GEARS[setup.gear]}:1` : `YELLOW: SLOW CLIMB IN ${R.GEARS[setup.gear]}:1`, x + pw - 8, y + fs * 0.55); ctx.textAlign = "left"; }
  }
  function hud(ctx, w, h, t, dt, rv, gh, rem) {
    const fs = Math.max(12, Math.round(h * 0.04)), panel = (x, y, ww, hh) => { ctx.fillStyle = "rgba(20,19,22,.62)"; rr(ctx, x, y, ww, hh, 10); ctx.fill(); };
    const time = state === "race" || (state === "done" && lastLap && lastLap.mission && lastLap.time == null) ? inputs.length * R.DT : state === "done" && lastLap && lastLap.time ? lastLap.time : 0, b = bests[track.id];
    panel(12, 12, fs * 7.6, fs * 2.9);
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.font = `600 ${Math.round(fs * 0.55)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0"; ctx.fillText(inGp() ? `RACE ${cls.gp.i + 1} · ${track.n.toUpperCase()}` : track.n.toUpperCase(), 22, 12 + fs * 0.85);
    ctx.font = `700 ${Math.round(fs * 1.2)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#fff"; ctx.fillText(fmtTime(time), 22, 12 + fs * 2.05);
    ctx.font = `600 ${Math.round(fs * 0.55)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#ffd23f"; ctx.fillText(mis.on ? `TRY ${mis.tries.length + (state === "done" ? 0 : 1)}` : b ? "BEST " + fmtTime(b.time) : "NO BEST YET", 22, 12 + fs * 2.65);
    // the motor's rpm on a dial: the red line is its top speed, where it can't push any harder
    const rpmF = clamp(car.rpm / R.MOTOR.rpm, 0, 1.2), bw = fs * 8.6, bx = w - 12 - bw, MAXR = R.MOTOR.rpm * 1.2;
    panel(bx, 12, bw, fs * 3.6);
    const dcx = bx + fs * 2, dcy = 12 + fs * 2.2, dr = fs * 1.45, A0 = Math.PI * 0.75, A1 = Math.PI * 2.25, ang = (rpm) => A0 + (A1 - A0) * clamp(rpm / MAXR, 0, 1);
    ctx.lineCap = "butt"; ctx.lineWidth = fs * 0.28;
    ctx.strokeStyle = "#26252b"; ctx.beginPath(); ctx.arc(dcx, dcy, dr, A0, A1); ctx.stroke();
    ctx.strokeStyle = "#ff5d5d88"; ctx.beginPath(); ctx.arc(dcx, dcy, dr, ang(R.MOTOR.rpm * 0.97), A1); ctx.stroke();
    ctx.strokeStyle = rpmF >= 0.97 ? "#ff5d5d" : rpmF > 0.8 ? "#ffd23f" : "#4fd18b"; ctx.beginPath(); ctx.arc(dcx, dcy, dr, A0, ang(car.rpm)); ctx.stroke();
    ctx.strokeStyle = "#aaa6b0"; ctx.lineWidth = 1.5;
    for (let k = 0; k <= 6; k++) { const a = ang(k * 1000); ctx.beginPath(); ctx.moveTo(dcx + Math.cos(a) * (dr - fs * 0.42), dcy + Math.sin(a) * (dr - fs * 0.42)); ctx.lineTo(dcx + Math.cos(a) * (dr - fs * 0.62), dcy + Math.sin(a) * (dr - fs * 0.62)); ctx.stroke(); }
    const na = ang(car.rpm); ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, fs * 0.12); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(dcx, dcy); ctx.lineTo(dcx + Math.cos(na) * dr * 0.88, dcy + Math.sin(na) * dr * 0.88); ctx.stroke(); ctx.lineCap = "butt";
    ctx.fillStyle = "#f46524"; ctx.beginPath(); ctx.arc(dcx, dcy, fs * 0.16, 0, 7); ctx.fill();
    ctx.textAlign = "center"; ctx.font = `600 ${Math.round(fs * 0.38)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0"; ctx.fillText("RPM", dcx, dcy + fs * 0.85);
    ctx.textAlign = "right"; ctx.font = `700 ${Math.round(fs * 1.25)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#fff"; ctx.fillText(String(kmh(car.v)), w - 22, 12 + fs * 1.45);
    ctx.font = `600 ${Math.round(fs * 0.5)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0"; ctx.fillText("km/h", w - 22, 12 + fs * 2.05);
    ctx.fillStyle = rpmF >= 0.97 ? "#ff5d5d" : "#aaa6b0"; ctx.fillText(rpmF >= 0.97 ? "MAX RPM" : Math.round(car.rpm).toLocaleString("en-US") + " rpm", w - 22, 12 + fs * 2.7);
    ctx.fillStyle = "#f4f1ea"; ctx.fillText(`${R.GEARS[setup.gear]}:1 gear`, w - 22, 12 + fs * 3.3);
    // the gearbox turning at the real ratio (slowed down to watch): the motor gear turns once per wheel turn times the ratio
    { const gy = 12 + fs * 3.6 + 6, gh = fs * 2.2; panel(bx, gy, bw, gh); E.gearPair(ctx, bx + fs * 2.3, gy + gh / 2, fs * 0.72, R.GEARS[setup.gear], (car.z / R.CAR.wheelR) * 0.12);
      ctx.textAlign = "right"; ctx.font = `600 ${Math.round(fs * 0.48)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0"; ctx.fillText("MOTOR → WHEEL", w - 22, gy + gh / 2 + fs * 0.18); }
    // the track map, with everyone on it
    // (a straight test strip has no map worth drawing, so its hill profile gets the space)
    const ms = track.open ? -10 : Math.round(Math.min(w, h) * 0.24), mapY = pads ? 12 + fs * 2.9 + 8 : h - ms - 12; // under the timer when touch pads cover the corners
    if (!track.open) D.minimap(ctx, 12, mapY, ms, track, [...rv.map((r) => ({ z: r.z, color: r.color })), ...(gh ? [{ z: gh.z, color: "#9fd8ff" }] : []), { z: car.z, color: D.LOOKS.PAINT[look.c1], me: true }]);
    // the hill profile: next to the map, or centered between the touch pads
    const ph = Math.max(34, Math.round(h * 0.11)), hy = h - ph - 12;
    const pw = pads ? Math.min(pads.right - pads.left - 20, w * 0.5) : Math.min(w - (12 + ms + 10) - 12, w * (track.open ? 0.6 : 0.5));
    const hx = pads ? (pads.left + pads.right) / 2 - pw / 2 : 12 + ms + 10;
    if (pw > 120) hills(ctx, hx, hy, pw, ph, fs, rv, gh);
    // someone close behind you (karts behind you aren't drawn, they'd fill the screen)
    const behind = state === "race" ? rv.filter((r) => !r.done && car.z - r.z > 0.5 && car.z - r.z < 20).sort((a, b) => b.z - a.z)[0] : null;
    if (behind) {
      const bw2 = fs * 9, by2 = hy - fs * 1.6;
      ctx.fillStyle = "rgba(20,19,22,.72)"; rr(ctx, w / 2 - bw2 / 2, by2, bw2, fs * 1.3, 8); ctx.fill();
      ctx.fillStyle = behind.color; ctx.fillRect(w / 2 - bw2 / 2, by2, 5, fs * 1.3);
      ctx.font = `700 ${Math.round(fs * 0.55)}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff";
      ctx.fillText(`▼ ${behind.name} is ${Math.round(car.z - behind.z)} m behind you`, w / 2, by2 + fs * 0.66); ctx.textBaseline = "alphabetic";
    }
    // position in Race Day
    if (inGp() && (state === "race" || state === "done") && rv.length) {
      const place = 1 + rv.filter((r) => r.done || r.z > car.z).length;
      panel(w / 2 - fs * 3, 12, fs * 6, fs * 1.9);
      ctx.textAlign = "center"; ctx.font = `700 ${Math.round(fs * 1.2)}px "Chakra Petch", Arial, sans-serif`; ctx.fillStyle = "#ffd23f"; ctx.fillText(`P${place}`, w / 2 - fs * 0.9, 12 + fs * 1.38);
      ctx.font = `600 ${Math.round(fs * 0.6)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0"; ctx.fillText(`of ${rv.length + 1}`, w / 2 + fs * 1.4, 12 + fs * 1.3);
    } else if (gh && state === "race") {
      const d = gh.z - car.z;
      ctx.font = `600 ${Math.round(fs * 0.55)}px "JetBrains Mono", monospace`; ctx.textAlign = "center"; ctx.fillStyle = "#9fd8ff";
      ctx.fillText(`GHOST (${ghostLabel}) ${Math.abs(d) < 1 ? "side by side" : `${Math.round(Math.abs(d))} m ${d > 0 ? "ahead" : "behind"}`}`, w / 2, 12 + fs * 0.9);
    }
    // section names as you reach them, warnings, the countdown
    const sec = track.segAt(car.z).sec;
    if (state === "race" && sec !== secShown) { const nm = track.SECTIONS[sec].n; if (secShown < 0 || track.SECTIONS[secShown].n !== nm) toast = { text: nm.toUpperCase(), t: 2 }; secShown = sec; }
    if (toast.t > 0) { toast.t -= dt; bigText(ctx, toast.text, w / 2, h * 0.27, h * 0.06, "#ffd23f", 1, clamp(toast.t, 0, 1)); }
    if (state === "race" && Math.abs(car.x) > R.ROAD && car.v > 1) bigText(ctx, "ON THE GRASS!", w / 2, h * 0.36, h * 0.045, "#ff8a50");
    stall = state === "race" && lastIn.gas && car.v < 0.3 && track.segAt(car.z).slope > 0.15 ? stall + dt : 0;
    if (stall > 1.2) { bigText(ctx, "STALLED!", w / 2, h * 0.34, h * 0.08, "#ff5d5d"); ctx.font = `600 ${Math.round(fs * 0.6)}px "Barlow Semi Condensed", Arial, sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText(mis.on ? "Not enough pushing force for this hill." : inGp() ? "Not enough pushing force for this hill. Next race, try more gearing." : "Not enough pushing force for this hill. Stop, and try more gearing (8:1 or 12:1).", w / 2, h * 0.42); }
    if (state === "countdown") { const n = Math.ceil(rem); bigText(ctx, rem > 3 ? "GET READY" : n > 0 ? String(n) : "GO!", w / 2, h * 0.32, h * (rem > 3 ? 0.08 : 0.16), n > 0 ? "#f4f1ea" : "#4fd18b", 1 + (rem % 1) * 0.2); }
    if (state === "garage") bigText(ctx, inGp() ? (cls.gp.phase === "garage" ? "PICK YOUR SETUP. THE BOARD STARTS THE RACE" : "WAITING FOR THE START") : mis.on ? (mis.m && driveMode() === "auto" ? "PICK A GEAR AND PREDICT, THEN WATCH TORQUE DRIVE" : "PICK A GEAR AND PREDICT, THEN RUN THE TEST") : "PICK A TRACK AND A SETUP, THEN START RACE", w / 2, h * 0.3, h * 0.045, "rgba(255,255,255,.85)");
    if (state === "done" && lastLap && lastLap.place) bigText(ctx, lastLap.place, w / 2, h * 0.41, h * 0.06, "#ffd23f", Math.min(1, 0.6 + doneT * 2));
    if (cardShown) { /* the result card on the track says it */ } else if (state === "done" && lastLap && lastLap.mission) bigText(ctx, lastLap.time != null ? `MADE IT! ${lastLap.time.toFixed(1)} s` : "STUCK!", w / 2, h * 0.3, h * 0.085, lastLap.time != null ? "#4fd18b" : "#ff8a50", Math.min(1, 0.6 + doneT * 2));
    else if (state === "done" && lastLap && !cardShown) bigText(ctx, lastLap.dnf ? "TIME'S UP" : lastLap.time != null ? "FINISH! " + fmtTime(lastLap.time) : "DIDN'T FINISH", w / 2, h * 0.3, h * 0.085, lastLap.dnf || lastLap.time == null ? "#ff8a50" : "#4fd18b", Math.min(1, 0.6 + doneT * 2));
    ctx.textAlign = "left";
  }

  // ---------------- loop ----------------
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (state === "countdown") {
      const before = countdownLeft(); if (!inGp()) cd -= dt; const rem = countdownLeft();
      if (rem <= 3 && Math.ceil(rem) !== Math.ceil(before) && rem > 0) Sound.play("beep");
      if (rem <= 0) { state = "race"; acc = 0; Sound.play("go"); renderAll(); }
    } else if (state === "race") {
      acc += dt; let n = 0;
      const cap = inGp() ? cls.gp.limit / R.DT : R.MAX_STEPS;
      while (acc >= R.DT && n++ < 8) {
        const i = stepInput(); lastIn = i; inputs += R.encode(i); R.step(car, setup, i, track); acc -= R.DT;
        if (car.z >= track.LENGTH) { finish(); break; }
        // a mission run ends 2 s after the car stops for good (stuck on the hill, or the gas let go), or after a minute
        if (mis.on) { mis.still = car.v === 0 && inputs.length > 30 ? mis.still + R.DT : 0; if (mis.still >= 2 || inputs.length >= 60 / R.DT) { missionDone(); break; } }
        if (inputs.length >= cap) { state = "done"; doneT = 0; lastLap = { dnf: inGp(), time: null, track: track.id }; showReport(R.lap(setup, inputs, track), false); renderAll(); break; }
      }
    } else if (state === "done") {
      doneT += dt; acc += dt;
      while (acc >= R.DT) { R.step(car, setup, { steer: 0, gas: 0, brake: 1 }, track); acc -= R.DT; } // roll to a stop past the line
    }
    try { draw(now / 1000, dt, now); drawPaint(now / 1000); motorSound(); } catch (err) { console.error(err); }
    requestAnimationFrame(loop);
  })(last);
  renderAll(); renderBoard(); renderPaint();
  if (mis.on) missionLoad();
  window.__race = { get state() { return state; }, get car() { return car; }, get lastPlace() { return lastLap && lastLap.place; }, get inputs() { return inputs; }, get track() { return track; }, start, keys,
    get mission() { return mis.on ? { loaded: !!mis.m, tries: mis.tries, predicted: mis.card && mis.card.value, setup: { ...setup } } : null; }, setSetup(s) { setup = R.clampSetup(s); renderGarage(); }, setTrack(id) { track = R.trackOf(id); stop(); renderBoard(); } };
})();
