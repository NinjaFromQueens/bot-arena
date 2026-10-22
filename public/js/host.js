/* Teacher's board: create a game, show join code + QR, run the bracket and play each battle. */
(function () {
  const E = window.Engine;
  const $ = (id) => document.getElementById(id);
  const socket = io();
  let state = null, code = null, playing = null, autoTimer = null;
  const seen = new Set();

  const ss = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); } catch {} },
  };

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
      const d = document.createElement("div"), labels = { sense: "SENSE", think: "THINK", act: "ACT", win: "WINNER", stall: "STUCK" };
      d.innerHTML = `<span class="chip c-${e.kind === "stall" ? "act" : e.kind}">${labels[e.kind]}</span><span><span class="${e.me === 0 ? "a" : "b"}"></span><span></span></span>`;
      const p = d.lastElementChild.children; p[0].textContent = bot.name; p[1].textContent = e.txt;
      $("log").appendChild(d); $("log").scrollTop = $("log").scrollHeight;
    },
    onDone() {
      if (!playing) return;
      const id = playing.id; playing = null;
      $("skip").disabled = true;
      socket.emit("host:matchDone", { matchId: id }, (r) => {
        if (r && r.done) return; // champion screen comes from state
        $("next").disabled = false;
        if ($("auto").checked) autoTimer = setTimeout(nextMatch, 2500);
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
  socket.on("room:state", (s) => { $("hostmsg").textContent = ""; state = s; render(); });

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
    else renderTour();
  }

  function renderLobby() {
    const n = state.players.length;
    $("pcount").textContent = n; $("start").disabled = n < 2; $("emptymsg").hidden = n > 0;
    const grid = $("players"), have = new Map([...grid.children].map((el) => [el.dataset.id, el]));
    state.players.forEach((p) => {
      let el = have.get(p.id);
      const sig = JSON.stringify(p.bot) + p.builder;
      if (!el) {
        el = document.createElement("div"); el.className = "pcard"; el.dataset.id = p.id;
        el.innerHTML = `<button class="kick" type="button" aria-label="Remove">×</button><canvas width="240" height="240"></canvas><div class="bn"></div><div class="bl"></div>`;
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
    $("left").textContent = state.phase === "done" ? "Finished" : `${remaining} match${remaining === 1 ? "" : "es"} ready`;
    $("donectl").hidden = state.phase !== "done";
    $("next").hidden = state.phase === "done";
    if (state.phase === "done" && stage.state !== "champ" && !playing) {
      const c = byId(state.championId);
      if (c) { stage.showChampion({ ...c.bot, builder: c.builder }); $("roundname").textContent = "Champion"; $("matchinfo").textContent = ""; }
    }
    if (state.phase === "tournament" && !playing && stage.state === "empty") stage.setBots(null, null);
  }

  // ---------- controls ----------
  $("start").onclick = () => {
    E.Sound.play("go");
    socket.emit("host:start", {}, (r) => { if (!r.ok) $("hostmsg").textContent = r.error; else { $("log").innerHTML = ""; setTimeout(nextMatch, 600); } });
  };
  function nextMatch() {
    clearTimeout(autoTimer);
    if (playing) return;
    $("next").disabled = true;
    socket.emit("host:next", {}, (r) => {
      if (!r || !r.ok) { $("next").disabled = false; if (r && r.error) $("hostmsg").textContent = r.error; return; }
      if (r.done) return;
      const m = r.match;
      playing = { id: m.id };
      $("log").innerHTML = "";
      $("na").textContent = m.a.bot.name; $("nb").textContent = m.b.bot.name;
      $("roundname").textContent = m.round;
      $("matchinfo").textContent = `${m.a.bot.name} (${m.a.bot.builder}) vs ${m.b.bot.name} (${m.b.bot.builder})`;
      stage.setBots(m.a.bot, m.b.bot, m.round.toUpperCase());
      const sim = E.simulate(m.a.bot, m.b.bot, m.seed);
      setTimeout(() => { stage.play(sim.events); $("skip").disabled = false; }, 700);
    });
  }
  $("next").onclick = nextMatch;
  $("skip").onclick = () => stage.skip();
  $("auto").onchange = () => { if ($("auto").checked && !playing && state && state.phase === "tournament") nextMatch(); else clearTimeout(autoTimer); };
  [["sp1", 1], ["sp2", 2], ["sp3", 3]].forEach(([id, v]) => ($(id).onclick = () => {
    stage.speed = v; ["sp1", "sp2", "sp3"].forEach((x) => $(x).setAttribute("aria-pressed", x === id));
  }));
  $("again").onclick = () => socket.emit("host:reset", {}, () => { stage.setBots(null, null); $("log").innerHTML = ""; });
  $("newgame").onclick = () => { ss.del("ba-host"); location.reload(); };
  $("sound").onclick = () => { const on = E.Sound.toggle(); $("sound").textContent = "Sound: " + (on ? "on" : "off"); $("sound").setAttribute("aria-pressed", on); };
  $("fullscreen").onclick = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch {} };
})();
