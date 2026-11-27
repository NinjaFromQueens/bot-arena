// The teacher's mission data (R-19, shared-parts-spec section 9) against a real server: only students in the game (with
// their game pass) can send, one message a second, unknown missions and made-up predictions are refused, the server works
// out right, goal and changes itself (a forged answer or out-of-range choice changes nothing), only the board gets the
// numbers, kicking and resetting clear them, and the class's reading level reaches students.
const assert = require("assert");
const path = require("path");
const { spawn } = require("child_process");
const Missions = require("../public/js/missions.js");
const Race = require("../public/js/race.js");
const Flight = require("../public/js/flight.js");
const Challenges = require("../public/js/challenges.js");
Missions.register("racer", Race.MISSION); Missions.register("lab", Flight.MISSION); Missions.register("challenge", Challenges.MISSION);
const Echoes = require("../public/js/echoes.js");
Echoes.use(JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../public/data/echoes/index.json"), "utf8")).map((id) => require(`../public/data/echoes/${id}.json`)), require("../public/data/echoes/sets.json"));
Missions.register("echo", Echoes.MISSION);
const file = (id) => require(`../public/data/missions/${id}.json`);

const PORT = 3198, BASE = `http://localhost:${PORT}`;
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
  const { code, hostKey } = await host.emit("host:create", {});
  const kids = [];
  for (const [i, name] of ["Ana", "Ben", "Cy"].entries()) {
    const k = await connect(), r = await k.emit("player:join", { code, builder: name, bot: bot(["ZAPPY", "TANKO", "RUSTY"][i], i + 1) });
    assert(r.ok, "joined: " + name); Object.assign(k, { id: r.playerId, who: { code, playerId: r.playerId, token: r.token } }); kids.push(k);
  }
  const [ana, ben, cy] = kids;
  // a mission page is its own connection: it proves who it is with the saved game pass
  const page = (k) => connect().then((s) => Object.assign(s, { send: (msg) => s.emit("player:mission", { who: k.who, ...msg }) }));
  const [anaP, benP, cyP] = await Promise.all(kids.map(page));
  const hop = file("lab-hop"), start = { ...Flight.DEFAULT_DESIGN, flipOn: 0 }, truth = Missions.answer(hop, start);

  // who can send
  const stranger = await connect();
  const no = await stranger.emit("player:mission", { m: "lab-hop", p: "yes", c: start });
  assert(/Join your class/.test(no.error) && no.gone, "no game pass: refused (gone, so the device drops any class reading level)");
  assert(/Join your class/.test((await stranger.emit("player:mission", { who: { ...ana.who, token: "x" }, m: "lab-hop", p: "yes", c: start })).error), "a wrong token: refused");
  assert(/no mission/.test((await anaP.send({ m: "nope", p: "yes", c: start })).error), "an unknown mission: refused");
  await sleep(1050);
  assert(/isn't one of the choices/.test((await anaP.send({ m: "lab-hop", p: "maybe", c: start })).error), "a made-up prediction: refused");
  await sleep(1050);

  // Ana: right first time, then one change, then two
  let r = await anaP.send({ m: "lab-hop", p: truth, c: start });
  assert(r.ok && r.correct === true && r.goal === Missions.result(hop, start).goal && r.tier === null, "the server works out right and goal; no class reading level yet");
  r = await anaP.send({ m: "lab-hop", p: truth, c: start });
  assert(/Wait a moment/.test(r.error) && r.wait, "one message a second per student (flagged, so the page sends it again)");
  await sleep(1050);
  await anaP.send({ m: "lab-hop", p: "yes", c: { ...start, lift: start.lift + 2 } });
  await sleep(1050);
  await anaP.send({ m: "lab-hop", p: "yes", c: { ...start, lift: start.lift + 4, tanks: start.tanks + 1 } });

  // Ben: wrong first, says he's right (ignored), and sends values outside the mission's list (clamped)
  r = await benP.send({ m: "lab-hop", p: truth === "yes" ? "no" : "yes", c: { ...start, speed: 999, material: -4 }, correct: true, goal: true });
  assert(r.ok && r.correct === false, "a forged correct/goal changes nothing");
  await sleep(1050);
  r = await benP.send({ m: "lab-hop", p: "yes", c: start }); // speed 999 fell back to the start, so this is no change
  assert(r.ok, "Ben's second try");

  // Cy: a Racer run she drove (driven again on the server) and a Brain Challenge
  const gh = file("gear-hill"), inputs = Race.autoLap({ gear: 2, tire: 1 }, undefined, Race.stripOf(gh.setting));
  assert(/can't be checked/.test((await cyP.send({ m: "gear-hill", p: "top", c: { gear: 2, tire: 1 }, run: { inputs: "zz!" } })).error), "a run that isn't real inputs: refused");
  await sleep(1050);
  r = await cyP.send({ m: "gear-hill", p: "top", c: { gear: 2, tire: 1 }, run: { inputs } });
  assert(r.ok && r.correct && r.goal, "8:1 driven well reaches the top, as predicted");
  await sleep(1050);
  const bc = file("bc-bruiser"), win = Challenges.choiceOf(Challenges.rulesOf(Challenges.LIST[0].answer));
  r = await cyP.send({ m: "bc-bruiser", p: Missions.answer(bc, win), c: win });
  assert(r.ok && r.correct && r.goal, "the right rules beat BRUISER, and the band was right");
  await sleep(150);

  // only the board gets the numbers
  let d = host.last("room:missions");
  assert(d, "the board got the mission data");
  const anaTries = [start, { ...start, lift: start.lift + 2 }, { ...start, lift: start.lift + 4, tanks: start.tanks + 1 }];
  const row = (pid, mid) => d.rows.find((x) => x[0] === pid && x[1] === mid);
  assert.deepStrictEqual(row(ana.id, "lab-hop").slice(2), [1, 3, 1, 1, anaTries.some((c) => Missions.result(hop, c).goal) ? 1 : 0], "Ana: right first, 3 tries, one single change, one double change");
  assert.deepStrictEqual(row(ben.id, "lab-hop").slice(2, 6), [0, 2, 0, 0], "Ben: wrong first, 2 tries, and no change (the out-of-range values were ignored)");
  assert.deepStrictEqual(row(cy.id, "gear-hill").slice(2), [1, 1, 0, 0, 1], "Cy's Racer run");
  const sum = d.summary.find((s) => s[0] === "lab-hop");
  assert.deepStrictEqual(sum.slice(0, 4), ["lab-hop", hop.title, 2, 1], "the class total: 2 students, 1 right first time");
  assert(d.rows.every((x) => x.length === 7 && x.slice(2).every((n) => Number.isInteger(n))), "rows are ids and numbers only");
  assert(JSON.stringify(d).indexOf("Ana") < 0, "no names in the data (the board has them from the player list)");
  for (const s of [ana, ben, cy, anaP, benP, cyP]) assert(!s.got("room:missions").length, "students never get the board's data");

  // a rule edit counts as one change in a Brain Challenge
  await sleep(1050);
  await cyP.send({ m: "bc-bruiser", p: 0, c: Challenges.choiceOf([]) }); // removed the one rule
  await sleep(150);
  d = host.last("room:missions");
  assert.deepStrictEqual(row(cy.id, "bc-bruiser").slice(3, 5), [2, 1], "taking out one rule is one change");

  // Echo Lab: the server judges the verdict with the clues the student really checked (cleaned: junk and unknown ids
  // don't count), so a right guess without the proving clue doesn't meet the goal
  await sleep(1050);
  r = await anaP.send({ m: "echo-festival", p: 0, c: { verdict: 1 }, run: { checked: ["item:lanterns", 42, "x".repeat(500), "item:nope"] } });
  assert(r.ok && !r.correct && !r.goal, "Echo Lab: altered after only the lanterns is right but a guess, and the first call (real) was wrong");
  await sleep(1050);
  r = await anaP.send({ m: "echo-festival", p: 1, c: { verdict: 1 }, run: { checked: ["item:banner"] } });
  assert(r.ok && r.correct && r.goal, "Echo Lab: altered after tapping the banner meets the goal");
  await sleep(1050);
  r = await anaP.send({ m: "echo-archive", p: 2, c: { v1: 0, v2: 0, v3: 0, v4: 1, v5: 1, v9: 1 }, run: { checked: [["item:caps"], ["item:candles"], ["copies"], ["item:train"], ["light"]] } });
  assert(r.ok && r.correct && r.goal, "Echo Lab: the Archive's five, each backed by a clue, and two altered");
  await sleep(150);
  d = host.last("room:missions");
  assert.deepStrictEqual(row(ana.id, "echo-festival").slice(2), [0, 2, 0, 0, 1], "Ana's Echo Lab row: wrong first, 2 tries, goal met");

  // the class's reading level
  assert(!(await ana.emit("host:settings", { tier: "cadet" })).ok, "students can't set it");
  assert(!(await host.emit("host:settings", { tier: "grade5" })).ok, "only the three levels (or students choose)");
  assert((await host.emit("host:settings", { tier: "operative" })).ok, "the teacher sets Operative");
  await sleep(100);
  assert.strictEqual(ana.last("room:state").settings.tier, "operative", "game pages get it");
  await sleep(1050);
  assert.strictEqual((await anaP.send({ m: "lab-hop", p: "yes", c: start })).tier, "operative", "mission pages get it in the reply");
  await host.emit("host:settings", { tier: "" });

  // a resumed board catches up; kicking and resetting clear the data
  const board2 = await connect();
  assert((await board2.emit("host:resume", { code, hostKey })).ok);
  await sleep(100);
  assert(board2.last("room:missions").rows.length === d.rows.length, "a resumed board gets the data");
  await host.emit("host:kick", { playerId: ben.id });
  await sleep(100);
  d = host.last("room:missions");
  assert(!d.rows.some((x) => x[0] === ben.id) && d.summary.find((s) => s[0] === "lab-hop")[2] === 1, "a removed student's rows go");
  await host.emit("host:reset", {});
  await sleep(100);
  d = host.last("room:missions");
  assert(!d.rows.length && !d.summary.length, "a new game starts with no mission data");

  console.log("Mission data tests passed");
  server.kill(); process.exit(0);
})().catch((e) => { console.error(e); console.error(log); server.kill(); process.exit(1); });
