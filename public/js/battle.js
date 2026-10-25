/*
 * BattleStage — draws the arena and plays a list of battle events
 * (from Engine.simulate) with intro, Sense/Think/Act animation and KO.
 * Also shows a champion scene for the end of a tournament.
 * Everything here is presentation: the winner is already decided by the events.
 */
(function () {
  const E = window.Engine;
  const { clamp, ease, bigText, rr, FX, drawBot, COLORS, Sound, RM } = E;
  const DUR = { sense: 0.65, think: 0.75, act: 1.0, stall: 0.8 };
  // When each tool connects, in seconds into its attack: the hammer winds up first, so it lands later.
  const HIT = [0.2, 0.34, 0.22, 0.24, 0.3]; // gripper, hammer, spinner, flipper, drill
  const SPARKS = [["#ffd23f", "#fff", "#ff8a50"], ["#ff8a50", "#ffd23f", "#fff"], ["#fff6c8", "#ffd23f", "#9fdcff"], ["#ffd23f", "#fff", "#c58cff"], ["#ff8a50", "#ffd23f", "#fff6c8"]];

  // How far the attacker has lunged at time t into its attack (0..1; negative = leaning back to wind up).
  function reachAt(tool, t) {
    const hit = HIT[tool], back = tool === 1 ? -0.25 : 0, t0 = tool === 1 ? 0.16 : 0;
    if (tool === 1 && t < t0) return back * ease.out(t / t0);
    if (t < hit) return back + (1 - back) * ease.out((t - t0) / (hit - t0));
    if (t < hit + 0.08) return 1;
    return Math.max(0, 1 - (t - hit - 0.08) / 0.3);
  }
  // Flipper plate angle: slide under the enemy, snap up at the hit, then settle back down.
  function flipAt(t) {
    const hit = HIT[3];
    if (t < hit - 0.04) return 0.3 + 0.15 * (t / (hit - 0.04));
    if (t < hit + 0.04) return 0.45 - 1.75 * ((t - (hit - 0.04)) / 0.08);
    if (t < hit + 0.2) return -1.3;
    return -1.3 + 1.6 * Math.min(1, (t - hit - 0.2) / 0.3);
  }
  // Hammer swing angle: raise it high, slam down (speeding up), hold, then back to rest.
  function hammerAt(t) {
    if (t < 0.16) return -0.5 - 1.6 * ease.out(t / 0.16);
    if (t < 0.34) return -2.1 + 2.8 * Math.pow((t - 0.16) / 0.18, 2);
    if (t < 0.5) return 0.7;
    return 0.7 - 1.2 * Math.min(1, (t - 0.5) / 0.3);
  }

  class BattleStage {
    constructor(canvas, cb = {}) {
      this.c = canvas; this.cb = cb; this.fx = new FX();
      this.bots = [null, null]; this.state = "idle"; this.speed = 1;
      this.hp = [100, 100]; this.brace = [false, false]; this.hurt = [0, 0]; this.dodge = [0, 0]; this.head = [null, null];
      this.queue = []; this.ev = null; this.evT = 0; this.timer = null; this.banner = "";
      this.freeze = 0; this.slow = 0; this.flash = 0; this.zoom = { k: 0, x: 0, y: 0 };
      this.spinA = [0, 0]; this.held = [false, false]; this.ghost = [0, 0]; this.puff = [0, 0]; this.later = []; this.flipT = [0, 0];
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
      Object.assign(this, { bots: [a, b], state: a && b ? "idle" : "empty", hp: [100, 100], brace: [false, false], queue: [], ev: null, banner, champ: null, held: [false, false], later: [], flipT: [0, 0] });
      this.cb.onHP && this.cb.onHP(this.hp, true);
    }
    play(events) {
      if (!this.bots[0] || !this.bots[1]) return;
      clearTimeout(this.timer);
      Object.assign(this, { state: "intro", introT: 0, lastCount: -1, landed: false, queue: events.slice(), ev: null, hp: [100, 100], brace: [false, false], held: [false, false], later: [] });
      this.cb.onHP && this.cb.onHP(this.hp, true);
    }
    skip() {
      if (this.state !== "intro" && this.state !== "fight") return;
      clearTimeout(this.timer); this.ev = null; this.later = [];
      const win = this.queue.pop();
      while (this.queue.length) this.log(this.queue.shift());
      if (win && win.kind === "win") { this.log(win); this.hp = win.hp; this.held = [false, false]; this.cb.onHP && this.cb.onHP(this.hp); this.startKO(win.me); }
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
      const e = this.queue.shift(); this.ev = e; this.evT = 0; this.impactDone = false; this.later = [];
      this.log(e);
      if (e.kind === "sense") Sound.play("scan");
      if (e.kind === "think") { Sound.play("think"); this.brace = e.brace; if (e.bubble === "SHIELD!") { const p = this.pos(e.me); this.fx.ring(p.x, p.mid - p.s * 0.3, p.s * 1.6, "#4fd18b", 0.5, 5); } }
      if (e.kind === "stall") { this.held[e.me] = false; const p = this.pos(e.me); this.fx.text(p.x, p.top, e.flip ? "FLIPPED OVER!" : "STUCK!", "#c58cff", 26); }
      if (e.kind === "win") { this.hp = e.hp; this.held = [false, false]; this.cb.onHP && this.cb.onHP(this.hp); this.startKO(e.me); return; }
      if (e.kind === "act" && e.burst) { const p = this.pos(e.me); this.fx.text(p.x, p.top - 30, "BONUS!", "#38a7f0", 22); }
      this.timer = setTimeout(() => this.next(), (DUR[e.kind] * 1000) / this.speed);
    }
    impact(e) {
      const op = 1 - e.me, p = this.pos(op), tool = this.bots[e.me].tool, side = op === 1 ? -1 : 1;
      const blocked = this.brace[op] && e.hits > 0; // the shield was up when this hit landed
      const hx = p.x + side * p.s * 0.6, hy = p.mid;
      this.hp = e.hp; this.brace = e.brace; this.cb.onHP && this.cb.onHP(this.hp);
      if (e.hits) {
        this.hurt[op] = 1; this.fx.shake = e.crit ? 16 : tool === 1 ? 11 : 8;
        this.freeze = e.crit ? 0.13 : 0.06; // hit-stop: a tiny freeze makes hits feel heavy
        const sparks = (n) => this.fx.burst(hx, hy, n, { colors: SPARKS[tool], speed: tool === 1 ? 380 : 320, g: 500, life: 0.6, size: 4 });
        if (blocked) this.fx.ring(p.x, p.mid - p.s * 0.3, p.s * 1.5, "#4fd18b", 0.45, 6);
        else this.fx.ring(hx, hy, p.s * (e.crit ? 1.3 : 0.8), "#ffffff", 0.3, 4);
        sparks(e.crit ? 36 : 22);
        if (tool === 1) { // the hammer knocks bits loose and thumps the floor
          this.fx.burst(hx, hy, 8, { colors: ["#55535c", "#7a7782", "#3a3940"], kind: "confetti", speed: 260, g: 700, life: 1.1, size: 4, drag: 0.95, angle: -Math.PI / 2, spread: 2.4 });
          this.fx.burst(p.x, p.gy, 10, { colors: ["#4a4852"], kind: "dust", speed: 90, g: -10, life: 0.9, size: 7, drag: 0.9, angle: -Math.PI / 2, spread: 2.6 });
        }
        if (tool === 2 && e.hits > 1) this.later.push({ at: this.evT + 0.12, run: () => { sparks(18); this.fx.ring(hx, hy, p.s * 0.6, "#ffffff", 0.25, 3); this.hurt[op] = 1; } });
        this.fx.text(p.x, p.top, "-" + e.dmg, e.crit ? "#ffd23f" : "#ffffff", e.crit ? 40 : 32);
        if (e.crit) { this.fx.text(p.x, p.top - 34, "CRITICAL!", "#ff8a50", 20); this.flash = 1; this.zoom = { k: 1, x: hx, y: hy }; this.cheer = 1; }
        if (blocked) this.fx.text(p.x, p.top - 34, "BLOCKED!", "#4fd18b", 20);
        if (e.grab) { this.fx.text(p.x, p.top - (e.crit || blocked ? 64 : 34), "GRABBED!", "#c58cff", 22); this.held[op] = true; }
        if (e.flip) { this.fx.text(p.x, p.top - (e.crit || blocked ? 64 : 34), "FLIPPED!", "#c58cff", 24); this.flipT[op] = 1; } // launched into a full flip
        if (e.heavy) this.fx.text(p.x, p.top - 34, "TOO HEAVY!", "#aaa6b0", 18);
        if (e.low) this.fx.text(p.x, p.top - 34, "TOO LOW!", "#aaa6b0", 18);
        if (e.glance) { this.fx.text(p.x, p.top - 34, "GLANCED!", "#aaa6b0", 18); this.fx.burst(hx, hy, 10, { colors: ["#fff6c8", "#aaa6b0"], speed: 360, g: 300, life: 0.4, size: 3, angle: -Math.PI / 2, spread: 1.4 }); }
        Sound.play("hit");
      } else {
        this.dodge[op] = 1; this.ghost[op] = 1;
        this.fx.burst(hx, hy, 6, { colors: ["#aaa6b0", "#ffffff"], speed: 520, g: 0, life: 0.3, size: 5, drag: 0.85, angle: side > 0 ? Math.PI : 0, spread: 0.35 }); // whoosh
        this.fx.text(p.x, p.top, "MISS", "#aaa6b0", 28); Sound.play("miss");
      }
    }
    startKO(w) {
      this.state = "ko"; this.winner = w; this.koT = 0; this.brace = [false, false];
      Sound.play("ko"); setTimeout(() => Sound.play("win"), 700);
      this.fx.shake = 18; this.slow = 0.55; this.cheer = 1.4; // a moment of slow motion, and the crowd goes wild
      const p = this.pos(1 - w);
      this.fx.burst(p.x, p.mid, 14, { colors: ["#8f8b98", "#c9c5d1", "#55535c"], kind: "confetti", speed: 340, g: 650, life: 1.4, size: 4, drag: 0.96, angle: -Math.PI / 2, spread: 2.2 }); // bolts fly off
      this.fx.ring(p.x, p.mid, p.s * 2, "#ff8a50", 0.5, 6);
      setTimeout(() => this.confetti(80), 500);
      this.cb.onDone && setTimeout(() => this.cb.onDone(w), 1600 / this.speed);
    }
    // The parts of the garage arena that never move, drawn once per canvas size.
    backdrop(w, h) {
      if (this.bg && this.bg.w === w && this.bg.h === h) return this.bg.c;
      const dpr = Math.min(2, window.devicePixelRatio || 1), c = document.createElement("canvas");
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const g = c.getContext("2d"); g.scale(dpr, dpr);
      const fy = h * 0.66;
      const wall = g.createLinearGradient(0, 0, 0, fy); wall.addColorStop(0, "#121116"); wall.addColorStop(1, "#211f27");
      g.fillStyle = wall; g.fillRect(0, 0, w, fy);
      g.strokeStyle = "rgba(255,255,255,.045)"; g.lineWidth = 1; // wall panel seams
      for (let k = 1; k < 8; k++) { g.beginPath(); g.moveTo((w / 8) * k, h * 0.2); g.lineTo((w / 8) * k, fy - h * 0.1); g.stroke(); }
      g.fillStyle = "#1b1a20"; g.fillRect(0, h * 0.17, w, h * 0.035); // steel beam with rivets
      g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(0, h * 0.17, w, 1.5);
      g.fillStyle = "rgba(255,255,255,.13)";
      for (let x = w / 32; x < w; x += w / 16) { g.beginPath(); g.arc(x, h * 0.1875, Math.max(1.2, h * 0.004), 0, 7); g.fill(); }
      [w * 0.22, w * 0.78].forEach((x) => { // the lamps the spotlights come from
        g.fillStyle = "#2c2a31"; g.fillRect(x - 1, 0, 2, h * 0.03);
        rr(g, x - w * 0.035, h * 0.03, w * 0.07, h * 0.035, 4); g.fill();
        g.fillStyle = "rgba(255,240,210,.55)"; g.fillRect(x - w * 0.028, h * 0.062, w * 0.056, 2);
      });
      const fg = g.createLinearGradient(0, fy, 0, h); fg.addColorStop(0, "#2e2c35"); fg.addColorStop(1, "#3a3842");
      g.fillStyle = fg; g.fillRect(0, fy, w, h - fy);
      g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1;
      for (let k = -10; k <= 10; k++) { g.beginPath(); g.moveTo(w / 2 + k * w * 0.05, fy); g.lineTo(w / 2 + k * w * 0.16, h); g.stroke(); }
      for (let k = 0; k < 5; k++) { const y = fy + (h - fy) * Math.pow(k / 5, 1.6); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      this.bg = { w, h, c };
      return c;
    }
    drawStage(ctx, w, h, t) {
      const fy = h * 0.66, rail = fy - h * 0.1;
      ctx.drawImage(this.backdrop(w, h), 0, 0, w, h);
      // the crowd in the stands: dim, so the robots stay easy to see, and they jump when something big happens
      const n = 26, cheer = this.cheer || 0;
      ctx.fillStyle = "rgba(9,8,12,.75)";
      for (let i = 0; i < n; i++) {
        const r = h * 0.02 * (0.85 + ((i * 37) % 10) / 30), x = ((i + 0.5) / n) * w + (((i * 53) % 7) - 3) * w * 0.003;
        const y = rail - r * 0.55 - Math.abs(Math.sin(t * (2 + cheer * 6) + i * 1.7)) * h * (0.004 + cheer * 0.018);
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        rr(ctx, x - r * 1.5, y + r * 0.7, r * 3, r * 2.2, r * 0.9); ctx.fill();
      }
      if (cheer > 0 && !RM && Math.random() < cheer * 0.6) (this.flashes = this.flashes || []).push({ x: Math.random() * w, y: rail - h * 0.03 * Math.random(), life: 0.12 }); // camera flashes
      if (this.flashes) {
        this.flashes = this.flashes.filter((f) => (f.life -= 1 / 60) > 0);
        for (const f of this.flashes) { ctx.fillStyle = `rgba(255,255,255,${f.life / 0.12})`; ctx.beginPath(); ctx.arc(f.x, f.y, h * 0.006, 0, 7); ctx.fill(); }
      }
      ctx.fillStyle = "#17161b"; ctx.fillRect(0, rail, w, fy - rail); // front of the stands
      ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.fillRect(0, rail, w, 2);
      const sh = h * 0.022; // hazard stripes along the arena wall
      ctx.save(); ctx.beginPath(); ctx.rect(0, fy - sh, w, sh); ctx.clip();
      ctx.fillStyle = "#29231a"; ctx.fillRect(0, fy - sh, w, sh); ctx.fillStyle = "rgba(244,101,36,.5)";
      for (let x = -sh; x < w + sh; x += sh * 2) { ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x + sh, fy - sh); ctx.lineTo(x + sh * 2, fy - sh); ctx.lineTo(x + sh, fy); ctx.fill(); }
      ctx.restore();
      [[w * 0.22, "rgba(244,101,36,.19)", "rgba(244,101,36,.16)"], [w * 0.78, "rgba(56,167,240,.19)", "rgba(56,167,240,.14)"]].forEach(([sx, c, pool], k) => {
        const sway = Math.sin(t * 0.7 + k * 2) * w * 0.03;
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.85); g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - w * 0.03, h * 0.06); ctx.lineTo(sx + w * 0.03, h * 0.06); ctx.lineTo(sx + w * 0.17 + sway, h * 0.85); ctx.lineTo(sx - w * 0.17 + sway, h * 0.85); ctx.fill();
        const px = sx + sway * 0.9, py = h * 0.8, rg = ctx.createRadialGradient(px, py, 0, px, py, w * 0.16); // light pool on the floor
        rg.addColorStop(0, pool); rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(px, py, w * 0.16, h * 0.07, 0, 0, 7); ctx.fill();
      });
      ctx.font = `700 ${Math.round(h * 0.04)}px "JetBrains Mono", monospace`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.18)";
      if (this.state !== "champ") ctx.fillText(this.banner || "FALL ROBOTICS ACADEMY  ·  BOT ARENA", w / 2, h * 0.135);
      if (this.state !== "champ") {
        ctx.strokeStyle = "rgba(244,101,36,.4)"; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(w / 2, fy); ctx.lineTo(w / 2, h); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.textAlign = "left";
    }
    draw(t, dt) {
      if (!this.c.offsetParent) return;
      const { ctx, w, h } = E.fit(this.c); this.w = w; this.h = h;
      // hit-stop freezes the action for a beat; slow motion stretches the KO
      let tdt = dt;
      if (this.freeze > 0) { this.freeze -= dt; tdt = 0; }
      if (this.slow > 0) { this.slow -= dt; tdt *= 0.35; }
      this.fx.update(tdt);
      this.cheer = Math.max(0, (this.cheer || 0) - dt * 0.8);
      const sp = this.speed;
      ctx.save();
      if (!RM) {
        if (this.zoom.k > 0) { const z = 1 + 0.07 * ease.out(this.zoom.k); ctx.translate(this.zoom.x, this.zoom.y); ctx.scale(z, z); ctx.translate(-this.zoom.x, -this.zoom.y); this.zoom.k = Math.max(0, this.zoom.k - dt * 3.2); }
        if (this.fx.shake) ctx.translate((Math.random() - 0.5) * this.fx.shake, (Math.random() - 0.5) * this.fx.shake);
      }
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
        if (!this.landed && this.introT >= 0.6) { this.landed = true; [0, 1].forEach((j) => { const p = this.pos(j); this.fx.burst(p.x, p.gy, 12, { colors: ["#4a4852"], kind: "dust", speed: 110, g: -10, life: 0.8, size: 7, drag: 0.9, angle: -Math.PI / 2, spread: 3 }); }); }
        const ct = this.introT - 0.7, n = Math.floor(ct / 0.55);
        if (ct >= 0 && n !== this.lastCount) { this.lastCount = n; Sound.play(n < 3 ? "beep" : "go"); }
        if (ct >= 0 && n <= 3) countdown = { n, f: (ct % 0.55) / 0.55 };
        if (ct > 0.55 * 4) { this.state = "fight"; this.next(); }
      }
      const e = this.ev;
      if (e && this.state === "fight") {
        this.evT += tdt * sp;
        const tool = this.bots[e.me].tool;
        if (e.kind === "act" && !this.impactDone && this.evT > HIT[tool]) { this.impactDone = true; this.impact(e); }
        this.later = this.later.filter((l) => (this.evT >= l.at ? (l.run(), false) : true));
      }
      for (let k = 0; k < 2; k++) {
        this.hurt[k] = Math.max(0, this.hurt[k] - tdt * 4); this.dodge[k] = Math.max(0, this.dodge[k] - tdt * 2.5); this.ghost[k] = Math.max(0, this.ghost[k] - tdt * 2.2);
        if (this.flipT[k] > 0) { this.flipT[k] = Math.max(0, this.flipT[k] - tdt * 1.15); if (!this.flipT[k]) { const p = this.pos(k); this.fx.burst(p.x, p.gy, 14, { colors: ["#4a4852"], kind: "dust", speed: 120, g: -10, life: 0.8, size: 7, drag: 0.9, angle: -Math.PI / 2, spread: 3 }); this.fx.shake = Math.max(this.fx.shake, 7); } }
        const attacking = e && this.state === "fight" && e.kind === "act" && e.me === k && this.evT < 0.7;
        this.spinA[k] += tdt * (attacking ? 38 : 9);
      }
      if (this.state === "ko") this.koT += tdt;
      [[a, 0], [b, 1]].forEach(([bt, k]) => {
        if (!bt) return;
        const p = this.pos(k), dir = k === 0 ? 1 : -1, dmg = 1 - this.hp[k] / 100;
        let x = p.x + slide[k], reach = 0, tilt = 0, hop = 0, hammer, clamp2, flipA;
        const acting = e && this.state === "fight" && e.kind === "act" && e.me === k;
        if (acting) {
          reach = reachAt(bt.tool, this.evT);
          x += dir * reach * w * 0.14;
          if (bt.tool === 1) hammer = hammerAt(this.evT);
          if (bt.tool === 3) flipA = flipAt(this.evT);
          if (bt.tool === 0) clamp2 = this.evT < HIT[0] ? -0.4 * (this.evT / HIT[0]) : this.held[1 - k] ? 1 : Math.max(0, 1 - (this.evT - HIT[0] - 0.1) / 0.3);
          // dust from the wheels, treads or feet as it charges in
          if (this.evT < HIT[bt.tool] && Math.random() < tdt * 18) this.fx.burst(x - dir * p.s * 0.5, p.gy, 2, { colors: ["#4a4852"], kind: "dust", speed: 60, g: -10, life: 0.6, size: 6, drag: 0.9, angle: dir > 0 ? Math.PI : 0, spread: 1.2 });
        } else if (bt.tool === 0 && this.held[1 - k]) clamp2 = 1; // still gripping
        if (this.held[k]) { x += Math.sin(t * 40) * p.s * 0.04; hop = p.s * 0.12; } // stuck in the gripper: lifted and shaking
        if (this.dodge[k]) hop = Math.sin(this.dodge[k] * Math.PI) * p.s * 0.5;
        if (this.flipT[k]) { const f = 1 - this.flipT[k]; hop = Math.sin(f * Math.PI) * p.s * 1.4; tilt = -f * Math.PI * 2; } // up, over and down
        if (this.hurt[k]) x -= dir * this.hurt[k] * p.s * 0.25;
        let pose;
        if (this.state === "ko") {
          if (k !== this.winner) {
            tilt = -ease.out(clamp(this.koT / 0.6, 0, 1)) * 1.45;
            if (Math.random() < 0.3) this.fx.burst(x, p.gy - p.s * 0.8, 1, { colors: ["#55535c", "#7a7782"], kind: "smoke", speed: 30, g: -60, life: 1.6, size: 8, drag: 0.95, angle: -Math.PI / 2, spread: 1 });
          } else { hop = Math.abs(Math.sin(this.koT * 6)) * p.s * 0.35 * Math.max(0, 1 - this.koT / 4); if (this.koT > 0.5) pose = "win"; }
        } else if (dmg > 0.65 && this.state !== "intro") {
          // badly damaged robots smoke, and spark when they're nearly out
          this.puff[k] -= tdt;
          if (this.puff[k] <= 0) {
            this.puff[k] = dmg > 0.85 ? 0.14 : 0.32;
            this.fx.burst(x - dir * p.s * 0.2, p.mid - p.s * 0.6, 1, { colors: ["#55535c", "#6d6a75"], kind: "smoke", speed: 25, g: -50, life: 1.4, size: 7, drag: 0.95, angle: -Math.PI / 2, spread: 0.8 });
            if (dmg > 0.85 && Math.random() < 0.5) this.fx.burst(x, p.mid - p.s * 0.4, 4, { colors: ["#ffd23f", "#9fdcff"], speed: 160, g: 400, life: 0.35, size: 3 });
          }
        }
        if (this.ghost[k] && !RM) { // dodge afterimage
          ctx.save(); ctx.globalAlpha = this.ghost[k] * 0.3;
          drawBot(ctx, bt, x + dir * p.s * 0.3, p.gy, p.s, dir, t, { damage: dmg });
          ctx.restore();
        }
        this.head[k] = drawBot(ctx, bt, x, p.gy - hop, p.s, dir, t, { reach, hammer, flipA, clamp: clamp2, spinA: this.spinA[k], spinFast: acting && this.evT < 0.7, hurt: this.hurt[k], tilt, damage: dmg, pose, shield: this.brace[k] && this.state !== "ko" });
        // name plate under each bot
        ctx.font = `700 ${Math.round(p.s * 0.28)}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "center";
        ctx.fillStyle = k === 0 ? "#ff8a50" : "#38a7f0"; ctx.fillText(bt.name, p.x + slide[k], p.gy + p.s * 0.45);
        if (bt.builder) { ctx.font = `500 ${Math.round(p.s * 0.18)}px "JetBrains Mono", monospace`; ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillText("by " + bt.builder, p.x + slide[k], p.gy + p.s * 0.7); }
        ctx.textAlign = "left";
      });
      if (e && this.state === "fight" && (e.kind === "sense" || e.kind === "think") && this.head[e.me]) {
        const p = this.pos(e.me), q = this.pos(1 - e.me), dir = e.me === 0 ? 1 : -1, k = clamp(this.evT / 0.5, 0, 1);
        if (e.kind === "sense") {
          const { headX: hx, headY: hy } = this.head[e.me];
          ctx.save(); ctx.globalAlpha = 0.55;
          const g = ctx.createLinearGradient(hx, 0, q.x, 0); g.addColorStop(0, "rgba(56,167,240,.8)"); g.addColorStop(1, "rgba(56,167,240,.05)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(hx, hy);
          const reachX = hx + (q.x - hx) * ease.out(k);
          ctx.lineTo(reachX, q.mid - q.s * 1.1); ctx.lineTo(reachX, q.mid + q.s * 0.8); ctx.closePath(); ctx.fill();
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
      if (this.state === "ko") {
        if (this.koT < 0.6) { const k = this.koT / 0.6; bigText(ctx, "K.O.!", w / 2, h * 0.36, h * 0.2, "#ff5d5d", 0.7 + ease.back(Math.min(1, k * 3)) * 0.4, k > 0.7 ? (1 - k) / 0.3 : 1); }
        else {
          const wb = this.bots[this.winner], k = ease.back(clamp((this.koT - 0.6) / 0.4, 0, 1));
          if (wb) bigText(ctx, wb.name + " WINS!", w / 2, h * 0.22, h * 0.12, this.winner === 0 ? "#ff8a50" : "#38a7f0", k);
        }
      }
      if (this.state === "idle" && a && b) bigText(ctx, "VS", w / 2, h * 0.42, h * 0.11, "rgba(255,255,255,.3)");
      ctx.restore();
      if (this.flash > 0 && !RM) { ctx.fillStyle = `rgba(255,255,255,${0.16 * this.flash})`; ctx.fillRect(0, 0, w, h); this.flash = Math.max(0, this.flash - dt * 6); }
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
      drawBot(ctx, b, w / 2 - s * 0.2, gy - hop, s * k, 1, t, { pose: "win" });
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
