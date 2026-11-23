/* Solo Speed Run in the Flying Car Lab (S-02, docs/speed-run-plan.md): the class game's problem sets (sprint.js), played
   alone against the clock on the Lab's Speed Run tab (#speedrun). A run is 5 or 10 problems from a fresh seed at the
   student's reading level. A wrong answer never ends the run: it locks for 5 seconds, with 3 tries (or one fewer than
   the choices). When a problem is over, by a right answer after a miss or by running out of tries, the clock stops while
   the worked steps and the named mistake show (never before: some mistakes' explanations contain the answer). Splits
   are the clock at each right answer, green or red against the personal best, which counts only clean runs (every
   answer right) and stays on the device by set id in cr-sprint. Nothing is sent anywhere.
   UMD: the pure parts (record, deltas, clock) are tested in Node; mount() runs only in the browser. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.Solo = api; if (typeof document !== "undefined") api.mount(); }
})(typeof self !== "undefined" ? self : this, function () {
  const LENGTHS = [5, 10], LOCK = 5000, KEY = "cr-sprint";
  const entryKey = (tier, n) => `${tier}-${n}`;
  // the personal best for a set, reading level and length, or null
  function bestOf(store, set, tier, n) { const e = store && store[set] && store[set][entryKey(tier, n)]; return e && Number.isFinite(e.time) ? e : null; }
  // a finished run { time, splits, right }: a clean run faster than the best becomes the best. Returns { store, best }
  function record(store, set, tier, n, run, at) {
    const old = bestOf(store, set, tier, n), clean = run.right === n && run.splits.length === n && run.splits.every(Number.isFinite);
    if (!clean || (old && old.time <= run.time)) return { store, best: false };
    const out = { ...(store || {}) };
    out[set] = { ...(out[set] || {}), [entryKey(tier, n)]: { time: Math.round(run.time), splits: run.splits.map(Math.round), at } };
    return { store: out, best: true };
  }
  // each split against the best's: below 0 = ahead (green), above 0 = behind (red), null = nothing to compare
  const deltas = (splits, best) => splits.map((s, i) => (s == null || !best || best.splits[i] == null ? null : s - best.splits[i]));
  const clock = (ms) => { const t = Math.floor(Math.max(0, ms) / 100) / 10, m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`; };
  const delta = (ms) => (ms < 0 ? "−" : "+") + (Math.abs(ms) / 1000).toFixed(1);
  const triesFor = (p) => (p.input.kind === "choice" ? Math.max(1, p.input.options.length - 1) : 3);

  function mount() {
    const $ = (id) => document.getElementById(id), box = $("srun");
    if (!box || !window.Sprint || !window.SprintCard) return;
    const Sp = window.Sprint, C = window.SprintCard, T = window.Tier, Sound = (window.Engine && window.Engine.Sound) || { play() {} };
    const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
    const present = /[?&]present\b/.test(location.search), fine = matchMedia("(pointer: fine)").matches;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const LEVEL = { cadet: "Cadet", recruit: "Recruit", operative: "Operative" };

    // run: phase start | run | end; clock: t0 and the paused time (paused while a finished problem's steps show)
    const R = { set: "thrust", tier: T ? T.current() : "recruit", n: LENGTHS[0], phase: "start", seed: 0, i: 0, p: null, best: null,
      t0: 0, pausedAt: 0, paused: 0, splits: [], results: [], tries: 0, lockUntil: 0, first: -1, timer: null, next: null };
    const now = () => performance.now();
    const elapsed = () => (R.pausedAt || now()) - R.t0 - R.paused;
    const pause = () => { if (!R.pausedAt) R.pausedAt = now(); };
    const resume = () => { if (R.pausedAt) { R.paused += now() - R.pausedAt; R.pausedAt = 0; } };
    const show = (id) => ["sr-start", "sr-run", "sr-end"].forEach((v) => ($(v).hidden = v !== id));

    // Sparrow runs Speed Run (the plan's game card); loaded the first time the tab opens, and not in the offline copy
    function showFace() {
      const img = $("sr-face"); if (img.dataset.tried || location.protocol === "file:") return;
      img.dataset.tried = "1"; img.onload = () => (img.hidden = false); img.src = "/assets/characters/sparrow/pose.webp";
    }
    // ---------- the tab ----------
    function mode() {
      const on = location.hash === "#speedrun" && !present;
      document.body.classList.toggle("srmode", on); box.hidden = !on;
      document.querySelectorAll("#labtabs a").forEach((a) => a.setAttribute("aria-selected", String((a.getAttribute("href") === "#speedrun") === on)));
      if (on) { showFace(); if (R.phase === "start") renderStart(); }
      else if (R.phase === "run") stop(); // leaving the tab mid-run ends it
    }
    if (present) $("labtabs").hidden = true;
    addEventListener("hashchange", mode);

    // ---------- the start card ----------
    const classTier = () => (T && T.classTier ? T.classTier() : null);
    function renderStart() {
      R.tier = classTier() || (T ? T.current() : R.tier);
      const lock = classTier();
      [...$("sr-tier").children].forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.t === R.tier)); b.disabled = !!lock && b.dataset.t !== lock; });
      $("sr-tier").setAttribute("data-tip", lock ? "Your teacher set the reading level for the class game." : "Pick the reading level for the problems. It's saved on this device.");
      [...$("sr-len").children].forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.n === R.n)));
      const b = bestOf(ls.get(KEY, {}), R.set, R.tier, R.n);
      $("sr-best").textContent = b ? `Your best for ${R.n} ${LEVEL[R.tier]} problems: ${clock(b.time)}` : `No best yet for ${R.n} ${LEVEL[R.tier]} problems. Set one!`;
      show("sr-start");
    }
    Object.keys(LEVEL).forEach((t) => {
      const b = el("button", "", LEVEL[t]); b.type = "button"; b.dataset.t = t;
      b.onclick = () => { if (classTier()) return; R.tier = t; if (T) T.set(t); Sound.play("click"); renderStart(); };
      $("sr-tier").appendChild(b);
    });
    LENGTHS.forEach((n) => {
      const b = el("button", "", String(n)); b.type = "button"; b.dataset.n = String(n); b.setAttribute("data-tip", `A run of ${n} problems.`);
      b.onclick = () => { R.n = n; Sound.play("click"); renderStart(); };
      $("sr-len").appendChild(b);
    });

    // ---------- a run ----------
    function start() {
      Object.assign(R, { phase: "run", seed: 1 + Math.floor(Math.random() * 2147483000), i: -1, splits: [], results: [], t0: now(), paused: 0, pausedAt: 0,
        best: bestOf(ls.get(KEY, {}), R.set, R.tier, R.n) });
      show("sr-run"); next();
      clearInterval(R.timer); R.timer = setInterval(tick, 100);
    }
    function stop() { clearInterval(R.timer); clearTimeout(R.next); R.phase = "start"; renderStart(); }
    function next() {
      clearTimeout(R.next); resume();
      R.i++;
      if (R.i >= R.n) return finish();
      R.p = Sp.set(R.set).make(R.seed + R.i, R.tier); R.tries = 0; R.lockUntil = 0; R.first = -1;
      const p = R.p;
      $("sr-count").textContent = `Problem ${R.i + 1} of ${R.n}`;
      $("sr-kind").textContent = C.KIND[p.kind] || "";
      $("sr-q").textContent = p.text;
      $("sr-pic").hidden = !p.pic; if (p.pic) requestAnimationFrame(() => C.draw($("sr-pic"), p.pic));
      $("sr-choices").innerHTML = "";
      if (p.input.kind === "choice") p.input.options.forEach((o) => {
        const b = el("button", "", o.label); b.type = "button"; b.dataset.v = String(o.value); b.setAttribute("data-tip", "Tap your answer.");
        b.onclick = () => answer(o.value);
        $("sr-choices").appendChild(b);
      });
      $("sr-pad").hidden = p.input.kind === "choice";
      $("sr-unit").textContent = p.input.unit || "";
      $("sr-val").value = ""; $("sr-steps").hidden = true; $("sr-steps").innerHTML = ""; $("sr-why").hidden = true; $("sr-next").hidden = true;
      Sound.play("beep");
      if (fine && p.input.kind !== "choice") $("sr-val").focus({ preventScroll: true });
      render(); splits();
    }
    function answer(value) {
      const p = R.p; if (R.phase !== "run" || !p || R.results[R.i] || now() < R.lockUntil || String(value).trim() === "") return;
      const r = Sp.check(p, value);
      if (r.correct) {
        R.splits[R.i] = elapsed(); R.results[R.i] = { right: true, tries: R.tries + 1, mistake: R.first };
        Sound.play("win");
        if (R.first < 0) { pause(); render(); splits(); R.next = setTimeout(next, 650); return; } // clean: straight on
        return over(); // right after a miss: show why the first answer was off
      }
      R.tries++; if (R.first < 0 && r.mistake >= 0) R.first = r.mistake;
      Sound.play("miss"); $("sr-val").value = "";
      if (R.tries >= triesFor(p)) { R.results[R.i] = { right: false, tries: R.tries, mistake: R.first }; return over(); }
      R.lockUntil = now() + LOCK; render();
    }
    function over() { // the problem is done: stop the clock, show the steps and the named mistake, wait for Next
      pause();
      const p = R.p, res = R.results[R.i];
      $("sr-steps").innerHTML = ""; p.steps.forEach((s) => $("sr-steps").appendChild(el("li", "", s))); $("sr-steps").hidden = false;
      $("sr-why").hidden = res.mistake < 0; $("sr-why").textContent = res.mistake >= 0 ? `Your first answer: ${p.mistakes[res.mistake].why}` : "";
      $("sr-next").hidden = false; $("sr-next").textContent = R.i + 1 < R.n ? "Next problem" : "See my time";
      render(); splits();
      $("sr-next").focus({ preventScroll: true });
    }
    function tick() {
      if (R.phase !== "run") return clearInterval(R.timer);
      $("sr-clock").textContent = clock(elapsed());
      if (R.lockUntil) render();
    }
    function render() {
      const p = R.p, res = R.results[R.i], lock = Math.max(0, Math.ceil((R.lockUntil - now()) / 1000)), left = triesFor(p) - R.tries;
      if (R.lockUntil && lock === 0) R.lockUntil = 0;
      $("sr-send").disabled = !!res || lock > 0;
      [...$("sr-choices").children].forEach((b) => { b.disabled = !!res || lock > 0; b.classList.toggle("right", !!res && b.dataset.v === String(p.answer.value)); });
      $("sr-msg").className = "sr-msg" + (res ? (res.right ? " good" : " bad") : "");
      $("sr-msg").textContent = res ? (res.right ? (res.tries === 1 ? "Right!" : "Right! The clock is stopped while you read.") : `The answer: ${C.answerText(p, p.answer)}. The clock is stopped while you read.`)
        : lock > 0 ? `Not quite. Try again in ${lock} s (${left} ${left === 1 ? "try" : "tries"} left).`
        : R.tries ? `Try again (${left} ${left === 1 ? "try" : "tries"} left).`
        : p.input.kind === "choice" ? "Tap your answer." : "Type your answer and press Send.";
      $("sr-clock").textContent = clock(elapsed());
    }
    // the splits: the clock at each right answer, against the best run's
    function splits(list = $("sr-splits")) {
      list.innerHTML = "";
      const d = deltas(R.splits, R.best);
      for (let i = 0; i < R.n; i++) {
        const res = R.results[i], li = el("li", "sr-split" + (i === R.i && R.phase === "run" ? " cur" : ""));
        li.append(el("span", "n", String(i + 1)));
        if (res && res.right) {
          li.append(el("span", "t", clock(R.splits[i])));
          const dd = d[i]; if (dd != null) { li.classList.add(dd <= 0 ? "ahead" : "behind"); li.append(el("span", "d", delta(dd))); }
        } else if (res) { li.classList.add("miss"); li.append(el("span", "t", "missed")); }
        else li.append(el("span", "t", R.best ? clock(R.best.splits[i]) : "–"));
        li.setAttribute("data-tip", res ? (res.right ? `Problem ${i + 1}: right at ${clock(R.splits[i])}` + (d[i] != null ? `, ${d[i] <= 0 ? "ahead of" : "behind"} your best by ${(Math.abs(d[i]) / 1000).toFixed(1)} s.` : ".") : `Problem ${i + 1}: missed.`)
          : R.best ? `Your best run reached this problem's answer at ${clock(R.best.splits[i])}.` : "Finish a run with every answer right to set splits to beat.");
        list.appendChild(li);
      }
    }
    function finish() {
      clearInterval(R.timer); resume();
      const time = elapsed(), right = R.results.filter((r) => r && r.right).length;
      R.phase = "end";
      const out = record(ls.get(KEY, {}), R.set, R.tier, R.n, { time, splits: R.splits, right }, Date.now());
      if (out.best) ls.set(KEY, out.store);
      $("sr-endh").textContent = out.best ? `New personal best: ${clock(time)}!` : `Run complete: ${clock(time)}`;
      $("sr-endp").textContent = right === R.n
        ? (out.best ? (R.best ? `That beats your old best by ${(Math.abs(time - R.best.time) / 1000).toFixed(1)} s.` : "Every answer right. Now try to beat it.") : `Every answer right. Your best is ${clock(R.best.time)}, ${((time - R.best.time) / 1000).toFixed(1)} s faster.`)
        : `${right} of ${R.n} right. Your best time counts when every answer is right.`;
      Sound.play(out.best ? "win" : "click");
      splits($("sr-endsplits"));
      const tips = $("sr-practice"); tips.innerHTML = "";
      R.results.forEach((r, i) => { if (r && r.mistake >= 0) { const p = Sp.set(R.set).make(R.seed + i, R.tier); tips.appendChild(el("li", "", `Problem ${i + 1} (${C.KIND[p.kind] || p.kind}): ${p.mistakes[r.mistake].why}`)); } });
      $("sr-practicebox").hidden = !tips.children.length;
      show("sr-end");
      $("sr-again").focus({ preventScroll: true });
    }

    // ---------- controls ----------
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].forEach((k) => {
      const b = el("button", "", k); b.type = "button";
      b.setAttribute("data-tip", k === "⌫" ? "Delete the last digit." : k === "." ? "Add a decimal point." : `Type ${k}.`);
      b.onclick = () => { const v = $("sr-val"); v.value = k === "⌫" ? v.value.slice(0, -1) : (v.value + k).slice(0, 12); };
      $("sr-keys").appendChild(b);
    });
    $("sr-send").onclick = () => answer($("sr-val").value);
    $("sr-val").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); answer($("sr-val").value); } });
    $("sr-next").onclick = () => next();
    $("sr-go").onclick = () => start();
    $("sr-quit").onclick = () => stop();
    $("sr-again").onclick = () => start();
    $("sr-change").onclick = () => stop();
    mode();
    window.__solo = { get run() { return R; } };
  }

  return { LENGTHS, LOCK, KEY, entryKey, bestOf, record, deltas, clock, delta, triesFor, mount };
});
