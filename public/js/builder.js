/* Robot builder UI: part pickers, live preview, weight meter, stats.
   Expects these ids in the page: bot-name, random, sw, c-body, c-sensor, c-brain, c-tool,
   preview, wtxt, wmeter, warn, stats. */
(function () {
  const E = window.Engine;
  const { PARTS, SLOTS, COLORS, MAXW, statsOf, clamp, FX, drawBot, bigText, Sound } = E;
  const $ = (id) => document.getElementById(id);

  function mount(opts = {}) {
    let bot = opts.bot || { name: "BOLT", body: 0, sensor: 0, brain: 2, tool: 2, color: 0 };
    const pv = { fx: new FX(), pop: 0, w: 300, h: 240 };
    const rand3 = () => (Math.random() * 3) | 0;
    $("bot-name").value = bot.name;

    function renderChoices() {
      SLOTS.forEach((slot) => {
        const el = $("c-" + slot); el.innerHTML = "";
        PARTS[slot].forEach((p, i) => {
          const b = document.createElement("button");
          b.className = "choice"; b.type = "button"; b.setAttribute("aria-pressed", bot[slot] === i);
          b.innerHTML = `<b></b><span></span><em>${p.wt} kg</em>`;
          b.querySelector("b").textContent = p.n; b.querySelector("span").textContent = p.d;
          b.onclick = () => { bot[slot] = i; pv.pop = 1; Sound.play("click"); update(); };
          el.appendChild(b);
        });
      });
      const sw = $("sw"); sw.innerHTML = "";
      COLORS.forEach((c, i) => {
        const b = document.createElement("button");
        b.className = "swatch"; b.type = "button"; b.style.background = c; b.setAttribute("aria-label", "Color " + (i + 1));
        b.setAttribute("aria-pressed", bot.color === i);
        b.onclick = () => { bot.color = i; pv.pop = 1; Sound.play("click"); update(); };
        sw.appendChild(b);
      });
    }
    function update() {
      bot.name = E.cleanName($("bot-name").value) || "BOT";
      renderChoices();
      const s = statsOf(bot), over = s.wt > MAXW;
      $("wtxt").textContent = `${s.wt} / ${MAXW} kg`;
      $("wmeter").classList.toggle("over", over);
      $("wmeter").firstElementChild.style.width = Math.min(100, (s.wt / MAXW) * 100) + "%";
      $("warn").textContent = over ? "Too heavy! The motors can't move it. Swap a part." : "";
      const rows = [["Attack", s.atk, 12, "var(--orange)"], ["Defense", s.def, 11, "var(--good)"], ["Speed", s.spd, 10, "var(--blue)"], ["Aim", s.aim, 10, "var(--purple)"]];
      $("stats").innerHTML = rows.map(([l, v, mx, c]) => `<span>${l}</span><div class="bar"><i style="width:${clamp((v / mx) * 100, 4, 100)}%;background:${c}"></i></div><span class="n">${v}</span>`).join("");
      opts.onChange && opts.onChange(bot, over);
    }
    $("bot-name").addEventListener("input", update);
    $("random").onclick = () => {
      let b; do { b = { ...bot, body: rand3(), sensor: rand3(), brain: rand3(), tool: rand3(), color: (Math.random() * 6) | 0 }; } while (statsOf(b).wt > MAXW);
      bot = b; pv.pop = 1; Sound.play("go"); update();
    };

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
      const c = $("preview");
      if (c.offsetParent) {
        const { ctx, w, h } = E.fit(c); pv.w = w; pv.h = h;
        pv.fx.update(dt); pv.pop = Math.max(0, pv.pop - dt * 3);
        const bg = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.5, w * 0.7); bg.addColorStop(0, "#34323c"); bg.addColorStop(1, "#1b1a1e");
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        const gy = h * 0.86;
        ctx.fillStyle = "#2b2a30"; ctx.fillRect(0, gy, w, h - gy);
        ctx.fillStyle = "#3a3842"; ctx.beginPath(); ctx.ellipse(w * 0.55, gy + 2, Math.min(w * 0.3, h * 0.7), h * 0.045, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(244,101,36,.4)"; ctx.lineWidth = 2; ctx.stroke();
        const s = Math.min(w / 4.6, h / 3.3) * (1 + Math.sin(pv.pop * Math.PI) * 0.08);
        const ph = t % 3.2, lunge = ph < 0.55 ? ph / 0.55 : 0;
        drawBot(ctx, bot, w * 0.55 - s * 0.25, gy, s, 1, t, { lunge });
        const fs = Math.round(clamp(h * 0.075, 14, 26));
        ctx.font = `700 ${fs}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#ffffff"; ctx.fillText(bot.name, 14, 10 + fs);
        ctx.font = `500 ${Math.round(fs * 0.5)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#aaa6b0";
        [PARTS.body[bot.body].n, PARTS.sensor[bot.sensor].n, PARTS.brain[bot.brain].n, PARTS.tool[bot.tool].n].forEach((p, i) => ctx.fillText(p.toUpperCase(), 14, 14 + fs + (i + 1) * fs * 0.62));
        if (statsOf(bot).wt > MAXW) { ctx.fillStyle = "rgba(255,93,93,.14)"; ctx.fillRect(0, 0, w, h); bigText(ctx, "TOO HEAVY", w / 2, h * 0.5, h * 0.11, "#ff5d5d"); }
        pv.fx.draw(ctx);
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    update();

    return {
      get bot() { return { ...bot }; },
      set(b) { bot = { ...b }; $("bot-name").value = bot.name; update(); },
      celebrate() { pv.fx.burst(pv.w / 2, pv.h * 0.35, 50, { colors: COLORS, kind: "confetti", speed: 280, g: 380, life: 1.5, size: 5, drag: 0.92 }); },
      overweight() { return statsOf(bot).wt > MAXW; },
    };
  }
  window.Builder = { mount };
})();
