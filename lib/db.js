// The accounts database. Postgres when DATABASE_URL is set (Render). Without it, on your own computer and in tests, an
// in-memory Postgres (pg-mem) runs the same SQL; its data is gone when the server stops. On Render without a database,
// accounts stay off and the rest of the site works as before.
const MIGRATIONS = [ // each runs once, in order: add new ones at the end, never edit old ones
  [
    `CREATE TABLE IF NOT EXISTS teachers (id TEXT PRIMARY KEY, google_sub TEXT UNIQUE NOT NULL, email TEXT, name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE, name TEXT NOT NULL, pics TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen TIMESTAMPTZ)`,
    `CREATE TABLE IF NOT EXISTS progress (student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE, key TEXT NOT NULL, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (student_id, key))`,
    `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT NOT NULL, expires BIGINT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS classes_teacher ON classes (teacher_id)`,
    `CREATE INDEX IF NOT EXISTS students_class ON students (class_id)`,
    `CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)`,
  ],
];

async function open() {
  let pool, kind;
  if (process.env.DATABASE_URL) {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined });
    kind = "Postgres";
  } else if (!process.env.RENDER) {
    let newDb;
    try { ({ newDb } = require("pg-mem")); } catch { return null; } // a production install without dev tools: accounts off
    const { Pool } = newDb().adapters.createPg(); pool = new Pool();
    kind = "in-memory (data is lost when the server stops)";
  } else return null;
  await pool.query(`CREATE TABLE IF NOT EXISTS migrations (n INTEGER PRIMARY KEY)`);
  const done = new Set((await pool.query(`SELECT n FROM migrations`)).rows.map((r) => r.n));
  for (let n = 0; n < MIGRATIONS.length; n++) {
    if (done.has(n)) continue;
    for (const sql of MIGRATIONS[n]) await pool.query(sql);
    await pool.query(`INSERT INTO migrations (n) VALUES ($1)`, [n]);
  }
  return { query: (sql, params) => pool.query(sql, params), kind };
}

module.exports = { open };
