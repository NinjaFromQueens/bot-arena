/* Mission Control (docs/platform-flow-spec.md section 8): the board runs a story mission for the whole class. The
   teacher picks a mission, then moves the class through its five steps with Next (or Space and the right arrow, for
   clickers); every student's game page follows through room.now (host:now). The briefing and debrief play here at
   projector size; Discover presents the lesson (learn?present, which comes back here); Build and Mission show the class's
   progress from the teacher data (room:missions). This device remembers which missions the class finished (cr-control). */
(function () {
  const S = window.Story, $ = (id) => document.getElementById(id);
  const socket = window.baSocket;
  let saved = null; try { saved = JSON.parse(sessionStorage.getItem("ba-host")); } catch {}
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const T = (v) => (window.Tier ? Tier.text(v, (window.__classTier) || "recruit") : v && typeof v === "object" ? v.recruit : v);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(u))));
  const btn = (text, tip, onclick, cls) => { const b = el("button", cls || "btn big", text); b.type = "button"; b.setAttribute("data-tip", tip); b.onclick = onclick; return b; };
  const linkBtn = (text, tip, href, cls) => { const a = el("a", cls || "btn big", text); a.href = href; a.setAttribute("data-tip", tip); return a; };

  let ready = false, st = null, missions = null, D = null, key = "";
  const files = {}; // per mission: its lesson and mission files
  function load() {
    return Promise.all([get("/data/episodes/index.json"), get("/data/characters.json"), get("/data/rewards.json"), get("/data/lessons/index.json")])
      .then(([idx, characters, rewards, lessonIds]) => Promise.all(idx.map((e) => get(`/data/episodes/${e}.json`))).then((episodes) => ({ episodes, characters, rewards, lessonIds })));
  }
  function missionFiles(m) {
    if (files[m.id]) return files[m.id];
    const mids = [...m.build.missions, ...(m.mission.mission ? [m.mission.mission] : [])];
    files[m.id] = Promise.all([get(`/data/lessons/${m.discover.lesson}.json`), ...mids.map((x) => get(`/data/missions/${x}.json`))])
      .then(([lesson, ...ms]) => ({ lesson, missions: Object.fromEntries(ms.map((x) => [x.id, x])) }));
    return files[m.id];
  }
  const send = (now) => socket.emit("host:now", now, (r) => { if (!r || !r.ok) $("status").textContent = "That didn't work. Try again."; });
  const markDone = (id) => { const c = ls.get("cr-control", { done: {} }); c.done[id] = c.done[id] || Date.now(); ls.set("cr-control", c); };

  function message(title, text) {
    const main = $("main"); main.innerHTML = "";
    const p = el("section", "panel stage"); p.append(el("h2", "", title), el("p", "", text)); main.appendChild(p);
  }
  function render() {
    if (!socket || !saved) return message("No game in this tab", "Open the board (Host on the board) first, then press Story mission in the lobby.");
    if (!ready || !st || !D) return message("Connecting...", "");
    window.__classTier = (st.settings && st.settings.tier) || "recruit"; // scenes read at the class's level (Recruit when students choose)
    return st.now ? runner(st.now) : picker();
  }

  // ---------------- the picker ----------------
  function picker() {
    $("scenebg").style.backgroundImage = "";
    const main = $("main"); main.innerHTML = "";
    const done = ls.get("cr-control", { done: {} }).done;
    const all = D.episodes.flatMap((ep) => ep.missions.map((m) => ({ ep, m })));
    const next = all.find((x) => !done[x.m.id]);
    const stage = el("section", "panel stage");
    stage.append(el("span", "kick", "MISSION CONTROL"), el("h2", "", "Today's story mission"),
      el("p", "", "Pick a mission. You move the class through its five steps, one per press of Next: the briefing, the lesson, practice, the mission, and the reward. Every student's game page follows you."));
    const list = el("div", "picks");
    for (const { ep, m } of all) {
      const card = el("div", "pick"), art = el("div", "art"), body = el("div"), h = el("h3", "", T(m.title));
      if (ep.art) art.style.backgroundImage = `url("${ep.art}")`;
      if (next && next.m.id === m.id) h.appendChild(el("span", "badge next", "NEXT UP"));
      if (done[m.id]) h.appendChild(el("span", "badge done", "DONE"));
      const sum = el("p", "sum", `Episode ${ep.num}: ${T(ep.title)}`);
      body.append(h, sum, btn(done[m.id] ? "Run it again" : "Start with the briefing", "Start this mission for the class. Every game page shows it.", () => send({ mission: m.id, step: "briefing" })));
      missionFiles(m).then((f) => { sum.textContent = `Episode ${ep.num}: ${T(ep.title)} · Lesson: ${T(f.lesson.title)} · Practice in the Lab · Mission: ${T(Object.values(f.missions).pop().title)}`; }).catch(() => {});
      card.append(art, body); list.appendChild(card);
    }
    stage.appendChild(list);
    main.appendChild(stage);
  }

  // ---------------- the runner ----------------
  function runner(now) {
    const f = S.find(D.episodes, now.mission);
    if (!f) { send({}); return message("That mission isn't available", "Pick another one."); }
    const { episode: ep, mission: m } = f, k = S.STEPS.indexOf(now.step);
    if (ep.art) $("scenebg").style.backgroundImage = `url("${ep.art}")`;
    const main = $("main"); main.innerHTML = "";
    main.appendChild(el("span", "kick", `STORY MISSION · EPISODE ${ep.num} · ${T(m.title).toUpperCase()}`));
    const row = el("nav", "steps"); row.setAttribute("aria-label", "Mission steps");
    S.STEPS.forEach((s, i) => {
      const b = btn("", i === k ? "The class is on this step." : `Move the class to ${S.STEP_NAME[s]}.`, () => send({ mission: m.id, step: s }), i < k ? "past" : i === k ? "cur" : "future");
      b.append(el("span", "n", `STEP ${i + 1}`), el("b", "", S.STEP_NAME[s])); row.appendChild(b);
    });
    main.appendChild(row);
    const grid = el("div", "mc"), stage = el("section", "panel stage"), side = el("section", "side");
    grid.append(stage, side); main.appendChild(grid);
    if (now.step === "reward") markDone(m.id);
    missionFiles(m).then((mf) => {
      stepStage(stage, m, now.step, mf);
      sidePanel(side, m, k);
    }).catch(() => { stage.appendChild(el("p", "", "This mission's files didn't load. Check the connection.")); });
  }
  const play = (sid, onDone) => get(`/data/scenes/${sid}.json`).then((sc) => StoryPlayer.play(sc, { characters: D.characters, text: T, big: true, onDone }));
  function stepStage(stage, m, step, mf) {
    if (step === "briefing") {
      stage.append(el("h2", "", "The briefing"), el("p", "", "Play the story scene for the room. Students' devices say: watch the board."),
        btn("Play the briefing", "Play the scene full screen. Space or the right arrow shows each line.", () => play(m.briefing, () => {})));
    } else if (step === "discover") {
      const L = mf.lesson, num = D.lessonIds.indexOf(L.id) + 1;
      stage.append(el("h2", "", `Lesson ${num}: ${T(L.title)}`), el("p", "", "Present the lesson on the board. Its quiz questions pop up on every device as polls. When you finish, you come back here."),
        linkBtn("Present the lesson", "Open the lesson on the board, in present mode. Its Back button returns to Mission Control.", `/learn?present&back=control#lesson-${L.id}`));
    } else if (step === "build" || step === "mission") {
      const ids = step === "build" ? m.build.missions : m.mission.mission ? [m.mission.mission] : [];
      if (step === "mission" && m.mission.event) return eventStage(stage, m);
      stage.append(el("h2", "", step === "build" ? "Practice" : T(mf.missions[ids[0]].title)),
        el("p", "", step === "build" ? `Students open these from the card on their game page. Each one needs a prediction first. Reaching the goal in ${m.build.need || 1} counts.` : "Students open the mission from their game page: predict, test their design, and reach the goal."));
      const box = el("div", "mstats"); box.dataset.ids = ids.join(","); box.dataset.titles = JSON.stringify(Object.fromEntries(ids.map((x) => [x, T(mf.missions[x].title)]))); stage.appendChild(box);
      fillStats();
    } else {
      stage.append(el("h2", "", "Mission complete!"), el("p", "", "Play the debrief, then see how the class did. Everyone here gets the reward."));
      if (m.debrief) stage.appendChild(btn("Play the debrief", "Play the closing scene full screen.", () => play(m.debrief, () => {})));
      for (const id of m.rewards || []) {
        const r = D.rewards.find((x) => x.id === id); if (!r) continue;
        const box = el("div", "reward"); box.append(el("span", "kick", { echo: "NEW ECHO", volt: "NEW VOLT PART", file: "NEW LAZARUS FILE", access: "NEW PLACE" }[r.kind]), el("b", "", T(r.title)), el("p", "", T(r.text))); stage.appendChild(box);
      }
      const all = [...m.build.missions, ...(m.mission.mission ? [m.mission.mission] : [])], box = el("div", "mstats"); box.dataset.ids = all.join(","); box.dataset.titles = JSON.stringify(Object.fromEntries(all.map((x) => [x, T(mf.missions[x].title)]))); stage.appendChild(box);
      fillStats();
    }
  }
  function eventStage(stage, m) {
    const ev = { labchallenge: ["Flying Car challenge", "/lab?present"], raceday: ["Race Day", "/raceday"], speedrun: ["Speed Run", "/speedrun"], tournament: ["The tournament", "/host"] }[m.mission.event];
    stage.append(el("h2", "", ev[0]), el("p", "", "Run the class challenge, then come back here for the reward."), linkBtn(`Open ${ev[0]}`, `Open ${ev[0]} on the board.`, ev[1]));
  }
  // the class's progress on these missions, from the teacher data (numbers only; names stay on the game board's panel)
  function fillStats() {
    const box = document.querySelector(".mstats"); if (!box) return;
    const titles = JSON.parse(box.dataset.titles || "{}");
    const ids = box.dataset.ids.split(",").filter(Boolean), sum = new Map(((missions && missions.summary) || []).map((s) => [s[0], s]));
    box.innerHTML = "";
    ids.forEach((id) => {
      const s = sum.get(id), d = el("div", "mstat");
      d.append(el("b", "", titles[id] || (s ? s[1] : id)), el("span", "", s ? `${s[2]} tried · ${s[4]} reached the goal · ${s[3]} predicted right on the first try` : "Nobody has tried it yet."));
      box.appendChild(d);
    });
  }
  function sidePanel(side, m, k) {
    const p = el("div", "panel"), n = st.players.filter((x) => x.connected && !x.out).length;
    const c = el("div", "count"); c.append(el("b", "", String(n)), el("span", "", n === 1 ? "student on the game page" : "students connected"));
    const acts = el("div", "actions"), last = k === S.STEPS.length - 1;
    const next = last ? btn("Finish the mission", "End this mission. Students' game pages go back to normal.", () => send({}))
      : btn(`Next: ${S.STEP_NAME[S.STEPS[k + 1]]}`, "Move the class to the next step. Space or the right arrow works too.", () => send({ mission: m.id, step: S.STEPS[k + 1] }));
    next.setAttribute("data-primary", "");
    acts.appendChild(next);
    if (k > 0) acts.appendChild(btn(`Back: ${S.STEP_NAME[S.STEPS[k - 1]]}`, "Move the class back one step.", () => send({ mission: m.id, step: S.STEPS[k - 1] }), "btn ghost"));
    acts.appendChild(btn("End the mission", "Stop this mission now and go back to the list. Students' game pages go back to normal.", () => send({}), "btn ghost"));
    p.append(c, acts); side.appendChild(p);
  }

  // ---------------- controls ----------------
  addEventListener("keydown", (e) => { // presentation clickers: Space / → / PageDown press the main button (not while a scene plays)
    if (!(e.key === " " || e.key === "ArrowRight" || e.key === "PageDown") || document.querySelector(".sp-overlay")) return;
    if (e.target.closest && e.target.closest("input, select, textarea, button, a")) return;
    const b = document.querySelector("[data-primary]"); if (b && !b.disabled) { e.preventDefault(); b.click(); }
  });
  function refresh() { // rebuild only when the mission or step changes; otherwise just update the numbers
    const k = !socket || !saved ? "none" : !ready || !st || !D ? "wait" : st.now ? `${st.now.mission}:${st.now.step}` : "pick";
    if (k !== key) { key = k; render(); } else fillStats();
  }

  // ---------------- connection ----------------
  load().then((d) => { D = d; refresh(); }).catch(() => message("Mission Control didn't load", "Check the connection and refresh."));
  if (!socket || !saved) { $("status").textContent = "No game in this tab"; refresh(); }
  else {
    socket.on("connect", () => socket.emit("host:resume", saved, (r) => { ready = !!(r && r.ok); $("status").textContent = ready ? "Connected" : "That game has ended"; refresh(); }));
    socket.on("disconnect", () => { ready = false; $("status").textContent = "Reconnecting..."; });
    socket.on("room:state", (s) => { st = s; refresh(); });
    socket.on("room:missions", (d) => { missions = d; refresh(); });
  }
  window.__control = { get now() { return st && st.now; }, get missions() { return missions; } };
})();
