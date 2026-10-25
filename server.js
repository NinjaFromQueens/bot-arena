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
function cleanBuilder(s) { return String(s || "").replace(/[^A-Za-z0-9 .'-]/g, "").trim().slice(0, 14); }

function publicState(room) {
  return {
    code: room.code,
    phase: room.phase,
    players: [...room.players.values()].map((p) => ({ id: p.id, builder: p.builder, bot: p.bot, connected: p.connected, out: p.out, pts: p.pts || 0 })),
    bracket: room.bracket && {
      rounds: room.bracket.rounds.map((round, r) => ({
        name: T.roundName(room.bracket, r),
        matches: round.map((m) => ({ id: m.id, a: m.a, b: m.b, bye: !!m.bye,
          // hide the result of the match on the board until the host's animation finishes
          winner: room.current && room.current.matchId === m.id ? null : m.winner })),
      })),
    },
    currentMatchId: room.current ? room.current.matchId : null,
    predict: room.current ? { open: room.current.open, a: room.current.votes.a, b: room.current.votes.b } : null,
    championId: room.championId || null,
    awards: room.phase === "done" ? room.awards || [] : [],
    reactions: !room.reactionsOff,
  };
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


// ---------------- stats + awards ----------------
function blankStats() { return { swings: 0, hits: 0, dealt: 0, taken: 0, maxHit: 0, grabs: 0, shields: 0, matches: 0, bursts: 0 }; }
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
      if (e.burst) me.stats.bursts++;
      if (op && op.stats) op.stats.taken += e.dmg;
    }
    if (e.kind === "think" && e.bubble === "SHIELD!") me.stats.shields++;
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
  function requireHost(cb) {
    if (!joined || joined.role !== "host") { cb && cb({ ok: false, error: "Only the host can do that." }); return null; }
    return joined.room;
  }

  socket.on("host:create", (_d, cb) => {
    const code = newCode();
    const room = { code, hostKey: rid(), phase: "lobby", players: new Map(), bracket: null, current: null, championId: null, lastActive: Date.now(), hosts: new Set([socket.id]) };
    rooms.set(code, room);
    joined = { room, role: "host" };
    socket.join(code);
    cb && cb({ ok: true, code, hostKey: room.hostKey });
    broadcast(room);
  });

  socket.on("host:resume", (d, cb) => {
    const room = roomFor(d && d.code);
    if (!room || room.hostKey !== (d && d.hostKey)) return cb && cb({ ok: false, error: "That game has ended." });
    joined = { room, role: "host" }; room.hosts.add(socket.id);
    socket.join(room.code);
    cb && cb({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on("room:check", (d, cb) => {
    const room = roomFor(d && d.code);
    cb && cb(room ? { ok: true, phase: room.phase, count: room.players.size } : { ok: false, error: "No game with that code. Check the code on the board." });
  });

  socket.on("player:join", (d, cb) => {
    const room = roomFor(d && d.code);
    if (!room) return cb && cb({ ok: false, error: "No game with that code. Check the code on the board." });
    const bot = Engine.sanitizeBot(d.bot);
    if (!bot) return cb && cb({ ok: false, error: "That robot isn't valid. It may be over 75 kg." });
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
        cb && cb({ ok: true, playerId: p.id, token: p.token, rejoined: true });
        return broadcast(room);
      }
    }
    if (room.phase !== "lobby") return cb && cb({ ok: false, error: "This tournament already started. Ask your teacher to start a new one." });
    if (room.players.size >= MAX_PLAYERS) return cb && cb({ ok: false, error: "This game is full." });
    const p = { id: rid(6), token: rid(), builder, bot, socketId: socket.id, connected: true, out: false };
    room.players.set(p.id, p);
    joined = { room, role: "player", playerId: p.id };
    socket.join(room.code);
    cb && cb({ ok: true, playerId: p.id, token: p.token });
    io.to(room.code).emit("room:joined", { id: p.id });
    broadcast(room);
  });

  socket.on("player:update", (d, cb) => {
    if (!joined || joined.role !== "player") return cb && cb({ ok: false });
    const room = joined.room, p = room.players.get(joined.playerId);
    if (!p) return cb && cb({ ok: false, error: "You were removed from this game." });
    if (room.phase !== "lobby") return cb && cb({ ok: false, error: "The tournament already started, so your robot is locked in." });
    const bot = Engine.sanitizeBot(d && d.bot);
    if (!bot) return cb && cb({ ok: false, error: "That robot isn't valid." });
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
    room.bracket = T.createBracket(ids);
    room.phase = "tournament"; room.current = null; room.championId = null; room.awards = [];
    for (const p of room.players.values()) { p.pts = 0; p.stats = null; }
    cb && cb({ ok: true });
    broadcast(room);
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
      const seed = crypto.randomInt(2 ** 31);
      const A = room.players.get(nm.match.a), B = room.players.get(nm.match.b);
      const sim = Engine.simulate(A.bot, B.bot, seed);
      room.current = { matchId: nm.match.id, r: nm.r, m: nm.m, seed, sim, aId: A.id, bId: B.id, winnerId: sim.winner === 0 ? A.id : B.id,
        open: true, votes: { a: 0, b: 0 }, picks: new Map() };
    }
    const c = room.current, mt = room.bracket.rounds[c.r][c.m];
    const A = room.players.get(mt.a), B = room.players.get(mt.b);
    cb && cb({ ok: true, match: { id: mt.id, round: T.roundName(room.bracket, c.r), seed: c.seed, a: { id: A.id, bot: botWithBuilder(A) }, b: { id: B.id, bot: botWithBuilder(B) } } });
    broadcast(room);
  });

  // Students predict the winner of the match shown on the board.
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
    recordStats(room, c);
    const champ = T.champion(room.bracket);
    if (champ) { room.phase = "done"; room.championId = champ; }
    else settleForfeits(room);
    if (room.phase === "done") room.awards = computeAwards(room);
    cb && cb({ ok: true, winnerId: c.winnerId, done: room.phase === "done" });
    const A = room.players.get(c.aId), B = room.players.get(c.bId);
    let why = null;
    if (A && B) { const x = Engine.explainBattle(A.bot, B.bot, c.sim); why = { aId: c.aId, bId: c.bId, a: x.sides[0], b: x.sides[1] }; }
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
