/* Student device: name -> build robot -> join -> live status during the tournament: the fight itself (in step with the
   board), class chat (quick messages only), teacher announcements, and Race Day live for students who aren't driving. */
(function () {
  const E = window.Engine;
  const $ = (id) => document.getElementById(id);
  const socket = io(); window.baSocket = socket;
  const params = new URLSearchParams(location.search);
  const code = (params.get("code") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  let session = store.get("ba-session", null); // { code, playerId, token, builder }
  if (session && session.code !== code) session = null;
  let state = null, editing = false, lastStatusKey = "";
  let myPick = null; // { matchId, side }
  let myAnswer = null; // { id, choice } for the class poll on screen

  function show(id) { ["s-name", "s-build", "s-wait", "s-error"].forEach((s) => ($(s).hidden = s !== id)); window.scrollTo(0, 0); }
  function fail(title, text) { $("errtitle").textContent = title; $("errtext").textContent = text; show("s-error"); }

  if (!code) { location.href = "/"; return; }
  $("gamecode").textContent = code; $("code1").textContent = code; $("gamechip").hidden = false;

  E.loadArt("/art/manifest.json"); // an art pack, if the school installed one (public/art/)
  const builder = Builder.mount({
    bot: store.get("ba-bot", null) || undefined,
    onChange(bot, over) { store.set("ba-bot", bot); $("joinbtn").disabled = over; },
  });

  // --- step 1: name ---
  $("builder").value = (session && session.builder) || store.get("ba-builder", "");
  $("nameform").addEventListener("submit", (e) => {
    e.preventDefault();
    const n = $("builder").value.replace(/[^A-Za-z0-9 .'-]/g, "").trim();
    if (!n) { $("namemsg").textContent = "Type your first name."; return; }
    store.set("ba-builder", n); show("s-build");
  });

  // --- step 2: join / save changes ---
  $("joinbtn").onclick = () => {
    if (builder.overweight()) return;
    $("joinmsg").textContent = "";
    if (editing) {
      socket.emit("player:update", { bot: builder.bot }, (r) => {
        if (!r || !r.ok) { $("joinmsg").textContent = (r && r.error) || "Couldn't save. Try again."; return; }
        editing = false; show("s-wait"); render();
      });
      return;
    }
    join();
  };
  $("cancelEdit").onclick = () => { editing = false; show("s-wait"); };
  $("editbtn").onclick = () => {
    editing = true; $("joinbtn").textContent = "Save my robot"; $("cancelEdit").hidden = false; show("s-build");
  };

  function join(silent) {
    const payload = { code, builder: store.get("ba-builder", ""), bot: builder.bot };
    if (session) { payload.playerId = session.playerId; payload.token = session.token; }
    $("joinbtn").disabled = true;
    socket.emit("player:join", payload, (r) => {
      $("joinbtn").disabled = false;
      if (!r || !r.ok) {
        if (silent) { session = null; store.del("ba-session"); show(store.get("ba-builder", "") ? "s-build" : "s-name"); return; }
        $("joinmsg").textContent = (r && r.error) || "Couldn't join. Try again.";
        return;
      }
      session = { code, playerId: r.playerId, token: r.token, builder: payload.builder };
      store.set("ba-session", session);
      if (!r.rejoined) { builder.celebrate(); E.Sound.play("join"); }
      show("s-wait"); render();
    });
  }

  // --- live updates ---
  socket.on("connect", () => {
    $("gamechip").classList.remove("off");
    if (session) join(true); // reconnect after refresh or dropped wifi
  });
  socket.on("disconnect", () => $("gamechip").classList.add("off"));
  socket.on("room:state", (s) => {
    state = s; if (s.gp) gpOffset = s.gp.now - Date.now(); applyLimit(s.settings && s.settings.maxw);
    if (s.sprint) spOffset = s.sprint.now - Date.now();
    if (window.Tier && session) Tier.setClass(session.code, s.settings && s.settings.tier); // lessons and missions on this device follow it
    render();
  });
  // this game's weight class: the builder's limit and every "75 kg" on the page follow it
  let limitShown = 0;
  function applyLimit(kg) {
    if (!kg || kg === limitShown) return;
    limitShown = kg; builder.setLimit(kg);
    document.querySelectorAll(".limkg").forEach((el) => (el.textContent = kg));
    document.querySelectorAll("[data-tip75]").forEach((el) => el.setAttribute("data-tip", el.dataset.tip75.replace("{kg}", kg)));
    const w = E.WEIGHT_CLASSES.find((x) => x.kg === kg);
    $("classline").hidden = kg === E.MAXW;
    $("classline").textContent = w ? `This game is ${w.n}: every robot must be ${kg} kg or less.` : "";
  }
  socket.on("player:kicked", () => { store.del("ba-session"); session = null; fail("You were removed", "Your teacher removed your robot from this game. Ask them if you want to join again."); });
  let myWhy = null; // { matchId, side }
  function renderWhy() {
    const box = $("mywhy");
    const liveMine = state && state.currentMatchId && (() => { const m = findMatch(state.currentMatchId); return m && session && (m.a === session.playerId || m.b === session.playerId); })();
    if (!myWhy || liveMine) { box.hidden = true; return; }
    const s = myWhy.side;
    $("mywhy-h").textContent = s.won ? "Why you won" : s.headline;
    $("mywhy-r").innerHTML = "";
    s.reasons.forEach((r) => { const li = document.createElement("li"); li.textContent = r; $("mywhy-r").appendChild(li); });
    $("mywhy-t").innerHTML = "<b></b> <span></span>"; $("mywhy-t").firstChild.textContent = s.won ? "Next time:" : "Try this:"; $("mywhy-t").lastChild.textContent = s.tip;
    box.hidden = false;
  }
  socket.on("room:result", ({ winnerId, matchId, correct, why }) => {
    if (!session || !state) return;
    const m = findMatch(matchId);
    if (why && (why.aId === session.playerId || why.bId === session.playerId)) { myWhy = { matchId, side: why.aId === session.playerId ? why.a : why.b }; setTimeout(render, 50); }
    if (m && (m.a === session.playerId || m.b === session.playerId)) {
      flash(winnerId === session.playerId ? "YOU WON!" : "KNOCKED OUT", winnerId === session.playerId ? "var(--good)" : "var(--muted)");
      return;
    }
    if (myPick && myPick.matchId === matchId) {
      const right = (correct || []).includes(session.playerId);
      flash(right ? "CORRECT! +1" : "NOT THIS TIME", right ? "var(--gold)" : "var(--muted)");
      E.Sound.play(right ? "win" : "miss");
      myPick = null;
    }
  });

  function pick(side) {
    if (!state || !state.currentMatchId || !state.predict || !state.predict.open) return;
    const matchId = state.currentMatchId;
    socket.emit("player:predict", { matchId, side }, (r) => {
      if (r && r.ok) { myPick = { matchId, side }; E.Sound.play("click"); if (navigator.vibrate) try { navigator.vibrate(40); } catch {} }
      else if (r && r.error) $("pmsg").textContent = r.error;
      render();
    });
  }
  $("pick-a").onclick = () => pick("a");
  $("pick-b").onclick = () => pick("b");
  let predictSig = "";
  function renderPredict(me) {
    const m = state && state.currentMatchId ? findMatch(state.currentMatchId) : null;
    const box = $("predict");
    if (!m || !state.predict || !me || m.a === me.id || m.b === me.id) { box.hidden = true; predictSig = ""; return; }
    const pa = state.players.find((p) => p.id === m.a), pb = state.players.find((p) => p.id === m.b);
    if (!pa || !pb) { box.hidden = true; return; }
    box.hidden = false;
    if (predictSig !== m.id) {
      predictSig = m.id;
      [["pick-a", pa], ["pick-b", pb]].forEach(([id, p]) => {
        const el = $(id);
        E.portrait(el.querySelector("canvas"), p.bot, "rgba(0,0,0,0)", id === "pick-a" ? 1 : -1, 1.1);
        el.querySelector("b").textContent = p.bot.name; el.querySelector("span").textContent = "by " + p.builder;
      });
      if (myPick && myPick.matchId !== m.id) myPick = null;
      if (state.predict.open) { E.Sound.play("beep"); if (navigator.vibrate) try { navigator.vibrate(120); } catch {} }
    }
    $("phead").textContent = state.predict.bestOf === 3 ? "Who will win? (best of 3)" : "Who will win?";
    const side = myPick && myPick.matchId === m.id ? myPick.side : null;
    $("pick-a").classList.toggle("on", side === "a"); $("pick-b").classList.toggle("on", side === "b");
    $("pick-a").setAttribute("aria-pressed", side === "a"); $("pick-b").setAttribute("aria-pressed", side === "b");
    const open = state.predict.open;
    box.querySelector(".pickrow").classList.toggle("locked", !open);
    $("pick-a").disabled = !open; $("pick-b").disabled = !open;
    const nm = side ? (side === "a" ? pa : pb).bot.name : "";
    $("pmsg").textContent = open
      ? (side ? `You picked ${nm}. You can switch until time runs out.` : "Tap the robot you think will win.")
      : (side ? `Locked in: ${nm}. Watch the fight!` : "Predictions are closed. Watch the fight!");
  }

  // the teacher is presenting a lesson: show where they are, and its quiz questions as a poll
  let lessonSig = "";
  function renderLesson(me) {
    const L = state && state.lesson, box = $("lessonbox");
    if (!L || !me) { box.hidden = true; lessonSig = ""; return; }
    box.hidden = false;
    const q = L.quiz;
    $("lb-head").textContent = q ? `Class poll · Lesson ${L.num}` : `Lesson ${L.num}: ${L.n}`;
    if (!q) { $("lb-q").textContent = "Your teacher is presenting this lesson. Watch the board!"; $("lb-opts").innerHTML = ""; $("lb-msg").textContent = ""; lessonSig = "lesson"; return; }
    const sig = q.id + (q.revealed ? "r" : "");
    if (lessonSig !== sig) {
      if (!lessonSig.startsWith(q.id)) { E.Sound.play("beep"); if (navigator.vibrate) try { navigator.vibrate(120); } catch {} setTimeout(() => box.scrollIntoView({ behavior: E.RM ? "auto" : "smooth", block: "center" }), 50); }
      if (q.revealed && myAnswer && myAnswer.id === q.id) E.Sound.play(myAnswer.choice === q.answer ? "win" : "miss");
      lessonSig = sig;
      $("lb-q").textContent = q.q; $("lb-opts").innerHTML = "";
      q.options.forEach((o, i) => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = o;
        b.setAttribute("data-tip", "Tap your answer. You can change it until your teacher shows the answer.");
        b.onclick = () => socket.emit("player:answer", { id: q.id, choice: i }, (r) => {
          if (r && r.ok) { myAnswer = { id: q.id, choice: i }; E.Sound.play("click"); render(); } else if (r && r.error) $("lb-msg").textContent = r.error;
        });
        $("lb-opts").appendChild(b);
      });
    }
    const mine = myAnswer && myAnswer.id === q.id ? myAnswer.choice : null;
    [...$("lb-opts").children].forEach((b, i) => {
      b.disabled = q.revealed; b.setAttribute("aria-pressed", i === mine);
      b.classList.toggle("right", q.revealed && i === q.answer); b.classList.toggle("wrong", q.revealed && i === mine && i !== q.answer);
    });
    $("lb-msg").textContent = !q.revealed ? (mine == null ? "Tap your answer." : "Got it! You can change it until your teacher shows the answer.")
      : mine === q.answer ? `Correct! +1 quiz point (you have ${me.qpts}). ${q.explain}` : mine == null ? `The answer: ${q.options[q.answer]}. ${q.explain}` : `Not this time. ${q.explain}`;
  }

  // Speed Run: the teacher's class math race. The server sends each problem without its answer and checks every
  // answer itself; a wrong one locks the student out for 5 seconds. spMe is this student's standing on the problem.
  let spSig = "", spMe = null, spGained = 0, spOffset = 0; // spOffset: the server's clock minus this device's
  const spLeft = () => (spMe && spMe.lockUntil ? Math.max(0, Math.ceil((spMe.lockUntil - Date.now()) / 1000)) : 0);
  function spMine(r) { spMe = { tries: r.tries, right: !!(r.right || r.correct), left: r.left, total: r.total, lockUntil: r.lockout ? Date.now() + r.lockout : 0 }; }
  function spSend(value) {
    const S = state && state.sprint; if (!S || !S.problem || String(value).trim() === "") return;
    socket.emit("player:sprintAnswer", { id: S.problem.id, value }, (r) => {
      if (!r) return;
      if (r.ok) { spMine(r); spGained = r.gained || 0; E.Sound.play(r.correct ? "win" : "miss"); if (!r.correct) $("sp-val").value = ""; }
      else { if (r.lockout) spMe = { ...(spMe || {}), lockUntil: Date.now() + r.lockout }; $("sp-msg").textContent = r.error || "Try again."; }
      render();
    });
  }
  // the number pad, made once
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].forEach((k) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = k;
    b.setAttribute("data-tip", k === "⌫" ? "Delete the last digit." : k === "." ? "Add a decimal point." : `Type ${k}.`);
    b.onclick = () => { const v = $("sp-val"); v.value = k === "⌫" ? v.value.slice(0, -1) : (v.value + k).slice(0, 12); };
    $("sp-keys").appendChild(b);
  });
  $("sp-send").onclick = () => spSend($("sp-val").value);
  $("sp-val").addEventListener("keydown", (e) => { if (e.key === "Enter") spSend($("sp-val").value); });
  setInterval(() => { const S = state && state.sprint; if (S && S.phase === "open") renderSprint(state.players.find((p) => session && p.id === session.playerId)); }, 500);
  function renderSprint(me) {
    const S = state && state.sprint, box = $("sprintbox");
    if (!S || !me) { box.hidden = true; spSig = ""; return; }
    box.hidden = false;
    const p = S.problem, C = window.SprintCard;
    $("sp-head").textContent = S.phase === "ready" ? `Speed Run: ${S.name}` : S.phase === "done" ? `Speed Run: ${S.name} is over` : `Speed Run · Problem ${S.i + 1} of ${S.n}`;
    $("sp-pts").textContent = spMe && spMe.total ? `Your Speed Run points: ${spMe.total}` : "";
    if (!p) {
      $("sp-q").textContent = S.phase === "ready" ? "Get ready! Your teacher is about to show the first problem." : "That's the end! Look at the board to see how the class did.";
      ["sp-pic", "sp-pad", "sp-steps"].forEach((id) => ($(id).hidden = true)); $("sp-opts").innerHTML = ""; $("sp-msg").textContent = "";
      spSig = S.phase; return;
    }
    const sig = p.id + S.phase;
    if (spSig !== sig) {
      if (!spSig.startsWith(p.id)) { // a new problem: start fresh, and ask the server where this student stands (after a refresh)
        spMe = null; spGained = 0; $("sp-val").value = "";
        socket.emit("player:sprintMe", {}, (r) => { if (r && r.ok && r.id === p.id) { spMine(r); render(); } });
        E.Sound.play("beep"); if (navigator.vibrate) try { navigator.vibrate(120); } catch {}
        setTimeout(() => box.scrollIntoView({ behavior: E.RM ? "auto" : "smooth", block: "center" }), 50);
      }
      spSig = sig;
      $("sp-q").textContent = p.text;
      $("sp-pic").hidden = !p.pic; if (p.pic) requestAnimationFrame(() => C.draw($("sp-pic"), p.pic));
      $("sp-opts").innerHTML = "";
      if (p.input.kind === "choice") p.input.options.forEach((o) => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = o.label; b.dataset.v = String(o.value);
        b.setAttribute("data-tip", "Tap your answer.");
        b.onclick = () => spSend(o.value);
        $("sp-opts").appendChild(b);
      });
      $("sp-pad").hidden = p.input.kind === "choice";
      $("sp-unit").textContent = p.input.unit || "";
    }
    const revealed = S.phase === "revealed", lock = spLeft(), now = Date.now() + spOffset, timeUp = !!S.endAt && now > S.endAt;
    const done = revealed || (spMe && (spMe.right || spMe.left === 0)) || timeUp;
    $("sp-send").disabled = done || lock > 0;
    [...$("sp-opts").children].forEach((b) => { b.disabled = done || lock > 0; b.classList.toggle("right", revealed && b.dataset.v === String(S.reveal.answer.value)); });
    $("sp-steps").hidden = !revealed; $("sp-steps").innerHTML = "";
    if (revealed) S.reveal.steps.forEach((s) => { const li = document.createElement("li"); li.textContent = s; $("sp-steps").appendChild(li); });
    const left = S.endAt ? Math.max(0, Math.ceil((S.endAt - now) / 1000)) : null;
    $("sp-msg").textContent = revealed ? (spMe && spMe.right ? "You got it! " : "") + `The answer: ${C.answerText(p, S.reveal.answer)}.`
      : spMe && spMe.right ? `Right! +${spGained} points. Watch the board.`
      : spMe && spMe.left === 0 ? "No tries left on this one. Watch the board for the answer."
      : timeUp ? "Time's up! Watch the board."
      : lock > 0 ? `Not quite. Try again in ${lock} s (${spMe.left} ${spMe.left === 1 ? "try" : "tries"} left).`
      : (p.input.kind === "choice" ? "Tap your answer." : "Type your answer and press Send.") + (left != null ? ` ${left} s left.` : "");
  }

  // the class's story mission (PF-3): one card that follows Mission Control on the board. In class, steps the class moved
  // past (the briefing, the lesson) count for this student, and everyone present gets the reward; Build and Mission count
  // from the student's own runs. All of it stays in cr-record on this device.
  const NOW_STEPS = ["briefing", "discover", "build", "mission", "reward"];
  const nowFiles = {};
  const getJSON = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(u))));
  function nowLoad(id) { // the mission, its episode, its missions' titles and the rewards, loaded once per mission
    if (nowFiles[id]) return nowFiles[id];
    nowFiles[id] = { loading: true };
    getJSON("/data/episodes/index.json").then((idx) => Promise.all(idx.map((e) => getJSON(`/data/episodes/${e}.json`)))).then((eps) => {
      let m = null; for (const e of eps) m = m || e.missions.find((x) => x.id === id);
      if (!m) throw new Error(id);
      const mids = [...m.build.missions, ...(m.mission.mission ? [m.mission.mission] : [])];
      return Promise.all([Promise.all(mids.map((x) => getJSON(`/data/missions/${x}.json`))), getJSON("/data/rewards.json")])
        .then(([ms, rewards]) => { nowFiles[id] = { m, files: Object.fromEntries(ms.map((x) => [x.id, x])), rewards }; render(); });
    }).catch(() => { nowFiles[id] = { failed: true }; });
    return nowFiles[id];
  }
  function nowRecord(now, m) {
    let rec = null; try { rec = JSON.parse(localStorage.getItem("cr-record")); } catch {}
    if (!rec || !rec.missions) rec = { v: 1, missions: {}, rewards: {}, last: null };
    const r = (rec.missions[now.mission] = rec.missions[now.mission] || {}), k = NOW_STEPS.indexOf(now.step), t = Date.now();
    let changed = false;
    for (const s of ["briefing", "discover"].concat(m.mission.event ? ["mission"] : [])) if (NOW_STEPS.indexOf(s) < k && !r[s]) { r[s] = t; changed = true; }
    if (now.step === "reward" && !r.done) { r.reward = r.reward || t; r.done = t; for (const id of m.rewards || []) rec.rewards[id] = rec.rewards[id] || t; changed = true; }
    if (changed || rec.last !== now.mission) { rec.last = now.mission; try { localStorage.setItem("cr-record", JSON.stringify(rec)); } catch {} }
  }
  const NOW_PAGE = { lab: (mid, run) => `/lab?mission=${mid}&run=${run}`, racer: (mid, run) => `/race?mission=${mid}&run=${run}`, challenge: (mid, run) => `/practice?mission=${mid}&run=${run}#challenges` };
  function renderNow(me) {
    const now = state && state.now, box = $("nowbox");
    const T = (v) => (window.Tier ? Tier.text(v, Tier.current()) : v && typeof v === "object" ? v.recruit : v);
    if (!now || !me) { box.hidden = true; return; }
    const d = nowLoad(now.mission);
    if (!d.m) { box.hidden = true; return; }
    box.hidden = false;
    nowRecord(now, d.m);
    const k = NOW_STEPS.indexOf(now.step), m = d.m;
    $("now-head").textContent = `Story mission · Step ${k + 1} of 5`;
    $("now-title").textContent = T(m.title);
    const links = $("now-links"); links.innerHTML = "";
    const goal = (mid) => { try { return !!((JSON.parse(localStorage.getItem("cr-missions")) || {})[mid] || {}).goal; } catch { return false; } };
    const link = (mid) => {
      const f = d.files[mid], a = document.createElement("a"), done = goal(mid), sp = document.createElement("span");
      a.href = NOW_PAGE[f.game](mid, now.mission); a.className = done ? "done" : ""; a.setAttribute("data-tip", `Open ${T(f.title)}. Predict first, then test your design.`);
      a.textContent = T(f.title); sp.textContent = done ? "✓ goal reached" : "open"; a.appendChild(sp); links.appendChild(a);
    };
    if (now.step === "briefing") $("now-msg").textContent = "Watch the board: the briefing.";
    else if (now.step === "discover") $("now-msg").textContent = "Your teacher is presenting the lesson. Its questions pop up here.";
    else if (now.step === "build") { $("now-msg").textContent = `Practice in the Lab. Reach the goal in ${m.build.need || 1} of these:`; m.build.missions.forEach(link); }
    else if (now.step === "mission") {
      if (m.mission.event) $("now-msg").textContent = "Class challenge! Follow your teacher on the board.";
      else { const f = d.files[m.mission.mission]; $("now-msg").textContent = T((f.tiers[window.Tier ? Tier.current() : "recruit"] || {}).brief || f.tiers.recruit.brief); link(m.mission.mission); }
    } else {
      const got = (m.rewards || []).map((id) => d.rewards.find((r) => r.id === id)).filter(Boolean).map((r) => ({ echo: "New Echo", volt: "New Volt part", file: "New Lazarus file", access: "New place" }[r.kind] + ": " + T(r.title)));
      $("now-msg").textContent = "Mission complete! " + (got.length ? got.join(" · ") + "." : "");
    }
  }

  // the teacher started a Flying Car Lab challenge
  function renderLab(me) {
    const L = state && state.lab;
    $("labbox").hidden = !L || !me;
    if (!L || !me) return;
    const mine = L.ids.includes(me.id);
    $("lab-n").textContent = `Mission ${L.m + 1}: ${L.n}`;
    $("lab-msg").textContent = !L.open ? (mine ? "Your car is in! Submissions are closed. Watch the board." : "Submissions are closed. Watch the board!") : mine ? "Your car is in! You can still improve it and submit again." : "Build a car for this mission and submit it to the board.";
    $("lab-go").hidden = !L.open;
  }

  // the teacher started Race Day (a Robot Racer Grand Prix)
  function renderGp(me) {
    const G = state && state.gp;
    $("gpbox").hidden = !G || !me;
    if (!G || !me) return;
    const mine = G.standings.findIndex((s) => s.id === me.id);
    $("gp-n").textContent = G.phase === "done" ? "Final results are on the board!" : `Race ${G.i + 1} of ${G.n}`;
    $("gp-msg").textContent = { garage: "The garage is open. Open Robot Racer and pick your gear and tires.", countdown: "The race is starting! Open Robot Racer.", racing: "The race is on! Open Robot Racer to drive.", results: "Results are on the board. Next race soon.", done: "Thanks for racing!" }[G.phase] + (mine >= 0 ? ` You're #${mine + 1} with ${G.standings[mine].pts} points.` : "");
    $("gp-go").hidden = G.phase === "done";
    const live = G.phase === "countdown" || G.phase === "racing"; // the race, live, right here
    $("gp-watch").hidden = !live; $("gp-top").hidden = !live;
  }

  function findMatch(id) {
    if (!state || !state.bracket) return null;
    for (const r of state.bracket.rounds) for (const m of r.matches) if (m.id === id) return m;
    return null;
  }
  function flash(text, color) {
    $("flashtext").textContent = text; $("flashtext").style.color = color; $("flash").hidden = false;
    setTimeout(() => ($("flash").hidden = true), 2600);
  }
  $("flash").onclick = () => ($("flash").hidden = true);

  // reactions: anonymous emoji that float up on the board
  let rxCool = 0;
  E.REACTIONS.forEach((emo, i) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = emo;
    b.setAttribute("aria-label", "Send " + emo); b.setAttribute("data-tip", "Send " + emo + " to the board");
    b.onclick = () => {
      if (Date.now() < rxCool) return;
      rxCool = Date.now() + 1200; $("rbtns").classList.add("cool"); setTimeout(() => $("rbtns").classList.remove("cool"), 1200);
      socket.emit("player:react", { e: i });
      const r = b.getBoundingClientRect(), f = document.createElement("span"); f.className = "rxfly"; f.textContent = emo;
      f.style.left = r.left + r.width / 2 - 15 + "px"; f.style.top = r.top - 10 + "px"; document.body.appendChild(f); setTimeout(() => f.remove(), 1000);
    };
    $("rbtns").appendChild(b);
  });

  // ---------------- the fight on this screen ----------------
  // Once predictions close, the board sends the fight it's playing (its seed), and this screen replays the same fight in
  // step with it: the same events, so the same winner. Speed and Skip follow the board.
  const watch = { on: store.get("ba-watch", true), cur: null };
  $("watchon").checked = watch.on;
  $("watchon").onchange = () => { watch.on = $("watchon").checked; store.set("ba-watch", watch.on); if (!watch.on) watch.cur = null; render(); };
  const wStage = new BattleStage($("w-arena"), {
    onHP(hp) { $("w-ba").style.width = hp[0] + "%"; $("w-bb").style.width = hp[1] + "%"; $("w-ha").textContent = Math.round(hp[0]); $("w-hb").textContent = Math.round(hp[1]); },
    onLog(e, bot) { $("w-log").textContent = bot.name + e.txt; },
  });
  socket.on("room:watch", (w) => {
    if (!watch.on || !session) return;
    watch.cur = w; render(); // the stage only moves while it's on screen, so show it first
    $("w-title").textContent = `${w.round}${w.bestOf === 3 ? ` · game ${w.g + 1}` : ""}: ${w.a.name} vs ${w.b.name}`;
    $("w-na").textContent = w.a.name; $("w-nb").textContent = w.b.name; $("w-log").textContent = "";
    wStage.speed = w.speed; wStage.setBots(w.a, w.b, w.round.toUpperCase());
    wStage.play(E.simulate(w.a, w.b, w.seed).events);
  });
  socket.on("room:watchCtl", (c) => { if (!watch.cur) return; if (c.speed) wStage.speed = c.speed; if (c.skip) wStage.skip(); });
  function renderWatch(me) {
    const fights = !!(state && state.live && state.live.fights);
    $("watchpref").hidden = !me || !fights || state.phase !== "tournament";
    const on = !!(watch.on && fights && watch.cur && state.currentMatchId === watch.cur.matchId);
    if (!on && watch.cur && state && state.currentMatchId !== watch.cur.matchId) watch.cur = null; // that match is over
    $("watchbox").hidden = !on;
  }

  // ---------------- class chat: quick messages only (Engine.QUICK), nothing typed ----------------
  let feed = [], chatUntil = 0, quickSig = "";
  socket.on("room:chatlog", (log) => { feed = (log || []).slice(-30); renderFeed(); });
  socket.on("room:chat", (m) => { feed.push(m); if (feed.length > 30) feed.shift(); renderFeed(); });
  socket.on("room:chatClear", () => { feed = []; renderFeed(); });
  function renderFeed() {
    const ol = $("feed"); ol.innerHTML = "";
    if (!feed.length) { const li = document.createElement("li"); li.className = "small"; li.textContent = "No messages yet. Tap one below to say something to the class."; ol.appendChild(li); }
    feed.slice(-12).forEach((m) => {
      const li = document.createElement("li"), b = document.createElement("b");
      if (session && m.pid === session.playerId) li.className = "me";
      b.textContent = m.name; li.append(b, document.createTextNode(m.text)); ol.appendChild(li);
    });
    ol.scrollTop = ol.scrollHeight;
  }
  function sendChat(q) {
    if (Date.now() < chatUntil) return;
    socket.emit("player:chat", { q }, (r) => {
      if (r && r.ok) { const wait = state && state.live && state.live.slow ? 10000 : 3000; chatUntil = Date.now() + wait; E.Sound.play("click"); render(); setTimeout(render, wait + 50); }
      else if (r && r.error) $("chatmsg").textContent = r.error;
    });
  }
  function renderChat(me) {
    const L = state && state.live;
    $("chatbox").hidden = !me || !L || !L.chat;
    if ($("chatbox").hidden) return;
    const m = state.currentMatchId ? findMatch(state.currentMatchId) : null;
    const pa = m && state.players.find((p) => p.id === m.a), pb = m && state.players.find((p) => p.id === m.b);
    const sig = pa && pb ? pa.bot.name + "|" + pb.bot.name : "";
    if (sig !== quickSig || !$("quick").children.length) { // cheering buttons name the robots fighting now
      quickSig = sig; $("quick").innerHTML = "";
      E.QUICK.forEach((t, i) => {
        const side = t.includes("{a}") ? "a" : t.includes("{b}") ? "b" : "";
        if (side && !sig) return;
        const b = document.createElement("button"); b.type = "button"; if (side) b.className = side;
        b.textContent = t.replace("{a}", pa ? pa.bot.name : "").replace("{b}", pb ? pb.bot.name : "");
        b.setAttribute("data-tip", "Send this to the class chat. Everyone sees it with your name.");
        b.onclick = () => sendChat(i);
        $("quick").appendChild(b);
      });
    }
    const muted = L.muted.includes(me.id), waiting = Date.now() < chatUntil;
    [...$("quick").children].forEach((b) => (b.disabled = muted || waiting));
    $("chatmsg").textContent = muted ? "Your teacher turned off chat for you." : L.slow ? "Slow mode: one message every 10 seconds." : "";
  }

  // ---------------- a message from the teacher (shown for 10 minutes) ----------------
  let annT = 0;
  function renderAnnounce(me) {
    const A = state && state.announce, on = !!(me && A && Date.now() - A.t < 10 * 60e3);
    $("announce").hidden = !on;
    if (!on) return;
    $("announce-t").textContent = A.text;
    if (A.t !== annT) { annT = A.t; E.Sound.play("beep"); if (navigator.vibrate) try { navigator.vibrate(120); } catch {} }
  }

  // ---------------- Race Day live, for students who aren't driving ----------------
  let gpLive = { prev: null, cur: null }, gpOffset = 0;
  socket.on("gp:live", (snap) => { gpLive = { prev: gpLive.cur, cur: { ...snap, at: performance.now() } }; renderGpTop(); });
  function raceCars(now) { // a fifth of a second behind live, so cars move smoothly between updates
    const { prev, cur } = gpLive, G = state && state.gp; if (!cur || !G) return [];
    const f = prev ? E.clamp((now - 200 - prev.at) / Math.max(1, cur.at - prev.at), 0, 1) : 1, old = new Map(prev ? prev.cars.map((c) => [c[0], c]) : []), rs = new Map(G.racers.map((r) => [r.id, r]));
    return cur.cars.filter((c) => rs.has(c[0])).map((c) => {
      const p = old.get(c[0]) || c, r = rs.get(c[0]);
      return { id: c[0], z: p[1] + (c[1] - p[1]) * f, x: p[2] + (c[2] - p[2]) * f, v: c[3], done: !!c[4], name: r.builder, look: r.look, color: r.look ? RaceDraw.LOOKS.PAINT[r.look.c1] : r.color };
    }).sort((a, b) => (b.done - a.done) || b.z - a.z);
  }
  function renderGpTop() {
    const ol = $("gp-top"); if (ol.hidden) return;
    ol.innerHTML = "";
    raceCars(performance.now()).slice(0, 5).forEach((c) => { const li = document.createElement("li"), a = document.createElement("span"), b = document.createElement("span"); a.textContent = c.name; b.textContent = c.done ? "finished" : Math.round(c.v * 3.6) + " km/h"; li.append(a, b); ol.appendChild(li); });
  }
  function drawRace(t, now) {
    const c = $("gp-watch"), G = state && state.gp; if (!c.offsetParent || !G) return;
    const { ctx, w, h } = E.fit(c), T = Race.TRACKS[G.track], list = raceCars(now), lead = list.find((q) => !q.done) || list[0];
    const rem = G.startAt ? (G.startAt - (Date.now() + gpOffset)) / 1000 : 9, lights = G.phase === "countdown" ? (rem > 3 ? 0 : Math.min(5, Math.floor((3 - rem) / 0.6) + 1)) : 0;
    const cam = lead || { z: 0, x: 0 }, pos = RaceDraw.world(ctx, w, h, T, cam, list.filter((q) => q !== lead), { t, lights, low: true });
    if (lead) RaceDraw.kart(ctx, pos.x, pos.y, pos.size, { color: lead.color, look: lead.look, t, v: lead.v });
    if (lead) E.bigText(ctx, lead.name, w * 0.22, h * 0.9, h * 0.075, lead.color); // the leader, clear of the name tags up the road
    else E.bigText(ctx, G.phase === "countdown" ? "GET READY" : "WAITING FOR RACERS", w / 2, h * 0.14, h * 0.09, "#ffd23f");
  }

  function statusFor() {
    if (!state || !session) return { cls: "", text: "Connecting...", sub: "" };
    const me = state.players.find((p) => p.id === session.playerId);
    const name = (id) => { const p = state.players.find((x) => x.id === id); return p ? `${p.bot.name} (${p.builder})` : "?"; };
    if (!me) return { cls: "out", text: "Not in this game", sub: "" };
    if (state.phase === "lobby" && me.over) return { cls: "out", text: "Too heavy!", sub: `This game's limit is ${state.settings.maxw} kg. Tap Change my robot and swap a part.` };
    if (state.phase === "lobby") return { cls: "", text: "You're in!", sub: "Watch the board. Your teacher will start the tournament soon. You can still change your robot." };
    if (state.phase === "done") {
      if (state.championId === me.id) return { cls: "champ", text: "CHAMPION!", sub: "Your robot won the whole tournament!" };
      return { cls: "out", text: "Tournament over", sub: "Champion: " + name(state.championId) };
    }
    const rounds = state.bracket.rounds;
    for (let r = 0; r < rounds.length; r++) for (const m of rounds[r].matches) {
      const mine = m.a === me.id || m.b === me.id;
      if (!mine) continue;
      if (m.id === state.currentMatchId) return { cls: "live", text: "YOUR MATCH IS ON THE BOARD!", sub: `${rounds[r].name}: vs ${name(m.a === me.id ? m.b : m.a)}` };
      if (m.winner && m.winner !== me.id) return { cls: "out", text: "Knocked out", sub: `${name(m.winner)} beat you in the ${rounds[r].name.toLowerCase()}. Cheer for your classmates!` };
    }
    for (let r = 0; r < rounds.length; r++) for (const m of rounds[r].matches) {
      if ((m.a === me.id || m.b === me.id) && !m.winner) {
        const opp = m.a === me.id ? m.b : m.a;
        return { cls: "win", text: opp ? `Up next: ${rounds[r].name}` : `Still in! ${rounds[r].name} next`, sub: opp ? `You'll face ${name(opp)}.` : "Waiting to find out who you'll face." };
      }
    }
    return { cls: "win", text: "Still in!", sub: "Watch the board." };
  }
  function render() {
    if ($("s-wait").hidden) return;
    const st = statusFor();
    $("status").className = "status " + st.cls; $("status").textContent = st.text; $("substatus").textContent = st.sub;
    $("editbtn").hidden = !state || state.phase !== "lobby";
    const me = state && session ? state.players.find((p) => p.id === session.playerId) : null;
    renderPredict(me);
    renderNow(me);
    renderSprint(me);
    renderLesson(me);
    renderLab(me);
    renderGp(me);
    renderWatch(me);
    renderChat(me);
    renderAnnounce(me);
    if (state && state.phase === "lobby") myWhy = null;
    renderWhy();
    $("ptsline").hidden = !me || !state || state.phase === "lobby";
    $("reacts").hidden = !me || !state || state.phase === "lobby" || !state.reactions;
    if (me) $("mypts").textContent = me.pts || 0;
    const mine = state && state.phase === "done" && me ? (state.awards || []).filter((a) => a.playerId === me.id) : [];
    $("myawards").hidden = !mine.length;
    $("myawards").innerHTML = "";
    mine.forEach((a) => { const d = document.createElement("div"); d.innerHTML = "<b></b><span></span>"; d.firstChild.textContent = "Award: " + a.title; d.lastChild.textContent = a.detail; $("myawards").appendChild(d); });
    $("count").textContent = state ? `${state.players.length} robot${state.players.length === 1 ? "" : "s"} in this game` : "";
    const key = st.text;
    if (key !== lastStatusKey && st.cls === "live") { E.Sound.play("go"); if (navigator.vibrate) try { navigator.vibrate(200); } catch {} }
    lastStatusKey = key;
  }

  // my-bot animation on the waiting screen
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
    const c = $("mybot");
    if (c.offsetParent) {
      const { ctx, w, h } = E.fit(c);
      const g = ctx.createRadialGradient(w / 2, h * 0.5, 10, w / 2, h * 0.5, w * 0.7); g.addColorStop(0, "#34323c"); g.addColorStop(1, "#1b1a1e");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#2b2a30"; ctx.fillRect(0, h * 0.85, w, h * 0.15);
      const live = lastStatusKey === "YOUR MATCH IS ON THE BOARD!";
      const s = Math.min(w / 4.2, h / 3.2), ph = t % (live ? 1.2 : 3.2), lunge = ph < 0.55 ? ph / 0.55 : 0;
      E.drawBot(ctx, builder.bot, w / 2 - s * 0.25, h * 0.85, s, 1, t, { lunge });
    }
    try { drawRace(t, now); } catch (err) { console.error(err); }
    requestAnimationFrame(loop);
  })(last);

  show(session ? "s-wait" : "s-name");
  socket.emit("room:check", { code }, (r) => { if (r.ok) applyLimit(r.maxw); else if (!session) fail("Can't find that game", r.error); });
})();
