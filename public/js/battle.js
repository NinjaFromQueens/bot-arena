/*
 * BattleStage — draws the arena and plays a list of battle events
 * (from Engine.simulate) with intro, Sense/Think/Act animation and KO.
 * Also shows a champion scene for the end of a tournament.
 */
(function () {
  const E = window.Engine;
  const { clamp, ease, bigText, rr, FX, drawBot, COLORS, Sound, RM } = E;
  const DUR = { sense: 0.65, think: 0.75, act: 1.0, stall: 0.8 };

  class BattleStage {
    constructor(canvas, cb = {}) {
      this.c = canvas; this.cb = cb; this.fx = new FX();
      this.bots = [null, null]; this.state = "idle"; this.speed = 1;
      this.hp = [100, 100]; this.brace = [false, false]; this.hurt = [0, 0]; this.dodge = [0, 0]; this.head = [null, null];
      this.queue = []; this.ev = null; this.evT = 0; this.timer = null; this.banner = "";
      this.w = 640; this.h = 360; this.last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
        try { this.draw(now / 1000, dt); } catch (e) { console.error(e); }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    setBots(a, b, banner = "") {
      clearTimeout(this.timer);
      Object.assign(this, { bots: [a, b], state: a && b ? "idle" : "empty", hp: [100, 100], brace: [false, false], queue: [], ev: null, banner, champ: null });
      this.cb.onHP && this.cb.onHP(this.hp, true);
    }
    play(events) {
      if (!this.bots[0] || !this.bots[1]) return;
      clearTimeout(this.timer);
      Object.assign(this, { state: "intro", introT: 0, lastCount: -1, queue: events.slice(), ev: null, hp: [100, 100], brace: [false, false] });
      this.cb.onHP && this.cb.onHP(this.hp, true);
    }
    skip() {
      if (this.state !== "intro" && this.state !== "fight") return;
      clearTimeout(this.timer); this.ev = null;
      const win = this.queue.pop();
      while (this.queue.length) this.log(this.queue.shift());
      if (win && win.kind === "win") { this.log(win); this.hp = win.hp; this.cb.onHP && this.cb.onHP(this.hp); this.startKO(win.me); }
    }
    showChampion(bot, label) {
      clearTimeout(this.timer);
      Object.assign(this, { state: "champ", champ: bot, champLabel: label || "", champT: 0, queue: [], ev: null });
      Sound.play("fanfare");
      this.confetti(140);
    }
    confetti(n) { this.fx.burst(this.w / 2, this.h * 0.12, n, { colors: COLORS, kind: "confetti", speed: 420, g: 320, life: 2.6, size: 6, drag: 0.93 }); }
    log(e) { this.cb.onLog && this.cb.onLog(e, this.bots[e.me]); }
    pos(k) {
      const w = this.w, h = this.h, s = Math.min(w / 8.5, h / 3.3), gy = h * 0.82;
      return { x: k === 0 ? w * 0.28 : w * 0.72, gy, s, mid: gy - s * 1.2, top: gy - s * 2.75 };
    }
    next() {
      if (!this.queue.length) return;
      const e = this.queue.shift(); this.ev = e; this.evT = 0; this.impactDone = false;
      this.log(e);
      if (e.kind === "sense") Sound.play("scan");
      if (e.kind === "think") { Sound.play("think"); this.brace = e.brace; }
      if (e.kind === "stall") { const p = this.pos(e.me); this.fx.text(p.x, p.top, "STUCK!", "#c58cff", 26); }
      if (e.kind === "win") { this.hp = e.hp; this.cb.onHP && this.cb.onHP(this.hp); this.startKO(e.me); return; }
      this.timer = setTimeout(() => this.next(), (DUR[e.kind] * 1000) / this.speed);
    }
    impact(e) {
      const op = 1 - e.me, p = this.pos(op);
      this.hp = e.hp; this.brace = e.brace; this.cb.onHP && this.cb.onHP(this.hp);
      if (e.hits) {
        this.hurt[op] = 1; this.fx.shake = e.crit ? 14 : 8;
        this.fx.burst(p.x + (op === 1 ? -1 : 1) * p.s * 0.6, p.mid, e.crit ? 36 : 22, { colors: ["#ffd23f", "#fff", "#ff8a50"], speed: 320, g: 500, life: 0.6, size: 4 });
        this.fx.text(p.x, p.top, "-" + e.dmg, e.crit ? "#ffd23f" : "#ffffff", e.crit ? 40 : 32);
        if (e.crit) this.fx.text(p.x, p.top - 34, "CRITICAL!", "#ff8a50", 20);
        if (e.grab) this.fx.text(p.x, p.top - 34, "GRABBED!", "#c58cff", 22);
        Sound.play("hit");
      } else {
        this.dodge[op] = 1; this.fx.text(p.x, p.top, "MISS", "#aaa6b0", 28); Sound.play("miss");
      }
    }
    startKO(w) {
      this.state = "ko"; this.winner = w; this.koT = 0; this.brace = [false, false];
      Sound.play("ko"); setTimeout(() => Sound.play("win"), 700);
      this.fx.shake = 16;
      setTimeout(() => this.confetti(80), 500);
      this.cb.onDone && setTimeout(() => this.cb.onDone(w), 1600 / this.speed);
    }
    drawStage(ctx, w, h, t) {
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#151419"); bg.addColorStop(0.7, "#24222a"); bg.addColorStop(1, "#1b1a1e");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      [[w * 0.22, "rgba(244,101,36,.19)"], [w * 0.78, "rgba(56,167,240,.19)"]].forEach(([sx, c], k) => {
        const sway = Math.sin(t * 0.7 + k * 2) * w * 0.03;
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.85); g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - w * 0.03, 0); ctx.lineTo(sx + w * 0.03, 0); ctx.lineTo(sx + w * 0.17 + sway, h * 0.85); ctx.lineTo(sx - w * 0.17 + sway, h * 0.85); ctx.fill();
      });
      ctx.font = `700 ${Math.round(h * 0.04)}px "JetBrains Mono", monospace`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.18)";
      if (this.state !== "champ") ctx.fillText(this.banner || "FALL ROBOTICS ACADEMY  ·  BOT ARENA", w / 2, h * 0.08);
      const fy = h * 0.66;
      const fg = ctx.createLinearGradient(0, fy, 0, h); fg.addColorStop(0, "#2e2c35"); fg.addColorStop(1, "#3a3842");
      ctx.fillStyle = fg; ctx.fillRect(0, fy, w, h - fy);
      ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1;
      for (let k = -10; k <= 10; k++) { ctx.beginPath(); ctx.moveTo(w / 2 + k * w * 0.05, fy); ctx.lineTo(w / 2 + k * w * 0.16, h); ctx.stroke(); }
      for (let k = 0; k < 5; k++) { const y = fy + (h - fy) * Math.pow(k / 5, 1.6); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      if (this.state !== "champ") {
        ctx.strokeStyle = "rgba(244,101,36,.4)"; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(w / 2, fy); ctx.lineTo(w / 2, h); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.textAlign = "left";
    }
    draw(t, dt) {
      if (!this.c.offsetParent) return;
      const { ctx, w, h } = E.fit(this.c); this.w = w; this.h = h;
      this.fx.update(dt);
      const sp = this.speed;
      ctx.save();
      if (this.fx.shake && !RM) ctx.translate((Math.random() - 0.5) * this.fx.shake, (Math.random() - 0.5) * this.fx.shake);
      this.drawStage(ctx, w, h, t);

      if (this.state === "champ") { this.drawChampion(ctx, w, h, t, dt); this.fx.draw(ctx); ctx.restore(); return; }
      if (this.state === "empty") {
        bigText(ctx, "WAITING FOR BOTS", w / 2, h * 0.45, h * 0.08, "rgba(255,255,255,.35)");
        ctx.restore(); return;
      }
      const [a, b] = this.bots;
      let slide = [0, 0], countdown = null;
      if (this.state === "intro") {
        this.introT += dt * sp;
        const k = ease.out(clamp(this.introT / 0.6, 0, 1));
        slide = [-(1 - k) * w * 0.5, (1 - k) * w * 0.5];
        const ct = this.introT - 0.7, n = Math.floor(ct / 0.55);
        if (ct >= 0 && n !== this.lastCount) { this.lastCount = n; Sound.play(n < 3 ? "beep" : "go"); }
        if (ct >= 0 && n <= 3) countdown = { n, f: (ct % 0.55) / 0.55 };
        if (ct > 0.55 * 4) { this.state = "fight"; this.next(); }
      }
      if (this.ev && this.state === "fight") {
        this.evT += dt * sp;
        if (this.ev.kind === "act" && !this.impactDone && this.evT > 0.22) { this.impactDone = true; this.impact(this.ev); }
      }
      for (let k = 0; k < 2; k++) { this.hurt[k] = Math.max(0, this.hurt[k] - dt * 4); this.dodge[k] = Math.max(0, this.dodge[k] - dt * 2.5); }
      if (this.state === "ko") this.koT += dt;
      [[a, 0], [b, 1]].forEach(([bt, k]) => {
        if (!bt) return;
        const p = this.pos(k), dir = k === 0 ? 1 : -1;
        let x = p.x + slide[k], lunge = 0, tilt = 0, hop = 0;
        const e = this.ev;
        if (e && this.state === "fight" && e.kind === "act" && e.me === k) { lunge = clamp(this.evT / 0.5, 0, 1); x += dir * Math.sin(lunge * Math.PI) * w * 0.14; }
        if (this.dodge[k]) hop = Math.sin(this.dodge[k] * Math.PI) * p.s * 0.5;
        if (this.hurt[k]) x -= dir * this.hurt[k] * p.s * 0.25;
        if (this.state === "ko") {
          if (k !== this.winner) {
            tilt = -ease.out(clamp(this.koT / 0.6, 0, 1)) * 1.45;
            if (Math.random() < 0.3) this.fx.burst(x, p.gy - p.s * 0.8, 1, { colors: ["#55535c", "#7a7782"], kind: "smoke", speed: 30, g: -60, life: 1.6, size: 8, drag: 0.95, angle: -Math.PI / 2, spread: 1 });
          } else hop = Math.abs(Math.sin(this.koT * 6)) * p.s * 0.35 * Math.max(0, 1 - this.koT / 4);
        }
        this.head[k] = drawBot(ctx, bt, x, p.gy - hop, p.s, dir, t, { lunge, hurt: this.hurt[k], tilt, shield: this.brace[k] && this.state !== "ko" });
        // name plate under each bot
        ctx.font = `700 ${Math.round(p.s * 0.28)}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "center";
        ctx.fillStyle = k === 0 ? "#ff8a50" : "#38a7f0"; ctx.fillText(bt.name, p.x + slide[k], p.gy + p.s * 0.45);
        if (bt.builder) { ctx.font = `500 ${Math.round(p.s * 0.18)}px "JetBrains Mono", monospace`; ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillText("by " + bt.builder, p.x + slide[k], p.gy + p.s * 0.7); }
        ctx.textAlign = "left";
      });
      const e = this.ev;
      if (e && this.state === "fight" && (e.kind === "sense" || e.kind === "think") && this.head[e.me]) {
        const p = this.pos(e.me), q = this.pos(1 - e.me), dir = e.me === 0 ? 1 : -1, k = clamp(this.evT / 0.5, 0, 1);
        if (e.kind === "sense") {
          const { headX: hx, headY: hy } = this.head[e.me];
          ctx.save(); ctx.globalAlpha = 0.55;
          const g = ctx.createLinearGradient(hx, 0, q.x, 0); g.addColorStop(0, "rgba(56,167,240,.8)"); g.addColorStop(1, "rgba(56,167,240,.05)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(hx, hy);
          const reach = hx + (q.x - hx) * ease.out(k);
          ctx.lineTo(reach, q.mid - q.s * 1.1); ctx.lineTo(reach, q.mid + q.s * 0.8); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#38a7f0"; ctx.globalAlpha = 0.9 * k; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
          ctx.strokeRect(q.x - q.s, q.mid - q.s * 1.55, q.s * 2, q.s * 2.45); ctx.setLineDash([]);
          ctx.font = `700 ${Math.round(q.s * 0.22)}px "JetBrains Mono", monospace`; ctx.fillStyle = "#38a7f0"; ctx.textAlign = "center";
          ctx.fillText("TARGET", q.x, q.mid - q.s * 1.65); ctx.textAlign = "left";
          ctx.restore();
        } else {
          const bx = p.x + dir * p.s * 0.2, by = p.top - p.s * 0.1, sc = ease.back(clamp(this.evT / 0.25, 0, 1));
          ctx.save(); ctx.translate(bx, by); ctx.scale(sc, sc);
          ctx.font = `700 ${Math.round(p.s * 0.32)}px "Chakra Petch", Arial, sans-serif`;
          const tw = ctx.measureText(e.bubble).width + p.s * 0.45, th = p.s * 0.56;
          ctx.fillStyle = "#f4f1ea"; ctx.strokeStyle = "#141316"; ctx.lineWidth = 3;
          rr(ctx, -tw / 2, -th, tw, th, th / 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(-dir * tw * 0.22, p.s * 0.12, p.s * 0.07, 0, 7); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(-dir * tw * 0.3, p.s * 0.28, p.s * 0.04, 0, 7); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#8e4fd6"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(e.bubble, 0, -th / 2 + 1);
          ctx.restore();
        }
      }
      this.fx.draw(ctx);
      if (countdown) {
        const { n, f } = countdown, lbl = n < 3 ? String(3 - n) : "FIGHT!", sc = 0.6 + ease.back(Math.min(1, f * 2.2)) * 0.5;
        bigText(ctx, lbl, w / 2, h * 0.38, h * (n < 3 ? 0.26 : 0.17), n < 3 ? "#f4f1ea" : "#ffd23f", sc, f > 0.75 ? (1 - f) / 0.25 : 1);
      }
      if (this.state === "ko" && this.koT > 0.4) {
        const wb = this.bots[this.winner], k = ease.back(clamp((this.koT - 0.4) / 0.4, 0, 1));
        if (wb) bigText(ctx, wb.name + " WINS!", w / 2, h * 0.22, h * 0.12, this.winner === 0 ? "#ff8a50" : "#38a7f0", k);
      }
      if (this.state === "idle" && a && b) bigText(ctx, "VS", w / 2, h * 0.42, h * 0.11, "rgba(255,255,255,.3)");
      ctx.restore();
    }
    drawChampion(ctx, w, h, t, dt) {
      this.champT += dt;
      const b = this.champ, s = Math.min(w / 9, h / 5.6), gy = h * 0.84;
      const k = ease.back(clamp(this.champT / 0.6, 0, 1));
      // glow
      const g = ctx.createRadialGradient(w / 2, gy - s * 1.4, 10, w / 2, gy - s * 1.4, s * 3);
      g.addColorStop(0, "rgba(255,210,63,.35)"); g.addColorStop(1, "rgba(255,210,63,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // rays
      ctx.save(); ctx.translate(w / 2, gy - s * 1.4); ctx.rotate(t * 0.2); ctx.fillStyle = "rgba(255,210,63,.08)";
      for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, -w * 0.08); ctx.lineTo(w, w * 0.08); ctx.fill(); }
      ctx.restore();
      // podium
      ctx.fillStyle = "#ffd23f"; rr(ctx, w / 2 - s * 1.5, gy, s * 3, h - gy + 10, 8); ctx.fill();
      ctx.font = `700 ${Math.round(s * 0.35)}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = "#141316";
      ctx.fillText("1", w / 2, gy + s * 0.38);
      const hop = Math.abs(Math.sin(this.champT * 4)) * s * 0.15;
      drawBot(ctx, b, w / 2 - s * 0.2, gy - hop, s * k, 1, t, { lunge: (t % 2) < 0.5 ? (t % 2) / 0.5 : 0 });
      // crown
      ctx.save(); ctx.translate(w / 2 - s * 0.2, gy - hop - s * 2.95 * k); ctx.scale(k, k);
      ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#141316"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-s * 0.4, 0); ctx.lineTo(-s * 0.4, -s * 0.3); ctx.lineTo(-s * 0.2, -s * 0.12); ctx.lineTo(0, -s * 0.38); ctx.lineTo(s * 0.2, -s * 0.12); ctx.lineTo(s * 0.4, -s * 0.3); ctx.lineTo(s * 0.4, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      bigText(ctx, "CHAMPION", w / 2, h * 0.1, h * 0.085, "#ffd23f", k);
      bigText(ctx, b.name + (b.builder ? "  ·  " + b.builder : ""), w / 2, h * 0.19, h * 0.055, "#f4f1ea", k);
      if (Math.random() < 0.08 && !RM) this.fx.burst(Math.random() * w, -10, 6, { colors: COLORS, kind: "confetti", speed: 60, g: 160, life: 3, size: 6, drag: 0.97, angle: Math.PI / 2, spread: 1 });
    }
  }
  window.BattleStage = BattleStage;
})();
