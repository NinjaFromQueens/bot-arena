/* The Neo Harbor map (docs/platform-flow-spec.md section 9): the season's painted map (season.json) with a marker per
   episode at its place. Built episodes come from their own files (public/data/episodes); the others show as coming
   soon. Each marker's state (done, ready, locked) and each mission's comes from story.js reading this device's saved
   progress, the same rules the mission page uses. Picking an episode lists its missions, each opening /mission. */
(function () {
  const S = window.Story, $ = (id) => document.getElementById(id);
  const ls = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const T = (v) => (window.Tier ? Tier.text(v, Tier.current()) : v && typeof v === "object" ? v.recruit : v);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(u))));
  const saved = () => ({ lessons: ls("learn-progress", {}), missions: ls("cr-missions", {}), record: ls("cr-record", null) || S.emptyRecord() });

  let season = null, episodes = [], pick = null;
  const built = (num) => episodes.find((e) => e.num === num) || null;
  function stateOf(num, sv) {
    const ep = built(num); if (!ep) return "soon";
    if (!S.episodeUnlocked(ep, episodes, sv)) return "locked";
    return ep.missions.every((m) => S.missionDone(m, sv)) ? "done" : "open";
  }
  function render() {
    const sv = saved(), map = $("map");
    map.innerHTML = "";
    for (const e of season.episodes) {
      const st = stateOf(e.num, sv), ep = built(e.num), b = el("button", "pin " + st, st === "done" ? "✓" : String(e.num));
      b.type = "button"; b.style.left = e.map.x + "%"; b.style.top = e.map.y + "%";
      b.setAttribute("aria-pressed", String(pick === e.num));
      b.setAttribute("aria-label", `Episode ${e.num}: ${T(ep ? ep.title : e.title)}, ${{ soon: "coming soon", locked: "locked", done: "done", open: "ready to play" }[st]}`);
      b.setAttribute("data-tip", `Episode ${e.num}: ${T(ep ? ep.title : e.title)} · ${e.place}. ${{ soon: "Coming soon.", locked: "Finish the episode before it first.", done: "Done! Play it again any time.", open: "Ready to play." }[st]}`);
      b.onclick = () => { pick = e.num; render(); $("ep").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }); };
      map.appendChild(b);
    }
    panel(sv);
  }
  function panel(sv) {
    const box = $("ep"), e = season.episodes.find((x) => x.num === pick), ep = built(pick), st = stateOf(pick, sv);
    box.innerHTML = "";
    box.append(el("span", "kick", `EPISODE ${e.num} · ${e.place.toUpperCase()}`), el("h3", "", T(ep ? ep.title : e.title)));
    if (!ep) { box.appendChild(el("p", "", "This episode is coming soon. Its missions are being built.")); return; }
    if (ep.about) box.appendChild(el("p", "", T(ep.about)));
    if (st === "locked") box.appendChild(el("p", "note", "Finish the episode before this one to open it."));
    const list = el("div", "ms");
    ep.missions.forEach((m) => {
      const done = S.missionDone(m, sv), open = S.missionUnlocked(episodes, m.id, sv), next = open && !done ? S.nextStep(m, sv) : null;
      const row = el("div", "m" + (done ? " done" : open ? " next" : "")), left = el("div");
      left.append(el("b", "", T(m.title)), el("div", "st", done ? "✓ Done" : !open ? "Locked: finish the mission before it" : next === "briefing" ? "Not started" : `Next: ${S.STEP_NAME[next]}`));
      row.appendChild(left);
      if (open) {
        const a = el("a", done ? "btn ghost" : "btn big", done ? "Play again" : next === "briefing" ? "Start" : "Continue");
        a.href = "/mission?id=" + encodeURIComponent(m.id); a.setAttribute("data-tip", done ? "Open this mission again." : "Open this mission at the step you're on.");
        row.appendChild(a);
      }
      list.appendChild(row);
    });
    box.appendChild(list);
  }
  // the opening film (season.json's opening): Cadets get the storybook version (a scene file), per the game bible
  function opening() {
    const o = season.opening, box = $("opening"); if (!o) return;
    const sv = saved(), fresh = !ls("cr-opening", 0) && !Object.keys((sv.record && sv.record.missions) || {}).length;
    box.innerHTML = ""; box.hidden = false; box.className = "opening" + (fresh ? " new" : "");
    const b = el("button", fresh ? "btn big" : "btn ghost", fresh ? "▶ Watch the opening" : "▶ Watch the opening again"); b.type = "button";
    b.setAttribute("data-tip", `Play the story's opening (about ${o.minutes} minutes). It shows how Neo Harbor got this way.`);
    b.onclick = watch;
    if (fresh) { const t = el("div", "txt"); t.append(el("b", "", "New here? Start with the opening."), el("span", "", `About ${o.minutes} minutes. Then pick an episode on the map.`)); box.append(t); }
    box.appendChild(b);
  }
  function watch() {
    const o = season.opening, done = () => { try { localStorage.setItem("cr-opening", "1"); } catch {} opening(); };
    if (window.Tier && Tier.current() === "cadet") get("/data/characters.json").then((c) => StoryPlayer.open(o.cadet, { characters: c, tier: "cadet", onDone: done })).catch(() => {});
    else StoryPlayer.film(o, { onDone: done });
  }
  // the episode to show first: the one with the student's last mission, else the first one ready to play
  function firstPick(sv) {
    const last = sv.record && sv.record.last && S.find(episodes, sv.record.last);
    if (last) return last.episode.num;
    const open = season.episodes.find((e) => stateOf(e.num, sv) === "open");
    return open ? open.num : season.episodes[0].num;
  }

  Promise.all([get("/data/season.json"), get("/data/episodes/index.json")])
    .then(([s, idx]) => Promise.all(idx.map((id) => get(`/data/episodes/${id}.json`))).then((eps) => { season = s; episodes = eps; }))
    .then(() => {
      $("season").textContent = season.title.toUpperCase();
      const probe = new Image(); probe.onload = () => ($("map").style.backgroundImage = `url("${season.map}")`); probe.src = season.map;
      pick = firstPick(saved()); render(); opening();
      // on a narrow screen the map scrolls inside its frame: start with the chosen episode in view
      const e = season.episodes.find((x) => x.num === pick), fr = $("frame");
      if (fr.scrollWidth > fr.clientWidth) fr.scrollLeft = Math.max(0, (e.map.x / 100) * fr.scrollWidth - fr.clientWidth / 2);
    })
    .catch(() => { $("ep").innerHTML = ""; $("ep").appendChild(el("p", "note", "The map didn't load. Check your connection and refresh the page.")); });
  addEventListener("pageshow", (e) => { if (e.persisted && season) render(); });
  window.__map = { get pick() { return pick; }, get episodes() { return episodes; } };
})();
