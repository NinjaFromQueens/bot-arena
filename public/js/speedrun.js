/* The board's Speed Run page (docs/speed-run-plan.md, round by round): the teacher sets up a run, opens each problem,
   shows the worked answer and the class's common mistakes, and ends with the results. Students answer on their game
   pages. The server makes every problem and checks every answer (room.sprint, sent in room:state; live counts come
   to the board only as room:sprintStats). Nothing here knows an answer before the server reveals it to the class,
   except the board's own stats, which this page shows only after the reveal. */
(function () {
  const E = window.Engine, C = window.SprintCard, { Sound, RM } = E;
  const $ = (id) => document.getElementById(id);
  const socket = window.baSocket;
  const onConnect = (fn) => { socket.on("connect", fn); if (socket.connected) fn(); }; // the connection may already be up (made by the page's inline script)
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem("ba-host")); } catch {}

  let ready = false, st = null, sp = null, stats = null, offset = 0, key = "";
  const clock = () => Date.now() + offset;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (text, tip, onclick, cls) => { const b = el("button", cls || "btn big", text); b.type = "button"; b.setAttribute("data-tip", tip); b.onclick = onclick; return b; };
  const send = (ev, data) => socket.emit(ev, data || {}, (r) => { if (!r || !r.ok) $("status").textContent = "That didn't work. Try again."; });
  const LEVEL = { cadet: "Cadet", recruit: "Recruit", operative: "Operative" };
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  function select(id, label, tip, options, value) {
    const wrap = el("label"), s = el("select"); s.id = id; wrap.setAttribute("data-tip", tip);
    options.forEach(([v, text]) => { const o = el("option", "", text); o.value = v; s.appendChild(o); });
    s.value = String(value); wrap.append(label, s); return wrap;
  }
  const kicker = (parts) => { const k = el("div", "kick"); parts.forEach((p, i) => k.appendChild(i ? el("span", "tag", p) : el("span", "", p))); return k; };

  // ---------------- what each phase shows ----------------
  function build() {
    const stage = $("stage"), side = $("side"); stage.innerHTML = ""; side.innerHTML = "";
    if (!socket || !saved) {
      stage.append(el("h2", "", "No game in this tab"), el("p", "lead", "Open the board (Host on the board) first, then press Speed Run in the lobby."));
      return;
    }
    if (!ready || !st) { stage.append(el("h2", "", "Connecting...")); return; }
    if (!sp) return buildSetup(stage, side);
    const head = kicker([`SPEED RUN · ${sp.name.toUpperCase()}`]);
    if (sp.phase === "ready") {
      stage.append(head, el("h2", "", "Get ready!"),
        el("p", "lead", `${plural(sp.n, "problem")} about a flying car. Solve each one on your device.`),
        el("p", "lead", sp.timer ? "A right answer scores 100 points, plus up to 100 more the sooner it comes." : "A right answer scores 100 points. No timer this time: take care, not speed."),
        el("p", "lead", "A wrong answer never costs points. You wait 5 seconds, then try again."));
      side.append(panel([counts(), actions(btn("Show problem 1", "Open the first problem on every student's device. Space or the right arrow works too.", () => send("host:sprintNext"), "btn big"), true)]));
    } else if (sp.phase === "open" || sp.phase === "revealed") {
      const p = sp.problem, open = sp.phase === "open";
      stage.append(kicker([`PROBLEM ${sp.i + 1} OF ${sp.n}`, C.KIND[p.kind] || p.kind, LEVEL[p.tier]]));
      stage.append(el("p", "qtext", p.text));
      if (p.pic) { const cv = el("canvas", "pic"); cv.id = "pic"; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "A picture for this problem."); stage.appendChild(cv); }
      if (p.input.kind === "choice") {
        const box = el("div", "opts"); box.id = "opts";
        p.input.options.forEach((o) => { const d = el("div", "", o.label); d.dataset.v = String(o.value); box.appendChild(d); });
        stage.appendChild(box);
      } else if (open) stage.appendChild(el("p", "unit", p.input.unit ? `Answer in ${p.input.unit}.` : "The answer is a number with no unit."));
      if (!open) {
        const r = sp.reveal;
        if (p.input.kind !== "choice") stage.append(el("p", "ansbig", C.answerText(p, r.answer)));
        else [...$("opts").children].forEach((d) => d.classList.toggle("right", d.dataset.v === String(r.answer.value)));
        const ol = el("ol", "steps"); r.steps.slice(0, p.input.kind === "choice" ? -1 : r.steps.length).forEach((s) => ol.appendChild(el("li", "", s))); stage.appendChild(ol);
        const chart = el("div", "mchart"); chart.id = "mchart"; stage.appendChild(chart);
      }
      const last = sp.i >= sp.n - 1;
      const main = open ? btn("Show the answer", "Close this problem and show the worked answer and the class's common mistakes. Space or the right arrow works too.", () => send("host:sprintReveal"))
        : btn(last ? "See the results" : "Next problem", last ? "Show how the class did on every problem." : "Open the next problem on every student's device. Space or the right arrow works too.", () => send("host:sprintNext"));
      const parts = [];
      if (open) { const ring = el("div", "ring"); ring.id = "ring"; ring.appendChild(el("span")); parts.push(ring, el("p", "small", "")); parts[1].id = "ringmsg"; parts[1].style.textAlign = "center"; parts[1].style.margin = "0"; }
      parts.push(counts(), actions(main, true));
      side.append(panel(parts));
      if (!open && sp.names === "top5") side.append(leaders("Top 5 so far"));
    } else { // done
      stage.append(head, el("h2", "", "Speed Run complete!"));
      const sum = el("p", "lead"); sum.id = "sum"; stage.appendChild(sum);
      const ul = el("ul", "hist"); ul.id = "hist"; stage.appendChild(ul);
      if (sp.names === "top5") side.append(leaders("Top 5"));
      side.append(panel([actions(btn("Run another", "Clear these results and set up a new Speed Run.", () => send("host:sprintEnd")), false)]));
    }
    update();
  }
  const panel = (kids) => { const p = el("div", "panel"); kids.forEach((k) => p.appendChild(k)); return p; };
  function counts() {
    const box = el("div"); box.id = "counts"; box.style.display = "grid"; box.style.gap = "6px";
    return box;
  }
  function actions(main, withEnd) {
    const box = el("div", "actions"); main.setAttribute("data-primary", ""); box.appendChild(main);
    if (withEnd) box.appendChild(btn("End Speed Run", "Stop this Speed Run now. Students' devices go back to the game.", () => send("host:sprintEnd"), "btn ghost"));
    return box;
  }
  function leaders(title) {
    const p = el("div", "panel"), h = el("h2", "", title); h.style.fontSize = "22px"; h.style.margin = "0";
    const ol = el("ol", "leaders"); ol.id = "leaders";
    p.append(h, ol); return p;
  }
  function buildSetup(stage, side) {
    stage.append(kicker(["SPEED RUN"]), el("h2", "", "Speed Run: Thrust"),
      el("p", "lead", "A class math race about the flying car. You open each problem, students solve it on their own devices, then you show the worked answer and the mistakes the class made."),
      el("p", "lead", "Every number comes from the Flying Car Lab, so the math matches what the car really does. Wrong answers never cost points."));
    const form = el("div", "setup");
    form.append(
      select("n", "Problems", "How many problems in this Speed Run.", [[5, "5 problems"], [10, "10 problems"]], 5),
      select("timer", "Timer", "How long students get for each problem. With a timer, faster right answers score more. Off makes it about accuracy only.", [[0, "Off"], [30, "30 seconds"], [60, "60 seconds"], [90, "90 seconds"]], 60),
      select("tier", "Reading level", "Which level of problem the class gets: Cadet (grades 1 to 3) compares pictures, Recruit (4 to 8) uses g = 10, Operative (9 to 12) uses 9.81 and more steps.", [["cadet", "Cadet"], ["recruit", "Recruit"], ["operative", "Operative"]], (st.settings && st.settings.tier) || "recruit"),
      select("names", "Names on the board", "Top 5 shows the five highest scores by name after each answer. No names keeps every student's score on their own device.", [["top5", "Top 5 after each answer"], ["none", "No names"]], "top5"));
    stage.appendChild(form);
    const n = st.players.filter((p) => !p.out).length;
    const go = btn("Start Speed Run", "Tell every student's device a Speed Run is starting. You open the first problem next.", () => send("host:sprint", { set: "thrust", n: +$("n").value, timer: +$("timer").value, tier: $("tier").value, names: $("names").value }));
    side.append(panel([el("p", "lead", n ? `${plural(n, "student")} in this game.` : "No students have joined this game yet. They join from the board's code, then answer on their game page."), actions(go, false)]));
  }

  // ---------------- the parts that change while a phase is showing ----------------
  function update() {
    if (!sp || !ready) return;
    const cbox = $("counts");
    if (cbox && stats) {
      cbox.innerHTML = "";
      const row = (n, text, cls) => { const d = el("div", "count" + (cls ? " " + cls : "")); d.append(el("b", "", String(n)), el("span", "", text)); return d; };
      if (sp.phase === "ready") cbox.appendChild(row(stats.players, stats.players === 1 ? "student ready" : "students ready"));
      else { cbox.appendChild(row(stats.answered, `of ${stats.players} answered`)); cbox.appendChild(row(stats.right, "got it right", "good")); }
    }
    if (sp.phase === "revealed" && stats && stats.i === sp.i) {
      const chart = $("mchart"), r = sp.reveal; chart.innerHTML = "";
      const rows = r.mistakes.map((m, k) => ({ m, n: stats.mistakes[k] || 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
      const add = (n, value, why) => { const d = el("div", "mrow"), p = el("p"); d.appendChild(el("b", "", n)); if (value) p.appendChild(el("span", "v", value + "  ")); p.append(why); d.appendChild(p); chart.appendChild(d); };
      rows.forEach((x) => add(String(x.n), C.valueText(sp.problem, x.m.value), x.m.why));
      if (!rows.length && r.mistakes.length) add("!", C.valueText(sp.problem, r.mistakes[0].value), "Watch out for this one. " + r.mistakes[0].why);
      if (stats.other) add(String(stats.other), "", stats.other === 1 ? "student gave a different wrong answer." : "students gave a different wrong answer.");
    }
    const ol = $("leaders");
    if (ol && sp.top) {
      ol.innerHTML = "";
      sp.top.forEach((t) => { const li = el("li"); li.append(el("span", "who", t.builder), el("span", "pts", String(t.pts))); ol.appendChild(li); });
      if (!sp.top.length) ol.appendChild(el("p", "small", "No points yet."));
    }
    if (sp.phase === "done" && stats) {
      const tot = stats.history.reduce((a, h) => a + h.right, 0), ans = stats.history.reduce((a, h) => a + h.answered, 0);
      $("sum").textContent = ans ? `The class got ${tot} of ${ans} answers right.` : "Nobody answered this time.";
      const ul = $("hist"); ul.innerHTML = "";
      stats.history.forEach((h) => { const li = el("li"); li.append(el("span", "", `${h.i + 1}. ${C.KIND[h.kind] || h.kind}`), el("span", "n", `${h.right} of ${h.answered} right`)); ul.appendChild(li); });
    }
    const cv = $("pic"); if (cv && sp.problem && sp.problem.pic) C.draw(cv, sp.problem.pic);
    tick();
  }
  // the countdown ring
  function tick() {
    const ring = $("ring"); if (!ring || !sp || sp.phase !== "open") return;
    const span = ring.firstChild, msg = $("ringmsg");
    if (!sp.endAt) { ring.className = "ring off"; ring.style.setProperty("--p", 0); span.textContent = "no timer"; msg.textContent = ""; return; }
    const left = Math.max(0, (sp.endAt - clock()) / 1000);
    ring.className = "ring" + (left <= 0 ? " out" : ""); ring.style.setProperty("--p", left / sp.timer); span.textContent = String(Math.ceil(left));
    msg.textContent = left <= 0 ? "Time's up! Show the answer." : "seconds left";
  }
  setInterval(tick, 250);

  function render() {
    const k = !socket || !saved ? "none" : !ready || !st ? "wait" : !sp ? "setup" : `${sp.phase}:${sp.i}:${sp.problem ? sp.problem.id : ""}:${sp.names}`;
    if (k !== key) {
      const was = key; key = k; build();
      if (sp && was && was !== "wait") Sound.play(sp.phase === "open" ? "beep" : sp.phase === "revealed" ? "win" : sp.phase === "done" ? "fanfare" : "click");
      if (!RM) window.scrollTo({ top: 0 });
    } else update();
  }

  // ---------------- controls ----------------
  $("sound").onclick = () => { const on = Sound.toggle(); $("sound").textContent = "Sound: " + (on ? "on" : "off"); $("sound").setAttribute("aria-pressed", on); };
  addEventListener("keydown", (e) => { // presentation clickers: Space / → / PageDown press the main button
    if (!(e.key === " " || e.key === "ArrowRight" || e.key === "PageDown")) return;
    if (e.target.closest && e.target.closest("input, select, textarea, button, a")) return;
    const b = document.querySelector("[data-primary]"); if (b && !b.disabled) { e.preventDefault(); b.click(); }
  });
  addEventListener("resize", () => { const cv = $("pic"); if (cv && sp && sp.problem && sp.problem.pic) C.draw(cv, sp.problem.pic); });

  // ---------------- connection ----------------
  if (!socket || !saved) { $("status").textContent = "No game in this tab"; render(); }
  else {
    onConnect(() => socket.emit("host:resume", saved, (r) => {
      ready = !!(r && r.ok); $("status").textContent = ready ? "Connected" : "That game has ended";
      render();
    }));
    socket.on("disconnect", () => { ready = false; $("status").textContent = "Reconnecting..."; render(); });
    socket.on("room:state", (s) => {
      st = s; sp = s.sprint; if (sp) offset = sp.now - Date.now(); else stats = null;
      if (ready) $("status").textContent = "Connected";
      render();
    });
    socket.on("room:sprintStats", (d) => { stats = d; render(); });
  }
  window.__sr = { get sp() { return sp; }, get stats() { return stats; } };
})();
