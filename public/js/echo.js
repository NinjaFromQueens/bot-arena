/*
 * Echo Lab's page (ECHO-1, docs/echo-lab-plan.md). Free play lists every Echo mission; ?mission=<id> plays one: Ezra's
 * brief, the first call (Cards.predict; it locks on the first clue), the evidence table (tap the things in the Echo, show
 * the light, compare copies, read the record as an Operative), the verdict, then the explain card from Echoes.explain.
 * A set (the Archive's last five) asks how many were altered, judges each Echo in turn and reveals them all at the end.
 * Progress goes to cr-missions on this device; in a class game, Missions.send reports the run to the teacher's board.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const tier = () => (window.Tier ? Tier.current() : "recruit");
  const T = (v) => (window.Tier ? Tier.text(v, tier()) : v && typeof v === "object" ? v.recruit : v);
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(u))));
  const params = new URLSearchParams(location.search), MID = params.get("mission"), RUN = params.get("run");
  const btn = (text, tip, onclick, cls) => { const b = el("button", cls || "btn", text); b.type = "button"; b.setAttribute("data-tip", tip); b.onclick = onclick; return b; };
  const KICK = { date: "A date that can't be right", shadow: "A shadow that doesn't match", copies: "Copies that disagree" };
  let A = {}, M = {}, ORDER = [], glossary = {};

  // a picture by asset ID once it's made (the asset list), or null for the labeled gray placeholder
  const resolve = (ref) => (typeof ref === "string" && ref.startsWith("/") ? ref : (A[ref] && A[ref].made && A[ref].file) || null);
  const simple = () => { try { const v = localStorage.getItem("cr-simple"); return v === "1" || (v == null && !!(navigator.connection && navigator.connection.saveData)); } catch { return false; } };
  function picture(box, ref, label) {
    const src = resolve(ref);
    if (src) { const img = el("img"); img.alt = label; img.src = src; img.onerror = () => img.replaceWith(placeholder(ref, label)); box.appendChild(img); }
    else box.appendChild(placeholder(ref, label));
  }
  function placeholder(ref, label) { const ph = el("div", "ph"); ph.append(el("b", "", ref), el("span", "", label)); return ph; }
  const link = (mid) => `/echo?mission=${encodeURIComponent(mid)}${RUN ? "&run=" + encodeURIComponent(RUN) : ""}`;
  const teachesOf = (m) => { const c = Echoes.caseOf(m.setting); return c && c.teaches; };

  function intro(kick, title, say) {
    const box = $("intro"); box.innerHTML = "";
    box.append(el("span", "kick", kick), el("h2", "", title));
    if (say) { const p = el("p", "say"); p.append(el("b", "", "EZRA"), el("span", "", say)); box.appendChild(p); }
  }

  // ---- free play: every Echo mission ----
  function list() {
    $("tolist").hidden = true;
    intro("ECHO LAB · THE ARCHIVE", "Real or altered?", T({ cadet: "OMNI changed some old pictures. Let's find the ones it changed.", recruit: "OMNI didn't only erase the past. It changed some of it. Check every Echo before we take it home.", operative: "OMNI edited some of these sources and left them where we'd find them. We check each one before it leaves the Archive." }));
    const main = $("main"); main.innerHTML = "";
    const prog = ls.get("cr-missions", {}), grid = el("div", "cases");
    ORDER.forEach((mid, i) => {
      const m = M[mid], t = teachesOf(m), done = !!(prog[mid] && prog[mid].goal);
      const card = el("div", "case" + (done ? " done" : ""));
      card.append(el("span", "kick", t ? `PRACTICE ${i + 1} · ${KICK[t].toUpperCase()}` : "THE MISSION"), el("h3", "", T(m.title)), el("p", "", Missions.text(m, "brief", tier())), el("span", "st", done ? "✓ Done" : prog[mid] ? `${prog[mid].tries} ${prog[mid].tries === 1 ? "try" : "tries"}` : "Not tried yet"));
      const a = el("a", done ? "btn ghost" : "btn", done ? "Check it again" : "Start"); a.href = link(mid); a.setAttribute("data-tip", `Open ${T(m.title)}. Make your first call, then check the evidence.`);
      card.appendChild(a); grid.appendChild(card);
    });
    main.appendChild(grid);
  }

  // ---- one mission ----
  function play(mid) {
    const m = M[mid];
    if (!m) { intro("ECHO LAB", "That Echo isn't here", "Check the link, or pick one from the list."); return; }
    const set = Echoes.setOf(m.setting), cases = set ? set.cases : [Echoes.caseOf(m.setting)], t0 = tier();
    const st = { i: 0, checked: cases.map(() => new Set()), verdicts: [], pred: null, locked: false };
    const t = teachesOf(m);
    intro(set ? "ECHO LAB · THE MISSION" : `ECHO LAB · ${KICK[t].toUpperCase()}`, T(m.title), Missions.text(m, "brief", t0));
    const main = $("main"); main.innerHTML = "";
    const pbox = el("div"); main.appendChild(pbox);
    const pc = Cards.predict(pbox, { question: Missions.text(m, "question", t0), options: Missions.options(m, t0), go: "your first clue", kicker: "Your first call", onPick: (v) => (st.pred = v) });
    const table = el("div", "table"); main.appendChild(table);
    const result = el("div"); result.id = "result"; main.appendChild(result);
    const lock = () => { if (st.locked) return true; if (st.pred == null) { pc.card.classList.remove("nudge"); void pc.card.offsetWidth; pc.card.classList.add("nudge"); pc.say(T({ cadet: "Make your guess first!", recruit: "Make your first call first. Then check the evidence.", operative: "Commit to a first call before you look at the evidence." })); return false; } st.locked = true; pc.lock(); return true; };

    function showCase() {
      const c = cases[st.i], seen = st.checked[st.i];
      table.innerHTML = "";
      const photo = el("div", "photo"); picture(photo, c.picture, T(c.title));
      photo.appendChild(el("span", "label", `${T({ cadet: "Says", recruit: "Saved as", operative: "Dated" })} ${c.year} · ${T(c.place)}`));
      const arrows = document.createElementNS("http://www.w3.org/2000/svg", "svg"); arrows.setAttribute("class", "arrows"); arrows.setAttribute("viewBox", "0 0 160 90"); arrows.setAttribute("preserveAspectRatio", "none"); arrows.setAttribute("aria-hidden", "true"); photo.appendChild(arrows);
      const side = el("div", "side"), clue = el("div", "clue", T({ cadet: "Tap the circles on the picture to look closer.", recruit: "Tap the circles on the Echo to check what's in it. Use the tools below for more evidence.", operative: "Tap each marked object, then use the tools. Decide only when the evidence supports it." }));
      const say = (main, sub) => { clue.innerHTML = ""; clue.appendChild(el("div", "", main)); if (sub) clue.appendChild(sub); };
      const mark = (id) => { seen.add(id); };
      for (const it of c.items) {
        const s = el("button", "spot" + (seen.has("item:" + it.id) ? " seen" : "")); s.type = "button";
        s.style.left = it.x + "%"; s.style.top = it.y + "%"; s.style.width = it.r * 2 + "%";
        s.setAttribute("aria-label", T(it.name)); s.setAttribute("data-tip", `Check ${T(it.name).toLowerCase()}.`);
        s.onclick = () => { if (!lock()) return; mark("item:" + it.id); s.classList.add("seen"); say(Echoes.clueText(c, "item:" + it.id, t0)); };
        photo.appendChild(s);
      }
      const tools = el("div", "tools"), avail = Echoes.clues(c, t0);
      if (avail.includes("light")) tools.appendChild(btn(T({ cadet: "Show the shadows", recruit: "Show the light", operative: "Show the light" }), "Draw an arrow on every shadow, showing which way it points.", () => {
        if (!lock()) return; mark("light"); arrows.innerHTML = "";
        for (const it of c.items.filter((x) => x.shadow != null)) {
          const x = it.x * 1.6, y = it.y * 0.9, a = (it.shadow * Math.PI) / 180, L = 14, x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
          const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
          g.innerHTML = `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="2.4" stroke-linecap="round"/><line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="#ffb347" stroke-width="1.2" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="1.6" fill="#ffb347" stroke="#111" stroke-width=".5"/>`;
          arrows.appendChild(g);
        }
        say(Echoes.clueText(c, "light", t0));
      }, "btn ghost"));
      if (avail.includes("copies")) tools.appendChild(btn(T({ cadet: "See the other copies", recruit: "Compare copies", operative: "Compare copies" }), "Show every copy of this Echo side by side, with what each one shows.", () => {
        if (!lock()) return; mark("copies");
        const box = el("div", "copies");
        for (const k of c.copies) {
          const row = el("div", "copy" + (k.id === c.checks ? " mine" : "")), th = el("div", "thumb"), src = resolve(k.picture);
          if (src) { const im = el("img"); im.alt = ""; im.src = src; th.appendChild(im); } else th.appendChild(el("span", "", k.picture));
          const info = el("div"); info.append(el("b", "", k.id === c.checks ? T({ cadet: "This copy", recruit: "The copy you're checking", operative: "The copy under review" }) : k.server));
          info.appendChild(el("small", "", `${k.server} · saved ${k.saved}`));
          info.appendChild(el("div", "", Object.entries(k.shows).map(([key, v]) => `${key[0].toUpperCase() + key.slice(1)}: ${v}`).join(" · ")));
          row.append(th, info); box.appendChild(row);
        }
        say(Echoes.clueText(c, "copies", t0), box);
      }, "btn ghost"));
      if (avail.includes("record")) tools.appendChild(btn("File record", "Who saved this copy, and when.", () => {
        if (!lock()) return; mark("record");
        const ul = el("ul"); for (const r of c.record) ul.appendChild(el("li", "", `${r.when} · ${r.who} · ${r.what}`));
        say(Echoes.clueText(c, "record", t0), ul);
      }, "btn ghost"));
      const verdicts = el("div", "verdicts");
      const decide = (v) => { if (!lock()) return; st.verdicts[st.i] = v; if (st.i < cases.length - 1) { st.i++; showCase(); table.scrollIntoView({ block: "nearest" }); } else finish(); };
      const real = btn(T({ cadet: "✓ Real", recruit: "✓ Real", operative: "✓ Real" }), set ? "Real: copy it home." : "Your verdict: this Echo is real.", () => decide(0), "btn ghost");
      const alt = btn(T({ cadet: "✗ Changed", recruit: "✗ Altered", operative: "✗ Altered" }), set ? "Altered: leave it behind." : "Your verdict: OMNI altered this Echo.", () => decide(1));
      verdicts.append(real, alt);
      let progress = null;
      if (set) { progress = el("div", "progress"); cases.forEach((_, k) => progress.appendChild(el("span", k < st.i ? "done" : k === st.i ? "now" : "", `${k + 1}. ${k < st.i ? (st.verdicts[k] ? "left behind" : "copied") : T(cases[k].title)}`))); side.appendChild(progress); }
      side.append(el("h3", "", `${set ? `Echo ${st.i + 1} of ${cases.length}: ` : ""}${T(c.title)}`), tools, clue, verdicts);
      table.append(photo, side);
    }

    function finish() {
      table.querySelectorAll("button").forEach((b) => (b.disabled = true));
      const choice = set ? Object.fromEntries(cases.map((_, k) => ["v" + (k + 1), st.verdicts[k]])) : { verdict: st.verdicts[0] };
      const run = { checked: set ? st.checked.map((s) => [...s]) : [...st.checked[0]] };
      const out = Missions.result(m, choice, run), ans = Missions.answer(m, choice), right = st.pred === ans;
      const prog = ls.get("cr-missions", {}), p = prog[m.id] || { tries: 0, firstRight: null, goal: false }; // this device only
      p.tries++; if (p.firstRight === null) p.firstRight = right; p.goal = p.goal || out.goal; prog[m.id] = p; ls.set("cr-missions", prog);
      Missions.send(m, st.pred, choice, run);
      result.innerHTML = "";
      const opt = Missions.options(m, t0).find((o) => o.value === st.pred), ansOpt = Missions.options(m, t0).find((o) => o.value === ans);
      result.appendChild(el("div", "verdict " + (right ? "good" : "bad"), `${T({ cadet: "Your guess", recruit: "Your first call", operative: "Your first call" })}: ${opt ? opt.label : "–"}. ${right ? T({ cadet: "You guessed right!", recruit: "Your first call was right.", operative: "Your first call held up." }) : `${T({ cadet: "It was", recruit: "The evidence says", operative: "The evidence says" })}: ${ansOpt.label}.`}`));
      const box = el("div");
      if (!set) Cards.explain(box, Echoes.explain(cases[0], st.verdicts[0], run.checked, t0), { glossary });
      else {
        const items = cases.map((c, k) => {
          const e = Echoes.explain(c, st.verdicts[k], run.checked[k], t0), proof = e.items.find((x) => x.tone === "bad");
          return { tone: e.right && e.backed ? "good" : "bad", title: `${k + 1}. ${T(c.title)}: ${Echoes.altered(c) ? T({ cadet: "changed", recruit: "altered", operative: "altered" }) : T({ cadet: "real", recruit: "real", operative: "real" })}${e.right ? "" : ` (you said ${st.verdicts[k] ? "altered" : "real"})`}`, text: `${proof ? proof.text : e.items[0].text}${e.right && !e.backed ? " " + T({ cadet: "Next time, look first.", recruit: "You decided before checking the clue that shows it.", operative: "Your verdict wasn't backed by the evidence you checked." }) : ""}`, terms: ["evidence"] };
        });
        const n = out.result.each.filter((r) => r.right && r.backed).length, wrongOne = cases.find((c, k) => !out.result.each[k].right || !out.result.each[k].backed);
        Cards.explain(box, { headline: { tone: out.goal ? "good" : "bad", text: out.goal ? T({ cadet: "All five checked! Only the real ones go home.", recruit: "All five right. Only the real Echoes leave the Archive.", operative: "Five for five, every verdict backed by evidence." }) : `${n} of ${cases.length} ${T({ cadet: "right, and checked first.", recruit: "right and backed by a clue you checked.", operative: "correct and supported by the evidence you checked." })}` }, items, tip: { text: wrongOne ? Echoes.explain(wrongOne, 1 - Echoes.altered(wrongOne), [], t0).tip.text : T({ cadet: "Great checking!", recruit: "Every Echo you carry home is the real past.", operative: "That's how a source gets verified." }) } }, { glossary });
      }
      result.appendChild(box);
      const acts = el("div", "acts"), i = ORDER.indexOf(m.id), next = ORDER[i + 1];
      acts.appendChild(btn("Try again", "Check this Echo again from your first call.", () => play(m.id), "btn ghost"));
      if (next) { const a = el("a", "btn", out.goal ? "Next Echo" : "Skip to the next Echo"); a.href = link(next); a.setAttribute("data-tip", `Open ${T(M[next].title)}.`); acts.appendChild(a); }
      const back = el("a", "btn ghost", "All Echoes"); back.href = "/echo"; back.setAttribute("data-tip", "Back to the list of Echoes."); acts.appendChild(back);
      result.appendChild(acts);
      result.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
    showCase();
  }

  Promise.all([get("/data/missions/index.json"), get("/data/echoes/index.json"), get("/data/echoes/sets.json"), get("/assets/story-assets.json"), get("/data/glossary.json")])
    .then(([mi, ei, sets, assets, gl]) => {
      A = assets.assets || {}; glossary = Object.fromEntries(gl.map((g) => [g.id, g]));
      return Promise.all([Promise.all(mi.map((id) => get(`/data/missions/${id}.json`))), Promise.all(ei.map((id) => get(`/data/echoes/${id}.json`)))]).then(([ms, cs]) => {
        Echoes.use(cs, sets); Missions.register("echo", Echoes.MISSION);
        for (const m of ms.filter((x) => x.game === "echo")) { M[m.id] = m; ORDER.push(m.id); }
      });
    })
    .then(() => {
      if (!simple()) { const im = new Image(); im.onload = () => document.body.classList.add("painted"); im.src = "/assets/scenes/archive.webp"; } // the Archive behind the desk, once its picture is on the site
      if (MID) play(MID); else list();
      window.__echo = { M, ORDER, play };
    })
    .catch(() => { intro("ECHO LAB", "Echo Lab didn't load", "Check your connection and refresh the page."); });
})();
