/* Teacher dashboard: sign in with Google, make classes, add students (each gets a 3-picture password), print login
   cards, and see each student's progress: lessons, Lab stars, Brain Challenges, story missions and race medals (lib/accounts.js). */
(function () {
  const $ = (id) => document.getElementById(id), C = window.Catalog, F = window.Flight, CH = window.Challenges, R = window.Race;
  const api = (path, method = "GET", body) => fetch("/api/account" + path, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body && JSON.stringify(body) })
    .then((r) => r.json()).catch(() => ({ ok: false, error: "Couldn't reach the server. Check the internet and try again." }));
  const show = (id) => ["s-signin", "s-off", "s-classes", "s-class"].forEach((s) => ($(s).hidden = s !== id));
  const say = (t) => ($("msg").textContent = t || "");
  const site = location.host + "/login";
  document.querySelectorAll(".siteurl").forEach((el) => (el.textContent = site));
  const picsText = (p) => p.map((i) => C.PICS[i][0]).join("");
  const picsName = (p) => p.map((i) => C.PICS[i][1]).join(", ");
  const MEDAL = { gold: "🥇", silver: "🥈", bronze: "🥉" };
  // story missions' names for the Story column, from the episode files (until they load, the column shows counts only)
  const STORY = {};
  fetch("/data/episodes/index.json").then((r) => r.json()).then((ids) => Promise.all(ids.map((e) => fetch(`/data/episodes/${e}.json`).then((r) => r.json()))))
    .then((eps) => { for (const ep of eps) for (const m of ep.missions) STORY[m.id] = `Episode ${ep.num}: ${typeof m.title === "object" ? m.title.recruit : m.title}`; if (cur) roster(); }).catch(() => {});
  const ago = (t) => { if (!t) return "never"; const d = Math.floor((Date.now() - new Date(t)) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
  // a button that needs a second click to act (deleting things)
  function twice(btn, label, act) {
    let armed = null;
    btn.onclick = () => {
      if (armed) { clearTimeout(armed); armed = null; btn.classList.remove("confirm"); act(); return; }
      const was = btn.textContent; btn.textContent = label; btn.classList.add("confirm");
      armed = setTimeout(() => { armed = null; btn.textContent = was; btn.classList.remove("confirm"); }, 3000);
    };
  }

  // ---------------- sign in ----------------
  async function start() {
    const cfg = await api("/config");
    if (!cfg.ok || !cfg.accounts) return show("s-off");
    const me = await api("/me");
    if (me.ok && me.user && me.user.kind === "teacher") {
      $("mename").textContent = me.user.name; $("me").hidden = false;
      return route();
    }
    show("s-signin");
    if (cfg.dev) $("devform").hidden = false;
    if (!cfg.google) { $("nogoogle").hidden = !!cfg.dev; return; }
    const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => {
      google.accounts.id.initialize({ client_id: cfg.google, callback: async (res) => {
        const r = await api("/google", "POST", { credential: res.credential });
        if (!r.ok) return say(r.error);
        start();
      } });
      google.accounts.id.renderButton($("gbtn"), { theme: "filled_black", size: "large", text: "signin_with", shape: "pill" });
    };
    s.onerror = () => say("Couldn't load Google sign-in. Check the internet and try again.");
    document.head.appendChild(s);
  }
  $("devform").addEventListener("submit", async (e) => { e.preventDefault(); const r = await api("/dev", "POST", { name: $("devname").value }); if (!r.ok) return say(r.error); start(); });
  $("signout").onclick = async () => { await api("/logout", "POST"); location.hash = ""; location.reload(); };

  // ---------------- classes ----------------
  const route = () => (location.hash.length > 1 ? openClass(location.hash.slice(1)) : listClasses());
  addEventListener("hashchange", () => { if (!$("me").hidden) route(); });
  async function listClasses() {
    say(""); show("s-classes");
    const r = await api("/classes"); if (!r.ok) return say(r.error);
    $("classes").innerHTML = "";
    if (!r.classes.length) { const p = document.createElement("p"); p.className = "small"; p.textContent = "No classes yet. Type a name above and press Make a class."; $("classes").appendChild(p); }
    r.classes.forEach((c) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "ccard"; b.setAttribute("data-tip", `Open ${c.name}: its students, progress and login cards.`);
      b.innerHTML = "<b></b><span class=\"code\"></span><span class=\"small\"></span>";
      b.children[0].textContent = c.name; b.children[1].textContent = c.code; b.children[2].textContent = `${c.students} student${c.students === 1 ? "" : "s"}`;
      b.onclick = () => (location.hash = c.id);
      $("classes").appendChild(b);
    });
  }
  $("newclass").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("/classes", "POST", { name: $("classname").value });
    if (!r.ok) return say(r.error);
    $("classname").value = ""; location.hash = r.class.id;
  });

  // ---------------- one class ----------------
  let cur = null, refresher = null;
  async function openClass(classId) {
    say("");
    const r = await api("/classes/" + encodeURIComponent(classId));
    if (!r.ok) { say(r.error); location.hash = ""; return; }
    cur = r; show("s-class");
    $("cname").textContent = r.class.name; $("ccode").textContent = r.class.code;
    $("csv").href = `/api/account/classes/${encodeURIComponent(r.class.id)}/export.csv`;
    roster();
    clearInterval(refresher); // progress shows up while you watch: the class reloads every 20 s while it's on screen
    refresher = setInterval(async () => {
      if (document.hidden || $("s-class").hidden || !cur || cur.class.id !== r.class.id) return;
      const fresh = await api("/classes/" + encodeURIComponent(r.class.id));
      if (fresh.ok && cur.class.id === fresh.class.id) { cur = fresh; roster(); }
    }, 20000);
  }
  $("toclasses").onclick = (e) => { e.preventDefault(); location.hash = ""; };
  $("addbtn").onclick = () => { $("addbox").hidden = !$("addbox").hidden; if (!$("addbox").hidden) $("names").focus(); };
  $("addbox").addEventListener("submit", async (e) => {
    e.preventDefault();
    const names = $("names").value.split(/\r?\n/).map((n) => n.trim()).filter(Boolean);
    const r = await api(`/classes/${encodeURIComponent(cur.class.id)}/students`, "POST", { names });
    if (!r.ok) { $("addmsg").textContent = r.error; return; }
    $("names").value = ""; $("addmsg").textContent = `Added ${r.students.length}. Print their login cards so they know their pictures.`;
    openClass(cur.class.id);
  });
  twice($("delclass"), "Click again to delete", async () => {
    const r = await api("/classes/" + encodeURIComponent(cur.class.id), "DELETE");
    if (!r.ok) return say(r.error);
    location.hash = "";
  });
  $("showpics").onchange = roster;
  $("showlessons").onchange = roster;

  function roster() {
    const t = $("roster"), list = cur.students, lessons = $("showlessons").checked, pics = $("showpics").checked;
    $("noone").hidden = list.length > 0; t.hidden = !list.length;
    const missions = F.MISSIONS.length * 3;
    const head = ["Student", "Pictures", "Lessons", "Lab stars", "Brain Challenges", "Story", "Race medals", "Last signed in", ""];
    t.innerHTML = "";
    const hr = t.insertRow();
    const th = (txt, tip) => { const c = document.createElement("th"); c.textContent = txt; if (tip) c.setAttribute("data-tip", tip); hr.appendChild(c); };
    if (lessons) { th("Student"); C.LESSONS.forEach((l, i) => th(`L${i + 1}`, `Lesson ${i + 1}: ${l.n}. Shows the first-try quiz score.`)); }
    else head.forEach((h, i) => th(h, ["", "Their 3-picture password, in order.", `Lessons finished, out of ${C.LESSONS.length}.`, `Stars earned in the Flying Car Lab, out of ${missions}.`, `Brain Challenges beaten, out of ${CH.LIST.length}.`, "Story missions finished (the debrief watched, alone or with the class).", `Medals on each Robot Racer track (${R.TRACKS.map((x) => x.n).join(", ")}). Lap times are checked by the server.`, "", ""][i]));
    list.forEach((s) => {
      const row = t.insertRow(), p = s.progress, L = p["learn-progress"] || {};
      const cell = (txt, cls, tip) => { const c = row.insertCell(); c.textContent = txt; if (cls) c.className = cls; if (tip) c.setAttribute("data-tip", tip); return c; };
      cell(s.name, "nm");
      if (lessons) {
        C.LESSONS.forEach((l) => { const x = L[l.id]; cell(x && x.done ? `${x.score}/${x.total}` : "–", "l" + (x && x.done ? (x.score === x.total ? " done" : " part") : ""), `${l.n}: ${x && x.done ? `finished, ${x.score} of ${x.total} right on the first try` : "not finished yet"}`); });
        return;
      }
      cell(pics ? picsText(s.pics) : "• • •", "pics", pics ? picsName(s.pics) : "Turn on Show pictures to see them.");
      const done = C.LESSONS.filter((l) => L[l.id] && L[l.id].done).length;
      const lc = cell(`${done}/${C.LESSONS.length}`, "num"); const bar = document.createElement("span"); bar.className = "bar"; bar.innerHTML = `<i style="width:${(done / C.LESSONS.length) * 100}%"></i>`; lc.appendChild(bar);
      const stars = Object.values(p["fcl-stars"] || {}).reduce((a, st) => a + st.filter(Boolean).length, 0);
      cell(`${stars}/${missions}`, "num");
      cell(`${CH.LIST.filter((c) => (p["rba-challenges"] || {})[c.id] && p["rba-challenges"][c.id].done).length}/${CH.LIST.length}`, "num");
      const story = (p["cr-record"] || { done: [] }).done;
      cell(String(story.length), "num", story.length ? story.map((m) => STORY[m] || m).join(". ") + "." : "No story missions finished yet.");
      const laps = p["race-bests"] || {};
      cell(R.TRACKS.map((tr) => { const b = laps[tr.id], m = b && R.medalOf(b.time, tr); return m ? MEDAL[m] : b ? "🏁" : "–"; }).join(" "), "num",
        R.TRACKS.map((tr) => { const b = laps[tr.id], m = b && R.medalOf(b.time, tr); return `${tr.n}: ${b ? `${b.time.toFixed(2)} s${m ? ` (${m})` : ""}` : "no lap yet"}`; }).join(". ") + ".");
      cell(ago(s.lastSeen), "num");
      const act = row.insertCell(), wrap = document.createElement("div"); wrap.className = "row-actions"; act.appendChild(wrap);
      const reset = document.createElement("button"); reset.type = "button"; reset.className = "mini"; reset.textContent = "New pictures";
      reset.setAttribute("data-tip", "Give this student new pictures (if they forgot theirs, or someone else knows them). Click twice.");
      twice(reset, "Click again", async () => { const r = await api(`/students/${encodeURIComponent(s.id)}/reset`, "POST"); if (!r.ok) return say(r.error); s.pics = r.pics; $("showpics").checked = true; roster(); });
      const del = document.createElement("button"); del.type = "button"; del.className = "mini danger"; del.textContent = "Remove";
      del.setAttribute("data-tip", "Remove this student and delete their progress. Click twice.");
      twice(del, "Click again", async () => { const r = await api(`/students/${encodeURIComponent(s.id)}`, "DELETE"); if (!r.ok) return say(r.error); openClass(cur.class.id); });
      wrap.append(reset, del);
    });
    t.classList.toggle("matrix", lessons);
  }

  // ---------------- login cards (printed) ----------------
  $("cardsbtn").onclick = () => {
    if (!cur || !cur.students.length) return say("Add students first, then print their cards.");
    const box = $("cards"); box.innerHTML = "";
    cur.students.forEach((s) => {
      const d = document.createElement("div"); d.className = "lcard";
      d.innerHTML = '<div class="n"></div><div class="p"></div><div class="s"></div><div class="s"></div>';
      d.children[0].textContent = s.name; d.children[1].textContent = picsText(s.pics);
      d.children[2].textContent = `Go to ${site} and type the class code ${cur.class.code}.`;
      d.children[3].textContent = `Tap your name, then these 3 pictures in order: ${picsName(s.pics)}.`;
      box.appendChild(d);
    });
    window.print();
  };

  start();
})();
