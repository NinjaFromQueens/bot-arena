// Bot Arena server: serves the web pages and runs live classroom tournaments over Socket.IO.
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const { Server } = require("socket.io");
const Engine = require("./public/js/engine.js");
const T = require("./lib/tournament.js");

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 48;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // rooms vanish after 6 idle hours

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });

const pub = path.join(__dirname, "public");
app.use(express.static(pub, { extensions: ["html"] }));
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
const PAGES = ["home", "play", "host", "practice", "lab", "learn"];
const presence = new Map(); // socket.id -> { page, n, t, code, playerId }
function presenceCounts() {
  const c = { online: 0, play: 0, practice: 0, lab: 0, learn: 0, live: 0 };
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
    broadcast(room); statusChanged(room); pollUpdate(room);
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
  for (const [code, room] of rooms) if (now - room.lastActive > ROOM_TTL_MS) rooms.delete(code);
}, 10 * 60 * 1000).unref();

server.listen(PORT, () => console.log(`Bot Arena running at http://localhost:${PORT}`));
