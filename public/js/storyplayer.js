/*
 * The story player (docs/platform-flow-spec.md section 5, docs/story-media-plan.md "The story player"): plays a scene
 * file one line at a time over its shots (painted stills with a slow camera move and parallax layers, or video clips),
 * with the speaker's picture and name in the story's dialog frame. Browser only (window.StoryPlayer). The mission
 * runner uses it for one student; Mission Control plays it on the projector (o.big). Text is set with textContent and
 * always shows (it's the caption), so scenes work with sound off. Skipping counts as watched: a scene is story, not a test.
 * Art and sound are paths under /assets/ or asset IDs from /assets/story-assets.json. Anything not made yet shows a
 * labeled placeholder (or plays nothing), so scenes can be written and timed before the art exists. Sound stays off
 * until the player's Sound button turns it on (cr-story-sound on the device). With ?animatic in the address (EP1-3),
 * lines without a voice file are read by the browser's voice and the scene moves on by itself, to check timing for free.
 * A reply line (kind "reply") is the student's own: they pick one of its short replies, shown with their recruit and call
 * sign from the map (cr-recruit, cr-callsign). Season 1 has no branches, so every reply leads to the same next line.
 */
(function () {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MOVES = { push: "spPush", pull: "spPull", "pan-left": "spPanL", "pan-right": "spPanR", drift: "spDrift" }; // CSS keyframes in style.css
  const VOL = { music: 0.42, musicDuck: 0.16, amb: 0.3, ambDuck: 0.12, sfx: 0.5 }; // the tour's levels, approved by ear
  const FADE = 1.5; // seconds of crossfade where a music loop comes round
  // Volt's feelings as square-wave beeps ([hertz, seconds], 0 = a rest) until the recorded feeling sounds exist
  const BEEPS = {
    happy: [[660, 0.09], [880, 0.09], [1100, 0.15]], sad: [[620, 0.2], [500, 0.2], [380, 0.32]],
    curious: [[700, 0.09], [920, 0.09], [660, 0.09], [1040, 0.17]], scared: [[900, 0.05], [960, 0.05], [900, 0.05], [960, 0.05], [900, 0.05], [960, 0.05]],
    excited: [[880, 0.06], [1100, 0.06], [1320, 0.06], [1100, 0.06], [1320, 0.13]], thinking: [[500, 0.14], [0, 0.08], [530, 0.14], [0, 0.08], [570, 0.2]],
  };
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  function simpleGfx() { const v = store.get("cr-simple"); return v === "1" || v === "0" ? v === "1" : !!(navigator.connection && navigator.connection.saveData); } // Engine.simpleGfx's rule; engine.js isn't loaded on story pages
  const start = (a) => { const p = a.play(); if (p && p.catch) p.catch(() => {}); return p; };
  const textAt = (v, t) => (v && typeof v === "object" ? (v[t] != null ? v[t] : v.recruit) : v);

  // a path is used as it is; an asset ID becomes its file once it's made (null: show a placeholder, or play nothing)
  function resolve(ref, assets) {
    if (typeof ref !== "string" || !ref) return null;
    if (ref.startsWith("/")) return ref;
    const a = assets && assets[ref];
    return a && a.made && a.file ? a.file : null;
  }
  const getJSON = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(u + " " + r.status))));
  let assetList = null;
  const assets = () => assetList || (assetList = getJSON("/assets/story-assets.json").then((d) => d.assets || {}, () => ({})));
  const scenes = new Map();
  function load(id) {
    if (!scenes.has(id)) scenes.set(id, getJSON(`/data/scenes/${id}.json`).catch((e) => { scenes.delete(id); throw e; }));
    return scenes.get(id);
  }
  const shotsOf = (sc) => (Array.isArray(sc.shots) && sc.shots.length ? sc.shots : sc.bg ? [{ kind: "still", art: sc.bg }] : []); // an older scene's bg is one still
  function at(sc, k, key, first) { let v = first; for (let j = 0; j <= k; j++) if (sc.lines[j] && key in sc.lines[j]) v = sc.lines[j][key]; return v; } // what's in effect at line k
  const warm = (src) => { if (src) new Image().src = src; };

  // fetch a scene and its first picture before it's needed (one scene at a time, so a Chromebook isn't loading an episode)
  function preload(id) {
    return Promise.all([load(id), assets()]).then(([sc, A]) => { const s = shotsOf(sc)[0]; if (s) warm(resolve(s.kind === "video" ? s.poster : s.art, A)); return sc; }).catch(() => null);
  }
  // fetch and play a scene by its id; resolves once it's playing, rejects if the scene didn't load
  function open(id, o) { return Promise.all([load(id), assets()]).then(([sc, A]) => play(sc, Object.assign({ assets: A }, o))); }

  // o: { characters, text(value) -> string, tier, assets, big, tts, onDone() }
  function play(scene, o) {
    const old = document.querySelector(".sp-overlay"); if (old) { if (old._stop) old._stop(); else old.remove(); }
    const A = o.assets || {}, tier = o.tier || (window.Tier ? Tier.current() : "recruit"), T = o.text || ((v) => textAt(v, tier));
    const lines = scene.lines, shots = shotsOf(scene);
    const tts = o.tts != null ? !!o.tts : /[?&]animatic(?=[&=]|$)/.test(location.search);
    const audible = tts || !!(scene.music || scene.ambience) || lines.some((l) => l.voice || (l.sfx && l.sfx.length) || l.kind === "beeps" || l.music);
    const wrap = el("div", "sp-overlay" + (o.big ? " big" : "")); wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true"); wrap.setAttribute("aria-label", "Story scene");
    const bg = el("div", "sp-bg"), faceBox = el("div", "sp-face");
    const box = el("div", "sp-box"), name = el("b", "sp-name"), text = el("p", "sp-text"); text.setAttribute("aria-live", "polite");
    const ctl = el("div", "sp-ctl"), count = el("span", "sp-count");
    const snd = el("button", "btn ghost sp-snd"), back = el("button", "btn ghost", "Back"), skip = el("button", "btn ghost", "Skip"), next = el("button", "btn", "Next");
    for (const b of [snd, back, skip, next]) b.type = "button";
    snd.setAttribute("data-tip", "Turn the scene's voices, music and sounds on or off. The words always show.");
    back.setAttribute("data-tip", "Show the line before. The left arrow works too.");
    skip.setAttribute("data-tip", "Skip to the end of this scene. It still counts as watched.");
    next.setAttribute("data-tip", "Show the next line. Space, Enter or the right arrow work too.");
    snd.hidden = !audible;
    const replies = el("div", "sp-replies"); replies.setAttribute("role", "group"); replies.setAttribute("aria-label", "Your reply"); replies.hidden = true;
    ctl.append(count, snd, back, skip, next); box.append(name, text, replies, ctl);
    wrap.append(bg, faceBox, box);
    if (tts) wrap.appendChild(el("span", "sp-chip", "ANIMATIC"));
    document.body.appendChild(wrap);
    let i = -1, finished = false, stopped = false, tok = 0, autoT = null;
    const picked = {}; // line number -> the reply the student picked
    const me = { pic: store.get("cr-recruit"), sign: store.get("cr-callsign") }; // the student's recruit, picked on the map
    const myFace = /^[a-f]$/.test(me.pic || "") ? el("img") : null;
    if (myFace) { myFace.src = `/assets/characters/recruit/${me.pic}.webp`; myFace.alt = "Your recruit"; myFace.onerror = () => myFace.remove(); }

    // ---- shots ----
    const shotEls = []; let shotNow = -1;
    function placeholder(d, ref, note) {
      if (d.querySelector(".sp-ph")) return;
      const ph = el("div", "sp-ph"); ph.append(el("b", "", String(ref || "no art"))); if (note) ph.append(el("span", "", T(note)));
      d.appendChild(ph);
    }
    function picture(d, ref, k, note) { // one painted layer; the base picture (k 1) gets a placeholder when it's missing
      const a = el("div", "sp-art"), src = resolve(ref, A);
      if (k !== 1) a.style.setProperty("--k", k);
      const bad = () => (k === 1 ? placeholder(d, ref, note) : d.appendChild(el("span", "sp-missing", String(ref))));
      if (src) { const im = new Image(); im.onload = () => (a.style.backgroundImage = `url("${src}")`); im.onerror = bad; im.src = src; } else bad();
      return a;
    }
    function shotEl(k) {
      if (shotEls[k]) return shotEls[k];
      const s = shots[k], d = el("div", "sp-shot" + (s.look ? " look-" + s.look : ""));
      if (s.kind === "video") {
        const src = resolve(s.art, A), poster = s.poster ? picture(d, s.poster, 1, s.note) : null;
        if (poster) d.appendChild(poster);
        if (src && !RM && !simpleGfx()) { // reduced motion and Simple graphics see the still, like the tour
          const v = document.createElement("video"); v.className = "sp-vid"; v.muted = true; v.playsInline = true; v.preload = "auto"; v.loop = !!s.loop;
          v.setAttribute("aria-hidden", "true"); v.onerror = () => { v.remove(); if (!poster) placeholder(d, s.art, s.note); };
          v.src = src; d.appendChild(v); d._vid = v;
        } else if (!src && poster) d.appendChild(el("span", "sp-missing", `${s.art} (clip not made yet)`));
        else if (!poster) placeholder(d, s.art, s.note);
      } else {
        if (MOVES[s.move]) d.style.setProperty("--mv", MOVES[s.move]);
        if (s.secs > 0) d.style.setProperty("--secs", s.secs + "s");
        d.appendChild(picture(d, s.art, 1, s.note));
        (s.layers || []).forEach((l, j) => d.appendChild(picture(d, l, Math.min(1.8, 1 + 0.4 * (j + 1)), null))); // nearer layers move more
      }
      if (s.look === "camera") { const lk = el("div", "sp-look"); lk.append(el("b", "", "● REC")); if (s.stamp) lk.append(el("span", "", T(s.stamp))); d.appendChild(lk); }
      return (shotEls[k] = d);
    }
    function showShot(k) {
      if (k === shotNow || !shots[k]) return;
      const prev = shotEls[shotNow], d = shotEl(k); shotNow = k;
      bg.appendChild(d); void d.offsetWidth; d.classList.add("on"); // the new shot fades in on top
      d.classList.remove("run"); void d.offsetWidth; d.classList.add("run"); // and its camera move starts over
      if (prev) { prev.classList.remove("on"); if (prev._vid) prev._vid.pause(); }
      if (d._vid) { try { d._vid.currentTime = 0; } catch {} start(d._vid); }
    }

    // ---- faces ----
    const faces = {}; // one picture per character face, reused across lines
    function faceFor(ln) {
      const c = (o.characters || {})[ln.who] || { name: ln.who, faces: {} }, src = c.faces[ln.face], key = ln.who + ":" + ln.face;
      if (!faces[key]) {
        if (src) { const img = el("img"); img.alt = c.name; img.src = src; img.onerror = () => { const ph = el("span", "sp-missing", src); img.replaceWith(ph); faces[key] = ph; }; faces[key] = img; }
        else faces[key] = el("span", "sp-missing", `${ln.who} (${ln.face})`);
      }
      return { node: faces[key], name: c.name };
    }

    // ---- sound: one voice player, music and ambience on two players each (crossfaded at the loop), cues on their own ----
    let soundOn = audible && (tts || store.get("cr-story-sound") === "1");
    const voice = new Audio(); voice.preload = "auto";
    let actx = null, beepUntil = 0, ticker = null;
    const chans = { music: { els: [new Audio(), new Audio()], on: 0, src: null, loop: null }, amb: { els: [new Audio(), new Audio()], on: 0, src: null, loop: null } };
    const talking = () => (!voice.paused && !voice.ended) || (window.speechSynthesis && speechSynthesis.speaking) || (actx && actx.currentTime < beepUntil);
    function track(c, ref) {
      const src = resolve(ref, A); if (src === c.src) return;
      c.src = src; c.loop = (typeof ref === "string" && A[ref] && A[ref].loop) || null; // loop points come from the asset list
      if (src) { c.on = 1 - c.on; const a = c.els[c.on]; a.src = src; a.loop = true; a.volume = 0; try { a.currentTime = 0; } catch {} }
    }
    function tick() {
      const talk = talking();
      for (const [k, c] of Object.entries(chans)) {
        const a = c.els[c.on];
        if (c.src && !a.paused && a.duration > 0) { // come round to the loop start with a crossfade instead of a jump
          const from = c.loop ? c.loop.start || 0 : 0, to = c.loop && c.loop.end ? Math.min(c.loop.end, a.duration) : a.duration;
          if (to - from > FADE * 3 && a.currentTime >= to - FADE) { c.on = 1 - c.on; const b = c.els[c.on]; b.src = c.src; b.loop = true; b.volume = 0; try { b.currentTime = from; } catch {} }
        }
        c.els.forEach((e, j) => {
          const t = soundOn && c.src && j === c.on ? (talk ? VOL[k + "Duck"] : VOL[k]) : 0;
          if (t > 0 && e.paused && !(e._tried > Date.now() - 1000)) { e._tried = Date.now(); start(e); } // a phone may refuse until the next tap
          const v = e.volume, nv = Math.abs(t - v) < 0.02 ? t : v + (t - v) * 0.12;
          e.volume = Math.max(0, Math.min(1, nv));
          if (t === 0 && e.volume === 0 && !e.paused) e.pause();
        });
      }
    }
    const kick = () => { for (const c of Object.values(chans)) for (const e of c.els) e._tried = 0; tick(); }; // inside a tap, so phones allow it
    function beep(feel) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      if (!actx) actx = new AC(); if (actx.state === "suspended") actx.resume();
      const out = actx.createGain(); out.gain.value = 0.06; out.connect(actx.destination);
      let t = actx.currentTime + 0.03;
      for (const [f, d] of BEEPS[feel] || BEEPS.curious) {
        if (f) {
          const osc = actx.createOscillator(), g = actx.createGain(); osc.type = "square"; osc.frequency.value = f;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.01); g.gain.setValueAtTime(1, t + d - 0.02); g.gain.linearRampToValueAtTime(0, t + d);
          osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + d);
        }
        t += d + 0.03;
      }
      beepUntil = t; return (t - actx.currentTime) * 1000;
    }
    function say(ln, my) { // the animatic's stand-in voice: the browser's own, a different pitch for each speaker
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(T(ln.text)); let h = 0;
      for (const ch of ln.who || "narrator") h = (h * 31 + ch.charCodeAt(0)) % 997;
      u.pitch = 0.7 + (h % 7) / 10; u.onend = () => lineDone(my, 700);
      speechSynthesis.speak(u);
    }
    function voiceFor(ln) { // this level's recording, or the Recruit one when this level's words are the same (story-media-plan decision 4)
      const v = typeof ln.voice === "string" ? { recruit: ln.voice } : ln.voice || {};
      if (v[tier]) return resolve(v[tier], A);
      return v.recruit && T(ln.text) === textAt(ln.text, "recruit") ? resolve(v.recruit, A) : null;
    }
    function lineSound(ln, my) {
      voice.pause(); if (window.speechSynthesis) speechSynthesis.cancel();
      if (!soundOn) return;
      for (const r of ln.sfx || []) { const s = resolve(r, A); if (s) { const a = new Audio(s); a.volume = VOL.sfx; start(a); } }
      const src = voiceFor(ln);
      if (src) { voice.src = src; voice.onended = () => lineDone(my, 700); start(voice); }
      else if (ln.kind === "beeps" && !(ln.sfx && ln.sfx.length)) beep(ln.feel);
      else if (tts && ln.kind !== "beeps" && ln.text) say(ln, my);
    }
    // the animatic moves on by itself: ms after a line's sound ends, or after its reading time, but never while a sound
    // still plays (and a voice that fails to play can't stall it)
    function lineDone(my, ms) {
      if (!tts || my !== tok) return; clearTimeout(autoT);
      autoT = setTimeout(function check() { if (my !== tok || stopped) return; if (talking()) autoT = setTimeout(check, 400); else advance(); }, ms);
    }

    function sndLabel() { snd.textContent = soundOn ? "Sound: on" : "Sound: off"; snd.setAttribute("aria-pressed", soundOn); }

    // ---- lines ----
    function pick(k, j) { // the student's reply becomes their line
      picked[k] = j; replies.hidden = true; text.hidden = false; next.disabled = false;
      text.textContent = T(lines[k].replies[j].text);
      if (!RM) { text.classList.remove("in"); void text.offsetWidth; text.classList.add("in"); }
      next.focus(); lineDone(tok, 1200 + 55 * text.textContent.length);
    }
    function showReplies(k) {
      replies.innerHTML = ""; replies.hidden = false; text.hidden = true; text.textContent = ""; next.disabled = picked[k] == null; // going Back keeps the earlier pick
      lines[k].replies.forEach((r, j) => {
        const b = el("button", "btn ghost sp-reply", T(r.text)); b.type = "button";
        b.setAttribute("aria-pressed", String(picked[k] === j)); b.setAttribute("data-tip", `Say this. You can also press ${j + 1}.`);
        b.onclick = () => pick(k, j); replies.appendChild(b);
      });
      (replies.querySelector('[aria-pressed="true"]') || replies.firstChild).focus();
      if (tts) { const my = tok; autoT = setTimeout(() => my === tok && !stopped && pick(k, picked[k] || 0), 2500); } // the animatic picks for itself
    }
    function show(k) {
      i = k; const ln = lines[k], kind = ln.kind || "line", my = ++tok; clearTimeout(autoT);
      showShot(at(scene, k, "shot", 0));
      replies.hidden = true; text.hidden = false; next.disabled = false;
      if (kind === "reply") { // the student's line: their recruit and call sign, or just "You"
        faceBox.classList.toggle("off", !myFace); name.hidden = false; name.textContent = me.sign || "You";
        if (myFace && faceBox.firstChild !== myFace) { faceBox.innerHTML = ""; faceBox.appendChild(myFace); }
      } else if (kind === "narration") { faceBox.classList.add("off"); name.hidden = true; }
      else {
        const f = faceFor(ln); name.hidden = false; name.textContent = f.name;
        faceBox.classList.toggle("off", ln.face == null); // a line without a face is a voice with no picture
        if (ln.face != null && faceBox.firstChild !== f.node) { faceBox.innerHTML = ""; faceBox.appendChild(f.node); }
      }
      box.classList.toggle("narr", kind === "narration"); text.classList.toggle("beeps", kind === "beeps");
      text.textContent = kind === "reply" ? "" : T(ln.text);
      count.textContent = `${k + 1} / ${lines.length}`;
      next.textContent = k === lines.length - 1 ? "Done" : "Next";
      back.disabled = k === 0;
      if (!RM) { text.classList.remove("in"); void text.offsetWidth; text.classList.add("in"); }
      track(chans.music, at(scene, k, "music", scene.music)); track(chans.amb, scene.ambience);
      if (kind === "reply") { lineSound({ sfx: ln.sfx }, my); showReplies(k); kick(); }
      else {
        lineDone(my, 1200 + 55 * String(T(ln.text) || "").length); // reading time, until a sound's end replaces it
        lineSound(ln, my);
        kick();
      }
      const n = lines[k + 1]; // get the next line's picture and shot ready
      if (n) { if (n.who && n.face != null) faceFor(n); const ns = at(scene, k + 1, "shot", 0); if (shots[ns]) shotEl(ns); }
    }
    function stop() {
      if (stopped) return; stopped = true;
      clearInterval(ticker); clearTimeout(autoT); voice.pause(); if (window.speechSynthesis) speechSynthesis.cancel();
      for (const c of Object.values(chans)) for (const e of c.els) e.pause();
      for (const d of shotEls) if (d && d._vid) d._vid.pause();
      if (actx) actx.close().catch(() => {});
      removeEventListener("keydown", onKey); wrap.remove();
    }
    function end() { if (finished) return; finished = true; stop(); if (o.onDone) o.onDone(); }
    const waiting = () => lines[i].kind === "reply" && picked[i] == null; // a reply line waits for the student's pick
    const advance = () => (waiting() ? null : i >= lines.length - 1 ? end() : show(i + 1));
    const goBack = () => { if (i > 0) show(i - 1); };
    function onKey(e) {
      if ((e.key === " " || e.key === "Enter") && e.target.closest && e.target.closest("button")) return; // a focused button handles its own press (else a line is skipped)
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); advance(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goBack(); }
      else if (e.key === "Escape") end();
      else if (/^[1-3]$/.test(e.key) && !replies.hidden && lines[i].replies[+e.key - 1]) { e.preventDefault(); pick(i, +e.key - 1); }
    }
    next.onclick = advance; skip.onclick = end; back.onclick = goBack;
    snd.onclick = () => {
      soundOn = !soundOn; store.set("cr-story-sound", soundOn ? "1" : "0"); sndLabel();
      if (soundOn) { lineDone(tok, 1500); lineSound(lines[i], tok); kick(); } else { voice.pause(); if (window.speechSynthesis) speechSynthesis.cancel(); }
    };
    wrap.addEventListener("click", (e) => { if (!e.target.closest("button")) advance(); }); // tap anywhere for the next line
    addEventListener("keydown", onKey);
    wrap._stop = stop;
    sndLabel(); ticker = setInterval(tick, 50);
    show(0); next.focus();
    return { end };
  }

  // a finished film (the opening): the clip with its captions (WebVTT with <v Speaker> tags) in the dialog frame under
  // the picture. Sound follows the same Sound button as scenes and the captions always show. Tap or Space pauses; the
  // arrows jump 5 s. Skipping counts as watched. f: { film, captions, poster }; o: { big, onDone }
  function film(f, o) {
    const old = document.querySelector(".sp-overlay"); if (old) { if (old._stop) old._stop(); else old.remove(); }
    const wrap = el("div", "sp-overlay film" + (o.big ? " big" : "")); wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true"); wrap.setAttribute("aria-label", "The opening film");
    const v = document.createElement("video"); v.className = "sp-film"; v.playsInline = true; v.preload = "auto"; if (f.poster) v.poster = f.poster;
    const tr = document.createElement("track"); tr.kind = "captions"; tr.srclang = "en"; tr.label = "English"; tr.src = f.captions; v.appendChild(tr); tr.track.mode = "hidden"; // the player draws the captions itself, in the dialog frame
    const box = el("div", "sp-box"), name = el("b", "sp-name"), text = el("p", "sp-text"); text.setAttribute("aria-live", "polite");
    const ctl = el("div", "sp-ctl"), clock = el("span", "sp-count"), snd = el("button", "btn ghost sp-snd"), pause = el("button", "btn ghost"), skip = el("button", "btn", "Skip");
    for (const b of [snd, pause, skip]) b.type = "button";
    snd.setAttribute("data-tip", "Turn the film's sound on or off. The words always show.");
    pause.setAttribute("data-tip", "Pause or play the film. Space works too, and the arrow keys jump 5 seconds.");
    skip.setAttribute("data-tip", "Close the film. It still counts as watched.");
    ctl.append(clock, snd, pause, skip); box.append(name, text, ctl); wrap.append(v, box);
    document.body.appendChild(wrap);
    let soundOn = store.get("cr-story-sound") === "1", finished = false, stopped = false;
    const mm = (s) => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");
    const labels = () => { snd.textContent = soundOn ? "Sound: on" : "Sound: off"; snd.setAttribute("aria-pressed", soundOn); pause.textContent = v.paused && !v.ended ? "Play" : "Pause"; clock.textContent = `${mm(v.currentTime)} / ${mm(v.duration)}`; };
    function caption() { // the cue playing now, or nothing between lines
      const c = tr.track.activeCues && tr.track.activeCues[0], raw = c ? c.text : "", who = (raw.match(/^<v\s+([^>]+)>/) || [])[1] || "";
      text.textContent = raw.replace(/<[^>]+>/g, "").trim();
      box.classList.toggle("narr", !who || who === "Narrator"); name.hidden = !who || who === "Narrator"; name.textContent = who;
    }
    tr.track.addEventListener("cuechange", caption);
    v.addEventListener("timeupdate", labels); v.addEventListener("play", labels); v.addEventListener("pause", labels); v.addEventListener("loadedmetadata", labels);
    v.addEventListener("ended", () => end());
    v.addEventListener("error", () => { text.textContent = "The film didn't load. Check your connection and try again."; name.hidden = true; pause.hidden = true; skip.textContent = "Close"; });
    function go() { v.muted = !soundOn; const p = v.play(); if (p && p.catch) p.catch(() => { if (!v.muted) { v.muted = true; soundOn = false; labels(); start(v); } }); } // a refused start with sound plays muted
    const toggle = () => (v.paused ? go() : v.pause());
    function stop() { if (stopped) return; stopped = true; v.pause(); v.removeAttribute("src"); v.load(); removeEventListener("keydown", onKey); wrap.remove(); }
    function end() { if (finished) return; finished = true; stop(); if (o.onDone) o.onDone(); }
    function onKey(e) {
      if ((e.key === " " || e.key === "Enter") && e.target.closest && e.target.closest("button")) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); try { v.currentTime = Math.max(0, v.currentTime + (e.key === "ArrowRight" ? 5 : -5)); } catch {} }
      else if (e.key === "Escape") end();
    }
    snd.onclick = () => { soundOn = !soundOn; store.set("cr-story-sound", soundOn ? "1" : "0"); v.muted = !soundOn; labels(); };
    pause.onclick = toggle; skip.onclick = end;
    wrap.addEventListener("click", (e) => { if (!e.target.closest("button")) toggle(); });
    addEventListener("keydown", onKey);
    wrap._stop = stop;
    v.src = f.film; labels(); go(); pause.focus();
    return { end, video: v };
  }
  window.StoryPlayer = { play, open, preload, resolve, film };
})();
