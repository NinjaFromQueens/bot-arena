/*
 * Bot Arena engine — shared by the server (Node) and the browser.
 * - Part data, bot codes, stats
 * - Deterministic battle simulation (seeded), so the server decides the
 *   winner and the host screen replays the exact same fight.
 * - Browser-only: robot drawing, particle effects, sound.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const isBrowser = typeof window !== "undefined";
  const RM = isBrowser && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

  // ---------------- data ----------------
  const COLORS = ["#f46524", "#38a7f0", "#4fd18b", "#c58cff", "#ffd23f", "#ff5d8f"];
  const BRAIN_COL = ["#ff5d5d", "#4fd18b", "#c58cff"];
  const PARTS = {
    body: [
      { n: "Wheels", d: "Fast but fragile", wt: 25, spd: 8, def: 3 },
      { n: "Treads", d: "Slow tank armor", wt: 40, spd: 3, def: 8 },
      { n: "Legs", d: "Dodgy walker", wt: 30, spd: 6, def: 5 },
    ],
    sensor: [
      { n: "Camera", d: "Best aim", wt: 10, aim: 9 },
      { n: "Ultrasonic", d: "Senses distance, dodges", wt: 6, aim: 6, spd: 1, def: 1 },
      { n: "Touch", d: "Light, weak aim", wt: 2, aim: 3 },
    ],
    brain: [
      { n: "Aggressive", d: "Always attacks", wt: 0, atk: 2, def: -1 },
      { n: "Defensive", d: "Blocks when hurt", wt: 0, def: 2 },
      { n: "Smart", d: "Waits for a big hit", wt: 0, atk: 1, aim: 1 },
    ],
    tool: [
      { n: "Gripper", d: "Can grab and stall", wt: 10, atk: 4 },
      { n: "Hammer", d: "Huge hits", wt: 30, atk: 9, spd: -1 },
      { n: "Spinner", d: "Hits twice", wt: 20, atk: 5 },
    ],
  };
  const MAXW = 75;
  const SLOTS = ["body", "sensor", "brain", "tool"];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function statsOf(b) {
    const s = { atk: 0, def: 0, spd: 0, aim: 0, wt: 0 };
    SLOTS.forEach((k) => { const p = PARTS[k][b[k]]; for (const f in s) s[f] += p[f] || 0; });
    return s;
  }
  function cleanName(n, max = 10) {
    return String(n || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, max);
  }
  // Validate anything that arrives from a client.
  function sanitizeBot(b) {
    if (!b || typeof b !== "object") return null;
    const out = { name: cleanName(b.name) || "BOT" };
    for (const k of SLOTS) { const v = +b[k]; if (!Number.isInteger(v) || v < 0 || v > 2) return null; out[k] = v; }
    const c = +b.color; if (!Number.isInteger(c) || c < 0 || c >= COLORS.length) return null; out.color = c;
    if (statsOf(out).wt > MAXW) return null;
    return out;
  }
  const codeOf = (b) => `${b.name || "BOT"}-${b.body}${b.sensor}${b.brain}${b.tool}${b.color}`;
  function parseCode(c) {
    const m = String(c).trim().toUpperCase().replace(/\s+/g, "").match(/^([A-Z0-9]{1,10})-?([0-2])([0-2])([0-2])([0-2])([0-5])$/);
    return m ? { name: m[1], body: +m[2], sensor: +m[3], brain: +m[4], tool: +m[5], color: +m[6] } : null;
  }

  // ---------------- deterministic battle ----------------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function simulate(a, b, seed) {
    const rnd = rng(seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed);
    const S = [statsOf(a), statsOf(b)], bots = [a, b], H = [100, 100], ev = [];
    const brace = [false, false], stall = [false, false];
    const push = (e) => ev.push({ ...e, hp: [...H], brace: [...brace] });
    let turn = S[0].spd + rnd() * 3 >= S[1].spd + rnd() * 3 ? 0 : 1;
    for (let round = 0; round < 44 && H[0] > 0 && H[1] > 0; round++) {
      const me = turn, op = 1 - turn, m = bots[me], o = bots[op];
      turn = op;
      if (stall[me]) { stall[me] = false; push({ me, kind: "stall", txt: " is stuck in the gripper and loses a turn!" }); continue; }
      const dodge = (o.body === 2 ? 8 : 0) + (o.sensor === 1 ? 5 : 0) + S[op].spd;
      let chance = clamp(55 + S[me].aim * 4 - dodge, 25, 95);
      push({ me, kind: "sense", txt: `'s ${PARTS.sensor[m.sensor].n.toLowerCase()} spots the enemy (${Math.round(chance)}% chance to hit).` });
      if (m.brain === 1 && H[me] < 45 && !brace[me] && rnd() < 0.6) {
        brace[me] = true; push({ me, kind: "think", txt: " is hurt, so it decides to block.", bubble: "BLOCK!" }); continue;
      }
      let bonus = 0;
      if (m.brain === 2 && chance < 70 && rnd() < 0.5) { chance += 20; bonus = 3; push({ me, kind: "think", txt: " waits for a better angle. Aim goes up!", bubble: "AIMING..." }); }
      else if (m.brain === 0) push({ me, kind: "think", txt: " decides: ATTACK!", bubble: "ATTACK!" });
      else push({ me, kind: "think", txt: " decides to attack.", bubble: "GO!" });
      const swings = m.tool === 2 ? 2 : 1; let total = 0, hits = 0;
      for (let k = 0; k < swings; k++) {
        if (rnd() * 100 < (swings === 2 ? chance - 10 : chance)) {
          let dmg = S[me].atk * 2 + bonus + Math.floor(rnd() * 6) - S[op].def;
          if (m.tool === 2) dmg = Math.round(dmg * 0.65);
          if (brace[op]) dmg = Math.round(dmg / 2);
          total += Math.max(3, dmg); hits++;
        }
      }
      if (brace[op] && hits) brace[op] = false;
      H[op] = Math.max(0, H[op] - total);
      const tool = PARTS.tool[m.tool].n.toLowerCase();
      let grab = false;
      if (hits && m.tool === 0 && rnd() < 0.3 && H[op] > 0) { stall[op] = true; grab = true; }
      push({ me, kind: "act", hits, dmg: total, grab, crit: total >= 20,
        txt: hits ? `'s ${tool} hits${swings === 2 ? ` ${hits}x` : ""} for ${total} damage!${grab ? " It grabs the enemy!" : ""}` : ` swings the ${tool}... and misses!` });
    }
    const w = H[0] === H[1] ? (rnd() < 0.5 ? 0 : 1) : H[0] > H[1] ? 0 : 1;
    push({ me: w, kind: "win", txt: " WINS!" });
    return { events: ev, winner: w };
  }

  // ---------------- browser-only: drawing, effects, sound ----------------
  function fit(c) {
    const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => clamp(Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt), 0, 255);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  const ease = { out: (t) => 1 - Math.pow(1 - t, 3), back: (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };
  function bigText(ctx, lbl, x, y, size, color, scale = 1, alpha = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
    ctx.font = `700 ${Math.round(size)}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(4, size * 0.08); ctx.lineJoin = "round"; ctx.strokeStyle = "#141316"; ctx.strokeText(lbl, 0, 0);
    ctx.fillStyle = color; ctx.fillText(lbl, 0, 0); ctx.restore();
  }

  class FX {
    constructor() { this.p = []; this.txt = []; this.shake = 0; }
    burst(x, y, n, o = {}) {
      if (RM) n = Math.ceil(n / 3);
      for (let i = 0; i < n; i++) {
        const a = (o.angle ?? 0) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2), sp = (o.speed ?? 200) * (0.4 + Math.random() * 0.8);
        const cols = o.colors || ["#ffd23f"];
        this.p.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: (o.life ?? 0.6) * (0.6 + Math.random() * 0.6),
          size: (o.size ?? 4) * (0.6 + Math.random() * 0.8), color: cols[(Math.random() * cols.length) | 0], g: o.g ?? 400,
          kind: o.kind || "spark", rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, drag: o.drag ?? 0.9 });
      }
    }
    text(x, y, s, color, size = 28) { this.txt.push({ x, y, s, color, size, life: 0, max: 1.1 }); }
    update(dt) {
      this.shake = Math.max(0, this.shake - dt * 30);
      this.p = this.p.filter((q) => (q.life += dt) < q.max);
      for (const q of this.p) {
        const d = Math.pow(q.drag, dt * 10); q.vx *= d; q.vy = q.vy * d + q.g * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      }
      this.txt = this.txt.filter((t) => (t.life += dt) < t.max);
    }
    draw(ctx) {
      for (const q of this.p) {
        const k = 1 - q.life / q.max, soft = q.kind === "smoke" || q.kind === "dust";
        ctx.globalAlpha = soft ? k * 0.55 : Math.min(1, k * 1.6);
        ctx.fillStyle = q.color;
        if (q.kind === "spark") { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.atan2(q.vy, q.vx)); ctx.fillRect(-q.size * 1.6, -q.size / 3, q.size * 3.2, q.size / 1.5); ctx.restore(); }
        else if (q.kind === "confetti") { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-q.size, -q.size / 2, q.size * 2, q.size); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (soft ? 1 + q.life * 2.5 : 1), 0, 7); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      for (const t of this.txt) {
        const k = t.life / t.max, sc = k < 0.15 ? ease.back(k / 0.15) : 1;
        bigText(ctx, t.s, t.x, t.y - k * 50, t.size, t.color, sc, k > 0.7 ? (1 - k) / 0.3 : 1);
      }
    }
  }

  // x = center, gy = ground y, s = unit size, dir 1 faces right.
  // o: lunge 0..1, hurt 0..1, tilt (rad), shield, bob
  function drawBot(ctx, b, x, gy, s, dir, t, o = {}) {
    const col = COLORS[b.color], ink = "#141316", metal = "#8f8b98", metalHi = "#c9c5d1";
    const lw = Math.max(1.5, s * 0.05);
    ctx.save(); ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath();
    ctx.ellipse(x, gy + 2, s * 1.05 * (o.tilt ? 1.3 : 1), s * 0.14, 0, 0, 7); ctx.fill(); ctx.restore();

    ctx.save(); ctx.translate(x, gy);
    if (o.tilt) ctx.rotate(o.tilt * dir);
    ctx.scale(dir, 1);
    const bob = o.bob ?? Math.sin(t * 3 + b.color) * s * 0.025;
    ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = ink;

    let torsoBottom;
    if (b.body === 0) {
      [-0.55, 0.55].forEach((wx) => {
        ctx.fillStyle = "#222126"; ctx.beginPath(); ctx.arc(wx * s, -0.32 * s, 0.32 * s, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(wx * s, -0.32 * s, 0.14 * s, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = metalHi; ctx.lineWidth = lw * 0.8;
        for (let k = 0; k < 3; k++) { const a = t * 5 + k * 2.09; ctx.beginPath(); ctx.moveTo(wx * s + Math.cos(a) * 0.16 * s, -0.32 * s + Math.sin(a) * 0.16 * s); ctx.lineTo(wx * s + Math.cos(a) * 0.27 * s, -0.32 * s + Math.sin(a) * 0.27 * s); ctx.stroke(); }
        ctx.strokeStyle = ink; ctx.lineWidth = lw;
      });
      ctx.fillStyle = metal; rr(ctx, -0.6 * s, -0.5 * s, 1.2 * s, 0.14 * s, 0.05 * s); ctx.fill(); ctx.stroke();
      torsoBottom = -0.48 * s;
    } else if (b.body === 1) {
      ctx.fillStyle = "#222126"; rr(ctx, -0.98 * s, -0.52 * s, 1.96 * s, 0.52 * s, 0.26 * s); ctx.fill(); ctx.stroke();
      ctx.save(); rr(ctx, -0.98 * s, -0.52 * s, 1.96 * s, 0.52 * s, 0.26 * s); ctx.clip();
      ctx.fillStyle = "#3a3940"; const off = (t * 40) % (0.2 * s);
      for (let k = -1; k < 12; k++) ctx.fillRect(-0.98 * s + k * 0.2 * s + off, -0.52 * s, 0.08 * s, 0.07 * s);
      ctx.restore();
      for (let k = 0; k < 5; k++) { ctx.fillStyle = metal; ctx.beginPath(); ctx.arc((-0.68 + k * 0.34) * s, -0.26 * s, 0.11 * s, 0, 7); ctx.fill(); ctx.stroke(); }
      torsoBottom = -0.5 * s;
    } else {
      const st = Math.sin(t * 5) * 0.1 * s;
      [[-0.38, st], [0.38, -st]].forEach(([lx, sv]) => {
        ctx.strokeStyle = ink; ctx.lineWidth = s * 0.17;
        ctx.beginPath(); ctx.moveTo(lx * s, -0.78 * s); ctx.lineTo(lx * s + sv, -0.4 * s); ctx.lineTo(lx * s, -0.06 * s); ctx.stroke();
        ctx.strokeStyle = metal; ctx.lineWidth = s * 0.11;
        ctx.beginPath(); ctx.moveTo(lx * s, -0.78 * s); ctx.lineTo(lx * s + sv, -0.4 * s); ctx.lineTo(lx * s, -0.06 * s); ctx.stroke();
        ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(lx * s + sv, -0.4 * s, 0.07 * s, 0, 7); ctx.fill();
        ctx.fillStyle = "#222126"; rr(ctx, lx * s - 0.22 * s, -0.1 * s, 0.44 * s, 0.1 * s, 0.04 * s); ctx.fill();
      });
      ctx.strokeStyle = ink; ctx.lineWidth = lw;
      torsoBottom = -0.74 * s;
    }
    ctx.translate(0, bob);

    const tw = 1.3 * s, th = 0.95 * s, ty = torsoBottom - th;
    const g = ctx.createLinearGradient(0, ty, 0, ty + th);
    g.addColorStop(0, shade(col, 0.28)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.3));
    ctx.fillStyle = g; rr(ctx, -tw / 2, ty, tw, th, 0.16 * s); ctx.fill(); ctx.stroke();
    if (o.hurt) { ctx.globalAlpha = o.hurt * 0.8; ctx.fillStyle = "#fff"; rr(ctx, -tw / 2, ty, tw, th, 0.16 * s); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = "rgba(0,0,0,.25)"; rr(ctx, -tw / 2 + 0.14 * s, ty + 0.42 * th, tw - 0.28 * s, 0.4 * th, 0.07 * s); ctx.fill();
    for (let k = 0; k < 3; k++) {
      const on = (Math.floor(t * 3) + k) % 3 === 0;
      ctx.fillStyle = on ? BRAIN_COL[b.brain] : "rgba(255,255,255,.18)";
      ctx.beginPath(); ctx.arc(-0.3 * s + k * 0.2 * s, ty + 0.62 * th, 0.055 * s, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,.35)"; rr(ctx, -tw / 2 + 0.1 * s, ty + 0.08 * s, tw * 0.45, 0.07 * s, 0.03 * s); ctx.fill();
    ctx.fillStyle = ink; [-1, 1].forEach((sx) => { ctx.beginPath(); ctx.arc(sx * (tw / 2 - 0.1 * s), ty + 0.24 * s, 0.03 * s, 0, 7); ctx.fill(); });

    const hw = 0.82 * s, hh = 0.56 * s, hy = ty - hh - 0.1 * s;
    ctx.fillStyle = metal; rr(ctx, -0.1 * s, ty - 0.13 * s, 0.2 * s, 0.16 * s, 0.03 * s); ctx.fill(); ctx.stroke();
    const hg = ctx.createLinearGradient(0, hy, 0, hy + hh); hg.addColorStop(0, "#ece8f0"); hg.addColorStop(1, "#a9a5b2");
    ctx.fillStyle = hg; rr(ctx, -hw / 2, hy, hw, hh, 0.14 * s); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.18 * s, hy); ctx.lineTo(-0.24 * s, hy - 0.22 * s); ctx.stroke();
    ctx.save(); ctx.shadowColor = BRAIN_COL[b.brain]; ctx.shadowBlur = 10 + 6 * Math.sin(t * 5);
    ctx.fillStyle = BRAIN_COL[b.brain]; ctx.beginPath(); ctx.arc(-0.24 * s, hy - 0.26 * s, 0.07 * s, 0, 7); ctx.fill(); ctx.restore();
    const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
    if (b.sensor === 0) {
      ctx.fillStyle = "#222126"; ctx.beginPath(); ctx.arc(0.12 * s, hy + hh / 2, 0.2 * s, 0, 7); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(0.12 * s, hy + hh / 2); ctx.scale(1, blink);
      const eg = ctx.createRadialGradient(-0.03 * s, -0.03 * s, 0, 0, 0, 0.11 * s); eg.addColorStop(0, "#bfe6ff"); eg.addColorStop(1, "#1d7fc4");
      ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(0, 0, 0.11 * s, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-0.04 * s, -0.04 * s, 0.03 * s, 0, 7); ctx.fill(); ctx.restore();
    } else if (b.sensor === 1) {
      [-0.1, 0.22].forEach((ex) => {
        ctx.fillStyle = "#c9c5d1"; ctx.beginPath(); ctx.arc(ex * s, hy + hh / 2, 0.15 * s, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#222126"; ctx.beginPath(); ctx.arc(ex * s, hy + hh / 2, 0.1 * s, 0, 7); ctx.fill();
        ctx.strokeStyle = "#555"; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.arc(ex * s, hy + hh / 2, 0.06 * s, 0, 7); ctx.stroke();
        ctx.strokeStyle = ink; ctx.lineWidth = lw;
      });
    } else {
      ctx.save(); ctx.translate(0.12 * s, hy + hh * 0.42); ctx.scale(1, blink);
      ctx.fillStyle = "#222126"; ctx.beginPath(); ctx.arc(0, 0, 0.075 * s, 0, 7); ctx.fill(); ctx.restore();
      ctx.lineWidth = lw * 0.8;
      [-0.22, 0, 0.22].forEach((a, k) => {
        const wig = Math.sin(t * 6 + k) * 0.04 * s;
        ctx.beginPath(); ctx.moveTo(hw / 2 - 0.02 * s, hy + hh * 0.66); ctx.quadraticCurveTo(hw / 2 + 0.2 * s, hy + hh * 0.66 + a * s * 0.5 + wig, hw / 2 + 0.38 * s, hy + hh * 0.66 + a * s + wig); ctx.stroke();
      });
      ctx.lineWidth = lw;
    }
    ctx.fillStyle = "rgba(255,255,255,.5)"; rr(ctx, -hw / 2 + 0.08 * s, hy + 0.06 * s, hw * 0.35, 0.05 * s, 0.02 * s); ctx.fill();

    const l = o.lunge || 0, reach = Math.sin(l * Math.PI) * 0.5 * s;
    const sx = tw / 2 - 0.06 * s, sy = ty + 0.32 * th, ex = sx + 0.45 * s + reach, ey = sy + 0.05 * s;
    ctx.strokeStyle = ink; ctx.lineWidth = s * 0.16; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = metal; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(sx, sy, 0.07 * s, 0, 7); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = lw;
    if (b.tool === 0) {
      const open = (0.18 - 0.14 * Math.sin(l * Math.PI)) * s;
      ctx.lineWidth = s * 0.1;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + 0.24 * s, ey - open); ctx.lineTo(ex + 0.4 * s, ey - 0.03 * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + 0.24 * s, ey + open); ctx.lineTo(ex + 0.4 * s, ey + 0.03 * s); ctx.stroke();
      ctx.lineWidth = lw;
    } else if (b.tool === 1) {
      const sw = -0.5 + Math.sin(l * Math.PI) * 1.1;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(sw);
      ctx.fillStyle = "#6b4a2f"; rr(ctx, 0, -0.05 * s, 0.28 * s, 0.1 * s, 0.03 * s); ctx.fill(); ctx.stroke();
      const hg2 = ctx.createLinearGradient(0.24 * s, 0, 0.52 * s, 0); hg2.addColorStop(0, "#5c5a63"); hg2.addColorStop(1, "#2a292e");
      ctx.fillStyle = hg2; rr(ctx, 0.24 * s, -0.3 * s, 0.28 * s, 0.6 * s, 0.06 * s); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else {
      ctx.save(); ctx.translate(ex + 0.24 * s, ey); ctx.rotate(t * (l > 0 ? 40 : 9));
      ctx.fillStyle = "#3a3940"; ctx.beginPath(); ctx.arc(0, 0, 0.28 * s, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e9e6ee";
      for (let k = 0; k < 3; k++) { ctx.rotate(2.094); ctx.beginPath(); ctx.moveTo(0.1 * s, -0.06 * s); ctx.lineTo(0.36 * s, -0.02 * s); ctx.lineTo(0.3 * s, 0.07 * s); ctx.lineTo(0.1 * s, 0.06 * s); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(0, 0, 0.07 * s, 0, 7); ctx.fill();
      ctx.restore();
    }
    if (o.shield) {
      ctx.save(); ctx.globalAlpha = 0.22 + 0.1 * Math.sin(t * 8);
      ctx.fillStyle = "#4fd18b"; ctx.strokeStyle = "#4fd18b"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, (hy + torsoBottom) / 2 - 0.05 * s, 1.2 * s, 1.25 * s, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    return { headX: x + dir * 0.12 * s, headY: gy + hy + bob + hh / 2 };
  }

  // Small static portrait of a bot on a canvas element (lobby cards, roster rows).
  function portrait(canvas, b, bg = "#2b2a30") {
    const ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg; rr(ctx, 0, 0, w, h, w * 0.18); ctx.fill();
    const s = Math.min(w, h) * 0.27;
    drawBot(ctx, b, w * 0.43, h * 0.92, s, 1, 0, { bob: 0 });
  }

  // ---------------- sound (off until turned on) ----------------
  const Sound = (() => {
    let actx = null, on = false;
    function tone(freq, dur, type = "square", vol = 0.08, slideTo) {
      if (!on || !actx) return;
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
    }
    function noise(dur, vol = 0.12, hp = 600) {
      if (!on || !actx) return;
      const len = Math.floor(actx.sampleRate * dur), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
      f.type = "highpass"; f.frequency.value = hp; g.gain.value = vol;
      src.buffer = buf; src.connect(f).connect(g).connect(actx.destination); src.start();
    }
    const fx = {
      click: () => tone(660, 0.05, "square", 0.04),
      beep: () => tone(520, 0.12, "square", 0.06),
      go: () => tone(880, 0.25, "square", 0.07),
      join: () => { tone(660, 0.08, "square", 0.05); setTimeout(() => tone(990, 0.12, "square", 0.05), 80); },
      scan: () => tone(1200, 0.18, "sine", 0.04, 1800),
      think: () => tone(420, 0.1, "triangle", 0.05, 560),
      hit: () => { noise(0.18, 0.18, 300); tone(140, 0.18, "sawtooth", 0.08, 60); },
      miss: () => tone(900, 0.18, "sine", 0.05, 300),
      ko: () => { tone(400, 0.7, "sawtooth", 0.07, 60); noise(0.5, 0.1, 200); },
      win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, "square", 0.06), i * 120)); },
      fanfare: () => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.22, "square", 0.07), i * 140)); },
    };
    return {
      get on() { return on; },
      toggle() {
        on = !on;
        if (on && !actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { on = false; } }
        if (on) fx.go();
        return on;
      },
      play(name) { try { fx[name] && fx[name](); } catch {} },
    };
  })();

  return { COLORS, BRAIN_COL, PARTS, MAXW, SLOTS, clamp, statsOf, cleanName, sanitizeBot, codeOf, parseCode, rng, simulate,
    fit, rr, shade, ease, bigText, FX, drawBot, portrait, Sound, RM };
});
