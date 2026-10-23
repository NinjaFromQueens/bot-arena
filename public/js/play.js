/* Student device: name -> build robot -> join -> live status during the tournament. */
(function () {
  const E = window.Engine;
  const $ = (id) => document.getElementById(id);
  const socket = io();
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

  function show(id) { ["s-name", "s-build", "s-wait", "s-error"].forEach((s) => ($(s).hidden = s !== id)); window.scrollTo(0, 0); }
  function fail(title, text) { $("errtitle").textContent = title; $("errtext").textContent = text; show("s-error"); }

  if (!code) { location.href = "/"; return; }
  $("gamecode").textContent = code; $("code1").textContent = code; $("gamechip").hidden = false;

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
  socket.on("room:state", (s) => { state = s; render(); });
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
    const side = myPick && myPick.matchId === m.id ? myPick.side : null;
    $("pick-a").classList.toggle("on", side === "a"); $("pick-b").classList.toggle("on", side === "b");
    $("pick-a").setAttribute("aria-pressed", side === "a"); $("pick-b").setAttribute("aria-pressed", side === "b");
    const open = state.predict.open;
    box.querySelector(".pickrow").classList.toggle("locked", !open);
    $("pick-a").disabled = !open; $("pick-b").disabled = !open;
    const nm = side ? (side === "a" ? pa : pb).bot.name : "";
    $("pmsg").textContent = open
      ? (side ? `You picked ${nm}. You can switch until time runs out.` : "Tap the robot you think will win.")
      : (side ? `Locked in: ${nm}. Watch the board!` : "Predictions are closed. Watch the board!");
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

  function statusFor() {
    if (!state || !session) return { cls: "", text: "Connecting...", sub: "" };
    const me = state.players.find((p) => p.id === session.playerId);
    const name = (id) => { const p = state.players.find((x) => x.id === id); return p ? `${p.bot.name} (${p.builder})` : "?"; };
    if (!me) return { cls: "out", text: "Not in this game", sub: "" };
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
    if (state && state.phase === "lobby") myWhy = null;
    renderWhy();
    $("ptsline").hidden = !me || !state || state.phase === "lobby";
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
    requestAnimationFrame(loop);
  })(last);

  show(session ? "s-wait" : "s-name");
  socket.emit("room:check", { code }, (r) => { if (!r.ok && !session) fail("Can't find that game", r.error); });
})();
