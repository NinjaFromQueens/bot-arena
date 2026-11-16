/*
 * Cards for the learning loop (predict, test, explain, improve), for any game page (window.Cards, browser only).
 * predict: one question before each run; the answer locks when the run starts, so it shows what the student really
 * thought. explain: what happened and why, from the run's real numbers, with one tip and a "Try it" button that makes
 * that one change, a graph, and glossary words that show their meaning. Text is always set with textContent.
 */
(function () {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // o: { question, options: [{ value, label }], onPick(value), go: the run button's name, kicker } -> { value, lock(), say(text) }
  function predict(box, o) {
    box.innerHTML = "";
    const go = o.go || "Run";
    const card = el("div", "pcard"), row = el("div", "popts"), status = el("p", "pstatus", `Pick what you think will happen. It locks when you press ${go}.`);
    card.append(el("span", "pkick", o.kicker || "Predict first"), el("p", "pq", o.question), row, status);
    row.setAttribute("role", "radiogroup"); row.setAttribute("aria-label", o.question);
    let value = null, locked = false;
    const btns = o.options.map((op) => {
      const b = el("button", "popt", op.label); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", "false");
      b.setAttribute("data-tip", `Your prediction: ${op.label}. You can change it until you press ${go}.`);
      b.onclick = () => {
        if (locked) return;
        value = op.value; btns.forEach((x, i) => x.setAttribute("aria-checked", String(o.options[i].value === value)));
        status.textContent = "Good. Now run the test.";
        if (o.onPick) o.onPick(value);
      };
      row.appendChild(b); return b;
    });
    box.appendChild(card);
    return { get value() { return value; }, lock() { locked = true; btns.forEach((b) => (b.disabled = true)); status.textContent = "Locked in. Let's see!"; }, say(text) { status.textContent = text; }, card };
  }

  // text with the first use of each glossary term underlined, showing its meaning (glossary: id -> { term, forms, def })
  function termText(node, text, terms, glossary) {
    const hits = [];
    for (const id of terms || []) {
      const g = glossary && glossary[id]; if (!g) continue;
      for (const f of [g.term, ...(g.forms || [])]) {
        const m = new RegExp(`(?<![A-Za-z])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`, "i").exec(text);
        if (m && !hits.some((h) => m.index < h.end && h.start < m.index + m[0].length)) { hits.push({ start: m.index, end: m.index + m[0].length, def: g.def }); break; }
      }
    }
    hits.sort((a, b) => a.start - b.start);
    let at = 0;
    for (const h of hits) {
      node.append(text.slice(at, h.start));
      const s = el("span", "hastip", text.slice(h.start, h.end)); s.tabIndex = 0; s.setAttribute("data-tip", h.def); node.append(s);
      at = h.end;
    }
    node.append(text.slice(at));
  }

  // speed along the run over the road's height: where it slowed, and where it stopped
  function graph(canvas, g) {
    const ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || 600, H = canvas.clientHeight || 170;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = 44, Rp = 12, T = 14, B = 30, pw = W - L - Rp, ph = H - T - B, kmh = (v) => v * 3.6;
    const ys = g.profile.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), vMax = Math.max(20, Math.ceil(kmh(Math.max(...g.speed.map((p) => p[1]))) / 10) * 10);
    const X = (z) => L + (Math.min(g.length, Math.max(0, z)) / g.length) * pw, YH = (y) => T + ph - ((y - y0) / Math.max(1, y1 - y0)) * ph * 0.6, YV = (v) => T + ph - (kmh(v) / vMax) * ph;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.beginPath(); ctx.moveTo(X(0), T + ph); g.profile.forEach(([z, y]) => ctx.lineTo(X(z), YH(y))); ctx.lineTo(X(g.length), T + ph); ctx.closePath(); ctx.fill(); // the hill
    ctx.font = "600 11px 'JetBrains Mono', monospace"; ctx.fillStyle = "#aaa6b0"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let v = 0; v <= vMax; v += vMax / 2) { ctx.fillText(String(v), L - 6, YV(v / 3.6)); ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.beginPath(); ctx.moveTo(L, YV(v / 3.6)); ctx.lineTo(L + pw, YV(v / 3.6)); ctx.stroke(); }
    if (g.slow) { ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(255,210,63,.7)"; ctx.beginPath(); ctx.moveTo(L, YV(g.slow)); ctx.lineTo(L + pw, YV(g.slow)); ctx.stroke(); ctx.setLineDash([]); ctx.textAlign = "right"; ctx.fillStyle = "#ffd23f"; ctx.fillText("slow climb", L + pw - 4, YV(g.slow) + 10); }
    ctx.lineWidth = 2.5; ctx.strokeStyle = "#f46524"; ctx.beginPath(); g.speed.forEach(([z, v], i) => (i ? ctx.lineTo(X(z), YV(v)) : ctx.moveTo(X(z), YV(v)))); ctx.stroke(); ctx.lineWidth = 1; // the speed
    if (g.stop != null) { ctx.fillStyle = "#ff5d5d"; ctx.beginPath(); ctx.arc(X(g.stop), YV(0), 5, 0, 7); ctx.fill(); ctx.textAlign = X(g.stop) > L + pw - 70 ? "right" : "left"; ctx.fillText("stopped here", X(g.stop) + (ctx.textAlign === "left" ? 8 : -8), YV(0) - 10); }
    ctx.textAlign = "center"; ctx.fillStyle = "#aaa6b0"; ctx.textBaseline = "alphabetic";
    ctx.fillText(`distance along the test (m), 0 to ${Math.round(g.length)}`, L + pw / 2, H - 6);
    ctx.save(); ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("km/h", 0, 0); ctx.restore();
  }

  // d: { headline, items: [{ tone, title, text, terms }], tip: { text, change }, graph }; o: { glossary, onTry(change), before: [nodes] }
  function explain(box, d, o = {}) {
    const frag = document.createDocumentFragment();
    (o.before || []).forEach((n) => frag.appendChild(n));
    if (d.headline) frag.appendChild(el("div", "headline" + (d.headline.tone === "good" ? " good" : ""), d.headline.text));
    if (d.graph && d.graph.kind === "speedDistance") {
      const wrap = el("div", "xgraph"), cv = el("canvas"); cv.setAttribute("role", "img");
      cv.setAttribute("aria-label", "A graph of the car's speed along the test, drawn over the shape of the hill." + (d.graph.stop != null ? " The line drops to zero where the car stopped." : ""));
      wrap.append(cv, el("p", "xcap", d.graph.slow ? "Orange: your speed. Gray: the hill. Below the dashed line is a slow climb." : "Orange: your speed. Gray: the height of the road.")); frag.appendChild(wrap);
      if (window.ResizeObserver) new ResizeObserver(() => graph(cv, d.graph)).observe(cv); // redrawn at its new size when a phone turns
      else requestAnimationFrame(() => graph(cv, d.graph));
    }
    d.items.forEach((it, i) => {
      const f = el("div", "finding " + it.tone); f.style.animationDelay = i * 0.06 + "s";
      f.append(el("span", "ic", it.tone === "good" ? "✓" : it.tone === "bad" ? "✗" : "i"));
      const body = el("div"), p = el("p"); body.append(el("h4", null, it.title), p); termText(p, it.text, it.terms, o.glossary); f.appendChild(body);
      frag.appendChild(f);
    });
    if (d.tip) {
      const t = el("div", "tipbox"); t.append(el("b", null, "Try this next"), el("span", null, d.tip.text));
      if (d.tip.change && o.onTry) { const b = el("button", "btn ghost", "Try it"); b.type = "button"; b.setAttribute("data-tip", "Make this one change in the garage, then predict again."); b.onclick = () => o.onTry(d.tip.change); t.appendChild(b); }
      frag.appendChild(t);
    }
    box.appendChild(frag);
  }

  window.Cards = { predict, explain, graph, termText };
})();
