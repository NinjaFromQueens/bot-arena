/* Teacher's board: create a game, show join code + QR, run the bracket, predictions and battles. */
(function () {
  const E = window.Engine, M = window.Music;
  const $ = (id) => document.getElementById(id);
  const socket = io();
  let state = null, code = null, playing = null, autoTimer = null, upnext = null;
  const seen = new Set();

  const ss = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); } catch {} },
  };
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  $("ptime").value = String(ls.get("ba-ptime", 12));
  $("ptime").onchange = () => ls.set("ba-ptime", +$("ptime").value);

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
      if (!playing) return;
      const id = playing.id;
      if (playing.why) showWhy(playing.why, playing.A, playing.B);
      playing = null;
      $("skip").disabled = true;
      socket.emit("host:matchDone", { matchId: id }, (r) => {
        if (r && r.done) return; // champion screen comes from state
        M.play("garage");
        $("next").disabled = false; $("next").textContent = "Next match";
        if ($("auto").checked) autoTimer = setTimeout(nextMatch, 7000); // time to read "why"
      });
    },
  });

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
  socket.on("room:state", (s) => { $("hostmsg").textContent = ""; state = s; $("rxon").checked = s.reactions; render(); });
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
    if (state.phase === "lobby") renderLobby();
    else { renderTour(); renderLeaders(); renderVotes(); renderAwards(); }
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
        el.innerHTML = `<button class="kick" type="button" aria-label="Remove" data-tip="Remove this robot. Click twice to confirm.">×</button><canvas width="240" height="240"></canvas><div class="bn"></div><div class="bl"></div>`;
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
      have.delete(p.id);
    });
    have.forEach((el) => el.remove());
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
    if (state.phase === "done" && stage.state !== "champ" && !playing) {
      const c = byId(state.championId);
      if (c) { hideUpNext(); stage.showChampion({ ...c.bot, builder: c.builder }); M.play("champion", 1.5); $("roundname").textContent = "Champion"; $("matchinfo").textContent = ""; }
    }
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
  function partsList(b) { return E.SLOTS.map((k) => E.PARTS[k][b[k]].n); }
  function showUpNext(m) {
    const A = m.a.bot, B = m.b.bot;
    $("un-round").textContent = m.round;
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
    setTimeout(() => {
      hideUpNext();
      const sim = E.simulate(m.a.bot, m.b.bot, m.seed);
      playing.why = E.explainBattle(m.a.bot, m.b.bot, sim); playing.A = m.a.bot; playing.B = m.b.bot;
      setTimeout(() => { stage.play(sim.events); $("skip").disabled = false; $("next").textContent = "Next match"; }, 300);
    }, 900);
  }

  // ---------- controls ----------
  $("start").onclick = () => {
    E.Sound.play("go");
    socket.emit("host:start", {}, (r) => { if (!r.ok) $("hostmsg").textContent = r.error; else { $("log").innerHTML = ""; setTimeout(nextMatch, 600); } });
  };
  function nextMatch() {
    clearTimeout(autoTimer);
    if (upnext) { startFight(upnext.m); return; } // "Fight now" while the card is up
    if (playing) return;
    $("next").disabled = true;
    socket.emit("host:next", {}, (r) => {
      $("next").disabled = false;
      if (!r || !r.ok) { if (r && r.error) $("hostmsg").textContent = r.error; return; }
      if (r.done) return;
      const m = r.match;
      playing = { id: m.id };
      $("log").innerHTML = ""; $("why").hidden = true;
      $("na").textContent = m.a.bot.name; $("nb").textContent = m.b.bot.name;
      $("roundname").textContent = m.round;
      $("matchinfo").textContent = `${m.a.bot.name} (${m.a.bot.builder}) vs ${m.b.bot.name} (${m.b.bot.builder})`;
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
  $("again").onclick = () => socket.emit("host:reset", {}, () => { stage.setBots(null, null); $("log").innerHTML = ""; $("why").hidden = true; awardsShown = ""; });
  $("newgame").onclick = () => { ss.del("ba-host"); location.reload(); };
  $("sound").onclick = () => { const on = E.Sound.toggle(); $("sound").textContent = "Sound: " + (on ? "on" : "off"); $("sound").setAttribute("aria-pressed", on); };
  $("music").onclick = () => { const on = M.toggle(); $("music").textContent = "Music: " + (on ? "on" : "off"); $("music").setAttribute("aria-pressed", on); };
  $("fullscreen").onclick = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch {} };
})();
