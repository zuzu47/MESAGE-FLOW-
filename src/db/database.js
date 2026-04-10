const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'wapanel.db'));

// WAL mode for performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    phone       TEXT,
    status      TEXT DEFAULT 'disconnected',
    creds_data  TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS groups_cache (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    group_jid         TEXT NOT NULL,
    group_name        TEXT,
    participant_count INTEGER DEFAULT 0,
    is_admin          INTEGER DEFAULT 0,
    is_active         INTEGER DEFAULT 1,
    last_synced_at    TEXT DEFAULT (datetime('now')),
    created_at        TEXT DEFAULT (datetime('now')),
    UNIQUE(session_id, group_jid)
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    name          TEXT,
    status        TEXT DEFAULT 'pending',
    total_groups  INTEGER DEFAULT 0,
    sent_count    INTEGER DEFAULT 0,
    failed_count  INTEGER DEFAULT 0,
    scheduled_at  TEXT,
    started_at    TEXT,
    completed_at  TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS job_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      TEXT REFERENCES jobs(id) ON DELETE CASCADE,
    session_id  TEXT,
    group_jid   TEXT,
    group_name  TEXT,
    status      TEXT,
    error_msg   TEXT,
    sent_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_groups_session ON groups_cache(session_id);
  CREATE INDEX IF NOT EXISTS idx_job_logs_job   ON job_logs(job_id);
`);

console.log('✅ SQLite veritabanı hazır');
module.exports = db;
