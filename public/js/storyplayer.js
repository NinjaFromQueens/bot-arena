/*
 * The story player (docs/platform-flow-spec.md section 5): plays a scene file over its painted background, one line at a
 * time, with the speaker's picture and name in the story's dialog frame. Browser only (window.StoryPlayer). The mission
 * runner uses it for one student; Mission Control will use it on the projector (o.big). Text is set with textContent and
 * always shows (captions), so scenes work with sound off. Skipping counts as watched: a scene is story, not a test.
 * A picture that doesn't load shows a labeled placeholder with its path, so screens work before the art exists.
 */
(function () {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // o: { characters, text(value) -> string, big, onDone() }
  function play(scene, o) {
    const old = document.querySelector(".sp-overlay"); if (old) old.remove();
    const wrap = el("div", "sp-overlay" + (o.big ? " big" : "")); wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true"); wrap.setAttribute("aria-label", "Story scene");
    const bg = el("div", "sp-bg");
    if (scene.bg) { const probe = new Image(); probe.onload = () => (bg.style.backgroundImage = `url("${scene.bg}")`); probe.onerror = () => bg.appendChild(el("span", "sp-missing", scene.bg)); probe.src = scene.bg; }
    const faceBox = el("div", "sp-face");
    const box = el("div", "sp-box"), name = el("b", "sp-name"), text = el("p", "sp-text"); text.setAttribute("aria-live", "polite");
    const ctl = el("div", "sp-ctl"), count = el("span", "sp-count"), skip = el("button", "btn ghost", "Skip"), next = el("button", "btn", "Next");
    skip.type = next.type = "button";
    skip.setAttribute("data-tip", "Skip to the end of this scene. It still counts as watched.");
    next.setAttribute("data-tip", "Show the next line. Space, Enter or the right arrow work too.");
    ctl.append(count, skip, next); box.append(name, text, ctl);
    wrap.append(bg, faceBox, box);
    document.body.appendChild(wrap);
    let i = -1, audio = null, finished = false;
    const faces = {}; // one picture per character face, reused across lines
    function faceFor(ln) {
      const c = (o.characters || {})[ln.who] || { name: ln.who, faces: {} }, src = c.faces[ln.face], key = ln.who + ":" + ln.face;
      if (!faces[key]) {
        if (src) { const img = el("img"); img.alt = c.name; img.src = src; img.onerror = () => { const ph = el("span", "sp-missing", src); img.replaceWith(ph); faces[key] = ph; }; faces[key] = img; }
        else faces[key] = el("span", "sp-missing", `${ln.who} (${ln.face})`);
      }
      return { node: faces[key], name: c.name };
    }
    function show(k) {
      i = k; const ln = scene.lines[i], f = faceFor(ln);
      if (faceBox.firstChild !== f.node) { faceBox.innerHTML = ""; faceBox.appendChild(f.node); }
      name.textContent = f.name; text.textContent = o.text(ln.text);
      count.textContent = `${i + 1} / ${scene.lines.length}`;
      next.textContent = i === scene.lines.length - 1 ? "Done" : "Next";
      if (!RM) { text.classList.remove("in"); void text.offsetWidth; text.classList.add("in"); }
      if (audio) { audio.pause(); audio = null; }
      if (ln.voice && o.sound && o.sound()) { audio = new Audio(ln.voice); audio.play().catch(() => {}); }
    }
    function end() {
      if (finished) return; finished = true;
      if (audio) audio.pause();
      removeEventListener("keydown", onKey); wrap.remove();
      if (o.onDone) o.onDone();
    }
    const advance = () => (i >= scene.lines.length - 1 ? end() : show(i + 1));
    function onKey(e) {
      if ((e.key === " " || e.key === "Enter") && e.target.closest && e.target.closest("button")) return; // a focused button handles its own press (else a line is skipped)
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); advance(); }
      else if (e.key === "Escape") end();
    }
    next.onclick = advance; skip.onclick = end;
    wrap.addEventListener("click", (e) => { if (!e.target.closest("button")) advance(); }); // tap anywhere for the next line
    addEventListener("keydown", onKey);
    show(0); next.focus();
    return { end };
  }
  window.StoryPlayer = { play };
})();
