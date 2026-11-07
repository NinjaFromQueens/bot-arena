// Accounts: the catalog matches the lessons, and the whole account flow works against a real server (in-memory database,
// test sign-in): teachers, classes, rosters, student picture sign-in and its lockout, checked progress, story progress
// merged across two devices, the dashboard,
// the spreadsheet, other teachers kept out, and deleting a student or class deleting their data.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const Catalog = require("../public/js/catalog.js");
const Race = require("../public/js/race.js");

// the catalog's lessons are the lesson files, in index.json's order, with their Recruit titles
const LDIR = path.join(__dirname, "../public/data/lessons"), found = JSON.parse(fs.readFileSync(path.join(LDIR, "index.json"), "utf8")).map((id) => {
  const l = JSON.parse(fs.readFileSync(path.join(LDIR, id + ".json"), "utf8")); return { id, n: typeof l.title === "object" ? l.title.recruit : l.title };
});
assert.deepStrictEqual(Catalog.LESSONS, found, "public/js/catalog.js LESSONS must match the lesson files (ids and Recruit titles, in index.json order)");
assert(Catalog.PICS.length >= 9 && new Set(Catalog.PICS.map((p) => p[0])).size === Catalog.PICS.length, "picture passwords: enough different pictures");

const PORT = 3199, BASE = `http://localhost:${PORT}`;
const env = { ...process.env, PORT: String(PORT), DEV_LOGIN: "1" };
delete env.DATABASE_URL; delete env.RENDER; delete env.GOOGLE_CLIENT_ID;
const server = spawn(process.execPath, [path.join(__dirname, "../server.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; server.stdout.on("data", (d) => (log += d)); server.stderr.on("data", (d) => (log += d));

function client() { // a browser: keeps its cookie, sends this site's Origin on changes
  let cookie = "";
  return async (p, method = "GET", body, headers = {}) => {
    const r = await fetch(BASE + "/api/account" + p, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(method !== "GET" ? { Origin: BASE } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const set = r.headers.get("set-cookie"); if (set) { cookie = set.split(";")[0]; if (/=;/.test(cookie)) cookie = ""; }
    const type = r.headers.get("content-type") || "";
    return { status: r.status, setCookie: set, type, body: type.includes("json") ? await r.json() : new TextDecoder("utf-8", { ignoreBOM: true }).decode(await r.arrayBuffer()) }; // keep a byte-order mark
  };
}

(async () => {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + "/api/account/config")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  const teacher = client(), other = client(), kid = client(), kid2 = client();
  let r = await teacher("/config");
  assert(r.body.ok && r.body.accounts && r.body.dev && r.body.google === null, "accounts on, test sign-in on, no Google set up");
  assert.strictEqual((await teacher("/me")).body.user, null, "nobody signed in yet");
  assert.strictEqual((await teacher("/classes")).status, 401, "teacher pages need a teacher");

  // a teacher signs in and makes a class
  r = await teacher("/dev", "POST", { name: "Ms Ramirez" });
  assert(r.body.ok && /HttpOnly/.test(r.setCookie) && /SameSite=Lax/.test(r.setCookie), "signed in with a safe cookie");
  assert.deepStrictEqual((await teacher("/me")).body.user, { kind: "teacher", name: "Ms Ramirez", email: "" });
  assert.strictEqual((await teacher("/classes", "POST", { name: "  " })).status, 400, "a class needs a name");
  r = await teacher("/classes", "POST", { name: "Period 3" });
  const cls = r.body.class;
  assert(r.body.ok && /^[A-HJ-NP-Z2-9]{6}$/.test(cls.code), "a 6-character class code without 0, O, 1 or I: " + cls.code);
  assert.strictEqual((await teacher("/classes", "POST", { name: "Period 4" }, { Origin: "http://evil.example" })).status, 403, "another site can't make changes");

  // students
  assert.strictEqual((await teacher(`/classes/${cls.id}/students`, "POST", { names: [] })).status, 400, "at least one name");
  r = await teacher(`/classes/${cls.id}/students`, "POST", { names: ["Maya R.", "José M.", "  Ben  ", "<b>Zed</b>", "-Kai"] });
  assert(r.body.ok && r.body.students.length === 5, "five students added");
  const names = r.body.students.map((s) => s.name);
  assert(names.includes("José M.") && names.includes("Ben") && !names.some((n) => /[<>]/.test(n)), "names keep accents, lose markup: " + names.join(", "));
  assert(r.body.students.every((s) => s.pics.length === 3 && s.pics.every((p) => p >= 0 && p < Catalog.PICS.length)), "everyone gets 3 pictures");
  const maya = r.body.students.find((s) => s.name === "Maya R."), ben = r.body.students.find((s) => s.name === "Ben");
  assert(/already in the class/.test((await teacher(`/classes/${cls.id}/students`, "POST", { names: ["maya r."] })).body.error), "no duplicate names");
  assert(/different name/.test((await teacher(`/classes/${cls.id}/students`, "POST", { names: ["Sexy Sam"] })).body.error), "the bad-word filter applies");

  // student sign-in
  assert.strictEqual((await kid("/student/lookup", "POST", { code: "ZZZZZZ" })).status, 404, "wrong class code");
  r = await kid("/student/lookup", "POST", { code: cls.code.toLowerCase() });
  assert(r.body.ok && r.body.className === "Period 3" && r.body.students.length === 5 && !("pics" in r.body.students[0]), "the code shows the names to pick from, never the pictures");
  const wrong = maya.pics.map((p) => (p + 1) % Catalog.PICS.length);
  assert.strictEqual((await kid("/student/login", "POST", { code: cls.code, studentId: maya.id, pics: wrong })).status, 401, "wrong pictures");
  for (let i = 0; i < 4; i++) await kid("/student/login", "POST", { code: cls.code, studentId: maya.id, pics: wrong });
  assert.strictEqual((await kid("/student/login", "POST", { code: cls.code, studentId: maya.id, pics: maya.pics })).status, 429, "after 5 wrong tries even the right pictures wait");
  r = await kid2("/student/login", "POST", { code: cls.code, studentId: ben.id, pics: ben.pics });
  assert(r.body.ok && r.body.name === "Ben" && /HttpOnly/.test(r.setCookie), "Ben signs in with his pictures");
  assert.deepStrictEqual((await kid2("/me")).body.user, { kind: "student", name: "Ben", className: "Period 3" });
  assert.strictEqual((await kid2("/classes")).status, 401, "students can't use teacher pages");

  // progress: checked before it's kept
  assert.deepStrictEqual((await kid2("/progress")).body.progress, {}, "nothing saved yet");
  r = await kid2("/progress/learn-progress", "PUT", { value: { robot: { done: true, score: 3, total: 4 }, "Bad Key!": { done: true }, sensors: "x" } });
  assert.deepStrictEqual(r.body.value, { robot: { done: true, score: 3, total: 4 } }, "lesson progress: bad entries dropped");
  assert.strictEqual((await kid2("/progress/secret", "PUT", { value: 1 })).status, 400, "only known keys are saved");
  assert.strictEqual((await kid2("/progress/ba-bot", "PUT", { value: { name: "X", body: 99 } })).status, 400, "a broken robot isn't saved");
  const su = { gear: 0, tire: 0 }, inputs = Race.autoLap(su, undefined, 1), real = Race.lap(su, inputs, 1).time;
  r = await kid2("/progress/race-bests", "PUT", { value: { 1: { time: 1.0, setup: su, inputs }, 2: { time: 2, setup: su, inputs: inputs.slice(0, 500) } } });
  assert(r.body.ok && Math.abs(r.body.value[1].time - real) < 1e-9 && !(2 in r.body.value), `race laps are driven again: a faked 1.0 s becomes ${real.toFixed(2)} s, an unfinished lap is dropped`);
  await kid2("/progress/fcl-stars", "PUT", { value: { hop: [true, true, false], car: [true, 1, 0] } });
  await kid2("/progress/rba-challenges", "PUT", { value: { bruiser: { done: true, best: 8 }, ghost: { done: false, best: 4 } } });
  r = await kid2("/progress/race-look", "PUT", { value: { body: 99, c1: 3 } });
  assert.strictEqual(r.body.value.body, Race.cleanLook({}).body, "car looks are cleaned");
  assert.strictEqual((await fetch(BASE + "/api/account/progress/race-look", { method: "PUT", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ value: { c1: 1 } }) })).status, 401, "no saving without signing in");
  const got = (await kid2("/progress")).body.progress;
  assert(got["learn-progress"].robot.done && got["race-bests"][1].inputs === inputs && got["fcl-stars"].car[1] === true, "everything saved comes back");

  // the story: checked, and merged when two devices save (the earliest time for each step, a goal met on either)
  const kid3 = client(); // Ben on a second Chromebook
  assert((await kid3("/student/login", "POST", { code: cls.code, studentId: ben.id, pics: ben.pics })).body.ok, "Ben signs in on a second device");
  const T = Date.now() - 3600e3;
  r = await kid2("/progress/cr-record", "PUT", { value: { v: 1, missions: { "ep5-bridge": { briefing: T, discover: T + 60e3, mission: 1000, junk: 5 }, "BAD ID": { briefing: T } }, rewards: { "echo-bridge-lights": "nope" }, last: "ep5-bridge" } });
  assert.deepStrictEqual(r.body.value, { v: 1, missions: { "ep5-bridge": { briefing: T, discover: T + 60e3 } }, rewards: {}, last: "ep5-bridge" }, "story record: bad ids, fields and times dropped");
  r = await kid3("/progress/cr-record", "PUT", { value: { v: 1, missions: { "ep5-bridge": { briefing: T + 5e3, build: T + 120e3, reward: T + 200e3, done: T + 200e3 } }, rewards: { "echo-bridge-lights": T + 200e3 }, last: "ep5-bridge" } });
  assert.deepStrictEqual(r.body.value.missions["ep5-bridge"], { briefing: T, discover: T + 60e3, build: T + 120e3, reward: T + 200e3, done: T + 200e3 }, "a second device's record merges in: the earliest time for each step");
  assert.strictEqual(r.body.value.rewards["echo-bridge-lights"], T + 200e3, "and its rewards");
  r = await kid2("/progress/cr-record", "PUT", { value: { v: 1, missions: { "ep5-bridge": { briefing: T, discover: T + 60e3 } }, rewards: {}, last: "ep5-bridge" } });
  assert(r.body.value.missions["ep5-bridge"].done && r.body.value.rewards["echo-bridge-lights"], "an older device saving again doesn't take the finished mission away");
  await kid2("/progress/cr-missions", "PUT", { value: { "lab-bridge": { tries: 3, firstRight: false, goal: false } } });
  r = await kid3("/progress/cr-missions", "PUT", { value: { "lab-bridge": { tries: 2, firstRight: true, goal: true }, "lab-hop": { tries: 1, firstRight: true, goal: true }, "Nope!": { tries: 1 } } });
  assert.deepStrictEqual(r.body.value, { "lab-bridge": { tries: 3, firstRight: false, goal: true }, "lab-hop": { tries: 1, firstRight: true, goal: true } }, "mission tries merge: the most tries, the first prediction kept, a goal met on either");
  assert.strictEqual((await kid2("/progress/cr-tier", "PUT", { value: "wizard" })).status, 400, "only real reading levels");
  assert.strictEqual((await kid2("/progress/cr-tier", "PUT", { value: "operative" })).body.value, "operative", "the reading level is saved");
  const story = (await kid3("/progress")).body.progress;
  assert(story["cr-record"].missions["ep5-bridge"].done && story["cr-missions"]["lab-hop"].goal && story["cr-tier"] === "operative", "the story follows Ben to the other device");

  // the teacher's dashboard and spreadsheet
  r = await teacher(`/classes/${cls.id}`);
  const row = r.body.students.find((s) => s.name === "Ben");
  assert(row.progress["learn-progress"].robot.done && row.progress["race-bests"][1].time === got["race-bests"][1].time && !("inputs" in row.progress["race-bests"][1]) && row.lastSeen, "dashboard: progress (no race inputs), last signed in");
  assert.deepStrictEqual(row.progress["cr-record"], { done: ["ep5-bridge"] }, "dashboard: the story missions finished, without the step times");
  assert(!("cr-missions" in row.progress) && !("cr-tier" in row.progress), "dashboard: nothing else from the story");
  r = await teacher(`/classes/${cls.id}/export.csv`);
  assert(/text\/csv/.test(r.type) && r.body.startsWith("﻿Student,Lessons done,What makes a robot?"), "spreadsheet header");
  const benLine = r.body.split("\r\n").find((l) => l.startsWith("Ben,"));
  assert(benLine && benLine.startsWith("Ben,1,3/4,") && benLine.includes(String(got["race-bests"][1].time.toFixed(2))), "Ben's row: 1 lesson (3/4) and his race time: " + benLine);
  assert(r.body.includes(`"'-Kai"`), "a cell starting with - can't run as a spreadsheet formula");
  const head = r.body.replace(/^\uFEFF/, "").split("\r\n")[0].split(","), storyCol = head.indexOf("Story missions done");
  assert(storyCol > 0 && benLine.split(",")[storyCol] === "1", "spreadsheet: Ben finished 1 story mission");

  // other teachers can't see or change this class
  await other("/dev", "POST", { name: "Mr Lee" });
  assert.strictEqual((await other(`/classes/${cls.id}`)).status, 404, "another teacher can't open the class");
  assert.strictEqual((await other(`/students/${ben.id}`, "DELETE")).status, 404, "or remove its students");
  assert.strictEqual((await other("/classes")).body.classes.length, 0, "and doesn't see it in their list");

  // new pictures sign the student out everywhere; removing a student deletes their data
  r = await teacher(`/students/${ben.id}/reset`, "POST");
  assert(r.body.ok && r.body.pics.length === 3, "new pictures");
  assert.strictEqual((await kid2("/progress")).status, 401, "Ben's old sign-in stopped working");
  assert((await kid2("/student/login", "POST", { code: cls.code, studentId: ben.id, pics: r.body.pics })).body.ok, "Ben signs in with the new pictures");
  assert((await kid2("/progress")).body.progress["learn-progress"], "and his progress is still there");
  assert((await teacher(`/students/${ben.id}`, "DELETE")).body.ok, "remove Ben");
  assert(!(await teacher(`/classes/${cls.id}`)).body.students.some((s) => s.id === ben.id), "Ben is gone from the class");
  assert.strictEqual((await kid2("/progress")).status, 401, "and signed out");
  assert((await teacher(`/classes/${cls.id}`, "DELETE")).body.ok, "delete the class");
  assert.strictEqual((await kid("/student/lookup", "POST", { code: cls.code })).status, 404, "its code stops working");
  assert.strictEqual((await teacher("/classes")).body.classes.length, 0, "no classes left");
  r = await teacher("/logout", "POST");
  assert(r.body.ok && (await teacher("/me")).body.user === null, "signed out");
  console.log("Accounts tests passed");
})().catch((e) => { console.error(e.message || e); console.error("server log:\n" + log); process.exitCode = 1; }).finally(() => server.kill());
