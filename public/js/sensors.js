/*
 * Sensor physics for the Robot Lessons simulators — shared by the browser and Node tests.
 * Meters and seconds. The lesson text and quizzes rely on these rules, so keep them true:
 * ultrasonic is fooled by soft things, tilted walls and distance past 4 m;
 * lidar by clear glass; infrared by clear glass, black surfaces and distance past 0.8 m.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Sensors = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const SOUND = 343, LIGHT = 299792458;
  const SENSORS = {
    ultrasonic: { n: "Ultrasonic", signal: "sound", speed: SOUND, range: 4, cone: 15 }, // cone = half-angle in degrees
    lidar: { n: "Lidar", signal: "laser", speed: LIGHT, range: 12, cone: 0 },
    infrared: { n: "Infrared", signal: "infrared light", speed: LIGHT, range: 0.8, cone: 0 },
  };
  // What each surface does to each sensor's signal: echo (bounces back), pass (goes through), absorb (soaked up).
  const SURFACES = {
    wall: { n: "Wall", ultrasonic: "echo", lidar: "echo", infrared: "echo" },
    glass: { n: "Glass door", ultrasonic: "echo", lidar: "pass", infrared: "pass", pass: "went straight through the clear glass" },
    soft: { n: "Fluffy couch", ultrasonic: "absorb", lidar: "echo", infrared: "echo", absorb: "The soft fabric soaked up the sound" },
    black: { n: "Black box", ultrasonic: "echo", lidar: "echo", infrared: "absorb", absorb: "Black soaks up infrared light" },
  };
  const CLEAR = "Nothing came back, so the robot thinks the path is clear!";
  const FAR = {
    ultrasonic: "Too far. A typical ultrasonic sensor can't hear echoes from more than about 4 m away.",
    lidar: "Too far for this lidar. It reaches about 12 m.",
    infrared: "Too far. A simple infrared distance sensor only reaches about 0.8 m.",
  };

  function fmtTime(t) { return t < 1e-6 ? (t * 1e9).toFixed(1) + " ns" : (t * 1000).toFixed(1) + " ms"; }

  // One reading straight ahead. tilt = how many degrees the surface is turned away from facing the sensor.
  function read(sensor, surface, dist, tilt = 0) {
    const S = SENSORS[sensor], F = SURFACES[surface], act = F[sensor];
    if (dist > S.range) return { ok: false, reason: "far", why: FAR[sensor] };
    if (act === "pass") return { ok: false, reason: "pass", why: `The ${S.signal} ${F.pass}. ${CLEAR}` };
    if (act === "absorb") return { ok: false, reason: "absorb", why: `${F.absorb}. ${CLEAR}` };
    // Sound bounces off a flat wall like a ball. Tilted more than the cone's half-angle, the echo misses the sensor.
    // Laser and infrared light scatter off ordinary walls in every direction, so some always comes back.
    if (S.cone && tilt > S.cone) return { ok: false, reason: "tilt", why: `The tilted wall bounced the sound off to the side, so the echo never came back. ${CLEAR}` };
    const time = (2 * dist) / S.speed;
    return { ok: true, reason: "ok", dist, time, why: `The ${S.signal} bounced back in ${fmtTime(time)}, so it reads ${dist.toFixed(2)} m.` };
  }

  // ---------------- 2D geometry for the lidar room ----------------
  // A shape is { pts: [[x, y], ...], surface }. Segments are its edges.
  function segments(shapes) {
    const out = [];
    for (const sh of shapes) sh.pts.forEach((p, i) => { const q = sh.pts[(i + 1) % sh.pts.length]; out.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1], surface: sh.surface }); });
    return out;
  }
  function circle(cx, cy, r, surface, n = 28) { return { pts: Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]), surface }; }
  function box(x1, y1, x2, y2, surface) { return { pts: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], surface }; }

  // First thing a sensor's beam reports from (x, y) at angle ang, or null if nothing comes back.
  function cast(segs, x, y, ang, sensor) {
    const S = SENSORS[sensor], dx = Math.cos(ang), dy = Math.sin(ang), hits = [];
    for (const s of segs) {
      const ex = s.x2 - s.x1, ey = s.y2 - s.y1, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const ax = s.x1 - x, ay = s.y1 - y, t = (ax * ey - ay * ex) / den, u = (ax * dy - ay * dx) / den;
      if (t > 1e-9 && u >= 0 && u <= 1) hits.push({ t, s });
    }
    hits.sort((a, b) => a.t - b.t);
    for (const { t, s } of hits) {
      if (t > S.range) return null;
      const act = SURFACES[s.surface][sensor];
      if (act === "pass") continue;
      if (act === "absorb") return null;
      return { dist: t, x: x + dx * t, y: y + dy * t, surface: s.surface, time: (2 * t) / S.speed };
    }
    return null;
  }
  function segDist(s, x, y) {
    const ex = s.x2 - s.x1, ey = s.y2 - s.y1, L = ex * ex + ey * ey;
    const k = L ? Math.max(0, Math.min(1, ((x - s.x1) * ex + (y - s.y1) * ey) / L)) : 0;
    return Math.hypot(x - (s.x1 + ex * k), y - (s.y1 + ey * k));
  }
  function inside(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  return { SOUND, LIGHT, SENSORS, SURFACES, fmtTime, read, segments, circle, box, cast, segDist, inside };
});
