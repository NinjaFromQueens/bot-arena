// Teacher accounts, classes, student sign-in and saved progress: the first step toward a platform schools can buy.
// Teachers sign in with Google (GOOGLE_CLIENT_ID). Students sign in with their class code, their name and a 3-picture
// password their teacher can see and print (young students, shared Chromebooks: no email, nothing to type but the code).
// Progress is the localStorage data the pages already keep (lessons, Lab, Brain Challenges, racer, robots, the story), checked
// here and stored per student, so it follows them to any device; public/js/account.js copies it back and forth.
// Kept on purpose: the teacher's name and email, students' names (first name and last initial) and their progress.
// Deleting a student, class or teacher deletes everything under it. Live games don't use any of this.
const crypto = require("crypto");
const express = require("express");
const DB = require("./db");
const Catalog = require("../public/js/catalog.js");
const Challenges = require("../public/js/challenges.js");

const CLASS_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // class codes: 6 characters, no 0/O or 1/I to mix up
const TEACHER_SECS = 14 * 86400, STUDENT_SECS = 12 * 3600; // a teacher stays signed in two weeks, a student one school day
const MAX_CLASSES = 30, MAX_STUDENTS = 60, MAX_VALUE = 48 * 1024;
const COOKIE = "ba_sid";

module.exports = function accounts({ app, isBlocked, Engine, Flight, Race }) {
  let db = null;
  const ready = DB.open().then((d) => { db = d; console.log(d ? `Accounts: ${d.kind} database` : "Accounts: off (no DATABASE_URL)"); })
    .catch((e) => console.error("Accounts: the database didn't open, so accounts are off:", e.message));
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null;
  const google = CLIENT_ID ? new (require("google-auth-library").OAuth2Client)(CLIENT_ID) : null;
  const devLogin = process.env.DEV_LOGIN === "1" && !process.env.RENDER; // local testing only: a teacher sign-in without Google

  // ---------------- helpers ----------------
  const h = (fn) => (req, res, next) => fn(req, res, next).catch((e) => { console.error("Accounts:", e); res.status(500).json({ ok: false, error: "Something went wrong. Try again." }); });
  const fail = (res, code, error) => res.status(code).json({ ok: false, error });
  const id = () => crypto.randomUUID();
  const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
  // counts failures per key over a time window (wrong pictures, wrong class codes, sign-in attempts)
  function counter(max, ms) {
    const m = new Map();
    const live = (k) => { const e = m.get(k); return e && Date.now() - e.t <= ms ? e : null; };
    return {
      hit(k) { const e = live(k); if (e) e.n++; else m.set(k, { n: 1, t: Date.now() }); if (m.size > 5000) for (const [key] of m) if (!live(key)) m.delete(key); },
      over: (k) => { const e = live(k); return !!e && e.n >= max; },
      clear: (k) => m.delete(k),
    };
  }
  const googleTries = counter(30, 10 * 60e3), codeMisses = counter(60, 10 * 60e3), picMisses = counter(5, 5 * 60e3), classMisses = counter(60, 10 * 60e3), saves = counter(120, 60e3);
  // names: letters in any language, numbers, spaces and . ' - (so "José M." works), no bad words
  const cleanName = (s, max) => String(s || "").normalize("NFC").replace(/[^\p{L}\p{N} .'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, max);
  const okName = (n) => n.length > 0 && !isBlocked(n);
  const int = (v, lo, hi) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
  const newPics = () => Array.from({ length: Catalog.PIC_LEN }, () => crypto.randomInt(Catalog.PICS.length)).join(",");
  const csvCell = (v) => { const s = String(v == null ? "" : v); return /^[=+\-@]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

  // ---------------- sessions (a random token in an HttpOnly cookie; only its hash is stored) ----------------
  const tokenOf = (req) => { const m = /(?:^|;\s*)ba_sid=([a-f0-9]{64})(?:;|$)/.exec(req.get("cookie") || ""); return m ? m[1] : null; };
  async function startSession(req, res, kind, userId) {
    const t = crypto.randomBytes(32).toString("hex"), secs = kind === "teacher" ? TEACHER_SECS : STUDENT_SECS;
    await db.query(`DELETE FROM sessions WHERE expires < $1`, [Date.now()]);
    await db.query(`INSERT INTO sessions (token_hash, kind, user_id, expires) VALUES ($1, $2, $3, $4)`, [hash(t), kind, userId, Date.now() + secs * 1000]);
    res.setHeader("Set-Cookie", `${COOKIE}=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${secs}${req.secure ? "; Secure" : ""}`);
  }
  async function who(req) { // the signed-in teacher or student, or null
    const t = tokenOf(req); if (!t) return null;
    const s = (await db.query(`SELECT kind, user_id FROM sessions WHERE token_hash = $1 AND expires > $2`, [hash(t), Date.now()])).rows[0];
    if (!s) return null;
    if (s.kind === "teacher") {
      const u = (await db.query(`SELECT id, name, email FROM teachers WHERE id = $1`, [s.user_id])).rows[0];
      return u ? { kind: "teacher", ...u } : null;
    }
    const u = (await db.query(`SELECT s.id, s.name, s.class_id, c.name AS class_name FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = $1`, [s.user_id])).rows[0];
    return u ? { kind: "student", ...u } : null;
  }
  const need = (kind) => h(async (req, res, next) => {
    const u = await who(req);
    if (!u || u.kind !== kind) return fail(res, 401, "Please sign in again.");
    req.user = u; next();
  });
  async function myClass(req, classId) { // a class this teacher owns
    return (await db.query(`SELECT id, name, code FROM classes WHERE id = $1 AND teacher_id = $2`, [String(classId), req.user.id])).rows[0] || null;
  }
  async function myStudent(req, studentId) { // a student in one of this teacher's classes
    return (await db.query(`SELECT s.id, s.name, s.class_id FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = $1 AND c.teacher_id = $2`, [String(studentId), req.user.id])).rows[0] || null;
  }

  // ---------------- progress: what's kept, and how each kind is checked ----------------
  function each(v, max, fn, re = /^[a-z0-9-]{1,24}$/) { // an object of id -> value, cleaned item by item (bad items are dropped)
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const out = {}; let n = 0;
    for (const [k, x] of Object.entries(v)) { if (n >= max || !re.test(k)) continue; const c = fn(x, k); if (c != null) { out[k] = c; n++; } }
    return out;
  }
  const obj = (x) => x && typeof x === "object" && !Array.isArray(x);
  // story progress (cr-record): each step's time in ms; a time before 2024 or more than a day ahead is dropped
  const when = (x) => { const n = Math.round(Number(x)); return Number.isFinite(n) && n >= 1.7e12 && n <= Date.now() + 864e5 ? n : null; };
  const STORY_ID = /^[a-z0-9-]{1,40}$/, STEP_TIMES = ["briefing", "discover", "build", "mission", "reward", "done"];
  const times = (x) => { if (!obj(x)) return null; const o = {}; for (const s of STEP_TIMES) { const t = when(x[s]); if (t) o[s] = t; } return o; };
  const rulesOf = (x) => { const b = Engine.sanitizeBot({ name: "R", body: 0, sensor: 0, brain: 3, tool: 0, color: 0, rules: x }); return b && Array.isArray(x) ? b.rules : null; };
  const KEYS = {
    "learn-progress": (v) => each(v, 60, (x) => (obj(x) ? { done: !!x.done, score: int(x.score, 0, 99), total: int(x.total, 0, 99) } : null)),
    "fcl-stars": (v) => each(v, 40, (x) => (Array.isArray(x) ? [0, 1, 2].map((i) => !!x[i]) : null)),
    "fcl-design": (v) => (obj(v) ? Flight.clampDesign(v) : null),
    "fcl-mission": (v) => int(v, 0, Flight.MISSIONS.length - 1),
    "rba-challenges": (v) => each(v, 20, (x) => (obj(x) ? { done: !!x.done, best: int(x.best, 0, 10) } : null)),
    "rba-ch-rules": (v) => each(v, 20, rulesOf),
    // racer laps are driven again here, so the time (and the medal on the dashboard) is real
    "race-bests": (v) => each(v, Race.TRACKS.length, (x, k) => {
      if (!obj(x) || !Race.TRACKS[+k] || typeof x.inputs !== "string" || x.inputs.length > Race.MAX_STEPS || !/^[a-l]*$/.test(x.inputs)) return null;
      const setup = Race.clampSetup(x.setup), r = Race.lap(setup, x.inputs, +k);
      return r.finished ? { time: r.time, setup, inputs: x.inputs } : null;
    }),
    "race-look": (v) => Race.cleanLook(v),
    "race-setup": (v) => Race.clampSetup(v),
    "race-track": (v) => int(v, 0, Race.TRACKS.length - 1),
    "ba-bot": (v) => Engine.sanitizeBot(v, Engine.WEIGHT_CLASSES[Engine.WEIGHT_CLASSES.length - 1].kg),
    "rba-bot": (v) => Engine.sanitizeBot(v, Engine.WEIGHT_CLASSES[Engine.WEIGHT_CLASSES.length - 1].kg),
    // the story (PF-2): each mission's steps and the rewards, with times; each game mission's tries, first prediction and goal
    "cr-record": (v) => (obj(v) ? { v: 1, missions: each(v.missions, 300, times, STORY_ID) || {}, rewards: each(v.rewards, 300, when, STORY_ID) || {}, last: typeof v.last === "string" && STORY_ID.test(v.last) ? v.last : null } : null),
    "cr-missions": (v) => each(v, 300, (x) => (obj(x) ? { tries: int(x.tries, 0, 9999), firstRight: x.firstRight == null ? null : !!x.firstRight, goal: !!x.goal } : null), STORY_ID),
    "cr-tier": (v) => (["cadet", "recruit", "operative"].includes(v) ? v : null),
    // solo Speed Run bests (S-02): per set, per "level-length": the time and each right answer's split, in ms
    "cr-sprint": (v) => each(v, 20, (x) => each(x, 12, (e, k) => {
      const m = /^(cadet|recruit|operative)-(5|10)$/.exec(k); if (!m || !obj(e)) return null;
      const n = +m[2], time = Math.round(Number(e.time)), sp = Array.isArray(e.splits) ? e.splits.map((s) => Math.round(Number(s))) : [];
      if (!Number.isFinite(time) || time <= 0 || time > 36e5 || sp.length !== n || sp.some((s, i) => !Number.isFinite(s) || s <= 0 || s > time || (i > 0 && s < sp[i - 1]))) return null;
      return { time, splits: sp, at: when(e.at) };
    })),
  };
  // a student signed in on two devices at once: their story progress (and Speed Run bests) merge (the earliest time for each step, a goal met
  // on either) instead of the last save replacing the other
  const earliest = (a, b) => (a && b ? Math.min(a, b) : a || b);
  const MERGE = {
    "cr-record": (old, v) => {
      const missions = { ...old.missions };
      for (const [mid, r] of Object.entries(v.missions)) { const o = missions[mid] || {}, m = {}; for (const s of STEP_TIMES) { const t = earliest(o[s], r[s]); if (t) m[s] = t; } missions[mid] = m; }
      const rewards = { ...old.rewards };
      for (const [rid, t] of Object.entries(v.rewards)) rewards[rid] = earliest(rewards[rid], t);
      return { v: 1, missions, rewards, last: v.last || old.last };
    },
    "cr-sprint": (old, v) => { // the faster best for each set and level-length
      const out = { ...old };
      for (const [set, entries] of Object.entries(v)) { const o = { ...(out[set] || {}) }; for (const [k, e] of Object.entries(entries)) if (!o[k] || e.time < o[k].time) o[k] = e; out[set] = o; }
      return out;
    },
    "cr-missions": (old, v) => {
      const out = { ...old };
      for (const [mid, x] of Object.entries(v)) { const o = out[mid]; out[mid] = o ? { tries: Math.max(o.tries, x.tries), firstRight: o.firstRight == null ? x.firstRight : o.firstRight, goal: o.goal || x.goal } : x; }
      return out;
    },
  };
  // what the teacher's dashboard shows: no racer inputs, no designs
  function summary(rows) {
    const p = {};
    for (const r of rows) {
      if (r.key === "learn-progress" || r.key === "fcl-stars" || r.key === "rba-challenges") p[r.key] = r.value;
      if (r.key === "cr-record") p[r.key] = { done: Object.keys(r.value.missions || {}).filter((mid) => r.value.missions[mid].done) };
      if (r.key === "race-bests") p[r.key] = Object.fromEntries(Object.entries(r.value).map(([k, b]) => [k, { time: b.time, setup: b.setup }]));
    }
    return p;
  }

  // ---------------- routes ----------------
  const api = express.Router();
  api.use(express.json({ limit: "100kb" }));
  api.use((req, res, next) => { // a page on another site can't make changes here: the browser sends its Origin, and it must be this site
    if (req.method === "GET") return next();
    const o = req.get("origin");
    if (o && o.replace(/^https?:\/\//, "") !== req.get("host")) return fail(res, 403, "Not allowed.");
    next();
  });
  api.get("/config", h(async (_req, res) => { await ready; res.json({ ok: true, accounts: !!db, google: db ? CLIENT_ID : null, dev: !!db && devLogin }); }));
  api.use(h(async (_req, res, next) => { await ready; if (!db) return fail(res, 503, "Accounts aren't set up on this server yet."); next(); }));

  api.get("/me", h(async (req, res) => {
    const u = await who(req);
    res.json({ ok: true, user: u && (u.kind === "teacher" ? { kind: "teacher", name: u.name, email: u.email } : { kind: "student", name: u.name, className: u.class_name }) });
  }));
  api.post("/logout", h(async (req, res) => {
    const t = tokenOf(req); if (t) await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [hash(t)]);
    res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  }));

  // teachers
  async function teacherSignIn(req, res, sub, email, name) {
    const tid = (await db.query(`INSERT INTO teachers (id, google_sub, email, name) VALUES ($1, $2, $3, $4) ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name RETURNING id`,
      [id(), sub, String(email || "").slice(0, 120), cleanName(name, 60) || "Teacher"])).rows[0].id;
    await startSession(req, res, "teacher", tid);
    res.json({ ok: true });
  }
  api.post("/google", h(async (req, res) => {
    if (!google) return fail(res, 503, "Google sign-in isn't set up on this server yet.");
    if (googleTries.over(req.ip)) return fail(res, 429, "Too many tries. Wait a few minutes.");
    googleTries.hit(req.ip);
    let p;
    try { p = (await google.verifyIdToken({ idToken: String((req.body || {}).credential || ""), audience: CLIENT_ID })).getPayload(); } catch { return fail(res, 401, "Google sign-in didn't work. Try again."); }
    if (!p || !p.sub) return fail(res, 401, "Google sign-in didn't work. Try again.");
    await teacherSignIn(req, res, "google:" + p.sub, p.email, p.name);
  }));
  api.post("/dev", h(async (req, res) => {
    if (!devLogin) return fail(res, 404, "Not here.");
    const name = cleanName((req.body || {}).name, 40) || "Test Teacher";
    await teacherSignIn(req, res, "dev:" + name.toLowerCase(), "", name);
  }));
  api.get("/classes", need("teacher"), h(async (req, res) => {
    const rows = (await db.query(`SELECT c.id, c.name, c.code, count(s.id)::int AS students FROM classes c LEFT JOIN students s ON s.class_id = c.id WHERE c.teacher_id = $1 GROUP BY c.id, c.name, c.code, c.created_at ORDER BY c.created_at`, [req.user.id])).rows;
    res.json({ ok: true, classes: rows });
  }));
  api.post("/classes", need("teacher"), h(async (req, res) => {
    const name = cleanName((req.body || {}).name, 40);
    if (!okName(name)) return fail(res, 400, "Give the class a name, like Period 3.");
    if ((await db.query(`SELECT count(*)::int AS n FROM classes WHERE teacher_id = $1`, [req.user.id])).rows[0].n >= MAX_CLASSES) return fail(res, 400, `You can have up to ${MAX_CLASSES} classes.`);
    for (let tries = 0; tries < 50; tries++) {
      let code = ""; for (let i = 0; i < 6; i++) code += CLASS_CHARS[crypto.randomInt(CLASS_CHARS.length)];
      if (isBlocked(code) || (await db.query(`SELECT 1 FROM classes WHERE code = $1`, [code])).rows.length) continue;
      const cid = id();
      await db.query(`INSERT INTO classes (id, teacher_id, name, code) VALUES ($1, $2, $3, $4)`, [cid, req.user.id, name, code]);
      return res.json({ ok: true, class: { id: cid, name, code, students: 0 } });
    }
    fail(res, 500, "Couldn't make a class code. Try again.");
  }));
  api.get("/classes/:id", need("teacher"), h(async (req, res) => {
    const c = await myClass(req, req.params.id); if (!c) return fail(res, 404, "That class isn't yours or doesn't exist.");
    const students = (await db.query(`SELECT id, name, pics, last_seen FROM students WHERE class_id = $1 ORDER BY name`, [c.id])).rows;
    const prog = (await db.query(`SELECT p.student_id, p.key, p.value FROM progress p JOIN students s ON s.id = p.student_id WHERE s.class_id = $1`, [c.id])).rows;
    res.json({ ok: true, class: c, students: students.map((s) => ({ id: s.id, name: s.name, pics: s.pics.split(",").map(Number), lastSeen: s.last_seen, progress: summary(prog.filter((p) => p.student_id === s.id)) })) });
  }));
  api.delete("/classes/:id", need("teacher"), h(async (req, res) => {
    const c = await myClass(req, req.params.id); if (!c) return fail(res, 404, "That class isn't yours or doesn't exist.");
    for (const s of (await db.query(`SELECT id FROM students WHERE class_id = $1`, [c.id])).rows) await db.query(`DELETE FROM sessions WHERE user_id = $1`, [s.id]);
    await db.query(`DELETE FROM classes WHERE id = $1`, [c.id]); // students and their progress go with it
    res.json({ ok: true });
  }));
  api.post("/classes/:id/students", need("teacher"), h(async (req, res) => {
    const c = await myClass(req, req.params.id); if (!c) return fail(res, 404, "That class isn't yours or doesn't exist.");
    const list = Array.isArray((req.body || {}).names) ? req.body.names.slice(0, MAX_STUDENTS + 1).map((n) => cleanName(n, 24)).filter(Boolean) : [];
    if (!list.length) return fail(res, 400, "Type at least one name, one per line.");
    const bad = list.filter((n) => !okName(n));
    if (bad.length) return fail(res, 400, `Please use a different name for: ${bad.join(", ")}.`);
    const have = (await db.query(`SELECT name FROM students WHERE class_id = $1`, [c.id])).rows.map((r) => r.name.toLowerCase());
    const seen = new Set(have), dup = [];
    for (const n of list) { if (seen.has(n.toLowerCase())) dup.push(n); seen.add(n.toLowerCase()); }
    if (dup.length) return fail(res, 400, `These names are already in the class (add a last initial to tell them apart): ${[...new Set(dup)].join(", ")}.`);
    if (have.length + list.length > MAX_STUDENTS) return fail(res, 400, `A class can have up to ${MAX_STUDENTS} students.`);
    const made = [];
    for (const name of list) { const s = { id: id(), name, pics: newPics() }; await db.query(`INSERT INTO students (id, class_id, name, pics) VALUES ($1, $2, $3, $4)`, [s.id, c.id, s.name, s.pics]); made.push({ id: s.id, name, pics: s.pics.split(",").map(Number) }); }
    res.json({ ok: true, students: made });
  }));
  api.post("/students/:id/reset", need("teacher"), h(async (req, res) => {
    const s = await myStudent(req, req.params.id); if (!s) return fail(res, 404, "That student isn't in your classes.");
    const pics = newPics();
    await db.query(`UPDATE students SET pics = $1 WHERE id = $2`, [pics, s.id]);
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [s.id]); // signed out everywhere
    picMisses.clear(s.id);
    res.json({ ok: true, pics: pics.split(",").map(Number) });
  }));
  api.delete("/students/:id", need("teacher"), h(async (req, res) => {
    const s = await myStudent(req, req.params.id); if (!s) return fail(res, 404, "That student isn't in your classes.");
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [s.id]);
    await db.query(`DELETE FROM students WHERE id = $1`, [s.id]); // their progress goes with them
    res.json({ ok: true });
  }));
  api.get("/classes/:id/export.csv", need("teacher"), h(async (req, res) => {
    const c = await myClass(req, req.params.id); if (!c) return fail(res, 404, "That class isn't yours or doesn't exist.");
    const students = (await db.query(`SELECT id, name, last_seen FROM students WHERE class_id = $1 ORDER BY name`, [c.id])).rows;
    const prog = (await db.query(`SELECT p.student_id, p.key, p.value FROM progress p JOIN students s ON s.id = p.student_id WHERE s.class_id = $1`, [c.id])).rows;
    const head = ["Student", "Lessons done", ...Catalog.LESSONS.map((l) => l.n), "Lab stars", "Brain Challenges done", "Story missions done", ...Race.TRACKS.map((t) => `${t.n} best lap`), ...Race.TRACKS.map((t) => `${t.n} medal`), "Last signed in"];
    const lines = [head.map(csvCell).join(",")];
    for (const s of students) {
      const p = summary(prog.filter((x) => x.student_id === s.id)), L = p["learn-progress"] || {}, laps = p["race-bests"] || {};
      const stars = Object.values(p["fcl-stars"] || {}).reduce((a, st) => a + st.filter(Boolean).length, 0);
      const ch = Challenges.LIST.filter((x) => (p["rba-challenges"] || {})[x.id] && p["rba-challenges"][x.id].done).length;
      lines.push([s.name, Catalog.LESSONS.filter((l) => L[l.id] && L[l.id].done).length, ...Catalog.LESSONS.map((l) => (L[l.id] && L[l.id].done ? `${L[l.id].score}/${L[l.id].total}` : "")),
        stars, ch, (p["cr-record"] || { done: [] }).done.length, ...Race.TRACKS.map((t) => (laps[t.id] ? laps[t.id].time.toFixed(2) : "")), ...Race.TRACKS.map((t) => (laps[t.id] && Race.medalOf(laps[t.id].time, t)) || ""),
        s.last_seen ? new Date(s.last_seen).toISOString().slice(0, 10) : ""].map(csvCell).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${c.name.replace(/[^A-Za-z0-9 -]/g, "").trim() || "class"} progress.csv"`);
    res.send("﻿" + lines.join("\r\n")); // the byte-order mark makes Excel read names like José correctly
  }));

  // students
  async function classByCode(code) { return (await db.query(`SELECT id, name FROM classes WHERE code = $1`, [String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)])).rows[0] || null; }
  api.post("/student/lookup", h(async (req, res) => { // a class code shows that class's names to pick from
    if (codeMisses.over(req.ip)) return fail(res, 429, "Too many wrong codes. Wait a few minutes, then check the code with your teacher.");
    const c = await classByCode((req.body || {}).code);
    if (!c) { codeMisses.hit(req.ip); return fail(res, 404, "No class with that code. Check it with your teacher."); }
    const students = (await db.query(`SELECT id, name FROM students WHERE class_id = $1 ORDER BY name`, [c.id])).rows;
    res.json({ ok: true, className: c.name, students });
  }));
  api.post("/student/login", h(async (req, res) => {
    const b = req.body || {}, c = await classByCode(b.code);
    if (!c) return fail(res, 404, "No class with that code. Check it with your teacher.");
    const s = (await db.query(`SELECT id, name, pics FROM students WHERE id = $1 AND class_id = $2`, [String(b.studentId || ""), c.id])).rows[0];
    if (!s) return fail(res, 404, "Pick your name from the list.");
    if (picMisses.over(s.id) || classMisses.over(c.id)) return fail(res, 429, "Too many wrong tries. Wait 5 minutes, or ask your teacher to check your pictures.");
    const given = Array.isArray(b.pics) ? b.pics.slice(0, Catalog.PIC_LEN).map((x) => int(x, 0, Catalog.PICS.length - 1)).join(",") : "";
    if (given.length !== s.pics.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(s.pics))) {
      picMisses.hit(s.id); classMisses.hit(c.id);
      return fail(res, 401, picMisses.over(s.id) ? "Too many wrong tries. Wait 5 minutes, or ask your teacher to check your pictures." : "Those aren't your pictures. Try again!");
    }
    picMisses.clear(s.id);
    await db.query(`UPDATE students SET last_seen = now() WHERE id = $1`, [s.id]);
    await startSession(req, res, "student", s.id);
    res.json({ ok: true, name: s.name, className: c.name });
  }));
  api.get("/progress", need("student"), h(async (req, res) => {
    await db.query(`UPDATE students SET last_seen = now() WHERE id = $1`, [req.user.id]);
    const rows = (await db.query(`SELECT key, value FROM progress WHERE student_id = $1`, [req.user.id])).rows;
    res.json({ ok: true, progress: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
  }));
  api.put("/progress/:key", need("student"), h(async (req, res) => {
    const check = KEYS[req.params.key]; if (!check) return fail(res, 400, "That isn't something we save.");
    if (saves.over(req.user.id)) return fail(res, 429, "Saving too fast. Try again in a minute.");
    saves.hit(req.user.id);
    let value = check((req.body || {}).value);
    if (value == null) return fail(res, 400, "That doesn't look right, so it wasn't saved.");
    if (MERGE[req.params.key]) {
      const row = (await db.query(`SELECT value FROM progress WHERE student_id = $1 AND key = $2`, [req.user.id, req.params.key])).rows[0], old = row && check(row.value);
      if (old) value = MERGE[req.params.key](old, value);
    }
    const json = JSON.stringify(value);
    if (json.length > MAX_VALUE) return fail(res, 400, "That's too big to save.");
    await db.query(`INSERT INTO progress (student_id, key, value) VALUES ($1, $2, $3::jsonb) ON CONFLICT (student_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [req.user.id, req.params.key, json]);
    res.json({ ok: true, value });
  }));

  app.use("/api/account", api);
  return { ready };
};
