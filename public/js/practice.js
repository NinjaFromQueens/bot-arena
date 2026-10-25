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

  // ---------------- MY PART PICTURES ----------------
  // A student's photo of a drawn part replaces that part on this device (practice mode only, never sent anywhere).
  // Boxes use the art pack frames (see public/art-sample/README.md): the picture is fitted inside its slot's space.
  let myArt = store.get("rba-art", {});
  const ART_SPACE = { body: [-1, -0.78, 2, 0.78], sensor: [-0.48, -0.36, 0.96, 0.72], tool: [0, -0.34, 0.68, 0.68] };
  function fitBox(slot, aspect) {
    const [x, y, w, h] = ART_SPACE[slot], fw = Math.min(w, h * aspect), fh = fw / aspect;
    return slot === "body" ? [-fw / 2, -fh, fw, fh] : slot === "tool" ? [0, -fh / 2, fw, fh] : [-fw / 2, -fh / 2, fw, fh];
  }
  function applyArt() { return E.loadArt("/art/manifest.json", myArt).then(() => { renderRoster(); }); }
  let artSlot = null;
  function renderArtRows(bot) {
    const box = $("artrows"); if (!box) return; box.innerHTML = "";
    ["body", "sensor", "tool"].forEach((slot) => {
      const key = slot + "." + bot[slot], mine = !!myArt[key], row = document.createElement("div"); row.className = "artrow";
      row.innerHTML = `<div><b></b><span class="st${mine ? " on" : ""}">${mine ? "Your picture ✓" : "Drawn by the game"}</span></div><button class="btn ghost" type="button">${mine ? "Change" : "Upload"}</button><button class="btn ghost" type="button"${mine ? "" : " disabled"}>Remove</button>`;
      row.querySelector("b").textContent = `${slot[0].toUpperCase() + slot.slice(1)}: ${PARTS[slot][bot[slot]].n}`;
      const [up, rm] = row.querySelectorAll("button");
      up.setAttribute("data-tip", `Upload a picture to use for the ${PARTS[slot][bot[slot]].n}${slot === "tool" ? ". Draw it pointing right, held at the left end." : slot === "body" ? ", facing right." : "."}`);
      rm.setAttribute("data-tip", "Go back to the game's own drawing of this part.");
      up.onclick = () => { artSlot = { slot, key }; $("artfile").value = ""; $("artfile").click(); };
      rm.onclick = () => { delete myArt[key]; store.set("rba-art", myArt); E.Sound.play("click"); applyArt(); renderArtRows(builder.bot); };
      box.appendChild(row);
    });
  }
  $("artfile").addEventListener("change", () => {
    const file = $("artfile").files[0]; if (!file || !artSlot) return;
    const { slot, key } = artSlot, fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 256 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const x = c.getContext("2d"); x.drawImage(img, 0, 0, c.width, c.height);
        if ($("artwhite").checked) { const d = x.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) if (d.data[i] > 200 && d.data[i + 1] > 200 && d.data[i + 2] > 200) d.data[i + 3] = 0; x.putImageData(d, 0, 0); }
        myArt[key] = { src: c.toDataURL("image/png"), box: fitBox(slot, c.width / c.height) };
        store.set("rba-art", myArt);
        if (!store.get("rba-art", {})[key]) { delete myArt[key]; $("artmsg").textContent = "That picture is too big to save on this device. Try a smaller one."; return; }
        $("artmsg").textContent = ""; E.Sound.play("go"); applyArt(); renderArtRows(builder.bot); builder.celebrate();
      };
      img.onerror = () => { $("artmsg").textContent = "That file isn't a picture this browser can open."; };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });

  // ---------------- BUILD ----------------
  const builder = Builder.mount({
    bot: store.get("rba-bot", null) || undefined,
    onChange(bot, over) {
      store.set("rba-bot", bot);
      $("code").textContent = codeOf(bot);
      $("save").disabled = over; $("copy").disabled = over;
      renderArtRows(bot);
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
  const SAMPLES = ["CRUSHER-12011", "ZIPZAP-00222", "SPIDEY-22113", "FLIPZ-31232", "BRAINY-20304-401322001"];
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
      row.setAttribute("data-tip", `Put ${r.name} in the selected corner. W and L are its wins and losses on this device.`);
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


  function showWhy(x, A, B, pre = "") {
    const L = 1 - x.winner, loser = [A, B][L];
    $(pre + "why-h").textContent = `Why ${[A, B][x.winner].name} won`;
    $(pre + "why-r").innerHTML = "";
    x.sides[0].reasons.forEach((r) => { const li = document.createElement("li"); li.textContent = r; $(pre + "why-r").appendChild(li); });
    $(pre + "why-t").innerHTML = "<b></b> <span></span>"; $(pre + "why-t").firstChild.textContent = `Tip for ${loser.name}:`; $(pre + "why-t").lastChild.textContent = x.sides[L].tip;
    $(pre + "why").hidden = false;
  }

  // ---------------- BATTLE ----------------
  // health bars and battle log for a stage whose element ids start with pre
  const hud = (pre) => ({
    onHP(hp, instant) {
      [["ba", "ga", 0], ["bb", "gb", 1]].forEach(([m, g, k]) => {
        m = $(pre + m); g = $(pre + g);
        if (instant) { g.style.transition = "none"; m.style.transition = "none"; }
        m.style.width = hp[k] + "%"; g.style.width = hp[k] + "%";
        if (instant) { void m.offsetWidth; g.style.transition = ""; m.style.transition = ""; }
      });
      $(pre + "ha").textContent = Math.round(hp[0]); $(pre + "hb").textContent = Math.round(hp[1]);
    },
    onLog(e, bot) {
      const d = document.createElement("div"), labels = { sense: "SENSE", think: "THINK", act: "ACT", win: "WINNER", stall: "STUCK" };
      d.innerHTML = `<span class="chip c-${e.kind === "stall" ? "act" : e.kind}">${labels[e.kind]}</span><span><span class="${e.me === 0 ? "a" : "b"}"></span><span></span></span>`;
      const p = d.lastElementChild.children; p[0].textContent = bot.name; p[1].textContent = e.txt;
      $(pre + "log").appendChild(d); $(pre + "log").scrollTop = $(pre + "log").scrollHeight;
    },
  });
  const stage = new BattleStage($("arena"), {
    ...hud(""),
    onDone(w) {
      if (lastFight) showWhy(lastFight.why, lastFight.A, lastFight.B);
      busy = false; $("skip").disabled = true; $("fight").disabled = false; $("fight").textContent = "Rematch";
      if (pick[0] !== pick[1]) { roster[pick[w]].w++; roster[pick[1 - w]].l++; store.set("rba-roster", roster); renderRoster(); }
    },
  });
  let lastFight = null;
  function resetFight() {
    busy = false; $("log").innerHTML = ""; $("why").hidden = true; $("skip").disabled = true; $("fight").disabled = false; $("fight").textContent = "Fight!";
    const a = roster[pick[0]], b = roster[pick[1]];
    $("na").textContent = a?.name || "—"; $("nb").textContent = b?.name || "—";
    stage.setBots(a, b);
  }
  $("fight").onclick = () => {
    const a = roster[pick[0]], b = roster[pick[1]]; if (!a || !b) return;
    resetFight(); busy = true; $("fight").disabled = true; $("skip").disabled = false;
    const sim = E.simulate(a, b);
    lastFight = { why: E.explainBattle(a, b, sim), A: a, B: b };
    stage.play(sim.events);
  };
  $("skip").onclick = () => stage.skip();
  [["sp1", 1], ["sp2", 2]].forEach(([id, v]) => ($(id).onclick = () => { stage.speed = v; $("sp1").setAttribute("aria-pressed", v === 1); $("sp2").setAttribute("aria-pressed", v === 2); }));

  // ---------------- BRAIN CHALLENGES ----------------
  // A fixed robot against a boss; the student only writes the Custom brain rules. Same 10 seeds every run (challenges.js).
  const CH = window.Challenges;
  let chProg = store.get("rba-challenges", {}), chRules = store.get("rba-ch-rules", {}); // id -> { best, done } | id -> rules
  let chI = 0, chRes = null, chHint = 0, chWatch = null;
  const partsOf = (b) => `${PARTS.body[b.body].n} · ${PARTS.sensor[b.sensor].n} · ${PARTS.tool[b.tool].n}`;
  const chOpen = (i) => i === 0 || !!(chProg[CH.LIST[i - 1].id] || {}).done;
  const chStage = new BattleStage($("ch-arena"), {
    ...hud("ch-"),
    onDone() { if (chWatch) showWhy(chWatch.why, chWatch.A, chWatch.B, "ch-"); $("ch-skip").disabled = true; },
  });
  chStage.speed = 2;
  function renderChPick() {
    $("ch-list").innerHTML = "";
    CH.LIST.forEach((ch, i) => {
      const b = document.createElement("button"), p = chProg[ch.id] || {}, boss = parseCode(ch.boss).name;
      b.type = "button"; b.textContent = (i + 1) + (p.done ? " ✓" : chOpen(i) ? "" : " 🔒");
      b.className = p.done ? "done" : ""; b.disabled = !chOpen(i); b.setAttribute("aria-pressed", i === chI);
      b.setAttribute("aria-label", `Challenge ${i + 1}: ${ch.n}, against ${boss}${p.done ? ", beaten" : chOpen(i) ? "" : ", locked"}`);
      b.setAttribute("data-tip", chOpen(i) ? `Challenge ${i + 1}: ${ch.n} (vs ${boss}).${p.done ? ` Best: ${p.best} of ${CH.FIGHTS} wins.` : ""}` : "Beat the challenge before this one to unlock it.");
      b.onclick = () => { E.Sound.play("click"); openCh(i); };
      $("ch-list").appendChild(b);
    });
  }
  function rulesChanged() {
    Builder.rulesEditor($("ch-rules"), chRules[CH.LIST[chI].id], rulesChanged);
    store.set("rba-ch-rules", chRules);
    $("ch-results").hidden = true; // results belong to the old rules
  }
  function openCh(i) {
    chI = i; chRes = null; chHint = 0; chWatch = null;
    const ch = CH.LIST[i], [you, boss] = CH.bots(ch, []);
    if (!Array.isArray(chRules[ch.id])) chRules[ch.id] = [];
    $("ch-num").textContent = `CHALLENGE ${i + 1} OF ${CH.LIST.length}`; $("ch-title").textContent = ch.n;
    [["you", you], ["boss", boss]].forEach(([k, b]) => {
      const cv = $("ch-" + k); cv.width = cv.height = 128;
      E.portrait(cv, b, "#1b1a1e", k === "you" ? 1 : -1);
      $(`ch-${k}name`).textContent = b.name; $(`ch-${k}parts`).textContent = partsOf(b) + (k === "boss" && !b.rules ? ` · ${PARTS.brain[b.brain].n} brain` : "");
    });
    $("ch-intro").textContent = ch.intro;
    $("ch-rules").dataset.sig = ""; rulesChanged();
    $("ch-hints").innerHTML = ""; $("ch-hint").disabled = false; $("ch-hint").textContent = "Need a hint?";
    $("ch-results").hidden = true; $("ch-why").hidden = true; $("ch-skip").disabled = true;
    $("ch-log").innerHTML = '<p class="small" style="margin:0">Run the 10 fights, then tap any result to watch that fight here.</p>';
    $("ch-na").textContent = you.name; $("ch-nb").textContent = boss.name;
    chStage.setBots(you, boss, ch.n.toUpperCase());
    renderChPick();
  }
  $("ch-hint").onclick = () => {
    const ch = CH.LIST[chI];
    if (chHint >= ch.hints.length) return;
    const li = document.createElement("li"); li.textContent = ch.hints[chHint++]; $("ch-hints").appendChild(li);
    E.Sound.play("click");
    if (chHint >= ch.hints.length) { $("ch-hint").disabled = true; $("ch-hint").textContent = "No more hints"; }
    else $("ch-hint").textContent = "Another hint";
  };
  function watchCh(k) {
    const f = chRes.fights[k], sim = E.simulate(chRes.a, chRes.b, f.seed);
    chWatch = { why: E.explainBattle(chRes.a, chRes.b, sim), A: chRes.a, B: chRes.b };
    [...$("ch-dots").children].forEach((d, j) => d.setAttribute("aria-pressed", j === k));
    $("ch-log").innerHTML = ""; $("ch-why").hidden = true; $("ch-skip").disabled = false;
    chStage.setBots(chRes.a, chRes.b, `FIGHT ${k + 1}`); chStage.play(sim.events);
  }
  $("ch-run").onclick = () => {
    const ch = CH.LIST[chI];
    chRes = CH.run(ch, chRules[ch.id]);
    if (!chRes) return;
    $("ch-dots").innerHTML = "";
    chRes.fights.forEach((f, k) => {
      const d = document.createElement("button"); d.type = "button"; d.className = f.won ? "w" : "l"; d.textContent = f.won ? "W" : "L";
      d.setAttribute("aria-label", `Fight ${k + 1}: ${f.won ? "won" : "lost"}. Watch it.`); d.setAttribute("data-tip", `Watch fight ${k + 1} (${f.won ? "a win" : "a loss"}).`);
      d.onclick = () => { E.Sound.play("click"); watchCh(k); };
      $("ch-dots").appendChild(d);
    });
    const p = chProg[ch.id] || {};
    $("ch-score").textContent = chRes.passed ? `You won ${chRes.wins} of ${CH.FIGHTS}. Challenge beaten!` : `You won ${chRes.wins} of ${CH.FIGHTS}. You need ${CH.NEED}. Watch a loss, read the tip, then change a rule.`;
    if (chRes.passed) {
      chProg[ch.id] = { done: true, best: Math.max(p.best || 0, chRes.wins) }; store.set("rba-challenges", chProg);
      $("ch-lessontext").textContent = ch.lesson;
      $("ch-next").hidden = chI >= CH.LIST.length - 1;
      E.Sound.play("fanfare");
    } else { if (p.done) { chProg[ch.id].best = Math.max(p.best || 0, chRes.wins); store.set("rba-challenges", chProg); } E.Sound.play("miss"); }
    $("ch-lesson").hidden = !chRes.passed;
    $("ch-results").hidden = false;
    renderChPick();
    // beaten: replay a win; not yet: replay a loss, which teaches the most
    const k = chRes.fights.findIndex((f) => f.won === chRes.passed);
    watchCh(k < 0 ? 0 : k);
  };
  $("ch-next").onclick = () => { if (chI < CH.LIST.length - 1) { E.Sound.play("go"); openCh(chI + 1); } };
  $("ch-skip").onclick = () => chStage.skip();
  [["ch-sp1", 1], ["ch-sp2", 2]].forEach(([id, v]) => ($(id).onclick = () => { chStage.speed = v; $("ch-sp1").setAttribute("aria-pressed", v === 1); $("ch-sp2").setAttribute("aria-pressed", v === 2); }));
  { const first = CH.LIST.findIndex((c, i) => chOpen(i) && !(chProg[c.id] || {}).done); openCh(first < 0 ? 0 : first); }

  // ---------------- tabs + loop ----------------
  function show(bay) {
    ["build", "arena", "challenges"].forEach((k) => { $("bay-" + k).hidden = k !== bay; $("tab-" + k).setAttribute("aria-selected", k === bay); });
    try { history.replaceState(null, "", "#" + bay); } catch {}
  }
  document.querySelectorAll(".tab[data-bay]").forEach((t) => (t.onclick = () => { E.Sound.play("click"); show(t.dataset.bay); }));
  const start = (location.hash || "").replace("#", "");
  show(["build", "arena", "challenges"].includes(start) ? start : "build");
  $("sound").onclick = () => { const on = E.Sound.toggle(); $("sound").textContent = "Sound: " + (on ? "on" : "off"); $("sound").setAttribute("aria-pressed", on); };

  renderRoster(); resetFight(); renderArtRows(builder.bot); applyArt();
})();
