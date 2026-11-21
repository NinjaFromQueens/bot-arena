// Speed Run against a real server (S-03): only the board runs it, an answer before a problem opens or for an old problem
// is refused, a forged "correct" scores nothing, a wrong answer locks the student out for 5 seconds and the third wrong
// one ends their tries, right answers score and nothing is ever taken away, students never see the answer, steps, seed
// or car before the reveal, the board's counts and mistakes chart are right, kicking drops a student's points, and the
// round ends with the results.
const assert = require("assert");
const path = require("path");
const { spawn } = require("child_process");
const Sprint = require("../public/js/sprint.js");

const PORT = 3199, BASE = `http://localhost:${PORT}`;
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
// a value that's wrong and not one of the named mistakes
const offValue = (p, stats) => (p.input.kind === "choice" ? null : stats.answer.value * 3 + 7777);

(async () => {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + "/healthz")).ok) break; } catch {} await sleep(100); }
  const host = await connect();
  const { code } = await host.emit("host:create", {});
  const kids = [];
  for (const [i, name] of ["Ana", "Ben", "Cy"].entries()) {
    const k = await connect(), r = await k.emit("player:join", { code, builder: name, bot: bot(["ZAPPY", "TANKO", "RUSTY"][i], i + 1) });
    assert(r.ok, "joined: " + name); Object.assign(k, { id: r.playerId }); kids.push(k);
  }
  const [ana, ben, cy] = kids;
  const setup = { set: "thrust", n: 5, timer: 60, names: "top5", tier: "operative" };

  // only the board runs it, and only with real settings
  assert(!(await ana.emit("host:sprint", setup)).ok, "students can't start a Speed Run");
  for (const bad of [{ ...setup, set: "nope" }, { ...setup, n: 7 }, { ...setup, timer: 45 }, { ...setup, names: "all" }, { ...setup, tier: "grade5" }]) assert(!(await host.emit("host:sprint", bad)).ok, "bad settings refused: " + JSON.stringify(bad));
  assert(/over/.test((await ana.emit("player:sprintAnswer", { id: "x:0", value: 1 })).error), "no Speed Run: answers refused");
  assert((await host.emit("host:sprint", setup)).ok, "the board starts a Speed Run");
  await sleep(100);
  let st = ana.last("room:state").sprint;
  assert(st && st.phase === "ready" && st.i === -1 && !st.problem && st.n === 5 && st.name === "Thrust", "ready, no problem yet");
  assert(/over/.test((await ana.emit("player:sprintAnswer", { id: "x:0", value: 1 })).error), "an answer before the first problem is refused");
  assert(!(await host.emit("host:sprintReveal", {})).ok, "nothing to reveal yet");

  // problem 1
  assert((await host.emit("host:sprintNext", {})).ok);
  await sleep(100);
  st = ana.last("room:state").sprint;
  let stats = host.last("room:sprintStats");
  const p = st.problem;
  assert(st.phase === "open" && st.i === 0 && p && p.text && p.tier === "operative", "problem 1 is open, at the class's level");
  for (const k of ["answer", "steps", "mistakes", "car", "seed"]) assert(!(k in p), `students don't get the problem's ${k}`);
  assert(!st.reveal, "no reveal before the teacher shows it");
  assert(!ana.got("room:sprintStats").length, "students never get the board's stats");
  assert(/over/.test((await ana.emit("player:sprintAnswer", { id: p.id.replace(/:0$/, ":1"), value: 1 })).error), "an answer for another problem is refused");

  // Ana: a forged score, then a wrong answer (locked out), then right
  let r = await ana.emit("player:sprintAnswer", { id: p.id, value: offValue(p, stats), correct: true, gained: 999 });
  assert(r.ok && r.correct === false && r.gained === 0 && r.lockout > 4000 && r.left === 2, "a forged correct/score changes nothing; wrong = locked out 5 s, 2 tries left");
  r = await ana.emit("player:sprintAnswer", { id: p.id, value: stats.answer.value });
  assert(!r.ok && r.lockout > 0, "locked out: even the right answer waits");
  await sleep(5100);
  r = await ana.emit("player:sprintAnswer", { id: p.id, value: Sprint.fmt(stats.answer.value, Number.isInteger(stats.answer.value) ? 0 : 1) });
  assert(r.ok && r.correct && r.gained >= 100 && r.gained <= 200 && r.total === r.gained, "right after the lockout: 100 plus a speed bonus");
  assert(/already/.test((await ana.emit("player:sprintAnswer", { id: p.id, value: stats.answer.value })).error), "no scoring twice");
  assert(!(await host.emit("host:sprintNext", {})).ok, "the board can't skip ahead while a problem is open");
  // Ben: wrong, and not one of the named mistakes
  r = await ben.emit("player:sprintAnswer", { id: p.id, value: stats.answer.value * 3 + 7777 });
  assert(r.ok && !r.correct && r.left === 2);
  // Cy: right straight away
  r = await cy.emit("player:sprintAnswer", { id: p.id, value: stats.answer.value });
  assert(r.ok && r.correct, "Cy right first try");
  await sleep(100);
  stats = host.last("room:sprintStats");
  assert.strictEqual(stats.answered, 3); assert.strictEqual(stats.right, 2); assert.strictEqual(stats.other, 1, "Ben's wrong answer wasn't a named mistake");
  assert.strictEqual(stats.leaders.length, 2, "two students have points");
  const me = await ben.emit("player:sprintMe", {});
  assert(me.ok && me.tries === 1 && me.left === 2 && !me.right && me.lockout > 0, "a student can ask where they stand (after a refresh)");

  // reveal: students now get the answer and steps; names only for the top 5
  assert((await host.emit("host:sprintReveal", {})).ok);
  await sleep(100);
  st = ben.last("room:state").sprint;
  assert(st.phase === "revealed" && st.reveal && st.reveal.answer.value === stats.answer.value && st.reveal.steps.length >= 2 && st.top.length === 2 && st.top[0].builder, "revealed: answer, steps, top names");
  assert(/over/.test((await ben.emit("player:sprintAnswer", { id: p.id, value: stats.answer.value })).error), "no answers after the reveal");

  // problem 2: a named mistake is counted on the board, and the third wrong answer ends the tries
  await host.emit("host:sprintNext", {});
  await sleep(100);
  const p2 = ben.last("room:state").sprint.problem; stats = host.last("room:sprintStats");
  assert(p2.id !== p.id && stats.i === 1, "problem 2 is a new problem");
  assert(stats.mistakeValues.length >= 1, "the board knows the named mistakes");
  r = await ben.emit("player:sprintAnswer", { id: p2.id, value: stats.mistakeValues[0] }); assert(r.ok && !r.correct && r.left === 2, "a named mistake");
  await sleep(100);
  assert.strictEqual(host.last("room:sprintStats").mistakes[0], 1, "the mistakes chart counts it");
  await sleep(5100);
  r = await ben.emit("player:sprintAnswer", { id: p2.id, value: stats.answer.value * 3 + 7778 }); assert(r.ok && r.left === 1);
  await sleep(5100);
  r = await ben.emit("player:sprintAnswer", { id: p2.id, value: stats.answer.value * 3 + 7779 }); assert(r.ok && r.left === 0 && r.lockout === 0, "third wrong: no lockout, no tries left");
  assert(/No tries left/.test((await ben.emit("player:sprintAnswer", { id: p2.id, value: stats.answer.value })).error), "out of tries");
  await sleep(100);
  assert.strictEqual(host.last("room:sprintStats").other, 1, "the other wrong answers count once per student");

  // kicking drops a student's points; reaching the end shows the results
  await host.emit("host:kick", { playerId: cy.id });
  await sleep(100);
  assert(!host.last("room:sprintStats").leaders.some((l) => l[0] === cy.id), "a removed student's points go");
  await host.emit("host:sprintReveal", {});
  for (let k = 2; k < 5; k++) { await host.emit("host:sprintNext", {}); await host.emit("host:sprintReveal", {}); }
  assert.strictEqual((await host.emit("host:sprintNext", {})).phase, "done", "after the last reveal: the results");
  await sleep(100);
  st = ana.last("room:state").sprint; stats = host.last("room:sprintStats");
  assert(st.phase === "done" && !st.problem && st.top[0].builder === "Ana" && stats.history.length === 5, "done: results and every problem's counts");
  await host.emit("host:sprint", { ...setup, names: "none" }); await host.emit("host:sprintNext", {}); await host.emit("host:sprintReveal", {});
  await sleep(100);
  assert.strictEqual(ana.last("room:state").sprint.top, null, "names hidden: no names reach anyone");
  await host.emit("host:sprintEnd", {});
  await sleep(100);
  assert.strictEqual(ana.last("room:state").sprint, null, "the board ends it");

  console.log("Speed Run server tests passed");
  server.kill(); process.exit(0);
})().catch((e) => { console.error(e); console.error(log); server.kill(); process.exit(1); });
