// Bot Arena server: serves the web pages and runs live classroom tournaments over Socket.IO.
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const { Server } = require("socket.io");
const Engine = require("./public/js/engine.js");
const Flight = require("./public/js/flight.js");
const Race = require("./public/js/race.js");
const T = require("./lib/tournament.js");

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 48;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // rooms vanish after 6 idle hours

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });

const pub = path.join(__dirname, "public");
app.use(express.static(pub, { extensions: ["html"] }));
app.get("/art/manifest.json", (_req, res) => res.json({ parts: {} })); // no art pack installed (public/art/): every part is drawn in code
app.get("/vendor/qrcode.js", (_req, res) => res.sendFile(path.join(__dirname, "node_modules/qrcode-generator/qrcode.js")));
app.get("/healthz", (_req, res) => res.json({ ok: true, rooms: rooms.size }));
app.set("trust proxy", 1); // behind Render's proxy, so req.ip is the visitor (for the PIN limit)

// Teacher status page (/status): server health and the games running, behind the TEACHER_PIN setting.
// Counts only, never student names. Ten wrong PINs from one address lock it out for 10 minutes.
const STARTED = Date.now(), APP_VERSION = require("./package.json").version;
const pinTries = new Map(); // ip -> { n, t }
app.get("/api/status", (req, res) => {
  const pin = process.env.TEACHER_PIN;
  if (!pin) return res.status(503).json({ ok: false, error: "The status page is off. Add a TEACHER_PIN setting on the server (Render: Environment) to turn it on." });
  const now = Date.now(), t = pinTries.get(req.ip) || { n: 0, t: now };
  if (now - t.t > 10 * 60 * 1000) { t.n = 0; t.t = now; }
  if (t.n >= 10) return res.status(429).json({ ok: false, error: "Too many wrong PINs. Wait 10 minutes and try again." });
  const given = Buffer.from(String(req.get("x-teacher-pin") || "")), want = Buffer.from(pin);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) { t.n++; pinTries.set(req.ip, t); return res.status(401).json({ ok: false, error: "Wrong PIN." }); }
  pinTries.delete(req.ip);
  res.json({
    ok: true, app: APP_VERSION, commit: (process.env.RENDER_GIT_COMMIT || "").slice(0, 7) || null, node: process.version,
    uptime: Math.round((now - STARTED) / 1000), memoryMB: Math.round(process.memoryUsage().rss / 1048576), online: presenceCounts(),
    rooms: [...rooms.values()].sort((a, b) => b.lastActive - a.lastActive).map((r) => ({
      code: r.code, phase: r.phase, robots: r.players.size, connected: [...r.players.values()].filter((p) => p.connected).length,
      boards: r.hosts.size, idleMin: Math.round((now - r.lastActive) / 60000), weight: r.settings.maxw, bo3: r.settings.bo3,
      matchesLeft: r.bracket ? r.bracket.rounds.flat().filter((m) => !m.winner).length : null,
    })),
  });
});

// ---------------- rooms ----------------
const rooms = new Map();
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O
const rid = (n = 16) => crypto.randomBytes(n).toString("hex");
function newCode() {
  for (let tries = 0; tries < 1000; tries++) {
    let c = "";
    for (let i = 0; i < 4; i++) c += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    if (!rooms.has(c) && !isBlocked(c)) return c;
  }
  throw new Error("No room codes left");
}

// A short, classroom-level name filter. The host can also remove any player.
// SUB words are blocked anywhere. WORD words are blocked only as a whole word, or with a
// silly prefix/suffix ("POOPBOT", "BUTTHEAD"), so names like Michelle, Diego, Titan or Grape still work.
const SUB = ["fuck", "shit", "bitch", "cunt", "nigg", "whore", "slut", "porn", "penis", "vagina", "pussy", "nazi", "hitler", "kkk", "rapist"];
const WORD = ["ass", "asses", "dick", "cock", "sex", "sexy", "tit", "tits", "boob", "boobs", "butt", "poop", "piss", "crap", "damn", "hell", "rape", "kill", "die", "fag", "fart"];
const AFFIX = /^(mr|mrs|big|the|lil)?(.*?)(bot|bots|head|face|man|er|y|s)?$/;
function isBlocked(s) {
  const raw = String(s).toLowerCase(), flat = raw.replace(/[^a-z]/g, "");
  if (SUB.some((w) => flat.includes(w))) return true;
  return raw.split(/[^a-z]+/).filter(Boolean).some((tok) => {
    if (WORD.includes(tok)) return true;
    const m = tok.match(AFFIX);
    return m && WORD.includes(m[2]);
  });
}
const HEAVIEST = Math.max(...Engine.WEIGHT_CLASSES.map((w) => w.kg));
const className = (kg) => (Engine.WEIGHT_CLASSES.find((w) => w.kg === kg) || { n: "" }).n;
const tooHeavy = (room) => `Your robot is over ${room.settings.maxw} kg, the limit for this ${className(room.settings.maxw)} game. Swap a part.`;
function cleanBuilder(s) { return String(s || "").replace(/[^A-Za-z0-9 .'-]/g, "").trim().slice(0, 14); }

function publicState(room) {
  return {
    code: room.code,
    phase: room.phase,
    players: [...room.players.values()].map((p) => ({ id: p.id, builder: p.builder, bot: p.bot, connected: p.connected, out: p.out, pts: p.pts || 0, qpts: p.qpts || 0, over: Engine.statsOf(p.bot).wt > room.settings.maxw })),
    lesson: lessonState(room),
    race: Race.TRACKS.map((tr) => raceBoard(room, tr.id).slice(0, 3).map((b) => ({ id: b.id, builder: b.builder, time: b.time, track: tr.id, n: tr.n }))).flat(),
    gp: gpState(room),
    lab: room.lab && { m: room.lab.m, n: Flight.MISSIONS[room.lab.m].n, open: room.lab.open, ids: [...room.lab.entries.keys()] },
    settings: room.settings,
    bracket: room.bracket && {
      rounds: room.bracket.rounds.map((round, r) => ({
        name: T.roundName(room.bracket, r),
        matches: round.map((m) => ({ id: m.id, a: m.a, b: m.b, bye: !!m.bye,
          // hide the result of the match on the board until the host's animation finishes
          winner: room.current && room.current.matchId === m.id ? null : m.winner })),
      })),
    },
    currentMatchId: room.current ? room.current.matchId : null,
    predict: room.current ? { open: room.current.open, a: room.current.votes.a, b: room.current.votes.b, bestOf: room.current.bestOf } : null,
    championId: room.championId || null,
    awards: room.phase === "done" ? room.awards || [] : [],
    reactions: !room.reactionsOff,
  };
}
// ---------------- live lessons ----------------
// The board can present a lesson; its quiz cards become polls on students' devices. The answer stays on the
// server until the teacher reveals it, and the live answer counts go to the board only.
const cleanText = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
function lessonState(room) {
  const L = room.lesson; if (!L) return null;
  const q = L.quiz;
  return { num: L.num, n: L.n, step: L.step, steps: L.steps,
    quiz: q && { id: q.id, q: q.q, options: q.options, revealed: q.revealed, answer: q.revealed ? q.answer : null, explain: q.revealed ? q.explain : null } };
}
function pollUpdate(room) {
  const q = room.lesson && room.lesson.quiz; if (!q) return;
  const counts = q.options.map(() => 0);
  for (const a of q.answers.values()) counts[a]++;
  toHosts(room, "room:poll", { id: q.id, counts, answered: q.answers.size, players: [...room.players.values()].filter((p) => p.connected && !p.out).length });
}
// ---------------- Race Day (a Grand Prix for the whole class) ----------------
// The board runs up to 3 races. Everyone drives at once on their own device; positions are shared live for display
// only (5 times a second), and each finished lap is driven again by the server, which decides the results.
const GP_LIMIT = 150, GP_POINTS = [10, 8, 6, 5, 4, 3, 2]; // seconds a race can last; points for 1st-7th, then 1 for finishing
const gpPlayers = (room) => [...room.players.values()].filter((p) => !p.out);
function gpState(room) {
  const g = room.gp; if (!g) return null;
  const name = (id) => (room.players.get(id) || {}).builder || "?";
  return {
    phase: g.phase, i: g.i, n: g.tracks.length, track: g.tracks[g.i], tracks: g.tracks, startAt: g.startAt, endAt: g.endAt, now: Date.now(), limit: GP_LIMIT,
    racers: gpPlayers(room).map((p) => ({ id: p.id, builder: p.builder, color: Engine.COLORS[(p.bot && p.bot.color) | 0] || Engine.COLORS[0] })),
    setups: [...g.setups].map(([id, s]) => ({ id, ...s })),
    results: g.results.map((res) => res.map((r) => ({ ...r, builder: name(r.id) }))),
    standings: gpStandings(room).map((s) => ({ ...s, builder: name(s.id) })),
    awards: g.phase === "done" ? gpAwards(room).map((a) => ({ ...a, builder: name(a.id) })) : [],
  };
}
function gpStandings(room) {
  const g = room.gp, tot = new Map();
  for (const res of g.results) for (const r of res) { const t = tot.get(r.id) || { id: r.id, pts: 0, best: Infinity }; t.pts += r.pts; if (r.time != null) t.best = Math.min(t.best, r.time); tot.set(r.id, t); }
  return [...tot.values()].sort((a, b) => b.pts - a.pts || a.best - b.best).map((t) => ({ ...t, best: t.best === Infinity ? null : t.best }));
}
function gpAwards(room) {
  const g = room.gp, out = [], all = g.results.flat(), st = gpStandings(room);
  if (st[0]) out.push({ key: "champ", title: "Race Day Champion", id: st[0].id, detail: `${st[0].pts} points` });
  const fast = all.filter((r) => r.time != null).sort((a, b) => a.time - b.time)[0];
  if (fast) out.push({ key: "fast", title: "Fastest Lap", id: fast.id, detail: `${fast.time.toFixed(2)} s on ${Race.TRACKS[fast.track].n}` });
  const clean = st.map((s) => ({ id: s.id, races: all.filter((r) => r.id === s.id && r.time != null) })).filter((s) => s.races.length === g.results.length)
    .map((s) => ({ id: s.id, off: s.races.reduce((a, r) => a + r.off, 0) })).sort((a, b) => a.off - b.off)[0];
  if (clean) out.push({ key: "clean", title: "Cleanest Driver", id: clean.id, detail: clean.off < 0.05 ? "never left the road" : `only ${clean.off.toFixed(1)} s on the grass` });
  if (g.results.length > 1) { // the biggest jump up the order from the first race to the last
    const place = (res, id) => { const k = res.findIndex((r) => r.id === id); return k < 0 ? null : k; };
    const up = st.map((s) => ({ id: s.id, a: place(g.results[0], s.id), b: place(g.results[g.results.length - 1], s.id) })).filter((s) => s.a != null && s.b != null && s.a > s.b).sort((x, y) => (y.a - y.b) - (x.a - x.b))[0];
    if (up) out.push({ key: "up", title: "Most Improved", id: up.id, detail: `from #${up.a + 1} to #${up.b + 1}` });
  }
  return out;
}
function gpUpdate(room) { io.to("race:" + room.code).emit("gp:state", gpState(room)); broadcast(room); }
function gpEndRace(room) {
  const g = room.gp; if (!g || g.phase !== "racing" && g.phase !== "countdown") return;
  clearTimeout(g.timer); clearInterval(g.ticker);
  const entrants = new Set([...g.live.keys(), ...g.laps.keys()]);
  const rows = [...entrants].filter((id) => room.players.has(id)).map((id) => {
    const lap = g.laps.get(id), live = g.live.get(id) || {};
    return lap ? { id, track: g.tracks[g.i], time: lap.time, dist: 1, off: lap.off, setup: lap.setup } : { id, track: g.tracks[g.i], time: null, dist: Math.min(0.999, (live.z || 0) / Race.TRACKS[g.tracks[g.i]].LENGTH), off: 0, setup: g.setups.get(id) || null };
  });
  rows.sort((a, b) => (a.time == null) - (b.time == null) || (a.time - b.time) || (b.dist - a.dist));
  let place = 0;
  rows.forEach((r) => { r.pts = r.time == null ? 0 : GP_POINTS[place] ?? 1; if (r.time != null) place++; });
  g.results[g.i] = rows; g.phase = "results";
  gpUpdate(room);
}
function gpTicker(room) { // everyone's position, 5 times a second, to the race pages and the board
  const g = room.gp; if (!g) return;
  const snap = { t: Date.now(), cars: [...g.live].map(([id, c]) => [id, c.z, c.x, c.v, g.laps.has(id) ? 1 : 0]) };
  io.to("race:" + room.code).emit("gp:live", snap); toHosts(room, "gp:live", snap);
}

// ---------------- Robot Racer class laps ----------------
// Students send laps from the race page with their saved game pass. A lap is its inputs (one letter per 1/60 s);
// the server drives it again with the same physics and keeps each student's fastest, so times can't be made up.
function raceBoard(room, track = 0) {
  const laps = room.race && room.race[track | 0]; if (!laps) return [];
  return [...laps].map(([id, l]) => ({ id, builder: (room.players.get(id) || {}).builder || "?", time: l.time, setup: l.setup, track: track | 0 })).sort((a, b) => a.time - b.time);
}
function raceUpdate(room, track) { io.to("race:" + room.code).emit("race:board", { track, board: raceBoard(room, track) }); broadcast(room); }

// ---------------- Flying Car Lab class challenge ----------------
// The board picks a mission; students submit designs from the Lab page (with their saved game pass). The server
// flies and grades every design itself, so the ranking can't be faked, and the board replays them.
function labScore(design, m) {
  const r = Flight.simulate(design, Flight.MISSIONS[m]), g = Flight.grade(r);
  return { stars: g.stars.filter(Boolean).length, complete: g.complete, effVal: g.effVal, vImp: Math.round(r.vImp * 10) / 10, maxY: Math.round(r.maxY * 10) / 10, outcome: r.outcome, landing: r.landing };
}
// best first: completed, more stars, then the more efficient design (lighter or cheaper), then the softer landing
const labOrder = (a, b) => (b.score.complete - a.score.complete) || (b.score.stars - a.score.stars) || (a.score.effVal - b.score.effVal) || (a.score.vImp - b.score.vImp);
function labInfo(room) { return room.lab ? { m: room.lab.m, open: room.lab.open } : null; }
function labUpdate(room) {
  io.to("lab:" + room.code).emit("lab:info", labInfo(room)); // students' Lab pages
  if (!room.lab) return toHosts(room, "room:lab", null);
  const entries = [...room.lab.entries].map(([id, e]) => ({ id, builder: (room.players.get(id) || {}).builder || "?", design: e.design, score: e.score })).sort(labOrder);
  toHosts(room, "room:lab", { m: room.lab.m, open: room.lab.open, entries });
}
function broadcast(room) { room.lastActive = Date.now(); io.to(room.code).emit("room:state", publicState(room)); }
// Some events only matter to the board (reactions, class status), so they skip the students' devices.
function toHosts(room, ev, data) { for (const id of room.hosts) io.to(id).emit(ev, data); }
function botWithBuilder(p) { return { ...p.bot, builder: p.builder }; }

// Settle matches that can't be played: a removed player forfeits.
function settleForfeits(room) {
  const br = room.bracket; if (!br) return;
  let changed = true;
  while (changed) {
    changed = false;
    const nm = T.nextMatch(br);
    if (!nm) break;
    const A = room.players.get(nm.match.a), B = room.players.get(nm.match.b);
    const aOut = !A || A.out, bOut = !B || B.out;
    if (aOut || bOut) {
      const w = aOut && !bOut ? nm.match.b : !aOut && bOut ? nm.match.a : nm.match.a;
      nm.match.forfeit = true;
      T.setWinner(br, nm.r, nm.m, w); changed = true;
    }
  }
  const champ = T.champion(br);
  if (champ) { room.phase = "done"; room.championId = champ; }
}


// ---------------- presence ----------------
// Which page each connected device is on. The home page gets anonymous counts; a teacher's board gets
// a page + number for each of its own students (only when the student's saved game pass checks out).
const PAGES = ["home", "play", "host", "practice", "lab", "learn", "race"];
const presence = new Map(); // socket.id -> { page, n, t, code, playerId }
function presenceCounts() {
  const c = { online: 0, play: 0, practice: 0, lab: 0, learn: 0, race: 0, live: 0 };
  for (const p of presence.values()) { if (p.page === "host") continue; c.online++; if (p.page in c) c[p.page]++; }
  for (const r of rooms.values()) if (r.phase === "tournament") c.live++;
  return c;
}
let countsTimer = null;
function countsChanged() { // at most one update every 1.5 s, however busy it gets
  if (countsTimer) return;
  countsTimer = setTimeout(() => { countsTimer = null; io.to("presence:watch").emit("presence:counts", presenceCounts()); }, 1500);
}
function classStatus(room) {
  const out = {};
  for (const p of presence.values()) {
    if (p.code !== room.code || !room.players.has(p.playerId)) continue;
    const cur = out[p.playerId];
    // a student with several tabs open: show the most recent page that isn't just the game page
    if (!cur || (cur.page === "play" && p.page !== "play") || (p.page !== "play" && p.t > cur.t)) out[p.playerId] = { page: p.page, n: p.n, t: p.t };
  }
  return out;
}
function statusChanged(room) {
  if (!room || room.statusTimer) return;
  room.statusTimer = setTimeout(() => { room.statusTimer = null; toHosts(room, "room:status", classStatus(room)); }, 800);
}

// ---------------- stats + awards ----------------
function blankStats() { return { swings: 0, hits: 0, dealt: 0, taken: 0, maxHit: 0, grabs: 0, flips: 0, shields: 0, matches: 0, bursts: 0 }; }
function recordStats(room, c) {
  const ids = [c.aId, c.bId];
  ids.forEach((id) => { const p = room.players.get(id); if (p) { p.stats = p.stats || blankStats(); p.stats.matches++; } });
  for (const e of c.sim.events) {
    const me = room.players.get(ids[e.me]), op = room.players.get(ids[1 - e.me]);
    if (!me || !me.stats) continue;
    if (e.kind === "act") {
      me.stats.swings += Engine.PARTS.tool[me.bot.tool].swings; me.stats.hits += e.hits;
      me.stats.dealt += e.dmg; me.stats.maxHit = Math.max(me.stats.maxHit, e.dmg);
      if (e.grab) me.stats.grabs++;
      if (e.flip) me.stats.flips++;
      if (e.burst) me.stats.bursts++;
      if (op && op.stats) op.stats.taken += e.dmg;
    }
    if (e.kind === "think" && (e.bubble === "SHIELD!" || e.act === "shield")) me.stats.shields++;
  }
}
function computeAwards(room) {
  const ps = [...room.players.values()].filter((p) => !p.out);
  const out = [];
  const champ = room.players.get(room.championId);
  if (champ) out.push({ key: "champion", title: "Champion", playerId: champ.id, detail: "Won the whole tournament" });
  const fin = room.bracket.rounds[room.bracket.rounds.length - 1][0];
  const runner = room.players.get(fin.a === room.championId ? fin.b : fin.a);
  if (runner) out.push({ key: "runnerup", title: "Runner-up", playerId: runner.id, detail: "Made it to the final" });
  // every player tied for the top score gets the award (max 3), only if the score is above zero
  const best = (score, min = () => true) => {
    let val = -Infinity, top = [];
    for (const p of ps) {
      if (!p.stats || !min(p)) continue;
      const v = score(p);
      if (v > val + 1e-9) { val = v; top = [p]; } else if (Math.abs(v - val) < 1e-9) top.push(p);
    }
    return val > 0 && top.length <= 3 ? top.map((p) => ({ p, v: val })) : [];
  };
  const add = (key, title, list, detail) => list.forEach(({ p, v }) => out.push({ key, title, playerId: p.id, detail: detail(v) }));
  add("hitter", "Heavy Hitter", best((p) => p.stats.maxHit), (v) => `Biggest single hit: ${v} damage`);
  add("sharp", "Sharpshooter", best((p) => p.stats.hits / p.stats.swings, (p) => p.stats.swings >= 6), (v) => `Hit ${Math.round(v * 100)}% of attacks`);
  add("grab", "Grab Master", best((p) => p.stats.grabs), (v) => `${v} grab${v === 1 ? "" : "s"}`);
  add("flip", "Flip Master", best((p) => p.stats.flips), (v) => `${v} flip${v === 1 ? "" : "s"}`);
  add("speed", "Speed Demon", best((p) => p.stats.bursts), (v) => `${v} bonus speed attack${v === 1 ? "" : "s"}`);
  add("shield", "Shield Hero", best((p) => p.stats.shields), (v) => `Raised the shield ${v} time${v === 1 ? "" : "s"}`);
  const preds = ps.map((p) => ({ p, v: p.pts || 0 })), maxPts = Math.max(0, ...preds.map((x) => x.v));
  const topPred = preds.filter((x) => x.v === maxPts);
  if (maxPts > 0 && topPred.length <= 4) add("predict", "Top Predictor", topPred, (v) => `${v} correct prediction${v === 1 ? "" : "s"}`);
  return out;
}

io.on("connection", (socket) => {
  let joined = null; // { room, role: "host" | "player", playerId }
  let raceMe = null; // a race page's student, checked once by race:check (Race Day events use it)

  function roomFor(code) { return rooms.get(String(code || "").toUpperCase().trim()); }
  function linkPresence(room, playerId) {
    const p = presence.get(socket.id) || { page: "play", n: 0, t: Date.now() };
    p.code = room.code; p.playerId = playerId; p.t = Date.now(); presence.set(socket.id, p); statusChanged(room);
  }
  function requireHost(cb) {
    if (!joined || joined.role !== "host") { cb && cb({ ok: false, error: "Only the host can do that." }); return null; }
    return joined.room;
  }

  socket.on("host:create", (_d, cb) => {
    const code = newCode();
    const room = { code, hostKey: rid(), phase: "lobby", players: new Map(), bracket: null, current: null, championId: null, lastActive: Date.now(), hosts: new Set([socket.id]),
      settings: { maxw: Engine.MAXW, bo3: 0 } }; // bo3: 0 off, 1 the final, 2 semifinals and final
    rooms.set(code, room);
    joined = { room, role: "host" };
    socket.join(code);
    cb && cb({ ok: true, code, hostKey: room.hostKey });
    broadcast(room); statusChanged(room);
  });

  socket.on("host:resume", (d, cb) => {
    const room = roomFor(d && d.code);
    if (!room || room.hostKey !== (d && d.hostKey)) return cb && cb({ ok: false, error: "That game has ended." });
    joined = { room, role: "host" }; room.hosts.add(socket.id);
    socket.join(room.code);
    cb && cb({ ok: true, code: room.code });
    broadcast(room); statusChanged(room); pollUpdate(room); labUpdate(room);
  });

  socket.on("room:check", (d, cb) => {
    const room = roomFor(d && d.code);
    cb && cb(room ? { ok: true, phase: room.phase, count: room.players.size, maxw: room.settings.maxw } : { ok: false, error: "No game with that code. Check the code on the board." });
  });

  socket.on("player:join", (d, cb) => {
    const room = roomFor(d && d.code);
    if (!room) return cb && cb({ ok: false, error: "No game with that code. Check the code on the board." });
    const bot = Engine.sanitizeBot(d.bot, HEAVIEST);
    if (!bot) return cb && cb({ ok: false, error: "That robot isn't valid." });
    const builder = cleanBuilder(d.builder);
    if (!builder) return cb && cb({ ok: false, error: "Type your first name." });
    if (isBlocked(builder) || isBlocked(bot.name)) return cb && cb({ ok: false, error: "Please pick a different name." });

    // Rejoin with a saved token (refresh, dropped wifi).
    if (d.playerId && d.token) {
      const p = room.players.get(d.playerId);
      if (p && p.token === d.token) {
        p.socketId = socket.id; p.connected = true;
        if (room.phase === "lobby") { p.bot = bot; p.builder = builder; }
        joined = { room, role: "player", playerId: p.id };
        socket.join(room.code);
        cb && cb({ ok: true, playerId: p.id, token: p.token, rejoined: true }); linkPresence(room, p.id);
        return broadcast(room);
      }
    }
    if (room.phase !== "lobby") return cb && cb({ ok: false, error: "This tournament already started. Ask your teacher to start a new one." });
    if (Engine.statsOf(bot).wt > room.settings.maxw) return cb && cb({ ok: false, error: tooHeavy(room) });
    if (room.players.size >= MAX_PLAYERS) return cb && cb({ ok: false, error: "This game is full." });
    const p = { id: rid(6), token: rid(), builder, bot, socketId: socket.id, connected: true, out: false };
    room.players.set(p.id, p);
    joined = { room, role: "player", playerId: p.id };
    socket.join(room.code);
    cb && cb({ ok: true, playerId: p.id, token: p.token });
    linkPresence(room, p.id);
    io.to(room.code).emit("room:joined", { id: p.id });
    broadcast(room);
  });

  socket.on("player:update", (d, cb) => {
    if (!joined || joined.role !== "player") return cb && cb({ ok: false });
    const room = joined.room, p = room.players.get(joined.playerId);
    if (!p) return cb && cb({ ok: false, error: "You were removed from this game." });
    if (room.phase !== "lobby") return cb && cb({ ok: false, error: "The tournament already started, so your robot is locked in." });
    const bot = Engine.sanitizeBot(d && d.bot, HEAVIEST);
    if (!bot) return cb && cb({ ok: false, error: "That robot isn't valid." });
    if (Engine.statsOf(bot).wt > room.settings.maxw) return cb && cb({ ok: false, error: tooHeavy(room) });
    if (isBlocked(bot.name)) return cb && cb({ ok: false, error: "Please pick a different robot name." });
    p.bot = bot;
    cb && cb({ ok: true });
    broadcast(room);
  });

  socket.on("player:leave", () => {
    if (!joined || joined.role !== "player") return;
    const room = joined.room;
    if (room.phase === "lobby") room.players.delete(joined.playerId);
    else { const p = room.players.get(joined.playerId); if (p) p.connected = false; }
    socket.leave(room.code); joined = null;
    broadcast(room);
  });

  socket.on("host:kick", (d, cb) => {
    const room = requireHost(cb); if (!room) return;
    const p = room.players.get(d && d.playerId); if (!p) return cb && cb({ ok: false });
    io.to(p.socketId).emit("player:kicked");
    if (room.phase === "lobby") room.players.delete(p.id);
    else { p.out = true; if (!room.current) settleForfeits(room); }
    cb && cb({ ok: true });
    broadcast(room);
  });

  socket.on("host:start", (_d, cb) => {
    const room = requireHost(cb); if (!room) return;
    const ids = [...room.players.values()].filter((p) => !p.out).map((p) => p.id);
    if (ids.length < 2) return cb && cb({ ok: false, error: "You need at least 2 robots to start." });
    const over = ids.filter((id) => Engine.statsOf(room.players.get(id).bot).wt > room.settings.maxw).length;
    if (over) return cb && cb({ ok: false, error: `${over} robot${over === 1 ? " is" : "s are"} over the ${room.settings.maxw} kg limit (marked TOO HEAVY). Ask ${over === 1 ? "that student" : "them"} to swap a part, or remove ${over === 1 ? "it" : "them"}.` });
    room.bracket = T.createBracket(ids);
    room.phase = "tournament"; room.current = null; room.championId = null; room.awards = [];
    for (const p of room.players.values()) { p.pts = 0; p.stats = null; }
    cb && cb({ ok: true });
    broadcast(room); countsChanged();
  });

  // Host asks for the next match. The server decides the result (seeded),
  // the host replays the exact same fight from the seed.
  socket.on("host:next", (_d, cb) => {
    const room = requireHost(cb); if (!room) return;
    if (room.phase !== "tournament") return cb && cb({ ok: false, error: "No tournament running." });
    if (!room.current) {
      settleForfeits(room);
      if (room.phase === "done") { cb && cb({ ok: true, done: true }); return broadcast(room); }
      const nm = T.nextMatch(room.bracket);
      if (!nm) return cb && cb({ ok: false, error: "No match ready." });
      const A = room.players.get(nm.match.a), B = room.players.get(nm.match.b);
      const last = room.bracket.rounds.length - 1, bo3 = room.settings.bo3;
      const bestOf = (bo3 === 1 && nm.r === last) || (bo3 === 2 && nm.r >= last - 1) ? 3 : 1;
      const games = [], wins = [0, 0], need = (bestOf + 1) / 2;
      while (wins[0] < need && wins[1] < need) {
        const seed = crypto.randomInt(2 ** 31), sim = Engine.simulate(A.bot, B.bot, seed);
        games.push({ seed, sim }); wins[sim.winner]++;
      }
      room.current = { matchId: nm.match.id, r: nm.r, m: nm.m, seed: games[0].seed, sim: games[games.length - 1].sim, games, bestOf,
        aId: A.id, bId: B.id, winnerId: wins[0] > wins[1] ? A.id : B.id, open: true, votes: { a: 0, b: 0 }, picks: new Map() };
    }
    const c = room.current, mt = room.bracket.rounds[c.r][c.m];
    const A = room.players.get(mt.a), B = room.players.get(mt.b);
    cb && cb({ ok: true, match: { id: mt.id, round: T.roundName(room.bracket, c.r), seed: c.seed, seeds: c.games.map((g) => g.seed), bestOf: c.bestOf, a: { id: A.id, bot: botWithBuilder(A) }, b: { id: B.id, bot: botWithBuilder(B) } } });
    broadcast(room);
  });

  // Students predict the winner of the match shown on the board.
  socket.on("presence:hello", (d) => {
    const page = d && PAGES.includes(d.page) ? d.page : null; if (!page) return;
    const p = { page, n: Number.isInteger(d.n) && d.n >= 0 && d.n < 100 ? d.n : 0, t: Date.now(), code: null, playerId: null };
    const who = d.who, room = who && roomFor(who.code), pl = room && room.players.get(who.playerId);
    if (pl && typeof who.token === "string" && pl.token === who.token) { p.code = room.code; p.playerId = pl.id; }
    const old = presence.get(socket.id);
    if (old && old.code && !p.code) { p.code = old.code; p.playerId = old.playerId; } // the game page links itself on join
    presence.set(socket.id, p);
    if (d.watch) { socket.join("presence:watch"); socket.emit("presence:counts", presenceCounts()); }
    countsChanged(); if (p.code) statusChanged(rooms.get(p.code));
  });
  socket.on("presence:where", (d) => {
    const p = presence.get(socket.id); if (!p) return;
    p.n = d && Number.isInteger(d.n) && d.n >= 0 && d.n < 100 ? d.n : 0; p.t = Date.now();
    if (p.code) statusChanged(rooms.get(p.code));
  });

  socket.on("player:predict", (d, cb) => {
    if (!joined || joined.role !== "player") return cb && cb({ ok: false });
    const room = joined.room, c = room.current, pid = joined.playerId;
    if (!c || c.matchId !== (d && d.matchId)) return cb && cb({ ok: false, error: "That match isn't up right now." });
    if (!c.open) return cb && cb({ ok: false, error: "Predictions are closed for this match." });
    if (pid === c.aId || pid === c.bId) return cb && cb({ ok: false, error: "You're in this match!" });
    const side = d.side === "a" ? "a" : d.side === "b" ? "b" : null;
    if (!side) return cb && cb({ ok: false });
    const prev = c.picks.get(pid);
    if (prev) c.votes[prev]--;
    c.picks.set(pid, side); c.votes[side]++;
    cb && cb({ ok: true, side });
    broadcast(room);
  });

  // Anonymous emoji from students, shown floating over the battle on the board. One per student every 1.2 s.
  socket.on("player:react", (d) => {
    if (!joined || joined.role !== "player") return;
    const room = joined.room, p = room.players.get(joined.playerId), e = d && d.e;
    if (!p || room.reactionsOff || room.phase === "lobby" || !Number.isInteger(e) || e < 0 || e >= Engine.REACTIONS.length) return;
    const now = Date.now();
    if (now - (p.lastReact || 0) < 1200) return;
    p.lastReact = now;
    toHosts(room, "room:react", { e });
  });
  socket.on("host:settings", (d, cb) => {
    const room = requireHost(cb); if (!room) return;
    const s = room.settings, maxw = d && d.maxw, bo3 = d && d.bo3;
    if (maxw !== undefined && maxw !== s.maxw) {
      if (!Engine.WEIGHT_CLASSES.some((w) => w.kg === maxw)) return cb && cb({ ok: false });
      if (room.phase !== "lobby") return cb && cb({ ok: false, error: "Pick the weight class before the tournament starts." });
      s.maxw = maxw;
    }
    if (bo3 !== undefined) { if (![0, 1, 2].includes(bo3)) return cb && cb({ ok: false }); s.bo3 = bo3; } // takes effect from the next match
    cb && cb({ ok: true });
    broadcast(room);
  });
  socket.on("host:lesson", (d, cb) => {
    const room = requireHost(cb); if (!room) return;
    const num = d && d.num, step = d && d.step, steps = d && d.steps;
    if (!Number.isInteger(num) || num < 1 || num > 99 || !Number.isInteger(step) || !Number.isInteger(steps) || step < 0 || step > steps || steps > 60) return cb && cb({ ok: false });
    let quiz = null;
    const q = d.quiz;
    if (q) {
      const options = Array.isArray(q.options) ? q.options.slice(0, 6).map((o) => cleanText(o, 160)) : [];
      if (options.length < 2 || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= options.length || !cleanText(q.q, 300)) return cb && cb({ ok: false });
      const id = `${num}-${step}`, old = room.lesson && room.lesson.quiz;
      quiz = old && old.id === id ? old : { id, q: cleanText(q.q, 300), options, answer: q.answer, explain: cleanText(q.explain, 400), revealed: false, answers: new Map() };
    }
    room.lesson = { num, n: cleanText(d.n, 80), step, steps, quiz };
    cb && cb({ ok: true });
    broadcast(room); pollUpdate(room);
  });
  socket.on("host:reveal", (d, cb) => {
    const room = requireHost(cb); if (!room) return;
    const q = room.lesson && room.lesson.quiz;
    if (!q || q.id !== (d && d.id)) return cb && cb({ ok: false });
    if (!q.revealed) {
      q.revealed = true;
      for (const [pid, a] of q.answers) { const p = room.players.get(pid); if (p && a === q.answer) p.qpts = (p.qpts || 0) + 1; }
    }
    const right = [...q.answers.values()].filter((a) => a === q.answer).length;
    cb && cb({ ok: true, right, answered: q.answers.size });
    broadcast(room);
  });
  socket.on("host:lessonEnd", (_d, cb) => {
    const room = requireHost(cb); if (!room) return;
    room.lesson = null;
    cb && cb({ ok: true });
    broadcast(room);
  });
  socket.on("player:answer", (d, cb) => {
    if (!joined || joined.role !== "player") return cb && cb({ ok: false });
    const room = joined.room, q = room.lesson && room.lesson.quiz, choice = d && d.choice;
    if (!q || q.id !== (d && d.id)) return cb && cb({ ok: false, error: "That question is over." });
    if (q.revealed) return cb && cb({ ok: false, error: "The answer was already shown." });
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return cb && cb({ ok: false });
    q.answers.set(joined.playerId, choice);
    cb && cb({ ok: true, choice });
    pollUpdate(room);
  });
  socket.on("host:lab", (d, cb) => {
    const room = requireHost(cb); if (!room) return;
    const m = d && d.m;
    if (!Number.isInteger(m) || m < 0 || m >= Flight.MISSIONS.length) return cb && cb({ ok: false });
    if (!room.lab || room.lab.m !== m) room.lab = { m, open: true, entries: new Map() }; // a new mission starts fresh
    if (typeof d.open === "boolean") room.lab.open = d.open;
    cb && cb({ ok: true });
    broadcast(room); labUpdate(room);
  });
  socket.on("host:labEnd", (_d, cb) => {
    const room = requireHost(cb); if (!room) return;
    room.lab = null;
    cb && cb({ ok: true });
    broadcast(room); labUpdate(room);
  });
  // from a student's Lab page, which isn't the game page, so it proves who it is with the saved game pass
  function labPlayer(who) {
    const room = who && roomFor(who.code), p = room && room.players.get(who.playerId);
    return p && typeof who.token === "string" && p.token === who.token ? { room, p } : null;
  }
  socket.on("race:check", (d, cb) => {
    const me = labPlayer(d && d.who);
    if (!me) return cb && cb({ ok: false });
    socket.join("race:" + me.room.code); raceMe = me;
    cb && cb({ ok: true, boards: Race.TRACKS.map((tr) => raceBoard(me.room, tr.id)), gp: gpState(me.room) });
  });
  socket.on("race:submit", (d, cb) => {
    const me = labPlayer(d && d.who);
    if (!me) return cb && cb({ ok: false, error: "Join your class's game first." });
    const inputs = d && d.inputs;
    if (typeof inputs !== "string" || inputs.length > Race.MAX_STEPS || !/^[a-l]*$/.test(inputs)) return cb && cb({ ok: false, error: "That lap can't be checked." });
    const now = Date.now();
    if (now - (me.p.lastRace || 0) < 2000) return cb && cb({ ok: false, error: "Wait a moment before sending again." });
    me.p.lastRace = now;
    const track = Race.trackOf(d.track).id, setup = Race.clampSetup(d.setup), r = Race.lap(setup, inputs, track);
    if (!r.finished) return cb && cb({ ok: false, error: "That lap didn't reach the finish line." });
    me.room.race = me.room.race || {}; const laps = (me.room.race[track] = me.room.race[track] || new Map());
    const old = laps.get(me.p.id), kept = !old || r.time < old.time;
    if (kept) laps.set(me.p.id, { time: r.time, setup, inputs });
    const board = raceBoard(me.room, track);
    cb && cb({ ok: true, kept, time: r.time, best: Math.min(r.time, old ? old.time : Infinity), rank: board.findIndex((b) => b.id === me.p.id) + 1 });
    if (kept) raceUpdate(me.room, track);
  });
  socket.on("race:ghost", (d, cb) => {
    const laps = (me0) => me0 && me0.room.race && me0.room.race[Race.trackOf(d && d.track).id];
    const me = labPlayer(d && d.who), l = laps(me) && laps(me).get(d.id);
    if (!l) return cb && cb({ ok: false });
    cb && cb({ ok: true, setup: l.setup, inputs: l.inputs, time: l.time, track: Race.trackOf(d.track).id });
  });
  // Race Day: the board
  socket.on("host:gp", (d, cb) => {
    const room = requireHost(cb); if (!room) return;
    const tracks = Array.isArray(d && d.tracks) ? [...new Set(d.tracks)].filter((t) => Number.isInteger(t) && Race.TRACKS[t]).slice(0, 3) : [];
    if (!tracks.length) return cb && cb({ ok: false, error: "Pick at least one track." });
    if (room.gp) { clearTimeout(room.gp.timer); clearInterval(room.gp.ticker); }
    room.gp = { tracks, i: 0, phase: "garage", startAt: null, endAt: null, live: new Map(), laps: new Map(), setups: new Map(), results: [] };
    cb && cb({ ok: true }); gpUpdate(room);
  });
  socket.on("host:gpGo", (_d, cb) => {
    const room = requireHost(cb); if (!room) return;
    const g = room.gp; if (!g || g.phase !== "garage") return cb && cb({ ok: false });
    const now = Date.now();
    Object.assign(g, { phase: "countdown", startAt: now + 4000, endAt: now + 4000 + GP_LIMIT * 1000, live: new Map(), laps: new Map() });
    g.timer = setTimeout(() => { if (g.phase === "countdown") { g.phase = "racing"; gpUpdate(room); } g.timer = setTimeout(() => gpEndRace(room), GP_LIMIT * 1000 + 3000); }, 4000);
    g.ticker = setInterval(() => gpTicker(room), 200);
    cb && cb({ ok: true }); gpUpdate(room);
  });
  socket.on("host:gpEndRace", (_d, cb) => { const room = requireHost(cb); if (!room) return; gpEndRace(room); cb && cb({ ok: true }); });
  socket.on("host:gpNext", (_d, cb) => {
    const room = requireHost(cb); if (!room) return;
    const g = room.gp; if (!g || g.phase !== "results") return cb && cb({ ok: false });
    if (g.i + 1 < g.tracks.length) Object.assign(g, { i: g.i + 1, phase: "garage", startAt: null, endAt: null, live: new Map(), laps: new Map() });
    else g.phase = "done";
    cb && cb({ ok: true }); gpUpdate(room);
  });
  socket.on("host:gpClose", (_d, cb) => {
    const room = requireHost(cb); if (!room) return;
    if (room.gp) { clearTimeout(room.gp.timer); clearInterval(room.gp.ticker); }
    room.gp = null; cb && cb({ ok: true }); gpUpdate(room);
  });
  // Race Day: a student's race page (registered by race:check)
  socket.on("player:gpSetup", (d) => {
    const g = raceMe && raceMe.room.gp; if (!g || g.phase !== "garage") return;
    g.setups.set(raceMe.p.id, Race.clampSetup(d)); gpUpdate(raceMe.room);
  });
  socket.on("player:gpPos", (d) => {
    const g = raceMe && raceMe.room.gp; if (!g || (g.phase !== "racing" && g.phase !== "countdown")) return;
    const z = +(d && d.z), x = +(d && d.x), v = +(d && d.v), now = Date.now(), old = g.live.get(raceMe.p.id);
    if (![z, x, v].every(Number.isFinite) || (old && now - old.at < 120)) return; // about 5 a second is plenty
    g.live.set(raceMe.p.id, { z: Math.max(0, Math.min(z, Race.TRACKS[g.tracks[g.i]].LENGTH)), x: Math.max(-Race.WALL, Math.min(Race.WALL, x)), v: Math.max(0, Math.min(v, 40)), at: now });
  });
  socket.on("player:gpLap", (d, cb) => {
    const me = raceMe, g = me && me.room.gp;
    if (!g || g.phase !== "racing") return cb && cb({ ok: false, error: "The race isn't running." });
    if (g.laps.has(me.p.id)) return cb && cb({ ok: false, error: "Your lap is already in." });
    const inputs = d && d.inputs;
    if (typeof inputs !== "string" || inputs.length > Race.MAX_STEPS || !/^[a-l]*$/.test(inputs)) return cb && cb({ ok: false, error: "That lap can't be checked." });
    const setup = Race.clampSetup(d.setup), r = Race.lap(setup, inputs, g.tracks[g.i]);
    if (!r.finished) return cb && cb({ ok: false, error: "That lap didn't reach the finish line." });
    if (r.time > (Date.now() - g.startAt) / 1000 + 1.5) return cb && cb({ ok: false, error: "That lap finished before it could have." }); // a lap can't be shorter than the race so far
    g.laps.set(me.p.id, { time: r.time, off: r.off, setup });
    g.live.set(me.p.id, { z: Race.TRACKS[g.tracks[g.i]].LENGTH, x: 0, v: 0, at: Date.now() });
    cb && cb({ ok: true, time: r.time, place: g.laps.size });
    const racing = [...g.live.keys()].filter((id) => { const p = me.room.players.get(id); return p && !p.out; });
    if (racing.length && racing.every((id) => g.laps.has(id))) gpEndRace(me.room); // everyone's home
  });
  socket.on("lab:check", (d, cb) => {
    const me = labPlayer(d && d.who);
    if (!me) return cb && cb({ ok: false });
    socket.join("lab:" + me.room.code);
    const mine = me.room.lab && me.room.lab.entries.get(me.p.id);
    cb && cb({ ok: true, lab: labInfo(me.room), score: mine ? mine.score : null });
  });
  socket.on("player:labSubmit", (d, cb) => {
    const me = labPlayer(d && d.who);
    if (!me) return cb && cb({ ok: false, error: "Join your class's game first." });
    const L = me.room.lab;
    if (!L) return cb && cb({ ok: false, error: "There's no class challenge right now." });
    if (!L.open) return cb && cb({ ok: false, error: "Your teacher closed submissions." });
    const now = Date.now();
    if (now - (me.p.lastLab || 0) < 2000) return cb && cb({ ok: false, error: "Wait a moment before submitting again." });
    me.p.lastLab = now;
    const design = Flight.clampDesign((d && d.design) || {}), score = labScore(design, L.m);
    L.entries.set(me.p.id, { design, score, at: now });
    cb && cb({ ok: true, score });
    broadcast(me.room); labUpdate(me.room);
  });
  socket.on("host:reactions", (d, cb) => {
    const room = requireHost(cb); if (!room) return;
    room.reactionsOff = !(d && d.on);
    cb && cb({ ok: true });
    broadcast(room);
  });

  socket.on("host:lock", (_d, cb) => {
    const room = requireHost(cb); if (!room) return;
    if (room.current) room.current.open = false;
    cb && cb({ ok: true });
    broadcast(room);
  });

  socket.on("host:matchDone", (d, cb) => {
    const room = requireHost(cb); if (!room) return;
    const c = room.current;
    if (!c || c.matchId !== (d && d.matchId)) return cb && cb({ ok: false });
    T.setWinner(room.bracket, c.r, c.m, c.winnerId);
    room.current = null;
    const correct = [];
    for (const [pid, side] of c.picks) {
      const p = room.players.get(pid);
      if (p && (side === "a" ? c.aId : c.bId) === c.winnerId) { p.pts = (p.pts || 0) + 1; correct.push(pid); }
    }
    for (const g of c.games) recordStats(room, { ...c, sim: g.sim });
    const champ = T.champion(room.bracket);
    if (champ) { room.phase = "done"; room.championId = champ; }
    else settleForfeits(room);
    if (room.phase === "done") room.awards = computeAwards(room);
    cb && cb({ ok: true, winnerId: c.winnerId, done: room.phase === "done" });
    const A = room.players.get(c.aId), B = room.players.get(c.bId);
    let why = null;
    if (A && B) { const x = Engine.explainBattle(A.bot, B.bot, c.sim, room.settings.maxw); why = { aId: c.aId, bId: c.bId, a: x.sides[0], b: x.sides[1] }; }
    io.to(room.code).emit("room:result", { matchId: c.matchId, winnerId: c.winnerId, correct, why });
    broadcast(room);
  });

  socket.on("host:reset", (_d, cb) => {
    const room = requireHost(cb); if (!room) return;
    room.phase = "lobby"; room.bracket = null; room.current = null; room.championId = null; room.awards = [];
    for (const [id, p] of room.players) { if (p.out) room.players.delete(id); else { p.pts = 0; p.stats = null; } }
    cb && cb({ ok: true });
    broadcast(room);
  });

  socket.on("disconnect", () => {
    const pr = presence.get(socket.id);
    if (pr) { presence.delete(socket.id); countsChanged(); if (pr.code) statusChanged(rooms.get(pr.code)); }
    if (!joined) return;
    if (joined.role === "host") joined.room.hosts.delete(socket.id);
    if (joined.role === "player") {
      const p = joined.room.players.get(joined.playerId);
      if (p && p.socketId === socket.id) { p.connected = false; broadcast(joined.room); }
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.lastActive > ROOM_TTL_MS) { if (room.gp) { clearTimeout(room.gp.timer); clearInterval(room.gp.ticker); } rooms.delete(code); }
}, 10 * 60 * 1000).unref();

server.listen(PORT, () => console.log(`Bot Arena running at http://localhost:${PORT}`));
