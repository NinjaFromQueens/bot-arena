// Class chat and the fight on students' devices, against a real server: quick messages only, the rate limit and slow
// mode, chat off, muting, cheering only during a match, announcements, the chat catching a rejoining device up, the
// fight reaching devices only after predictions close (same seed as the server's), speed and Skip following the board,
// "Fights on devices" off, students kept out of teacher controls, and Race Day positions reaching game pages.
const assert = require("assert");
const path = require("path");
const { spawn } = require("child_process");
const Engine = require("../public/js/engine.js");

const PORT = 3197, BASE = `http://localhost:${PORT}`;
const server = spawn(process.execPath, [path.join(__dirname, "../server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; server.stdout.on("data", (d) => (log += d)); server.stderr.on("data", (d) => (log += d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect() { // a tiny Socket.IO client (Engine.IO v4 over WebSocket): emit with an answer, and every event it gets
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace("http", "ws") + "/socket.io/?EIO=4&transport=websocket");
    let n = 0; const acks = new Map();
    const io = {
      events: [],
      emit: (ev, data) => new Promise((r) => { const id = ++n; acks.set(id, r); ws.send("42" + id + JSON.stringify([ev, data])); }),
      send: (ev, data) => ws.send("42" + JSON.stringify([ev, data])),
      got: (ev) => io.events.filter((e) => e[0] === ev).map((e) => e[1]),
      last: (ev) => io.got(ev).pop(),
      close: () => ws.close(),
    };
    ws.addEventListener("error", reject);
    ws.addEventListener("message", (e) => {
      const d = String(e.data);
      if (d[0] === "0") ws.send("40");
      else if (d === "2") ws.send("3");
      else if (d.startsWith("40")) resolve(io);
      else if (d.startsWith("43")) { const m = /^43(\d+)(.*)$/.exec(d), a = m && acks.get(+m[1]); if (a) { acks.delete(+m[1]); a(JSON.parse(m[2])[0]); } }
      else if (d.startsWith("42")) io.events.push(JSON.parse(d.slice(2)));
    });
  });
}
const bot = (name, color) => ({ name, body: 0, sensor: color % 4, brain: 0, tool: color % 5, color: color % 6 });

(async () => {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + "/healthz")).ok) break; } catch {} await sleep(100); }
  const host = await connect();
  const { code } = await host.emit("host:create", {});
  const kids = [];
  for (const [i, name] of ["Ana", "Ben", "Cy", "Dee"].entries()) {
    const k = await connect(), r = await k.emit("player:join", { code, builder: name, bot: bot(["ZAPPY", "TANKO", "RUSTY", "VOLTA"][i], i + 1) });
    assert(r.ok, "joined: " + name); Object.assign(k, { id: r.playerId, token: r.token, name }); kids.push(k);
  }
  const [ana, ben, cy, dee] = kids;
  await sleep(200);
  let st = host.last("room:state");
  assert.deepStrictEqual(st.live, { chat: true, slow: false, fights: true, muted: [] }, "chat on, slow off, fights on devices on, nobody muted");

  // quick chat
  assert((await ana.emit("player:chat", { q: 0 })).ok, "Ana sends a quick message");
  await sleep(100);
  const m0 = ben.last("room:chat");
  assert(m0 && m0.name === "Ana" && m0.text === Engine.QUICK[0] && m0.pid === ana.id && host.last("room:chat").id === m0.id, "everyone (and the board) gets it, with her name");
  assert(/Wait a moment/.test((await ana.emit("player:chat", { q: 1 })).error), "one message every 3 seconds");
  assert(!(await ben.emit("player:chat", { q: 99 })).ok && !(await ben.emit("player:chat", { q: "hello" })).ok && !(await ben.emit("player:chat", { text: "anything I want" })).ok, "only the quick messages: nothing typed");
  assert(/no match/.test((await ben.emit("player:chat", { q: Engine.QUICK.indexOf("Go {a}!") })).error), "cheering for a robot needs a match on");
  assert(!(await ana.emit("host:live", { chat: false })).ok, "students can't change chat settings");

  // teacher controls
  await host.emit("host:live", { chat: false });
  assert(/off/.test((await ben.emit("player:chat", { q: 2 })).error), "chat off");
  await host.emit("host:live", { chat: true, slow: true });
  assert((await ben.emit("player:chat", { q: 2 })).ok, "chat back on");
  await sleep(100);
  assert(/Slow mode/.test((await ben.emit("player:chat", { q: 3 })).error), "slow mode: one message every 10 seconds");
  await host.emit("host:live", { slow: false });
  await host.emit("host:mute", { playerId: cy.id, on: true });
  await sleep(100);
  assert(host.last("room:state").live.muted.includes(cy.id), "Cy muted (devices see it)");
  assert(/turned off chat for you/.test((await cy.emit("player:chat", { q: 4 })).error), "a muted student can't send");
  await host.emit("host:mute", { playerId: cy.id, on: false });
  assert((await cy.emit("player:chat", { q: 4 })).ok, "unmuted");
  assert(!(await host.emit("host:announce", { text: "   " })).ok, "an announcement needs words");
  assert((await host.emit("host:announce", { text: "  Two   minutes\nleft!  " })).ok, "announce");
  await sleep(100);
  assert.strictEqual(dee.last("room:state").announce.text, "Two minutes left!", "every device gets the announcement, tidied");

  // a device that comes back gets the chat so far
  const ana2 = await connect();
  assert((await ana2.emit("player:join", { code, builder: "Ana", bot: bot("ZAPPY", 1), playerId: ana.id, token: ana.token })).rejoined, "Ana rejoins");
  await sleep(100);
  assert.deepStrictEqual(ana2.last("room:chatlog").map((m) => m.text), [Engine.QUICK[0], Engine.QUICK[2], Engine.QUICK[4]], "and sees the messages so far");

  // the fight on devices
  assert((await host.emit("host:start", {})).ok, "start the tournament");
  const nx = await host.emit("host:next", {}), match = nx.match;
  assert(nx.ok && match.seeds.length >= 1, "first match");
  assert(!(await host.emit("host:watch", { matchId: match.id, g: 0 })).ok, "not before predictions close");
  const fan = kids.find((k) => k.id !== match.a.id && k.id !== match.b.id);
  await sleep(3100); // past the 3-second limit, whoever the fan is
  r = await fan.emit("player:chat", { q: Engine.QUICK.indexOf("Go {a}!") });
  await sleep(100);
  assert(r.ok && host.last("room:chat").text === `Go ${match.a.bot.name}!` && host.last("room:chat").side === "a", "cheering names the robot: " + host.last("room:chat").text);
  await host.emit("host:lock", {});
  assert((await host.emit("host:watch", { matchId: match.id, g: 0, speed: 2 })).ok, "the board starts the fight");
  await sleep(150);
  for (const k of [ana2, ben, cy, dee]) {
    const w = k.last("room:watch");
    assert(w && w.matchId === match.id && w.seed === match.seeds[0] && w.a.name === match.a.bot.name && w.b.name === match.b.bot.name && w.speed === 2, "every device gets the same fight (seed and robots) at the board's speed");
  }
  assert.strictEqual(Engine.simulate(ben.last("room:watch").a, ben.last("room:watch").b, ben.last("room:watch").seed).winner === 0 ? match.a.id : match.b.id, (await (async () => { const sim = Engine.simulate(match.a.bot, match.b.bot, match.seeds[0]); return sim.winner === 0 ? match.a.id : match.b.id; })()), "a device replaying it gets the board's winner");
  host.send("host:watchCtl", { speed: 3 }); host.send("host:watchCtl", { skip: true }); host.send("host:watchCtl", { speed: 9 });
  ben.send("host:watchCtl", { skip: true }); // students can't
  await sleep(150);
  assert.deepStrictEqual(dee.got("room:watchCtl"), [{ speed: 3 }, { skip: true }], "speed and Skip follow the board (bad values and students ignored)");
  await host.emit("host:matchDone", { matchId: match.id });
  host.send("host:watchCtl", { speed: 1 }); await sleep(100);
  assert.strictEqual(dee.got("room:watchCtl").length, 2, "match over: speed changes aren't sent any more");
  await host.emit("host:live", { fights: false });
  const nx2 = await host.emit("host:next", {}); await host.emit("host:lock", {});
  const before = dee.got("room:watch").length, off = await host.emit("host:watch", { matchId: nx2.match.id, g: 0 });
  await sleep(100);
  assert(off.ok && off.off && dee.got("room:watch").length === before, "Fights on devices off: nothing is sent");
  await host.emit("host:matchDone", { matchId: nx2.match.id });

  // Race Day: positions reach students' game pages
  await host.emit("host:gp", { tracks: [0] });
  await host.emit("host:gpGo", {});
  await sleep(700);
  assert(dee.got("gp:live").length >= 2, "Race Day positions reach the game page (" + dee.got("gp:live").length + " updates)");
  await host.emit("host:gpClose", {});
  [host, ana2, ...kids].forEach((k) => k.close());
  console.log("Live tests passed");
})().catch((e) => { console.error(e.message || e); console.error("server log:\n" + log); process.exitCode = 1; }).finally(() => server.kill());
let r;
