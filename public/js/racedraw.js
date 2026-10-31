/* Robot Racer drawing, shared by the race page and the board's Race Day page (browser only).
   A pseudo-3D road like old arcade racers: segments projected near to far (a hill crest hides what's behind it),
   then scenery and other karts far to near. Each track has a theme: colors, haze, sky and scenery. */
(function () {
  const E = window.Engine, R = window.Race;
  const { clamp, rr, RM } = E;
  const SEG = R.SEG, DRAW = 160, DEPTH = 1 / Math.tan((96 / 2) * Math.PI / 180), BEND = 0.65, CAM_H = 1.7, CAM_BACK = 4.4;

  // ---------------- themes ----------------
  const THEMES = {
    dusk: { sky: ["#151330", "#4a2f57", "#d2683d"], sun: ["#ffd88a", 0.72, 0.62, 0.06], hills: ["#2c2140", "#221a30"], grass: ["#2f6b3c", "#2a6236"],
      road: ["#4b4753", "#46424e"], rumble: ["#f4f1ea", "#f46524"], line: "#e9e3d4", wall: ["#6d6875", "#5c5864"], haze: "#5a3a60", skyline: "#1a1426", windows: "#ffd27a" },
    desert: { sky: ["#2d5d9c", "#7fb0da", "#f3c88f"], sun: ["#fff6d2", 0.26, 0.34, 0.055], hills: ["#c9804e", "#a8603a"], grass: ["#d8a466", "#cd975a"],
      road: ["#5d5651", "#57504b"], rumble: ["#f4f1ea", "#d43d2a"], line: "#f4f1ea", wall: ["#a8764f", "#966844"], haze: "#efc48f", mesas: true },
    night: { sky: ["#04030b", "#110b28", "#2b1252"], moon: ["#e8ecff", 0.8, 0.28, 0.04], hills: ["#1b1340", "#110b2a"], grass: ["#0f1822", "#0c141d"],
      road: ["#1d1b27", "#1a1823"], rumble: ["#ff3ea5", "#3ee8ff"], line: "#3ee8ff", wall: ["#2d2448", "#261e3e"], haze: "#2b1450", stars: true, neon: true },
  };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mixCache = new Map();
  function mix(a, b, f) { // blend color a toward b (the haze) by f, in 12 steps so the cache stays small
    const k = a + b + Math.round(f * 12);
    let c = mixCache.get(k);
    if (!c) { const A = rgb(a), B = rgb(b), q = Math.round(f * 12) / 12; c = `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * q)).join(",")})`; mixCache.set(k, c); }
    return c;
  }

  // ---------------- scenery (seeded, so every device sees the same track) ----------------
  const sceneryCache = {};
  function scenery(track) {
    if (sceneryCache[track.id]) return sceneryCache[track.id];
    const th = THEMES[track.theme], rnd = E.rng(11 + track.id * 7), N = track.segs.length, out = track.segs.map(() => []), W = R.WALL;
    const side = () => (rnd() < 0.5 ? -1 : 1);
    track.segs.forEach((_, i) => {
      if (track.theme === "dusk") {
        if (i % 3 === 0) out[i].push({ k: "tree", x: side() * (W + 2 + rnd() * 10), s: 0.8 + rnd() * 0.7 });
        if (i % 8 === 2) out[i].push({ k: "lamp", x: -(R.ROAD + 1.4) }, { k: "lamp", x: R.ROAD + 1.4 });
        if (i % 6 === 1) out[i].push({ k: "building", x: side() * (W + 14 + rnd() * 16), h: 8 + rnd() * 14, w: 5 + rnd() * 5 });
      } else if (track.theme === "desert") {
        if (i % 4 === 0) out[i].push({ k: "cactus", x: side() * (W + 2 + rnd() * 12), s: 0.7 + rnd() * 0.8 });
        if (i % 7 === 3) out[i].push({ k: "rock", x: side() * (W + 3 + rnd() * 14), s: 0.6 + rnd() * 1.2 });
      } else {
        if (i % 4 === 0) out[i].push({ k: "neon", x: -(R.ROAD + 1.2), c: i % 8 ? "#ff3ea5" : "#3ee8ff" }, { k: "neon", x: R.ROAD + 1.2, c: i % 8 ? "#3ee8ff" : "#ff3ea5" });
        if (i % 9 === 5) out[i].push({ k: "pine", x: side() * (W + 3 + rnd() * 10), s: 0.9 + rnd() * 0.8 });
      }
    });
    track.SECTIONS.forEach((sec, si) => {
      const first = track.segs.findIndex((s) => s.sec === si), prev = track.SECTIONS[si - 1];
      if (sec.k && Math.abs(sec.k) >= 1 / 20 && !(prev && prev.n === sec.n)) for (let j = 1; j <= 4; j++) out[(first - j * 2 + N) % N].push({ k: "chevron", x: (sec.k > 0 ? -1 : 1) * (R.ROAD + 1.3), dir: sec.k > 0 ? 1 : -1 });
      if (sec.slope >= 0.2 && !(prev && prev.slope >= 0.2)) out[(first - 10 + N) % N].push({ k: "sign", x: R.ROAD + 1.6, text: `${sec.n.toUpperCase()} ${Math.round(sec.slope * 100)}%` });
      if (sec.n === track.keys.corner && !(prev && prev.n === sec.n)) for (let j = 0; j < sec.len / SEG; j += 2) out[(first + j) % N].push({ k: "cone", x: (sec.k > 0 ? 1 : -1) * (R.ROAD + 0.4) });
    });
    for (let i = 4; i < 22; i += 3) out[i].push({ k: "stand", x: -(W + 3.5) }, { k: "stand", x: W + 3.5 }); // grandstands along the start
    out[2].push({ k: "gantry" });
    out[Math.floor(N * 0.5)].push({ k: "board", x: -(W + 2.5), text: "FALL ROBOTICS ACADEMY" });
    out[Math.floor(N * 0.75)].push({ k: "board", x: W + 2.5, text: "ROBOT RACER" });
    return (sceneryCache[track.id] = out);
  }

  // ---------------- a top-down map of the track (bent a little so the loop closes) ----------------
  const mapCache = {};
  function trackMap(track) {
    if (mapCache[track.id]) return mapCache[track.id];
    const turn = track.segs.reduce((a, s) => a + s.k * SEG, 0), target = turn < 0 ? -2 * Math.PI : 2 * Math.PI, dk = (target - turn) / track.LENGTH;
    let th = 0, x = 0, y = 0; const pts = [[0, 0]];
    for (const s of track.segs) { th += (s.k + dk) * SEG; x += Math.sin(th) * SEG; y -= Math.cos(th) * SEG; pts.push([x, y]); }
    const n = pts.length - 1, gx = x, gy = y;
    const P = pts.map(([px, py], i) => [px - (gx * i) / n, py - (gy * i) / n]);
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), sz = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0);
    return (mapCache[track.id] = P.map(([px, py]) => [(px - x0) / sz, (py - y0) / sz]));
  }
  // the map with a dot per car; cars: [{ z, color, me, name }]
  function minimap(ctx, x, y, size, track, cars) {
    const pts = trackMap(track), pad = size * 0.08, s = size - pad * 2, at = (z) => { const i = clamp(((z % track.LENGTH) + track.LENGTH) % track.LENGTH / SEG, 0, pts.length - 1); const a = pts[Math.floor(i)], b = pts[Math.min(pts.length - 1, Math.floor(i) + 1)], f = i % 1; return [x + pad + (a[0] + (b[0] - a[0]) * f) * s, y + pad + (a[1] + (b[1] - a[1]) * f) * s]; };
    ctx.save();
    ctx.fillStyle = "rgba(20,19,22,.62)"; rr(ctx, x, y, size, size, 12); ctx.fill();
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = Math.max(4, size * 0.05); ctx.beginPath(); pts.forEach((p, i) => { const q = [x + pad + p[0] * s, y + pad + p[1] * s]; i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = Math.max(1.5, size * 0.014); ctx.stroke();
    const [sx, sy] = at(0); ctx.fillStyle = "#f4f1ea"; ctx.fillRect(sx - 4, sy - 1.5, 8, 3);
    cars.filter((c) => !c.me).forEach((c) => { const [cx, cy] = at(c.z); ctx.fillStyle = c.color; ctx.strokeStyle = "#141316"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, size * 0.028), 0, 7); ctx.fill(); ctx.stroke(); });
    cars.filter((c) => c.me).forEach((c) => { const [cx, cy] = at(c.z); ctx.fillStyle = c.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, Math.max(4.5, size * 0.04), 0, 7); ctx.fill(); ctx.stroke(); });
    ctx.restore();
  }

  // ---------------- sky ----------------
  const starField = Array.from({ length: 90 }, (_, i) => [((i * 97) % 101) / 101, ((i * 53) % 89) / 89, 0.6 + ((i * 31) % 7) / 6]);
  function hills(ctx, w, horizon, h, off, col, amp, seed, flat) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, horizon + 1);
    const step = w / 12, o = ((off % w) + w) % w;
    for (let k = -1; k <= 13; k++) {
      const xx = k * step - (o % step), id = k + Math.floor(o / step), hh = h * amp * (0.35 + 0.65 * Math.abs(Math.sin(id * seed)));
      if (flat) { ctx.lineTo(xx, horizon - hh * 0.4); ctx.lineTo(xx + step * 0.12, horizon - hh); ctx.lineTo(xx + step * 0.75, horizon - hh); ctx.lineTo(xx + step * 0.87, horizon - hh * 0.4); } // mesas: flat tops
      else ctx.lineTo(xx, horizon - hh);
    }
    ctx.lineTo(w, horizon + 1); ctx.closePath(); ctx.fill();
  }
  function sky(ctx, w, h, horizon, th, t, bgX) {
    const g = ctx.createLinearGradient(0, 0, 0, horizon); g.addColorStop(0, th.sky[0]); g.addColorStop(0.6, th.sky[1]); g.addColorStop(1, th.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (th.stars) { ctx.fillStyle = "#fff"; for (const [sx, sy, sz] of starField) { ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + sx * 50); ctx.fillRect(sx * w, sy * horizon * 0.9, sz, sz); } ctx.globalAlpha = 1; }
    const orb = th.sun || th.moon;
    if (orb) {
      const ox = ((orb[1] * w - bgX * 0.05) % w + w) % w, oy = horizon * orb[2], r = h * orb[3];
      const glow = ctx.createRadialGradient(ox, oy, r * 0.5, ox, oy, r * 4); glow.addColorStop(0, orb[0] + "66"); glow.addColorStop(1, orb[0] + "00");
      ctx.fillStyle = glow; ctx.fillRect(ox - r * 4, oy - r * 4, r * 8, r * 8);
      ctx.fillStyle = orb[0]; ctx.beginPath(); ctx.arc(ox, oy, r, 0, 7); ctx.fill();
    }
    hills(ctx, w, horizon, h, bgX * 0.12, th.hills[0], 0.12, 1.7, th.mesas);
    if (th.skyline) { // a city skyline with lit windows
      const o = ((bgX * 0.25) % w + w) % w;
      for (let k = -1; k < 26; k++) {
        const bx = k * (w / 24) - (o % (w / 24)), id = k + Math.floor(o / (w / 24)), bh = h * (0.04 + 0.09 * Math.abs(Math.sin(id * 2.3))), bw = w / 24 - 3;
        ctx.fillStyle = th.skyline; ctx.fillRect(bx, horizon - bh, bw, bh);
        ctx.fillStyle = th.windows; for (let wy = horizon - bh + 4; wy < horizon - 4; wy += 7) for (let wx = bx + 3; wx < bx + bw - 3; wx += 6) if (Math.sin(wx * 12.9 + wy * 7.3 + id) > 0.35) ctx.fillRect(wx, wy, 2, 3);
      }
    }
    hills(ctx, w, horizon, h, bgX * 0.35, th.hills[1], 0.07, 2.9, th.mesas);
  }

  // ---------------- the road and everything on it ----------------
  function roadY(track, z) { const N = track.segs.length, L = track.LENGTH, zz = ((z % L) + L) % L, i = Math.floor(zz / SEG), f = zz / SEG - i; return track.segs[i].y + (track.segs[(i + 1) % N].y - track.segs[i].y) * f; }
  function quad(ctx, c, x1, y1, x2, y2, x3, y3, x4, y4) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill(); }
  /* Draw the world from behind cam (a car: { z, x }). cars: [{ z, x, color, name, ghost, me, brake, steer, v }] (me is drawn
     separately by the caller as the big kart in front). o: { t, bgX, lights: 0-5 red lights on, or "go" }. Returns where the
     camera car sits on screen, so the caller can draw it. */
  function world(ctx, w, h, track, cam, cars, o) {
    const th = THEMES[track.theme], half = w / 2, horizon = h * 0.43, N = track.segs.length, L = track.LENGTH;
    const camZ = cam.z - CAM_BACK, camX = cam.x * 0.7, camY = roadY(track, cam.z) + CAM_H;
    sky(ctx, w, h, horizon, th, o.t, o.bgX || 0);
    const cz = ((camZ % L) + L) % L, base = Math.floor(cz / SEG), pct = (cz % SEG) / SEG;
    let x = 0, dx = -track.segs[base].k * SEG * SEG * BEND * pct, maxy = h;
    const proj = new Array(DRAW);
    const P = (px, py, z) => { const ppm = (DEPTH / z) * half; return { sx: half + (px - camX) * ppm, sy: horizon + (camY - py) * ppm, ppm }; };
    for (let n = 0; n < DRAW; n++) {
      const i = (base + n) % N, s = track.segs[i], z1 = (n - pct) * SEG, z2 = z1 + SEG;
      const p1 = z1 > 0.3 ? P(x, s.y, z1) : null, p2 = P(x + dx, track.segs[(i + 1) % N].y, z2);
      proj[n] = p1 && { i, ...p1, clip: maxy };
      x += dx; dx += s.k * SEG * SEG * BEND;
      if (!p1 || p2.sy >= p1.sy || p2.sy >= maxy) continue;
      const alt = Math.floor(i / 3) % 2, f = Math.pow(n / DRAW, 1.6) * 0.85; // haze grows with distance
      ctx.fillStyle = mix(th.grass[alt], th.haze, f); ctx.fillRect(0, p2.sy, w, p1.sy - p2.sy + 1);
      if (th.neon && alt) { ctx.fillStyle = mix("#3a1f6a", th.haze, f); ctx.fillRect(0, p2.sy, w, Math.max(1, (p1.sy - p2.sy) * 0.18)); } // the glowing ground grid
      const r1 = R.ROAD * p1.ppm, r2 = R.ROAD * p2.ppm, u1 = 0.55 * p1.ppm, u2 = 0.55 * p2.ppm;
      const rum = mix(th.rumble[alt], th.haze, f);
      quad(ctx, rum, p1.sx - r1 - u1, p1.sy, p1.sx - r1, p1.sy, p2.sx - r2, p2.sy, p2.sx - r2 - u2, p2.sy);
      quad(ctx, rum, p1.sx + r1, p1.sy, p1.sx + r1 + u1, p1.sy, p2.sx + r2 + u2, p2.sy, p2.sx + r2, p2.sy);
      quad(ctx, mix(th.road[alt], th.haze, f), p1.sx - r1, p1.sy, p1.sx + r1, p1.sy, p2.sx + r2, p2.sy, p2.sx - r2, p2.sy);
      if (alt) { const l1 = 0.1 * p1.ppm, l2 = 0.1 * p2.ppm, c = mix(th.line, th.haze, f); [-1.33, 1.33].forEach((lx) => quad(ctx, c, p1.sx + lx * p1.ppm - l1, p1.sy, p1.sx + lx * p1.ppm + l1, p1.sy, p2.sx + lx * p2.ppm + l2, p2.sy, p2.sx + lx * p2.ppm - l2, p2.sy)); }
      if (i === 0 || i === N - 1) { // checkered start/finish line
        for (let k = 0; k < 10; k++) for (let ri = 0; ri < 2; ri++) {
          const a = -1 + k / 5, b = -1 + (k + 1) / 5, ya = p1.sy + (p2.sy - p1.sy) * (ri / 2), yb = p1.sy + (p2.sy - p1.sy) * ((ri + 1) / 2);
          const xa = p1.sx + (p2.sx - p1.sx) * (ri / 2), xb = p1.sx + (p2.sx - p1.sx) * ((ri + 1) / 2), ra = r1 + (r2 - r1) * (ri / 2), rb = r1 + (r2 - r1) * ((ri + 1) / 2);
          quad(ctx, (k + ri) % 2 ? "#141316" : "#f4f1ea", xa + a * ra, ya, xa + b * ra, ya, xb + b * rb, yb, xb + a * rb, yb);
        }
      }
      const wh1 = 0.7 * p1.ppm, wh2 = 0.7 * p2.ppm, wa = R.WALL * p1.ppm, wb = R.WALL * p2.ppm, wc = mix(th.wall[alt], th.haze, f);
      quad(ctx, wc, p1.sx - wa, p1.sy, p1.sx - wa, p1.sy - wh1, p2.sx - wb, p2.sy - wh2, p2.sx - wb, p2.sy);
      quad(ctx, wc, p1.sx + wa, p1.sy, p1.sx + wa, p1.sy - wh1, p2.sx + wb, p2.sy - wh2, p2.sx + wb, p2.sy);
      if (th.neon) { ctx.fillStyle = mix(alt ? "#ff3ea5" : "#3ee8ff", th.haze, f); ctx.fillRect(p1.sx - wa - 1, p1.sy - wh1, 2, 2); ctx.fillRect(p1.sx + wa - 1, p1.sy - wh1, 2, 2); }
      maxy = p2.sy;
    }
    // scenery and other cars, far to near
    const sc = scenery(track), others = cars.filter((c) => !c.me).map((c) => {
      let d = c.z - camZ; if (d < -L / 2) d += L; if (d > L / 2) d -= L; // the shortest way round the loop
      const n = Math.floor(d / SEG + pct); return { c, d, n, f: d / SEG + pct - n };
    }).filter((g) => g.d > CAM_BACK - 0.8 && g.n < DRAW - 2).sort((a, b) => b.d - a.d); // a car behind the camera car would fill the screen
    let gi = 0;
    for (let n = DRAW - 2; n >= 1; n--) {
      const pr = proj[n]; if (!pr) continue;
      for (const sp of sc[pr.i]) sprite(ctx, sp, pr, w, th, o);
      while (gi < others.length && others[gi].n >= n) {
        const g = others[gi++], a = proj[g.n], b = proj[g.n + 1]; if (!a || !b) continue;
        const sx = a.sx + (b.sx - a.sx) * g.f, sy = a.sy + (b.sy - a.sy) * g.f, ppm = a.ppm + (b.ppm - a.ppm) * g.f;
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, a.clip); ctx.clip();
        kart(ctx, sx + g.c.x * ppm, sy, 1.5 * ppm, { color: g.c.color, alpha: g.c.ghost ? 0.45 : 1, brake: g.c.brake, steer: g.c.steer, t: o.t, v: g.c.v || 0 });
        if (g.c.name && g.d < 60) nameTag(ctx, sx + g.c.x * ppm, sy - Math.min(2.5 * ppm, 1.6 * ppm + 30), g.c.name, g.c.color, Math.min(1, ppm / 25)); // above camera height, so tags of cars one behind another spread apart (but close to a near kart)
        ctx.restore();
      }
    }
    const s0 = DEPTH / CAM_BACK;
    return { x: half + (cam.x - camX) * s0 * half, y: horizon + CAM_H * s0 * half, size: 1.5 * s0 * half, horizon };
  }
  function nameTag(ctx, x, y, name, color, k) {
    if (k < 0.18) return;
    const fs = Math.max(9, 13 * k + 4);
    ctx.font = `700 ${fs}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const tw = ctx.measureText(name).width + 10;
    ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = "rgba(20,19,22,.75)"; rr(ctx, x - tw / 2, y - fs * 0.7, tw, fs * 1.4, 6); ctx.fill();
    ctx.fillStyle = color; ctx.fillRect(x - tw / 2, y + fs * 0.7 - 2, tw, 2);
    ctx.fillStyle = "#fff"; ctx.fillText(name, x, y); ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  }
  function sprite(ctx, sp, pr, w, th, o) {
    const sx = pr.sx + (sp.x || 0) * pr.ppm, sy = pr.sy, m = pr.ppm;
    if (sx < -300 || sx > w + 300 || m < 0.35) return;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, pr.clip); ctx.clip();
    const text = (t, x, y, size, col) => { ctx.fillStyle = col; ctx.font = `700 ${Math.max(5, size)}px "Chakra Petch", Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(t, x, y); };
    switch (sp.k) {
      case "tree": { const s = sp.s * m; ctx.fillStyle = "#4a3324"; ctx.fillRect(sx - 0.18 * s, sy - 1.2 * s, 0.36 * s, 1.2 * s); ctx.fillStyle = "#1f4d2c"; for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(sx, sy - (4.6 - j * 1.1) * s); ctx.lineTo(sx + (1.5 - j * 0.15) * s, sy - (1.6 - j * 0.2) * s - j * 0.9 * s); ctx.lineTo(sx - (1.5 - j * 0.15) * s, sy - (1.6 - j * 0.2) * s - j * 0.9 * s); ctx.closePath(); ctx.fill(); } break; }
      case "pine": { const s = sp.s * m; ctx.fillStyle = "#0b0f1a"; ctx.beginPath(); ctx.moveTo(sx, sy - 5 * s); ctx.lineTo(sx + 1.4 * s, sy); ctx.lineTo(sx - 1.4 * s, sy); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#3ee8ff55"; ctx.lineWidth = Math.max(1, 0.06 * s); ctx.stroke(); break; }
      case "lamp": { ctx.fillStyle = "#3a3842"; ctx.fillRect(sx - 0.07 * m, sy - 4 * m, 0.14 * m, 4 * m); ctx.fillRect(sx - (sp.x > 0 ? 0.9 : 0) * m, sy - 4 * m, 0.9 * m, 0.12 * m); const lx = sx + (sp.x > 0 ? -0.9 : 0.9) * m; const gl = ctx.createRadialGradient(lx, sy - 3.9 * m, 0, lx, sy - 3.9 * m, 1.6 * m); gl.addColorStop(0, "#ffe9a8cc"); gl.addColorStop(1, "#ffe9a800"); ctx.fillStyle = gl; ctx.fillRect(lx - 1.6 * m, sy - 5.5 * m, 3.2 * m, 3.2 * m); break; }
      case "building": { const bw = sp.w * m, bh = sp.h * m; ctx.fillStyle = mix("#2a2333", th.haze, 0.3); ctx.fillRect(sx - bw / 2, sy - bh, bw, bh); ctx.fillStyle = th.windows; for (let wy = sy - bh + 0.8 * m; wy < sy - 1 * m; wy += 1.4 * m) for (let wx = sx - bw / 2 + 0.6 * m; wx < sx + bw / 2 - 0.6 * m; wx += 1.2 * m) if (Math.sin(wx * 0.37 + wy * 0.71 + sp.h) > 0.2) ctx.fillRect(wx, wy, 0.5 * m, 0.7 * m); break; }
      case "cactus": { const s = sp.s * m; ctx.fillStyle = "#3f7d45"; ctx.strokeStyle = "#2a5a30"; ctx.lineWidth = Math.max(1, 0.08 * s); rr(ctx, sx - 0.25 * s, sy - 3.6 * s, 0.5 * s, 3.6 * s, 0.25 * s); ctx.fill(); ctx.stroke(); rr(ctx, sx - 1 * s, sy - 2.6 * s, 0.4 * s, 1.3 * s, 0.2 * s); ctx.fill(); ctx.stroke(); rr(ctx, sx - 1 * s, sy - 1.6 * s, 0.9 * s, 0.35 * s, 0.17 * s); ctx.fill(); rr(ctx, sx + 0.6 * s, sy - 3 * s, 0.4 * s, 1.5 * s, 0.2 * s); ctx.fill(); ctx.stroke(); rr(ctx, sx + 0.15 * s, sy - 1.85 * s, 0.85 * s, 0.35 * s, 0.17 * s); ctx.fill(); break; }
      case "rock": { const s = sp.s * m; ctx.fillStyle = "#9a5a36"; ctx.beginPath(); ctx.moveTo(sx - 1.4 * s, sy); ctx.lineTo(sx - 1 * s, sy - 1.1 * s); ctx.lineTo(sx + 0.3 * s, sy - 1.4 * s); ctx.lineTo(sx + 1.3 * s, sy - 0.6 * s); ctx.lineTo(sx + 1.5 * s, sy); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#b8724a"; ctx.fillRect(sx - 0.9 * s, sy - 1 * s, 1.1 * s, 0.25 * s); break; }
      case "neon": { ctx.fillStyle = "#1a1626"; ctx.fillRect(sx - 0.06 * m, sy - 2.6 * m, 0.12 * m, 2.6 * m); ctx.save(); if (!RM) { ctx.shadowColor = sp.c; ctx.shadowBlur = 12; } ctx.fillStyle = sp.c; ctx.fillRect(sx - 0.12 * m, sy - 2.9 * m, 0.24 * m, 0.7 * m); ctx.restore(); break; }
      case "cone": { ctx.fillStyle = th.neon ? "#ff3ea5" : "#f46524"; ctx.beginPath(); ctx.moveTo(sx, sy - 0.6 * m); ctx.lineTo(sx + 0.2 * m, sy); ctx.lineTo(sx - 0.2 * m, sy); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#f4f1ea"; ctx.fillRect(sx - 0.1 * m, sy - 0.34 * m, 0.2 * m, 0.08 * m); break; }
      case "chevron": {
        ctx.fillStyle = "#3a3842"; ctx.fillRect(sx - 0.05 * m, sy - 1.2 * m, 0.1 * m, 1.2 * m);
        ctx.fillStyle = th.neon ? "#3ee8ff" : "#ffd23f"; rr(ctx, sx - 0.6 * m, sy - 1.9 * m, 1.2 * m, 0.8 * m, 0.08 * m); ctx.fill();
        ctx.strokeStyle = "#141316"; ctx.lineWidth = Math.max(1.5, 0.12 * m); ctx.beginPath();
        for (const q of [-0.22, 0.12]) { ctx.moveTo(sx + (q - 0.1 * sp.dir) * m, sy - 1.75 * m); ctx.lineTo(sx + (q + 0.12 * sp.dir) * m, sy - 1.5 * m); ctx.lineTo(sx + (q - 0.1 * sp.dir) * m, sy - 1.25 * m); }
        ctx.stroke(); break;
      }
      case "sign": ctx.fillStyle = "#3a3842"; ctx.fillRect(sx - 0.06 * m, sy - 1.6 * m, 0.12 * m, 1.6 * m); ctx.fillStyle = "#f4f1ea"; rr(ctx, sx - 1.8 * m, sy - 2.5 * m, 3.6 * m, 1 * m, 0.1 * m); ctx.fill(); text(sp.text, sx, sy - 2 * m, 0.42 * m, "#c84a12"); break;
      case "board": ctx.fillStyle = "#2b2a30"; ctx.fillRect(sx - 2.6 * m, sy - 1.5 * m, 0.2 * m, 1.5 * m); ctx.fillRect(sx + 2.4 * m, sy - 1.5 * m, 0.2 * m, 1.5 * m); ctx.fillStyle = th.neon ? "#2a1450" : "#f46524"; rr(ctx, sx - 3 * m, sy - 3.2 * m, 6 * m, 1.8 * m, 0.15 * m); ctx.fill(); text(sp.text, sx, sy - 2.3 * m, 0.5 * m, th.neon ? "#3ee8ff" : "#141316"); break;
      case "stand": { // a grandstand full of cheering robots
        const bw = 6 * m, bh = 3 * m; ctx.fillStyle = "#3a3842"; ctx.fillRect(sx - bw / 2, sy - bh, bw, bh); ctx.fillStyle = "#55535c"; for (let r = 0; r < 4; r++) ctx.fillRect(sx - bw / 2, sy - bh + r * 0.75 * m, bw, 0.1 * m);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) { const hop = RM ? 0 : Math.max(0, Math.sin(o.t * 6 + c * 1.7 + r * 2.1)) * 0.15 * m; ctx.fillStyle = E.COLORS[(c + r * 3 + Math.round(sp.x)) % E.COLORS.length]; ctx.fillRect(sx - bw / 2 + (c + 0.3) * 0.6 * m, sy - bh + r * 0.75 * m - 0.32 * m - hop, 0.3 * m, 0.3 * m); }
        break;
      }
      case "gantry": {
        const lx = pr.sx - (R.ROAD + 1) * m, rx = pr.sx + (R.ROAD + 1) * m;
        ctx.fillStyle = "#2b2a30"; ctx.fillRect(lx - 0.15 * m, sy - 4.6 * m, 0.3 * m, 4.6 * m); ctx.fillRect(rx - 0.15 * m, sy - 4.6 * m, 0.3 * m, 4.6 * m);
        ctx.fillStyle = "#1b1a1e"; ctx.fillRect(lx, sy - 5.1 * m, rx - lx, 1 * m);
        for (let k = 0; k < 5; k++) { // start lights: red one by one, then all green
          const cx = pr.sx + (k - 2) * 0.9 * m, on = o.lights === "go" ? "#4fd18b" : k < (o.lights || 0) ? "#ff3b3b" : "#3a2626";
          ctx.save(); if (on !== "#3a2626" && !RM) { ctx.shadowColor = on; ctx.shadowBlur = 14; } ctx.fillStyle = on; ctx.beginPath(); ctx.arc(cx, sy - 4.6 * m, 0.3 * m, 0, 7); ctx.fill(); ctx.restore();
        }
        text("ROBOT RACER", pr.sx, sy - 3.9 * m, 0.42 * m, "#f4f1ea"); break;
      }
    }
    ctx.restore(); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  }
  // a robot kart from behind, with its robot riding it; x, y is the ground under its middle, size its width in pixels
  function kart(ctx, x, y, size, o) {
    const s = size, col = o.color || "#f46524", t = o.t || 0, v = o.v || 0;
    ctx.save(); ctx.globalAlpha = o.alpha == null ? 1 : o.alpha; ctx.translate(x, y + (o.bob || 0)); ctx.rotate((o.steer || 0) * 0.05);
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.62, s * 0.1, 0, 0, 7); ctx.fill();
    // rear tires, tread rolling with speed
    [-1, 1].forEach((sd) => {
      const tx = sd * s * 0.43 - s * 0.13; ctx.fillStyle = "#1b1a1e"; rr(ctx, tx, -s * 0.42, s * 0.26, s * 0.42, s * 0.06); ctx.fill();
      ctx.save(); rr(ctx, tx, -s * 0.42, s * 0.26, s * 0.42, s * 0.06); ctx.clip(); ctx.fillStyle = "#2f2d35";
      const off = ((t * v * 0.9) % 0.1) * s; for (let k = -1; k < 6; k++) ctx.fillRect(tx, -s * 0.42 + k * s * 0.1 + off, s * 0.26, s * 0.03); ctx.restore();
    });
    ctx.fillStyle = "#2b2a30"; ctx.fillRect(-s * 0.32, -s * 0.24, s * 0.64, s * 0.06); // axle
    // body
    ctx.fillStyle = col; ctx.strokeStyle = "#141316"; ctx.lineWidth = Math.max(1.5, s * 0.025);
    ctx.beginPath(); ctx.moveTo(-s * 0.36, -s * 0.07); ctx.lineTo(s * 0.36, -s * 0.07); ctx.lineTo(s * 0.29, -s * 0.42); ctx.lineTo(-s * 0.29, -s * 0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(-s * 0.25, -s * 0.39, s * 0.22, s * 0.05);
    ctx.fillStyle = o.brake ? "#ff3b3b" : "#7a1d1d"; rr(ctx, -s * 0.27, -s * 0.2, s * 0.13, s * 0.06, s * 0.02); ctx.fill(); rr(ctx, s * 0.14, -s * 0.2, s * 0.13, s * 0.06, s * 0.02); ctx.fill();
    if (o.brake && !(o.alpha < 1)) { ctx.fillStyle = "rgba(255,60,60,.25)"; ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.17, s * 0.13, 0, 7); ctx.arc(s * 0.2, -s * 0.17, s * 0.13, 0, 7); ctx.fill(); }
    // the robot riding it: torso in its color, a head that leans into the turn
    ctx.fillStyle = col; rr(ctx, -s * 0.17, -s * 0.66, s * 0.34, s * 0.26, s * 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(-s * 0.12, -s * 0.58, s * 0.24, s * 0.04);
    ctx.save(); ctx.translate((o.steer || 0) * s * 0.03, 0);
    ctx.fillStyle = "#d9d5de"; rr(ctx, -s * 0.15, -s * 0.9, s * 0.3, s * 0.24, s * 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#8a8692"; for (let k = 0; k < 2; k++) ctx.fillRect(-s * 0.09, -s * 0.84 + k * s * 0.07, s * 0.18, s * 0.025);
    ctx.strokeStyle = "#d9d5de"; ctx.lineWidth = Math.max(1, s * 0.02); ctx.beginPath(); ctx.moveTo(-s * 0.06, -s * 0.9); ctx.lineTo(-s * 0.08, -s * 1.02); ctx.stroke();
    ctx.fillStyle = "#ff5d5d"; ctx.beginPath(); ctx.arc(-s * 0.08, -s * 1.04, s * 0.03, 0, 7); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#141316"; ctx.fillRect(-s * 0.4, -s * 0.47, s * 0.8, s * 0.05); // rear wing
    ctx.fillRect(-s * 0.4, -s * 0.47, s * 0.04, s * 0.14); ctx.fillRect(s * 0.36, -s * 0.47, s * 0.04, s * 0.14);
    ctx.restore();
  }
  // faint streaks from the middle of the screen at speed
  function speedLines(ctx, w, h, horizon, v) {
    if (RM || v < 9) return;
    const k = clamp((v - 9) / 8, 0, 1); ctx.strokeStyle = `rgba(255,255,255,${0.12 * k})`; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r0 = (0.35 + Math.random() * 0.3) * w * 0.5, len = (0.08 + Math.random() * 0.12) * w * k;
      const cx = w / 2, cy = horizon; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.6); ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len) * 0.6); ctx.stroke();
    }
  }
  window.RaceDraw = { THEMES, world, kart, minimap, speedLines, nameTag, roadY, trackMap, CAM_BACK };
})();
