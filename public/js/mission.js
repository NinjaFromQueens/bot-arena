/* The mission runner (docs/platform-flow-spec.md section 5): one story mission, its five steps in order. Briefing and
   Reward play scenes here; Discover, Build and Mission open the existing pages with ?run=<mission id>, where the run
   bar (runbar.js) shows the step and says when it's done. Whether a step is done comes from story.js, reading what the
   pages already save. This page writes only cr-record (briefings, rewards, finished missions) on this device. */
(function () {
  const S = window.Story, $ = (id) => document.getElementById(id);
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const tier = () => (window.Tier ? Tier.current() : "recruit");
  const T = (v) => (window.Tier ? Tier.text(v, tier()) : v && typeof v === "object" ? v.recruit : v);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(u + " " + r.status))));
  const id = new URLSearchParams(location.search).get("id") || "";
  const saved = () => ({ lessons: ls.get("learn-progress", {}), missions: ls.get("cr-missions", {}), record: ls.get("cr-record", null) || S.emptyRecord() });
  function mark(fields) { // add to this mission's record (times in ms, so two devices can be merged later)
    const rec = ls.get("cr-record", null) || S.emptyRecord();
    rec.missions[id] = { ...(rec.missions[id] || {}), ...fields }; rec.last = id;
    if (fields.rewards) { for (const r of fields.rewards) rec.rewards[r] = rec.rewards[r] || Date.now(); delete rec.missions[id].rewards; }
    ls.set("cr-record", rec);
  }
  // where each game's missions are played
  const PAGE = { lab: (mid) => `/lab?mission=${mid}&run=${id}`, racer: (mid) => `/race?mission=${mid}&run=${id}`, challenge: (mid) => `/practice?mission=${mid}&run=${id}#challenges` };

  let D = null, view = null; // D: the loaded files; view: a step the student chose to look at again
  function load() {
    return Promise.all([get("/data/episodes/index.json"), get("/data/characters.json"), get("/data/rewards.json"), get("/data/lessons/index.json")])
      .then(([idx, characters, rewards, lessonIds]) => Promise.all(idx.map((e) => get(`/data/episodes/${e}.json`))).then((episodes) => ({ episodes, characters, rewards, lessonIds })))
      .then((d) => {
        const f = S.find(d.episodes, id); if (!f) return { ...d, f: null };
        const m = f.mission, mids = [...m.build.missions, ...(m.mission.mission ? [m.mission.mission] : [])];
        return Promise.all([get(`/data/lessons/${m.discover.lesson}.json`), ...mids.map((x) => get(`/data/missions/${x}.json`))])
          .then(([lesson, ...ms]) => ({ ...d, f, lesson, missionFiles: Object.fromEntries(ms.map((x) => [x.id, x])) }));
      });
  }
  const scene = (sid) => get(`/data/scenes/${sid}.json`);
  function playScene(sid, done) {
    scene(sid).then((sc) => StoryPlayer.play(sc, { characters: D.characters, text: T, onDone: done }))
      .catch(() => { message("That scene didn't load", "Check your connection and try again."); });
  }

  function message(title, text) {
    const main = $("main"); main.innerHTML = "";
    const c = el("section", "card"); c.append(el("h3", "", title), el("p", "", text));
    const a = el("a", "btn", "Go to the lessons"); a.href = "/learn"; a.setAttribute("data-tip", "Open Robot Lessons."); c.appendChild(a);
    main.appendChild(c);
  }

  function render() {
    if (!D) return;
    if (!D.f) return message("That mission doesn't exist", "Check the link, or start from the lessons.");
    const { episode: ep, mission: m } = D.f, sv = saved();
    if (!S.missionUnlocked(D.episodes, m.id, sv)) return message("This mission is still locked", "Finish the mission before it first.");
    if (ep.art) { const probe = new Image(); probe.onload = () => ($("scenebg").style.backgroundImage = `url("${ep.art}")`); probe.src = ep.art; }
    document.title = `${T(m.title)} · Circuit Rebels`;
    const next = S.nextStep(m, sv), cur = view && S.stepOpen(m, view, sv) ? view : next;
    const main = $("main"); main.innerHTML = "";
    const head = el("div", "mhead");
    head.append(el("span", "kick", `EPISODE ${ep.num} · ${T(ep.title).toUpperCase()}`), el("h2", "", T(m.title)));
    if (ep.about) head.appendChild(el("p", "", T(ep.about)));
    main.appendChild(head);
    // the five steps
    const row = el("nav", "steps"); row.setAttribute("aria-label", "Mission steps");
    S.STEPS.forEach((s, k) => {
      const done = S.stepDone(m, s, sv), open = S.stepOpen(m, s, sv), b = el("button");
      b.type = "button"; b.className = (done ? "done " : "") + (s === cur ? "cur" : ""); b.disabled = !open;
      b.append(el("span", "n", `STEP ${k + 1}`), el("b", "", S.STEP_NAME[s]), el("span", "st", done ? "✓ done" : open ? "now" : "locked"));
      b.setAttribute("aria-current", s === cur ? "step" : "false");
      b.setAttribute("data-tip", done ? `${S.STEP_NAME[s]} is done. Open it again any time.` : open ? `${S.STEP_NAME[s]}: the step you're on.` : "Finish the step before it first.");
      b.onclick = () => { view = s; render(); };
      row.appendChild(b);
    });
    main.appendChild(row);
    main.appendChild(next === null && !view ? doneCard(m) : stepCard(m, cur, sv));
    mark({}); // remembers this as the student's last mission
  }

  function stepCard(m, s, sv) {
    const c = el("section", "card"), done = S.stepDone(m, s, sv), k = S.STEPS.indexOf(s) + 1;
    c.appendChild(el("span", "kick", `STEP ${k} OF 5 · ${S.STEP_NAME[s].toUpperCase()}${done ? " · DONE" : ""}`));
    const acts = el("div", "acts"), btn = (text, tip, onclick, ghost) => { const b = el("button", ghost ? "btn ghost" : "btn big", text); b.type = "button"; b.setAttribute("data-tip", tip); b.onclick = onclick; acts.appendChild(b); return b; };
    const link = (text, tip, href) => { const a = el("a", "btn big", text); a.href = href; a.setAttribute("data-tip", tip); acts.appendChild(a); return a; };
    if (s === "briefing") {
      c.append(el("h3", "", "The briefing"), el("p", "", "Find out what's going on, and what you need to learn."));
      btn(done ? "Watch it again" : "Watch the briefing", "Play the story scene. Tap or press Space for each line.", () => playScene(m.briefing, () => { mark({ briefing: Date.now() }); view = null; render(); }));
    } else if (s === "discover") {
      const L = D.lesson, num = D.lessonIds.indexOf(L.id) + 1;
      c.append(el("h3", "", `Lesson ${num}: ${T(L.title)}`), el("p", "", T(L.about) || "A short lesson with a quiz at the end."));
      link(done ? "Open the lesson again" : "Open the lesson", "Open the lesson. When you finish it, come back here.", `/learn?run=${id}#lesson-${L.id}`);
      if (!done) c.appendChild(el("p", "note", "Finish the lesson and its quiz, then come back to this page."));
    } else if (s === "build") {
      const need = m.build.need || 1;
      c.append(el("h3", "", "Practice"), el("p", "", need < m.build.missions.length ? `Try your design ideas. Reach the goal in ${need} of these missions to go on.` : "Try your design ideas. Reach the goal in these missions to go on."));
      const list = el("div", "build");
      m.build.missions.forEach((mid) => {
        const mf = D.missionFiles[mid], ok = !!(sv.missions[mid] || {}).goal, a = el("a", ok ? "done" : "");
        a.href = PAGE[mf.game](mid); a.setAttribute("data-tip", `Open ${T(mf.title)}. Predict first, then test your design.`);
        a.append(el("b", "", T(mf.title)), el("span", "st", ok ? "✓ goal reached" : (sv.missions[mid] || {}).tries ? "tried, keep going" : "not tried yet"));
        list.appendChild(a);
      });
      c.appendChild(list);
    } else if (s === "mission") {
      const mid = m.mission.mission, mf = D.missionFiles[mid];
      c.append(el("h3", "", T(mf.title)), el("p", "", T((mf.tiers[tier()] && mf.tiers[tier()].brief) || mf.tiers.recruit.brief)));
      link(done ? "Play it again" : "Take your shot", "Open the mission. Predict, test your design, and reach the goal.", PAGE[mf.game](mid));
    } else {
      c.append(el("h3", "", "Mission debrief"), el("p", "", "See how it went, and what you found."));
      btn("Watch the debrief", "Play the closing scene, then see your reward.", () => {
        const finish = () => { mark({ reward: Date.now(), done: Date.now(), rewards: m.rewards || [] }); view = null; render(); };
        if (m.debrief) playScene(m.debrief, finish); else finish();
      });
    }
    if (acts.children.length) c.appendChild(acts);
    if (view && view !== S.nextStep(m, sv)) { const back = el("button", "btn ghost", "Back to the step you're on"); back.type = "button"; back.setAttribute("data-tip", "Go back to your current step."); back.onclick = () => { view = null; render(); }; c.appendChild(back); }
    return c;
  }

  function doneCard(m) {
    const c = el("section", "card");
    c.append(el("span", "kick", "MISSION COMPLETE"), el("h3", "", "You did it!"));
    for (const rid of m.rewards || []) {
      const r = D.rewards.find((x) => x.id === rid); if (!r) continue;
      const box = el("div", "reward"), pic = el("div", "pic", r.art ? "" : "picture coming soon");
      if (r.art) pic.style.backgroundImage = `url("${r.art}")`;
      const txt = el("div"); txt.append(el("span", "k", { echo: "New Echo", volt: "New Volt part", file: "New Lazarus file", access: "New place" }[r.kind]), el("b", "", T(r.title)), el("p", "", T(r.text)));
      box.append(pic, txt); c.appendChild(box);
    }
    const acts = el("div", "acts"), nx = S.nextMission(D.episodes, m.id);
    if (nx && S.missionUnlocked(D.episodes, nx.id, saved())) { const a = el("a", "btn big", `Next: ${T(nx.title)}`); a.href = `/mission?id=${nx.id}`; a.setAttribute("data-tip", "Start the next story mission."); acts.appendChild(a); }
    else c.appendChild(el("p", "note", "That's all of this episode for now. More missions are on the way."));
    const again = el("button", "btn ghost", "Watch the debrief again"); again.type = "button"; again.setAttribute("data-tip", "Play the closing scene again.");
    again.onclick = () => (m.debrief ? playScene(m.debrief, () => {}) : null); acts.appendChild(again);
    c.appendChild(acts);
    return c;
  }

  load().then((d) => { D = d; render(); }).catch(() => message("The mission didn't load", "Check your connection and refresh the page."));
  // back from a lesson or the Lab (including a page restored from the Back cache): read the saved data again
  addEventListener("pageshow", (e) => { if (e.persisted) render(); });
  addEventListener("storage", () => render());
  window.__mission = { get data() { return D; }, render };
})();
