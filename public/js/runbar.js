/* The run bar (docs/platform-flow-spec.md section 6): on a lesson, the Lab, the Racer or practice, opened from a story
   mission with ?run=<mission id>, a slim bar at the top says which step this is and turns green when it's done, with
   the way back to the mission. Without ?run (or in an offline copy) it does nothing, so the page is exactly as before.
   It reads only what the pages already save (story.js's rules), and it keeps the student inside the mission: links on
   the page to this mission's other activities get the same ?run. It never navigates by itself.
   In a class game it also follows the class (story:hello and story:state, with the saved game pass): it shows the
   class's step, and when the class finishes the mission the student gets the reward here too, by story.js's shared
   rule (the same one the game page uses), so nobody misses it for being in the Lab. */
(function () {
  const run = new URLSearchParams(location.search).get("run");
  if (!run || !/^[a-z][a-z0-9-]*$/.test(run) || location.protocol === "file:") return;
  const ls = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(u))));
  const T = (v) => (window.Tier ? Tier.text(v, Tier.current()) : v && typeof v === "object" ? v.recruit : v);
  const withStory = () => (window.Story ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement("script"); s.src = "/js/story.js"; s.onload = ok; s.onerror = no; document.head.appendChild(s); }));

  withStory()
    .then(() => get("/data/episodes/index.json"))
    .then((idx) => Promise.all(idx.map((e) => get(`/data/episodes/${e}.json`))))
    .then((episodes) => {
      const S = window.Story, f = S.find(episodes, run); if (!f) return;
      const m = f.mission, page = document.body.dataset.page, asked = new URLSearchParams(location.search).get("mission");
      const lessonHere = () => (location.hash.match(/^#lesson-([a-z0-9-]+)/) || [])[1];
      const step = () => (page === "learn" ? (lessonHere() === m.discover.lesson ? "discover" : null)
        : m.build.missions.includes(asked) ? "build" : m.mission.mission && asked === m.mission.mission ? "mission" : null);
      const ours = new Set([...m.build.missions, ...(m.mission.mission ? [m.mission.mission] : [])]);
      const style = document.createElement("style");
      style.textContent = `.runbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 10px max(16px, env(safe-area-inset-right, 0px)) 10px max(16px, env(safe-area-inset-left, 0px)); background: #1f1d24; border-bottom: 2px solid var(--orange, #f46524); font-family: "Barlow Semi Condensed", Arial, sans-serif; color: #eeeaf2; position: relative; z-index: 30; }
        .runbar .rk { font-family: "JetBrains Mono", monospace; font-size: 11px; letter-spacing: .14em; color: var(--orange-hi, #ff8a4c); }
        .runbar .rt { font-family: "Chakra Petch", sans-serif; font-weight: 700; font-size: 17px; }
        .runbar .rs { font-size: 15px; color: #b9b3c4; flex: 1 1 220px; min-width: 0; }
        .runbar .rc { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--teal, #36c2b0); }
        .runbar a { padding: 8px 14px; border-radius: 10px; border: 1.5px solid #3a3842; background: #2a2830; color: #eeeaf2; text-decoration: none; font-weight: 700; white-space: nowrap; }
        .runbar.done { border-bottom-color: var(--good, #4fd18b); } .runbar.done .rs { color: var(--good, #4fd18b); font-weight: 700; }
        .runbar.done a { background: var(--good, #4fd18b); border-color: var(--good, #4fd18b); color: #141316; }`;
      document.head.appendChild(style);
      const bar = document.createElement("div"); bar.className = "runbar"; bar.setAttribute("role", "status");
      const k = document.createElement("span"), t = document.createElement("span"), s = document.createElement("span"), c = document.createElement("span"), a = document.createElement("a");
      k.className = "rk"; t.className = "rt"; s.className = "rs"; c.className = "rc"; a.href = "/mission?id=" + encodeURIComponent(run);
      a.setAttribute("data-tip", "Go back to the story mission. Your progress is saved on this device.");
      bar.append(k, t, s, c, a); document.body.insertBefore(bar, document.body.firstChild);
      const TODO = { discover: "Finish this lesson and its quiz.", build: `Reach the goal in ${m.build.need || 1} of the practice missions.`, mission: "Reach the goal to complete the mission." };
      let last = "", cls = null, rewardNames = "";
      const saved = () => ({ lessons: ls("learn-progress", {}), missions: ls("cr-missions", {}), record: ls("cr-record", null) || S.emptyRecord() });
      function check() {
        const st = step(), sv = saved(), finished = S.missionDone(m, sv), done = finished || (!!st && S.stepDone(m, st, sv));
        const classStep = cls && cls.now && cls.now.mission === run ? S.STEPS.indexOf(cls.now.step) + 1 : 0;
        const sig = [st, done, finished, classStep, rewardNames].join("|");
        if (sig === last) return; last = sig;
        k.textContent = "STORY MISSION"; t.textContent = T(m.title);
        s.textContent = finished ? `Mission complete!${rewardNames ? " " + rewardNames : ""}`
          : !st ? "You're on a story mission." : done ? `Step ${S.STEPS.indexOf(st) + 1} of 5 done!` : `Step ${S.STEPS.indexOf(st) + 1} of 5: ${S.STEP_NAME[st]}. ${TODO[st]}`;
        c.textContent = classStep && !finished ? `Your class: step ${classStep} of 5` : ""; c.hidden = !c.textContent;
        a.textContent = done ? "Back to the mission →" : "Back to the mission";
        bar.classList.toggle("done", done);
      }
      // links to this mission's other activities keep ?run, so the bar comes along (at most every half second: some
      // pages change their text many times a second, and each change would run this)
      let keepT = 0;
      function keep() {
        document.querySelectorAll('a[href*="mission="]').forEach((el) => {
          const href = el.getAttribute("href"); if (/[?&]run=/.test(href) || el.closest(".runbar")) return;
          try { const u = new URL(href, location.href); if (u.origin === location.origin && ours.has(u.searchParams.get("mission"))) { u.searchParams.set("run", run); el.setAttribute("href", u.pathname + u.search + u.hash); } } catch {}
        });
      }
      const keepSoon = () => { if (!keepT) keepT = setTimeout(() => { keepT = 0; keep(); }, 500); };
      // in a class game: follow the class, and apply its progress to this student's record (story.js's shared rule)
      let who = null; try { const g = JSON.parse(localStorage.getItem("ba-session")); if (g && g.code && g.playerId && g.token) who = { code: g.code, playerId: g.playerId, token: g.token }; } catch {}
      function onClass(state) {
        cls = state;
        const finished = S.finishedFor(state.done, who.playerId);
        const out = S.applyClass(ls("cr-record", null), { now: state.now, finished }, episodes, Date.now());
        if (out.changed) try { localStorage.setItem("cr-record", JSON.stringify(out.record)); } catch {}
        if (finished.includes(run) && !rewardNames) get("/data/rewards.json").then((rw) => {
          rewardNames = (m.rewards || []).map((id) => rw.find((r) => r.id === id)).filter(Boolean).map((r) => ({ echo: "New Echo", volt: "New Volt part", file: "New Lazarus file", access: "New place" }[r.kind] + ": " + T(r.title))).join(" · ");
          check();
        }).catch(() => {});
        check();
      }
      if (who && (window.baSocket || window.io)) {
        const sock = window.baSocket || io();
        const hello = () => sock.emit("story:hello", { who }, (r) => { if (r && r.ok) onClass(r); });
        sock.on("connect", hello); if (sock.connected) hello();
        sock.on("story:state", (st) => onClass(st));
      }
      check(); keep();
      new MutationObserver(keepSoon).observe(document.body, { childList: true, subtree: true });
      addEventListener("storage", check); addEventListener("hashchange", check);
      setInterval(check, 2000); // a page's own saves don't fire "storage" in the same tab
      window.__runbar = { check, get step() { return step(); }, get cls() { return cls; } };
    })
    .catch(() => {}); // no bar is better than a broken page
})();
