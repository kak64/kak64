import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || 'db/yachad.sqlite';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  username    TEXT UNIQUE NOT NULL,
  email       TEXT UNIQUE,
  password    TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6c5ce7',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A shared space: home, roommates, couple, team, trip... user's choice.
CREATE TABLE IF NOT EXISTS spaces (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'home',
  emoji       TEXT NOT NULL DEFAULT '🏠',
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
  space_id  INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (space_id, user_id)
);

-- A board/list inside a space. Free-form: any title, emoji and color.
CREATE TABLE IF NOT EXISTS lists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id   INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '📝',
  color      TEXT NOT NULL DEFAULT '#6c5ce7',
  sort       INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id    INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  done_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id   INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,   -- added | done | reopened | removed | created_list | removed_list
  text       TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lists_space  ON lists(space_id);
CREATE INDEX IF NOT EXISTS idx_items_list   ON items(list_id);
CREATE INDEX IF NOT EXISTS idx_activity_sp  ON activity(space_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
`);

export function logActivity(spaceId, userId, action, text, emoji = '') {
  db.prepare(
    `INSERT INTO activity (space_id, user_id, action, text, emoji) VALUES (?, ?, ?, ?, ?)`
  ).run(spaceId, userId, action, text, emoji);
}
