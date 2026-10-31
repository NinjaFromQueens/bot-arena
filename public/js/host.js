/* Teacher's board: create a game, show join code + QR, run the bracket, predictions and battles. */
(function () {
  const E = window.Engine, M = window.Music;
  const $ = (id) => document.getElementById(id);
  const socket = io(); window.baSocket = socket;
  let state = null, code = null, playing = null, autoTimer = null, upnext = null;
  let series = null; // the match on the board: { m, g (game index), score, last (winner of the game just played) }
  let replay = null; // a finished match being watched again: { a, b, seeds, g, round, why }
  const seen = new Set();
  let status = {}; // playerId -> { page, n } from the server: which page each student is on

  const ss = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); } catch {} },
  };
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  // prediction time is set in the lobby or during the tournament; both selects stay in sync
  ["ptime", "ptime2"].forEach((id, _, ids) => {
    $(id).value = String(ls.get("ba-ptime", 12));
    $(id).onchange = () => { ls.set("ba-ptime", +$(id).value); ids.forEach((o) => ($(o).value = $(id).value)); };
  });
  E.WEIGHT_CLASSES.forEach((w) => { const o = document.createElement("option"); o.value = w.kg; o.textContent = `${w.n} (${w.kg} kg)`; $("wclass").appendChild(o); });
  $("wclass").onchange = () => socket.emit("host:settings", { maxw: +$("wclass").value }, (r) => { if (r && !r.ok && r.error) $("hostmsg").textContent = r.error; });
  $("bo3").onchange = () => socket.emit("host:settings", { bo3: +$("bo3").value });

  // ---------- battle stage ----------
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
      M.play(e.kind === "win" ? null : "fight"); // music cuts at the KO so the win sound lands
      const d = document.createElement("div"), labels = { sense: "SENSE", think: "THINK", act: "ACT", win: "WINNER", stall: "STUCK" };
      d.innerHTML = `<span class="chip c-${e.kind === "stall" ? "act" : e.kind}">${labels[e.kind]}</span><span><span class="${e.me === 0 ? "a" : "b"}"></span><span></span></span>`;
      const p = d.lastElementChild.children; p[0].textContent = bot.name; p[1].textContent = e.txt;
      $("log").appendChild(d); $("log").scrollTop = $("log").scrollHeight;
    },
    onDone() {
      if (replay) { // a replay never reports to the server
        showWhy(replay.why, replay.a, replay.b); $("skip").disabled = true; replay.g++;
        if (replay.g < replay.seeds.length) { setTimeout(() => replay && replayGame(), 2500); return; }
        replay = null; $("next").disabled = false; M.play("garage"); if (state) render(); // render brings back the champion screen when the tournament is over
        return;
      }
      if (!playing) return;
      const id = playing.id;
      if (playing.why) showWhy(playing.why, playing.A, playing.B);
      playing = null;
      $("skip").disabled = true;
      if (series) {
        series.score[series.last]++; series.g++;
        if (series.g < series.m.seeds.length) { // best of 3, and nobody has 2 wins yet
          showScore(); M.play("garage");
          $("next").disabled = false; $("next").textContent = `Play game ${series.g + 1}`;
          if ($("auto").checked) autoTimer = setTimeout(nextMatch, 6000);
          return;
        }
        series = null;
      }
      socket.emit("host:matchDone", { matchId: id }, (r) => {
        if (r && r.done) return; // champion screen comes from state
        M.play("garage");
        $("next").disabled = false; $("next").textContent = "Next match";
        if ($("auto").checked) autoTimer = setTimeout(nextMatch, 7000); // time to read "why"
      });
    },
  });

  // an art pack (public/art/) swaps parts for pictures; redraw the lobby portraits once they've loaded
  E.loadArt("/art/manifest.json").then((p) => { if (!p) return; document.querySelectorAll(".pcard").forEach((el) => (el.dataset.sig = "")); if (state) render(); });

  // ---------- connection ----------
  function create() {
    socket.emit("host:create", {}, (r) => {
      if (!r.ok) { $("hostmsg").textContent = r.error; return; }
      code = r.code; ss.set("ba-host", { code: r.code, hostKey: r.hostKey }); setupJoin();
    });
  }
  socket.on("connect", () => {
    const saved = ss.get("ba-host");
    if (saved) socket.emit("host:resume", saved, (r) => { if (r.ok) { code = r.code; setupJoin(); } else { ss.del("ba-host"); create(); } });
    else if (!code) create();
  });
  socket.on("disconnect", () => { $("hostmsg").textContent = "Reconnecting to the server..."; });
  socket.on("room:state", (s) => {
    $("hostmsg").textContent = ""; state = s; $("rxon").checked = s.reactions;
    if (s.settings) { $("wclass").value = String(s.settings.maxw); $("bo3").value = String(s.settings.bo3); }
    render();
  });
  socket.on("room:status", (s) => { status = s || {}; if (state) render(); });
  socket.on("room:react", ({ e }) => {
    const layer = $("rxlayer"), emo = E.REACTIONS[e];
    if (!emo || layer.childElementCount > 24) return; // a full screen of emoji is enough
    const s = document.createElement("span"); s.className = "rx"; s.textContent = emo;
    s.style.left = 4 + Math.random() * 88 + "%"; layer.appendChild(s); setTimeout(() => s.remove(), 2600);
  });

  function setupJoin() {
    const url = location.origin;
    $("joinurl").textContent = url.replace(/^https?:\/\//, "");
    $("bigcode").textContent = code;
    try {
      const qr = qrcode(0, "M"); qr.addData(`${url}/play?code=${code}`); qr.make();
      $("qr").innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    } catch { $("qr").hidden = true; }
  }

  // ---------- render ----------
  const byId = (id) => state && state.players.find((p) => p.id === id);
  function render() {
    if (!state) return;
    $("v-lobby").hidden = state.phase !== "lobby";
    $("v-tour").hidden = state.phase === "lobby";
    renderRace();
    if (state.phase === "lobby") renderLobby();
    else { renderTour(); renderLeaders(); renderVotes(); renderAwards(); renderClass(); }
  }

  function renderLobby() {
    M.play("garage");
    const n = state.players.length;
    $("pcount").textContent = n; $("start").disabled = n < 2; $("emptymsg").hidden = n > 0;
    const grid = $("players"), have = new Map([...grid.children].map((el) => [el.dataset.id, el]));
    state.players.forEach((p) => {
      let el = have.get(p.id);
      const sig = JSON.stringify(p.bot) + p.builder;
      if (!el) {
        el = document.createElement("div"); el.className = "pcard"; el.dataset.id = p.id;
        el.innerHTML = `<button class="kick" type="button" aria-label="Remove" data-tip="Remove this robot. Click twice to confirm.">×</button><canvas width="240" height="240"></canvas><div class="bn"></div><div class="bl"></div><span class="stag"></span><span class="otag" hidden>TOO HEAVY</span>`;
        const k = el.querySelector(".kick");
        k.onclick = () => {
          if (!k.classList.contains("confirm")) { k.classList.add("confirm"); k.textContent = "Remove?"; setTimeout(() => { k.classList.remove("confirm"); k.textContent = "×"; }, 3000); return; }
          socket.emit("host:kick", { playerId: p.id });
        };
        grid.appendChild(el);
        if (!seen.has(p.id)) { seen.add(p.id); E.Sound.play("join"); }
      }
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        E.portrait(el.querySelector("canvas"), p.bot, "#26252b");
        el.querySelector(".bn").textContent = p.bot.name; el.querySelector(".bn").style.color = E.COLORS[p.bot.color];
        el.querySelector(".bl").textContent = "by " + p.builder;
      }
      el.classList.toggle("off", !p.connected);
      el.classList.toggle("heavy", !!p.over); el.querySelector(".otag").hidden = !p.over;
      el.querySelector(".otag").setAttribute("data-tip", `Over the ${state.settings.maxw} kg limit. The student needs to swap a part before you can start.`);
      const tag = statusTag(p), st = el.querySelector(".stag"); st.textContent = tag.text; st.className = "stag " + tag.cls; st.setAttribute("data-tip", tag.tip);
      have.delete(p.id);
    });
    have.forEach((el) => el.remove());
  }

  // the fastest Robot Racer lap on each track from this game (checked by the server)
  function renderRace() {
    const list = (state.race || []).filter((r, i, all) => all.findIndex((q) => q.track === r.track) === i), fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
    ["racep", "racep2"].forEach((id) => {
      const box = $(id); box.hidden = !list.length; if (!list.length) return;
      const ol = box.querySelector("ol"); ol.innerHTML = "";
      list.forEach((r) => { const li = document.createElement("li"); li.innerHTML = '<span class="who"></span><span class="pts"></span>'; li.firstChild.textContent = `${r.n}: ${r.builder}`; li.lastChild.textContent = fmt(r.time); ol.appendChild(li); });
    });
  }

  function renderTour() {
    const br = state.bracket; if (!br) return;
    const wrap = $("bracket"); wrap.innerHTML = "";
    let remaining = 0;
    br.rounds.forEach((round, r) => {
      const col = document.createElement("div"); col.className = "round";
      col.innerHTML = `<h3></h3>`; col.firstChild.textContent = round.name;
      round.matches.forEach((m) => {
        if (r === 0 && m.bye) return;
        if (!m.winner && m.a && m.b) remaining++;
        const box = document.createElement("div"); box.className = "bm" + (m.id === state.currentMatchId ? " cur" : "");
        if (m.winner && m.seeds && byId(m.a) && byId(m.b)) {
          box.classList.add("replayable");
          const rp = document.createElement("button"); rp.type = "button"; rp.className = "rp"; rp.textContent = "▶";
          rp.setAttribute("aria-label", "Replay this match"); rp.setAttribute("data-tip", "Watch this match again, exactly as it happened. It doesn't change the bracket. Works between matches.");
          rp.disabled = !!(playing || upnext || series || replay); rp.onclick = () => startReplay(m, r);
          box.appendChild(rp);
        }
        [m.a, m.b].forEach((pid) => {
          const row = document.createElement("div"), p = byId(pid);
          row.className = "slotrow" + (!p ? " tbd" : m.winner ? (m.winner === pid ? " win" : " lose") : "");
          row.innerHTML = `<span class="d"></span><span class="nm"></span><span class="by"></span>`;
          row.querySelector(".d").style.background = p ? E.COLORS[p.bot.color] : "var(--line)";
          row.querySelector(".nm").textContent = p ? p.bot.name : "TBD";
          row.querySelector(".by").textContent = p ? p.builder : "";
          box.appendChild(row);
        });
        col.appendChild(box);
      });
      if (col.children.length > 1) wrap.appendChild(col);
    });
    wrap.classList.toggle("many", wrap.children.length >= 3);
    $("left").textContent = state.phase === "done" ? "Finished" : `${remaining} match${remaining === 1 ? "" : "es"} left`;
    $("donectl").hidden = state.phase !== "done";
    ["next", "skip", "ptimewrap", "autowrap", "speedseg"].forEach((id) => ($(id).hidden = state.phase === "done")); // nothing left to play
    if (state.phase === "done" && stage.state !== "champ" && !playing && !replay) {
      const c = byId(state.championId);
      if (c) { hideUpNext(); stage.showChampion({ ...c.bot, builder: c.builder }, "", podiumOf(br)); M.play("champion", 1.5); $("roundname").textContent = "Champion"; $("matchinfo").textContent = ""; }
    }
  }

  // who stands beside the champion: the final's loser, then whoever lost the semifinals
  function podiumOf(br) {
    const loser = (m) => (m && m.winner && m.a && m.b ? byId(m.winner === m.a ? m.b : m.a) : null), bot = (p) => p && { ...p.bot, builder: p.builder };
    const fin = br.rounds[br.rounds.length - 1].matches[0], semis = br.rounds.length > 1 ? br.rounds[br.rounds.length - 2].matches : [];
    return { second: bot(loser(fin)), thirds: semis.map(loser).filter(Boolean).map(bot) };
  }
  function statusTag(p) {
    const s = status[p.id];
    if (!s) return p.connected ? { text: "GAME", cls: "play", tip: "On the game page." } : { text: "OFFLINE", cls: "", tip: "Not connected right now." };
    if (s.page === "learn") return s.n ? { text: "LESSON " + s.n, cls: "learn", tip: "Working on Lesson " + s.n + " in Robot Lessons." } : { text: "LESSONS", cls: "learn", tip: "Looking at the list of Robot Lessons." };
    if (s.page === "lab") return { text: s.n ? "LAB " + s.n : "LAB", cls: "lab", tip: s.n ? "Flying Car Lab, mission " + s.n + "." : "In the Flying Car Lab." };
    if (s.page === "practice") return { text: "PRACTICE", cls: "practice", tip: "In practice mode." };
    if (s.page === "race") return { text: "RACER", cls: "practice", tip: "Driving in Robot Racer." };
    if (s.page === "home") return { text: "HOME", cls: "", tip: "On the home page." };
    return { text: "GAME", cls: "play", tip: "On the game page." };
  }
  function renderClass() {
    const ps = state.players.filter((p) => !p.out);
    $("clslist").innerHTML = "";
    ps.forEach((p) => {
      const li = document.createElement("li"), tag = statusTag(p);
      li.innerHTML = '<span class="who"></span><span class="stag"></span>';
      li.firstChild.textContent = p.builder; li.lastChild.textContent = tag.text; li.lastChild.className = "stag " + tag.cls; li.lastChild.setAttribute("data-tip", tag.tip);
      $("clslist").appendChild(li);
    });
    $("classp").hidden = !ps.length;
  }

  function renderLeaders() {
    const top = state.players.filter((p) => p.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 5);
    $("leaderlist").innerHTML = "";
    top.forEach((p) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="who"></span><span class="pts"></span>`;
      li.querySelector(".who").textContent = p.builder; li.querySelector(".pts").textContent = p.pts;
      $("leaderlist").appendChild(li);
    });
    $("leaderempty").hidden = top.length > 0;
    $("leaders").hidden = state.phase === "done";
  }

  let awardsShown = "";
  function renderAwards() {
    const list = state.awards || [];
    $("awardsp").hidden = state.phase !== "done" || !list.length;
    const sig = JSON.stringify(list);
    if (sig === awardsShown) return;
    awardsShown = sig;
    $("awards").innerHTML = "";
    list.forEach((a, i) => {
      const p = byId(a.playerId); if (!p) return;
      const el = document.createElement("div"); el.className = "award"; el.style.animationDelay = (0.6 + i * 0.25) + "s";
      el.innerHTML = `<canvas width="96" height="96" aria-hidden="true"></canvas><div style="min-width:0"><div class="t"></div><div class="w"></div><div class="dt"></div></div>`;
      E.portrait(el.querySelector("canvas"), p.bot, "#26252b");
      el.querySelector(".t").textContent = a.title;
      el.querySelector(".w").textContent = `${p.builder} · ${p.bot.name}`;
      el.querySelector(".dt").textContent = a.detail;
      $("awards").appendChild(el);
    });
  }


  function showWhy(x, A, B) {
    const L = 1 - x.winner, loser = [A, B][L];
    $("why-h").textContent = `Why ${[A, B][x.winner].name} won`;
    $("why-r").innerHTML = "";
    x.sides[0].reasons.forEach((r) => { const li = document.createElement("li"); li.textContent = r; $("why-r").appendChild(li); });
    $("why-t").innerHTML = "<b></b> <span></span>"; $("why-t").firstChild.textContent = `Tip for ${loser.name}:`; $("why-t").lastChild.textContent = x.sides[L].tip;
    $("why").hidden = false;
  }

  // ---------- up next card + predictions ----------
  function partsList(b) { return E.SLOTS.map((k) => (k === "brain" && b.rules ? `Custom: ${b.rules.length} rule${b.rules.length === 1 ? "" : "s"}` : E.PARTS[k][b[k]].n)); }
  function showUpNext(m) {
    const A = m.a.bot, B = m.b.bot;
    $("un-round").textContent = m.round + (m.bestOf === 3 ? " · Best of 3" : "");
    E.portrait($("un-pa"), A, "rgba(0,0,0,0)", 1, 1.12); E.portrait($("un-pb"), B, "rgba(0,0,0,0)", -1, 1.12);
    $("un-na").textContent = A.name; $("un-nb").textContent = B.name;
    $("un-ba").textContent = "by " + A.builder; $("un-bb").textContent = "by " + B.builder;
    [["un-xa", A], ["un-xb", B]].forEach(([id, b]) => { $(id).innerHTML = ""; partsList(b).forEach((n) => { const s = document.createElement("span"); s.textContent = n; $(id).appendChild(s); }); });
    const sa = E.statsOf(A), sb = E.statsOf(B);
    const rows = [["ATK", "atk", 13, "var(--orange)"], ["DEF", "def", 12, "var(--good)"], ["SPD", "spd", 10, "var(--blue)"], ["AIM", "aim", 10, "var(--purple)"]];
    $("un-stats").innerHTML = rows.map(([l, k, mx, c]) =>
      `<span class="n">${sa[k]}</span><div class="bar ra"><i style="width:${E.clamp((sa[k] / mx) * 100, 4, 100)}%;background:${c}"></i></div><span class="l">${l}</span><div class="bar"><i style="width:${E.clamp((sb[k] / mx) * 100, 4, 100)}%;background:${c}"></i></div><span class="n">${sb[k]}</span>`).join("");
    $("upnext").hidden = false;
    M.play("hype");
    renderVotes();
  }
  function hideUpNext() { $("upnext").hidden = true; clearInterval(upnext && upnext.iv); upnext = null; }
  function renderVotes() {
    if (!state || !state.predict || $("upnext").hidden) return;
    const { a, b } = state.predict, n = a + b;
    $("un-va").style.width = (n ? (a / n) * 100 : 50) + "%"; $("un-vb").style.width = (n ? (b / n) * 100 : 50) + "%";
    $("un-ca").textContent = `${a} pick${a === 1 ? "" : "s"}`; $("un-cb").textContent = `${b} pick${b === 1 ? "" : "s"}`;
  }
  function startFight(m) {
    if (!upnext || upnext.started) return;
    upnext.started = true;
    clearInterval(upnext.iv);
    socket.emit("host:lock", {});
    $("un-msg").textContent = "Predictions locked!";
    E.Sound.play("go");
    M.play(null); // quiet for the 3-2-1 countdown; the fight track starts with the first move
    setTimeout(() => { hideUpNext(); playGame(); }, 900);
  }
  // one fight of the match on the board (a best of 3 plays up to three, all seeded by the server)
  function playGame() {
    const m = series.m, sim = E.simulate(m.a.bot, m.b.bot, m.seeds[series.g]);
    series.last = sim.winner;
    playing.why = E.explainBattle(m.a.bot, m.b.bot, sim, state && state.settings && state.settings.maxw); playing.A = m.a.bot; playing.B = m.b.bot;
    $("log").innerHTML = ""; $("why").hidden = true;
    stage.setBots(m.a.bot, m.b.bot, m.bestOf === 3 ? `${m.round.toUpperCase()} · GAME ${series.g + 1}` : m.round.toUpperCase());
    showScore();
    setTimeout(() => { stage.play(sim.events); $("skip").disabled = false; $("next").textContent = "Next match"; }, 300);
  }
  function showScore() {
    const m = series.m, base = `${m.a.bot.name} (${m.a.bot.builder}) vs ${m.b.bot.name} (${m.b.bot.builder})`;
    $("matchinfo").textContent = m.bestOf === 3 ? `${base} · Best of 3: ${series.score[0]}–${series.score[1]}` : base;
  }

  // ---------- replays: a finished match, watched again (the same seeds give the same fight) ----------
  function startReplay(m, r) {
    if (playing || upnext || series || replay) return;
    const A = byId(m.a), B = byId(m.b); if (!A || !B) return;
    clearTimeout(autoTimer);
    replay = { a: { ...A.bot, builder: A.builder }, b: { ...B.bot, builder: B.builder }, seeds: m.seeds, g: 0, round: state.bracket.rounds[r].name };
    $("next").disabled = true; render(); replayGame();
  }
  function replayGame() {
    const { a, b, seeds, g, round } = replay, sim = E.simulate(a, b, seeds[g]), many = seeds.length > 1;
    replay.why = E.explainBattle(a, b, sim, state.settings && state.settings.maxw);
    $("log").innerHTML = ""; $("why").hidden = true; hideUpNext();
    $("na").textContent = a.name; $("nb").textContent = b.name;
    $("roundname").textContent = "Replay: " + round;
    $("matchinfo").textContent = `${a.name} (${a.builder}) vs ${b.name} (${b.builder})${many ? ` · game ${g + 1} of ${seeds.length}` : ""}`;
    stage.setBots(a, b, `REPLAY · ${round.toUpperCase()}${many ? ` · GAME ${g + 1}` : ""}`);
    setTimeout(() => { stage.play(sim.events); $("skip").disabled = false; }, 300);
  }

  // ---------- controls ----------
  $("start").onclick = () => {
    E.Sound.play("go");
    socket.emit("host:start", {}, (r) => { if (!r.ok) $("hostmsg").textContent = r.error; else { $("log").innerHTML = ""; setTimeout(nextMatch, 600); } });
  };
  function nextMatch() {
    clearTimeout(autoTimer);
    if (upnext) { startFight(upnext.m); return; } // "Fight now" while the card is up
    if (playing || replay) return;
    if (series) { playing = { id: series.m.id }; playGame(); return; } // the next game of a best of 3
    $("next").disabled = true;
    socket.emit("host:next", {}, (r) => {
      $("next").disabled = false;
      if (!r || !r.ok) { if (r && r.error) $("hostmsg").textContent = r.error; return; }
      if (r.done) return;
      const m = r.match;
      playing = { id: m.id }; series = { m, g: 0, score: [0, 0] };
      $("log").innerHTML = ""; $("why").hidden = true;
      $("na").textContent = m.a.bot.name; $("nb").textContent = m.b.bot.name;
      $("roundname").textContent = m.round;
      showScore();
      stage.setBots(m.a.bot, m.b.bot, m.round.toUpperCase());
      const secs = +$("ptime").value;
      upnext = { m, started: false, left: secs };
      showUpNext(m);
      if (!secs) { $("un-msg").textContent = "Get ready!"; setTimeout(() => startFight(m), 1800); return; }
      $("next").textContent = "Fight now";
      const tick = () => {
        if (!upnext) return;
        $("un-msg").innerHTML = `Predict on your device! Closes in <b>${upnext.left}</b>`;
        if (upnext.left <= 3 && upnext.left > 0) E.Sound.play("beep");
        if (upnext.left <= 0) startFight(m);
        upnext && upnext.left--;
      };
      tick(); upnext.iv = setInterval(tick, 1000);
    });
  }
  $("next").onclick = nextMatch;
  $("rxon").onchange = () => socket.emit("host:reactions", { on: $("rxon").checked });
  // Space or → runs Next match, so a presentation clicker can drive the tournament
  document.addEventListener("keydown", (e) => {
    if (![" ", "ArrowRight", "PageDown"].includes(e.key) || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.target.closest("input, select, textarea, button, a")) return;
    if ($("v-tour").hidden || $("next").hidden || $("next").disabled) return;
    e.preventDefault(); nextMatch();
  });
  $("skip").onclick = () => stage.skip();
  $("auto").onchange = () => { if ($("auto").checked && !playing && state && state.phase === "tournament") nextMatch(); else clearTimeout(autoTimer); };
  [["sp1", 1], ["sp2", 2], ["sp3", 3]].forEach(([id, v]) => ($(id).onclick = () => {
    stage.speed = v; ["sp1", "sp2", "sp3"].forEach((x) => $(x).setAttribute("aria-pressed", x === id));
  }));
  $("again").onclick = () => socket.emit("host:reset", {}, () => { series = null; stage.setBots(null, null); $("log").innerHTML = ""; $("why").hidden = true; awardsShown = ""; });
  $("newgame").onclick = () => { ss.del("ba-host"); location.reload(); };
  $("sound").onclick = () => { const on = E.Sound.toggle(); $("sound").textContent = "Sound: " + (on ? "on" : "off"); $("sound").setAttribute("aria-pressed", on); };
  $("music").onclick = () => { const on = M.toggle(); $("music").textContent = "Music: " + (on ? "on" : "off"); $("music").setAttribute("aria-pressed", on); };
  $("fullscreen").onclick = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch {} };
})();
