// The class Now signal (PF-3) against a real server: only the board sets it, only real story missions and steps are
// accepted, every device in the game sees it (and devices in other games don't), and the board can clear it.
const assert = require("assert");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3196, BASE = `http://localhost:${PORT}`;
const server = spawn(process.execPath, [path.join(__dirname, "../server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; server.stdout.on("data", (d) => (log += d)); server.stderr.on("data", (d) => (log += d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function connect() { // a tiny Socket.IO client (Engine.IO v4 over WebSocket)
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace("http", "ws") + "/socket.io/?EIO=4&transport=websocket");
    let n = 0; const acks = new Map();
    const io = { events: [], emit: (ev, data) => new Promise((r) => { const id = ++n; acks.set(id, r); ws.send("42" + id + JSON.stringify([ev, data])); }), last: (ev) => io.events.filter((e) => e[0] === ev).map((e) => e[1]).pop(), close: () => ws.close() };
    ws.addEventListener("error", reject);
    ws.addEventListener("message", (e) => {
      const d = String(e.data);
      if (d[0] === "0") ws.send("40"); else if (d === "2") ws.send("3"); else if (d.startsWith("40")) resolve(io);
      else if (d.startsWith("43")) { const m = /^43(\d+)(.*)$/.exec(d), a = m && acks.get(+m[1]); if (a) { acks.delete(+m[1]); a(JSON.parse(m[2])[0]); } }
      else if (d.startsWith("42")) io.events.push(JSON.parse(d.slice(2)));
    });
  });
}
const bot = (name) => ({ name, body: 0, sensor: 0, brain: 0, tool: 0, color: 1 });

(async () => {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + "/healthz")).ok) break; } catch {} await sleep(100); }
  const host = await connect(), { code, hostKey } = await host.emit("host:create", {});
  const kid = await connect(), ja = await kid.emit("player:join", { code, builder: "Ana", bot: bot("ZAPPY") }); assert(ja.ok);
  const cy = await connect(), jc = await cy.emit("player:join", { code, builder: "Cy", bot: bot("RUSTY") }); assert(jc.ok);
  cy.close(); // Cy's game page closes (another page, or a closed laptop): Cy is still in the class
  const other = await connect(), o = await other.emit("host:create", {}); // a different class
  const kid2 = await connect(); assert((await kid2.emit("player:join", { code: o.code, builder: "Ben", bot: bot("TANKO") })).ok);
  await sleep(100);
  assert.strictEqual(kid.last("room:state").now, null, "no story mission to start with");

  assert(!(await kid.emit("host:now", { mission: "ep5-bridge", step: "briefing" })).ok, "students can't move the class");
  assert(!(await host.emit("host:now", { mission: "ep9-nope", step: "briefing" })).ok, "only real story missions");
  assert(!(await host.emit("host:now", { mission: "ep5-bridge", step: "nap" })).ok, "only the five steps");
  assert((await host.emit("host:now", { mission: "ep5-bridge", step: "briefing" })).ok, "the board starts the bridge mission");
  await sleep(100);
  let now = kid.last("room:state").now;
  assert(now && now.mission === "ep5-bridge" && now.step === "briefing" && now.at > 0, "the student's game page sees the mission and the step");
  assert.strictEqual(kid2.last("room:state").now, null, "another class doesn't");
  // Ana's Lab page (the mission bar) follows the class with her game pass
  const lab = await connect();
  assert(!(await lab.emit("story:hello", { who: { code, playerId: ja.playerId, token: "x" } })).ok, "the mission bar needs the real game pass");
  let hi = await lab.emit("story:hello", { who: { code, playerId: ja.playerId, token: ja.token } });
  assert(hi.ok && hi.now.step === "briefing" && Object.keys(hi.done).length === 0, "it gets the class's step");
  for (const step of ["discover", "build", "mission", "reward"]) {
    assert((await host.emit("host:now", { mission: "ep5-bridge", step })).ok);
    await sleep(60);
    assert.strictEqual(kid.last("room:state").now.step, step, `the class moves to ${step}`);
  }
  await sleep(100);
  let ls = lab.last("story:state");
  assert(ls && ls.now.step === "reward" && ls.done["ep5-bridge"].includes(ja.playerId) && ls.done["ep5-bridge"].includes(jc.playerId), "at Reward, everyone in the class gets it: Ana in the Lab, and Cy whose page was closed");
  assert(kid.last("room:state").storyDone["ep5-bridge"].includes(ja.playerId), "game pages get it too");
  assert(!kid2.last("room:state").storyDone["ep5-bridge"], "another class doesn't");
  const dee = await connect(), jd = await dee.emit("player:join", { code, builder: "Dee", bot: bot("VOLTA") }); assert(jd.ok);
  await sleep(100);
  assert(lab.last("story:state").done["ep5-bridge"].includes(jd.playerId), "a student who joins during the Reward is in the class too");
  const board2 = await connect(); // a resumed board (Mission Control in the same tab) sees where the class is
  assert((await board2.emit("host:resume", { code, hostKey })).ok);
  await sleep(100);
  assert.strictEqual(board2.last("room:state").now.step, "reward", "a resumed board (Mission Control in the same tab) sees where the class is");
  assert((await host.emit("host:now", {})).ok, "the board ends the mission");
  await sleep(100);
  assert.strictEqual(kid.last("room:state").now, null, "devices drop the card");
  assert(lab.last("story:state").now === null && lab.last("story:state").done["ep5-bridge"].length === 3, "the mission bar hears it ended; the finished list stays");
  const eve = await connect(), je = await eve.emit("player:join", { code, builder: "Eve", bot: bot("MAXI") }); assert(je.ok);
  await sleep(100);
  assert(!kid.last("room:state").storyDone["ep5-bridge"].includes(je.playerId), "a student who joins after the mission ended doesn't get its reward");
  console.log("Class Now signal tests passed");
  server.kill(); process.exit(0);
})().catch((e) => { console.error(e); console.error(log); server.kill(); process.exit(1); });
