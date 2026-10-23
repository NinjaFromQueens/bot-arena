/* Practice mode (one device): build bots and battle them.
   Uses the same engine as the tournament, so the rules match. */
(function () {
  const E = window.Engine;
  const { fit, rr, ease, clamp, bigText, FX, RM, COLORS, PARTS, statsOf, MAXW, codeOf, parseCode } = E;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ---------------- BUILD ----------------
  const builder = Builder.mount({
    bot: store.get("rba-bot", null) || undefined,
    onChange(bot, over) {
      store.set("rba-bot", bot);
      $("code").textContent = codeOf(bot);
      $("save").disabled = over; $("copy").disabled = over;
    },
  });
  let toastT;
  function toast(msg) { $("toast").textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => ($("toast").textContent = ""), 3500); }
  $("copy").onclick = async () => {
    try { await navigator.clipboard.writeText(codeOf(builder.bot)); toast("Copied!"); }
    catch { const r = document.createRange(); r.selectNodeContents($("code")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("Code selected. Press Ctrl+C to copy."); }
  };
  $("save").onclick = () => {
    if (builder.overweight()) return;
    addToRoster(builder.bot, false); E.Sound.play("win"); builder.celebrate();
    toast(`${builder.bot.name} joined the Arena roster!`);
  };

  // ---------------- ROSTER ----------------
  const SAMPLES = ["CRUSHER-12011", "ZIPZAP-00222", "SPIDEY-22113"];
  let roster = store.get("rba-roster", null);
  if (!Array.isArray(roster) || !roster.length) roster = SAMPLES.map((c) => ({ ...parseCode(c), sample: true, w: 0, l: 0 }));
  roster = roster.filter((r) => E.sanitizeBot(r)); // drop bots made under old rules that are now invalid
  if (roster.length < 2) roster = SAMPLES.map((c) => ({ ...parseCode(c), sample: true, w: 0, l: 0 }));
  let pick = [0, Math.min(1, roster.length - 1)], activeCorner = 0, busy = false;

  function addToRoster(b, isSample) {
    const code = codeOf(b), i = roster.findIndex((r) => codeOf(r) === code);
    if (i >= 0) return i;
    roster.push({ ...b, sample: !!isSample, w: 0, l: 0 }); store.set("rba-roster", roster); renderRoster();
    return roster.length - 1;
  }
  function setCorner(k) { activeCorner = k; $("cornerA").setAttribute("aria-pressed", k === 0); $("cornerB").setAttribute("aria-pressed", k === 1); }
  $("cornerA").onclick = () => { E.Sound.play("click"); setCorner(0); };
  $("cornerB").onclick = () => { E.Sound.play("click"); setCorner(1); };
  function renderRoster() {
    pick = pick.map((p) => clamp(p, 0, roster.length - 1));
    const el = $("roster"); el.innerHTML = "";
    roster.forEach((r, i) => {
      const row = document.createElement("button"); row.type = "button";
      row.className = "rbot" + (pick[0] === i ? " in-a" : "") + (pick[1] === i ? " in-b" : "");
      row.innerHTML = `<canvas width="80" height="80" aria-hidden="true"></canvas><div style="min-width:0"><div class="nm"></div><div class="meta"></div></div><div class="rec"></div>`;
      const nm = row.querySelector(".nm"); nm.textContent = r.name;
      if (r.sample) { const t = document.createElement("span"); t.className = "tag"; t.textContent = "sample"; nm.appendChild(t); }
      row.querySelector(".meta").textContent = `${PARTS.body[r.body].n} · ${PARTS.sensor[r.sensor].n} · ${PARTS.tool[r.tool].n}`;
      row.querySelector(".rec").innerHTML = `${r.w}W<br>${r.l}L`;
      row.setAttribute("aria-label", `${r.name}: put in the active corner`);
      E.portrait(row.querySelector("canvas"), r, "#2b2a30");
      row.onclick = () => { if (busy) return; E.Sound.play("click"); pick[activeCorner] = i; setCorner(1 - activeCorner); renderRoster(); resetFight(); };
      el.appendChild(row);
    });
    $("cna").textContent = roster[pick[0]]?.name || "—"; $("cnb").textContent = roster[pick[1]]?.name || "—";
  }
  $("add").onclick = () => {
    const b = parseCode($("addcode").value);
    if (!b) { $("addmsg").textContent = "That code doesn't look right. It should look like ZAP-21013."; return; }
    if (statsOf(b).wt > MAXW) { $("addmsg").textContent = "That bot is over 75 kg, so it can't fight."; return; }
    if (busy) return;
    $("addmsg").textContent = ""; $("addcode").value = "";
    const i = addToRoster(b, false); pick[activeCorner] = i; setCorner(1 - activeCorner); renderRoster(); resetFight(); E.Sound.play("go");
  };
  $("addcode").addEventListener("keydown", (e) => { if (e.key === "Enter") $("add").click(); });
  $("randmatch").onclick = () => {
    if (busy || roster.length < 2) return;
    const a = (Math.random() * roster.length) | 0; let b; do { b = (Math.random() * roster.length) | 0; } while (b === a);
    pick = [a, b]; renderRoster(); resetFight(); E.Sound.play("go");
  };

  // ---------------- BATTLE ----------------
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
    onDone(w) {
      busy = false; $("skip").disabled = true; $("fight").disabled = false; $("fight").textContent = "Rematch";
      if (pick[0] !== pick[1]) { roster[pick[w]].w++; roster[pick[1 - w]].l++; store.set("rba-roster", roster); renderRoster(); }
    },
  });
  function resetFight() {
    busy = false; $("log").innerHTML = ""; $("skip").disabled = true; $("fight").disabled = false; $("fight").textContent = "Fight!";
    const a = roster[pick[0]], b = roster[pick[1]];
    $("na").textContent = a?.name || "—"; $("nb").textContent = b?.name || "—";
    stage.setBots(a, b);
  }
  $("fight").onclick = () => {
    const a = roster[pick[0]], b = roster[pick[1]]; if (!a || !b) return;
    resetFight(); busy = true; $("fight").disabled = true; $("skip").disabled = false;
    stage.play(E.simulate(a, b).events);
  };
  $("skip").onclick = () => stage.skip();
  [["sp1", 1], ["sp2", 2]].forEach(([id, v]) => ($(id).onclick = () => { stage.speed = v; $("sp1").setAttribute("aria-pressed", v === 1); $("sp2").setAttribute("aria-pressed", v === 2); }));

  // ---------------- tabs + loop ----------------
  function show(bay) {
    ["build", "arena"].forEach((k) => { $("bay-" + k).hidden = k !== bay; $("tab-" + k).setAttribute("aria-selected", k === bay); });
    try { history.replaceState(null, "", "#" + bay); } catch {}
  }
  document.querySelectorAll(".tab[data-bay]").forEach((t) => (t.onclick = () => { E.Sound.play("click"); show(t.dataset.bay); }));
  const start = (location.hash || "").replace("#", "");
  show(["build", "arena"].includes(start) ? start : "build");
  $("sound").onclick = () => { const on = E.Sound.toggle(); $("sound").textContent = "Sound: " + (on ? "on" : "off"); $("sound").setAttribute("aria-pressed", on); };

  renderRoster(); resetFight();
})();
