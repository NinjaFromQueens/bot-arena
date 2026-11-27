/*
 * Echo Lab's page (ECHO-1, ECHO-2; docs/echo-lab-plan.md). Free play shows every Echo mission as a print on the desk;
 * ?mission=<id> plays one at the Archive's desk: the Echo fills the screen, Ezra's brief and the first call
 * (Cards.predict; it locks on the first clue) sit beside it, and every check answers back. A tapped thing gets the
 * camera, a scan and a stamp (from Echoes.proofs, so it says what the clue text says) and goes up on the evidence
 * board; Show the light draws the shadow arrows and calls out the odd one; Compare copies opens a light table with
 * Blink; the File record (Operatives) types out OMNI's log. The verdict lands as a stamp, then the explain card.
 * A set (the Archive's last five) slides each Echo to Copy home or Leave behind and flips them all at the end.
 * Everything comes from the case data, so any new case gets it. Sound (StorySound) is off until the Sound button.
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
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KICK = { date: "A date that can't be right", shadow: "A shadow that doesn't match", copies: "Copies that disagree" };
  const SHORT = { date: "DATE CHECK", shadow: "SHADOW CHECK", copies: "COPY CHECK" };
  const S = window.StorySound || { init() {}, loop() {}, play() {}, synth() {}, beep() {}, button() {} };
  let A = {}, M = {}, ORDER = [], glossary = {}, cur = null;

  // a picture by asset ID once it's made (the asset list), or null for the labeled gray placeholder
  const resolve = (ref) => (typeof ref === "string" && ref.startsWith("/") ? ref : (A[ref] && A[ref].made && A[ref].file) || null);
  const simple = () => { try { const v = localStorage.getItem("cr-simple"); return v === "1" || (v == null && !!(navigator.connection && navigator.connection.saveData)); } catch { return false; } };
  const detail = (ref) => (!simple() && A[ref] && A[ref].made && A[ref].detail) || resolve(ref); // the sharper copy for the lens
  function placeholder(ref, label) { const ph = el("div", "ph"); ph.append(el("b", "", ref), el("span", "", label)); return ph; }
  const link = (mid) => `/echo?mission=${encodeURIComponent(mid)}${RUN ? "&run=" + encodeURIComponent(RUN) : ""}`;
  const teachesOf = (m) => { const c = Echoes.caseOf(m.setting); return c && c.teaches; };
  const picOf = (m) => { const set = Echoes.setOf(m.setting); return set ? set.cases.map((c) => c.picture) : [Echoes.caseOf(m.setting).picture]; };

  // the Archive's sound: the story's recordings by asset ID, existing ones and synthesized stand-ins until they're made
  const sound = {
    lens: () => S.play("sfx_echo_lens", { synth: "click", vol: 0.5 }),
    zoom: () => S.play("/assets/audio/sfx/whoosh.mp3", { vol: 0.3, max: 0.9 }),
    scan: () => S.play("sfx_echo_scan", { synth: "sweep", vol: 0.6 }),
    stamp: () => S.play("sfx_echo_stamp", { synth: "thud" }),
    proof: () => S.play("/assets/audio/sfx/glitch.mp3", { vol: 0.5, max: 1.2 }),
    tick: () => S.synth("tick"),
    blink: () => S.synth("blink"),
    paper: () => S.play("sfx_echo_paper", { stand: "/assets/audio/sfx/whoosh.mp3", vol: 0.35, max: 1 }),
    type: () => S.play("sfx_echo_type", { synth: "type", vol: 0.6 }),
    real: () => S.play("/assets/audio/sfx/enter.mp3", { vol: 0.55, max: 2 }),
    altered: () => S.play("/assets/audio/sfx/alarm.mp3", { vol: 0.22, max: 1.6 }),
  };
  const NOTES = { happy: "♪♪", excited: "♪!", sad: "…", curious: "♪?", thinking: "♪…" };
  function volt(feel) {
    S.beep(feel);
    const v = cur && cur.voltEl; if (!v) return;
    v.classList.remove("talk"); void v.offsetWidth; v.classList.add("talk");
    const old = v.querySelector(".bub"); if (old) old.remove();
    const b = el("span", "bub", NOTES[feel] || "♪"); v.appendChild(b); setTimeout(() => b.remove(), 1400);
  }

  function intro(kick, title, say) {
    const box = $("intro"); box.innerHTML = ""; box.hidden = false;
    box.append(el("span", "kick", kick), el("h2", "", title));
    if (say) { const p = el("p", "say"); p.append(el("b", "", "EZRA"), el("span", "", say)); box.appendChild(p); }
  }

  // ---- free play: every Echo mission as a print on the desk ----
  function list() {
    $("tolist").hidden = true;
    intro("ECHO LAB · THE ARCHIVE", "Real or altered?", T({ cadet: "OMNI changed some old pictures. Let's find the ones it changed.", recruit: "OMNI didn't only erase the past. It changed some of it. Check every Echo before we take it home.", operative: "OMNI edited some of these sources and left them where we'd find them. We check each one before it leaves the Archive." }));
    const main = $("main"); main.innerHTML = "";
    const prog = ls.get("cr-missions", {}), grid = el("div", "prints");
    ORDER.forEach((mid, i) => {
      const m = M[mid], t = teachesOf(m), done = !!(prog[mid] && prog[mid].goal), pics = picOf(m);
      const card = el("a", "print"); card.href = link(mid); card.setAttribute("data-tip", `Open ${T(m.title)}. Make your first call, then check the evidence.`);
      const pic = el("div", "pic" + (pics.length > 1 ? " stack" : "")), src = resolve(pics[0]);
      if (src) pic.style.backgroundImage = `url("${src}")`; else pic.appendChild(el("div", "ph", pics[0]));
      card.append(pic, el("span", "kick", t ? `PRACTICE ${i + 1} · ${KICK[t].toUpperCase()}` : `THE MISSION · ${pics.length} ECHOES`), el("h3", "", T(m.title)), el("p", "", Missions.text(m, "brief", tier())),
        el("span", "st", done ? "✓ Done" : prog[mid] ? `${prog[mid].tries} ${prog[mid].tries === 1 ? "try" : "tries"}` : "Not tried yet"), el("span", "btn go" + (done ? " ghost" : ""), done ? "Check it again" : "Start"));
      if (done) card.appendChild(el("span", "solved", "SOLVED"));
      grid.appendChild(card);
    });
    main.appendChild(grid);
  }

  // ---- one mission at the desk ----
  function play(mid) {
    const m = M[mid];
    if (!m) { intro("ECHO LAB", "That Echo isn't here", "Check the link, or pick one from the list."); return; }
    const set = Echoes.setOf(m.setting), cases = set ? set.cases : [Echoes.caseOf(m.setting)], t0 = tier();
    const st = { i: 0, checked: cases.map(() => new Set()), verdicts: [], pred: null, locked: false, busy: false };
    $("intro").hidden = true;
    const main = $("main"); main.innerHTML = "";
    const desk = el("div", "desk"), stagecol = el("div", "stagecol"), side = el("aside", "side"), result = el("div"); result.id = "result";
    desk.append(stagecol, side); main.append(desk, result);

    // the side: Volt, the case and Ezra's brief, the first call, the tools, the evidence board, the verdict
    const head = el("div", "casehead"), voltEl = el("div", "volt"), vimg = el("img"); vimg.src = "/assets/characters/volt/stage1_power.webp"; vimg.alt = "Volt";
    voltEl.appendChild(vimg);
    const ht = el("div"); ht.append(el("span", "kick", set ? "ECHO LAB · THE MISSION" : `ECHO LAB · ${SHORT[teachesOf(m)]}`), el("h2", "", T(m.title)));
    const brief = el("p"); brief.append(el("b", "", "Ezra: "), document.createTextNode(Missions.text(m, "brief", t0))); ht.appendChild(brief);
    head.append(voltEl, ht);
    const pbox = el("div"), strip = el("div", "strip"); strip.hidden = true;
    const pc = Cards.predict(pbox, { question: Missions.text(m, "question", t0), options: Missions.options(m, t0), go: "your first clue", kicker: "Your first call", onPick: (v) => (st.pred = v) });
    const tools = el("div", "tools"), board = el("div", "board"), bhd = el("div", "hd"), meter = el("div", "meter"), cards = el("div", "cards");
    bhd.append(el("b", "", "Evidence"), meter); board.append(bhd, cards);
    const piles = el("div", "piles"); piles.hidden = !set;
    const verdicts = el("div", "verdicts");
    side.append(head, pbox, strip, tools, board, piles, verdicts);
    cur = { m, st, voltEl, side };

    const lock = () => {
      if (st.locked) return true;
      if (st.pred == null) { pc.card.classList.remove("nudge"); void pc.card.offsetWidth; pc.card.classList.add("nudge"); pc.say(T({ cadet: "Make your guess first!", recruit: "Make your first call first. Then check the evidence.", operative: "Commit to a first call before you look at the evidence." })); volt("thinking"); return false; }
      st.locked = true; pc.lock();
      const opt = Missions.options(m, t0).find((o) => o.value === st.pred);
      strip.innerHTML = ""; strip.append(el("span", "", T({ cadet: "Your guess", recruit: "Your first call", operative: "Your first call" })), el("b", "", opt ? opt.label : "–"), document.createTextNode(" 🔒"));
      pbox.hidden = true; strip.hidden = false; volt("curious");
      return true;
    };

    let photo, cam, img, arrows, overlay, lensEl, clue, back, zoomT;
    function showCase() {
      const c = cases[st.i], seen = st.checked[st.i], proofs = Echoes.proofs(c), avail = Echoes.clues(c, t0);
      const mine = (c.copies || []).find((k) => k.id === c.checks);
      let shown = c.picture;
      stagecol.innerHTML = ""; tools.innerHTML = ""; cards.innerHTML = ""; verdicts.innerHTML = "";

      // the set's tray of five
      if (set) {
        const tray = el("div", "tray");
        cases.forEach((k, j) => { const s = el("span", j === st.i ? "now" : j < st.i ? (st.verdicts[j] ? "left" : "home") : ""); const src = resolve(k.picture); if (src) s.style.backgroundImage = `url("${src}")`; s.title = `${j + 1}. ${T(k.title)}`; tray.appendChild(s); });
        stagecol.appendChild(tray);
        const home = st.verdicts.filter((v) => v === 0).length, left = st.verdicts.filter((v) => v === 1).length;
        piles.innerHTML = ""; const a = el("div"), b = el("div");
        a.append(el("b", "", String(home)), document.createTextNode(T({ cadet: " going home", recruit: " to copy home", operative: " to copy home" })));
        b.append(el("b", "", String(left)), document.createTextNode(T({ cadet: " left behind", recruit: " to leave behind", operative: " to leave behind" })));
        piles.append(a, b);
      }

      // the photo: the camera (picture, arrows, circles), the overlay (scans and stamps), the lens, the clue box
      photo = el("div", "photo"); cam = el("div", "cam"); overlay = el("div", "overlay");
      const src = resolve(c.picture);
      if (src) { img = el("img"); img.alt = T(c.title); img.src = src; img.draggable = false; img.onerror = () => img.replaceWith(placeholder(c.picture, T(c.title))); cam.appendChild(img); }
      else { img = null; cam.appendChild(placeholder(c.picture, T(c.title))); }
      arrows = document.createElementNS("http://www.w3.org/2000/svg", "svg"); arrows.setAttribute("class", "arrows"); arrows.setAttribute("viewBox", "0 0 160 90"); arrows.setAttribute("preserveAspectRatio", "none"); arrows.setAttribute("aria-hidden", "true"); cam.appendChild(arrows);
      const label = el("span", "label", `${T({ cadet: "Says", recruit: "Saved as", operative: "Dated" })} ${c.year} · ${T(c.place)}`);
      clue = el("div", "cluebox"); clue.hidden = true; clue.setAttribute("aria-live", "polite");
      back = btn(T({ cadet: "Back", recruit: "Whole Echo", operative: "Whole Echo" }), "Zoom back out to the whole Echo.", () => zoomOut(), "btn ghost backbtn"); back.hidden = true;
      lensEl = el("div", "lens");
      photo.append(cam, overlay, lensEl, label, clue, back);
      stagecol.appendChild(photo);

      const spots = {};
      for (const it of c.items) {
        const s = el("button", "spot"); s.type = "button";
        s.style.left = it.x + "%"; s.style.top = it.y + "%"; s.style.width = it.r * 2 + "%";
        s.setAttribute("aria-label", T(it.name)); s.setAttribute("data-tip", `Look closer at ${T(it.name).toLowerCase()}.`);
        if (seen.has("item:" + it.id)) s.classList.add("seen"), proofs.some((p) => p.tell === "date" && p.item === it.id) && s.classList.add("bad");
        s.onclick = (e) => { e.stopPropagation(); inspect(it); };
        spots[it.id] = s; cam.appendChild(s);
      }
      photo.addEventListener("click", () => { if (photo.classList.contains("zoomed")) zoomOut(); });

      // ---- the lens: hover with a mouse, press and hold on a touch screen ----
      let lensSrc = null, holdT = null, held = false, eat = false, lensOn = !simple();
      const showLens = (e) => {
        if (!img || !lensOn || photo.classList.contains("zoomed") || photo.querySelector(".sheet")) return hideLens();
        const r = photo.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, Z = 2.5, half = 105;
        if (x < 0 || y < 0 || x > r.width || y > r.height) return hideLens();
        if (!lensSrc) { lensSrc = resolve(shown); const d = detail(shown); if (d && d !== lensSrc) { const pre = new Image(); pre.onload = () => { lensSrc = d; }; pre.src = d; } }
        lensEl.style.left = x + "px"; lensEl.style.top = y + "px";
        lensEl.style.backgroundImage = `url("${lensSrc}")`; lensEl.style.backgroundSize = `${r.width * Z}px ${r.height * Z}px`;
        lensEl.style.backgroundPosition = `${half - x * Z}px ${half - y * Z}px`;
        lensEl.classList.add("on");
      };
      const hideLens = () => lensEl.classList.remove("on");
      photo.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || held) showLens(e); });
      photo.addEventListener("pointerleave", hideLens);
      photo.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; clearTimeout(holdT); holdT = setTimeout(() => { held = true; eat = true; showLens(e); sound.lens(); }, 320); });
      const endHold = () => { clearTimeout(holdT); if (held) { held = false; hideLens(); } };
      photo.addEventListener("pointerup", endHold); photo.addEventListener("pointercancel", endHold);
      photo.addEventListener("click", (e) => { if (eat) { eat = false; e.stopPropagation(); e.preventDefault(); } }, true);
      const setShown = (ref) => { shown = ref; lensSrc = null; const s2 = resolve(ref); if (img && s2) img.src = s2; };

      // ---- the camera ----
      function zoomTo(x, y, r) {
        const s = clamp(40 / (2 * r), 1.7, 3), lim = 50 - 50 / s, tx = clamp(50 - x, -lim, lim), ty = clamp(50 - y, -lim, lim);
        cam.style.transform = `scale(${s}) translate(${tx}%, ${ty}%)`; photo.classList.add("zoomed"); hideLens(); back.hidden = false;
        return { s, px: 50 + s * (x + tx - 50), py: 50 + s * (y + ty - 50) };
      }
      function zoomOut() { clearTimeout(zoomT); if (!photo.classList.contains("zoomed")) return; cam.style.transform = ""; photo.classList.remove("zoomed"); overlay.innerHTML = ""; back.hidden = true; }
      const at = (cls, z, size, text) => { const e = el("div", cls, text); e.style.left = z.px + "%"; e.style.top = z.py + "%"; if (size) { e.style.width = size + "%"; e.style.aspectRatio = "1"; } overlay.appendChild(e); return e; };
      const say = (main, sub, top) => { clue.classList.toggle("top", !!top); photo.classList.toggle("clue-top", !!top); clue.innerHTML = ""; const x = btn("✕", "Hide this clue.", (e) => { e.stopPropagation(); clue.hidden = true; }, "btn ghost x"); x.style.padding = "2px 8px"; clue.append(x, el("div", "", main)); if (sub) clue.appendChild(sub); clue.hidden = false; };

      // ---- the evidence board ----
      const total = avail.length;
      function updateMeter() { meter.innerHTML = ""; for (let k = 0; k < total; k++) meter.appendChild(el("i", k < seen.size ? "on" : "")); meter.appendChild(document.createTextNode(` ${seen.size} of ${total}`)); }
      function card({ thumb, icon, title, chip, onclick }) {
        const empty = cards.querySelector(".empty"); if (empty) empty.remove();
        const b = el("button", "ev"); b.type = "button"; b.setAttribute("data-tip", "See this clue again.");
        const th = el("div", "th");
        if (thumb && thumb.src) { const W = 54, bw = W * 100 / (2 * thumb.r), bh = bw * 9 / 16; th.style.backgroundImage = `url("${thumb.src}")`; th.style.backgroundSize = `${bw}px ${bh}px`; th.style.backgroundPosition = `${-((thumb.x - thumb.r) / 100) * bw}px ${-(thumb.y / 100) * bh + W / 2}px`; }
        else th.textContent = icon || "?";
        const tx = el("div"); tx.append(el("div", "", title)); if (chip) tx.appendChild(el("span", "chip " + chip.tone, chip.text));
        b.append(th, tx); b.onclick = onclick; cards.prepend(b); updateMeter();
      }
      cards.appendChild(el("div", "empty", T({ cadet: "Tap the circles. What you find goes here.", recruit: "Tap a circle or use a tool. Every clue you check goes here.", operative: "Checked evidence is logged here." })));
      updateMeter();
      const mark = (id) => { const fresh = !seen.has(id); seen.add(id); return fresh; };

      // ---- a thing in the Echo: the camera, a scan, a stamp ----
      async function inspect(it) {
        if (st.busy || !lock()) return;
        st.busy = true; clearTimeout(zoomT);
        const fresh = mark("item:" + it.id), pr = proofs.find((p) => p.tell === "date" && p.item === it.id);
        sound.zoom(); const z = zoomTo(it.x, it.y, it.r), size = it.r * 2 * z.s;
        await wait(RM ? 0 : 480);
        if (!RM) { const ring = at("scanring", z, size); sound.scan(); await wait(650); ring.remove(); }
        const txt = pr ? T({ cadet: "✗ TOO NEW!", recruit: `✗ TOO NEW · ${pr.year}`, operative: `✗ ${pr.year} > ${c.year}` }) : T({ cadet: "✓ FITS!", recruit: `✓ FITS ${c.year}`, operative: `✓ FITS ${c.year}` });
        at("stamp " + (pr ? "bad" : "good"), z, 0, txt); sound.stamp();
        if (pr) { if (!RM && !simple()) at("glitch", z, size); setTimeout(sound.proof, 120); volt("excited"); }
        spots[it.id].classList.add("seen"); if (pr) spots[it.id].classList.add("bad");
        say(Echoes.clueText(c, "item:" + it.id, t0), null, z.py > 55);
        if (fresh) card({ thumb: { src: resolve(shown), x: it.x, y: it.y, r: it.r }, title: T(it.name), chip: { tone: pr ? "bad" : "good", text: txt }, onclick: () => inspect(it) });
        st.busy = false;
        zoomT = setTimeout(zoomOut, 2600);
      }

      // ---- Show the light: the shadow arrows, one by one, and the odd one called out ----
      async function showLight() {
        if (st.busy || !lock()) return;
        st.busy = true; zoomOut();
        const fresh = mark("light"); lightBtn.classList.add("used");
        const sun = ((c.light + 180) * Math.PI) / 180;
        photo.style.setProperty("--sx", clamp(50 + Math.cos(sun) * 62, -8, 108) + "%"); photo.style.setProperty("--sy", clamp(50 + Math.sin(sun) * 62, -8, 108) + "%");
        photo.classList.add("dusk"); arrows.innerHTML = "";
        const withShadow = c.items.filter((x) => x.shadow != null), step = RM ? 0 : 380;
        const lines = withShadow.map((it, k) => {
          const x = it.x * 1.6, y = it.y * 0.9, a = (it.shadow * Math.PI) / 180, Ln = 14, x2 = x + Math.cos(a) * Ln, y2 = y + Math.sin(a) * Ln;
          const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
          g.innerHTML = `<line class="ar" x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="2.6" stroke-linecap="round" style="animation-delay:${k * step}ms"/><line class="ar col" x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="#ffd36b" stroke-width="1.3" stroke-linecap="round" style="animation-delay:${k * step}ms"/><circle cx="${x2}" cy="${y2}" r="1.7" fill="#ffd36b" stroke="#111" stroke-width=".5" opacity="0"><animate attributeName="opacity" to="1" begin="${(k * step + 400) / 1000}s" dur=".01s" fill="freeze"/></circle>`;
          arrows.appendChild(g); if (!RM) setTimeout(sound.tick, k * step + 120);
          return { it, g, x2, y2 };
        });
        await wait(withShadow.length * step + (RM ? 0 : 500));
        let odd = 0;
        for (const { it, g, x2, y2 } of lines) {
          const off = Math.round(Echoes.apart(it.shadow, c.light)), bad = off > Echoes.SHADOW_SLACK;
          if (bad) { odd++; g.querySelectorAll(".col, circle").forEach((n) => { n.setAttribute("stroke", n.tagName === "circle" ? "#111" : "#ff5d5d"); if (n.tagName === "circle") n.setAttribute("fill", "#ff5d5d"); }); }
          const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
          tx.setAttribute("x", x2 + 2.4); tx.setAttribute("y", y2 + 1.4); tx.setAttribute("font-size", "4.2"); tx.setAttribute("fill", bad ? "#ff6b6b" : "#ffd36b");
          tx.textContent = bad ? T({ cadet: "✗ wrong way", recruit: `✗ about ${off}° off`, operative: `✗ ${off}° off` }) : "✓"; g.appendChild(tx);
        }
        const low = lines.filter(({ it }) => Echoes.apart(it.shadow, c.light) > Echoes.SHADOW_SLACK); say(Echoes.clueText(c, "light", t0), null, (low.length ? low : lines).some(({ it }) => it.y > 50));
        const agree = withShadow.length - odd;
        if (fresh) card({ icon: "☀", title: T({ cadet: "The shadows", recruit: "The light", operative: "The light" }), chip: odd ? { tone: "bad", text: T({ cadet: `${odd} points the wrong way`, recruit: `${agree} agree · ${odd} off`, operative: `${agree} agree · ${odd} off` }) } : { tone: "good", text: T({ cadet: "All the same way", recruit: "Every shadow agrees", operative: "Every shadow agrees" }) }, onclick: () => showLight() });
        if (odd) { sound.proof(); volt("excited"); } else volt("thinking");
        setTimeout(() => photo.classList.remove("dusk"), RM ? 2500 : 3800);
        st.busy = false;
      }

      // ---- Compare copies: the light table, and Blink ----
      function closeSheet() { const s = photo.querySelector(".sheet"); if (s) s.remove(); }
      function showCopies() {
        if (st.busy || !lock()) return;
        zoomOut(); closeSheet(); const fresh = mark("copies"); copiesBtn.classList.add("used"); sound.paper();
        const copies = c.copies || [], key = mine && Object.keys(mine.shows || {})[0], it = key && c.items.find((x) => x.id === key);
        const n = {}; for (const k of copies) n[k.shows[key]] = (n[k.shows[key]] || 0) + 1;
        const top = Object.entries(n).sort((a, b) => b[1] - a[1]), most = top[0] && top[0][0], clear = top[0] && top[0][1] > (top[1] ? top[1][1] : 0);
        const proof = proofs.find((p) => p.tell === "copies");
        const sheet = el("div", "sheet"), h = el("h3", "", T({ cadet: "All the copies", recruit: "The light table: every copy", operative: "The light table: every copy" }));
        h.appendChild(btn("✕", "Close the light table.", (e) => { e.stopPropagation(); sheet.remove(); }, "btn ghost"));
        const lead = el("p", "lead", Echoes.clueText(c, "copies", t0));
        const grid = el("div", "table3");
        for (const k of copies) {
          const isMine = k.id === c.checks, isOdd = clear && k.shows[key] !== most;
          const box = el("div", "copy" + (isMine ? " mine" : "") + (isOdd ? " odd" : "")), th = el("div", "thumb"), s2 = resolve(k.picture);
          if (s2) th.style.backgroundImage = `url("${s2}")`; else th.appendChild(placeholder(k.picture, ""));
          if (it) { const ring = el("span", "ring"); ring.style.left = it.x + "%"; ring.style.top = it.y + "%"; ring.style.width = it.r * 2 + "%"; th.appendChild(ring); }
          if (isMine) box.appendChild(el("span", "tag", T({ cadet: "This copy", recruit: "Checking this one", operative: "Under review" })));
          box.append(th, el("b", "", k.server), el("small", "", `saved ${k.saved}`), el("div", "shows", Object.entries(k.shows).map(([kk, v]) => `${kk[0].toUpperCase() + kk.slice(1)}: ${v}`).join(" · ")));
          grid.appendChild(box);
        }
        const acts = el("div", "acts");
        if (top.length) acts.appendChild(el("span", "", clear ? T({ cadet: `${top[0][1]} of ${copies.length} copies show ${most}.`, recruit: `${top[0][1]} of ${copies.length} copies show ${most}.`, operative: `${top[0][1]} of ${copies.length} show ${most}.` }) : T({ cadet: "The copies don't agree, so they can't tell us.", recruit: "No version has a clear majority, so the copies prove nothing.", operative: "No clear majority: the copies are inconclusive." })));
        const other = mine && copies.find((k) => clear && k.shows[key] === most && k.picture !== mine.picture);
        if (mine && other && img) acts.appendChild(btn(RM ? T({ cadet: "See the other copy", recruit: "Flip to the other copy", operative: "Flip to the other copy" }) : "Blink", "Flip the big picture between this copy and the copy most others agree with, so the difference jumps out.", async (e) => {
          e.stopPropagation(); sheet.remove();
          if (RM) { setShown(shown === mine.picture ? other.picture : mine.picture); label.textContent = shown === mine.picture ? `${T({ cadet: "This copy", recruit: "Checking", operative: "Under review" })} · ${mine.server}` : `${other.server} · saved ${other.saved}`; return; }
          for (let k = 0; k < 8; k++) { setShown(k % 2 ? mine.picture : other.picture); label.textContent = k % 2 ? `${mine.server} · saved ${mine.saved}` : `${other.server} · saved ${other.saved}`; sound.blink(); await wait(430); }
          setShown(mine.picture); label.textContent = `${T({ cadet: "Says", recruit: "Saved as", operative: "Dated" })} ${c.year} · ${T(c.place)}`;
        }));
        sheet.append(h, el("div"), acts); sheet.children[1].append(lead, grid);
        sheet.addEventListener("click", (e) => e.stopPropagation());
        photo.appendChild(sheet);
        say(Echoes.clueText(c, "copies", t0));
        if (fresh) card({ icon: "🗂", title: T({ cadet: "The copies", recruit: "Compare copies", operative: "Compare copies" }), chip: proof ? { tone: "bad", text: T({ cadet: "This one doesn't match", recruit: `Most show ${proof.most}`, operative: `Majority: ${proof.most}` }) } : { tone: clear ? "good" : "info", text: clear ? T({ cadet: "They match", recruit: "The copies agree", operative: "Consistent" }) : T({ cadet: "Can't tell", recruit: "No clear majority", operative: "Inconclusive" }) }, onclick: () => showCopies() });
        if (proof) setTimeout(() => { sound.proof(); volt("excited"); }, 500);
      }

      // ---- the File record (Operatives): OMNI's log, typed out ----
      async function showRecord() {
        if (st.busy || !lock()) return;
        st.busy = true; zoomOut(); closeSheet(); const fresh = mark("record"); recordBtn.classList.add("used");
        const bad = new Set(proofs.filter((p) => p.tell === "record").map((p) => p.entry));
        const sheet = el("div", "sheet"), h = el("h3", "", "File record"); h.appendChild(btn("✕", "Close the file record.", (e) => { e.stopPropagation(); sheet.remove(); }, "btn ghost"));
        const term = el("div", "term"); term.appendChild(el("div", "hd", "OMNI ARCHIVE · FILE RECORD"));
        sheet.append(h, term, el("p", "lead", Echoes.clueText(c, "record", t0))); sheet.addEventListener("click", (e) => e.stopPropagation());
        photo.appendChild(sheet);
        for (const [k, r] of (c.record || []).entries()) {
          const ln = el("div", "ln cur" + (bad.has(k) ? " bad" : "")), text = `${r.when} · ${r.who} · ${r.what}${bad.has(k) ? "  ← edited after 2046" : ""}`;
          term.appendChild(ln); sound.type();
          if (RM) ln.textContent = text; else for (let j = 1; j <= text.length; j += 2) { ln.textContent = text.slice(0, j); await wait(14); }
          ln.textContent = text; ln.classList.remove("cur");
        }
        say(Echoes.clueText(c, "record", t0));
        if (fresh) card({ icon: "📁", title: "File record", chip: bad.size ? { tone: "bad", text: "Edited after 2046" } : { tone: "good", text: "No late edits" }, onclick: () => showRecord() });
        if (bad.size) { sound.proof(); volt("excited"); }
        st.busy = false;
      }

      // ---- the tools ----
      const tool = (ic, text, tip, fn) => { const b = btn("", tip, fn, "tool"); b.append(el("span", "ic", ic), el("span", "", text)); tools.appendChild(b); return b; };
      const lightBtn = avail.includes("light") ? tool("☀", T({ cadet: "Shadows", recruit: "Show the light", operative: "Show the light" }), "Draw an arrow on every shadow, showing which way it points.", showLight) : null;
      const copiesBtn = avail.includes("copies") ? tool("🗂", T({ cadet: "Copies", recruit: "Compare copies", operative: "Compare copies" }), "Lay every copy of this Echo side by side.", showCopies) : null;
      const recordBtn = avail.includes("record") ? tool("📁", "File record", "Who saved this copy, and when.", showRecord) : null;
      if (img) {
        const lb = tool("🔍", T({ cadet: "Magnifier", recruit: "Lens", operative: "Lens" }), "Turn the magnifying lens on or off. With a mouse it follows the pointer; on a touch screen, press and hold.", () => { lensOn = !lensOn; lb.setAttribute("aria-pressed", String(lensOn)); if (lensOn) sound.lens(); else hideLens(); });
        lb.setAttribute("aria-pressed", String(lensOn));
      }
      for (const [b, id] of [[lightBtn, "light"], [copiesBtn, "copies"], [recordBtn, "record"]]) if (b && seen.has(id)) b.classList.add("used");

      // ---- the verdict ----
      const decide = async (v) => {
        if (st.busy || !lock()) return;
        st.busy = true; zoomOut(); closeSheet(); clue.hidden = true;
        st.verdicts[st.i] = v;
        const stamp = el("div", "bigstamp " + (v ? "bad" : "good"));
        if (set) stamp.appendChild(el("small", "", v ? T({ cadet: "Leave it", recruit: "Leave behind", operative: "Leave behind" }) : T({ cadet: "Take it home", recruit: "Copy home", operative: "Copy home" })));
        stamp.appendChild(document.createTextNode(v ? T({ cadet: "✗ CHANGED", recruit: "✗ ALTERED", operative: "✗ ALTERED" }) : "✓ REAL"));
        photo.appendChild(stamp); sound.stamp();
        if (!set) {
          const truth = Echoes.altered(c) ? 1 : 0;
          await wait(RM ? 300 : 750);
          if (truth !== v) { const s2 = el("div", "bigstamp second " + (truth ? "bad" : "good")); s2.append(el("small", "", T({ cadet: "It was", recruit: "The evidence says", operative: "The evidence says" })), document.createTextNode(truth ? T({ cadet: "CHANGED", recruit: "ALTERED", operative: "ALTERED" }) : "REAL")); photo.appendChild(s2); sound.stamp(); }
          (truth ? sound.altered : sound.real)();
          await wait(RM ? 200 : 700);
          st.busy = false; finish();
        } else {
          await wait(RM ? 250 : 650);
          if (!RM) { photo.classList.add(v ? "slideout-r" : "slideout-l"); sound.paper(); await wait(560); }
          st.busy = false;
          if (st.i < cases.length - 1) { st.i++; showCase(); } else { showCase(); finish(); }
        }
      };
      const real = btn("✓ Real", set ? "Real: copy it home." : "Your verdict: this Echo is real.", () => decide(0), "btn ghost");
      const alt = btn(T({ cadet: "✗ Changed", recruit: "✗ Altered", operative: "✗ Altered" }), set ? "Altered: leave it behind." : "Your verdict: OMNI altered this Echo.", () => decide(1));
      verdicts.append(real, alt);
      if (set && st.verdicts.length === cases.length) verdicts.querySelectorAll("button").forEach((b) => (b.disabled = true));
      cur.zoomOut = zoomOut; cur.closeSheet = closeSheet; cur.inspect = inspect; cur.showLight = showLight; cur.showCopies = showCopies; cur.showRecord = showRecord;
    }

    function finish() {
      side.querySelectorAll("button").forEach((b) => (b.disabled = true));
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
      if (!set) {
        const e = Echoes.explain(cases[0], st.verdicts[0], run.checked, t0);
        Cards.explain(box, e, { glossary });
        setTimeout(() => volt(e.right ? (e.backed ? "happy" : "thinking") : "sad"), 200);
      } else {
        const reveal = el("div", "reveal");
        cases.forEach((c, k) => {
          const e = Echoes.explain(c, st.verdicts[k], run.checked[k], t0), truth = Echoes.altered(c);
          const rv = el("div", "rv"), face = el("div", "face"), pic = el("div", "pic"), s2 = resolve(c.picture);
          rv.style.animationDelay = (RM ? 0 : k * 160) + "ms";
          if (s2) pic.style.backgroundImage = `url("${s2}")`;
          pic.appendChild(el("span", "mini " + (truth ? "bad" : "good"), truth ? T({ cadet: "CHANGED", recruit: "ALTERED", operative: "ALTERED" }) : "REAL"));
          face.append(pic, el("div", "cap", `${k + 1}. ${T(c.title)}: ${e.right && e.backed ? "✓ " + T({ cadet: "you got it", recruit: "right, with a clue", operative: "correct and backed" }) : e.right ? "✓ " + T({ cadet: "right, but look first", recruit: "right, but not backed", operative: "correct, not backed" }) : "✗ " + T({ cadet: "missed", recruit: `you said ${st.verdicts[k] ? "altered" : "real"}`, operative: `you said ${st.verdicts[k] ? "altered" : "real"}` })}`));
          rv.appendChild(face); reveal.appendChild(rv);
        });
        result.appendChild(reveal);
        const items = cases.map((c, k) => {
          const e = Echoes.explain(c, st.verdicts[k], run.checked[k], t0), proof = e.items.find((x) => x.tone === "bad");
          return { tone: e.right && e.backed ? "good" : "bad", title: `${k + 1}. ${T(c.title)}: ${Echoes.altered(c) ? T({ cadet: "changed", recruit: "altered", operative: "altered" }) : T({ cadet: "real", recruit: "real", operative: "real" })}${e.right ? "" : ` (you said ${st.verdicts[k] ? "altered" : "real"})`}`, text: `${proof ? proof.text : e.items[0].text}${e.right && !e.backed ? " " + T({ cadet: "Next time, look first.", recruit: "You decided before checking the clue that shows it.", operative: "Your verdict wasn't backed by the evidence you checked." }) : ""}`, terms: ["evidence"] };
        });
        const n = out.result.each.filter((r) => r.right && r.backed).length, wrongOne = cases.find((c, k) => !out.result.each[k].right || !out.result.each[k].backed);
        Cards.explain(box, { headline: { tone: out.goal ? "good" : "bad", text: out.goal ? T({ cadet: "All five checked! Only the real ones go home.", recruit: "All five right. Only the real Echoes leave the Archive.", operative: "Five for five, every verdict backed by evidence." }) : `${n} of ${cases.length} ${T({ cadet: "right, and checked first.", recruit: "right and backed by a clue you checked.", operative: "correct and supported by the evidence you checked." })}` }, items, tip: { text: wrongOne ? Echoes.explain(wrongOne, 1 - Echoes.altered(wrongOne), [], t0).tip.text : T({ cadet: "Great checking!", recruit: "Every Echo you carry home is the real past.", operative: "That's how a source gets verified." }) } }, { glossary });
        setTimeout(() => volt(out.goal ? "happy" : n >= 3 ? "thinking" : "sad"), 300);
      }
      result.appendChild(box);
      const acts = el("div", "acts"), i = ORDER.indexOf(m.id), next = ORDER[i + 1];
      acts.appendChild(btn("Try again", "Check this Echo again from your first call.", () => play(m.id), "btn ghost"));
      if (next) { const a = el("a", "btn", out.goal ? "Next Echo" : "Skip to the next Echo"); a.href = link(next); a.setAttribute("data-tip", `Open ${T(M[next].title)}.`); acts.appendChild(a); }
      const backA = el("a", "btn ghost", "All Echoes"); backA.href = "/echo"; backA.setAttribute("data-tip", "Back to the desk of Echoes."); acts.appendChild(backA);
      result.appendChild(acts);
      result.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" });
    }
    document.onkeydown = (e) => { if (e.key === "Escape" && cur) { cur.closeSheet && cur.closeSheet(); cur.zoomOut && cur.zoomOut(); } };
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
      S.init(A); S.button($("snd"));
      S.loop("music", "music_archive", { kind: "music" }); // the Archive theme once it's made (S2: Echo Lab is Episode 1's mission 5)
      S.loop("ambience", "amb_archive", { kind: "ambience", stand: "/assets/audio/ambient/tunnels.mp3" }); // the old tunnels' hum until the Archive's own
      if (MID) play(MID); else list();
      window.__echo = { M, ORDER, play, get cur() { return cur; } };
    })
    .catch(() => { intro("ECHO LAB", "Echo Lab didn't load", "Check your connection and refresh the page."); });
})();
